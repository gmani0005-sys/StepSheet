import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { ChatMarkdown } from '../components/ai/ChatMarkdown';
import { ChatWithDataModal } from '../components/ai/ChatWithDataModal';
import { useWorkbenchStore } from '../store/workbenchStore';
import { localEngine } from '../api/localEngine';
import { api } from '../api/client';

// 1,000 orders over 12 months; order_id is unique on every row.
const regions = ['North', 'South', 'East', 'West', 'Central'];
const products = ['Desk', 'Lamp', 'Chair', 'Monitor'];
const rows = Array.from({ length: 1000 }, (_, i) => ({
  order_id: `ORD-${20250000 + i}`,
  customer_id: `CUST-${1000 + (i % 60)}`,
  order_date: `2025-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`,
  region: regions[i % 5],
  product: products[i % 4],
  amount: 100 + (i % 17) * 10,
}));
const cols = [
  { name: 'order_id', data_type: 'text' },
  { name: 'customer_id', data_type: 'text' },
  { name: 'order_date', data_type: 'date' },
  { name: 'region', data_type: 'text' },
  { name: 'product', data_type: 'text' },
  { name: 'amount', data_type: 'float' },
];
const total = rows.reduce((s, r) => s + r.amount, 0);

describe('ChatMarkdown', () => {
  it('renders headings, bullets and bold instead of showing ### and **', () => {
    const { container } = render(<ChatMarkdown text={'### 📊 Findings for **orders**\n\nIntro *line*:\n\n- 💰 **Total**: **1.02M**\n- 🌍 Region `North`'} />);
    expect(container.textContent).not.toContain('###');
    expect(container.textContent).not.toContain('**');
    expect(screen.getByRole('heading').textContent).toBe('📊 Findings for orders');
    expect(container.querySelectorAll('li')).toHaveLength(2);
    expect(container.querySelector('strong')?.textContent).toBe('orders');
    expect(container.querySelector('em')?.textContent).toBe('line');
    expect(container.querySelector('code')?.textContent).toBe('North');
  });

  it('never turns text from the data into HTML', () => {
    const { container } = render(<ChatMarkdown text={'**<img src=x onerror=alert(1)>**'} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>');
  });
});

describe('In-browser executive summary', () => {
  it('uses every row, skips the order id "category" and guesses no currency', async () => {
    const res: any = await localEngine.executeChatQuery('local-ds-test', 'give me the executive summary of this data', {
      rows,
      columns: cols,
      datasetName: 'orders',
    });
    expect(res.plan.intent).toBe('executive_summary');
    expect(res.rows[0]['Top Finding']).toBe(`${(total / 1e3).toFixed(1)}K`);
    const text = res.explanation + JSON.stringify(res.rows);
    expect(text).not.toContain('ORD-');
    expect(text).not.toContain('Order Id');
    expect(text).not.toContain('$');
    expect(text).toContain('Region');
  });

  it('shows a currency symbol when the data has one', async () => {
    const rupees = rows.slice(0, 50).map((r) => ({ ...r, amount: `₹${r.amount}` }));
    const res: any = await localEngine.executeChatQuery('local-ds-test', 'executive summary', { rows: rupees, columns: cols, datasetName: 'orders' });
    expect(res.rows[0]['Top Finding'].startsWith('₹')).toBe(true);
  });
});

describe('Chat with Data window', () => {
  afterEach(() => vi.useRealTimers());

  const setup = () => {
    const schema = cols.map((c) => ({ ...c, physical_type: 'VARCHAR', nullable: true }));
    const ds: any = { id: 'local-ds-orders', name: 'orders', original_filename: 'orders.csv', file_format: 'csv', row_count: rows.length, column_count: cols.length, file_size_bytes: 1, schema_metadata: schema, created_at: '', updated_at: '' };
    useWorkbenchStore.setState({ datasets: [ds], selectedDataset: ds, columns: schema as any, rows, allRows: rows } as any);
    render(<ChatWithDataModal isOpen={true} onClose={() => {}} />);
  };

  it('shows the answer formatted, with no raw markdown', async () => {
    const spy = vi.spyOn(api, 'executeChatQuery').mockImplementation((id, p, m, ctx) => localEngine.executeChatQuery(id, p, ctx));
    setup();
    fireEvent.change(screen.getByPlaceholderText(/Ask a question about this data/), { target: { value: 'give me the executive summary of this data' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
    const answers = await waitFor(() => {
      const els = screen.getAllByTestId('chat-answer-text');
      expect(els.length).toBeGreaterThan(1);
      return els;
    });
    const answer = answers[answers.length - 1];
    expect(answer.textContent).toContain('Top Executive Findings');
    expect(answer.textContent).not.toContain('###');
    expect(answer.textContent).not.toContain('**');
    spy.mockRestore();
  });

  it('says it is still working when an answer is slow', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let finish: (v: any) => void = () => {};
    const spy = vi.spyOn(api, 'executeChatQuery').mockImplementation(() => new Promise((r) => (finish = r)));
    setup();
    fireEvent.change(screen.getByPlaceholderText(/Ask a question about this data/), { target: { value: 'total amount by region' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
    expect(screen.queryByTestId('chat-slow-notice')).toBeNull();
    await act(async () => {
      vi.advanceTimersByTime(8500);
    });
    expect(screen.getByTestId('chat-slow-notice').textContent).toMatch(/Still working/);
    await act(async () => finish({ explanation: 'done', columns: [], rows: [], row_count: 0, latency_ms: 1 }));
    await waitFor(() => expect(screen.queryByTestId('chat-slow-notice')).toBeNull());
    spy.mockRestore();
  });
});

describe('Chat request to the server', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('sends every row for a browser-only dataset, and a sample for a server dataset', async () => {
    const bodies: any[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: any) => {
      bodies.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ explanation: 'ok', rows: [], columns: [] }), { status: 200 });
    }));
    await api.executeChatQuery('local-ds-orders', 'total amount', undefined, { rows, columns: cols });
    await api.executeChatQuery('9f1c-server-dataset', 'total amount', undefined, { rows, columns: cols });
    expect(bodies[0].sample_rows).toHaveLength(1000);
    expect(bodies[1].sample_rows).toHaveLength(100);
  });

  it('answers in the browser when the server never replies', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal('fetch', vi.fn((_url: string, init: any) => new Promise((_res, rej) => {
      init.signal?.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    })));
    const pending = api.executeChatQuery('local-ds-orders', 'give me the executive summary of this data', undefined, { rows, columns: cols, datasetName: 'orders' });
    await vi.advanceTimersByTimeAsync(121_000);
    const res: any = await pending;
    expect(res.provider).toBe('localEngine');
    expect(res.explanation).toContain('Top Executive Findings');
  });
});
