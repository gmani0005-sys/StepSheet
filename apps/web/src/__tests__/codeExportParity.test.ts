import { it } from 'vitest';
import path from 'path';
import fs from 'fs';
import { localEngine, __resetLocalStoreForTests } from '../api/localEngine';
/**
 * Code-export parity cases. Skipped unless CODEGEN_PARITY_OUT is set:
 *   CODEGEN_PARITY_OUT=/tmp/cg npx vitest run src/__tests__/codeExportParity.test.ts
 *   python3 ../../scripts/verify_code_export/check.py /tmp/cg
 * The Python side runs every generated SQL script in DuckDB and every Polars
 * script, and compares each with StepSheet's own result.
 */
const OUT = process.env.CODEGEN_PARITY_OUT;
const D = path.resolve(__dirname, '../../../../scripts/verify_code_export');
const file = (name: string) => { const t = fs.readFileSync(`${D}/${name}.csv`, 'utf8'); return { name: `${name}.csv`, type: 'text/csv', size: t.length, text: async () => t, arrayBuffer: async () => new TextEncoder().encode(t).buffer } as any; };
it.skipIf(!OUT)('code export parity cases', async () => {
  __resetLocalStoreForTests();
  const ds = await localEngine.uploadDataset(file('dataset'), 'dataset');
  const reps = await localEngine.uploadDataset(file('reps'), 'reps');
  const more = await localEngine.uploadDataset(file('more'), 'more');
  const W = (calc_type: string, extra: any = {}) => ({ calc_type, value_column: 'qty', partition_by: ['rep'], order_by: 'date', output_column: 'w', ...extra });
  const C: [string, string, any][] = [
    ['filter number gt', 'filter_rows', { conditions: [{ column: 'amount', operator: 'gt', value: '400' }] }],
    ['filter eq text', 'filter_rows', { conditions: [{ column: 'status', operator: 'eq', value: 'completed' }] }],
    ['filter OR', 'filter_rows', { conditions: [{ column: 'region', operator: 'eq', value: 'East' }, { column: 'qty', operator: 'gte', value: '4' }], logic: 'OR' }],
    ['filter in', 'filter_rows', { conditions: [{ column: 'region', operator: 'in', value: 'north, SOUTH' }] }],
    ['filter blank', 'filter_rows', { conditions: [{ column: 'region', operator: 'is_null' }] }],
    ['filter contains', 'filter_rows', { conditions: [{ column: 'rep', operator: 'contains', value: 'N' }] }],
    ['filter starts', 'filter_rows', { conditions: [{ column: 'code', operator: 'starts_with', value: 'b' }] }],
    ['filter date', 'filter_rows', { conditions: [{ column: 'date', operator: 'gt', value: '2026-02-28' }] }],
    ['filter neq', 'filter_rows', { conditions: [{ column: 'status', operator: 'neq', value: 'Completed' }] }],
    ['sort numeric desc', 'sort_rows', { column: 'amount', direction: 'desc' }],
    ['sort multi', 'sort_rows', { conditions: [{ column: 'rep', direction: 'asc' }, { column: 'qty', direction: 'desc' }] }],
    ['sort date', 'sort_rows', { column: 'date', direction: 'asc' }],
    ['dedupe first', 'remove_duplicates', { columns: ['rep'] }],
    ['dedupe last', 'remove_duplicates', { columns: ['rep'], keep: 'last' }],
    ['dedupe dups only', 'remove_duplicates', { columns: ['region'], keep_mode: 'duplicates_only' }],
    ['fill down', 'fill_down', { columns: ['region', 'qty'] }],
    ['fill up', 'fill_down', { columns: ['region'], direction: 'up' }],
    ['replace exact', 'replace_values', { column: 'status', search_value: 'Pending', replace_value: 'Open' }],
    ['replace contains', 'replace_values', { column: 'code', search_value: '-0', replace_value: '/', match_type: 'contains' }],
    ['replace blank', 'replace_values', { column: 'region', match_type: 'is_null', replace_value: 'Unknown' }],
    ['split', 'split_column', { column: 'code', delimiter: '-', new_column_names: ['letter', 'num'] }],
    ['type integer', 'change_type', { column: 'qty', target_type: 'integer' }],
    ['type float', 'change_type', { column: 'amount', target_type: 'float' }],
    ['type date', 'change_type', { column: 'date', target_type: 'date' }],
    ['type text', 'change_type', { column: 'qty', target_type: 'string' }],
    ['rename', 'rename_column', { old_name: 'rep', new_name: 'sales_rep' }],
    ['clean numeric', 'math_transform', { column: 'amount', operation: 'clean_numeric' }],
    ['round', 'math_transform', { column: 'amount', operation: 'round', decimals: 0, output_column: 'r' }],
    ['multiply', 'math_transform', { column: 'qty', operation: 'multiply', operand: 2, output_column: 'q2' }],
    ['arith cols', 'math_transform', { column: 'amount', column2: 'qty', operation: 'arithmetic', math_operator: '*', output_column: 'v' }],
    ['divide', 'math_transform', { column: 'amount', column2: 'qty', operation: 'arithmetic', math_operator: '/', output_column: 'per' }],
    ['abs', 'math_transform', { column: 'amount', operation: 'abs', output_column: 'a' }],
    ['math formula', 'math_transform', { operation: 'formula', expression: '[qty]*10', output_column: 'f' }],
    ['upper', 'text_transform', { column: 'rep', operation: 'upper' }],
    ['proper', 'text_transform', { column: 'region', operation: 'proper', output_column: 'p' }],
    ['trim', 'text_transform', { column: 'status', operation: 'trim' }],
    ['left', 'text_transform', { column: 'code', operation: 'left', length: 1, output_column: 'L' }],
    ['right', 'text_transform', { column: 'code', operation: 'right', length: 2, output_column: 'R' }],
    ['mid', 'text_transform', { column: 'code', operation: 'mid', start: 3, length: 2, output_column: 'M' }],
    ['length', 'text_transform', { column: 'rep', operation: 'length', output_column: 'n' }],
    ['concat', 'text_transform', { column: 'region', operation: 'concat', concat_columns: ['rep'], concat_separator: ' / ', output_column: 'c' }],
    ['year', 'date_transform', { column: 'date', operation: 'extract_part', date_part: 'year', output_column: 'y' }],
    ['quarter', 'date_transform', { column: 'date', operation: 'extract_part', date_part: 'quarter', output_column: 'q' }],
    ['week', 'date_transform', { column: 'date', operation: 'extract_part', date_part: 'week', output_column: 'wk' }],
    ['day name', 'date_transform', { column: 'date', operation: 'extract_part', date_part: 'day_name', output_column: 'dn' }],
    ['eomonth', 'date_transform', { column: 'date', operation: 'eomonth', amount: 0, output_column: 'e' }],
    ['add months', 'date_transform', { column: 'date', operation: 'add_time', amount: 1, unit: 'month', output_column: 'a' }],
    ['datedif days', 'date_transform', { column: 'date', operation: 'datedif', second_column: 'date2', unit: 'day', output_column: 'dd' }],
    ['datedif months', 'date_transform', { column: 'date', operation: 'datedif', second_column: 'date2', unit: 'month', output_column: 'mm' }],
    ['networkdays', 'date_transform', { column: 'date', operation: 'networkdays', second_column: 'date2', output_column: 'nw' }],
    ['fiscal year', 'date_transform', { column: 'date', operation: 'fiscal_year', fiscal_start_month: 4, output_column: 'fy' }],
    ['conditional', 'conditional', { new_column: 'band', rules: [{ column: 'amount', operator: 'gt', value: '1000', then_value: 'High' }, { column: 'amount', operator: 'gt', value: '100', then_value: 'Mid' }], else_value: 'Low' }],
    ['conditional numeric', 'conditional', { new_column: 'flag', rules: [{ column: 'status', operator: 'eq', value: 'completed', then_value: '1' }], else_value: '0' }],
    ['group by', 'group_by', { group_by_columns: ['region'], aggregations: [{ column: 'amount', function: 'sum', alias: 's' }, { column: 'id', function: 'count', alias: 'n' }, { column: 'amount', function: 'avg', alias: 'a' }, { column: 'qty', function: 'max', alias: 'mx' }, { column: 'rep', function: 'distinct_count', alias: 'dc' }] }],
    ['running total', 'window_calc', W('running_total')],
    ['row number', 'window_calc', W('row_number')],
    ['lag', 'window_calc', W('lag')],
    ['lead', 'window_calc', W('lead')],
    ['moving avg', 'window_calc', { calc_type: 'moving_avg', value_column: 'qty', window_size: 2, order_by: 'id', output_column: 'w' }],
    ['pct of total', 'window_calc', { calc_type: 'percent_of_total', value_column: 'qty', partition_by: ['rep'], output_column: 'w' }],
    ['rank desc', 'window_calc', { calc_type: 'rank', value_column: 'qty', order_direction: 'desc', output_column: 'w' }],
    ['pivot', 'pivot', { index_columns: ['rep'], pivot_column: 'status', value_column: 'qty', agg_func: 'sum' }],
    ['unpivot', 'unpivot', { id_columns: ['id'], value_columns: ['qty', 'amount'], name_column: 'metric', value_column: 'val' }],
    ['xlookup', 'xlookup', { right_dataset_id: reps.id, left_key: 'rep', right_key: 'rep', return_column: 'manager', output_column: 'mgr', if_not_found: 'N/A' }],
    ['vlookup', 'vlookup', { right_dataset_id: reps.id, left_key: 'rep', col_index_num: 3, output_column: 'tier', if_not_found: '' }],
    ['join inner', 'join', { right_dataset_id: reps.id, key_pairs: [{ left_col: 'rep', right_col: 'rep' }], join_type: 'inner' }],
    ['join left', 'join', { right_dataset_id: reps.id, key_pairs: [{ left_col: 'rep', right_col: 'rep' }], join_type: 'left' }],
    ['join right', 'join', { right_dataset_id: reps.id, key_pairs: [{ left_col: 'rep', right_col: 'rep' }], join_type: 'right' }],
    ['join full', 'join', { right_dataset_id: reps.id, key_pairs: [{ left_col: 'rep', right_col: 'rep' }], join_type: 'full' }],
    ['join anti', 'join', { right_dataset_id: reps.id, key_pairs: [{ left_col: 'rep', right_col: 'rep' }], join_type: 'left_anti' }],
    ['join semi', 'join', { right_dataset_id: reps.id, key_pairs: [{ left_col: 'rep', right_col: 'rep' }], join_type: 'left_semi' }],
    ['join dedupe', 'join', { right_dataset_id: reps.id, key_pairs: [{ left_col: 'rep', right_col: 'rep' }], join_type: 'left', dedupe_right_first: true }],
    ['append', 'append', { append_dataset_id: more.id }],
    ['custom formula', 'custom_column', { new_column: 'v', expression: 'IF(ISBLANK([amount]),0,[amount]*[qty])' }],
    ['custom text formula', 'custom_column', { new_column: 'lbl', expression: 'UPPER(LEFT([rep],2)) & "-" & [region]' }],
    ['custom round', 'custom_column', { new_column: 'r', expression: 'ROUND([qty]/3, 2)' }],
    ['custom static', 'custom_column', { new_column: 'src', value: 'file-A' }],
    ['remove cols', 'remove_column', { columns: ['code', 'date2'] }],
    ['keep cols', 'remove_column', { columns: ['id', 'rep'], keep_selected: true }],
    ['reorder', 'reorder_columns', { column_order: ['rep', 'id'] }],
    ['remove top', 'remove_rows', { mode: 'top_n', count: 2 }],
    ['keep bottom', 'remove_rows', { mode: 'keep_bottom_n', count: 3 }],
    ['standardize', 'standardize_values', { column: 'region', mappings: [{ from: 'south', to: 'South' }, { from: 'north', to: 'North' }] }],
    ['impute mean', 'impute_missing', { column: 'qty', strategy: 'mean' }],
    ['impute median', 'impute_missing', { column: 'qty', strategy: 'median' }],
    ['impute mode', 'impute_missing', { column: 'region', strategy: 'mode' }],
    ['outliers', 'flag_outliers', { column: 'amount', output_column: 'o' }],
    ['top n', 'top_bottom_n', { column: 'amount', mode: 'top', n: 3 }],
    ['bottom n', 'top_bottom_n', { column: 'amount', mode: 'bottom', n: 2 }],
  ];
  const out: any[] = [];
  for (const [name, type, params] of C) {
    const steps = [{ id: 's1', label: name, type, enabled: true, params }];
    const code = await localEngine.exportCode(ds.id, steps);
    const res = await localEngine.runPipeline(ds.id, steps, 1e6);
    out.push({ name, type, code, rows: res.rows });
  }
  // A multi-step pipeline, as a user would build it.
  const multi = [
    { id: 'm1', label: 'Clean amount', type: 'math_transform', enabled: true, params: { column: 'amount', operation: 'clean_numeric' } },
    { id: 'm2', label: 'Trim status', type: 'text_transform', enabled: true, params: { column: 'status', operation: 'trim' } },
    { id: 'm3', label: 'Completed only', type: 'filter_rows', enabled: true, params: { conditions: [{ column: 'status', operator: 'eq', value: 'completed' }] } },
    { id: 'm4', label: 'Value', type: 'custom_column', enabled: true, params: { new_column: 'value', expression: '[amount]*[qty]' } },
    { id: 'm5', label: 'Manager', type: 'xlookup', enabled: true, params: { right_dataset_id: reps.id, left_key: 'rep', right_key: 'rep', return_column: 'manager', output_column: 'mgr', if_not_found: 'N/A' } },
    { id: 'm6', label: 'Disabled', type: 'filter_rows', enabled: false, params: { conditions: [{ column: 'qty', operator: 'gt', value: '100' }] } },
    { id: 'm7', label: 'By manager', type: 'group_by', enabled: true, params: { group_by_columns: ['mgr'], aggregations: [{ column: 'value', function: 'sum', alias: 'total' }] } },
    { id: 'm8', label: 'Sort', type: 'sort_rows', enabled: true, params: { column: 'total', direction: 'desc' } },
  ];
  out.push({ name: 'multi-step pipeline', type: 'pipeline', code: await localEngine.exportCode(ds.id, multi), rows: (await localEngine.runPipeline(ds.id, multi, 1e6)).rows });
  fs.mkdirSync(OUT!, { recursive: true });
  for (const f of ['dataset', 'reps', 'more']) fs.copyFileSync(`${D}/${f}.csv`, `${OUT}/${f}.csv`);
  fs.writeFileSync(`${OUT}/codegen.json`, JSON.stringify(out, null, 1));
});
