import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { localEngine } from '../api/localEngine';
import { LocalAiSetupModal } from '../components/ai/LocalAiSetupModal';
import { ChatWithDataModal } from '../components/ai/ChatWithDataModal';
import { AiDashboardPromptBar } from '../components/dashboard/AiDashboardPromptBar';
import { getRowVal } from '../components/dashboard/DashboardModal';
import { useWorkbenchStore } from '../store/workbenchStore';

describe('AI Analytics Suite (Chat with Data, Native Julius Dashboard, Local AI)', () => {
  beforeEach(() => {
    useWorkbenchStore.setState({
      datasets: [
        {
          id: 'test-ai-1',
          name: 'Sales Data',
          original_filename: 'sales.csv',
          file_format: 'csv',
          row_count: 50,
          column_count: 2,
          schema_metadata: [
            { name: 'Region', data_type: 'text', physical_type: 'VARCHAR' },
            { name: 'Sales', data_type: 'float', physical_type: 'DOUBLE' },
          ],
        } as any,
      ],
      selectedDataset: {
        id: 'test-ai-1',
        name: 'Sales Data',
        original_filename: 'sales.csv',
        file_format: 'csv',
        row_count: 50,
        column_count: 2,
        schema_metadata: [
          { name: 'Region', data_type: 'text', physical_type: 'VARCHAR' },
          { name: 'Sales', data_type: 'float', physical_type: 'DOUBLE' },
        ],
      } as any,
    });
  });

  it('localEngine executes getLocalAiSystemCheck and returns hardware diagnostics', async () => {
    const sys = await localEngine.getLocalAiSystemCheck();
    expect(sys).toBeDefined();
    expect(sys.hardware).toBeDefined();
    expect(sys.hardware.total_ram_gb).toBeGreaterThan(0);
    expect(sys.hardware.cpu_cores).toBeGreaterThan(0);
    expect(sys.hardware.recommended_model).toMatch(/llama|qwen/);
  });

  it('localEngine executes getLocalAiModelsCatalog with tested models', async () => {
    const catalog = await localEngine.getLocalAiModelsCatalog();
    expect(catalog.length).toBeGreaterThanOrEqual(5);
    const tags = catalog.map((m: any) => m.tag);
    expect(tags).toContain('llama3.2:3b');
    expect(tags).toContain('qwen2.5:1.5b');
  });

  it('localEngine executes executeChatQuery and aggregates data locally', async () => {
    const res = await localEngine.executeChatQuery('default-dataset', 'What are sales by region?');
    expect(res).toBeDefined();
    expect(res.plan).toBeDefined();
    expect(res.explanation).toContain('Calculated total');
    expect(res.calculation_method).toBeDefined();
    expect(Array.isArray(res.rows)).toBe(true);
    expect(res.query_trace).toContain('SELECT ');
  });

  it('localEngine executes generateAiDashboard and produces complete dashboard plan', async () => {
    const res = await localEngine.generateAiDashboard('default-dataset', 'Build me an executive dashboard');
    expect(res).toBeDefined();
    expect(res.plan).toBeDefined();
    expect(res.plan.dashboard_title).toContain('Executive Dashboard');
    expect(res.plan.kpis.length).toBeGreaterThanOrEqual(2);
    expect(res.plan.visuals.length).toBeGreaterThanOrEqual(3);
    expect(res.plan.slicer_columns.length).toBeGreaterThanOrEqual(1);
  });

  it('localEngine executes patchAiDashboard to add a slicer without rebuilding visuals', async () => {
    const gen = await localEngine.generateAiDashboard('default-dataset');
    const initialVisualCount = gen.plan.visuals.length;

    const patchRes = await localEngine.patchAiDashboard(
      'default-dataset',
      'Add Region slicer',
      gen.plan
    );
    expect(patchRes).toBeDefined();
    expect(patchRes.patch.operation).toBe('add_slicer');
    expect(patchRes.updated_dashboard.visuals.length).toBe(initialVisualCount);
    expect(patchRes.updated_dashboard.slicer_columns).toContain('Region');
  });

  it('renders LocalAiSetupModal and displays hardware diagnostics and models', async () => {
    render(<LocalAiSetupModal isOpen={true} onClose={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText('Local AI Runtime & Hardware Diagnostics')).toBeDefined();
      expect(screen.getByText('System RAM')).toBeDefined();
      expect(screen.getByText('Disk Space')).toBeDefined();
      expect(screen.getByText('Hardware-Aware Tested Model Catalog')).toBeDefined();
    });
  });

  it('renders ChatWithDataModal and submits analytical query', async () => {
    render(<ChatWithDataModal isOpen={true} onClose={() => {}} />);

    expect(screen.getByText('Chat with Data')).toBeDefined();
    expect(screen.getByText('Suggested Analytical Questions')).toBeDefined();

    // Click suggested prompt
    const suggestedBtn = screen.getByText('Show total sales by region');
    fireEvent.click(suggestedBtn);

    await waitFor(() => {
      expect(screen.getByText(/Calculated Result Table/i)).toBeDefined();
    });
  });

  it('renders AiDashboardPromptBar and triggers dashboard generation', async () => {
    const onApply = vi.fn();
    const onPatch = vi.fn();

    render(
      <AiDashboardPromptBar
        datasetId="test-id"
        datasetName="Sales"
        currentDashboard={{
          dashboardTitle: 'Test Dashboard',
          visuals: [],
          kpiCards: [],
          slicerColumns: [],
          paletteId: 'classic',
        }}
        onApplyGeneratedDashboard={onApply}
        onApplyPatch={onPatch}
      />
    );

    expect(screen.getByText('Create Dashboard with AI')).toBeDefined();
    expect(screen.getByText('Native Julius-Style (DuckDB)')).toBeDefined();

    const generateBtn = screen.getByRole('button', { name: /Generate Dashboard/i });
    fireEvent.click(generateBtn);

    await waitFor(() => {
      expect(onApply).toHaveBeenCalled();
    });
  });

  it('getRowVal handles case-insensitive, space, and underscore lookups reliably', () => {
    const row = {
      'Region': 'North America',
      'Customer ID': 'CUST-009',
      'amount': 250.75,
      'Order_Date': '2025-05-15',
    };

    expect(getRowVal(row, 'region')).toBe('North America');
    expect(getRowVal(row, 'Region')).toBe('North America');
    expect(getRowVal(row, 'customer_id')).toBe('CUST-009');
    expect(getRowVal(row, 'Customer ID')).toBe('CUST-009');
    expect(getRowVal(row, 'Amount')).toBe(250.75);
    expect(getRowVal(row, 'order_date')).toBe('2025-05-15');
    expect(getRowVal(row, 'Order Date')).toBe('2025-05-15');
    expect(getRowVal(row, 'nonexistent')).toBeUndefined();
  });

  it('ChatWithDataModal intercepts dashboard generation intent and renders preview card', async () => {
    const onOpen = vi.fn();
    render(<ChatWithDataModal isOpen={true} onClose={() => {}} onOpenDashboard={onOpen} />);

    const input = screen.getByPlaceholderText(/Ask a question about this data/i);
    fireEvent.change(input, { target: { value: 'create an interactive dashboard using the dataset' } });

    const sendBtn = screen.getByRole('button', { name: /Ask/i });
    fireEvent.click(sendBtn);

    await waitFor(() => {
      expect(screen.getByText(/Interactive Glassmorphic Dashboard Generated/i)).toBeDefined();
      expect(screen.getByText(/Open Generated Dashboard/i)).toBeDefined();
    }, { timeout: 4000 });

    const openDashBtn = screen.getByText(/Open Generated Dashboard/i);
    fireEvent.click(openDashBtn);
    expect(onOpen).toHaveBeenCalled();
  });

  it('verifies exact user queries in localEngine', async () => {
    const res1 = await localEngine.executeChatQuery('local-sample-orders', 'what is the total number unique orders');
    console.log('TEST RESULT 1:', res1.explanation, res1.rows);

    const res2 = await localEngine.executeChatQuery('local-sample-orders', "total customer id's by region");
    console.log('TEST RESULT 2:', res2.explanation, res2.rows);

    const res3 = await localEngine.generateAiDashboard('local-sample-orders', 'create an interactive dashboard using this dataset');
    console.log('TEST RESULT 3:', res3.plan.dashboard_title, res3.plan.kpis, res3.plan.visuals);
  });

  it('answers "average order value by category" with AVG, not an order count (regression)', async () => {
    const datasets = await localEngine.listDatasets();
    const all = await localEngine.previewPipeline(datasets[0].id, [], { limit: 1000 });

    const byCategory: Record<string, number[]> = {};
    for (const r of all.rows) {
      const cat = String(r.category ?? '').trim();
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push(Number(r.amount));
    }
    const expectedAvg: Record<string, number> = {};
    for (const [cat, vals] of Object.entries(byCategory)) {
      expectedAvg[cat] = Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100;
    }

    const res = await localEngine.executeChatQuery(datasets[0].id, 'what is average order value by category');
    expect(res.plan.intent).toBe('aggregation');
    // The result must not have been misclassified as an order-count-per-category
    // query: its alias must reference an averaged amount, not a count, and its
    // SQL trace must use AVG(), not COUNT().
    expect(res.query_trace.toUpperCase()).toContain('AVG(');
    expect(res.query_trace.toUpperCase()).not.toContain('COUNT(');
    const valueKey = res.columns.find((c: string) => c !== 'category');
    for (const row of res.rows) {
      const cat = row.category;
      if (expectedAvg[cat] !== undefined) {
        expect(row[valueKey]).toBeCloseTo(expectedAvg[cat], 1);
      }
    }
  });

  it('answers "how many orders were cancelled" with a filtered count, not the total row count (regression)', async () => {
    const datasets = await localEngine.listDatasets();
    const all = await localEngine.previewPipeline(datasets[0].id, [], { limit: 1000 });
    const expectedCancelled = all.rows.filter(
      (r: any) => String(r.status ?? '').trim().toLowerCase() === 'cancelled'
    ).length;
    expect(expectedCancelled).toBeGreaterThan(0);
    expect(expectedCancelled).toBeLessThan(all.rows.length);

    const res = await localEngine.executeChatQuery(datasets[0].id, 'how many orders were cancelled?');
    expect(res.rows[0].Count).toBe(expectedCancelled);
    expect(res.query_trace.toUpperCase()).toContain('WHERE');
  });
});
