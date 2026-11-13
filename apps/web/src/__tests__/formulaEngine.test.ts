import { describe, it, expect } from 'vitest';
import { evaluateFormula, formulaResultToCell, isFxError } from '../engine/formula';
import {
  parseSharedNumber,
  looksNumericForImport,
  parseSharedDate,
  toISODate,
  datedif,
  properCase,
  trimCollapse,
} from '../engine/values';
import { localEngine } from '../api/localEngine';

function evalCell(expr: string, row: Record<string, any>) {
  return formulaResultToCell(evaluateFormula(expr, row));
}

describe('shared value parsers (SPEC.md "Numbers"/"Dates")', () => {
  it('parses formatted numbers the way Excel/SPEC.md expects', () => {
    expect(parseSharedNumber('1,234.50')).toBe(1234.5);
    expect(parseSharedNumber('$500')).toBe(500);
    expect(parseSharedNumber('₹1,200')).toBe(1200);
    expect(parseSharedNumber('(300)')).toBe(-300);
    expect(parseSharedNumber('15%')).toBe(0.15);
    expect(parseSharedNumber('')).toBeNull();
    expect(parseSharedNumber(null)).toBeNull();
    expect(parseSharedNumber('abc')).toBeNull();
  });

  it('keeps leading-zero codes, scientific-looking codes and long ids as text on import', () => {
    expect(looksNumericForImport('00501')).toBe(false);
    expect(looksNumericForImport('1E5')).toBe(false);
    expect(looksNumericForImport('4111111111111111')).toBe(false);
    expect(looksNumericForImport('1,234.50')).toBe(true);
    expect(looksNumericForImport('500')).toBe(true);
  });

  it('parses dd/mm/yyyy as day-first by default and swaps when invalid', () => {
    expect(toISODate(parseSharedDate('25/12/2024') as Date)).toBe('2024-12-25');
    // second slot > 12 => must be day, so first slot is read as month
    expect(toISODate(parseSharedDate('03/25/2024') as Date)).toBe('2024-03-25');
  });

  it('reads Excel serials only for date-typed values', () => {
    const d = parseSharedDate(45000, { asDateStep: true });
    expect(d && d.getUTCFullYear()).toBe(2023);
    expect(parseSharedDate(45000)).toBeNull();
  });

  it('computes Excel-style DATEDIF with complete units', () => {
    const start = parseSharedDate('2024-01-31') as Date;
    const end = parseSharedDate('2024-03-01') as Date;
    expect(datedif(start, end, 'm')).toBe(1);
    expect(datedif(start, end, 'md')).toBe(1);
  });

  it('PROPER capitalizes after non-letters and TRIM collapses runs of spaces', () => {
    expect(properCase("o'brien")).toBe("O'Brien");
    expect(properCase('mary-jane SMITH')).toBe('Mary-Jane Smith');
    expect(trimCollapse('  Acme   Corp  ')).toBe('Acme Corp');
  });
});

describe('Formula Builder (real tokenizer/parser/evaluator, no eval)', () => {
  const row = { amount: 1234.5, qty: 3, zero: 0, blank: null, status: 'completed' };

  it('supports a leading "=" and numeric/text comparisons', () => {
    expect(evalCell('=IF([amount]>1000,"High","Low")', row)).toBe('High');
    expect(evalCell('IF([status]="Completed","Y","N")', row)).toBe('Y');
  });

  it('accepts single-quoted string literals identically to double-quoted ones (regression: used to surface as #NAME?)', () => {
    expect(evalCell("IF([status]='completed','Y','N')", row)).toBe('Y');
    expect(evalCell("=IF([amount]>1000,'High','Low')", row)).toBe('High');
    expect(evalCell("'x'&[blank]&'y'", row)).toBe('xy');
  });

  it('returns Excel error VALUES instead of throwing or echoing the formula text', () => {
    expect(evalCell('[amount]/[zero]', row)).toBe('#DIV/0!');
    expect(evalCell('NOT_A_FUNCTION(1)', row)).toBe('#NAME?');
    expect(evalCell('IFERROR([amount]/[zero],0)', row)).toBe(0);
  });

  it('treats blank as 0 for arithmetic and "" for concatenation, & is always text', () => {
    expect(evalCell('[blank]+5', row)).toBe(5);
    expect(evalCell('"x"&[blank]&"y"', row)).toBe('xy');
    expect(evalCell('[qty]&[amount]', row)).toBe('31234.5');
  });

  it('resolves bare and case-insensitive column names', () => {
    expect(evalCell('AMOUNT*2', row)).toBe(2469);
  });

  it('never produces NaN/undefined - only null or a typed value/error', () => {
    const r = evaluateFormula('SQRT(-1)', row);
    expect(isFxError(r)).toBe(true);
  });
});

