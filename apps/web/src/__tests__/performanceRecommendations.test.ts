/**
 * Recommendations from the 120-domain validation, applied in priority order:
 * faster calculated columns, shared window layouts, export reusing the last
 * run, per-step timing on the step cards and a column-level number format.
 * Every speed-up must give exactly the result of the plain path.
 */
import { describe, it, expect } from 'vitest';
import { localEngine } from '../api/localEngine';
import { compileFormula, evaluateFormula } from '../engine/formula';
import { parseSharedNumber } from '../engine/values';
import { formatStepDuration } from '../components/layout/RightPanel';

const jsonFile = (rows: any[]) => ({ name: 'p.json', type: 'application/json', size: 1, text: async () => JSON.stringify(rows), arrayBuffer: async () => new TextEncoder().encode(JSON.stringify(rows)).buffer }) as any;
const steps = (list: any[]) => list.map((s, i) => ({ id: `p${i}`, label: s.type, enabled: true, ...s }));
const upload = (rows: any[]) => localEngine.uploadDataset(jsonFile(rows), 'p');
const run = async (rows: any[], list: any[]) => {
  const ds = await upload(rows);
  return localEngine.runPipeline(ds.id, steps(list), 1e6);
};

describe('calculated columns: parsed once per step', () => {
  const rows = [
    { 'Unit Price': '1,200', Qty: 3, region: 'North', note: null },
    { 'Unit Price': '₹450', Qty: '2', region: 'south', note: 'x' },
    { 'Unit Price': '', Qty: 5, region: 'East', note: '' },
    { 'Unit Price': 'n/a', Qty: 1, region: 'West', note: 'y' },
  ];
  const formulas = [
    '[Unit Price] * [Qty]',
    'IF([qty] > 2, "big", "small")',
    'Unit Price * Qty',
    'UPPER([REGION]) & "-" & LEN([note])',
    'ROUND([Unit Price] / 7, 2)',
    '[missing] + 1',
    'IFERROR(1/0, "div")',
    '=SUM(1,2',
  ];
  it('the compiled evaluator matches evaluateFormula for every row', () => {
    for (const f of formulas) {
      const compiled = compileFormula(f, Object.keys(rows[0]));
      for (const r of rows) expect(compiled(r)).toEqual(evaluateFormula(f, r));
    }
  });
  it('custom column keeps column order and overwrites in place', async () => {
    const r = await run(rows, [
      { type: 'custom_column', params: { new_column: 'total', expression: '[Unit Price] * [Qty]' } },
      { type: 'custom_column', params: { new_column: 'Qty', expression: '[Qty] * 10' } },
    ]);
    expect(Object.keys(r.rows[0])).toEqual(['Unit Price', 'Qty', 'region', 'note', 'total']);
    expect(r.rows.map((x: any) => x.total)).toEqual([3600, 900, '#VALUE!', '#VALUE!']);
    expect(r.rows.map((x: any) => x.Qty)).toEqual([30, 20, 50, 10]);
  });
  it('rows of another shape (an appended dataset) still evaluate correctly', async () => {
    const other = await upload([{ Qty: 7, extra: 'z' }]);
    const r = await run([{ Qty: 2, region: 'N' }], [
      { type: 'append', params: { append_dataset_id: other.id } },
      { type: 'custom_column', params: { new_column: 'dbl', expression: '[Qty] * 2' } },
      { type: 'math_transform', params: { operation: 'formula', expression: '[dbl] + 1', output_column: 'dbl1' } },
    ]);
    expect(r.rows.map((x: any) => [x.dbl, x.dbl1])).toEqual([[4, 5], [14, 15]]);
  });
  it('a constant custom column fills every row', async () => {
    const r = await run(rows, [{ type: 'custom_column', params: { new_column: 'src', value: 'file-A' } }]);
    expect(r.rows.every((x: any) => x.src === 'file-A')).toBe(true);
  });
});

describe('window functions share partition and sort work', () => {
  const data = Array.from({ length: 60 }, (_, i) => ({
    cust: ['c1', 'C1 ', 'c2', 'c3'][i % 4],
    day: `2026-0${1 + (i % 9)}-${String(10 + (i % 17)).padStart(2, '0')}`,
    amt: i % 7 === 0 ? '' : String((i * 37) % 101),
  }));
  const win = (calc_type: string, output_column: string, extra: any = {}) => ({
    type: 'window_calc',
    params: { calc_type, value_column: 'amt', output_column, partition_by: ['cust'], order_by: 'day', ...extra },
  });
  it('back-to-back window steps give the same values as each step on its own', async () => {
    const chain = [win('running_total', 'rt'), win('lag', 'lg'), win('row_number', 'rn'), win('moving_avg', 'ma', { window_size: 3 }), win('rank', 'rk')];
    const together = await run(data, chain);
    for (const s of chain) {
      const alone = await run(data, [s]);
      const col = s.params.output_column;
      expect(together.rows.map((x: any) => x[col])).toEqual(alone.rows.map((x: any) => x[col]));
    }
  });
  it('a window step that overwrites the order column forces a fresh layout', async () => {
    const chain = [
      { type: 'window_calc', params: { calc_type: 'row_number', value_column: 'amt', output_column: 'day', partition_by: ['cust'], order_by: 'amt', order_direction: 'desc' } },
      win('row_number', 'rn'),
    ];
    const together = await run(data, chain);
    const first = await run(data, [chain[0]]);
    const ds = await upload(first.rows);
    const second = await localEngine.runPipeline(ds.id, steps([chain[1]]), 1e6);
    expect(together.rows.map((x: any) => x.rn)).toEqual(second.rows.map((x: any) => x.rn));
  });
  it('a sort between window steps is respected', async () => {
    const chain = [win('running_total', 'rt'), { type: 'sort', params: { column: 'amt', direction: 'desc' } }, win('lag', 'lg')];
    const together = await run(data, chain);
    const a = await run(data, chain.slice(0, 2));
    const ds = await upload(a.rows);
    const b = await localEngine.runPipeline(ds.id, steps([chain[2]]), 1e6);
    expect(together.rows.map((x: any) => x.lg)).toEqual(b.rows.map((x: any) => x.lg));
  });
});

