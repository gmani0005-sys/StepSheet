/**
 * Defects found by the 100-dataset randomized validation run (varied domains, sizes,
 * file formats, column styles and dirty data, each checked against an independent
 * pandas reference). Keys and text compare ignoring case and surrounding spaces in
 * every step; ROUND matches Excel on large magnitudes.
 */
import { describe, it, expect } from 'vitest';
import { localEngine } from '../api/localEngine';
import { roundHalfAwayFromZero, roundUpAwayFromZero, roundDownTowardZero } from '../engine/values';
import { evaluateFormula } from '../engine/formula';

const run = async (rows: any[], steps: any[]) => {
  const csv = [Object.keys(rows[0]).join(','), ...rows.map((r) => Object.values(r).map((v) => (v === null ? '' : String(v))).join(','))].join('\n');
  // raw rows (keeps leading/trailing spaces exactly as an .xlsx cell would)
  const ds = await localEngine.uploadDataset({ name: 'r.json', type: 'application/json', size: 1, text: async () => JSON.stringify(rows), arrayBuffer: async () => new TextEncoder().encode(JSON.stringify(rows)).buffer } as any, 'r');
  void csv;
  return localEngine.runPipeline(ds.id, steps.map((s, i) => ({ id: `s${i}`, label: s.type, enabled: true, ...s })), 1e6);
};

describe('ROUND family matches Excel on large magnitudes', () => {
  it('rounds the 15-digit value, not the binary one', () => {
    expect(roundHalfAwayFromZero(32532909.499999996 / 100, 2)).toBe(325329.1); // 325329.09499999997 is 325329.095 to Excel
    expect(roundHalfAwayFromZero(2112.845, 2)).toBe(2112.85);
    expect(roundHalfAwayFromZero(-2112.845, 2)).toBe(-2112.85);
    expect(roundHalfAwayFromZero(1234.5, -2)).toBe(1200);
    expect(roundHalfAwayFromZero(1250, -2)).toBe(1300);
    expect(roundHalfAwayFromZero(0.1 + 0.2, 1)).toBe(0.3);
    expect(roundUpAwayFromZero(0.1 * 3, 1)).toBe(0.3); // 0.30000000000000004 is 0.3 to Excel
    expect(roundDownTowardZero(4.35 * 100, 0)).toBe(435); // 434.99999999999994
    expect(roundHalfAwayFromZero(1e20 + 0.5, 0)).toBe(1e20);
    expect(roundHalfAwayFromZero(858 / Number((176 / 90).toPrecision(15)), 1)).toBe(438.8); // stored 15-digit intermediate
    expect(roundHalfAwayFromZero(1.005, 2)).toBe(1.01); // Excel: 1.01
    expect(roundHalfAwayFromZero(2.4999999999995, 0)).toBe(2); // a real value just under .5 stays down
    expect(roundDownTowardZero(-4.35 * 100, 0)).toBe(-435);
    expect(roundUpAwayFromZero(2.0000001, 0)).toBe(3);
  });
  it('ROUND in a formula uses the same rule', () => {
    expect(evaluateFormula('ROUND([a]*(1-[b]),2)', { a: 357504.5, b: 0.09 })).toBe(325329.1);
  });
});

describe('every step ignores case and surrounding spaces in keys', () => {
  const rows = [
    { id: 1, k: 'CU1070', s: 'Active', v: 10 },
    { id: 2, k: ' cu1070 ', s: ' Active', v: 5 },
    { id: 3, k: 'CU2000', s: 'Pending ', v: 7 },
    { id: 4, k: 'cu2000', s: 'Closed', v: 1 },
  ];
  it('filter "in" and "not in"', async () => {
    const a = await run(rows, [{ type: 'filter_rows', params: { column: 's', operator: 'in', value: ['active', 'Pending'] } }]);
    expect(a.rows.map((r: any) => r.id)).toEqual([1, 2, 3]);
    const b = await run(rows, [{ type: 'filter_rows', params: { column: 's', operator: 'not_in', value: ['Active '] } }]);
    expect(b.rows.map((r: any) => r.id)).toEqual([3, 4]);
  });
  it('group by keeps one group per key under the first spelling, and distinct count agrees', async () => {
    const g = await run(rows, [{ type: 'group_by', params: { group_by_columns: ['k'], aggregations: [{ column: 'v', function: 'sum', alias: 'total' }, { column: 's', function: 'distinct_count', alias: 'statuses' }] } }]);
    expect(g.rows).toEqual([{ k: 'CU1070', total: 15, statuses: 1 }, { k: 'CU2000', total: 8, statuses: 2 }]);
  });
  it('remove duplicates', async () => {
    const d = await run(rows, [{ type: 'remove_duplicates', params: { columns: ['k'], keep: 'first' } }]);
    expect(d.rows.map((r: any) => r.id)).toEqual([1, 3]);
  });
});
