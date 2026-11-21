/**
 * Multi-sheet business workbook scenario (orders, lines, product/customer/rep masters,
 * FX, targets, tiers). Locks in what the large consolidation test found: every sheet
 * of an .xlsx is imported, text filters ignore surrounding spaces in Excel cells,
 * joins say when a lookup table repeats a key or keys find no match, and XLOOKUP's
 * approximate match works on dates and on numbers stored as text.
 */
import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { localEngine } from '../api/localEngine';

const fileOf = (name: string, buf: ArrayBuffer | Uint8Array, type: string) => {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return { name, type, size: u8.byteLength, arrayBuffer: async () => u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength), text: async () => new TextDecoder().decode(u8) } as any;
};
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
let n = 0;
const st = (type: string, params: any) => ({ id: `t${n++}`, label: type, enabled: true, type, params }) as any;
const warningsOf = (r: any) => r.stepSummaries.flatMap((s: any) => s.warnings || []);

const workbook = async () => {
  const wb = new ExcelJS.Workbook();
  const orders = wb.addWorksheet('Orders');
  orders.addRow(['OrderID', 'OrderDate', 'CustomerID', 'Status', 'Amount']);
  orders.addRow(['SO-1', new Date(Date.UTC(2026, 0, 15)), 'C1', 'Completed', 100]);
  orders.addRow(['SO-2', new Date(Date.UTC(2026, 1, 3)), ' c2 ', 'completed ', 250]);
  orders.addRow(['SO-3', new Date(Date.UTC(2026, 2, 20)), 'C9', 'Cancelled', 75]);
  orders.addRow(['SO-4', '05-Mar-2026', 'C1', 'Completed', '1,250.00']);
  const products = wb.addWorksheet('Customers');
  products.addRow(['Customer Master']);
  products.addRow([]);
  products.addRow(['CustomerID', 'CustomerName', 'Segment']);
  products.addRow(['C1', 'Acme', 'Enterprise']);
  products.addRow(['C2', 'Globex', 'SMB']);
  products.addRow(['C2', 'Globex (old)', 'SMB']);
  const prices = wb.addWorksheet('PriceList');
  prices.addRow(['EffectiveFrom', 'Rate']);
  prices.addRow([new Date(Date.UTC(2026, 0, 1)), 1.1]);
  prices.addRow([new Date(Date.UTC(2026, 1, 1)), 1.2]);
  prices.addRow([new Date(Date.UTC(2026, 2, 1)), 1.3]);
  const tiers = wb.addWorksheet('Tiers');
  tiers.addRow(['MinAmount', 'Tier']);
  tiers.addRow([0, 'T0']);
  tiers.addRow([200, 'T1']);
  tiers.addRow([1000, 'T2']);
  wb.addWorksheet('Empty');
  return new Uint8Array(await wb.xlsx.writeBuffer());
};