describe('export reuses the last run', () => {
  it('an unchanged pipeline is not run again; a changed one is', async () => {
    const ds = await upload([{ a: 1 }, { a: 2 }]);
    const list = steps([{ type: 'custom_column', params: { new_column: 'b', expression: '[a] * 2' } }]);
    const p1 = await localEngine.previewPipeline(ds.id, list, { limit: 10 });
    expect(p1.steps[0].cached).toBeUndefined();
    const p2 = await localEngine.previewPipeline(ds.id, list, { limit: 10 });
    expect(p2.steps[0].cached).toBe(true);
    expect(p2.rows).toEqual(p1.rows);
    const blob = await localEngine.exportCsv(ds.id, list);
    const csv = await new Promise<string>((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result as string); fr.readAsText(blob); });
    expect(csv.replace('﻿', '').trim().split(/\r?\n/)).toEqual(['a,b', '1,2', '2,4']);
    const changed = steps([{ type: 'custom_column', params: { new_column: 'b', expression: '[a] * 3' } }]);
    const p3 = await localEngine.previewPipeline(ds.id, changed, { limit: 10 });
    expect(p3.steps[0].cached).toBeUndefined();
    expect(p3.rows.map((r: any) => r.b)).toEqual([3, 6]);
  });
  it('a new upload of the same id-less data is a different source', async () => {
    const list = steps([{ type: 'custom_column', params: { new_column: 'b', expression: '[a] + 1' } }]);
    const d1 = await upload([{ a: 1 }]);
    await localEngine.previewPipeline(d1.id, list, { limit: 10 });
    const d2 = await upload([{ a: 5 }]);
    const p = await localEngine.previewPipeline(d2.id, list, { limit: 10 });
    expect(p.rows[0].b).toBe(6);
  });
});

describe('per-step timing on the step cards', () => {
  it('every enabled step reports rows out and duration', async () => {
    const r = await run([{ a: 1 }, { a: 2 }, { a: 2 }], [
      { type: 'remove_duplicates', params: { columns: ['a'] } },
      { type: 'custom_column', params: { new_column: 'b', expression: '[a]' } },
    ]);
    for (const s of r.stepSummaries) expect(typeof s.duration_ms).toBe('number');
    expect(r.stepSummaries.map((s: any) => s.rows_out)).toEqual([2, 2]);
  });
  it('formats durations for the card', () => {
    expect(formatStepDuration(0.4)).toBe('<1 ms');
    expect(formatStepDuration(12.6)).toBe('13 ms');
    expect(formatStepDuration(1460)).toBe('1.5 s');
    expect(formatStepDuration(42000)).toBe('42 s');
    expect(formatStepDuration(125000)).toBe('2 min 5 s');
  });
});

describe('column-level number format', () => {
  it('auto keeps today\'s reading', () => {
    expect(parseSharedNumber('1.234')).toBe(1.234);
    expect(parseSharedNumber('1.234,56')).toBe(1234.56);
    expect(parseSharedNumber('99,5')).toBe(99.5);
  });
  it('European format makes one thousands dot unambiguous', () => {
    const eu = { decimal: 'comma' as const };
    expect(parseSharedNumber('1.234', eu)).toBe(1234);
    expect(parseSharedNumber('1.234,56', eu)).toBe(1234.56);
    expect(parseSharedNumber('12,5', eu)).toBe(12.5);
    expect(parseSharedNumber('-€ 1.234.567,8', eu)).toBe(-1234567.8);
    expect(parseSharedNumber('1 234,5', eu)).toBe(1234.5);
    expect(parseSharedNumber('1,5E+03', { ...eu, allowScientific: true })).toBe(1500);
    expect(parseSharedNumber('1,234.56', eu)).toBeNull(); // wrong convention is reported, not guessed
  });
  it('international format rejects a decimal comma', () => {
    const us = { decimal: 'dot' as const };
    expect(parseSharedNumber('1.234', us)).toBe(1.234);
    expect(parseSharedNumber('1,234.56', us)).toBe(1234.56);
    expect(parseSharedNumber('1,23,456.78', us)).toBe(123456.78);
    expect(parseSharedNumber('99,5', us)).toBeNull();
    expect(parseSharedNumber('1.234.567', us)).toBeNull();
  });
  it('Change Type and Clean Numeric honour the setting', async () => {
    const data = [{ q: '1.234' }, { q: '2.500,75' }, { q: '7' }];
    const ct = await run(data, [{ type: 'change_type', params: { column: 'q', target_type: 'float', number_format: 'comma' } }]);
    expect(ct.rows.map((x: any) => x.q)).toEqual([1234, 2500.75, 7]);
    const ci = await run(data, [{ type: 'change_type', params: { column: 'q', target_type: 'integer', number_format: 'comma' } }]);
    expect(ci.rows.map((x: any) => x.q)).toEqual([1234, null, 7]);
    const cn = await run(data, [{ type: 'math_transform', params: { column: 'q', operation: 'clean_numeric', number_format: 'comma' } }]);
    expect(cn.rows.map((x: any) => x.q)).toEqual([1234, 2500.75, 7]);
    const auto = await run(data, [{ type: 'change_type', params: { column: 'q', target_type: 'float' } }]);
    expect(auto.rows.map((x: any) => x.q)).toEqual([1.234, 2500.75, 7]);
  });
});
