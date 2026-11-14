import { describe, it, expect, beforeAll, vi } from 'vitest';
import JSZip from 'jszip';
import { evaluateFormula, formulaResultToCell } from '../engine/formula';
import { parseSharedDate, toISODate } from '../engine/values';
import { csvCell, toCsv } from '../engine/csv';
import { buildXlsx } from '../engine/xlsxWriter';
import { localEngine } from '../api/localEngine';

// Regression coverage for the 21 defects found by the 14 Nov 2026 hard test
// campaign (D01-D21 in the campaign report). Each case is the smallest
// reproduction of the original failure, with the Excel/consultant-correct
// answer. The full campaign (254 formula cases, 52 transformation scenarios,
// 34 chat questions, export round trips) was run against an independent
// pandas/openpyxl oracle; these keep the fixes from regressing in CI.

const fx = (expr: string, row: Record<string, any> = {}) => formulaResultToCell(evaluateFormula(expr, row));

function ds(id: string, rows: Record<string, any>[]) {
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  return { meta: { id, name: id, schema_metadata: cols.map((name) => ({ name, data_type: 'text', physical_type: 'VARCHAR', nullable: true })) }, rows } as any;
}
async function run(rows: any[], steps: any[], others: any[] = []) {
  const full = steps.map((s, i) => ({ id: `s${i}`, label: s.type, enabled: true, ...s }));
  return localEngine.runPipeline('main', full, 1e9, [ds('main', rows), ...others]);
}

describe('D01/D16 number comparisons and sorts ignore non-numbers', () => {
  const rows = [{ id: 1, p: '700' }, { id: 2, p: 'n/a' }, { id: 3, p: '$1,234.50' }, { id: 4, p: null }, { id: 5, p: '90' }];
  it('a numeric threshold never matches text (n/a is not > 500)', async () => {
    const r = await run(rows, [{ type: 'filter_rows', params: { conditions: [{ column: 'p', operator: 'gt', value: '500' }] } }]);
    expect(r.rows.map((x: any) => x.id)).toEqual([1, 3]);
  });
  it('between never matches a blank or non-numeric cell', async () => {
    const r = await run(rows, [{ type: 'filter_rows', params: { conditions: [{ column: 'p', operator: 'between', value: '-10,1000' }] } }]);
    expect(r.rows.map((x: any) => x.id)).toEqual([1, 5]);
  });
  it('conditional columns use the same rule', async () => {
    const r = await run(rows, [{ type: 'conditional', params: { new_column: 'big', rules: [{ column: 'p', operator: 'gt', value: '500', then_value: 'Y' }], else_value: 'N' } }]);
    expect(r.rows.map((x: any) => x.big)).toEqual(['Y', 'N', 'Y', 'N', 'N']);
  });
  it('a text column of numbers sorts by value, stray text and blanks last', async () => {
    const r = await run(rows, [{ type: 'sort_rows', params: { conditions: [{ column: 'p', direction: 'desc' }] } }]);
    expect(r.rows.map((x: any) => x.id)).toEqual([3, 1, 5, 2, 4]);
    const asc = await run([{ v: '7.5' }, { v: '10' }, { v: '7.25' }], [{ type: 'sort_rows', params: { conditions: [{ column: 'v', direction: 'asc' }] } }]);
    expect(asc.rows.map((x: any) => x.v)).toEqual(['7.25', '7.5', '10']);
  });
  it('a date threshold compares real dates across formats', async () => {
    const r = await run([{ d: '2024-06-02' }, { d: '15-May-2024' }, { d: '03/07/2024' }], [{ type: 'filter_rows', params: { conditions: [{ column: 'd', operator: 'gt', value: '2024-06-01' }] } }]);
    expect(r.rows.map((x: any) => x.d)).toEqual(['2024-06-02', '03/07/2024']);
  });
});

describe('D02 date arithmetic in formulas', () => {
  const row = { start: '2024-03-05', end: '2024-03-12' };
  it.each([
    ['[end]-[start]', 7],
    ['[start]+30', '2024-04-04'],
    ['"2024-03-01"-1', '2024-02-29'],
    ['([end]-[start])/7', 1],
    ['"2024-03-05 18:00"-"2024-03-05 06:00"', 0.5],
    ['[end]+"x"', '#VALUE!'],
  ])('%s', (expr, expected) => expect(fx(expr, row)).toEqual(expected));
});

