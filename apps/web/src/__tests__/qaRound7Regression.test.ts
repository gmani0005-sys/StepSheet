/**
 * Round 7 (production-readiness hardening, continued) regression tests.
 *
 * Scope: chained pipeline steps -- combinations Rounds 1-6 tested
 * individually but not back to back in one pipeline, where a step's
 * output has to be correctly consumable by the next: group_by's new
 * aggregate column immediately filtered on, pivot's dynamically-named
 * output columns immediately sorted on, a join against a right dataset
 * with colliding rows immediately deduplicated, sort_rows changing row
 * order immediately before an order-dependent fill_down, and
 * split_column's auto-generated column names immediately renamed.
 *
 * Result: no defect found in this round -- every combination below
 * produced the hand-verified correct result on the first run. These are
 * locked in as regression tests to keep it that way.
 */
import { describe, it, expect } from 'vitest';
import { localEngine } from '../api/localEngine';

const ds = (id: string, rows: any[]) => ({
  meta: {
    id, name: id, original_filename: `${id}.csv`, file_format: 'csv', row_count: rows.length,
    column_count: rows[0] ? Object.keys(rows[0]).length : 0, file_size_bytes: 0,
    schema_metadata: rows[0] ? Object.keys(rows[0]).map((n) => ({ name: n, data_type: 'text', physical_type: 'VARCHAR', nullable: true })) : [],
    created_at: '', updated_at: '',
  },
  rows,
});
const steps = (xs: any[]) => xs.map((s, i) => ({ id: `s${i}`, label: s.type, enabled: true, ...s }));
const run = (rows: any[], st: any[], others: any[] = []) => localEngine.runPipeline('main', steps(st) as any, 1e9, [ds('main', rows), ...others] as any);

describe('R7-01 group_by then filter_rows on the newly-created aggregate column', () => {
  it('keeps only groups whose aggregate passes the filter, computed after grouping', async () => {
    const rows = [
      { region: 'North', amt: 10 }, { region: 'North', amt: 20 },
      { region: 'South', amt: 5 }, { region: 'East', amt: 100 },
    ];
    const r = await run(rows, [
      { type: 'group_by', params: { group_columns: ['region'], aggregations: [{ column: 'amt', function: 'sum', output_column: 'total' }] } },
      { type: 'filter_rows', params: { conditions: [{ column: 'total', operator: 'gt', value: 10 }] } },
    ]);
    expect(r.rows).toEqual([{ region: 'North', total: 30 }, { region: 'East', total: 100 }]);
  });
});

describe('R7-02 pivot then sort_rows on a pivoted (dynamically-named) column', () => {
  it('sorts by the pivoted category column, not a column that existed before the pivot', async () => {
    const rows = [
      { region: 'North', cat: 'A', amt: 10 }, { region: 'North', cat: 'B', amt: 5 },
      { region: 'South', cat: 'A', amt: 50 }, { region: 'South', cat: 'B', amt: 1 },
    ];
    const r = await run(rows, [
      { type: 'pivot', params: { index_columns: ['region'], pivot_column: 'cat', value_column: 'amt', agg_func: 'sum' } },
      { type: 'sort_rows', params: { column: 'A', direction: 'desc' } },
    ]);
    expect(r.rows).toEqual([{ region: 'South', A: 50, B: 1 }, { region: 'North', A: 10, B: 5 }]);
  });
});

describe('R7-03 join against colliding right rows then remove_duplicates', () => {
  it('a left join that fans out into duplicate rows collapses back to one after dedupe', async () => {
    const left = [{ id: 1, name: 'A' }, { id: 2, name: 'B' }];
    const right = ds('r1', [{ id: 1, extra: 'x' }, { id: 1, extra: 'x' }]);
    const r = await run(left, [
      { type: 'join', params: { right_dataset_id: 'r1', join_type: 'left', key_pairs: [{ left_col: 'id', right_col: 'id' }] } },
      { type: 'remove_duplicates', params: {} },
    ], [right]);
    expect(r.rows).toEqual([{ id: 1, name: 'A', extra: 'x' }, { id: 2, name: 'B', extra: null }]);
  });
});

describe('R7-04 sort_rows then fill_down follows the new order, not the original row order', () => {
  it('fills down using the row sequence after sorting', async () => {
    const rows = [{ grp: 'B', val: null }, { grp: 'A', val: 1 }, { grp: 'A', val: null }, { grp: 'B', val: 2 }];
    const r = await run(rows, [
      { type: 'sort_rows', params: { column: 'grp', direction: 'asc' } },
      { type: 'fill_down', params: { columns: ['val'] } },
    ]);
    expect(r.rows.map((x: any) => x.val)).toEqual([1, 1, 1, 2]);
  });
});

describe('R7-05 split_column then rename_column on the auto-generated split name', () => {
  it('the second step can address the column the first step just created', async () => {
    const rows = [{ full: 'John,Doe' }, { full: 'Jane,Smith' }];
    const r = await run(rows, [
      { type: 'split_column', params: { column: 'full', delimiter: ',' } },
      { type: 'rename_column', params: { old_name: 'full_1', new_name: 'first_name' } },
    ]);
    expect(r.rows).toEqual([
      { full: 'John,Doe', first_name: 'John', full_2: 'Doe' },
      { full: 'Jane,Smith', first_name: 'Jane', full_2: 'Smith' },
    ]);
  });
});
