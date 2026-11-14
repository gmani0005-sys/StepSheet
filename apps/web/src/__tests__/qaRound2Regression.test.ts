/**
 * Regression tests for the Round 2 QA findings (R2-01 .. R2-17).
 * Each test names the defect it locks down.
 */
import { describe, it, expect } from 'vitest';
import { localEngine } from '../api/localEngine';
import { parseSharedNumber, parseSharedDate, toISODate, properCase, preciseSum, cleanFloat } from '../engine/values';
import { evaluateFormula } from '../engine/formula';

const ds = (id: string, rows: any[]) => ({
  meta: {
    id, name: id, original_filename: `${id}.csv`, file_format: 'csv', row_count: rows.length,
    column_count: rows[0] ? Object.keys(rows[0]).length : 0, file_size_bytes: 0, schema_metadata: [],
    created_at: '', updated_at: '',
  },
  rows,
});
async function run(rows: any[], steps: any[]) {
  const full = steps.map((s, i) => ({ id: `s${i}`, label: s.type, enabled: true, ...s }));
  return localEngine.runPipeline('main', full, 1e9, [ds('main', rows)] as any);
}

describe('R2-01 / R2-08 regional number formats', () => {
  it.each([
    ['1,23,456.78', 123456.78],
    ['₹ 2,00,000/-', 200000],
    ['Rs. 45,000', 45000],
    ['INR 1,500', 1500],
    ['EUR 500', 500],
    ['1.234,56', 1234.56],
    ['12,5', 12.5],
    ['1.234.567', 1234567],
    ['1234-', -1234],
    ['(2,500.00)', -2500],
    ['-$45', -45],
    ['$-45', -45],
    ['12.5%', 0.125],
  ])('%s reads as %s', (raw, expected) => {
    expect(parseSharedNumber(raw)).toBe(expected);
  });
  it('rejects malformed groupings instead of guessing', () => {
    expect(parseSharedNumber('1,2,3')).toBeNull();
    expect(parseSharedNumber('12,34,5')).toBeNull();
  });
  it('scientific notation is text by default and a number when converting', () => {
    expect(parseSharedNumber('1.5E+03')).toBeNull();
    expect(parseSharedNumber('1.5E+03', { allowScientific: true })).toBe(1500);
  });
  it('Group By sums Indian-format amounts (they used to count as 0)', async () => {
    const rows = [{ r: 'N', a: '₹1,23,456' }, { r: 'N', a: '₹1,000' }];
    const r = await run(rows, [{ type: 'group_by', params: { group_columns: ['r'], aggregations: [{ column: 'a', function: 'sum', alias: 't' }] } }]);
    expect(r.rows[0].t).toBe(124456);
  });
});

describe('R2-02 Change type never blanks data silently', () => {
  it('blanks unparseable values but warns with a count and examples; null tokens are not counted', async () => {
    const rows = [{ v: '12' }, { v: 'twelve' }, { v: 'n/a' }, { v: '1.2E+3' }, { v: '' }];
    const r = await run(rows, [{ type: 'change_type', params: { column: 'v', target_type: 'float' } }]);
    expect(r.rows.map((x: any) => x.v)).toEqual([12, null, null, 1200, null]);
    expect(r.stepSummaries[0].warnings).toHaveLength(1);
    expect(r.stepSummaries[0].warnings![0]).toMatch(/^1 value in "v" could not be read as a number and was set to blank \(e\.g\. "twelve"\)/);
  });
  it("on_error: 'keep' leaves unparseable values as typed", async () => {
    const r = await run([{ v: '12' }, { v: 'twelve' }], [{ type: 'change_type', params: { column: 'v', target_type: 'float', on_error: 'keep' } }]);
    expect(r.rows.map((x: any) => x.v)).toEqual([12, 'twelve']);
    expect(r.stepSummaries[0].warnings![0]).toContain('left unchanged');
  });
  it('a clean conversion has no warnings', async () => {
    const r = await run([{ v: '1' }, { v: '2' }], [{ type: 'change_type', params: { column: 'v', target_type: 'integer' } }]);
    expect(r.stepSummaries[0].warnings).toBeUndefined();
  });
});

