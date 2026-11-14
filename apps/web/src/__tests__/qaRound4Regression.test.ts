/**
 * Round 4: AI-generated dashboards (R4-01 .. R4-16). The numbers a dashboard
 * shows, the export and the generator's sentences all come from
 * engine/dashboardData; these tests lock that down.
 */
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { localEngine } from '../api/localEngine';
import { dashMetric, dashMetricOrNull, dashItems, dashHistogram, dashSeriesKeys, dashGet, sameCategory, cellInPeriod } from '../engine/dashboardData';

const upload = async (name: string, text: string) =>
  localEngine.uploadDataset({ name, type: 'text/csv', size: text.length, text: async () => text, arrayBuffer: async () => new TextEncoder().encode(text).buffer } as any, name);

describe('R4-01 .. R4-07 dashboard numbers', () => {
  const ORIGINAL_TZ = process.env.TZ;
  afterEach(() => { process.env.TZ = ORIGINAL_TZ; });

  it('reads regional number formats like the rest of the app', () => {
    const rows = [{ a: '₹1,23,456.50' }, { a: '1.234,56 €' }, { a: '12,5' }, { a: '(100)' }, { a: '$2,000' }];
    expect(dashMetric(rows, 'a', 'sum')).toBe(123456.5 + 1234.56 + 12.5 - 100 + 2000);
  });
  it('"North", " north" and "NORTH" are one category, shown with the first spelling', () => {
    const rows = [{ r: 'North', v: 1 }, { r: ' north', v: 2 }, { r: 'NORTH ', v: 3 }, { r: 'South', v: 4 }];
    const { items } = dashItems(rows, { categoryCol: 'r', valueCol: 'v', aggFunc: 'sum', sortBy: 'value_desc' });
    expect(items.map((x) => [x.category, x.value])).toEqual([['North', 6], ['South', 4]]);
  });
  it('dates are bucketed by UTC month, whatever the browser time zone', () => {
    process.env.TZ = 'America/New_York';
    const rows = [{ d: '2024-05-01', v: 1 }, { d: '2024-05-31T23:30:00-05:00', v: 2 }];
    const { items } = dashItems(rows, { type: 'line_area', categoryCol: 'd', valueCol: 'v', aggFunc: 'sum' }, [{ name: 'd', data_type: 'date' }]);
    expect(items.map((x) => [x.category, x.value])).toEqual([['2024-05', 1], ['2024-06', 2]]);
  });
  it('shares are of the whole, not of the top N shown', () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({ c: `C${i}`, v: 10 }));
    const { items, hidden } = dashItems(rows, { categoryCol: 'c', valueCol: 'v', aggFunc: 'sum', sortBy: 'value_desc', topN: 5 });
    expect(items).toHaveLength(5);
    expect(hidden).toBe(15);
    expect(items[0].share).toBe(5);
  });
  it('count means records, even where the value column is blank', () => {
    expect(dashMetric([{ s: 'A', v: null }, { s: 'A', v: 5 }], 'v', 'count')).toBe(2);
  });
  it('an average of no values is "nothing", not 0', () => {
    expect(dashMetricOrNull([{ v: '' }], 'v', 'avg')).toBeNull();
  });
  it('MIN / MAX / histogram over 300K rows do not overflow the stack', () => {
    const rows = Array.from({ length: 300000 }, (_, i) => ({ v: i % 1000 }));
    expect(dashMetric(rows, 'v', 'min')).toBe(0);
    expect(dashMetric(rows, 'v', 'max')).toBe(999);
    expect(dashHistogram(rows, { valueCol: 'v', bins: 10 }).reduce((s, b) => s + b.count, 0)).toBe(300000);
  });
  it('matrix series are the largest ones, not the first seen', () => {
    const rows = [{ s: 'tiny', v: 1 }, ...Array.from({ length: 3 }, () => ({ s: 'big', v: 100 })), { s: 'mid', v: 50 }];
    expect(dashSeriesKeys(rows, 's', { valueCol: 'v', aggFunc: 'sum' }, 2).keys).toEqual(['big', 'mid']);
  });
  it('column lookup never falls back to a substring ("id" is not "order_id")', () => {
    expect(dashGet({ order_id: 7 }, 'id')).toBeUndefined();
    expect(dashGet({ 'Customer ID': 'C1' }, 'customer_id')).toBe('C1');
    expect(dashGet({ a: 1 }, 'constructor')).toBeUndefined();
  });
  it('slicers and cross-filters match like the categories', () => {
    expect(sameCategory(' north ', 'North')).toBe(true);
    expect(sameCategory('', '(Blank)')).toBe(true);
    expect(cellInPeriod('2024-03-31T23:30:00-05:00', '2024-04')).toBe(true);
    expect(cellInPeriod('2024-03-31', '2024-Q1')).toBe(true);
  });
  it('the dashboard screen uses the shared module (no private number/date/spread code left)', () => {
    const src = fs.readFileSync(path.join(__dirname, '../components/dashboard/DashboardModal.tsx'), 'utf8');
    expect(src).not.toMatch(/Number\(getRowVal\(/);
    expect(src).not.toMatch(/Number\(r\[/);
    expect(src).not.toMatch(/new Date\((raw|cell)\)/);
    expect(src).not.toMatch(/replace\(\/\[\$€£¥, %\]\/g/);
    expect(src).not.toMatch(/Math\.(min|max)\(\.\.\.nums\)/);
    expect(src).toMatch(/dashItems\(filteredRows, vis/);
  });
});

describe('R4-08 .. R4-12 the generator', () => {
  const sales = 'order_id,order_date,region,customer_id,category,status,quantity,revenue\n' +
    Array.from({ length: 60 }, (_, i) => `SO-${i},2024-${String((i % 3) + 1).padStart(2, '0')}-10,${['North', 'South', 'East', 'West'][i % 4]},C${i % 12},${['A', 'B', 'C'][i % 3]},${['Done', 'Open'][i % 2]},${i % 7 + 1},${100 + i}`).join('\n');
  it('never sums an ID column, never repeats a visual, titles are clean and true to the measure', async () => {
    const m = await upload('tiny_ids.csv', 'id,date,region,amount\n1,2024-05-01,North,100\n2,2024-05-02,South,50\n');
    const p = (await localEngine.generateAiDashboard(m.id, '')).plan;
    expect(p.kpis.some((k: any) => k.column === 'id' && ['sum', 'avg'].includes(k.aggFunc))).toBe(false);
    expect(p.visuals.some((v: any) => v.valueCol === 'id' && v.aggFunc !== 'count')).toBe(false);
    const sigs = p.visuals.map((v: any) => [v.categoryCol, v.aggFunc === 'count' ? '*' : v.valueCol, v.aggFunc, v.seriesCol || ''].join('|'));
    expect(new Set(sigs).size).toBe(sigs.length);
    for (const v of p.visuals) {
      expect(v.title).not.toMatch(/\b(\w+) \1\b|\b(\w+) & \2\b/i);
      expect(v.title).not.toMatch(/\bRevenue\b/); // the measure here is amount
    }
  });
  it('"Top N" only when there are more than N values; "top 5 customers" ranks customers', async () => {
    const m = await upload('sales_small.csv', sales);
    const p = (await localEngine.generateAiDashboard(m.id, 'dashboard of top 5 customers by revenue')).plan;
    const lead = p.visuals.find((v: any) => v.id === 'vis_leaderboard_bar');
    expect(lead.categoryCol).toBe('customer_id');
    expect(lead.topN).toBe(5);
    expect(lead.title).toBe('Top 5 Customer Id by Revenue');
    for (const v of p.visuals) {
      const n = v.title.match(/\bTop (\d+)\b/);
      if (n) expect(new Set((await localEngine.getRows(m.id, { limit: 1 })).all_rows!.map((r: any) => String(r[v.categoryCol]).toLowerCase())).size).toBeGreaterThan(+n[1]);
    }
  });
  it('every "leads with X%" sentence matches its chart', async () => {
    const m = await upload('sales_small2.csv', sales);
    const p = (await localEngine.generateAiDashboard(m.id, '')).plan;
    const rows = (await localEngine.getRows(m.id, { limit: 1 })).all_rows as any[];
    for (const v of p.visuals) {
      const mm = String(v.insight || '').match(/^(.+?) (?:leads|represents)\b.*?([\d.]+)% of/);
      if (!mm) continue;
      const items = dashItems(rows, { ...v, topN: 1e6 }, m.schema_metadata as any).items;
      const top = items.reduce((a, b) => (b.value > a.value ? b : a), items[0]);
      expect([mm[1], +mm[2]]).toEqual([top.category, top.share]);
    }
  });
});

describe('R4-13 .. R4-16 dashboard edits', () => {
  let id = '';
  let base: any;
  const edit = async (prompt: string, targetId?: string) => localEngine.patchAiDashboard(id, prompt, JSON.parse(JSON.stringify(base)), { targetId } as any);
  const setup = async () => {
    if (id) return;
    const m = await upload('t.csv', 'ticket_id,created_at,priority,channel,team,agent,status,resolution_hours,csat,refund_amount\n' +
      Array.from({ length: 40 }, (_, i) => `T-${i},2025-0${(i % 3) + 1}-0${(i % 9) + 1} 10:00,${['Low', 'High'][i % 2]},${['Email', 'Chat', 'Phone'][i % 3]},${['Tech', 'Billing'][i % 2]},A${i % 5},${['Open', 'Closed'][i % 2]},${i + 1},${(i % 5) + 1},${i % 4 ? 0 : 20}`).join('\n'));
    id = m.id;
    base = (await localEngine.generateAiDashboard(id, 'executive dashboard')).plan;
  };
  it('a request it cannot map is declined and changes nothing (no silent rebuild)', async () => {
    await setup();
    for (const q of ['make the dashboard pop', 'add a chart of revenue by colour', 'add a slicer for colour', 'remove the agent slicer']) {
      const r = await edit(q);
      expect(r.patch.declined, q).toBe(true);
      expect(r.updated_dashboard.visuals).toEqual(base.visuals);
      expect(r.updated_dashboard.slicer_columns).toEqual(base.slicer_columns);
    }
  });
  it('whole words only: "country" is not COUNT, "online" is not "line"', async () => {
    await setup();
    const a = await edit('change it to show refund amount by country', 'vis_geo_column');
    expect(a.patch.declined).toBe(true);
    const b = await edit('make it a line chart for online tickets', 'vis_geo_column');
    expect(b.updated_dashboard.visuals.find((v: any) => v.id === 'vis_geo_column').type).toBe('line_area');
  });
  it('removes the visual or slicer it names', async () => {
    await setup();
    const donut = base.visuals.find((v: any) => v.type === 'donut');
    if (donut) {
      const r = await edit('remove the donut chart');
      expect(base.visuals.length - r.updated_dashboard.visuals.length).toBe(1);
      expect(r.updated_dashboard.visuals.some((v: any) => v.id === donut.id)).toBe(false);
    }
    expect((await edit('remove all slicers')).updated_dashboard.slicer_columns).toEqual([]);
  });
  it('adds what it is asked for', async () => {
    await setup();
    const r = await edit('add a table of refund amount by team and channel');
    const v = r.updated_dashboard.visuals.at(-1);
    expect([v.type, v.valueCol, v.categoryCol, v.seriesCol]).toEqual(['table', 'refund_amount', 'team', 'channel']);
    const c = await edit('add a donut of tickets by priority');
    const d = c.updated_dashboard.visuals.at(-1);
    expect([d.type, d.aggFunc, d.categoryCol]).toEqual(['donut', 'count', 'priority']);
  });
});
