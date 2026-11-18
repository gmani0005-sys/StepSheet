import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import {
  kpiValue,
  kpiTrend,
  kpiLineage,
  formatKpiValue,
  buildDataStory,
  enrichKpiSpec,
  suggestRatioKpi,
  inferGoodDirection,
  detectCurrencySymbol,
  periodLabel,
} from '../engine/kpiInsights';
import { localEngine } from '../api/localEngine';
import { DashboardModal } from '../components/dashboard/DashboardModal';
import { useWorkbenchStore } from '../store/workbenchStore';

const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });

// Sep: amount 1,500, discount 150 (10%) -- Oct: amount 2,200, discount 330 (15%)
const twoMonths = [
  { order_date: '2025-09-05', region: 'North', amount: 800, discount: 80 },
  { order_date: '2025-09-20', region: 'South', amount: 700, discount: 70 },
  { order_date: '2025-10-01', region: 'North', amount: 1000, discount: 150 },
  { order_date: '2025-10-15', region: 'South', amount: 1200, discount: 180 },
];

const totalAmount = {
  id: 'kpi_amt',
  title: 'Total Amount',
  column: 'amount',
  aggFunc: 'sum',
  dateCol: 'order_date',
  compare: 'previous_period' as const,
  goodDirection: 'up' as const,
};
const discountRate = {
  id: 'kpi_disc',
  title: 'Discount Rate',
  column: 'discount',
  aggFunc: 'sum',
  kind: 'ratio' as const,
  numeratorCol: 'discount',
  denominatorCol: 'amount',
  format: 'percent' as const,
  dateCol: 'order_date',
  compare: 'previous_period' as const,
  goodDirection: 'down' as const,
};

describe('KPI insights engine', () => {
  it('computes rate KPIs as one metric divided by another', () => {
    expect(kpiValue(twoMonths, discountRate)).toBeCloseTo(480 / 3700, 6);
    expect(formatKpiValue(kpiValue(twoMonths, discountRate), discountRate, fmt)).toBe('13.0%');
    expect(kpiValue([], discountRate)).toBeNull();
  });

  it('compares the latest month with the one before and colours by direction', () => {
    const t = kpiTrend(twoMonths, totalAmount)!;
    expect(t.latestLabel).toBe('Oct 2025');
    expect(t.previousLabel).toBe('Sep 2025');
    expect(t.current).toBe(2200);
    expect(t.previous).toBe(1500);
    expect(t.deltaText).toBe('+46.7%');
    expect(t.sentiment).toBe('good');
    expect(t.alert).toBe(false);

    // A rising discount rate is bad news, shown in points, and flagged.
    const d = kpiTrend(twoMonths, discountRate)!;
    expect(d.deltaText).toBe('+5.0 pts');
    expect(d.sentiment).toBe('bad');
    expect(d.alert).toBe(true);
  });

  it('shows no change without two months, or when comparison is off', () => {
    expect(kpiTrend(twoMonths.slice(2), totalAmount)).toBeNull();
    expect(kpiTrend(twoMonths, { ...totalAmount, compare: 'none' })).toBeNull();
  });

  it('marks a thin latest month as possibly incomplete', () => {
    const rows = [
      ...Array.from({ length: 10 }, (_, i) => ({ order_date: `2025-09-${String(i + 1).padStart(2, '0')}`, amount: 10 })),
      { order_date: '2025-10-01', amount: 10 },
    ];
    expect(kpiTrend(rows, totalAmount)!.partial).toBe(true);
  });

  it('explains how a number is calculated', () => {
    const lines = kpiLineage(twoMonths, enrichKpiSpec(discountRate, { rows: twoMonths }), fmt);
    expect(lines[0]).toMatch(/discount ÷ sum of amount/);
    expect(lines.join(' ')).toMatch(/Oct 2025 \(15\.0%, 2 rows\) with Sep 2025 \(10\.0%, 2 rows\)/);
  });

  it('writes a data story from computed facts: headline, problem and bright spot', () => {
    const rows: any[] = [];
    const add = (month: string, region: string, amount: number) => {
      for (let i = 1; i <= 3; i++) rows.push({ order_date: `2025-${month}-0${i}`, region, amount });
    };
    add('11', 'North', 100); // 300
    add('11', 'South', 100); // 300
    add('12', 'North', 150); // 450 (+50%)
    add('12', 'South', 60); // 180 (-40%)
    const story = buildDataStory(rows, [totalAmount], ['region'], fmt);
    expect(story[0].text).toBe('In Dec 2025, Total Amount was 630, up 5.0% on Nov 2025.');
    const attention = story.find((s) => s.id === 'attention')!;
    expect(attention.tone).toBe('bad');
    expect(attention.text).toBe('Needs attention: South (Region) fell 40.0%, from 300 to 180.');
    const bright = story.find((s) => s.id === 'bright-spot')!;
    expect(bright.text).toBe('Bright spot: North (Region) grew 50.0%, from 300 to 450.');
  });

  it('flags other KPIs that moved the wrong way', () => {
    const story = buildDataStory(twoMonths, [totalAmount, discountRate], [], fmt);
    expect(story.some((s) => s.tone === 'bad' && /Discount Rate worsened: 10\.0% → 15\.0%/.test(s.text))).toBe(true);
  });

  it('plans direction, currency, rates and definitions from the data', () => {
    expect(inferGoodDirection('churned_subs')).toBe('down');
    expect(inferGoodDirection('revenue')).toBe('up');
    expect(detectCurrencySymbol([{ amount: '₹1,200' }, { amount: '₹900' }], 'amount')).toBe('₹');
    expect(detectCurrencySymbol([{ revenue: 1200 }], 'revenue')).toBeUndefined();
    expect(suggestRatioKpi(['amount', 'discount'])).toMatchObject({ numeratorCol: 'discount', denominatorCol: 'amount', goodDirection: 'down' });
    expect(suggestRatioKpi(['runs', 'failed_runs'])).toMatchObject({ numeratorCol: 'failed_runs', denominatorCol: 'runs' });
    expect(periodLabel('2025-12')).toBe('Dec 2025');

    const e = enrichKpiSpec({ column: 'amount', aggFunc: 'sum' }, { rows: twoMonths, allColumns: ['order_date', 'amount'] });
    expect(e).toMatchObject({ dateCol: 'order_date', compare: 'previous_period', goodDirection: 'up', format: 'number', kind: 'aggregate' });
    expect(e.definition).toMatch(/Sum of amount/);
    // Fields already chosen are kept.
    expect(enrichKpiSpec({ column: 'amount', aggFunc: 'sum', goodDirection: 'down' as const }, { rows: twoMonths }).goodDirection).toBe('down');
  });
});

