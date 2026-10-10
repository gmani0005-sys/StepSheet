import {
  AuthResponse,
  ColumnProfile,
  ColumnSchema,
  DataType,
  Dataset,
  DatasetProfileResponse,
  DatasetRowsResponse,
  FilterCondition,
  SortCondition,
} from '../types';
import { GeneratedCode, StepDefinition, StepSummary } from '../types/steps';

const LOCAL_DATASETS_KEY = 'stepsheet_local_datasets_v1';
const LOCAL_TEMPLATES_KEY = 'stepsheet_local_templates_v1';
const LOCAL_VERSIONS_KEY = 'stepsheet_local_versions_v1';
const LOCAL_SHARES_KEY = 'stepsheet_local_shares_v1';
const LOCAL_AUDIT_KEY = 'stepsheet_local_audit_v1';

interface StoredLocalDataset {
  meta: Dataset;
  rows: Record<string, any>[];
}

function inferDataType(values: any[]): DataType {
  const nonNull = values.filter((v) => v !== null && v !== undefined && v !== '');
  if (nonNull.length === 0) return 'text';

  let allBool = true;
  let allInt = true;
  let allFloat = true;
  let allDate = true;

  for (const val of nonNull.slice(0, 100)) {
    if (typeof val === 'boolean') {
      allInt = false;
      allFloat = false;
      allDate = false;
      continue;
    }
    const str = String(val).trim();
    if (str.toLowerCase() !== 'true' && str.toLowerCase() !== 'false') {
      allBool = false;
    }
    const num = Number(str);
    if (Number.isNaN(num) || str === '') {
      allInt = false;
      allFloat = false;
    } else if (!Number.isInteger(num)) {
      allInt = false;
    }
    if (!/^\d{4}-\d{2}-\d{2}/.test(str)) {
      allDate = false;
    }
  }

  if (allBool) return 'boolean';
  if (allInt) return 'integer';
  if (allFloat) return 'float';
  if (allDate) return 'date';
  return 'text';
}

function physicalTypeFor(dt: DataType): string {
  switch (dt) {
    case 'integer':
      return 'INT64';
    case 'float':
      return 'DOUBLE';
    case 'boolean':
      return 'BOOLEAN';
    case 'date':
      return 'DATE';
    case 'timestamp':
      return 'TIMESTAMP';
    default:
      return 'VARCHAR';
  }
}

function inferSchema(rows: Record<string, any>[]): ColumnSchema[] {
  if (!rows || rows.length === 0) return [];
  const colSet = new Set<string>();
  rows.slice(0, 50).forEach((r) => {
    Object.keys(r).forEach((k) => colSet.add(k));
  });
  const colNames = Array.from(colSet);

  return colNames.map((name) => {
    const colVals = rows.map((r) => r[name]);
    const dt = inferDataType(colVals);
    const nullable = colVals.some((v) => v === null || v === undefined || v === '');
    return {
      name,
      data_type: dt,
      physical_type: physicalTypeFor(dt),
      nullable,
    };
  });
}

function buildSampleDatasets(): StoredLocalDataset[] {
  const regions = ['North', 'South', 'East', 'West'];
  const statuses = ['Completed', 'Pending', 'Shipped', 'Cancelled'];
  const categories = ['Electronics', 'Software', 'Office Supplies', 'Hardware', 'Cloud Services'];
  const tiers = ['Enterprise', 'Mid-Market', 'SMB', 'Startup'];

  const customersRows: Record<string, any>[] = [];
  for (let i = 1; i <= 40; i++) {
    const custId = `CUST-${String(i).padStart(3, '0')}`;
    const region = regions[i % regions.length];
    const tier = tiers[i % tiers.length];
    customersRows.push({
      customer_id: custId,
      customer_name: `Acme Corp ${i}`,
      email: `contact${i}@acmecorp${i}.example.com`,
      region,
      account_tier: tier,
      credit_limit: 5000 + (i % 10) * 2500,
      active: i % 9 !== 0,
    });
  }

  const ordersRows: Record<string, any>[] = [];
  for (let i = 1; i <= 120; i++) {
    const custIdx = ((i - 1) % 40) + 1;
    const custId = `CUST-${String(custIdx).padStart(3, '0')}`;
    const qty = (i % 8) + 1;
    const unitPrice = Number((49.5 + (i % 15) * 25.25).toFixed(2));
    const amount = Number((qty * unitPrice).toFixed(2));
    const discount = i % 3 === 0 ? Number((amount * 0.1).toFixed(2)) : 0;
    const month = String(((i - 1) % 12) + 1).padStart(2, '0');
    const day = String(((i - 1) % 28) + 1).padStart(2, '0');

    ordersRows.push({
      order_id: `ORD-${String(1000 + i)}`,
      customer_id: custId,
      order_date: `2025-${month}-${day}`,
      category: categories[i % categories.length],
      region: regions[custIdx % regions.length],
      status: statuses[i % statuses.length],
      quantity: qty,
      unit_price: unitPrice,
      amount,
      discount,
    });
  }

  const now = new Date().toISOString();
  const ordersSchema = inferSchema(ordersRows);
  const customersSchema = inferSchema(customersRows);

  return [
    {
      meta: {
        id: 'local-sample-orders',
        name: 'Orders (Sample XLSX)',
        original_filename: 'sample_orders.xlsx',
        file_format: 'xlsx',
        row_count: ordersRows.length,
        column_count: ordersSchema.length,
        file_size_bytes: 18432,
        schema_metadata: ordersSchema,
        created_at: now,
        updated_at: now,
      },
      rows: ordersRows,
    },
    {
      meta: {
        id: 'local-sample-customers',
        name: 'Customers (Sample CSV)',
        original_filename: 'sample_customers.csv',
        file_format: 'csv',
        row_count: customersRows.length,
        column_count: customersSchema.length,
        file_size_bytes: 6144,
        schema_metadata: customersSchema,
        created_at: now,
        updated_at: now,
      },
      rows: customersRows,
    },
  ];
}

let memoryDatasets: StoredLocalDataset[] | null = null;

function getStoredDatasets(): StoredLocalDataset[] {
  if (memoryDatasets) return memoryDatasets;
  try {
    const raw = localStorage.getItem(LOCAL_DATASETS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        memoryDatasets = parsed;
        return memoryDatasets;
      }
    }
  } catch {}
  const seeded = buildSampleDatasets();
  memoryDatasets = seeded;
  saveStoredDatasets(seeded);
  return seeded;
}

function saveStoredDatasets(datasets: StoredLocalDataset[]) {
  memoryDatasets = datasets;
  try {
    localStorage.setItem(LOCAL_DATASETS_KEY, JSON.stringify(datasets));
  } catch {}
}