describe('R2-06 / R2-07 dates', () => {
  it('a US column is read month-first for every row', async () => {
    const rows = [{ d: '03/13/2024' }, { d: '04/05/2024' }];
    const r = await run(rows, [{ type: 'change_type', params: { column: 'd', target_type: 'date' } }]);
    expect(r.rows.map((x: any) => x.d)).toEqual(['2024-03-13', '2024-04-05']);
  });
  it('a day-first column stays day-first', async () => {
    const rows = [{ d: '13/03/2024' }, { d: '04/05/2024' }];
    const r = await run(rows, [{ type: 'change_type', params: { column: 'd', target_type: 'date' } }]);
    expect(r.rows.map((x: any) => x.d)).toEqual(['2024-03-13', '2024-05-04']);
  });
  it.each([
    ['05/03/24', '2024-03-05'],
    ['31/12/99', '1999-12-31'],
    ['2024-3-5', '2024-03-05'],
    ['5th March 2024', '2024-03-05'],
    ['Tue, 05 Mar 2024', '2024-03-05'],
    ['05.03.2024', '2024-03-05'],
  ])('%s -> %s', (raw, iso) => {
    expect(toISODate(parseSharedDate(raw)!)).toBe(iso);
  });
  it('impossible dates stay impossible', () => {
    expect(parseSharedDate('31/02/2024')).toBeNull();
    expect(parseSharedDate('2024-13-01')).toBeNull();
  });
});

describe('R2-10 PROPER handles accented letters', () => {
  it.each([
    ['élise dupont', 'Élise Dupont'],
    ['ÑANDÚ TRADERS', 'Ñandú Traders'],
    ['zoë müller', 'Zoë Müller'],
  ])('%s', (raw, expected) => {
    expect(properCase(raw)).toBe(expected);
    expect(evaluateFormula(`=PROPER([n])`, { n: raw })).toBe(expected);
  });
});

describe('R2-11 impute on a column with no numbers', () => {
  it('does not invent zeros and says why', async () => {
    const r = await run([{ v: null }, { v: '' }], [{ type: 'impute_missing', params: { column: 'v', strategy: 'mean' } }]);
    expect(r.rows.map((x: any) => x.v)).toEqual([null, '']);
    expect(r.stepSummaries[0].warnings![0]).toMatch(/no numeric values/);
  });
});

describe('R2-13 float drift', () => {
  it('ten 0.1s sum to exactly 1 and 15 significant digits survive', () => {
    expect(preciseSum(Array(10).fill(0.1))).toBe(1);
    expect(cleanFloat(123456789.123456)).toBe(123456789.123456);
  });
  it('Group By total of many cents is exact', async () => {
    const rows = Array.from({ length: 1000 }, () => ({ g: 'a', v: 0.01 }));
    const r = await run(rows, [{ type: 'group_by', params: { group_columns: ['g'], aggregations: [{ column: 'v', function: 'sum', alias: 't' }] } }]);
    expect(r.rows[0].t).toBe(10);
  });
});