describe('Step engine semantics (SPEC.md)', () => {
  function ds(id: string, rows: Record<string, any>[]) {
    const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
    return {
      meta: {
        id,
        name: id,
        schema_metadata: cols.map((name) => ({ name, data_type: 'text', physical_type: 'VARCHAR', nullable: true })),
      },
      rows,
    } as any;
  }

  async function run(rows: any[], steps: any[], others: any[] = []) {
    const all = [ds('main', rows), ...others];
    const full = steps.map((s, i) => ({ id: `s${i}`, label: s.type, enabled: true, ...s }));
    return localEngine.runPipeline('main', full, 1e9, all);
  }

  it('math_transform never forces rounding and leaves blanks blank', async () => {
    const r = await run(
      [{ p: 0.0045, q: 3 }],
      [{ type: 'math_transform', params: { operation: 'arithmetic', column1: 'p', column2: 'q', math_operator: '*', decimals: 2, output_column: 'm' } }]
    );
    expect(r.rows[0].m).toBeCloseTo(0.0135, 10);
  });

  it('math_transform divide-by-zero gives blank, not 0', async () => {
    const r = await run(
      [{ a: 2, b: 0 }],
      [{ type: 'math_transform', params: { operation: 'arithmetic', column1: 'a', column2: 'b', math_operator: '/', output_column: 'm' } }]
    );
    expect(r.rows[0].m).toBeNull();
  });

  it('conditional rules are case-insensitive and numeric-aware, and all rules are honoured', async () => {
    const r = await run(
      [{ amt: 50 }, { amt: 300 }, { amt: 1000 }],
      [
        {
          type: 'conditional',
          params: {
            new_column: 'band',
            rules: [
              { column: 'amt', operator: 'lt', value: '100', result: 'Low' },
              { column: 'amt', operator: 'lt', value: '500', result: 'Mid' },
            ],
            else_value: 'High',
          },
        },
      ]
    );
    expect(r.rows.map((x: any) => x.band)).toEqual(['Low', 'Mid', 'High']);
  });

  it('xlookup matches case-insensitively, trims, and a blank matched cell is not if_not_found', async () => {
    const lookup = ds('lk', [{ id: 'ABC', tier: null }]);
    const r = await run(
      [{ id: ' abc ' }],
      [{ type: 'xlookup', params: { lookup_dataset_id: 'lk', left_key_col: 'id', right_key_col: 'id', return_columns: ['tier'], if_not_found: 'NA' } }],
      [lookup]
    );
    expect(r.rows[0].tier).toBeNull();
  });

  it('join never matches blank keys to each other', async () => {
    const right = ds('r', [{ k: null, v: 'x' }]);
    const r = await run(
      [{ k: null, a: 1 }],
      [{ type: 'join', params: { right_dataset_id: 'r', join_type: 'left', key_pairs: [{ left_col: 'k', right_col: 'k' }] } }],
      [right]
    );
    expect(r.rows.length).toBe(1);
    expect(r.rows[0].v).toBeNull();
  });

  it('remove_duplicates is case-insensitive but does not trim', async () => {
    const r = await run(
      [{ v: 'Apple' }, { v: 'apple' }, { v: 'apple ' }],
      [{ type: 'remove_duplicates', params: { columns: ['v'], keep: 'first' } }]
    );
    expect(r.rows.length).toBe(2); // "Apple"/"apple" collapse, "apple " (trailing space) stays distinct
  });

  it('window rank is a dense rank that shares ties and never reorders rows', async () => {
    const r = await run(
      [{ n: 'A', s: 90 }, { n: 'B', s: 100 }, { n: 'C', s: 100 }, { n: 'D', s: 80 }],
      [{ type: 'window_calc', params: { calc_type: 'rank', target_column: 's', output_column: 'rk', order_by: 's', order_direction: 'desc' } }]
    );
    expect(r.rows.map((x: any) => x.n)).toEqual(['A', 'B', 'C', 'D']); // order preserved
    expect(r.rows.map((x: any) => x.rk)).toEqual([2, 1, 1, 3]);
  });

  it('group_by count/distinct_count ignore blanks and min/max work on real values', async () => {
    const r = await run(
      [{ g: 'x', v: 10 }, { g: 'x', v: null }, { g: 'x', v: 20 }],
      [{ type: 'group_by', params: { group_by_columns: ['g'], aggregations: [{ column: 'v', agg_func: 'count', output_column: 'c' }, { column: 'v', agg_func: 'min', output_column: 'mn' }] } }]
    );
    expect(r.rows[0].c).toBe(2);
    expect(r.rows[0].mn).toBe(10);
  });

  it('impute mean ignores blanks (does not treat them as 0)', async () => {
    const r = await run(
      [{ v: 10 }, { v: null }, { v: 20 }],
      [{ type: 'impute_missing', params: { column: 'v', strategy: 'mean' } }]
    );
    expect(r.rows[1].v).toBe(15);
  });

  it('pivot has no silent column cap', async () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ reg: 'N', prod: `P${i}`, amt: 1 }));
    const r = await run(many, [{ type: 'pivot', params: { index_columns: ['reg'], pivot_column: 'prod', value_column: 'amt', agg_func: 'sum' } }]);
    expect(Object.keys(r.rows[0]).length - 1).toBe(30);
  });

  it('runPipeline throws clearly for an unknown dataset id instead of silently using another dataset', async () => {
    await expect(localEngine.runPipeline('does-not-exist', [], 100, [ds('main', [{ a: 1 }])])).rejects.toThrow();
  });
});