describe('D04 impossible dates are not dates', () => {
  it.each(['31/02/2024', '2024-02-30', '29/02/2023', '2024-13-01', '00/01/2024'])('%s', (v) => expect(parseSharedDate(v)).toBeNull());
  it('valid edge dates still parse', () => {
    expect(toISODate(parseSharedDate('29/02/2024')!)).toBe('2024-02-29');
    expect(toISODate(parseSharedDate('March 5, 2024')!)).toBe('2024-03-05');
    expect(toISODate(parseSharedDate('5 Mar 2024')!)).toBe('2024-03-05');
  });
  it('Change type to date leaves an impossible date blank', async () => {
    const r = await run([{ d: '31/02/2024' }, { d: '28/02/2024' }], [{ type: 'change_type', params: { column: 'd', target_type: 'date' } }]);
    expect(r.rows.map((x: any) => x.d)).toEqual([null, '2024-02-28']);
  });
});

describe('D05/D06/D07 consistent keys and date ordering', () => {
  it('Pivot matches labels case- and space-insensitively, like Group By', async () => {
    const rows = [{ r: 'North', s: 'Completed', q: 1 }, { r: 'NORTH', s: 'completed', q: 2 }, { r: 'South', s: 'Completed', q: 4 }];
    const r = await run(rows, [{ type: 'pivot', params: { index_columns: ['r'], pivot_column: 's', value_column: 'q', agg_func: 'sum' } }]);
    expect(r.rows).toEqual([{ r: 'North', Completed: 3 }, { r: 'South', Completed: 4 }]);
  });
  it('window partitions treat c113 and C113 as one customer', async () => {
    const rows = [{ c: 'C113', v: 10 }, { c: 'c113', v: 5 }];
    const r = await run(rows, [{ type: 'window_calc', params: { calc_type: 'running_total', value_column: 'v', partition_by: ['c'], output_column: 'run' } }]);
    expect(r.rows.map((x: any) => x.run)).toEqual([10, 15]);
  });
  it('window order_by on an unconverted mixed-format date column is date order', async () => {
    const rows = [{ d: '2024-06-09', v: 1 }, { d: '17/05/2024', v: 10 }, { d: '24-Feb-2024', v: 100 }];
    const r = await run(rows, [{ type: 'window_calc', params: { calc_type: 'running_total', value_column: 'v', order_by: 'd', output_column: 'run' } }]);
    expect(r.rows.map((x: any) => x.run)).toEqual([111, 110, 100]);
  });
});

describe('D08-D12, D15, D19 formula Excel parity', () => {
  const row = { email: 'john.smith@acme.co.uk', amount: 1250.5, region: 'North' };
  it.each([
    ['TEXT("2024-03-05","dddd")', 'Tuesday'],
    ['TEXT("2024-03-05","ddd, d mmm")', 'Tue, 5 Mar'],
    ['TEXT(5,"000")', '005'],
    ['TEXT(1234.5,"$#,##0.00")', '$1,234.50'],
    ['TEXT(-5,"0;(0)")', '(5)'],
    ['TEXT("2024-03-05 14:05:09","h:mm AM/PM")', '2:05 PM'],
    ['WEEKDAY("2024-03-10",2)', 7],
    ['WEEKDAY("2024-03-05",3)', 1],
    ['YEARFRAC("2024-01-01","2024-07-01")', 0.5],
    ['YEARFRAC("2024-01-01","2024-12-31",1)', 0.997267759563],
    ['TEXTAFTER([email],".",-1)', 'uk'],
    ['TEXTBEFORE([email],".",2)', 'john.smith@acme'],
    ['TEXTBEFORE("abc","x",1,0,0,"none")', 'none'],
    ['COUNTIF([amount],">1000")', 1],
    ['COUNTIF([region],"N*")', 1],
    ['SEARCH("sm*","Big Smith")', 5],
    ['FIND("x","abc")', '#VALUE!'],
    ['LEFT("abc",-1)', '#VALUE!'],
    ['HOUR("2:30 PM")', 14],
    ['YEAR("March 5, 2024")', 2024],
  ])('%s', (expr, expected) => {
    const got = fx(expr, row);
    if (typeof expected === 'number') expect(got).toBeCloseTo(expected, 9);
    else expect(got).toEqual(expected);
  });
  it('TODAY() is the local calendar date, not the UTC one', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-13T19:30:00Z'));
    const now = new Date();
    const local = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    expect(fx('TODAY()')).toBe(local);
    vi.useRealTimers();
  });
});