describe('multi-sheet business workbook', () => {
  it('imports every sheet with data as its own dataset and keeps the first as the selection', async () => {
    const first = await localEngine.uploadDataset(fileOf('Sales.xlsx', await workbook(), XLSX));
    expect(first.name).toBe('Sales - Orders');
    const names = (await localEngine.listDatasets()).map((d) => d.name);
    for (const s of ['Orders', 'Customers', 'PriceList', 'Tiers']) expect(names).toContain(`Sales - ${s}`);
    expect(names).not.toContain('Sales - Empty');
    const cust = (await localEngine.listDatasets()).find((d) => d.name === 'Sales - Customers')!;
    // the title block above the Customers header is skipped
    expect(cust.schema_metadata.map((c) => c.name)).toEqual(['CustomerID', 'CustomerName', 'Segment']);
    expect(cust.row_count).toBe(3);
  });

  it('a one-sheet workbook keeps the file name', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Data');
    ws.addRow(['a', 'b']);
    ws.addRow([1, 2]);
    const ds = await localEngine.uploadDataset(fileOf('Single.xlsx', new Uint8Array(await wb.xlsx.writeBuffer()), XLSX));
    expect(ds.name).toBe('Single');
  });

  const sheets = async () => {
    const all = await localEngine.listDatasets();
    const get = (s: string) => all.find((d) => d.name === `Sales - ${s}`)!;
    return { orders: get('Orders'), customers: get('Customers'), prices: get('PriceList'), tiers: get('Tiers') };
  };

  it('filter equals ignores case and the spaces Excel cells keep ("completed ")', async () => {
    const { orders } = await sheets();
    const r = await localEngine.runPipeline(orders.id, [st('filter_rows', { column: 'Status', operator: 'eq', value: 'Completed' })], 1e6);
    expect(r.rows.map((x: any) => x.OrderID)).toEqual(['SO-1', 'SO-2', 'SO-4']);
    const ne = await localEngine.runPipeline(orders.id, [st('filter_rows', { column: 'Status', operator: 'neq', value: 'completed' })], 1e6);
    expect(ne.rows.map((x: any) => x.OrderID)).toEqual(['SO-3']);
  });

  it('a join to a table that repeats a key warns about the extra rows', async () => {
    const { orders, customers } = await sheets();
    const r = await localEngine.runPipeline(orders.id, [st('join', { right_dataset_id: customers.id, join_type: 'left', key_pairs: [{ left_col: 'CustomerID', right_col: 'CustomerID' }] })], 1e6);
    expect(r.rows.length).toBe(5); // SO-2 matched C2 twice
    const w = warningsOf(r).join(' | ');
    expect(w).toMatch(/1 extra rows: 1 key value\(s\) appear more than once in "Sales - Customers" \(e\.g\. C2\)/);
    expect(w).toMatch(/1 of 4 rows found no match in "Sales - Customers" \(e\.g\. C9\); their joined columns are blank\./);
  });

  it('an inner join says how many rows it dropped', async () => {
    const { orders, customers } = await sheets();
    const r = await localEngine.runPipeline(orders.id, [st('join', { right_dataset_id: customers.id, join_type: 'inner', dedupe_right_first: true, key_pairs: [{ left_col: 'CustomerID', right_col: 'CustomerID' }] })], 1e6);
    expect(r.rows.length).toBe(3);
    expect(warningsOf(r)).toEqual(['1 of 4 rows found no match in "Sales - Customers" (e.g. C9) and were dropped.']);
  });

  it('XLOOKUP takes the first match and reports keys it could not find', async () => {
    const { orders, customers } = await sheets();
    const r = await localEngine.runPipeline(orders.id, [st('xlookup', { lookup_dataset_id: customers.id, left_key_col: 'CustomerID', right_key_col: 'CustomerID', return_columns: ['CustomerName'] })], 1e6);
    expect(r.rows.map((x: any) => x.CustomerName)).toEqual(['Acme', 'Globex', null, 'Acme']);
    expect(warningsOf(r)).toEqual(['1 of 4 rows found no match for "CustomerID" in "Sales - Customers" (e.g. C9); their lookup columns are blank.']);
  });

  it('XLOOKUP approximate match (next smaller) works on dates in any format', async () => {
    const { orders, prices } = await sheets();
    const r = await localEngine.runPipeline(orders.id, [st('xlookup', { lookup_dataset_id: prices.id, left_key_col: 'OrderDate', right_key_col: 'EffectiveFrom', return_columns: ['Rate'], match_mode: -1 })], 1e6);
    expect(r.rows.map((x: any) => x.Rate)).toEqual([1.1, 1.2, 1.3, 1.3]);
    expect(warningsOf(r)).toEqual([]);
  });

  it('XLOOKUP approximate match reads numbers stored as text with separators', async () => {
    const { orders, tiers } = await sheets();
    const r = await localEngine.runPipeline(orders.id, [st('xlookup', { lookup_dataset_id: tiers.id, left_key_col: 'Amount', right_key_col: 'MinAmount', return_columns: ['Tier'], match_mode: -1 })], 1e6);
    expect(r.rows.map((x: any) => x.Tier)).toEqual(['T0', 'T1', 'T0', 'T2']);
    const up = await localEngine.runPipeline(orders.id, [st('xlookup', { lookup_dataset_id: tiers.id, left_key_col: 'Amount', right_key_col: 'MinAmount', return_columns: ['Tier'], match_mode: 1 })], 1e6);
    expect(up.rows.map((x: any) => x.Tier)).toEqual(['T1', 'T2', 'T1', null]); // nothing at or above 1,250, like Excel's #N/A
  });
});

import { measureScore, suggestRatioKpi, nameWords } from '../engine/kpiInsights';

describe('headline measures on a consolidated sales fact', () => {
  const cols = ['LineNo', 'Qty', 'UnitPriceLocal', 'DiscountPct', 'UnitCostUSD', 'RateToUSD', 'ReturnQty', 'QtyClean', 'ReturnQtyClean',
    'GrossLocal', 'NetLocal', 'NetUSD', 'COGSUSD', 'ReturnedUSD', 'NetAfterReturnsUSD', 'MarginUSD', 'Year', 'MonthNum'];
  const ranked = [...cols].sort((a, b) => measureScore(b) - measureScore(a));

  it('splits camelCase and currency suffixes into words', () => {
    expect(nameWords('NetAfterReturnsUSD')).toBe('net after returns usd');
    expect(nameWords('net_after_returns_usd')).toBe('net after returns usd');
    expect(nameWords('RateToUSD')).toBe('rate to usd');
  });

  it('leads with net revenue in USD, then margin; never sums rates, unit prices or local-currency amounts', () => {
    expect(ranked.slice(0, 3)).toEqual(['NetAfterReturnsUSD', 'NetUSD', 'MarginUSD']);
    for (const c of ['RateToUSD', 'DiscountPct', 'UnitCostUSD', 'UnitPriceLocal', 'GrossLocal', 'NetLocal'])
      expect(measureScore(c)).toBeLessThan(1);
  });

  it('pairs margin with net revenue as the rate KPI', () => {
    const r = suggestRatioKpi(ranked)!;
    expect(r.title).toBe('Profit Margin');
    expect(r.numeratorCol).toBe('MarginUSD');
    expect(r.denominatorCol).toBe('NetAfterReturnsUSD');
  });
});