describe('R2-05 / R2-14 / R2-15 CSV structure', () => {
  const upload = async (text: string) => {
    // jsdom's File lacks text()/arrayBuffer(); same shim as chatNumericComparison.test.ts
    const file = {
      name: 't.csv',
      type: 'text/csv',
      size: text.length,
      text: async () => text,
      arrayBuffer: async () => new TextEncoder().encode(text).buffer,
    } as unknown as File;
    const meta = await localEngine.uploadDataset(file);
    const rows = await localEngine.getRows(meta.id, { limit: 100 });
    return { meta, rows };
  };
  it('duplicate headers become Amount and Amount_2 (no overwrite)', async () => {
    const { rows } = await upload('id,Amount,Amount\n1,10,20\n');
    expect(rows.rows[0]).toEqual({ id: 1, Amount: 10, Amount_2: 20 });
  });
  it('extra ragged fields are kept as column_N', async () => {
    const { rows } = await upload('a,b\n1,2,3\n4,5\n');
    expect(rows.rows[0]).toEqual({ a: 1, b: 2, column_3: 3 });
    expect(rows.rows[1]).toEqual({ a: 4, b: 5, column_3: null });
  });
  it('a header-only file keeps its columns', async () => {
    const { meta } = await upload('id,name,amount\n');
    expect(meta.schema_metadata.map((c: any) => c.name)).toEqual(['id', 'name', 'amount']);
    expect(meta.row_count).toBe(0);
  });
  it('a __proto__ header does not vanish or pollute objects', async () => {
    const { rows } = await upload('__proto__,x\nevil,1\n');
    expect(rows.rows[0]).toEqual({ _proto_: 'evil', x: 1 });
    expect(({} as any).evil).toBeUndefined();
  });
});

describe('R2-16 pivot speed', () => {
  it('pivots 50K rows x 150 columns in well under a few seconds', async () => {
    const rows = Array.from({ length: 50000 }, (_, i) => ({ g: `G${i % 500}`, p: `P${i % 150}`, v: i % 7 }));
    const t = performance.now();
    const r = await run(rows, [{ type: 'pivot', params: { index_columns: ['g'], pivot_column: 'p', value_column: 'v', agg_func: 'sum' } }]);
    expect(r.rows).toHaveLength(500);
    expect(performance.now() - t).toBeLessThan(4000);
  });
});

describe('R2-12 pipeline does not mutate its source rows', () => {
  it('every step type leaves the stored rows untouched', async () => {
    const src = [{ id: 1, v: '10', d: '03/13/2024', s: ' a ' }, { id: 2, v: null, d: '04/05/2024', s: 'b' }];
    const snapshot = JSON.stringify(src);
    await run(src, [
      { type: 'change_type', params: { column: 'v', target_type: 'float' } },
      { type: 'impute_missing', params: { column: 'v', strategy: 'mean' } },
      { type: 'change_type', params: { column: 'd', target_type: 'date' } },
      { type: 'text_transform', params: { column: 's', operation: 'trim' } },
      { type: 'window_calc', params: { calc_type: 'running_total', value_column: 'v', output_column: 'rt' } },
      { type: 'rename_column', params: { old_name: 'id', new_name: 'ID' } },
      { type: 'sort_rows', params: { column: 'v', direction: 'desc' } },
    ]);
    expect(JSON.stringify(src)).toBe(snapshot);
  });
});

describe('Empty results keep their columns', () => {
  const base = [
    { name: 'id', data_type: 'integer', physical_type: 'BIGINT', nullable: false },
    { name: 'status', data_type: 'text', physical_type: 'VARCHAR', nullable: false },
    { name: 'v', data_type: 'integer', physical_type: 'BIGINT', nullable: false },
  ];
  const dsWith = (rows: any[]) => ({ ...ds('main', rows), meta: { ...ds('main', rows).meta, schema_metadata: base } });
  it('a filter that matches nothing still returns the headers, including new and renamed columns', async () => {
    const steps = [
      { id: 'a', label: 'f', enabled: true, type: 'filter_rows', params: { conditions: [{ column: 'status', operator: 'eq', value: 'nope' }] } },
      { id: 'b', label: 'r', enabled: true, type: 'rename_column', params: { old_name: 'v', new_name: 'value' } },
      { id: 'c', label: 'c', enabled: true, type: 'custom_column', params: { new_column: 'double', expression: '[value]*2' } },
    ];
    const r = await localEngine.runPipeline('main', steps as any, 100, [dsWith([{ id: 1, status: 'ok', v: 2 }])] as any);
    expect(r.rows).toEqual([]);
    expect(r.columns.map((c: any) => c.name)).toEqual(['id', 'status', 'value', 'double']);
  });
});