describe('Offline AI dashboard planner', () => {
  it('gives every KPI a monthly comparison and adds a rate KPI', async () => {
    const rows = twoMonths.map((r, i) => ({ ...r, order_id: `O${i}`, product: i % 2 ? 'Lamp' : 'Desk' }));
    const res = await localEngine.generateAiDashboard('kpi-insights-local', 'Build a complete dashboard', {
      rows,
      datasetName: 'orders',
      columns: [
        { name: 'order_id', data_type: 'text' },
        { name: 'order_date', data_type: 'date' },
        { name: 'region', data_type: 'text' },
        { name: 'product', data_type: 'text' },
        { name: 'amount', data_type: 'float' },
        { name: 'discount', data_type: 'float' },
      ],
    });
    const kpis = res.plan.kpis;
    expect(kpis.every((k: any) => k.compare === 'previous_period' && k.dateCol === 'order_date' && k.definition)).toBe(true);
    const rate = kpis.find((k: any) => k.kind === 'ratio');
    expect(rate).toMatchObject({ numeratorCol: 'discount', denominatorCol: 'amount', format: 'percent', goodDirection: 'down' });
  });
});

describe('Dashboard screen', () => {
  afterEach(() => window.localStorage.removeItem('stepsheet_dashboards_v3'));

  it('shows live change badges, a needs-attention flag, the story, definitions and the calculation', async () => {
    const ds = {
      id: 'orders-kpi-insights',
      name: 'Orders',
      original_filename: 'orders.csv',
      file_format: 'csv' as const,
      row_count: 4,
      column_count: 4,
      file_size_bytes: 1024,
      schema_metadata: [
        { name: 'order_date', data_type: 'text', physical_type: 'VARCHAR', nullable: false },
        { name: 'region', data_type: 'text', physical_type: 'VARCHAR', nullable: false },
        { name: 'amount', data_type: 'float', physical_type: 'FLOAT', nullable: false },
        { name: 'discount', data_type: 'float', physical_type: 'FLOAT', nullable: false },
      ],
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
    };
    window.localStorage.setItem(
      'stepsheet_dashboards_v3',
      JSON.stringify({
        [ds.id]: {
          dashboardTitle: 'Orders Dashboard',
          paletteId: 'v22',
          slicerColumns: ['region'],
          visuals: [{ id: 'vis_1', title: 'Amount by Region', type: 'column', categoryCol: 'region', valueCol: 'amount', aggFunc: 'sum' }],
          kpiCards: [
            { ...totalAmount, subtitle: '', accentColor: '#10B981', definition: 'Sum of amount across the rows in view. Higher is better.' },
            { ...discountRate, subtitle: '', accentColor: '#0284C7', definition: 'Sum of discount ÷ sum of amount. Lower is better.' },
          ],
        },
      })
    );
    useWorkbenchStore.setState({
      datasets: [ds as any],
      selectedDataset: ds as any,
      columns: ds.schema_metadata as any,
      rows: twoMonths,
    });

    render(<DashboardModal isOpen={true} onClose={() => {}} />);

    const amt = await waitFor(() => screen.getByTestId('kpi-trend-badge-kpi_amt'));
    expect(amt.textContent).toContain('+46.7%');
    expect(amt.textContent).toContain('vs Sep 2025');
    expect(amt.getAttribute('data-sentiment')).toBe('good');

    const disc = screen.getByTestId('kpi-trend-badge-kpi_disc');
    expect(disc.textContent).toContain('+5.0 pts');
    expect(disc.getAttribute('data-sentiment')).toBe('bad');
    expect(screen.getByTestId('kpi-alert-kpi_disc')).toBeDefined();
    expect(screen.getByText('13.0%')).toBeDefined(); // the rate itself, over all rows in view

    const story = screen.getByTestId('ai-data-story');
    expect(story.textContent).toContain('In Oct 2025, Total Amount was 2,200, up 46.7% on Sep 2025.');
    expect(story.textContent).toContain('Discount Rate worsened');

    expect(screen.getByTestId('kpi-definitions').textContent).toContain('Lower is better');

    fireEvent.click(screen.getByTestId('kpi-lineage-toggle-kpi_disc'));
    expect(screen.getByTestId('kpi-lineage-kpi_disc').textContent).toMatch(/Rows used: 4/);
  });
});