describe('D13/D17/D20 ranking and blanks', () => {
  it('Bottom N ignores blank and error cells', async () => {
    const rows = [{ v: 5 }, { v: null }, { v: '#VALUE!' }, { v: 1 }, { v: 3 }];
    const r = await run(rows, [{ type: 'top_bottom_n', params: { column: 'v', mode: 'bottom', n: 2 } }]);
    expect(r.rows.map((x: any) => x.v)).toEqual([1, 3]);
  });
  it('text steps keep blank cells blank, so they sort last', async () => {
    const rows = [{ r: ' b ' }, { r: null }, { r: 'a' }];
    const r = await run(rows, [{ type: 'text_transform', params: { column: 'r', operation: 'trim' } }, { type: 'sort_rows', params: { conditions: [{ column: 'r', direction: 'asc' }] } }]);
    expect(r.rows.map((x: any) => x.r)).toEqual(['a', 'b', null]);
  });
});

describe('D14 CSV formula injection / D18 Excel date cells', () => {
  it('csvCell neutralises formula-looking text but not numbers', () => {
    expect(csvCell('=HYPERLINK("http://x","c")')).toBe(`"'=HYPERLINK(""http://x"",""c"")"`);
    expect(csvCell('@SUM(1)')).toBe("'@SUM(1)");
    expect(csvCell('+cmd')).toBe("'+cmd");
    expect(csvCell('-0.5')).toBe('-0.5');
    expect(csvCell(-3)).toBe('-3');
    expect(toCsv(['a'], [{ a: 'x,y' }])).toBe('a\n"x,y"');
  });
  it('ISO dates are written as real Excel date cells', async () => {
    const zip = await JSZip.loadAsync(await buildXlsx(['d'], [{ d: '2024-03-05' }, { d: '2024-03-05 18:00:00' }]));
    const xml = await zip.file('xl/worksheets/sheet1.xml')!.async('string');
    expect(xml).toContain('<c r="A2" s="1"><v>45356</v></c>');
    expect(xml).toContain('<c r="A3" s="2"><v>45356.75</v></c>');
    expect(zip.file('xl/styles.xml')).not.toBeNull();
  });
});

describe('D03/D21 Chat with Data answers what it is asked', () => {
  const SRC = [
    { order_id: 'O1', order_date: '2024-01-10', region: 'North', status: 'Completed', quantity: 2, revenue: 100 },
    { order_id: 'O2', order_date: '2024-01-20', region: 'South', status: 'Cancelled', quantity: 5, revenue: 400 },
    { order_id: 'O3', order_date: '2024-02-05', region: 'South', status: 'Completed', quantity: 1, revenue: 300 },
    { order_id: 'O4', order_date: '2024-02-15', region: 'East', status: 'Completed', quantity: 4, revenue: 50 },
    { order_id: 'O5', order_date: '2024-03-01', region: 'North', status: 'Completed', quantity: 3, revenue: 250 },
  ];
  let ID = '';
  beforeAll(async () => {
    const text = JSON.stringify(SRC);
    const file = { name: 'qa-chat.json', type: 'application/json', text: async () => text, arrayBuffer: async () => new TextEncoder().encode(text).buffer } as unknown as File;
    ID = (await localEngine.uploadDataset(file, 'QA Chat Regression')).id;
  });
  const ask = (q: string) => localEngine.executeChatQuery(ID, q);
  const lastOf = (o: Record<string, unknown>) => { const v = Object.values(o); return v[v.length - 1]; };
  const value = (r: any) => lastOf(r.rows[0]);
  it('total for a named category value', async () => expect(value(await ask('what is the total revenue for completed orders?'))).toBe(700));
  it('total in a named region', async () => expect(value(await ask('what is the total quantity in the south region?'))).toBe(6));
  it('which group is highest', async () => expect((await ask('which region has the highest revenue?')).rows[0].region).toBe('South'));
  it('distinct count, plural column word', async () => {
    expect(value(await ask('how many distinct regions are there?'))).toBe(3);
  });
  it('median', async () => expect(value(await ask('what is the median revenue?'))).toBe(250));
  it('percentage of rows', async () => expect((await ask('what percentage of orders were cancelled?')).rows[0].Percentage).toBe(20));
  it('by month, in date order', async () => {
    const r = await ask('show revenue by month');
    expect(r.rows.map((x: any) => x.month)).toEqual(['2024-01', '2024-02', '2024-03']);
    expect(r.rows.map((x: any) => lastOf(x))).toEqual([500, 350, 250]);
  });
  it('average over a numeric threshold', async () => expect(value(await ask('what is the average revenue for orders over 200?'))).toBeCloseTo(316.67, 2));
  it('"at least" is a threshold, not a superlative', async () => {
    expect(value(await ask('how many orders have at least 3 units?'))).toBe(3);
  });
  it('bottom N is titled Bottom', async () => expect((await ask('bottom 2 regions by revenue')).explanation).toMatch(/^Bottom 2/));
});