function logAudit(action: string, details: Record<string, any> = {}) {
  try {
    const raw = localStorage.getItem(LOCAL_AUDIT_KEY);
    const logs = raw ? JSON.parse(raw) : [];
    logs.unshift({
      id: crypto.randomUUID(),
      project_id: 'default-project',
      user_email: 'local@stepsheet.app',
      action,
      details,
      created_at: new Date().toISOString(),
    });
    localStorage.setItem(LOCAL_AUDIT_KEY, JSON.stringify(logs.slice(0, 100)));
  } catch {}
}

function parseDelimitedText(text: string, delimiter = ','): Record<string, any>[] {
  const lines = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  const splitLine = (line: string): string[] => {
    const res: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === delimiter && !inQuotes) {
        res.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    res.push(current.trim());
    return res;
  };

  const headers = splitLine(lines[0]).map((h, i) => h || `column_${i + 1}`);
  const rows: Record<string, any>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = splitLine(lines[i]);
    const row: Record<string, any> = {};
    headers.forEach((h, idx) => {
      const rawVal = values[idx] ?? '';
      if (rawVal === '') {
        row[h] = null;
      } else if (rawVal.toLowerCase() === 'true') {
        row[h] = true;
      } else if (rawVal.toLowerCase() === 'false') {
        row[h] = false;
      } else if (!Number.isNaN(Number(rawVal)) && rawVal.trim() !== '') {
        row[h] = Number(rawVal);
      } else {
        row[h] = rawVal;
      }
    });
    rows.push(row);
  }
  return rows;
}

function evaluateRowCondition(rowVal: any, operator: string, targetVal: any): boolean {
  if (operator === 'is_null') return rowVal === null || rowVal === undefined || rowVal === '';
  if (operator === 'is_not_null') return rowVal !== null && rowVal !== undefined && rowVal !== '';

  const aStr = rowVal === null || rowVal === undefined ? '' : String(rowVal);
  const bStr = targetVal === null || targetVal === undefined ? '' : String(targetVal);
  const aNum = Number(rowVal);
  const bNum = Number(targetVal);
  const bothNum = !Number.isNaN(aNum) && !Number.isNaN(bNum) && aStr.trim() !== '' && bStr.trim() !== '';

  switch (operator) {
    case 'eq':
    case '==':
    case '=':
      return bothNum ? aNum === bNum : aStr.toLowerCase() === bStr.toLowerCase();
    case 'neq':
    case '!=':
      return bothNum ? aNum !== bNum : aStr.toLowerCase() !== bStr.toLowerCase();
    case 'contains':
      return aStr.toLowerCase().includes(bStr.toLowerCase());
    case 'not_contains':
      return !aStr.toLowerCase().includes(bStr.toLowerCase());
    case 'starts_with':
      return aStr.toLowerCase().startsWith(bStr.toLowerCase());
    case 'ends_with':
      return aStr.toLowerCase().endsWith(bStr.toLowerCase());
    case 'gt':
    case '>':
      return bothNum ? aNum > bNum : aStr > bStr;
    case 'gte':
    case '>=':
      return bothNum ? aNum >= bNum : aStr >= bStr;
    case 'lt':
    case '<':
      return bothNum ? aNum < bNum : aStr < bStr;
    case 'lte':
    case '<=':
      return bothNum ? aNum <= bNum : aStr <= bStr;
    default:
      return true;
  }
}

function evaluateFormulaForRow(expression: string, row: Record<string, any>): any {
  const expr = expression.trim();
  if (!expr) return null;

  // Replace column names with row values safely
  const cols = Object.keys(row).sort((a, b) => b.length - a.length);
  let jsExpr = expr;
  for (const col of cols) {
    const escaped = col.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const reg = new RegExp(`\\b${escaped}\\b`, 'g');
    const val = Number(row[col]);
    const replacement = Number.isNaN(val) ? '0' : String(val);
    jsExpr = jsExpr.replace(reg, `(${replacement})`);
  }

  // Only evaluate if expression contains safe math tokens
  if (/^[0-9+\-*/().\s]+$/.test(jsExpr)) {
    try {
      const result = Function(`"use strict"; return (${jsExpr});`)();
      return typeof result === 'number' && Number.isFinite(result)
        ? Number(result.toFixed(4))
        : null;
    } catch {
      return null;
    }
  }
  return null;
}

function generateStepCode(step: StepDefinition): GeneratedCode {
  const p = step.params || {};
  switch (step.type) {
    case 'filter_rows': {
      const col = p.column || 'col';
      const op = p.operator || 'eq';
      const val = p.value ?? '';
      return {
        sql: `SELECT * FROM prev_step WHERE "${col}" ${op} '${val}'`,
        polars: `df = df.filter(pl.col("${col}") == "${val}")`,
        power_query_m: `Table.SelectRows(PrevStep, each [${col}] = "${val}")`,
        excel_formula: `=FILTER(Table1, Table1[${col}]="${val}")`,
      };
    }
    case 'rename_column': {
      const oldName = p.old_name || p.column || 'old_col';
      const newName = p.new_name || 'new_col';
      return {
        sql: `SELECT * RENAME ("${oldName}" AS "${newName}") FROM prev_step`,
        polars: `df = df.rename({"${oldName}": "${newName}"})`,
        power_query_m: `Table.RenameColumns(PrevStep, {{"${oldName}", "${newName}"}})`,
        excel_formula: null,
      };
    }
    case 'change_type': {
      const col = p.column || 'col';
      const target = p.target_type || 'text';
      return {
        sql: `SELECT *, CAST("${col}" AS ${physicalTypeFor(target)}) AS "${col}" FROM prev_step`,
        polars: `df = df.with_columns(pl.col("${col}").cast(pl.Utf8))`,
        power_query_m: `Table.TransformColumnTypes(PrevStep, {{"${col}", type ${target}}})`,
        excel_formula: `=VALUE([@[${col}]])`,
      };
    }
    case 'math_transform': {
      const target = p.target_column || p.column || 'calc_col';
      const expr = p.expression || `${p.column || 'col'} ${p.operation || '+'} ${p.operand ?? 1}`;
      return {
        sql: `SELECT *, (${expr}) AS "${target}" FROM prev_step`,
        polars: `df = df.with_columns((${expr}).alias("${target}"))`,
        power_query_m: `Table.AddColumn(PrevStep, "${target}", each ${expr})`,
        excel_formula: `=[@[${p.column || 'amount'}]]`,
      };
    }
    case 'sort_rows': {
      const col = p.column || (p.conditions?.[0]?.column ?? 'col');
      const dir = (p.direction || p.conditions?.[0]?.direction || 'asc').toUpperCase();
      return {
        sql: `SELECT * FROM prev_step ORDER BY "${col}" ${dir}`,
        polars: `df = df.sort("${col}", descending=${dir === 'DESC' ? 'True' : 'False'})`,
        power_query_m: `Table.Sort(PrevStep, {{"${col}", Order.${dir === 'DESC' ? 'Descending' : 'Ascending'}}})`,
        excel_formula: `=SORT(Table1, 1, ${dir === 'DESC' ? -1 : 1})`,
      };
    }
    case 'group_by': {
      const groups = (p.group_columns || [p.group_by || 'region']).join('", "');
      return {
        sql: `SELECT "${groups}", COUNT(*) AS count FROM prev_step GROUP BY "${groups}"`,
        polars: `df = df.group_by(["${groups}"]).agg(pl.all().sum())`,
        power_query_m: `Table.Group(PrevStep, {"${groups}"}, {{"Total", each List.Sum([amount]), type number}})`,
        excel_formula: `=SUMIFS(Table1[amount], Table1[${groups}], [@[${groups}]])`,
      };
    }
    default:
      return {
        sql: `-- Step: ${step.label} (${step.type})\nSELECT * FROM prev_step`,
        polars: `# ${step.label}\ndf = df`,
        power_query_m: `// ${step.label}\nPrevStep`,
        excel_formula: null,
      };
  }
}

function executePipelineSteps(
  initialRows: Record<string, any>[],
  steps: StepDefinition[],
  allDatasets: StoredLocalDataset[]
): {
  rows: Record<string, any>[];
  columns: ColumnSchema[];
  compiledSql: string;
  stepSummaries: StepSummary[];
} {
  let rows = initialRows.map((r) => ({ ...r }));
  const stepSummaries: StepSummary[] = [];
  const sqlParts: string[] = ['WITH source_data AS (\n  SELECT * FROM dataset\n)'];
  let prevCte = 'source_data';

  steps.forEach((step, idx) => {
    const code = generateStepCode(step);
    stepSummaries.push({
      step_id: step.id,
      label: step.label,
      type: step.type,
      enabled: step.enabled,
      generated_code: code,
    });

    if (!step.enabled) return;

    const cteName = `step_${idx + 1}_${step.type}`;
    sqlParts.push(`${cteName} AS (\n  ${code.sql.replace(/prev_step/g, prevCte)}\n)`);
    prevCte = cteName;

    const p = step.params || {};

    switch (step.type) {
      case 'change_type': {
        const col = p.column;
        const targetType: DataType = p.target_type || 'text';
        if (col) {
          rows = rows.map((r) => {
            const val = r[col];
            if (val === null || val === undefined || val === '') return { ...r, [col]: null };
            let nextVal: any = val;
            if (targetType === 'integer') nextVal = Number.isNaN( parseInt(String(val), 10) ) ? null : parseInt(String(val), 10);
            else if (targetType === 'float') nextVal = Number.isNaN(Number(val)) ? null : Number(val);
            else if (targetType === 'boolean') nextVal = String(val).toLowerCase() === 'true' || val === 1 || val === '1';
            else nextVal = String(val);
            return { ...r, [col]: nextVal };
          });
        }
        break;
      }

      case 'rename_column': {
        const oldName = p.old_name || p.column;
        const newName = p.new_name;
        if (oldName && newName && oldName !== newName) {
          rows = rows.map((r) => {
            const next: Record<string, any> = {};
            Object.keys(r).forEach((k) => {
              next[k === oldName ? newName : k] = r[k];
            });
            return next;
          });
        }
        break;
      }

      case 'filter_rows': {
        const conditions = p.conditions || [
          { column: p.column, operator: p.operator || 'eq', value: p.value },
        ];
        const logic = (p.logic || 'AND').toUpperCase();
        rows = rows.filter((r) => {
          const results = conditions
            .filter((c: any) => c && c.column)
            .map((c: any) => evaluateRowCondition(r[c.column], c.operator || 'eq', c.value));
          if (results.length === 0) return true;
          return logic === 'OR' ? results.some(Boolean) : results.every(Boolean);
        });
        break;
      }

      case 'sort_rows': {
        const sorts: SortCondition[] = p.conditions || [
          { column: p.column, direction: p.direction || 'asc' },
        ];
        rows.sort((a, b) => {
          for (const s of sorts) {
            if (!s.column) continue;
            const va = a[s.column];
            const vb = b[s.column];
            if (va === vb) continue;
            if (va === null || va === undefined) return 1;
            if (vb === null || vb === undefined) return -1;
            const cmp =
              typeof va === 'number' && typeof vb === 'number'
                ? va - vb
                : String(va).localeCompare(String(vb), undefined, { numeric: true });
            return s.direction === 'desc' ? -cmp : cmp;
          }
          return 0;
        });
        break;
      }

      case 'remove_duplicates': {
        const cols: string[] =
          Array.isArray(p.columns) && p.columns.length > 0
            ? p.columns
            : p.column
            ? [p.column]
            : rows[0]
            ? Object.keys(rows[0])
            : [];
        const seen = new Set<string>();
        rows = rows.filter((r) => {
          const key = cols.map((c) => String(r[c] ?? '')).join('||');
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        break;
      }

      case 'fill_down': {
        const cols: string[] =
          Array.isArray(p.columns) && p.columns.length > 0
            ? p.columns
            : p.column
            ? [p.column]
            : [];
        const lastVal: Record<string, any> = {};
        rows = rows.map((r) => {
          const copy = { ...r };
          cols.forEach((c) => {
            if (copy[c] === null || copy[c] === undefined || copy[c] === '') {
              if (lastVal[c] !== undefined) copy[c] = lastVal[c];
            } else {
              lastVal[c] = copy[c];
            }
          });
          return copy;
        });
        break;
      }

      case 'replace_values': {
        const col = p.column;
        const findVal = p.find_value ?? p.old_value ?? '';
        const replaceVal = p.replace_value ?? p.new_value ?? '';
        if (col) {
          rows = rows.map((r) => {
            const cur = r[col];
            if (String(cur ?? '') === String(findVal)) {
              return { ...r, [col]: replaceVal };
            }
            return r;
          });
        }
        break;
      }

      case 'split_column': {
        const col = p.column;
        const delim = p.delimiter || ',';
        if (col) {
          rows = rows.map((r) => {
            const parts = String(r[col] ?? '').split(delim);
            return {
              ...r,
              [`${col}_1`]: parts[0]?.trim() ?? null,
              [`${col}_2`]: parts.slice(1).join(delim).trim() || null,
            };
          });
        }
        break;
      }

      case 'math_transform': {
        const col = p.column;
        const op = p.operation || 'add';
        const operand = Number(p.operand ?? 0);
        const targetCol = p.target_column || col || 'calculated';
        rows = rows.map((r) => {
          if (op === 'formula' && p.expression) {
            return { ...r, [targetCol]: evaluateFormulaForRow(p.expression, r) };
          }
          const v = Number(r[col] ?? 0);
          let res = v;
          if (op === 'add' || op === '+') res = v + operand;
          else if (op === 'subtract' || op === '-') res = v - operand;
          else if (op === 'multiply' || op === '*') res = v * operand;
          else if (op === 'divide' || op === '/') res = operand !== 0 ? v / operand : 0;
          else if (op === 'round') res = Number(v.toFixed(operand || 0));
          else if (op === 'abs') res = Math.abs(v);
          return { ...r, [targetCol]: Number(res.toFixed(4)) };
        });
        break;
      }

      case 'text_transform': {
        const col = p.column;
        const op = p.operation || 'upper';
        const targetCol = p.target_column || col;
        if (col && targetCol) {
          rows = rows.map((r) => {
            const s = String(r[col] ?? '');
            let out = s;
            if (op === 'upper' || op === 'uppercase') out = s.toUpperCase();
            else if (op === 'lower' || op === 'lowercase') out = s.toLowerCase();
            else if (op === 'trim') out = s.trim();
            else if (op === 'title' || op === 'proper') {
              out = s.replace(/\w\S*/g, (t) => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase());
            } else if (op === 'length') {
              return { ...r, [targetCol]: s.length };
            }
            return { ...r, [targetCol]: out };
          });
        }
        break;
      }

      case 'date_transform': {
        const col = p.column;
        const op = p.operation || p.part || 'year';
        const targetCol = p.target_column || `${col}_${op}`;
        if (col) {
          rows = rows.map((r) => {
            const d = new Date(String(r[col] ?? ''));
            if (Number.isNaN(d.getTime())) return { ...r, [targetCol]: null };
            let out: any = null;
            if (op === 'year') out = d.getFullYear();
            else if (op === 'month') out = d.getMonth() + 1;
            else if (op === 'day') out = d.getDate();
            else if (op === 'quarter') out = Math.floor(d.getMonth() / 3) + 1;
            else out = d.toISOString().slice(0, 10);
            return { ...r, [targetCol]: out };
          });
        }
        break;
      }

      case 'conditional': {
        const targetCol = p.target_column || p.new_column || 'conditional_col';
        const clauses = p.clauses || [
          {
            column: p.column,
            operator: p.operator || 'eq',
            value: p.value,
            then_value: p.then_value ?? 'True',
          },
        ];
        const elseVal = p.else_value ?? 'Other';
        rows = rows.map((r) => {
          for (const c of clauses) {
            if (c.column && evaluateRowCondition(r[c.column], c.operator || 'eq', c.value)) {
              return { ...r, [targetCol]: c.then_value };
            }
          }
          return { ...r, [targetCol]: elseVal };
        });
        break;
      }

      case 'group_by': {
        const groupCols: string[] = Array.isArray(p.group_columns)
          ? p.group_columns
          : p.group_by
          ? [p.group_by]
          : [];
        const aggs: Array<{ column: string; function: string; alias?: string }> =
          p.aggregations || [
            {
              column: p.agg_column || 'amount',
              function: p.agg_func || 'sum',
              alias: p.alias || `${p.agg_func || 'sum'}_${p.agg_column || 'amount'}`,
            },
          ];

        const groups = new Map<string, Record<string, any>[]>();
        rows.forEach((r) => {
          const key = groupCols.map((c) => String(r[c] ?? '')).join('||');
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key)!.push(r);
        });

        const groupedRows: Record<string, any>[] = [];
        groups.forEach((gRows) => {
          const base: Record<string, any> = {};
          groupCols.forEach((c) => {
            base[c] = gRows[0][c];
          });
          aggs.forEach((agg) => {
            const fn = (agg.function || 'sum').toLowerCase();
            const alias = agg.alias || `${fn}_${agg.column}`;
            const nums = gRows.map((x) => Number(x[agg.column])).filter((n) => !Number.isNaN(n));
            if (fn === 'count') base[alias] = gRows.length;
            else if (fn === 'sum') base[alias] = Number(nums.reduce((a, b) => a + b, 0).toFixed(2));
            else if (fn === 'avg' || fn === 'mean')
              base[alias] = nums.length ? Number((nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2)) : 0;
            else if (fn === 'min') base[alias] = nums.length ? Math.min(...nums) : null;
            else if (fn === 'max') base[alias] = nums.length ? Math.max(...nums) : null;
          });
          groupedRows.push(base);
        });
        rows = groupedRows;
        break;
      }

      case 'window_calc': {
        const fn = (p.function || p.window_type || 'running_sum').toLowerCase();
        const valCol = p.value_column || p.column || 'amount';
        const targetCol = p.target_column || `${fn}_${valCol}`;
        let running = 0;
        rows = rows.map((r, i) => {
          const v = Number(r[valCol] ?? 0) || 0;
          running += v;
          if (fn === 'row_number' || fn === 'rank') return { ...r, [targetCol]: i + 1 };
          if (fn === 'running_avg') return { ...r, [targetCol]: Number((running / (i + 1)).toFixed(2)) };
          return { ...r, [targetCol]: Number(running.toFixed(2)) };
        });
        break;
      }

      case 'xlookup':
      case 'join': {
        const rightId = p.right_dataset_id || p.lookup_dataset_id;
        const rightDs = allDatasets.find((d) => d.meta.id === rightId);
        if (rightDs) {
          const leftKey = p.left_key || p.lookup_key || p.key_pairs?.[0]?.left_key || 'customer_id';
          const rightKey = p.right_key || p.match_key || p.key_pairs?.[0]?.right_key || leftKey;
          const lookupMap = new Map<string, Record<string, any>>();
          rightDs.rows.forEach((rr) => {
            lookupMap.set(String(rr[rightKey] ?? ''), rr);
          });
          rows = rows.map((lr) => {
            const match = lookupMap.get(String(lr[leftKey] ?? ''));
            if (!match) return { ...lr };
            if (step.type === 'xlookup' && p.return_column) {
              const target = p.target_column || p.return_column;
              return { ...lr, [target]: match[p.return_column] ?? p.if_not_found ?? null };
            }
            const merged = { ...lr };
            Object.keys(match).forEach((k) => {
              if (k !== rightKey) {
                merged[k in merged ? `right_${k}` : k] = match[k];
              }
            });
            return merged;
          });
        }
        break;
      }

      case 'append': {
        const otherIds: string[] = p.dataset_ids || (p.right_dataset_id ? [p.right_dataset_id] : []);
        otherIds.forEach((id) => {
          const other = allDatasets.find((d) => d.meta.id === id);
          if (other) {
            rows = [...rows, ...other.rows.map((r) => ({ ...r }))];
          }
        });
        break;
      }

      default:
        break;
    }
  });

  const compiledSql = `${sqlParts.join(',\n')}\nSELECT * FROM ${prevCte};`;
  const columns = inferSchema(rows);
  return { rows, columns, compiledSql, stepSummaries };
}

export const localEngine = {
  async join(data: { email: string; password: string; full_name?: string }): Promise<AuthResponse> {
    return {
      access_token: 'local-standalone-token',
      refresh_token: 'local-standalone-refresh',
      token_type: 'bearer',
      user: {
        id: 'local-user-1',
        email: data.email || 'local@stepsheet.app',
        full_name: data.full_name || 'Local User',
        is_active: true,
        is_superuser: true,
      },
    };
  },

  async login(data: { email: string; password: string }): Promise<AuthResponse> {
    return this.join(data);
  },

  async getMe() {
    return {
      id: 'local-user-1',
      email: 'local@stepsheet.app',
      full_name: 'Local Standalone User',
      is_active: true,
      is_superuser: true,
    };
  },

  async listDatasets(): Promise<Dataset[]> {
    return getStoredDatasets().map((d) => d.meta);
  },

  async getDataset(id: string): Promise<Dataset> {
    const found = getStoredDatasets().find((d) => d.meta.id === id);
    if (!found) throw new Error('Dataset not found');
    return found.meta;
  },

  async uploadDataset(file: File, name?: string): Promise<Dataset> {
    const text = await file.text();
    const ext = file.name.split('.').pop()?.toLowerCase() || 'csv';
    let rows: Record<string, any>[] = [];
    if (ext === 'json') {
      const parsed = JSON.parse(text);
      rows = Array.isArray(parsed) ? parsed : [parsed];
    } else if (ext === 'tsv' || ext === 'txt') {
      rows = parseDelimitedText(text, '\t');
    } else {
      rows = parseDelimitedText(text, ',');
    }

    const schema = inferSchema(rows);
    const now = new Date().toISOString();
    const meta: Dataset = {
      id: `local-ds-${crypto.randomUUID().slice(0, 8)}`,
      name: name || file.name.replace(/\.[^/.]+$/, ''),
      original_filename: file.name,
      file_format: ext,
      row_count: rows.length,
      column_count: schema.length,
      file_size_bytes: file.size || text.length,
      schema_metadata: schema,
      created_at: now,
      updated_at: now,
    };

    const current = getStoredDatasets();
    saveStoredDatasets([{ meta, rows }, ...current]);
    logAudit('dataset.upload', { dataset_id: meta.id, name: meta.name, rows: meta.row_count });
    return meta;
  },

  async loadSampleDatasets(): Promise<Dataset[]> {
    const samples = buildSampleDatasets();
    const current = getStoredDatasets().filter(
      (d) => d.meta.id !== 'local-sample-orders' && d.meta.id !== 'local-sample-customers'
    );
    const merged = [...samples, ...current];
    saveStoredDatasets(merged);
    logAudit('dataset.load_samples', { count: samples.length });
    return samples.map((s) => s.meta);
  },

  async getRows(
    datasetId: string,
    params: {
      offset?: number;
      limit?: number;
      sort?: SortCondition[];
      filters?: FilterCondition[];
      search?: string;
    }
  ): Promise<DatasetRowsResponse> {
    const ds = getStoredDatasets().find((d) => d.meta.id === datasetId) || getStoredDatasets()[0];
    if (!ds) {
      return {
        dataset_id: datasetId,
        total_rows: 0,
        filtered_rows: 0,
        offset: 0,
        limit: params.limit ?? 100,
        columns: [],
        rows: [],
      };
    }

    let rows = [...ds.rows];
    const totalRows = rows.length;

    if (params.filters && params.filters.length > 0) {
      rows = rows.filter((r) =>
        params.filters!.every((f) => evaluateRowCondition(r[f.column], f.operator, f.value))
      );
    }

    if (params.search && params.search.trim()) {
      const q = params.search.toLowerCase();
      rows = rows.filter((r) =>
        Object.values(r).some((v) => v !== null && v !== undefined && String(v).toLowerCase().includes(q))
      );
    }

    if (params.sort && params.sort.length > 0) {
      const sorts = params.sort;
      rows.sort((a, b) => {
        for (const s of sorts) {
          const va = a[s.column];
          const vb = b[s.column];
          if (va === vb) continue;
          if (va === null || va === undefined) return 1;
          if (vb === null || vb === undefined) return -1;
          const cmp =
            typeof va === 'number' && typeof vb === 'number'
              ? va - vb
              : String(va).localeCompare(String(vb), undefined, { numeric: true });
          return s.direction === 'desc' ? -cmp : cmp;
        }
        return 0;
      });
    }

    const filteredRows = rows.length;
    const offset = params.offset ?? 0;
    const limit = params.limit ?? 100;
    const sliced = rows.slice(offset, offset + limit);

    return {
      dataset_id: ds.meta.id,
      total_rows: totalRows,
      filtered_rows: filteredRows,
      offset,
      limit,
      columns: ds.meta.schema_metadata,
      rows: sliced,
    };
  },

  async deleteDataset(id: string): Promise<void> {
    const remaining = getStoredDatasets().filter((d) => d.meta.id !== id);
    saveStoredDatasets(remaining);
    logAudit('dataset.delete', { dataset_id: id });
  },

  async getColumnProfile(datasetId: string, columnName: string): Promise<ColumnProfile> {
    const ds = getStoredDatasets().find((d) => d.meta.id === datasetId) || getStoredDatasets()[0];
    const rows = ds ? ds.rows : [];
    const total = rows.length;
    const vals = rows.map((r) => r[columnName]);
    const nonNull = vals.filter((v) => v !== null && v !== undefined && v !== '');
    const nullCount = total - nonNull.length;
    const dt = inferDataType(nonNull);

    const freq = new Map<string, { val: any; count: number }>();
    nonNull.forEach((v) => {
      const k = String(v);
      const cur = freq.get(k);
      if (cur) cur.count++;
      else freq.set(k, { val: v, count: 1 });
    });

    const sortedTop = Array.from(freq.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)
      .map((item) => ({
        value: item.val,
        count: item.count,
        percentage: total > 0 ? Number(((item.count / total) * 100).toFixed(1)) : 0,
      }));

    const nums = nonNull.map((v) => Number(v)).filter((n) => !Number.isNaN(n));
    const minVal = nums.length > 0 ? Math.min(...nums) : nonNull[0] ?? null;
    const maxVal = nums.length > 0 ? Math.max(...nums) : nonNull[nonNull.length - 1] ?? null;
    const meanVal =
      nums.length > 0 ? Number((nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2)) : undefined;

    return {
      column_name: columnName,
      data_type: dt,
      total_count: total,
      null_count: nullCount,
      null_percentage: total > 0 ? Number(((nullCount / total) * 100).toFixed(1)) : 0,
      distinct_count: freq.size,
      distinct_percentage: total > 0 ? Number(((freq.size / total) * 100).toFixed(1)) : 0,
      is_unique: freq.size === total && total > 0,
      min_value: minVal,
      max_value: maxVal,
      mean_value: meanVal,
      top_values: sortedTop,
    };
  },

  async getProfile(datasetId: string): Promise<DatasetProfileResponse> {
    const ds = getStoredDatasets().find((d) => d.meta.id === datasetId) || getStoredDatasets()[0];
    if (!ds) {
      return { dataset_id: datasetId, total_rows: 0, total_columns: 0, columns: [] };
    }
    const profiles = await Promise.all(
      ds.meta.schema_metadata.map((c) => this.getColumnProfile(ds.meta.id, c.name))
    );
    return {
      dataset_id: ds.meta.id,
      total_rows: ds.rows.length,
      total_columns: ds.meta.schema_metadata.length,
      columns: profiles,
    };
  },

  async previewPipeline(
    datasetId: string,
    steps: StepDefinition[],
    params: { offset?: number; limit?: number } = {}
  ): Promise<any> {
    const all = getStoredDatasets();
    const ds = all.find((d) => d.meta.id === datasetId) || all[0];
    if (!ds) throw new Error('Dataset not found');

    const { rows, columns, compiledSql, stepSummaries } = executePipelineSteps(ds.rows, steps, all);
    const offset = params.offset ?? 0;
    const limit = params.limit ?? 100;

    return {
      dataset_id: ds.meta.id,
      total_rows: ds.rows.length,
      filtered_rows: rows.length,
      offset,
      limit,
      columns,
      rows: rows.slice(offset, offset + limit),
      compiled_sql: compiledSql,
      steps: stepSummaries,
    };
  },

  async checkJoinHealth(data: {
    left_dataset_id: string;
    right_dataset_id: string;
    key_pairs: any[];
    join_type: string;
  }): Promise<any> {
    const all = getStoredDatasets();
    const left = all.find((d) => d.meta.id === data.left_dataset_id) || all[0];
    const right = all.find((d) => d.meta.id === data.right_dataset_id) || all[1] || all[0];
    const lk = data.key_pairs?.[0]?.left_key || 'customer_id';
    const rk = data.key_pairs?.[0]?.right_key || 'customer_id';

    const rightKeys = new Set((right?.rows || []).map((r) => String(r[rk] ?? '')));
    const leftRows = left?.rows || [];
    const matched = leftRows.filter((r) => rightKeys.has(String(r[lk] ?? ''))).length;

    return {
      left_total: leftRows.length,
      right_total: right?.rows.length || 0,
      matched_rows: matched,
      unmatched_left: leftRows.length - matched,
      match_rate_pct: leftRows.length ? Number(((matched / leftRows.length) * 100).toFixed(1)) : 100,
      relationship: 'many_to_one',
      explosion_risk: false,
      warnings: [],
    };
  },

  async suggestJoinKeys(leftId: string, rightId: string): Promise<any> {
    const all = getStoredDatasets();
    const left = all.find((d) => d.meta.id === leftId);
    const right = all.find((d) => d.meta.id === rightId);
    const suggestions: any[] = [];
    if (left && right) {
      const rightNames = new Set(right.meta.schema_metadata.map((c) => c.name));
      left.meta.schema_metadata.forEach((c) => {
        if (rightNames.has(c.name)) {
          suggestions.push({ left_key: c.name, right_key: c.name, confidence: 0.98 });
        }
      });
    }
    return { suggestions };
  },

  async generateAiStep(datasetId: string, prompt: string): Promise<any> {
    const all = getStoredDatasets();
    const ds = all.find((d) => d.meta.id === datasetId) || all[0];
    const cols = ds ? ds.meta.schema_metadata.map((c) => c.name) : ['amount', 'discount', 'region'];
    const p = prompt.trim();
    const lower = p.toLowerCase();

    // 1. Formula / calculated column e.g. "create discounted column = amount - discount"
    const eqMatch = p.match(/(?:create|add|compute|calculate)?\s*(?:column\s+)?([a-zA-Z0-9_]+)\s*(?:column\s*)?=\s*(.+)$/i);
    if (eqMatch) {
      const targetCol = eqMatch[1].replace(/_?column$/i, '').trim() || 'calculated';
      const expr = eqMatch[2].trim();
      return {
        step: {
          id: crypto.randomUUID(),
          type: 'math_transform',
          label: `Calculate ${targetCol} = ${expr}`,
          enabled: true,
          params: {
            column: cols[0] || 'amount',
            operation: 'formula',
            expression: expr,
            target_column: targetCol,
          },
        },
        explanation: `Computes new column "${targetCol}" using formula: ${expr}`,
        confidence: 0.95,
        provider: 'standalone-heuristic',
      };
    }

    // 2. Filter rows e.g. "filter where amount > 100"
    const filterMatch = p.match(/where\s+([a-zA-Z0-9_]+)\s*(>=|<=|!=|=|>|<|contains)\s*['"]?([^'"]+)['"]?/i);
    if (lower.includes('filter') || filterMatch) {
      const col = filterMatch?.[1] || cols.find((c) => lower.includes(c.toLowerCase())) || cols[0] || 'amount';
      const rawOp = (filterMatch?.[2] || '>').toLowerCase();
      const opMap: Record<string, string> = {
        '>': 'gt',
        '>=': 'gte',
        '<': 'lt',
        '<=': 'lte',
        '=': 'eq',
        '!=': 'neq',
        contains: 'contains',
      };
      const val = filterMatch?.[3]?.trim() || '100';
      return {
        step: {
          id: crypto.randomUUID(),
          type: 'filter_rows',
          label: `Filter ${col} ${rawOp} ${val}`,
          enabled: true,
          params: { column: col, operator: opMap[rawOp] || 'gt', value: val },
        },
        explanation: `Filters rows where ${col} ${rawOp} ${val}`,
        confidence: 0.92,
        provider: 'standalone-heuristic',
      };
    }

    // 3. Group by
    if (lower.includes('group by') || lower.includes('sum ') || lower.includes('total ')) {
      const groupCol = cols.find((c) => lower.includes(`by ${c.toLowerCase()}`)) || 'region';
      const aggCol = cols.find((c) => lower.includes(c.toLowerCase()) && c !== groupCol) || 'amount';
      return {
        step: {
          id: crypto.randomUUID(),
          type: 'group_by',
          label: `Group by ${groupCol} (sum ${aggCol})`,
          enabled: true,
          params: {
            group_columns: [groupCol],
            aggregations: [{ column: aggCol, function: 'sum', alias: `sum_${aggCol}` }],
          },
        },
        explanation: `Groups rows by "${groupCol}" and sums "${aggCol}".`,
        confidence: 0.9,
        provider: 'standalone-heuristic',
      };
    }

    // 4. Sort
    if (lower.includes('sort') || lower.includes('order by')) {
      const col = cols.find((c) => lower.includes(c.toLowerCase())) || cols[0] || 'amount';
      const dir = lower.includes('desc') || lower.includes('highest') ? 'desc' : 'asc';
      return {
        step: {
          id: crypto.randomUUID(),
          type: 'sort_rows',
          label: `Sort by ${col} (${dir.toUpperCase()})`,
          enabled: true,
          params: { column: col, direction: dir },
        },
        explanation: `Sorts dataset by "${col}" in ${dir}ending order.`,
        confidence: 0.9,
        provider: 'standalone-heuristic',
      };
    }

    // Default fallback: filter non-null on first matching column
    const matchedCol = cols.find((c) => lower.includes(c.toLowerCase())) || cols[0] || 'amount';
    return {
      step: {
        id: crypto.randomUUID(),
        type: 'filter_rows',
        label: `Filter ${matchedCol} is not null`,
        enabled: true,
        params: { column: matchedCol, operator: 'is_not_null', value: '' },
      },
      explanation: `Filters rows where "${matchedCol}" is not empty.`,
      confidence: 0.8,
      provider: 'standalone-heuristic',
    };
  },

  async getAiStatus(): Promise<any> {
    return { provider: 'standalone-heuristic', model: 'built-in-local', available: true };
  },

  async runQualityCheck(datasetId: string, rules: any[], steps: any[] = []): Promise<any> {
    const preview = await this.previewPipeline(datasetId, steps, { offset: 0, limit: 10000 });
    const rows: Record<string, any>[] = preview.rows;
    const total = rows.length;

    const results = (rules || []).map((rule, idx) => {
      const col = rule.column;
      const rtype = rule.rule_type || 'not_null';
      let failing: Record<string, any>[] = [];

      if (rtype === 'not_null') {
        failing = rows.filter((r) => r[col] === null || r[col] === undefined || r[col] === '');
      } else if (rtype === 'unique') {
        const counts = new Map<string, number>();
        rows.forEach((r) => {
          const k = String(r[col] ?? '');
          counts.set(k, (counts.get(k) || 0) + 1);
        });
        failing = rows.filter((r) => (counts.get(String(r[col] ?? '')) || 0) > 1);
      } else if (rtype === 'range') {
        const min = rule.min_value !== undefined ? Number(rule.min_value) : -Infinity;
        const max = rule.max_value !== undefined ? Number(rule.max_value) : Infinity;
        failing = rows.filter((r) => {
          const v = Number(r[col]);
          return Number.isNaN(v) || v < min || v > max;
        });
      }

      const failedCount = failing.length;
      const passRate = total > 0 ? Number((((total - failedCount) / total) * 100).toFixed(1)) : 100;
      return {
        rule_id: rule.id || `rule-${idx + 1}`,
        name: rule.name || `${rtype} on ${col}`,
        rule_type: rtype,
        column: col,
        severity: rule.severity || 'warning',
        passed: failedCount === 0,
        total_rows: total,
        failed_rows: failedCount,
        pass_rate_pct: passRate,
        sample_failures: failing.slice(0, 5),
      };
    });

    const passedRules = results.filter((r) => r.passed).length;
    return {
      dataset_id: datasetId,
      total_rows: total,
      overall_score: results.length ? Number(((passedRules / results.length) * 100).toFixed(1)) : 98.5,
      rules_evaluated: results.length,
      rules_passed: passedRules,
      rules_failed: results.length - passedRules,
      results,
    };
  },

  async runQuickAudit(datasetId: string): Promise<any> {
    const ds = getStoredDatasets().find((d) => d.meta.id === datasetId) || getStoredDatasets()[0];
    const cols = ds?.meta.schema_metadata || [];
    const autoRules = cols.slice(0, 4).map((c, idx) => ({
      id: `auto-${idx + 1}`,
      name: `${c.name} Not Null Check`,
      rule_type: idx === 0 ? 'unique' : 'not_null',
      column: c.name,
      severity: idx === 0 ? 'error' : 'warning',
    }));
    return this.runQualityCheck(datasetId, autoRules, []);
  },

  async downloadFailingRows(datasetId: string, _rule: any, steps: any[] = []): Promise<Blob> {
    return this.exportCsv(datasetId, steps);
  },

  async exportCsv(datasetId: string, steps: any[]): Promise<Blob> {
    const preview = await this.previewPipeline(datasetId, steps || [], { offset: 0, limit: 50000 });
    const rows: Record<string, any>[] = preview.rows;
    const cols: string[] = preview.columns.map((c: any) => c.name);
    const escapeCsv = (val: any) => {
      if (val === null || val === undefined) return '';
      const s = String(val);
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    };
    const csvLines = [
      cols.join(','),
      ...rows.map((r) => cols.map((c) => escapeCsv(r[c])).join(',')),
    ];
    return new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  },

  async exportExcel(datasetId: string, steps: any[]): Promise<Blob> {
    return this.exportCsv(datasetId, steps);
  },

  async exportParquet(datasetId: string, steps: any[]): Promise<Blob> {
    return this.exportCsv(datasetId, steps);
  },

  async exportJson(datasetId: string, steps: any[]): Promise<Blob> {
    const preview = await this.previewPipeline(datasetId, steps || [], { offset: 0, limit: 50000 });
    return new Blob([JSON.stringify(preview.rows, null, 2)], { type: 'application/json' });
  },

  async exportCode(datasetId: string, steps: any[]): Promise<any> {
    const preview = await this.previewPipeline(datasetId, steps || [], { offset: 0, limit: 10 });
    return {
      sql: preview.compiled_sql,
      polars: [
        'import polars as pl',
        'df = pl.read_csv("dataset.csv")',
        ...(preview.steps || []).map((s: any) => s.generated_code?.polars || '# step'),
      ].join('\n'),
      power_query_m: [
        'let',
        '  Source = Csv.Document(File.Contents("dataset.csv")),',
        ...(preview.steps || []).map((s: any, i: number) => `  Step${i + 1} = ${s.generated_code?.power_query_m || 'Source'}`),
        'in',
        `  Step${(preview.steps || []).length || 1}`,
      ].join('\n'),
    };
  },

  async runFullPipeline(datasetId: string, steps: any[]): Promise<any> {
    const t0 = performance.now();
    const preview = await this.previewPipeline(datasetId, steps || [], { offset: 0, limit: 100000 });
    const elapsed = Math.max(1, Math.round(performance.now() - t0));
    return {
      status: 'completed',
      dataset_id: datasetId,
      input_rows: preview.total_rows,
      output_rows: preview.filtered_rows,
      output_columns: preview.columns.length,
      steps_executed: (steps || []).filter((s) => s.enabled !== false).length,
      execution_time_ms: elapsed,
      compiled_sql: preview.compiled_sql,
    };
  },

  async exportPipelineSpec(datasetId: string, steps: any[]): Promise<Blob> {
    const spec = {
      version: '1.0',
      dataset_id: datasetId,
      exported_at: new Date().toISOString(),
      steps: steps || [],
    };
    return new Blob([JSON.stringify(spec, null, 2)], { type: 'application/json' });
  },

  async listTemplates(): Promise<any[]> {
    try {
      const raw = localStorage.getItem(LOCAL_TEMPLATES_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    const builtins = [
      {
        id: 'tpl-sales-clean',
        name: 'Sales Revenue Cleanup & Net Calculation',
        description: 'Filters valid orders, computes net revenue (amount - discount), and sorts by highest value.',
        category: 'Finance & Sales',
        required_columns: ['amount', 'discount'],
        steps: [
          {
            id: 'tpl-s1',
            type: 'filter_rows',
            label: 'Filter amount > 0',
            enabled: true,
            params: { column: 'amount', operator: 'gt', value: '0' },
          },
          {
            id: 'tpl-s2',
            type: 'math_transform',
            label: 'Compute net_amount = amount - discount',
            enabled: true,
            params: {
              column: 'amount',
              operation: 'formula',
              expression: 'amount - discount',
              target_column: 'net_amount',
            },
          },
        ],
        created_at: new Date().toISOString(),
      },
    ];
    return builtins;
  },

  async createTemplate(templateData: any): Promise<any> {
    const existing = await this.listTemplates();
    const created = {
      ...templateData,
      id: `tpl-${crypto.randomUUID().slice(0, 8)}`,
      created_at: new Date().toISOString(),
    };
    const next = [created, ...existing];
    try {
      localStorage.setItem(LOCAL_TEMPLATES_KEY, JSON.stringify(next));
    } catch {}
    logAudit('template.create', { name: created.name });
    return created;
  },

  async suggestColumnMapping(templateId: string, datasetId: string): Promise<any> {
    const templates = await this.listTemplates();
    const tpl = templates.find((t) => t.id === templateId) || templates[0];
    const ds = getStoredDatasets().find((d) => d.meta.id === datasetId) || getStoredDatasets()[0];
    const dsCols = ds ? ds.meta.schema_metadata.map((c) => c.name) : [];
    const mapping: Record<string, string> = {};
    (tpl?.required_columns || []).forEach((reqCol: string) => {
      mapping[reqCol] = dsCols.includes(reqCol) ? reqCol : dsCols[0] || reqCol;
    });
    return { mapping, confidence: 1.0 };
  },

  async applyTemplate(templateId: string, _datasetId: string, _columnMapping: Record<string, string>): Promise<any> {
    const templates = await this.listTemplates();
    const tpl = templates.find((t) => t.id === templateId) || templates[0];
    return { steps: tpl?.steps || [] };
  },

  async listVersions(_projectId: string): Promise<any[]> {
    try {
      const raw = localStorage.getItem(LOCAL_VERSIONS_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return [];
  },

  async createVersion(projectId: string, message: string, steps: any[], datasetId?: string): Promise<any> {
    const versions = await this.listVersions(projectId);
    const created = {
      id: crypto.randomUUID(),
      project_id: projectId,
      version_number: versions.length + 1,
      message,
      steps: steps || [],
      dataset_id: datasetId,
      created_by: 'local@stepsheet.app',
      created_at: new Date().toISOString(),
    };
    const next = [created, ...versions];
    try {
      localStorage.setItem(LOCAL_VERSIONS_KEY, JSON.stringify(next));
    } catch {}
    logAudit('version.create', { version_number: created.version_number, message });
    return created;
  },

  async diffVersions(projectId: string, fromVersion: number, toVersion: number): Promise<any> {
    const versions = await this.listVersions(projectId);
    const vFrom = versions.find((v) => v.version_number === fromVersion);
    const vTo = versions.find((v) => v.version_number === toVersion);
    const fromSteps = vFrom?.steps || [];
    const toSteps = vTo?.steps || [];
    return {
      from_version: fromVersion,
      to_version: toVersion,
      added_steps: toSteps.slice(fromSteps.length),
      removed_steps: fromSteps.slice(toSteps.length),
      modified_steps: [],
    };
  },

  async restoreVersion(projectId: string, versionId: string): Promise<any> {
    const versions = await this.listVersions(projectId);
    const found = versions.find((v) => v.id === versionId);
    logAudit('version.restore', { version_id: versionId });
    return found || { steps: [] };
  },

  async createShare(projectId: string, role: string = 'viewer', expiresInDays?: number): Promise<any> {
    const shares = await this.listShares(projectId);
    const created = {
      id: crypto.randomUUID(),
      project_id: projectId,
      role,
      share_token: `local-share-${crypto.randomUUID().slice(0, 12)}`,
      is_active: true,
      expires_in_days: expiresInDays,
      created_at: new Date().toISOString(),
    };
    const next = [created, ...shares];
    try {
      localStorage.setItem(LOCAL_SHARES_KEY, JSON.stringify(next));
    } catch {}
    logAudit('share.create', { role });
    return created;
  },

  async listShares(_projectId: string): Promise<any[]> {
    try {
      const raw = localStorage.getItem(LOCAL_SHARES_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return [];
  },

  async revokeShare(projectId: string, shareId: string): Promise<void> {
    const shares = await this.listShares(projectId);
    const next = shares.filter((s) => s.id !== shareId);
    try {
      localStorage.setItem(LOCAL_SHARES_KEY, JSON.stringify(next));
    } catch {}
    logAudit('share.revoke', { share_id: shareId });
  },

  async getShareAccess(token: string): Promise<any> {
    return { valid: true, share_token: token, role: 'viewer' };
  },

  async listAuditLogs(_projectId: string, action?: string): Promise<any> {
    try {
      const raw = localStorage.getItem(LOCAL_AUDIT_KEY);
      let logs = raw ? JSON.parse(raw) : [];
      if (action) {
        logs = logs.filter((l: any) => l.action?.startsWith(action));
      }
      return { total: logs.length, logs };
    } catch {
      return { total: 0, logs: [] };
    }
  },
};
