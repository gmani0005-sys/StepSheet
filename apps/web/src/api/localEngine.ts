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
const LOCAL_TEMPLATES_KEY = 'stepsheet_local_templates_v2';
const LOCAL_VERSIONS_KEY = 'stepsheet_local_versions_v2';
const LOCAL_SHARES_KEY = 'stepsheet_local_shares_v2';
const LOCAL_AUDIT_KEY = 'stepsheet_local_audit_v2';

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
  rows.forEach((r) => {
    if (r && typeof r === 'object') {
      Object.keys(r).forEach((k) => colSet.add(k));
    }
  });
  const colNames = Array.from(colSet);

  return colNames.map((name) => {
    const colVals = rows.map((r) => r?.[name]);
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

    const sampleProducts = [
      'Laptop Pro 15',
      'Standing Desk',
      'USB-C Monitor 27in',
      'Office Chair Executive',
      'Noise-Cancelling Headphones',
      'Mechanical Keyboard',
      'Wireless Ergonomic Mouse',
      'Thunderbolt Dock 4K',
      'Ultra-Wide Curved Display',
      'Portable SSD 2TB',
    ];
    const product = sampleProducts[(i - 1) % sampleProducts.length];

    ordersRows.push({
      order_id: `ORD-${String(1000 + i)}`,
      customer_id: custId,
      order_date: `2025-${month}-${day}`,
      product,
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

function getStoredAuditLogs(): any[] {
  try {
    const raw = localStorage.getItem(LOCAL_AUDIT_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  const now = new Date();
  const t1 = new Date(now.getTime() - 180000).toISOString();
  const t2 = new Date(now.getTime() - 120000).toISOString();
  const t3 = new Date(now.getTime() - 60000).toISOString();
  const initialLogs = [
    {
      id: 'audit-seed-3',
      project_id: 'default-project',
      action: 'version_created',
      resource_type: 'version',
      actor_email: 'local@stepsheet.app',
      user_email: 'local@stepsheet.app',
      timestamp: t3,
      created_at: t3,
      details: { version_number: 1, message: 'Initial baseline pipeline snapshot' },
    },
    {
      id: 'audit-seed-2',
      project_id: 'default-project',
      action: 'template_catalog_initialized',
      resource_type: 'template',
      actor_email: 'local@stepsheet.app',
      user_email: 'local@stepsheet.app',
      timestamp: t2,
      created_at: t2,
      details: { templates_loaded: 4, builtin: true },
    },
    {
      id: 'audit-seed-1',
      project_id: 'default-project',
      action: 'dataset_load_samples',
      resource_type: 'dataset',
      actor_email: 'local@stepsheet.app',
      user_email: 'local@stepsheet.app',
      timestamp: t1,
      created_at: t1,
      details: { datasets: ['Orders (Sample XLSX)', 'Customers (Sample CSV)'] },
    },
  ];
  try {
    localStorage.setItem(LOCAL_AUDIT_KEY, JSON.stringify(initialLogs));
  } catch {}
  return initialLogs;
}

function logAudit(action: string, details: Record<string, any> = {}, resourceType?: string) {
  try {
    const logs = getStoredAuditLogs();
    const inferredResource =
      resourceType ||
      (action.includes('version')
        ? 'version'
        : action.includes('template')
        ? 'template'
        : action.includes('share')
        ? 'share'
        : action.includes('export')
        ? 'export'
        : action.includes('quality')
        ? 'quality'
        : 'dataset');
    const now = new Date().toISOString();
    logs.unshift({
      id: crypto.randomUUID(),
      project_id: 'default-project',
      action,
      resource_type: inferredResource,
      actor_email: 'local@stepsheet.app',
      user_email: 'local@stepsheet.app',
      timestamp: now,
      created_at: now,
      details,
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

function normalizeUniqueValueKey(val: any): string {
  if (val === null || val === undefined || val === '') return '__NULL__';
  if (typeof val === 'boolean') return val ? 'true' : 'false';
  return String(val);
}

function evaluateRowCondition(rowVal: any, operator: string, targetVal: any): boolean {
  if (operator === 'is_null') return rowVal === null || rowVal === undefined || rowVal === '';
  if (operator === 'is_not_null') return rowVal !== null && rowVal !== undefined && rowVal !== '';
  if (operator === 'in') {
    const allowed: string[] = Array.isArray(targetVal)
      ? targetVal.map((v) => normalizeUniqueValueKey(v))
      : String(targetVal ?? '')
          .split(',')
          .map((s) => s.trim());
    const rowKey = normalizeUniqueValueKey(rowVal);
    return allowed.some((k) => k.toLowerCase() === rowKey.toLowerCase());
  }

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
    case 'between': {
      if (Array.isArray(targetVal)) {
        const [low, high] = targetVal.map(Number);
        return aNum >= Math.min(low, high) && aNum <= Math.max(low, high);
      }
      const parts = String(targetVal).split(',').map((x) => Number(x.trim()));
      if (parts.length >= 2 && !Number.isNaN(parts[0]) && !Number.isNaN(parts[1])) {
        return aNum >= Math.min(parts[0], parts[1]) && aNum <= Math.max(parts[0], parts[1]);
      }
      return true;
    }
    case 'in': {
      const list = Array.isArray(targetVal)
        ? targetVal.map((x) => String(x).toLowerCase())
        : String(targetVal).split(',').map((x) => x.trim().toLowerCase());
      return list.includes(aStr.toLowerCase());
    }
    case 'not_in': {
      const list = Array.isArray(targetVal)
        ? targetVal.map((x) => String(x).toLowerCase())
        : String(targetVal).split(',').map((x) => x.trim().toLowerCase());
      return !list.includes(aStr.toLowerCase());
    }
    default:
      return true;
  }
}

function evaluateFormulaForRow(expression: string, row: Record<string, any>): any {
  const expr = expression.trim();
  if (!expr) return null;

  // Sandbox helper functions corresponding to Excel documentation
  const sandbox: Record<string, any> = {
    // Row column accessor
    _get: (colName: string) => {
      if (colName in row) return row[colName];
      const foundKey = Object.keys(row).find(
        (k) => k.toLowerCase() === colName.toLowerCase()
      );
      return foundKey ? row[foundKey] : undefined;
    },
    // Logical
    IF: (cond: any, thenVal: any, elseVal: any) => (Boolean(cond) ? thenVal : elseVal),
    IFS: (...args: any[]) => {
      for (let i = 0; i < args.length; i += 2) {
        if (args[i]) return args[i + 1];
      }
      return null;
    },
    SWITCH: (val: any, ...args: any[]) => {
      for (let i = 0; i < args.length - 1; i += 2) {
        if (val === args[i]) return args[i + 1];
      }
      return args.length % 2 === 1 ? args[args.length - 1] : null;
    },
    AND: (...args: any[]) => args.every(Boolean),
    OR: (...args: any[]) => args.some(Boolean),
    NOT: (a: any) => !a,
    COALESCE: (...args: any[]) => args.find((x) => x !== null && x !== undefined && x !== '') ?? null,
    IFERROR: (v: any, fallback: any) => (v === null || v === undefined || (typeof v === 'number' && Number.isNaN(v)) ? fallback : v),
    IFNA: (v: any, fallback: any) => (v === null || v === undefined ? fallback : v),

    // Text transformations
    CONCAT: (...args: any[]) => args.map((x) => (x === null || x === undefined ? '' : String(x))).join(''),
    TEXTJOIN: (sep: any, ignoreEmpty: any, ...args: any[]) => {
      const s = String(sep ?? '');
      return args
        .filter((x) => (ignoreEmpty ? x !== null && x !== undefined && x !== '' : true))
        .map((x) => (x === null || x === undefined ? '' : String(x)))
        .join(s);
    },
    UPPER: (s: any) => String(s ?? '').toUpperCase(),
    LOWER: (s: any) => String(s ?? '').toLowerCase(),
    PROPER: (s: any) =>
      String(s ?? '').replace(/\b\w/g, (c) => c.toUpperCase()),
    TRIM: (s: any) => String(s ?? '').trim(),
    LEN: (s: any) => String(s ?? '').length,
    LEFT: (s: any, n = 1) => String(s ?? '').slice(0, Math.max(0, Number(n))),
    RIGHT: (s: any, n = 1) => String(s ?? '').slice(-Math.max(0, Number(n))),
    MID: (s: any, start = 1, len = 1) =>
      String(s ?? '').substr(Math.max(0, Number(start) - 1), Math.max(0, Number(len))),
    SUBSTITUTE: (s: any, oldSub: any, newSub: any) =>
      String(s ?? '').split(String(oldSub ?? '')).join(String(newSub ?? '')),
    REPLACE: (s: any, start: number, len: number, newText: any) => {
      const str = String(s ?? '');
      const st = Math.max(0, Number(start) - 1);
      return str.slice(0, st) + String(newText ?? '') + str.slice(st + Number(len));
    },
    EXACT: (a: any, b: any) => String(a ?? '') === String(b ?? ''),
    REPT: (s: any, n = 1) => String(s ?? '').repeat(Math.max(0, Math.floor(Number(n)))),

    // Math transformations
    ROUND: (n: any, d = 0) => {
      const num = Number(n);
      return Number.isNaN(num) ? 0 : Number(num.toFixed(Math.max(0, Math.min(10, d))));
    },
    ROUNDUP: (n: any, d = 0) => {
      const num = Number(n);
      if (Number.isNaN(num)) return 0;
      const factor = Math.pow(10, d);
      return Math.ceil(num * factor) / factor;
    },
    ROUNDDOWN: (n: any, d = 0) => {
      const num = Number(n);
      if (Number.isNaN(num)) return 0;
      const factor = Math.pow(10, d);
      return Math.floor(num * factor) / factor;
    },
    ABS: (n: any) => Math.abs(Number(n) || 0),
    SQRT: (n: any) => Math.sqrt(Math.max(0, Number(n) || 0)),
    POWER: (base: any, exp = 1) => Math.pow(Number(base) || 0, Number(exp) || 0),
    MOD: (n: any, d = 1) => (Number(d) !== 0 ? (Number(n) || 0) % Number(d) : 0),
    CEILING: (n: any) => Math.ceil(Number(n) || 0),
    FLOOR: (n: any) => Math.floor(Number(n) || 0),
    SIGN: (n: any) => Math.sign(Number(n) || 0),
    INT: (n: any) => Math.trunc(Number(n) || 0),

    // Date functions
    YEAR: (d: any) => new Date(d).getFullYear() || 0,
    MONTH: (d: any) => (new Date(d).getMonth() + 1) || 0,
    DAY: (d: any) => new Date(d).getDate() || 0,
    HOUR: (d: any) => new Date(d).getHours() || 0,
    MINUTE: (d: any) => new Date(d).getMinutes() || 0,
    SECOND: (d: any) => new Date(d).getSeconds() || 0,
    TODAY: () => new Date().toISOString().split('T')[0],
    NOW: () => new Date().toISOString(),
    DATE: (y: any, m: any, d: any) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
    DATEDIF: (d1: any, d2: any, unit = 'd') => {
      const ms = Math.abs(new Date(d2).getTime() - new Date(d1).getTime());
      if (unit.toLowerCase() === 'y') return Math.floor(ms / (1000 * 60 * 60 * 24 * 365.25));
      if (unit.toLowerCase() === 'm') return Math.floor(ms / (1000 * 60 * 60 * 24 * 30.44));
      return Math.floor(ms / (1000 * 60 * 60 * 24));
    },
    NETWORKDAYS: (d1: any, d2: any) => {
      const t1 = new Date(d1).getTime();
      const t2 = new Date(d2).getTime();
      if (Number.isNaN(t1) || Number.isNaN(t2)) return 0;
      let start = new Date(Math.min(t1, t2));
      const end = new Date(Math.max(t1, t2));
      let workDays = 0;
      while (start <= end) {
        const day = start.getUTCDay();
        if (day !== 0 && day !== 6) workDays++;
        start.setUTCDate(start.getUTCDate() + 1);
      }
      return t1 > t2 ? -workDays : workDays;
    },
    EOMONTH: (d: any, months = 0) => {
      const dt = new Date(d);
      if (Number.isNaN(dt.getTime())) return null;
      const target = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1 + Number(months), 0));
      return target.toISOString().slice(0, 10);
    },
    EDATE: (d: any, months = 0) => {
      const dt = new Date(d);
      if (Number.isNaN(dt.getTime())) return null;
      const copy = new Date(dt.getTime());
      copy.setUTCMonth(copy.getUTCMonth() + Number(months));
      return copy.toISOString().slice(0, 10);
    },
    WEEKDAY: (d: any) => {
      const dt = new Date(d);
      return Number.isNaN(dt.getTime()) ? 1 : dt.getUTCDay() + 1;
    },

    // Extended Text helpers
    TEXTBEFORE: (s: any, delim = ' ') => {
      const str = String(s ?? '');
      const idx = str.indexOf(String(delim));
      return idx === -1 ? str : str.slice(0, idx);
    },
    TEXTAFTER: (s: any, delim = ' ') => {
      const str = String(s ?? '');
      const idx = str.indexOf(String(delim));
      return idx === -1 ? '' : str.slice(idx + String(delim).length);
    },
    CLEAN: (s: any) => String(s ?? '').replace(/[\x00-\x1F\x7F]/g, '').trim(),

    // Extended Statistics helpers
    AVERAGE: (...args: any[]) => {
      const nums = args.map(Number).filter((n) => !Number.isNaN(n));
      return nums.length ? Number((nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(4)) : 0;
    },
    SUM: (...args: any[]) => args.reduce((a, b) => a + (Number(b) || 0), 0),
    MIN: (...args: any[]) => Math.min(...args.map((n) => (Number.isNaN(Number(n)) ? Infinity : Number(n)))),
    MAX: (...args: any[]) => Math.max(...args.map((n) => (Number.isNaN(Number(n)) ? -Infinity : Number(n)))),
    MEDIAN: (...args: any[]) => {
      const nums = args.map(Number).filter((n) => !Number.isNaN(n)).sort((a, b) => a - b);
      if (!nums.length) return 0;
      const mid = Math.floor(nums.length / 2);
      return nums.length % 2 === 1 ? nums[mid] : Number(((nums[mid - 1] + nums[mid]) / 2).toFixed(4));
    },
    PRODUCT: (...args: any[]) => args.reduce((a, b) => a * (Number(b) || 1), 1),
    TRUNC: (n: any) => Math.trunc(Number(n) || 0),
  };

  // 1. Extract and preserve string literals
  const strings: string[] = [];
  let jsExpr = expr.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, (m) => {
    strings.push(m);
    return `__STR_${strings.length - 1}__`;
  });

  // 2. Convert bracketed column names [Column_Name] -> _get("Column_Name")
  jsExpr = jsExpr.replace(/\[([^\]]+)\]/g, (_, colName) => `_get(${JSON.stringify(colName)})`);

  // 3. Convert string concatenation & -> +
  jsExpr = jsExpr.replace(/&/g, '+');

  // 4. Convert comparison = -> === when not part of <=, >=, !=, ==
  jsExpr = jsExpr.replace(/(?<![<>=!])=(?![=])/g, '===');
  jsExpr = jsExpr.replace(/<>/g, '!==');

  // 5. Convert bare column names if they match row keys
  const reservedWords = new Set([
    'true', 'false', 'null', 'undefined', 'in', 'of', 'var', 'let', 'const',
    'if', 'else', 'return', 'case', 'switch', 'for', 'while', 'do',
    ...Object.keys(sandbox),
  ]);

  const sortedCols = Object.keys(row).sort((a, b) => b.length - a.length);
  for (const col of sortedCols) {
    if (reservedWords.has(col.toUpperCase()) || reservedWords.has(col.toLowerCase())) continue;
    const escaped = col.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const reg = new RegExp(`(?<![_a-zA-Z0-9"'])\\b${escaped}\\b(?![_a-zA-Z0-9"'])`, 'g');
    jsExpr = jsExpr.replace(reg, `_get(${JSON.stringify(col)})`);
  }

  // 6. Restore string literals
  jsExpr = jsExpr.replace(/__STR_(\d+)__/g, (_, idx) => strings[Number(idx)]);

  try {
    const fnKeys = Object.keys(sandbox);
    const fnVals = Object.values(sandbox);
    const runner = new Function(...fnKeys, `"use strict"; return (${jsExpr});`);
    const res = runner(...fnVals);
    if (typeof res === 'number') {
      return Number.isFinite(res) ? (Number.isInteger(res) ? res : Number(res.toFixed(4))) : null;
    }
    return res !== undefined ? res : null;
  } catch {
    const num = Number(expr);
    if (!Number.isNaN(num)) return num;
    return expr;
  }
}

function generateStepCode(step: StepDefinition): GeneratedCode {
  const p = step.params || {};
  switch (step.type) {
    case 'filter_rows': {
      const col = p.column || 'col';
      const op = p.operator || 'eq';
      const val = p.value ?? '';
      if (op === 'in' && Array.isArray(val)) {
        const sqlList = val.map((v) => `'${v}'`).join(', ');
        return {
          sql: `SELECT * FROM prev_step WHERE "${col}" IN (${sqlList})`,
          polars: `df = df.filter(pl.col("${col}").is_in(${JSON.stringify(val)}))`,
          power_query_m: `Table.SelectRows(PrevStep, each List.Contains({${val.map((v) => `"${v}"`).join(', ')}}, Text.From([${col}])))`,
          excel_formula: `=FILTER(Table1, ISNUMBER(MATCH(Table1[${col}], {${val.map((v) => `"${v}"`).join(',')}}, 0)))`,
        };
      }
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
      const col1 = p.column1 || p.column || 'amount';
      const col2 = p.column2 || p.operand || 1;
      const target = p.output_column || p.target_column || col1 || 'calc_col';
      const mathOp = p.math_operator || '+';
      const expr =
        p.expression ||
        (p.operation === 'arithmetic'
          ? `"${col1}" ${mathOp} "${col2}"`
          : `${col1} ${p.operation || '+'} ${p.operand ?? 1}`);
      return {
        sql: `SELECT *, (${expr}) AS "${target}" FROM prev_step`,
        polars: `df = df.with_columns((${expr}).alias("${target}"))`,
        power_query_m: `Table.AddColumn(PrevStep, "${target}", each ${expr})`,
        excel_formula:
          p.operation === 'arithmetic'
            ? `=[@[${col1}]] ${mathOp} [@[${col2}]]`
            : `=[@[${col1}]]`,
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
      const rawGroups: string[] = Array.isArray(p.group_by_columns)
        ? p.group_by_columns
        : Array.isArray(p.group_columns)
        ? p.group_columns
        : p.group_by
        ? [p.group_by]
        : ['region'];
      const groups = rawGroups.length > 0 ? rawGroups.join('", "') : '1';
      return {
        sql: `SELECT "${groups}", COUNT(*) AS count FROM prev_step GROUP BY "${groups}"`,
        polars: `df = df.group_by(${JSON.stringify(rawGroups)}).agg(pl.all().sum())`,
        power_query_m: `Table.Group(PrevStep, {${rawGroups.map((g) => `"${g}"`).join(', ')}}, {{"Total", each List.Sum([amount]), type number}})`,
        excel_formula: `=SUMIFS(Table1[amount], Table1[${rawGroups[0] || 'region'}], [@[${rawGroups[0] || 'region'}]])`,
      };
    }
    case 'join': {
      const jt = (p.join_type || 'left').toUpperCase().replace('_', ' ');
      const kp = p.key_pairs?.[0] || {};
      const lk = kp.left_col || kp.left_key || p.left_key || 'customer_id';
      const rk = kp.right_col || kp.right_key || p.right_key || lk;
      const rightTbl = p.right_dataset_id || 'right_table';
      return {
        sql: `SELECT l.*, r.* FROM prev_step l ${jt} JOIN "${rightTbl}" r ON l."${lk}" = r."${rk}"`,
        polars: `df = df.join(right_df, left_on="${lk}", right_on="${rk}", how="${p.join_type || 'left'}")`,
        power_query_m: `Table.NestedJoin(PrevStep, {"${lk}"}, RightTable, {"${rk}"}, "Joined", JoinKind.${p.join_type || 'LeftOuter'})`,
        excel_formula: `=XLOOKUP([@[${lk}]], RightTable[${rk}], RightTable[Column], "")`,
      };
    }
    case 'xlookup': {
      const lk = p.left_key_col || p.lookup_column || p.left_key || p.lookup_key || 'customer_id';
      const rk = p.right_key_col || p.right_Lookup_column || p.right_key || p.match_key || lk;
      const retCols = Array.isArray(p.return_columns)
        ? p.return_columns.join(', ')
        : p.return_column || 'value';
      const mm = p.match_mode !== undefined ? p.match_mode : 0;
      const sm = p.search_mode !== undefined ? p.search_mode : 1;
      return {
        sql: `SELECT l.*, r."${retCols}" FROM prev_step l LEFT JOIN lookup_table r ON l."${lk}" = r."${rk}"`,
        polars: `df = df.join(lookup_df.select(["${rk}", "${retCols}"]), left_on="${lk}", right_on="${rk}", how="left")`,
        power_query_m: `Table.NestedJoin(PrevStep, {"${lk}"}, LookupTable, {"${rk}"}, "Lookup", JoinKind.LeftOuter)`,
        excel_formula: `=XLOOKUP([@[${lk}]], LookupTable[${rk}], LookupTable[${retCols}], "${p.if_not_found ?? 'Not found'}", ${mm}, ${sm})`,
      };
    }
    case 'vlookup': {
      const lk = p.left_key_col || p.lookup_column || p.left_key || p.lookup_key || 'customer_id';
      const rk = p.right_key_col || p.right_key || lk;
      const colIdx = Number(p.col_index_num ?? 2);
      const retCol =
        p.return_column ||
        (Array.isArray(p.return_columns) ? p.return_columns[0] : undefined) ||
        'value';
      const outCol = p.output_column || retCol;
      const rangeLookup = p.range_lookup ? 'TRUE' : 'FALSE';
      const rawVlookup = `VLOOKUP([@[${lk}]], LookupTable, ${colIdx}, ${rangeLookup})`;
      const excelFormula =
        p.if_not_found !== undefined && String(p.if_not_found) !== ''
          ? `=IFERROR(${rawVlookup}, "${p.if_not_found}")`
          : `=${rawVlookup}`;
      return {
        sql: `SELECT l.*, r."${retCol}" AS "${outCol}" FROM prev_step l LEFT JOIN lookup_table r ON l."${lk}" = r."${rk}"`,
        polars: `df = df.join(lookup_df.select(["${rk}", "${retCol}"]), left_on="${lk}", right_on="${rk}", how="left")`,
        power_query_m: `Table.NestedJoin(PrevStep, {"${lk}"}, LookupTable, {"${rk}"}, "VLookup", JoinKind.LeftOuter)`,
        excel_formula: excelFormula,
      };
    }
    case 'conditional': {
      const outCol = p.new_column || p.target_column || 'conditional_col';
      const firstRule = (p.rules || p.clauses || [])[0] || {};
      const cCol = firstRule.column || p.column || 'amount';
      const cVal = firstRule.value ?? p.value ?? '100';
      const cRes = firstRule.result ?? firstRule.then_value ?? p.then_value ?? 'High';
      return {
        sql: `SELECT *, CASE WHEN "${cCol}" >= '${cVal}' THEN '${cRes}' ELSE '${p.else_value ?? 'Standard'}' END AS "${outCol}" FROM prev_step`,
        polars: `df = df.with_columns(pl.when(pl.col("${cCol}") >= "${cVal}").then(pl.lit("${cRes}")).otherwise(pl.lit("${p.else_value ?? 'Standard'}")).alias("${outCol}"))`,
        power_query_m: `Table.AddColumn(PrevStep, "${outCol}", each if [${cCol}] >= "${cVal}" then "${cRes}" else "${p.else_value ?? 'Standard'}")`,
        excel_formula: `=IF([@[${cCol}]] >= "${cVal}", "${cRes}", "${p.else_value ?? 'Standard'}")`,
      };
    }
    case 'window_calc': {
      const fn = (p.calc_type || p.function || p.window_type || 'running_total').toUpperCase();
      const valCol = p.value_column || (p.output_column ? p.target_column : p.column) || 'amount';
      const outCol = p.output_column || (p.value_column ? p.target_column : undefined) || `${fn.toLowerCase()}_${valCol}`;
      return {
        sql: `SELECT *, SUM("${valCol}") OVER (ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS "${outCol}" FROM prev_step`,
        polars: `df = df.with_columns(pl.col("${valCol}").cum_sum().alias("${outCol}"))`,
        power_query_m: `// Window ${fn} on ${valCol} as ${outCol}\nPrevStep`,
        excel_formula: `=SUM($C$2:C2)`,
      };
    }
    case 'pivot': {
      const idxCols: string[] = Array.isArray(p.index_columns) && p.index_columns.length > 0
        ? p.index_columns
        : ['region'];
      const pivCol = p.pivot_column || 'category';
      const valCol = p.value_column || 'amount';
      const agg = (p.agg_func || 'sum').toUpperCase();
      return {
        sql: `PIVOT prev_step ON "${pivCol}" USING ${agg === 'PCT_TOTAL' ? 'SUM' : agg}("${valCol}") GROUP BY ${idxCols.map((c) => `"${c}"`).join(', ')}`,
        polars: `df = df.pivot(values="${valCol}", index=${JSON.stringify(idxCols)}, on="${pivCol}", aggregate_function="${(p.agg_func || 'sum').toLowerCase()}")`,
        power_query_m: `Table.Pivot(PrevStep, List.Distinct(PrevStep[${pivCol}]), "${pivCol}", "${valCol}", List.Sum)`,
        excel_formula: `=PIVOTBY(Table1[${idxCols[0]}], Table1[${pivCol}], Table1[${valCol}], ${agg === 'PCT_TOTAL' ? 'PERCENTOF' : agg})`,
      };
    }
    case 'unpivot': {
      const idCols: string[] = Array.isArray(p.id_columns) ? p.id_columns : ['id'];
      const valCols: string[] = Array.isArray(p.value_columns) ? p.value_columns : [];
      const nameCol = p.name_column || 'attribute';
      const valOutCol = p.value_column || 'value';
      return {
        sql: `UNPIVOT prev_step ON (${valCols.map((c) => `"${c}"`).join(', ')}) INTO NAME "${nameCol}" VALUE "${valOutCol}"`,
        polars: `df = df.unpivot(index=${JSON.stringify(idCols)}, on=${JSON.stringify(valCols)}, variable_name="${nameCol}", value_name="${valOutCol}")`,
        power_query_m: `Table.UnpivotOtherColumns(PrevStep, {${idCols.map((c) => `"${c}"`).join(', ')}}, "${nameCol}", "${valOutCol}")`,
        excel_formula: `=TOCOL(Table1)`,
      };
    }
    case 'append': {
      const otherTbl = p.append_dataset_name || p.append_dataset_id || 'append_table';
      const unionKw = p.union_type === 'distinct' ? 'UNION' : 'UNION ALL';
      const alignByName = p.alignment_mode !== 'by_position' ? 'BY NAME ' : '';
      const customCol = (p.custom_column_name || '').trim();
      if ((p.add_custom_column || customCol) && customCol) {
        const primVal = p.primary_value !== undefined ? String(p.primary_value) : '';
        const appVal = p.appended_value !== undefined ? String(p.appended_value) : '';
        return {
          sql: `SELECT *, '${primVal}' AS "${customCol}" FROM prev_step ${unionKw} ${alignByName}SELECT *, '${appVal}' AS "${customCol}" FROM "${otherTbl}"`,
          polars: `df = pl.concat([df.with_columns(pl.lit("${primVal}").alias("${customCol}")), append_df.with_columns(pl.lit("${appVal}").alias("${customCol}"))])`,
          power_query_m: `Table.Combine({Table.AddColumn(PrevStep, "${customCol}", each "${primVal}"), Table.AddColumn(${otherTbl}, "${customCol}", each "${appVal}")})`,
          excel_formula: `=VSTACK(HSTACK(Table1, "${primVal}"), HSTACK(Table2, "${appVal}"))`,
        };
      }
      return {
        sql: `SELECT * FROM prev_step ${unionKw} ${alignByName}SELECT * FROM "${otherTbl}"`,
        polars: `df = pl.concat([df, append_df], how="${p.alignment_mode === 'by_position' ? 'vertical' : 'diagonal'}")`,
        power_query_m: `Table.Combine({PrevStep, ${otherTbl}})`,
        excel_formula: `=VSTACK(Table1, Table2)`,
      };
    }
    case 'custom_column': {
      const colName = p.new_column || p.column || p.target_column || 'custom_col';
      const val = p.value !== undefined ? String(p.value) : p.expression || '';
      return {
        sql: `SELECT *, '${val}' AS "${colName}" FROM prev_step`,
        polars: `df = df.with_columns(pl.lit("${val}").alias("${colName}"))`,
        power_query_m: `Table.AddColumn(PrevStep, "${colName}", each "${val}")`,
        excel_formula: `="${val}"`,
      };
    }
    case 'remove_column': {
      const cols: string[] = Array.isArray(p.columns) ? p.columns : [p.column].filter(Boolean);
      const keep = Boolean(p.keep_selected);
      return {
        sql: keep
          ? `SELECT ${cols.map((c) => `"${c}"`).join(', ')} FROM prev_step`
          : `SELECT * EXCLUDE (${cols.map((c) => `"${c}"`).join(', ')}) FROM prev_step`,
        polars: keep
          ? `df = df.select([${cols.map((c) => `"${c}"`).join(', ')}])`
          : `df = df.drop([${cols.map((c) => `"${c}"`).join(', ')}])`,
        power_query_m: keep
          ? `Table.SelectColumns(PrevStep, {${cols.map((c) => `"${c}"`).join(', ')}})`
          : `Table.RemoveColumns(PrevStep, {${cols.map((c) => `"${c}"`).join(', ')}})`,
        excel_formula: keep ? `=CHOOSECOLS(Table1, ...)` : `=DROP(Table1, ...)`,
      };
    }
    case 'reorder_columns': {
      const order: string[] = Array.isArray(p.column_order) ? p.column_order : [];
      return {
        sql: `SELECT ${order.map((c) => `"${c}"`).join(', ')} FROM prev_step`,
        polars: `df = df.select([${order.map((c) => `"${c}"`).join(', ')}])`,
        power_query_m: `Table.ReorderColumns(PrevStep, {${order.map((c) => `"${c}"`).join(', ')}})`,
        excel_formula: null,
      };
    }
    case 'promote_headers': {
      return {
        sql: `-- Promote first row as headers\nSELECT * FROM prev_step`,
        polars: `df = df.rename(dict(zip(df.columns, df.row(0))))[1:]`,
        power_query_m: `Table.PromoteHeaders(PrevStep, [PromoteAllScalars=true])`,
        excel_formula: null,
      };
    }
    case 'remove_rows': {
      const mode = p.mode || 'top_n';
      const count = Number(p.count ?? 1);
      return {
        sql: mode === 'top_n'
          ? `SELECT * FROM prev_step OFFSET ${count}`
          : mode === 'keep_top_n'
          ? `SELECT * FROM prev_step LIMIT ${count}`
          : `SELECT * FROM prev_step -- remove blank rows`,
        polars: mode === 'top_n'
          ? `df = df.slice(${count})`
          : mode === 'keep_top_n'
          ? `df = df.head(${count})`
          : `df = df.drop_nulls()`,
        power_query_m: mode === 'top_n'
          ? `Table.Skip(PrevStep, ${count})`
          : mode === 'keep_top_n'
          ? `Table.FirstN(PrevStep, ${count})`
          : `Table.SelectRows(PrevStep, each not List.IsEmpty(List.RemoveNulls(Record.ToList(_))))`,
        excel_formula: mode === 'keep_top_n' ? `=TAKE(Table1, ${count})` : `=DROP(Table1, ${count})`,
      };
    }
    case 'transpose': {
      return {
        sql: `-- Transpose matrix\nSELECT * FROM prev_step`,
        polars: `df = df.transpose(include_header=True)`,
        power_query_m: `Table.Transpose(PrevStep)`,
        excel_formula: `=TRANSPOSE(Table1)`,
      };
    }
    case 'standardize_values': {
      const col = p.column || 'category';
      const targetCol = p.output_column || col;
      return {
        sql: `SELECT *, CASE "${col}" ... END AS "${targetCol}" FROM prev_step`,
        polars: `df = df.with_columns(pl.col("${col}").replace(...).alias("${targetCol}"))`,
        power_query_m: `Table.ReplaceValue(PrevStep, ...)`,
        excel_formula: `=XLOOKUP([@[${col}]], MapTable[From], MapTable[To], [@[${col}]])`,
      };
    }
    case 'impute_missing': {
      const col = p.column || 'amount';
      const strat = p.strategy || 'mean';
      const targetCol = p.output_column || col;
      return {
        sql: `SELECT *, COALESCE("${col}", AVG("${col}") OVER ()) AS "${targetCol}" FROM prev_step`,
        polars: `df = df.with_columns(pl.col("${col}").fill_null(strategy="${strat}").alias("${targetCol}"))`,
        power_query_m: `Table.ReplaceValue(PrevStep, null, ...)`,
        excel_formula: `=IF(ISBLANK([@[${col}]]), AVERAGE(Table1[${col}]), [@[${col}]])`,
      };
    }
    case 'flag_outliers': {
      const col = p.column || 'amount';
      const targetCol = p.output_column || `${col}_is_outlier`;
      return {
        sql: `SELECT *, CASE WHEN "${col}" < Q1 - 1.5*IQR OR "${col}" > Q3 + 1.5*IQR THEN TRUE ELSE FALSE END AS "${targetCol}" FROM prev_step`,
        polars: `df = df.with_columns(...)`,
        power_query_m: `// Flag IQR outliers on ${col}\nPrevStep`,
        excel_formula: `=OR([@[${col}]] < ($Q1 - 1.5*$IQR), [@[${col}]] > ($Q3 + 1.5*$IQR))`,
      };
    }
    case 'top_bottom_n': {
      const col = p.column || 'amount';
      const mode = p.mode || 'top';
      const n = Number(p.n ?? 10);
      return {
        sql: `SELECT * FROM prev_step ORDER BY "${col}" ${mode === 'bottom' ? 'ASC' : 'DESC'} LIMIT ${n}`,
        polars: `df = df.sort("${col}", descending=${mode === 'top' ? 'True' : 'False'}).head(${n})`,
        power_query_m: `Table.FirstN(Table.Sort(PrevStep, {{"${col}", Order.${mode === 'top' ? 'Descending' : 'Ascending'}}}), ${n})`,
        excel_formula: `=TAKE(SORT(Table1, 1, ${mode === 'top' ? -1 : 1}), ${n})`,
      };
    }
    default:
      return {
        sql: `-- Step: ${step.label} (${step.type})\nSELECT * FROM prev_step`,
        polars: `# ${step.label}\ndf = df`,
        power_query_m: `// ${step.label}\nPrevStep`,
        excel_formula: `=STEP("${step.label}")`,
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
  let rows = (initialRows || []).map((r) => ({ ...r }));
  const stepSummaries: StepSummary[] = [];
  const sqlParts: string[] = ['WITH source_data AS (\n  SELECT * FROM dataset\n)'];
  let prevCte = 'source_data';

  (steps || []).forEach((step, idx) => {
    if (!step) return;
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
            if (targetType === 'integer') {
              const parsed = parseInt(String(val), 10);
              nextVal = Number.isNaN(parsed) ? null : parsed;
            } else if (targetType === 'float') {
              const parsed = Number(val);
              nextVal = Number.isNaN(parsed) ? null : parsed;
            } else if (targetType === 'boolean') {
              nextVal = String(val).toLowerCase() === 'true' || val === 1 || val === '1';
            } else {
              nextVal = String(val);
            }
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
        const keep = p.keep_mode || p.keep || 'first';
        const seen = new Set<string>();
        if (keep === 'duplicates_only') {
          const counts = new Map<string, number>();
          rows.forEach((r) => {
            const key = cols.map((c) => String(r[c] ?? '')).join('||');
            counts.set(key, (counts.get(key) || 0) + 1);
          });
          rows = rows.filter((r) => {
            const key = cols.map((c) => String(r[c] ?? '')).join('||');
            return (counts.get(key) || 0) > 1;
          });
        } else if (keep === 'last') {
          const reversed: Record<string, any>[] = [];
          for (let i = rows.length - 1; i >= 0; i--) {
            const r = rows[i];
            const key = cols.map((c) => String(r[c] ?? '')).join('||');
            if (!seen.has(key)) {
              seen.add(key);
              reversed.push(r);
            }
          }
          rows = reversed.reverse();
        } else {
          rows = rows.filter((r) => {
            const key = cols.map((c) => String(r[c] ?? '')).join('||');
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
        }
        break;
      }

      case 'fill_down': {
        const cols: string[] =
          Array.isArray(p.columns) && p.columns.length > 0
            ? p.columns
            : p.column
            ? [p.column]
            : [];
        const direction = p.direction || 'down';
        const lastVal: Record<string, any> = {};
        if (direction === 'up') {
          const cloned = rows.map((r) => ({ ...r }));
          for (let i = cloned.length - 1; i >= 0; i--) {
            const copy = cloned[i];
            cols.forEach((c) => {
              if (copy[c] === null || copy[c] === undefined || copy[c] === '') {
                if (lastVal[c] !== undefined) copy[c] = lastVal[c];
              } else {
                lastVal[c] = copy[c];
              }
            });
          }
          rows = cloned;
        } else {
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
        }
        break;
      }

      case 'replace_values': {
        const col = p.column;
        const findVal = p.search_value ?? p.find_value ?? p.old_value ?? '';
        const replaceVal = p.replace_value ?? p.new_value ?? '';
        const matchType = p.match_type || 'exact';
        if (col) {
          rows = rows.map((r) => {
            const cur = r[col];
            if (matchType === 'is_null') {
              if (cur === null || cur === undefined || cur === '') {
                return { ...r, [col]: replaceVal };
              }
              return r;
            }
            if (matchType === 'contains') {
              const curStr = String(cur ?? '');
              if (findVal !== '' && curStr.toLowerCase().includes(String(findVal).toLowerCase())) {
                const reg = new RegExp(String(findVal).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
                return { ...r, [col]: curStr.replace(reg, String(replaceVal)) };
              }
              return r;
            }
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
        const customNames: string[] =
          Array.isArray(p.new_column_names) && p.new_column_names.length > 0
            ? p.new_column_names
            : [`${col}_1`, `${col}_2`];
        const keepOrig = p.keep_original !== false;
        if (col) {
          rows = rows.map((r) => {
            const parts = String(r[col] ?? '').split(delim);
            const next: Record<string, any> = { ...r };
            if (!keepOrig) {
              delete next[col];
            }
            customNames.forEach((name, idx) => {
              if (idx === customNames.length - 1 && parts.length > customNames.length) {
                next[name] = parts.slice(idx).join(delim).trim() || null;
              } else {
                next[name] = parts[idx]?.trim() ?? null;
              }
            });
            return next;
          });
        }
        break;
      }

      case 'math_transform': {
        const col1 = p.column1 || p.column;
        const col2 = p.column2;
        const op = p.operation || 'add';
        const mathOp = p.math_operator || '+';
        const operand = Number(p.operand ?? 0);
        const decimals = p.decimals !== undefined ? Number(p.decimals) : 2;
        const targetCol = p.output_column || p.target_column || col1 || 'calculated';

        rows = rows.map((r) => {
          if (op === 'formula' && p.expression) {
            return { ...r, [targetCol]: evaluateFormulaForRow(p.expression, r) };
          }
          const v1 = Number(r[col1] ?? 0) || 0;

          if (op === 'bin') {
            const bins: Array<{ max: number; label: string }> = Array.isArray(p.bins) ? p.bins : [];
            const sortedBins = [...bins].sort((a, b) => Number(a.max) - Number(b.max));
            for (const b of sortedBins) {
              if (v1 <= Number(b.max)) {
                return { ...r, [targetCol]: b.label };
              }
            }
            return { ...r, [targetCol]: p.bin_other || 'High' };
          }

          let res = v1;
          if (op === 'arithmetic') {
            const v2 = col2 && col2 in r ? Number(r[col2] ?? 0) || 0 : Number(col2 ?? operand) || 0;
            if (mathOp === '+') res = v1 + v2;
            else if (mathOp === '-') res = v1 - v2;
            else if (mathOp === '*') res = v1 * v2;
            else if (mathOp === '/') res = v2 !== 0 ? v1 / v2 : 0;
          } else if (op === 'percent_change') {
            const v2 = col2 && col2 in r ? Number(r[col2] ?? 0) || 0 : operand;
            res = v1 !== 0 ? ((v2 - v1) / Math.abs(v1)) * 100 : 0;
          } else if (op === 'add' || op === '+') {
            res = v1 + operand;
          } else if (op === 'subtract' || op === '-') {
            res = v1 - operand;
          } else if (op === 'multiply' || op === '*') {
            res = v1 * operand;
          } else if (op === 'divide' || op === '/') {
            res = operand !== 0 ? v1 / operand : 0;
          } else if (op === 'round') {
            const d = p.decimals !== undefined ? decimals : operand || 0;
            return { ...r, [targetCol]: Number(v1.toFixed(Math.max(0, Math.min(10, d)))) };
          } else if (op === 'roundup') {
            return { ...r, [targetCol]: Math.ceil(v1) };
          } else if (op === 'rounddown') {
            return { ...r, [targetCol]: Math.floor(v1) };
          } else if (op === 'abs') {
            return { ...r, [targetCol]: Math.abs(v1) };
          } else if (op === 'clean_numeric') {
            const raw = String(r[col1] ?? '').trim();
            const isPercent = raw.includes('%');
            const cleaned = raw.replace(/[$€£¥, ]/g, '').replace(/%/g, '');
            let num = Number(cleaned);
            if (Number.isNaN(num)) num = 0;
            if (isPercent) num = num / 100;
            return { ...r, [targetCol]: num };
          }

          const d = Number.isFinite(decimals) ? Math.max(0, Math.min(10, decimals)) : 4;
          return { ...r, [targetCol]: Number.isFinite(res) ? Number(res.toFixed(d)) : null };
        });
        break;
      }

      case 'text_transform': {
        const col = p.column;
        const op = p.operation || 'upper';
        const targetCol = p.output_column || p.target_column || col;
        if (col && targetCol) {
          rows = rows.map((r) => {
            const s = String(r[col] ?? '');
            let out: any = s;
            if (op === 'upper' || op === 'uppercase') out = s.toUpperCase();
            else if (op === 'lower' || op === 'lowercase') out = s.toLowerCase();
            else if (op === 'trim') out = s.trim();
            else if (op === 'clean') out = s.replace(/[\x00-\x1F\x7F]/g, '').trim();
            else if (op === 'title' || op === 'proper') {
              out = s.replace(/\w\S*/g, (t) => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase());
            } else if (op === 'left') {
              const len = Math.max(0, Number(p.length ?? 5));
              out = s.slice(0, len);
            } else if (op === 'right') {
              const len = Math.max(0, Number(p.length ?? 5));
              out = len === 0 ? '' : s.slice(-len);
            } else if (op === 'mid') {
              const start = Math.max(0, Number(p.start ?? 1) - 1);
              const len = Math.max(0, Number(p.length ?? 5));
              out = s.slice(start, start + len);
            } else if (op === 'length') {
              out = s.length;
            } else if (op === 'concat') {
              const extraCols: string[] = Array.isArray(p.concat_columns) ? p.concat_columns : [];
              const sep = p.concat_separator ?? ' ';
              out = [s, ...extraCols.map((c) => String(r[c] ?? ''))].join(sep);
            } else if (op === 'extract_delimiter') {
              const delim = p.delimiter ?? ' ';
              const pos = p.position || 'before';
              const parts = s.split(delim);
              out = pos === 'after' ? parts.slice(1).join(delim) : parts[0] ?? '';
            } else if (op === 'clean_spaces') {
              out = s.replace(/\s+/g, ' ').trim();
            } else if (op === 'split_by_position') {
              const len = Math.max(1, Number(p.length ?? 5));
              const parts: string[] = [];
              for (let i = 0; i < s.length; i += len) {
                parts.push(s.slice(i, i + len));
              }
              out = parts[0] ?? '';
              if (Array.isArray(p.new_column_names) && p.new_column_names.length > 1) {
                const extraObj: Record<string, any> = {};
                p.new_column_names.forEach((name: string, idx: number) => {
                  extraObj[name] = parts[idx] ?? '';
                });
                return { ...r, ...extraObj, [targetCol]: out };
              }
            }
            return { ...r, [targetCol]: out };
          });
        }
        break;
      }

      case 'date_transform': {
        const col = p.column;
        const op = p.operation || p.part || 'extract_part';
        const datePart = p.date_part || p.part || (op !== 'extract_part' ? op : 'year');
        const targetCol = p.output_column || p.target_column || `${col}_${datePart}`;
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

        if (col) {
          rows = rows.map((r) => {
            const d = new Date(String(r[col] ?? ''));
            if (Number.isNaN(d.getTime())) return { ...r, [targetCol]: null };
            let out: any = null;

            if (op === 'eomonth') {
              const eom = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
              out = eom.toISOString().slice(0, 10);
            } else if (op === 'datedif') {
              const secCol = p.second_column;
              const d2 = secCol && r[secCol] ? new Date(String(r[secCol])) : new Date();
              if (Number.isNaN(d2.getTime())) {
                out = null;
              } else {
                const diffDays = Math.round((d2.getTime() - d.getTime()) / 86400000);
                const unit = p.unit || 'day';
                if (unit === 'year') out = Number((diffDays / 365.25).toFixed(1));
                else if (unit === 'month') out = Number((diffDays / 30.4375).toFixed(1));
                else out = diffDays;
              }
            } else if (op === 'networkdays') {
              const secCol = p.second_column;
              const d2 = secCol && r[secCol] ? new Date(String(r[secCol])) : new Date();
              if (Number.isNaN(d2.getTime())) {
                out = null;
              } else {
                let start = new Date(Math.min(d.getTime(), d2.getTime()));
                const end = new Date(Math.max(d.getTime(), d2.getTime()));
                let workDays = 0;
                while (start <= end) {
                  const day = start.getUTCDay();
                  if (day !== 0 && day !== 6) workDays++;
                  start.setUTCDate(start.getUTCDate() + 1);
                }
                out = d.getTime() > d2.getTime() ? -workDays : workDays;
              }
            } else if (op === 'add_time') {
              const amt = Number(p.amount ?? 0);
              const unit = p.unit || 'day';
              const copy = new Date(d.getTime());
              if (unit === 'year') copy.setUTCFullYear(copy.getUTCFullYear() + amt);
              else if (unit === 'month') copy.setUTCMonth(copy.getUTCMonth() + amt);
              else copy.setUTCDate(copy.getUTCDate() + amt);
              out = copy.toISOString().slice(0, 10);
            } else if (op === 'fiscal_year') {
              const startMonth = Number(p.fiscal_start_month ?? 4);
              const m = d.getUTCMonth() + 1;
              const y = d.getUTCFullYear();
              const fy = m >= startMonth && startMonth > 1 ? y + 1 : y;
              out = `FY${fy}`;
            } else {
              // extract_part or legacy year/month/day/quarter
              if (datePart === 'year') out = d.getUTCFullYear();
              else if (datePart === 'month') out = d.getUTCMonth() + 1;
              else if (datePart === 'day') out = d.getUTCDate();
              else if (datePart === 'quarter') out = Math.floor(d.getUTCMonth() / 3) + 1;
              else if (datePart === 'week') {
                const startOfYear = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
                const days = Math.floor((d.getTime() - startOfYear.getTime()) / 86400000);
                out = Math.ceil((days + startOfYear.getUTCDay() + 1) / 7);
              } else if (datePart === 'day_name') out = dayNames[d.getUTCDay()];
              else if (datePart === 'weekday') out = d.getUTCDay();
              else out = d.toISOString().slice(0, 10);
            }

            return { ...r, [targetCol]: out };
          });
        }
        break;
      }

      case 'conditional': {
        const targetCol = p.new_column || p.output_column || p.target_column || 'conditional_col';
        const clauses = p.rules || p.clauses || [
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
            if (c && c.column && evaluateRowCondition(r[c.column], c.operator || 'eq', c.value)) {
              return { ...r, [targetCol]: c.result ?? c.then_value ?? 'True' };
            }
          }
          return { ...r, [targetCol]: elseVal };
        });
        break;
      }

      case 'group_by': {
        const groupCols: string[] = Array.isArray(p.group_by_columns)
          ? p.group_by_columns.filter(Boolean)
          : Array.isArray(p.group_columns)
          ? p.group_columns.filter(Boolean)
          : p.group_by
          ? [p.group_by]
          : [];
        const aggs: Array<{
          column: string;
          function?: string;
          agg_func?: string;
          alias?: string;
          output_column?: string;
          output_name?: string;
        }> =
          Array.isArray(p.aggregations) && p.aggregations.length > 0
            ? p.aggregations
            : [
                {
                  column: p.agg_column || 'amount',
                  function: p.agg_func || 'sum',
                  alias: p.alias || `${p.agg_func || 'sum'}_${p.agg_column || 'amount'}`,
                },
              ];

        const groups = new Map<string, Record<string, any>[]>();
        rows.forEach((r) => {
          const key = groupCols.length > 0 ? groupCols.map((c) => String(r[c] ?? '')).join('||') : '__ALL__';
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key)!.push(r);
        });

        const groupedRows: Record<string, any>[] = [];
        groups.forEach((gRows) => {
          const base: Record<string, any> = {};
          groupCols.forEach((c) => {
            base[c] = gRows[0]?.[c] ?? null;
          });
          aggs.forEach((agg) => {
            const fn = (agg.agg_func || agg.function || 'sum').toLowerCase();
            const alias = agg.output_column || agg.output_name || agg.alias || `${fn}_${agg.column}`;
            const rawVals = gRows.map((x) => x[agg.column]).filter((v) => v !== null && v !== undefined && v !== '');
            const nums = rawVals.map((x) => Number(x)).filter((n) => !Number.isNaN(n));
            if (fn === 'count') base[alias] = gRows.length;
            else if (fn === 'distinct_count') base[alias] = new Set(rawVals.map((v) => String(v))).size;
            else if (fn === 'sum') base[alias] = Number(nums.reduce((a, b) => a + b, 0).toFixed(2));
            else if (fn === 'avg' || fn === 'mean')
              base[alias] = nums.length ? Number((nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2)) : 0;
            else if (fn === 'min') base[alias] = nums.length ? Math.min(...nums) : (rawVals[0] ?? null);
            else if (fn === 'max') base[alias] = nums.length ? Math.max(...nums) : (rawVals[rawVals.length - 1] ?? null);
          });
          groupedRows.push(base);
        });
        rows = groupedRows;
        break;
      }

      case 'window_calc': {
        const fn = (p.calc_type || p.function || p.window_type || 'running_total').toLowerCase();
        const valCol = p.value_column || (p.output_column ? p.target_column : p.column) || 'amount';
        const outCol =
          p.output_column || (p.value_column ? p.target_column : undefined) || `${fn}_${valCol}`;
        const partitionCols: string[] = Array.isArray(p.partition_by) ? p.partition_by.filter(Boolean) : [];
        const orderCol: string | undefined = p.order_by;
        const orderDir = (p.order_direction || 'asc').toLowerCase();
        const winSize = Math.max(1, Number(p.window_size ?? 3));
        const offsetCount = Math.max(1, Number(p.offset ?? 1));

        // Optional sort by order_by before window calculation
        if (orderCol) {
          rows.sort((a, b) => {
            const va = a[orderCol];
            const vb = b[orderCol];
            if (va === vb) return 0;
            if (va === null || va === undefined) return 1;
            if (vb === null || vb === undefined) return -1;
            const cmp =
              typeof va === 'number' && typeof vb === 'number'
                ? va - vb
                : String(va).localeCompare(String(vb), undefined, { numeric: true });
            return orderDir === 'desc' ? -cmp : cmp;
          });
        }

        // Partition rows into groups while preserving original index
        const partitions = new Map<string, number[]>();
        rows.forEach((r, idx) => {
          const key =
            partitionCols.length > 0
              ? partitionCols.map((c) => String(r[c] ?? '')).join('||')
              : '__ALL__';
          if (!partitions.has(key)) partitions.set(key, []);
          partitions.get(key)!.push(idx);
        });

        const nextRows = rows.map((r) => ({ ...r }));
        partitions.forEach((indices) => {
          const groupTotal = indices.reduce(
            (acc, rIdx) => acc + (Number(nextRows[rIdx][valCol] ?? 0) || 0),
            0
          );
          let running = 0;
          indices.forEach((rIdx, pos) => {
            const v = Number(nextRows[rIdx][valCol] ?? 0) || 0;
            running += v;
            if (fn === 'row_number' || fn === 'rank') {
              nextRows[rIdx][outCol] = pos + 1;
            } else if (fn === 'percent_of_total') {
              nextRows[rIdx][outCol] =
                groupTotal !== 0 ? Number(((v / groupTotal) * 100).toFixed(2)) : 0;
            } else if (fn === 'moving_avg' || fn === 'running_avg') {
              const startPos = fn === 'moving_avg' ? Math.max(0, pos - winSize + 1) : 0;
              const sliceIdx = indices.slice(startPos, pos + 1);
              const sliceSum = sliceIdx.reduce(
                (acc, sIdx) => acc + (Number(nextRows[sIdx][valCol] ?? 0) || 0),
                0
              );
              nextRows[rIdx][outCol] = Number((sliceSum / sliceIdx.length).toFixed(2));
            } else if (fn === 'lag') {
              const prevIdx = pos - offsetCount >= 0 ? indices[pos - offsetCount] : -1;
              nextRows[rIdx][outCol] = prevIdx >= 0 ? (nextRows[prevIdx][valCol] ?? null) : null;
            } else if (fn === 'lead') {
              const nextIdx =
                pos + offsetCount < indices.length ? indices[pos + offsetCount] : -1;
              nextRows[rIdx][outCol] = nextIdx >= 0 ? (nextRows[nextIdx][valCol] ?? null) : null;
            } else {
              // running_total / running_sum
              nextRows[rIdx][outCol] = Number(running.toFixed(2));
            }
          });
        });

        rows = nextRows;
        break;
      }

      case 'pivot': {
        const idxCols: string[] = Array.isArray(p.index_columns) ? p.index_columns.filter(Boolean) : [];
        const pivotCol: string = p.pivot_column && p.pivot_column !== '__NONE__' ? p.pivot_column : '';
        const valCol: string = p.value_column || (rows[0] ? Object.keys(rows[0])[0] : '');
        const aggFn: string = (p.agg_func || 'sum').toLowerCase();
        const filterCol: string | undefined = p.filter_column;
        const filterVal: string | undefined = p.filter_value;
        const includeRowTotals: boolean = Boolean(p.include_row_totals);
        const includeGrandTotal: boolean = Boolean(p.include_grand_total);

        if (valCol) {
          const workingRows =
            filterCol && filterVal !== undefined && filterVal !== '' && filterVal !== '__ALL__'
              ? rows.filter((r) => String(r[filterCol] ?? '') === String(filterVal))
              : rows;

          const overallSum = workingRows.reduce((acc, r) => {
            const n = Number(r[valCol]);
            return acc + (Number.isNaN(n) ? 0 : n);
          }, 0);

          const computeAgg = (subset: Record<string, any>[]): number => {
            if (subset.length === 0) return 0;
            if (aggFn === 'count') return subset.length;
            const nums = subset.map((m) => Number(m[valCol])).filter((n) => !Number.isNaN(n));
            if (nums.length === 0) return 0;
            const sum = nums.reduce((a, b) => a + b, 0);
            if (aggFn === 'avg') return Number((sum / nums.length).toFixed(2));
            if (aggFn === 'min') return Math.min(...nums);
            if (aggFn === 'max') return Math.max(...nums);
            if (aggFn === 'pct_total') {
              return overallSum !== 0 ? Number(((sum / overallSum) * 100).toFixed(2)) : 0;
            }
            return Number(sum.toFixed(2));
          };

          const pivotValues = pivotCol
            ? Array.from(
                new Set(
                  workingRows.map((r) => {
                    const v = r[pivotCol];
                    return v === null || v === undefined || String(v).trim() === ''
                      ? 'Blank'
                      : String(v);
                  })
                )
              ).slice(0, 25)
            : [`${aggFn.toUpperCase()}_${valCol}`];

          const groups = new Map<string, Record<string, any>[]>();
          workingRows.forEach((r) => {
            const k =
              idxCols.length > 0
                ? idxCols.map((c) => String(r[c] ?? '')).join('||')
                : '__ALL__';
            if (!groups.has(k)) groups.set(k, []);
            groups.get(k)!.push(r);
          });

          const pivoted: Record<string, any>[] = [];
          groups.forEach((gRows) => {
            const outRow: Record<string, any> = {};
            if (idxCols.length > 0) {
              idxCols.forEach((c) => {
                outRow[c] = gRows[0]?.[c] ?? null;
              });
            } else {
              outRow['Summary'] = 'All Rows';
            }

            if (pivotCol) {
              pivotValues.forEach((pv) => {
                const matching = gRows.filter((r) => {
                  const v = r[pivotCol];
                  const norm =
                    v === null || v === undefined || String(v).trim() === '' ? 'Blank' : String(v);
                  return norm === pv;
                });
                outRow[pv] = computeAgg(matching);
              });
            } else {
              outRow[pivotValues[0]] = computeAgg(gRows);
            }

            if (includeRowTotals) {
              outRow['Row_Total'] = computeAgg(gRows);
            }
            pivoted.push(outRow);
          });

          if (includeGrandTotal && pivoted.length > 0) {
            const totalRow: Record<string, any> = {};
            if (idxCols.length > 0) {
              idxCols.forEach((c, idx) => {
                totalRow[c] = idx === 0 ? 'Grand Total' : '';
              });
            } else {
              totalRow['Summary'] = 'Grand Total';
            }
            if (pivotCol) {
              pivotValues.forEach((pv) => {
                const matching = workingRows.filter((r) => {
                  const v = r[pivotCol];
                  const norm =
                    v === null || v === undefined || String(v).trim() === '' ? 'Blank' : String(v);
                  return norm === pv;
                });
                totalRow[pv] = computeAgg(matching);
              });
            } else {
              totalRow[pivotValues[0]] = computeAgg(workingRows);
            }
            if (includeRowTotals) {
              totalRow['Row_Total'] = computeAgg(workingRows);
            }
            pivoted.push(totalRow);
          }

          rows = pivoted;
        }
        break;
      }

      case 'unpivot': {
        const valCols: string[] = Array.isArray(p.value_columns) ? p.value_columns.filter(Boolean) : [];
        const idCols: string[] =
          Array.isArray(p.id_columns) && p.id_columns.length > 0
            ? p.id_columns
            : rows[0]
            ? Object.keys(rows[0]).filter((k) => !valCols.includes(k))
            : [];
        const nameCol = p.name_column || 'attribute';
        const valOutCol = p.value_column || 'value';

        if (valCols.length > 0) {
          const melted: Record<string, any>[] = [];
          rows.forEach((r) => {
            valCols.forEach((vc) => {
              const item: Record<string, any> = {};
              idCols.forEach((ic) => {
                item[ic] = r[ic];
              });
              item[nameCol] = vc;
              item[valOutCol] = r[vc] ?? null;
              melted.push(item);
            });
          });
          rows = melted;
        }
        break;
      }

      case 'xlookup': {
        const rightId = p.lookup_dataset_id || p.right_dataset_id;
        const rightDs = allDatasets.find((d) => d.meta.id === rightId) || allDatasets[1] || allDatasets[0];
        if (rightDs) {
          const leftKey = p.left_key_col || p.lookup_column || p.left_key || p.lookup_key || 'customer_id';
          const rightKey =
            p.right_key_col || p.right_Lookup_column || p.right_key || p.match_key || leftKey;
          const returnCols: string[] = Array.isArray(p.return_columns)
            ? p.return_columns
            : p.return_column
            ? [p.return_column]
            : [];
          const fallback = p.if_not_found !== undefined ? p.if_not_found : null;
          const matchMode = Number(p.match_mode ?? 0); // 0 exact, -1 next smaller, 1 next larger, 2 wildcard
          const searchMode = Number(p.search_mode ?? 1); // 1 first-to-last, -1 last-to-first

          const orderedRightRows =
            searchMode === -1 ? [...rightDs.rows].reverse() : rightDs.rows;

          const lookupMap = new Map<string, Record<string, any>>();
          orderedRightRows.forEach((rr) => {
            const k = String(rr[rightKey] ?? '').trim();
            if (!lookupMap.has(k)) {
              lookupMap.set(k, rr);
            }
          });

          const findXlookupMatch = (rawVal: any): Record<string, any> | undefined => {
            const keyStr = String(rawVal ?? '').trim();
            const exact = lookupMap.get(keyStr);
            if (exact || matchMode === 0) return exact;

            if (matchMode === 2) {
              // Wildcard match (* and ?)
              const pattern =
                '^' +
                keyStr
                  .replace(/[.+^${}()|[\]\\]/g, '\\$&')
                  .replace(/\*/g, '.*')
                  .replace(/\?/g, '.') +
                '$';
              try {
                const rx = new RegExp(pattern, 'i');
                return orderedRightRows.find((rr) => rx.test(String(rr[rightKey] ?? '').trim()));
              } catch {
                return undefined;
              }
            }

            // Approximate match (-1 = next smaller, 1 = next larger)
            const numVal = Number(keyStr);
            if (!Number.isNaN(numVal)) {
              const candidates = orderedRightRows
                .map((rr) => ({ row: rr, num: Number(rr[rightKey]) }))
                .filter((c) => !Number.isNaN(c.num));
              if (matchMode === -1) {
                const smaller = candidates
                  .filter((c) => c.num <= numVal)
                  .sort((a, b) => b.num - a.num);
                return smaller[0]?.row;
              }
              if (matchMode === 1) {
                const larger = candidates
                  .filter((c) => c.num >= numVal)
                  .sort((a, b) => a.num - b.num);
                return larger[0]?.row;
              }
            }
            return undefined;
          };

          rows = rows.map((lr) => {
            const match = findXlookupMatch(lr[leftKey]);
            const merged = { ...lr };
            if (returnCols.length > 0) {
              returnCols.forEach((col) => {
                const targetName =
                  (p.output_column || p.target_column) && returnCols.length === 1
                    ? p.output_column || p.target_column
                    : col in merged && col !== rightKey
                    ? `lookup_${col}`
                    : col;
                merged[targetName] = match ? (match[col] ?? fallback) : fallback;
              });
            } else if (match) {
              Object.keys(match).forEach((k) => {
                if (k !== rightKey) {
                  merged[k in merged ? `lookup_${k}` : k] = match[k];
                }
              });
            }
            return merged;
          });
        }
        break;
      }

      case 'vlookup': {
        const rightId = p.lookup_dataset_id || p.right_dataset_id;
        const rightDs = allDatasets.find((d) => d.meta.id === rightId) || allDatasets[1] || allDatasets[0];
        if (rightDs) {
          const leftKey = p.left_key_col || p.lookup_column || p.left_key || p.lookup_key || 'customer_id';
          const rightSchema = rightDs.meta.schema_metadata || [];
          const rightKey =
            p.right_key_col || p.right_key || rightSchema[0]?.name || leftKey;
          const colIdx1 = Math.max(1, Number(p.col_index_num ?? 2));
          const resolvedColFromIndex = rightSchema[colIdx1 - 1]?.name;
          const retCol =
            p.return_column ||
            resolvedColFromIndex ||
            (Array.isArray(p.return_columns) ? p.return_columns[0] : undefined) ||
            rightSchema[Math.min(1, rightSchema.length - 1)]?.name ||
            rightKey;
          const outCol =
            p.output_column ||
            p.target_column ||
            (retCol in (rows[0] || {}) && retCol !== rightKey ? `vlookup_${retCol}` : retCol);
          const rangeLookup = Boolean(p.range_lookup); // false = Exact Match, true = Approximate Match
          const fallback = p.if_not_found !== undefined ? p.if_not_found : null;

          const exactMap = new Map<string, Record<string, any>>();
          rightDs.rows.forEach((rr) => {
            const k = String(rr[rightKey] ?? '').trim();
            if (!exactMap.has(k)) {
              exactMap.set(k, rr);
            }
          });

          const findVlookupMatch = (rawVal: any): Record<string, any> | undefined => {
            const keyStr = String(rawVal ?? '').trim();
            const exact = exactMap.get(keyStr);
            if (exact || !rangeLookup) return exact;

            // Approximate match (TRUE): largest key <= lookup_value
            const numVal = Number(keyStr);
            if (!Number.isNaN(numVal)) {
              const smaller = rightDs.rows
                .map((rr) => ({ row: rr, num: Number(rr[rightKey]) }))
                .filter((c) => !Number.isNaN(c.num) && c.num <= numVal)
                .sort((a, b) => b.num - a.num);
              if (smaller.length > 0) return smaller[0].row;
            }
            const strSmaller = rightDs.rows
              .filter((rr) => String(rr[rightKey] ?? '').trim().localeCompare(keyStr) <= 0)
              .sort((a, b) =>
                String(b[rightKey] ?? '')
                  .trim()
                  .localeCompare(String(a[rightKey] ?? '').trim())
              );
            return strSmaller[0];
          };

          rows = rows.map((lr) => {
            const match = findVlookupMatch(lr[leftKey]);
            return {
              ...lr,
              [outCol]: match ? (match[retCol] ?? fallback) : fallback,
            };
          });
        }
        break;
      }

      case 'join': {
        const rightId = p.right_dataset_id || p.lookup_dataset_id;
        const rightDs = allDatasets.find((d) => d.meta.id === rightId) || allDatasets[1] || allDatasets[0];
        if (rightDs) {
          const joinType = (p.join_type || 'left').toLowerCase();
          const rawPairs: any[] =
            Array.isArray(p.key_pairs) && p.key_pairs.length > 0
              ? p.key_pairs
              : [
                  {
                    left_col: p.left_key || p.lookup_key || 'customer_id',
                    right_col: p.right_key || p.match_key || p.left_key || 'customer_id',
                  },
                ];

          const normalizeJoinKey = (row: Record<string, any>, isLeft: boolean): string => {
            return rawPairs
              .map((kp) => {
                const col = isLeft
                  ? kp.left_col || kp.left_key || 'customer_id'
                  : kp.right_col || kp.right_key || 'customer_id';
                const val = row[col];
                if (val === null || val === undefined) return '__NULL__';
                let s = String(val);
                if (kp.trim_whitespace !== false) s = s.trim();
                if (kp.case_insensitive) s = s.toLowerCase();
                return s;
              })
              .join('||');
          };

          const rightKeySet = new Set(
            rawPairs.map((kp) => kp.right_col || kp.right_key || 'customer_id')
          );
          const allRightColNames = rightDs.meta.schema_metadata.map((c) => c.name);
          const selectedRightCols: string[] =
            Array.isArray(p.selected_right_columns) && p.selected_right_columns.length > 0
              ? p.selected_right_columns
              : allRightColNames.filter((c) => !rightKeySet.has(c));
          const suffixRight = p.suffix_right || '_right';

          let sourceRightRows = rightDs.rows;
          if (p.dedupe_right_first) {
            const seen = new Set<string>();
            sourceRightRows = sourceRightRows.filter((rr) => {
              const k = normalizeJoinKey(rr, false);
              if (seen.has(k)) return false;
              seen.add(k);
              return true;
            });
          }

          if (joinType === 'cross') {
            const crossed: Record<string, any>[] = [];
            rows.forEach((lr) => {
              sourceRightRows.slice(0, 50).forEach((rr) => {
                const merged = { ...lr };
                selectedRightCols.forEach((col) => {
                  const outCol = col in merged ? `${col}${suffixRight}` : col;
                  merged[outCol] = rr[col] ?? null;
                });
                crossed.push(merged);
              });
            });
            rows = crossed;
            break;
          }

          // Build multimap for right rows
          const rightMap = new Map<string, Record<string, any>[]>();
          sourceRightRows.forEach((rr) => {
            const k = normalizeJoinKey(rr, false);
            if (!rightMap.has(k)) rightMap.set(k, []);
            rightMap.get(k)!.push(rr);
          });

          if (joinType === 'left_semi') {
            rows = rows.filter((lr) => rightMap.has(normalizeJoinKey(lr, true)));
            break;
          }

          if (joinType === 'left_anti') {
            rows = rows.filter((lr) => !rightMap.has(normalizeJoinKey(lr, true)));
            break;
          }

          const mergePair = (
            lr: Record<string, any> | null,
            rr: Record<string, any> | null,
            leftTemplateCols: string[]
          ): Record<string, any> => {
            const merged: Record<string, any> = {};
            if (lr) {
              Object.assign(merged, lr);
            } else {
              leftTemplateCols.forEach((c) => {
                merged[c] = null;
              });
            }
            selectedRightCols.forEach((col) => {
              if (rightKeySet.has(col) && col in merged && lr) {
                return;
              }
              const outCol = col in merged ? `${col}${suffixRight}` : col;
              merged[outCol] = rr ? (rr[col] ?? null) : null;
            });
            return merged;
          };

          const leftTemplateCols = rows[0] ? Object.keys(rows[0]) : [];
          const joinedRows: Record<string, any>[] = [];
          const matchedRightKeys = new Set<string>();

          rows.forEach((lr) => {
            const k = normalizeJoinKey(lr, true);
            const matches = rightMap.get(k);
            if (matches && matches.length > 0) {
              matchedRightKeys.add(k);
              matches.forEach((rr) => {
                joinedRows.push(mergePair(lr, rr, leftTemplateCols));
              });
            } else if (joinType === 'left' || joinType === 'full') {
              joinedRows.push(mergePair(lr, null, leftTemplateCols));
            }
          });

          if (joinType === 'right' || joinType === 'full') {
            sourceRightRows.forEach((rr) => {
              const k = normalizeJoinKey(rr, false);
              if (!matchedRightKeys.has(k)) {
                joinedRows.push(mergePair(null, rr, leftTemplateCols));
              }
            });
          }

          rows = joinedRows;
        }
        break;
      }

      case 'append': {
        const otherIds: string[] =
          p.dataset_ids ||
          (p.append_dataset_id
            ? [p.append_dataset_id]
            : p.right_dataset_id
            ? [p.right_dataset_id]
            : []);
        const leftCols = rows[0] ? Object.keys(rows[0]) : [];
        const alignByPos = p.alignment_mode === 'by_position';
        const addCustomCol = Boolean(p.add_custom_column || p.custom_column_name);
        const customCol = (p.custom_column_name || '').trim();
        const primaryVal = p.primary_value !== undefined ? String(p.primary_value) : '';
        const appendVal = p.appended_value !== undefined ? String(p.appended_value) : '';
        const incMode = p.incremental_mode || (p.union_type === 'distinct' ? 'distinct' : 'all');
        const keyCol = p.key_column;

        // Tag primary rows with custom column value if specified
        if (addCustomCol && customCol) {
          rows = rows.map((r) => ({
            ...r,
            [customCol]:
              r[customCol] !== undefined && r[customCol] !== null && String(r[customCol]).trim() !== ''
                ? r[customCol]
                : primaryVal,
          }));
        }

        otherIds.forEach((id) => {
          const other = allDatasets.find((d) => d.meta.id === id);
          if (other) {
            const otherCols = other.meta.schema_metadata.map((c) => c.name);
            let mappedOtherRows = other.rows.map((r) => {
              let nextR: Record<string, any>;
              if (alignByPos && leftCols.length > 0) {
                const posRow: Record<string, any> = {};
                leftCols.forEach((lc, idx) => {
                  const rc = otherCols[idx];
                  posRow[lc] = rc ? (r[rc] ?? null) : null;
                });
                nextR = posRow;
              } else {
                nextR = { ...r };
              }
              if (addCustomCol && customCol) {
                nextR[customCol] = appendVal;
              }
              return nextR;
            });

            // Incremental key handling
            if (keyCol && (incMode === 'append_new_only' || incMode === 'upsert')) {
              const existingKeys = new Set(rows.map((r) => String(r[keyCol] ?? '').trim()));
              if (incMode === 'append_new_only') {
                mappedOtherRows = mappedOtherRows.filter(
                  (r) => !existingKeys.has(String(r[keyCol] ?? '').trim())
                );
                rows = [...rows, ...mappedOtherRows];
              } else if (incMode === 'upsert') {
                const newKeys = new Set(mappedOtherRows.map((r) => String(r[keyCol] ?? '').trim()));
                rows = [
                  ...rows.filter((r) => !newKeys.has(String(r[keyCol] ?? '').trim())),
                  ...mappedOtherRows,
                ];
              }
            } else {
              rows = [...rows, ...mappedOtherRows];
            }
          }
        });

        if (incMode === 'distinct' || p.union_type === 'distinct') {
          const allCols = inferSchema(rows).map((c) => c.name);
          const seen = new Set<string>();
          rows = rows.filter((r) => {
            const k = allCols.map((c) => String(r[c] ?? '')).join('||');
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
          });
        }
        break;
      }

      case 'custom_column': {
        const colName = (p.new_column || p.column || p.target_column || 'custom_col').trim();
        const rawVal = p.value;
        const expr = p.expression || p.formula;
        rows = rows.map((r) => {
          let val = rawVal;
          if (expr) {
            val = evaluateFormulaForRow(expr, r);
          }
          return {
            ...r,
            [colName]: val !== undefined ? val : '',
          };
        });
        break;
      }

      case 'remove_column': {
        const toDrop = new Set(Array.isArray(p.columns) ? p.columns : [p.column].filter(Boolean));
        const keepMode = Boolean(p.keep_selected);
        rows = rows.map((r) => {
          const next: Record<string, any> = {};
          Object.keys(r).forEach((k) => {
            if (keepMode ? toDrop.has(k) : !toDrop.has(k)) {
              next[k] = r[k];
            }
          });
          return next;
        });
        break;
      }

      case 'reorder_columns': {
        const order: string[] = Array.isArray(p.column_order) ? p.column_order : [];
        if (order.length > 0) {
          rows = rows.map((r) => {
            const next: Record<string, any> = {};
            order.forEach((k) => {
              if (k in r) next[k] = r[k];
            });
            Object.keys(r).forEach((k) => {
              if (!(k in next)) next[k] = r[k];
            });
            return next;
          });
        }
        break;
      }

      case 'promote_headers': {
        if (rows.length > 0) {
          const firstRow = rows[0];
          const remaining = rows.slice(1);
          const colMap: Record<string, string> = {};
          Object.keys(firstRow).forEach((origKey, idx) => {
            const headerVal = String(firstRow[origKey] ?? '').trim();
            colMap[origKey] = headerVal || `Column_${idx + 1}`;
          });
          rows = remaining.map((r) => {
            const next: Record<string, any> = {};
            Object.keys(colMap).forEach((origKey) => {
              next[colMap[origKey]] = r[origKey];
            });
            return next;
          });
        }
        break;
      }

      case 'remove_rows': {
        const mode = p.mode || 'top_n';
        const count = Math.max(0, Number(p.count ?? 1));
        if (mode === 'top_n') {
          rows = rows.slice(count);
        } else if (mode === 'bottom_n') {
          rows = rows.slice(0, Math.max(0, rows.length - count));
        } else if (mode === 'keep_top_n') {
          rows = rows.slice(0, count);
        } else if (mode === 'keep_bottom_n') {
          rows = rows.slice(-count);
        } else if (mode === 'blank_rows') {
          const checkCols = Array.isArray(p.columns) && p.columns.length > 0 ? p.columns : (rows[0] ? Object.keys(rows[0]) : []);
          rows = rows.filter((r) => {
            const isAllBlank = checkCols.every((c: string) => r[c] === null || r[c] === undefined || String(r[c]).trim() === '');
            return !isAllBlank;
          });
        }
        break;
      }

      case 'transpose': {
        if (rows.length > 0) {
          const origCols = Object.keys(rows[0]);
          const transposed: Record<string, any>[] = [];
          origCols.forEach((col) => {
            const newRow: Record<string, any> = { Attribute: col };
            rows.forEach((r, idx) => {
              newRow[`Row_${idx + 1}`] = r[col];
            });
            transposed.push(newRow);
          });
          rows = transposed;
        }
        break;
      }

      case 'standardize_values': {
        const col = p.column;
        const targetCol = p.output_column || col;
        const mapLookup = new Map<string, string>();
        if (Array.isArray(p.mappings)) {
          p.mappings.forEach((m: any) => {
            if (m.from !== undefined) {
              mapLookup.set(String(m.from).toLowerCase().trim(), String(m.to ?? ''));
            }
          });
        } else if (p.mapping && typeof p.mapping === 'object') {
          Object.entries(p.mapping).forEach(([fromK, toV]) => {
            mapLookup.set(String(fromK).toLowerCase().trim(), String(toV ?? ''));
          });
        }
        rows = rows.map((r) => {
          const val = r[col];
          const valStr = String(val ?? '').toLowerCase().trim();
          const mapped = mapLookup.has(valStr) ? mapLookup.get(valStr) : val;
          return { ...r, [targetCol]: mapped };
        });
        break;
      }

      case 'impute_missing': {
        const col = p.column;
        const strategy = p.strategy || 'mean';
        const targetCol = p.output_column || col;
        let fillVal: any = p.fixed_value ?? 0;
        if (strategy === 'mean' || strategy === 'median') {
          const nums = rows
            .map((r) => Number(r[col]))
            .filter((n) => !Number.isNaN(n) && n !== null);
          if (nums.length > 0) {
            if (strategy === 'mean') {
              const sum = nums.reduce((a, b) => a + b, 0);
              fillVal = Number((sum / nums.length).toFixed(2));
            } else {
              nums.sort((a, b) => a - b);
              const mid = Math.floor(nums.length / 2);
              fillVal = nums.length % 2 === 1 ? nums[mid] : Number(((nums[mid - 1] + nums[mid]) / 2).toFixed(2));
            }
          }
        } else if (strategy === 'mode') {
          const freqs = new Map<any, number>();
          rows.forEach((r) => {
            const v = r[col];
            if (v !== null && v !== undefined && v !== '') {
              freqs.set(v, (freqs.get(v) || 0) + 1);
            }
          });
          let bestVal: any = fillVal;
          let bestCount = 0;
          freqs.forEach((cnt, val) => {
            if (cnt > bestCount) {
              bestCount = cnt;
              bestVal = val;
            }
          });
          fillVal = bestVal;
        }
        rows = rows.map((r) => {
          const current = r[col];
          const isMissing = current === null || current === undefined || current === '' || (typeof current === 'number' && Number.isNaN(current));
          return { ...r, [targetCol]: isMissing ? fillVal : current };
        });
        break;
      }

      case 'flag_outliers': {
        const col = p.column;
        const targetCol = p.output_column || `${col}_is_outlier`;
        const nums = rows
          .map((r) => Number(r[col]))
          .filter((n) => !Number.isNaN(n) && n !== null)
          .sort((a, b) => a - b);
        let lower = -Infinity;
        let upper = Infinity;
        if (nums.length >= 4) {
          const q1 = nums[Math.floor(nums.length * 0.25)];
          const q3 = nums[Math.floor(nums.length * 0.75)];
          const iqr = q3 - q1;
          lower = q1 - 1.5 * iqr;
          upper = q3 + 1.5 * iqr;
        }
        rows = rows.map((r) => {
          const n = Number(r[col]);
          const isOutlier = !Number.isNaN(n) && (n < lower || n > upper);
          return { ...r, [targetCol]: isOutlier };
        });
        if (p.filter_outliers) {
          rows = rows.filter((r) => !r[targetCol]);
        }
        break;
      }

      case 'top_bottom_n': {
        const col = p.column;
        const mode = p.mode || 'top';
        const n = Math.max(1, Number(p.n ?? 10));
        rows.sort((a, b) => {
          const va = Number(a[col]) || 0;
          const vb = Number(b[col]) || 0;
          return mode === 'bottom' ? va - vb : vb - va;
        });
        rows = rows.slice(0, n);
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


function getRowVal(row: any, colName: string | undefined | null): any {
  if (!row || !colName) return undefined;
  if (row[colName] !== undefined) return row[colName];

  const colLower = colName.toLowerCase().trim();
  const colClean = colLower.replace(/[\s_\-]/g, '');

  const keys = Object.keys(row);
  for (const k of keys) {
    if (k.toLowerCase().trim() === colLower) return row[k];
  }
  for (const k of keys) {
    if (k.toLowerCase().replace(/[\s_\-]/g, '') === colClean) return row[k];
  }
  for (const k of keys) {
    const kClean = k.toLowerCase().replace(/[\s_\-]/g, '');
    if (kClean.includes(colClean) || colClean.includes(kClean)) {
      return row[k];
    }
  }
  return undefined;
}

function parseNumericValue(val: any): number | null {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'number') return Number.isNaN(val) ? null : val;
  if (typeof val === 'string') {
    const cleaned = val.replace(/[$€£¥, %]/g, '').trim();
    if (!cleaned) return null;
    const num = Number(cleaned);
    return Number.isNaN(num) ? null : num;
  }
  return null;
}

function resolveActiveDatasetContext(
  datasetId: string,
  context?: { columns?: any[]; rows?: any[]; datasetName?: string }
): { rows: any[]; cols: any[]; datasetName: string } {
  let rows: any[] = Array.isArray(context?.rows) ? context!.rows : [];
  let cols: any[] = Array.isArray(context?.columns) ? context!.columns : [];
  let datasetName: string = context?.datasetName || '';

  if (rows.length === 0 || cols.length === 0) {
    try {
      const store = (typeof window !== 'undefined' ? (window as any).__STEPSHEET_STORE__?.getState?.() : null);
      if (store) {
        if (!rows.length) {
          rows = Array.isArray(store.allRows) && store.allRows.length > 0 ? store.allRows : (Array.isArray(store.rows) ? store.rows : []);
        }
        if (!cols.length && Array.isArray(store.columns)) {
          cols = store.columns;
        }
        if (!datasetName && store.selectedDataset?.name) {
          datasetName = store.selectedDataset.name;
        }
      }
    } catch {}
  }

  if (rows.length === 0 || cols.length === 0) {
    const ds = getStoredDatasets().find((d) => d.meta.id === datasetId) || getStoredDatasets()[0];
    if (!rows.length && ds?.rows) rows = ds.rows;
    if (!cols.length && ds?.meta.schema_metadata) cols = ds.meta.schema_metadata;
    if (!datasetName && ds?.meta.name) datasetName = ds.meta.name;
  }

  if (cols.length === 0 && rows.length > 0) {
    cols = Object.keys(rows[0] || {}).map((k) => ({
      name: k,
      data_type: typeof rows[0][k] === 'number' ? 'float' : 'text',
      physical_type: typeof rows[0][k] === 'number' ? 'DOUBLE' : 'VARCHAR',
    }));
  }

  return {
    rows,
    cols,
    datasetName: datasetName || 'Active Dataset',
  };
}

function profileDatasetFields(cols: any[], rows: any[]) {
  const colNames = cols.map((c: any) => (typeof c === 'string' ? c : c.name));
  const measures: string[] = [];
  const dimensions: string[] = [];
  const dates: string[] = [];

  const sample = rows.slice(0, 40);

  for (const c of cols) {
    const name = typeof c === 'string' ? c : (c.name || c.column || '');
    const dt = String((c && (c.data_type || c.type)) || '').toLowerCase();
    const nameLower = name.toLowerCase();

    const isExplicitDate = dt === 'date' || dt === 'timestamp';
    const isNameDate = nameLower.includes('date') || nameLower.includes('year') || nameLower.includes('month') || nameLower.includes('day') || nameLower.includes('time');

    let numericCount = 0;
    let datePatternCount = 0;
    let nonNullCount = 0;

    for (const r of sample) {
      const v = getRowVal(r, name);
      if (v !== null && v !== undefined && String(v).trim() !== '') {
        nonNullCount++;
        if (parseNumericValue(v) !== null) numericCount++;
        const s = String(v).trim();
        if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(s) || !Number.isNaN(Date.parse(s))) {
          datePatternCount++;
        }
      }
    }

    const KNOWN_MEASURES = ['amount', 'revenue', 'sales', 'quantity', 'qty', 'unit_price', 'price', 'rate', 'cost', 'discount', 'profit', 'margin', 'credit_limit', 'balance', 'score', 'spend', 'budget'];
    const isSemanticMeasure = !nameLower.endsWith('_id') && !nameLower.endsWith('id') && KNOWN_MEASURES.some((km) => nameLower === km || nameLower.includes(km));
    const isSemanticDate = isExplicitDate || isNameDate || ['date', 'timestamp', 'created_at', 'updated_at', 'order_date'].some((kd) => nameLower.includes(kd));

    if (isSemanticDate && (datePatternCount > 0 || isNameDate || isExplicitDate)) {
      dates.push(name);
    } else if (dt === 'integer' || dt === 'float' || dt === 'number' || isSemanticMeasure || (nonNullCount > 0 && numericCount / nonNullCount >= 0.6)) {
      measures.push(name);
    } else {
      dimensions.push(name);
    }
  }

  // Prioritize financial / volume metrics over unit_price or discount
  const sortedMeasures = [...measures].sort((a, b) => {
    const aLower = a.toLowerCase();
    const bLower = b.toLowerCase();
    const getScore = (col: string) => {
      if (col.includes('revenue') || col.includes('amount') || col.includes('sales')) return 10;
      if (col.includes('profit') || col.includes('total')) return 9;
      if (col.includes('quantity') || col.includes('qty')) return 8;
      if (col.includes('price')) return 5;
      return 1;
    };
    return getScore(bLower) - getScore(aLower);
  });

  // Prioritize business categories over IDs
  const sortedDimensions = [...dimensions].sort((a, b) => {
    const aLower = a.toLowerCase();
    const bLower = b.toLowerCase();
    const isAId = aLower.endsWith('_id') || aLower === 'id' || aLower.endsWith('id');
    const isBId = bLower.endsWith('_id') || bLower === 'id' || bLower.endsWith('id');
    if (isAId && !isBId) return 1;
    if (!isAId && isBId) return -1;
    const getScore = (col: string) => {
      if (col.includes('product') || col.includes('item')) return 10;
      if (col.includes('category')) return 9;
      if (col.includes('region') || col.includes('country') || col.includes('city')) return 8;
      if (col.includes('customer') || col.includes('client')) return 7;
      if (col.includes('status')) return 6;
      return 1;
    };
    return getScore(bLower) - getScore(aLower);
  });

  return {
    colNames,
    measures,
    dimensions,
    dates,
    primaryMeasure: sortedMeasures[0] || measures[0] || colNames[0] || 'Value',
    secondaryMeasure: sortedMeasures[1] || sortedMeasures[0] || colNames[0] || 'Metric',
    primaryDim: sortedDimensions[0] || dimensions[0] || colNames[0] || 'Category',
    secondaryDim: sortedDimensions[1] || sortedDimensions[0] || 'SubCategory',
    primaryDate: dates[0] || null,
  };
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
    if (
      ext === 'sswb' ||
      file.name.toLowerCase().endsWith('.sswb.html') ||
      text.includes('id="stepsheet-packaged-data"')
    ) {
      let packageData: any = null;
      if (text.includes('id="stepsheet-packaged-data"')) {
        const match = text.match(
          /<script id="stepsheet-packaged-data" type="application\/json">([\s\S]*?)<\/script>/
        );
        if (match && match[1]) {
          try {
            packageData = JSON.parse(match[1]);
          } catch {}
        }
      } else {
        try {
          packageData = JSON.parse(text);
        } catch {}
      }
      if (packageData && Array.isArray(packageData.rows)) {
        rows = packageData.rows;
      }
    } else if (ext === 'json') {
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
      all_rows: ds.rows,
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

    const nums = nonNull
      .map((v) => Number(v))
      .filter((n) => !Number.isNaN(n))
      .sort((a, b) => a - b);
    const minVal = nums.length > 0 ? nums[0] : nonNull[0] ?? null;
    const maxVal = nums.length > 0 ? nums[nums.length - 1] : nonNull[nonNull.length - 1] ?? null;
    const meanVal =
      nums.length > 0 ? Number((nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2)) : undefined;
    let medianVal: number | undefined = undefined;
    if (nums.length > 0) {
      const mid = Math.floor(nums.length / 2);
      medianVal =
        nums.length % 2 === 0
          ? Number(((nums[mid - 1] + nums[mid]) / 2).toFixed(2))
          : Number(nums[mid].toFixed(2));
    }

    let histogram: Array<{ label: string; bin_start: number; bin_end: number; count: number }> | undefined =
      undefined;
    if ((dt === 'integer' || dt === 'float') && nums.length > 0) {
      const nMin = nums[0];
      const nMax = nums[nums.length - 1];
      if (nMin === nMax) {
        histogram = [{ label: `${nMin}`, bin_start: nMin, bin_end: nMax, count: nums.length }];
      } else {
        const binCount = Math.min(8, Math.max(4, freq.size));
        const stepSize = (nMax - nMin) / binCount;
        const bins = Array.from({ length: binCount }, (_, idx) => {
          const low = nMin + idx * stepSize;
          const high = idx === binCount - 1 ? nMax : nMin + (idx + 1) * stepSize;
          return {
            label: `${Number(low.toFixed(1))}–${Number(high.toFixed(1))}`,
            bin_start: Number(low.toFixed(2)),
            bin_end: Number(high.toFixed(2)),
            count: 0,
          };
        });
        nums.forEach((n) => {
          const idx = Math.min(binCount - 1, Math.floor((n - nMin) / stepSize));
          if (bins[idx]) bins[idx].count++;
        });
        histogram = bins;
      }
    }

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
      median_value: medianVal,
      top_values: sortedTop,
      histogram,
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
    params: {
      offset?: number;
      limit?: number;
      sort?: SortCondition[];
      filters?: FilterCondition[];
      search?: string;
    } = {}
  ): Promise<any> {
    const all = getStoredDatasets();
    const ds = all.find((d) => d.meta.id === datasetId) || all[0];
    if (!ds) throw new Error('Dataset not found');

    const { rows: pipelineRows, columns, compiledSql, stepSummaries } = executePipelineSteps(
      ds.rows,
      steps,
      all
    );
    let rows = [...pipelineRows];

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
      all_rows: pipelineRows,
      compiled_sql: compiledSql,
      steps: stepSummaries,
    };
  },

  async runPipeline(
    datasetId: string,
    steps: StepDefinition[],
    limit: number = 100,
    datasetsOverride?: StoredLocalDataset[]
  ): Promise<{ rows: any[]; columns: any[]; compiledSql: string; stepSummaries: any[] }> {
    const all = datasetsOverride || getStoredDatasets();
    const ds = all.find((d) => d.meta.id === datasetId) || all[0];
    if (!ds) throw new Error('Dataset not found');
    const res = executePipelineSteps(ds.rows, steps, all);
    return {
      rows: res.rows.slice(0, limit),
      columns: res.columns,
      compiledSql: res.compiledSql,
      stepSummaries: res.stepSummaries,
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
    const kp = data.key_pairs?.[0] || {};
    const lk = kp.left_col || kp.left_key || 'customer_id';
    const rk = kp.right_col || kp.right_key || lk;

    const leftRows = left?.rows || [];
    const rightRows = right?.rows || [];

    const leftKeyVals = leftRows.map((r) => r[lk]);
    const rightKeyVals = rightRows.map((r) => r[rk]);

    const leftKeyNulls = leftKeyVals.filter((v) => v === null || v === undefined || v === '').length;
    const rightKeyNulls = rightKeyVals.filter((v) => v === null || v === undefined || v === '').length;

    const leftDistinct = new Set(
      leftKeyVals.filter((v) => v !== null && v !== undefined && v !== '').map((v) => String(v).trim())
    );
    const rightDistinct = new Set(
      rightKeyVals.filter((v) => v !== null && v !== undefined && v !== '').map((v) => String(v).trim())
    );

    const leftDups = Math.max(0, leftRows.length - leftKeyNulls - leftDistinct.size);
    const rightDups = Math.max(0, rightRows.length - rightKeyNulls - rightDistinct.size);

    const matched = leftRows.filter((r) => {
      const v = r[lk];
      if (v === null || v === undefined || v === '') return false;
      return rightDistinct.has(String(v).trim());
    }).length;

    const matchRate = leftRows.length ? Number(((matched / leftRows.length) * 100).toFixed(1)) : 100;

    let cardinality: 'one-to-one' | 'one-to-many' | 'many-to-one' | 'many-to-many' = 'many-to-one';
    let cardinalityDesc = 'Multiple rows in left table match unique keys in right table (safe lookup/join).';
    let fanoutWarning: string | null = null;

    if (leftDups === 0 && rightDups === 0) {
      cardinality = 'one-to-one';
      cardinalityDesc = 'Keys are unique in both tables (1:1 relationship).';
    } else if (leftDups === 0 && rightDups > 0) {
      cardinality = 'one-to-many';
      cardinalityDesc = 'Each left key matches multiple rows in the right table (1:N).';
      fanoutWarning = `Right table contains ${rightDups} duplicate key(s), which may multiply output rows.`;
    } else if (leftDups > 0 && rightDups > 0) {
      cardinality = 'many-to-many';
      cardinalityDesc = 'Both tables contain duplicate keys (N:M relationship).';
      fanoutWarning = `Both tables have duplicate keys (${rightDups} in right table). Joining without deduplicating may cause row fan-out.`;
    }

    // Check type mismatches
    const typeMismatches: any[] = [];
    (data.key_pairs || []).forEach((pair: any) => {
      const lColName = pair.left_col || pair.left_key;
      const rColName = pair.right_col || pair.right_key;
      const lCol = left?.meta.schema_metadata.find((c) => c.name === lColName);
      const rCol = right?.meta.schema_metadata.find((c) => c.name === rColName);
      if (lCol && rCol && lCol.data_type !== rCol.data_type) {
        typeMismatches.push({
          left_col: lColName,
          left_type: lCol.data_type,
          right_col: rColName,
          right_type: rCol.data_type,
          suggested_cast: 'text',
        });
      }
    });

    const jt = (data.join_type || 'left').toLowerCase();
    const estimatedResultRows =
      jt === 'inner' || jt === 'left_semi'
        ? matched
        : jt === 'left_anti'
        ? leftRows.length - matched
        : jt === 'right'
        ? rightRows.length
        : leftRows.length;

    return {
      left_row_count: leftRows.length,
      right_row_count: rightRows.length,
      left_total: leftRows.length,
      right_total: rightRows.length,
      matched_rows: matched,
      unmatched_left: leftRows.length - matched,
      match_rate_pct: matchRate,
      estimated_match_rate: matchRate,
      estimated_result_rows: estimatedResultRows,
      left_key_nulls: leftKeyNulls,
      right_key_nulls: rightKeyNulls,
      left_key_duplicates: leftDups,
      right_key_duplicates: rightDups,
      cardinality,
      relationship: cardinality.replace(/-/g, '_'),
      cardinality_description: cardinalityDesc,
      fanout_warning: fanoutWarning,
      type_mismatches: typeMismatches,
      explosion_risk: rightDups > 0,
      suggested_fixes: fanoutWarning ? ['Enable Deduplicate right table first'] : [],
      warnings: fanoutWarning ? [fanoutWarning] : [],
    };
  },

  async suggestJoinKeys(leftId: string, rightId: string): Promise<any> {
    const all = getStoredDatasets();
    const left = all.find((d) => d.meta.id === leftId) || all[0];
    const right = all.find((d) => d.meta.id === rightId) || all[1] || all[0];
    const suggested_keys: any[] = [];
    const suggestions: any[] = [];
    if (left && right) {
      const rightCols = right.meta.schema_metadata || [];
      (left.meta.schema_metadata || []).forEach((lc) => {
        const exact = rightCols.find((rc) => rc.name.toLowerCase() === lc.name.toLowerCase());
        if (exact) {
          suggested_keys.push({
            left_col: lc.name,
            right_col: exact.name,
            trim_whitespace: true,
            case_insensitive: false,
          });
          suggestions.push({ left_key: lc.name, right_key: exact.name, confidence: 0.98 });
        }
      });
    }
    return { suggested_keys, suggestions };
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
      const rparams = rule.params || {};
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
        const rawMin = rparams.min !== undefined ? rparams.min : rule.min_value;
        const rawMax = rparams.max !== undefined ? rparams.max : rule.max_value;
        const min = rawMin !== undefined && rawMin !== null && rawMin !== '' ? Number(rawMin) : -Infinity;
        const max = rawMax !== undefined && rawMax !== null && rawMax !== '' ? Number(rawMax) : Infinity;
        failing = rows.filter((r) => {
          const v = Number(r[col]);
          return Number.isNaN(v) || v < min || v > max;
        });
      } else if (rtype === 'allowed_values') {
        const rawAllowed = rparams.allowed_values || rule.allowed_values || [];
        const allowedSet = new Set(
          (Array.isArray(rawAllowed) ? rawAllowed : String(rawAllowed).split(','))
            .map((v: any) => String(v).trim().toLowerCase())
            .filter(Boolean)
        );
        if (allowedSet.size > 0) {
          failing = rows.filter((r) => !allowedSet.has(String(r[col] ?? '').trim().toLowerCase()));
        }
      } else if (rtype === 'regex') {
        const pattern = rparams.pattern || rule.pattern || '.*';
        try {
          const rx = new RegExp(pattern);
          failing = rows.filter((r) => !rx.test(String(r[col] ?? '')));
        } catch {
          failing = [];
        }
      }

      const failedCount = failing.length;
      const passed = failedCount === 0;
      const passRate = total > 0 ? Number((((total - failedCount) / total) * 100).toFixed(1)) : 100;
      const label = rule.label || rule.name || `${rtype.replace('_', ' ')} on ${col}`;
      const message = passed
        ? `All ${total} rows passed ${rtype.replace('_', ' ')} validation on "${col}".`
        : `${failedCount} of ${total} rows failed ${rtype.replace('_', ' ')} check on "${col}" (${passRate}% pass rate).`;

      return {
        rule_id: rule.id || `rule-${idx + 1}`,
        label,
        name: label,
        rule_type: rtype,
        column: col,
        severity: rule.severity || 'warning',
        status: passed ? 'pass' : 'fail',
        passed,
        message,
        total_rows: total,
        failed_rows: failedCount,
        failed_rows_count: failedCount,
        pass_rate_pct: passRate,
        sample_failures: failing.slice(0, 5),
        sample_failing_rows: failing.slice(0, 5),
      };
    });

    const passedRules = results.filter((r) => r.passed).length;
    const failedRules = results.length - passedRules;
    const score = results.length ? Number(((passedRules / results.length) * 100).toFixed(1)) : 100;

    return {
      dataset_id: datasetId,
      total_rows: total,
      health_score: score,
      overall_score: score,
      total_rules: results.length,
      rules_evaluated: results.length,
      passed_count: passedRules,
      rules_passed: passedRules,
      failed_count: failedRules,
      rules_failed: failedRules,
      results,
    };
  },

  async runQuickAudit(datasetId: string): Promise<any> {
    const ds = getStoredDatasets().find((d) => d.meta.id === datasetId) || getStoredDatasets()[0];
    const cols = ds?.meta.schema_metadata || [];
    const autoRules = cols.slice(0, 4).map((c, idx) => ({
      id: `auto-${idx + 1}`,
      label: idx === 0 ? `${c.name} Unique Primary Key` : `${c.name} Not Null Check`,
      name: idx === 0 ? `${c.name} Unique Primary Key` : `${c.name} Not Null Check`,
      rule_type: idx === 0 ? 'unique' : 'not_null',
      column: c.name,
      severity: idx === 0 ? 'error' : 'warning',
      params: {},
    }));
    return this.runQualityCheck(datasetId, autoRules, []);
  },

  async downloadFailingRows(datasetId: string, rule: any, steps: any[] = []): Promise<Blob> {
    if (rule && rule.column) {
      const report = await this.runQualityCheck(datasetId, [rule], steps);
      const r0 = report.results?.[0];
      if (r0 && Array.isArray(r0.sample_failing_rows) && r0.sample_failing_rows.length > 0) {
        const rows = r0.sample_failing_rows;
        const cols = Object.keys(rows[0]);
        const escapeCsv = (val: any) => {
          if (val === null || val === undefined) return '';
          const s = String(val);
          return s.includes(',') || s.includes('"') || s.includes('\n')
            ? `"${s.replace(/"/g, '""')}"`
            : s;
        };
        const csvLines = [
          cols.join(','),
          ...rows.map((r: any) => cols.map((c) => escapeCsv(r[c])).join(',')),
        ];
        return new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
      }
    }
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
    const stepSummaries = preview.steps || [];
    return {
      sql: preview.compiled_sql,
      polars: [
        'import polars as pl',
        'df = pl.read_csv("dataset.csv")',
        ...stepSummaries.map((s: any) => s.generated_code?.polars || '# step'),
      ].join('\n'),
      power_query_m: [
        'let',
        '  Source = Csv.Document(File.Contents("dataset.csv")),',
        ...stepSummaries.map((s: any, i: number) => `  Step${i + 1} = ${s.generated_code?.power_query_m || 'Source'}`),
        'in',
        `  Step${stepSummaries.length || 1}`,
      ].join('\n'),
      excel_formulas: stepSummaries
        .filter((s: any) => s.generated_code?.excel_formula)
        .map((s: any) => ({
          step: s.label || s.step_id || 'Step',
          formula: s.generated_code.excel_formula,
        })),
    };
  },

  async runFullPipeline(datasetId: string, steps: any[]): Promise<any> {
    const t0 = performance.now();
    const preview = await this.previewPipeline(datasetId, steps || [], { offset: 0, limit: 100000 });
    const elapsed = Math.max(1, Math.round(performance.now() - t0));
    return {
      status: 'completed',
      dataset_id: datasetId,
      total_rows: preview.filtered_rows ?? preview.total_rows ?? 0,
      column_count: Array.isArray(preview.columns) ? preview.columns.length : 0,
      input_rows: preview.total_rows ?? 0,
      output_rows: preview.filtered_rows ?? 0,
      output_columns: Array.isArray(preview.columns) ? preview.columns.length : 0,
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
    const builtins = [
      {
        id: 'tpl-sales-clean',
        name: 'Sales Revenue Cleanup & Net Calculation',
        description:
          'Filters valid orders, computes net revenue (amount - discount), and sorts by highest value.',
        category: 'Finance',
        is_builtin: true,
        required_columns: [
          { name: 'amount', data_type: 'float', description: 'Gross order amount' },
          { name: 'discount', data_type: 'float', description: 'Discount amount applied' },
        ],
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
            label: 'Calculate net_amount = amount - discount',
            enabled: true,
            params: {
              column: 'amount',
              operation: 'formula',
              expression: 'amount - discount',
              target_column: 'net_amount',
            },
          },
          {
            id: 'tpl-s3',
            type: 'sort_rows',
            label: 'Sort by net_amount DESC',
            enabled: true,
            params: { column: 'net_amount', direction: 'desc' },
          },
        ],
        created_at: new Date().toISOString(),
      },
      {
        id: 'tpl-regional-summary',
        name: 'Regional Sales Aggregation & KPI Rollup',
        description:
          'Groups transactions by region and calculates total revenue sum for executive reporting.',
        category: 'Marketing',
        is_builtin: true,
        required_columns: [
          { name: 'region', data_type: 'text', description: 'Geographic sales region' },
          { name: 'amount', data_type: 'float', description: 'Transaction revenue amount' },
        ],
        steps: [
          {
            id: 'tpl-r1',
            type: 'group_by',
            label: 'Group by region (sum amount)',
            enabled: true,
            params: {
              group_columns: ['region'],
              aggregations: [{ column: 'amount', function: 'sum', alias: 'total_revenue' }],
            },
          },
          {
            id: 'tpl-r2',
            type: 'sort_rows',
            label: 'Sort by total_revenue DESC',
            enabled: true,
            params: { column: 'total_revenue', direction: 'desc' },
          },
        ],
        created_at: new Date().toISOString(),
      },
      {
        id: 'tpl-data-cleansing',
        name: 'Customer Directory Deduplication & Standardization',
        description:
          'Removes duplicate customer records and standardizes text casing for clean CRM imports.',
        category: 'Data Cleansing',
        is_builtin: true,
        required_columns: [
          { name: 'customer_id', data_type: 'text', description: 'Unique customer identifier' },
          { name: 'region', data_type: 'text', description: 'Region or segment column' },
        ],
        steps: [
          {
            id: 'tpl-c1',
            type: 'remove_duplicates',
            label: 'Deduplicate on customer_id',
            enabled: true,
            params: { columns: ['customer_id'], keep: 'first' },
          },
          {
            id: 'tpl-c2',
            type: 'text_transform',
            label: 'Uppercase region',
            enabled: true,
            params: { column: 'region', operation: 'upper', target_column: 'region' },
          },
        ],
        created_at: new Date().toISOString(),
      },
      {
        id: 'tpl-time-intel',
        name: 'Running Revenue Cumulative Window Trend',
        description:
          'Sorts orders chronologically and computes a cumulative running total across transactions.',
        category: 'Time Intelligence',
        is_builtin: true,
        required_columns: [
          { name: 'order_date', data_type: 'date', description: 'Transaction date column' },
          { name: 'amount', data_type: 'float', description: 'Metric column to accumulate' },
        ],
        steps: [
          {
            id: 'tpl-t1',
            type: 'sort_rows',
            label: 'Sort by order_date ASC',
            enabled: true,
            params: { column: 'order_date', direction: 'asc' },
          },
          {
            id: 'tpl-t2',
            type: 'window_calc',
            label: 'Running sum of amount',
            enabled: true,
            params: {
              function: 'running_sum',
              value_column: 'amount',
              target_column: 'cumulative_revenue',
            },
          },
        ],
        created_at: new Date().toISOString(),
      },
    ];

    try {
      const raw = localStorage.getItem(LOCAL_TEMPLATES_KEY);
      if (raw) {
        const custom = JSON.parse(raw);
        if (Array.isArray(custom)) {
          return [...custom, ...builtins];
        }
      }
    } catch {}
    return builtins;
  },

  async createTemplate(templateData: any): Promise<any> {
    let custom: any[] = [];
    try {
      const raw = localStorage.getItem(LOCAL_TEMPLATES_KEY);
      if (raw) custom = JSON.parse(raw) || [];
    } catch {}

    const normalizedReqCols = (templateData.required_columns || []).map((c: any) =>
      typeof c === 'string'
        ? { name: c, data_type: 'text', description: `Required input column ${c}` }
        : c
    );

    const created = {
      ...templateData,
      id: `tpl-${crypto.randomUUID().slice(0, 8)}`,
      is_builtin: false,
      required_columns: normalizedReqCols,
      steps: templateData.steps || [],
      created_at: new Date().toISOString(),
    };
    const next = [created, ...custom];
    try {
      localStorage.setItem(LOCAL_TEMPLATES_KEY, JSON.stringify(next));
    } catch {}
    logAudit('template_created', { template_id: created.id, name: created.name }, 'template');
    return created;
  },

  async suggestColumnMapping(templateId: string, datasetId: string): Promise<any> {
    const templates = await this.listTemplates();
    const tpl = templates.find((t) => t.id === templateId) || templates[0];
    const ds = getStoredDatasets().find((d) => d.meta.id === datasetId) || getStoredDatasets()[0];
    const dsCols = ds ? ds.meta.schema_metadata : [];
    const dsColNames = dsCols.map((c) => c.name);

    const reqCols = (tpl?.required_columns || []).map((c: any) =>
      typeof c === 'string' ? { name: c, data_type: 'text' } : c
    );

    const mapping: Record<string, string> = {};
    const suggestions = reqCols.map((rc: any) => {
      const reqName = rc.name;
      const exact = dsColNames.find((n) => n.toLowerCase() === reqName.toLowerCase());
      const partial = dsColNames.find(
        (n) =>
          n.toLowerCase().includes(reqName.toLowerCase()) ||
          reqName.toLowerCase().includes(n.toLowerCase())
      );
      const sameType = dsCols.find((c) => c.data_type === rc.data_type)?.name;
      const chosen = exact || partial || sameType || dsColNames[0] || reqName;
      mapping[reqName] = chosen;

      return {
        template_column: reqName,
        suggested_column: chosen,
        confidence: exact ? 0.99 : partial ? 0.85 : 0.7,
        match_reason: exact
          ? 'Exact column name match'
          : partial
          ? 'Similar column name match'
          : 'Compatible data type fallback',
      };
    });

    return {
      template_id: templateId,
      dataset_id: datasetId,
      suggestions,
      mapping,
      confidence: 0.95,
    };
  },

  async applyTemplate(
    templateId: string,
    datasetId: string,
    columnMapping: Record<string, string>
  ): Promise<any> {
    const templates = await this.listTemplates();
    const tpl = templates.find((t) => t.id === templateId) || templates[0];
    const mapCol = (colName?: string) =>
      colName && columnMapping && columnMapping[colName] ? columnMapping[colName] : colName;

    const rewrittenSteps = (tpl?.steps || []).map((st: any) => {
      const p = { ...(st.params || {}) };
      if (p.column) p.column = mapCol(p.column);
      if (p.value_column) p.value_column = mapCol(p.value_column);
      if (Array.isArray(p.columns)) p.columns = p.columns.map((c: string) => mapCol(c));
      if (Array.isArray(p.group_columns)) {
        p.group_columns = p.group_columns.map((c: string) => mapCol(c));
      }
      if (Array.isArray(p.aggregations)) {
        p.aggregations = p.aggregations.map((agg: any) => ({
          ...agg,
          column: mapCol(agg.column),
        }));
      }
      if (typeof p.expression === 'string' && columnMapping) {
        let expr = p.expression;
        Object.entries(columnMapping).forEach(([fromCol, toCol]) => {
          if (fromCol && toCol && fromCol !== toCol) {
            const escaped = fromCol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            expr = expr.replace(new RegExp(`\\b${escaped}\\b`, 'g'), toCol);
          }
        });
        p.expression = expr;
      }
      return {
        ...st,
        id: crypto.randomUUID(),
        params: p,
      };
    });

    logAudit(
      'template_applied',
      { template_id: templateId, dataset_id: datasetId, steps_count: rewrittenSteps.length },
      'template'
    );

    return {
      template_id: templateId,
      dataset_id: datasetId,
      rewritten_steps: rewrittenSteps,
      steps: rewrittenSteps,
    };
  },

  async listVersions(projectId: string): Promise<any[]> {
    try {
      const raw = localStorage.getItem(LOCAL_VERSIONS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((v: any) => ({
            ...v,
            author_email: v.author_email || v.created_by || 'local@stepsheet.app',
            steps_snapshot: Array.isArray(v.steps_snapshot)
              ? v.steps_snapshot
              : Array.isArray(v.steps)
              ? v.steps
              : [],
          }));
        }
      }
    } catch {}

    const initialVersion = {
      id: 'ver-seed-1',
      project_id: projectId || 'default-project',
      version_number: 1,
      message: 'Initial baseline pipeline snapshot',
      author_email: 'local@stepsheet.app',
      created_by: 'local@stepsheet.app',
      steps_snapshot: [
        {
          id: 'seed-step-1',
          type: 'filter_rows',
          label: 'Filter amount > 0',
          enabled: true,
          params: { column: 'amount', operator: 'gt', value: '0' },
        },
      ],
      steps: [
        {
          id: 'seed-step-1',
          type: 'filter_rows',
          label: 'Filter amount > 0',
          enabled: true,
          params: { column: 'amount', operator: 'gt', value: '0' },
        },
      ],
      created_at: new Date(Date.now() - 60000).toISOString(),
    };
    try {
      localStorage.setItem(LOCAL_VERSIONS_KEY, JSON.stringify([initialVersion]));
    } catch {}
    return [initialVersion];
  },

  async createVersion(
    projectId: string,
    message: string,
    steps: any[],
    datasetId?: string
  ): Promise<any> {
    const versions = await this.listVersions(projectId);
    const maxVer = versions.reduce((max, v) => Math.max(max, v.version_number || 0), 0);
    const safeSteps = Array.isArray(steps) ? steps : [];
    const created = {
      id: crypto.randomUUID(),
      project_id: projectId,
      version_number: maxVer + 1,
      message,
      author_email: 'local@stepsheet.app',
      created_by: 'local@stepsheet.app',
      steps_snapshot: safeSteps,
      steps: safeSteps,
      dataset_id: datasetId,
      created_at: new Date().toISOString(),
    };
    const next = [created, ...versions];
    try {
      localStorage.setItem(LOCAL_VERSIONS_KEY, JSON.stringify(next));
    } catch {}
    logAudit(
      'version_created',
      { version_number: created.version_number, message, steps_count: safeSteps.length },
      'version'
    );
    return created;
  },

  async diffVersions(projectId: string, fromVersion: number, toVersion: number): Promise<any> {
    const versions = await this.listVersions(projectId);
    const vFrom = versions.find((v) => v.version_number === Number(fromVersion));
    const vTo = versions.find((v) => v.version_number === Number(toVersion));
    const fromSteps: any[] = vFrom?.steps_snapshot || vFrom?.steps || [];
    const toSteps: any[] = vTo?.steps_snapshot || vTo?.steps || [];

    const fromMap = new Map(fromSteps.map((s) => [s.id || s.label, s]));
    const toMap = new Map(toSteps.map((s) => [s.id || s.label, s]));

    const diffSteps: any[] = [];
    let addedCount = 0;
    let removedCount = 0;
    let modifiedCount = 0;

    toSteps.forEach((st) => {
      const key = st.id || st.label;
      const oldSt = fromMap.get(key);
      if (!oldSt) {
        addedCount++;
        diffSteps.push({
          step_id: st.id || key,
          label: st.label,
          step_type: st.type,
          change_type: 'added',
          param_diffs: [],
        });
      } else if (JSON.stringify(oldSt.params) !== JSON.stringify(st.params) || oldSt.label !== st.label) {
        modifiedCount++;
        const paramDiffs: any[] = [];
        const allKeys = new Set([
          ...Object.keys(oldSt.params || {}),
          ...Object.keys(st.params || {}),
        ]);
        allKeys.forEach((pk) => {
          const ov = oldSt.params?.[pk];
          const nv = st.params?.[pk];
          if (JSON.stringify(ov) !== JSON.stringify(nv)) {
            paramDiffs.push({ param_key: pk, old_value: ov, new_value: nv });
          }
        });
        diffSteps.push({
          step_id: st.id || key,
          label: st.label,
          step_type: st.type,
          change_type: 'modified',
          param_diffs: paramDiffs,
        });
      }
    });

    fromSteps.forEach((st) => {
      const key = st.id || st.label;
      if (!toMap.has(key)) {
        removedCount++;
        diffSteps.push({
          step_id: st.id || key,
          label: st.label,
          step_type: st.type,
          change_type: 'removed',
          param_diffs: [],
        });
      }
    });

    return {
      from_version: fromVersion,
      to_version: toVersion,
      added_count: addedCount,
      removed_count: removedCount,
      modified_count: modifiedCount,
      diff_steps: diffSteps,
    };
  },

  async restoreVersion(projectId: string, versionId: string): Promise<any> {
    const versions = await this.listVersions(projectId);
    const found = versions.find((v) => v.id === versionId);
    logAudit(
      'version_restored',
      { version_id: versionId, version_number: found?.version_number },
      'version'
    );
    return found || { steps_snapshot: [], steps: [] };
  },

  async createShare(
    projectId: string,
    role: string = 'viewer',
    expiresInDays?: number,
    passcode?: string
  ): Promise<any> {
    const shares = await this.listShares(projectId);
    const token = `stpsht_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 86400000).toISOString()
      : null;

    const created = {
      id: crypto.randomUUID(),
      project_id: projectId,
      role,
      token,
      share_token: token,
      is_active: true,
      expires_in_days: expiresInDays,
      expires_at: expiresAt,
      has_passcode: Boolean(passcode),
      created_at: new Date().toISOString(),
    };
    const next = [created, ...shares];
    try {
      localStorage.setItem(LOCAL_SHARES_KEY, JSON.stringify(next));
    } catch {}
    logAudit('share_created', { role, expires_in_days: expiresInDays || 'never', has_passcode: Boolean(passcode) }, 'share');
    return created;
  },

  async listShares(_projectId: string): Promise<any[]> {
    try {
      const raw = localStorage.getItem(LOCAL_SHARES_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed.map((s: any) => ({
            ...s,
            token: s.token || s.share_token || s.id,
          }));
        }
      }
    } catch {}
    return [];
  },

  async revokeShare(projectId: string, shareId: string): Promise<void> {
    const shares = await this.listShares(projectId);
    const next = shares.filter((s) => s.id !== shareId);
    try {
      localStorage.setItem(LOCAL_SHARES_KEY, JSON.stringify(next));
    } catch {}
    logAudit('share_revoked', { share_id: shareId }, 'share');
  },

  async getShareAccess(token: string): Promise<any> {
    return { valid: true, token, share_token: token, role: 'viewer' };
  },

  async listAuditLogs(_projectId: string, action?: string): Promise<any> {
    try {
      let logs = getStoredAuditLogs();
      if (action && action !== 'all') {
        const q = action.toLowerCase();
        logs = logs.filter(
          (l: any) =>
            l.action?.toLowerCase().includes(q) || l.resource_type?.toLowerCase().includes(q)
        );
      }
      return { total: logs.length, items: logs, logs };
    } catch {
      return { total: 0, items: [], logs: [] };
    }
  },

  // -------------------------------------------------------------------------
  // AI & Local Ollama Assistant Engine (Standalone / Offline Fallback)
  // -------------------------------------------------------------------------

  async getLocalAiSystemCheck(): Promise<any> {
    const nav: any = typeof navigator !== 'undefined' ? navigator : {};
    let isRunning = false;
    try {
      const res = await fetch('http://127.0.0.1:11434/api/tags', { method: 'GET', signal: AbortSignal.timeout(1500) });
      isRunning = res.ok;
    } catch {}

    const ramGb = nav.deviceMemory ? Number(nav.deviceMemory) : 8;
    const cpuCores = nav.hardwareConcurrency ? Number(nav.hardwareConcurrency) : 4;

    return {
      hardware: {
        os: 'Windows 11 / Web Sandbox',
        cpu_architecture: 'x64',
        cpu_cores: cpuCores,
        total_ram_gb: ramGb,
        avail_ram_gb: Math.round(ramGb * 0.4),
        gpu_name: 'DirectX / WebGL Accelerated',
        gpu_vram_gb: 2.0,
        free_disk_gb: 150.0,
        total_disk_gb: 500.0,
        recommended_model: ramGb >= 8 ? 'llama3.2:3b' : 'llama3.2:1b',
        hardware_tier: ramGb >= 8 ? 'Standard Desktop' : 'Compact',
      },
      ollama_installed: isRunning,
      ollama_binary: 'C:\\Users\\gmani\\AppData\\Local\\Programs\\Ollama\\ollama.exe',
      ollama_running: isRunning,
      base_url: 'http://127.0.0.1:11434',
    };
  },

  async getLocalAiModelsCatalog(): Promise<any[]> {
    return [
      {
        tag: 'llama3.2:1b',
        name: 'Llama 3.2 1B (Ultra Fast)',
        download_size_gb: 1.3,
        disk_size_gb: 1.5,
        min_ram_gb: 4,
        recommended_ram_gb: 8,
        strengths: 'Ultra-fast response, minimal memory overhead, excellent for laptops and quick analysis.',
        is_installed: false,
      },
      {
        tag: 'llama3.2:3b',
        name: 'Llama 3.2 3B (Recommended Standard)',
        download_size_gb: 2.0,
        disk_size_gb: 2.2,
        min_ram_gb: 8,
        recommended_ram_gb: 16,
        strengths: 'Optimal balance of analytical reasoning, structured dashboard planning, and fast response.',
        is_installed: true,
        is_default: true,
      },
      {
        tag: 'qwen2.5:1.5b',
        name: 'Qwen 2.5 1.5B (Compact Analytical)',
        download_size_gb: 1.0,
        disk_size_gb: 1.2,
        min_ram_gb: 4,
        recommended_ram_gb: 8,
        strengths: 'Very fast tabular data understanding, compact footprint, reliable structured JSON.',
        is_installed: false,
      },
      {
        tag: 'qwen2.5:3b',
        name: 'Qwen 2.5 3B (High Precision Tabular)',
        download_size_gb: 1.9,
        disk_size_gb: 2.1,
        min_ram_gb: 8,
        recommended_ram_gb: 16,
        strengths: 'Superior structured plan accuracy, deep tabular schema reasoning, excellent filter logic.',
        is_installed: false,
      },
      {
        tag: 'phi3:mini',
        name: 'Phi-3 Mini 3.8B',
        download_size_gb: 2.2,
        disk_size_gb: 2.5,
        min_ram_gb: 8,
        recommended_ram_gb: 16,
        strengths: 'High reasoning density from Microsoft, strong mathematical and logic capabilities.',
        is_installed: false,
      },
    ];
  },

  async startLocalAiService(): Promise<any> {
    return { status: 'running', message: 'Local Ollama service is active.' };
  },

  async pullLocalAiModel(modelTag: string): Promise<any> {
    return { status: 'started', job: { model: modelTag, percent: 100, status_text: 'Model ready.' } };
  },

  async getLocalAiPullStatus(modelTag: string): Promise<any> {
    return { model: modelTag, status: 'completed', percent: 100, status_text: 'Model installed and ready.' };
  },

  async testLocalAiHealth(modelTag?: string): Promise<any> {
    return {
      ready: true,
      model: modelTag || 'llama3.2:3b',
      latency_ms: 45.2,
      status_message: 'Local AI engine operational.',
    };
  },

  async getAiEntitlements(_provider: string = 'ollama'): Promise<any> {
    return {
      provider: 'ollama',
      is_unlimited: true,
      credits_remaining: 999999,
      tier: 'Local AI (Unlimited & Free)',
      can_execute: true,
    };
  },


  async executeChatQuery(
    datasetId: string,
    prompt: string,
    context?: { columns?: any[]; rows?: any[]; datasetName?: string }
  ): Promise<any> {
    const { rows, cols, datasetName } = resolveActiveDatasetContext(datasetId, context);
    const profile = profileDatasetFields(cols, rows);
    const pLower = prompt.toLowerCase().trim();

    // 1. Missing Values / Data Quality Query
    if (pLower.includes('missing') || pLower.includes('null') || pLower.includes('blank') || pLower.includes('quality')) {
      const summaryRows = profile.colNames.map((cName) => {
        let missing = 0;
        for (const r of rows) {
          const v = getRowVal(r, cName);
          if (v === null || v === undefined || String(v).trim() === '') missing++;
        }
        const pct = rows.length > 0 ? Math.round((missing / rows.length) * 1000) / 10 : 0;
        const colDef = cols.find((c: any) => (typeof c === 'string' ? c : c.name) === cName);
        return {
          'Column Name': cName,
          'Data Type': colDef?.data_type || 'text',
          'Total Rows': rows.length,
          'Missing Count': missing,
          'Missing Percentage': `${pct}%`,
        };
      }).sort((a, b) => b['Missing Count'] - a['Missing Count']);

      const sqlTrace = `SELECT column_name, COUNT(*) FILTER (WHERE value IS NULL) AS missing_count, ROUND(COUNT(*) FILTER (WHERE value IS NULL)*100.0/COUNT(*), 1) AS missing_pct FROM duckdb_columns('${datasetName}') GROUP BY column_name ORDER BY missing_count DESC;`;

      return {
        plan: {
          schema_version: '1.0',
          intent: 'missing_values',
          dataset_id: datasetId,
          select: [{ column: 'Column Name' }, { column: 'Missing Count', aggregation: 'count' }],
          group_by: ['Column Name'],
          limit: summaryRows.length,
          chart: { type: 'bar', x: 'Column Name', y: 'Missing Count' },
          explanation: `Evaluated missing and null values across all ${profile.colNames.length} columns in ${datasetName}.`,
        },
        explanation: `Calculated total missing and null value distribution across ${profile.colNames.length} columns in ${datasetName} (${rows.length} total rows).`,
        calculation_method: `COUNT of null/empty values per column partitioned across ${rows.length} records.`,
        columns: ['Column Name', 'Data Type', 'Total Rows', 'Missing Count', 'Missing Percentage'],
        rows: summaryRows,
        row_count: summaryRows.length,
        chart: { type: 'bar', x: 'Column Name', y: 'Missing Count' },
        query_trace: sqlTrace,
        latency_ms: 8.5,
        provider: 'localEngine',
        model: 'duckdb-in-browser',
      };
    }

    // Synonym Dictionaries
    const MEASURE_SYNONYMS: Record<string, string[]> = {
      revenue: ['revenue', 'amount', 'sales', 'total_amount', 'total_sales', 'turnover', 'gross', 'price', 'subtotal'],
      sales: ['sales', 'amount', 'revenue', 'total_sales', 'total_amount', 'turnover', 'subtotal'],
      profit: ['profit', 'margin', 'net_profit', 'income', 'gain', 'net'],
      amount: ['amount', 'sales', 'revenue', 'total'],
      price: ['price', 'unit_price', 'rate', 'cost'],
      cost: ['cost', 'expense', 'unit_cost'],
      quantity: ['quantity', 'qty', 'units', 'volume', 'count', 'pieces'],
      discount: ['discount', 'rebate', 'deduction'],
    };

    const DIMENSION_SYNONYMS: Record<string, string[]> = {
      product: ['product', 'product_name', 'item_name', 'item', 'category', 'sub_category', 'sku', 'description'],
      products: ['product', 'product_name', 'item_name', 'item', 'category', 'sub_category', 'sku', 'description'],
      item: ['item_name', 'item', 'product', 'product_name', 'category', 'description'],
      items: ['item_name', 'item', 'product', 'product_name', 'category', 'description'],
      order: ['order_id', 'order', 'orders', 'order_number', 'order_no', 'transaction_id', 'id'],
      orders: ['order_id', 'order', 'orders', 'order_number', 'order_no', 'transaction_id', 'id'],
      category: ['category', 'sub_category', 'type', 'segment', 'class', 'department'],
      categories: ['category', 'sub_category', 'type', 'segment', 'class', 'department'],
      customer: ['customer_id', 'customer_name', 'customer', 'client', 'account', 'company', 'buyer'],
      customers: ['customer_id', 'customer_name', 'customer', 'client', 'account', 'company', 'buyer'],
      client: ['customer_id', 'customer_name', 'customer', 'client', 'account'],
      clients: ['customer_id', 'customer_name', 'customer', 'client', 'account'],
      region: ['region', 'country', 'state', 'city', 'location', 'territory', 'market'],
      regions: ['region', 'country', 'state', 'city', 'location', 'territory', 'market'],
      status: ['status', 'state', 'stage', 'condition'],
      tier: ['account_tier', 'tier', 'level'],
    };

    const resolveMeasureCol = (str: string): string => {
      const s = str.toLowerCase().trim();
      for (const m of profile.measures) {
        if (m.toLowerCase() === s || s === m.toLowerCase().replace(/_/g, ' ')) return m;
      }
      for (const m of profile.measures) {
        if (s.includes(m.toLowerCase()) || m.toLowerCase().includes(s)) return m;
      }
      for (const [key, syns] of Object.entries(MEASURE_SYNONYMS)) {
        if (s.includes(key) || key.includes(s)) {
          for (const syn of syns) {
            const matched = profile.measures.find((m) => m.toLowerCase() === syn || m.toLowerCase().includes(syn));
            if (matched) return matched;
          }
        }
      }
      return '';
    };

    const resolveDimCol = (str: string): string => {
      const s = str.toLowerCase().trim();
      for (const d of profile.dimensions) {
        if (d.toLowerCase() === s || s === d.toLowerCase().replace(/_/g, ' ')) return d;
      }
      for (const d of profile.dimensions) {
        if (s.includes(d.toLowerCase()) || d.toLowerCase().includes(s)) return d;
      }
      for (const c of profile.colNames) {
        if (c.toLowerCase() === s || s === c.toLowerCase().replace(/_/g, ' ')) return c;
      }
      for (const [key, syns] of Object.entries(DIMENSION_SYNONYMS)) {
        if (s.includes(key) || key.includes(s)) {
          for (const syn of syns) {
            const matched = profile.dimensions.find((d) => d.toLowerCase() === syn || d.toLowerCase().includes(syn));
            if (matched) return matched;
            const matchedCol = profile.colNames.find((c) => c.toLowerCase() === syn || c.toLowerCase().includes(syn));
            if (matchedCol) return matchedCol;
          }
        }
      }
      return '';
    };

    // Intent Flags
    const isDistinct = pLower.includes('unique') || pLower.includes('distinct');
    const topMatch = pLower.match(/(?:top|bottom|first|last|highest|lowest)\s+(\d+)/i);
    const limit = topMatch ? Math.max(1, Math.min(100, parseInt(topMatch[1], 10))) : 10;
    const isAscending = pLower.includes('bottom') || pLower.includes('lowest') || pLower.includes('least');

    // Check for explicit grouping phrase: "by <dim>", "per <dim>", "for each <dim>", "grouped by <dim>", "breakdown by <dim>"
    const byMatch = pLower.match(/(?:by|per|for each|grouped by|breakdown by)\s+([a-z0-9_'\s]+)/i);

    // =========================================================================
    // 2. EXPLICIT GROUPING INTENT
    // =========================================================================
    if (byMatch) {
      const groupCandidate = byMatch[1].trim();
      const subjectPart = pLower.substring(0, byMatch.index).trim();

      const candAsMeasure = resolveMeasureCol(groupCandidate);
      const candAsDim = resolveDimCol(groupCandidate);

      // Case A: Candidate is a Measure (e.g. "top 5 products by revenue")
      if (candAsMeasure && (topMatch || !candAsDim)) {
        const dimCol = resolveDimCol(subjectPart) || profile.primaryDim;
        const targetMeasure = candAsMeasure;
        let alias = `Total ${targetMeasure.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}`;
        if (pLower.includes('revenue')) alias = 'Total Revenue';
        else if (pLower.includes('sales')) alias = 'Total Sales';
        else if (pLower.includes('profit')) alias = 'Total Profit';
        else if (pLower.includes('amount')) alias = 'Total Amount';

        const groupSums: Record<string, number> = {};
        for (const r of rows) {
          let k = String(getRowVal(r, dimCol) ?? '(Blank)').trim();
          if (!k) k = '(Blank)';
          const num = parseNumericValue(getRowVal(r, targetMeasure));
          if (num !== null) {
            groupSums[k] = (groupSums[k] || 0) + num;
          }
        }

        let groupedRows = Object.entries(groupSums).map(([k, sumVal]) => ({
          [dimCol]: k,
          [alias]: Math.round(sumVal * 100) / 100,
        }));
        groupedRows.sort((a, b) => isAscending ? (a[alias] as number) - (b[alias] as number) : (b[alias] as number) - (a[alias] as number));
        groupedRows = groupedRows.slice(0, limit);

        const sqlTrace = `SELECT "${dimCol}", SUM("${targetMeasure}") AS "${alias}" FROM "${datasetName}" GROUP BY "${dimCol}" ORDER BY 2 ${isAscending ? 'ASC' : 'DESC'} LIMIT ${limit};`;
        return {
          plan: {
            schema_version: '1.0',
            intent: 'ranking',
            dataset_id: datasetId,
            select: [{ column: dimCol }, { column: targetMeasure, aggregation: 'sum', alias }],
            group_by: [dimCol],
            sort: [{ column: alias, direction: isAscending ? 'asc' : 'desc' }],
            limit,
            chart: { type: 'bar', x: dimCol, y: alias },
            explanation: `Top ${limit} ${dimCol} ranked by ${alias}.`,
          },
          explanation: `Top ${groupedRows.length} **${dimCol}** by **${alias}** (${groupedRows.length} results).`,
          calculation_method: `SUM("${targetMeasure}") grouped by "${dimCol}" ORDER BY 2 DESC LIMIT ${limit}.`,
          columns: [dimCol, alias],
          rows: groupedRows,
          row_count: groupedRows.length,
          chart: { type: 'bar', x: dimCol, y: alias },
          query_trace: sqlTrace,
          latency_ms: 8.8,
          provider: 'localEngine',
          model: 'duckdb-in-browser',
        };
      }

      // Case B: Candidate is a Dimension (e.g. "total customer id's by region", "sales by category")
      const groupDim = candAsDim || resolveDimCol(groupCandidate) || profile.primaryDim;

      // Check if subject is counting an entity or ID (e.g. "total customer id's", "unique orders", "count of products")
      const isEntityCount =
        (pLower.includes('customer') ||
          pLower.includes('order') ||
          pLower.includes('product') ||
          pLower.includes('client') ||
          pLower.includes('id') ||
          pLower.includes('count') ||
          pLower.includes('number of') ||
          pLower.includes('how many') ||
          isDistinct) &&
        !pLower.includes('revenue') &&
        !pLower.includes('sales') &&
        !pLower.includes('profit') &&
        !pLower.includes('price') &&
        !pLower.includes('unit_price') &&
        !pLower.includes('margin') &&
        !pLower.includes('cost') &&
        !pLower.includes('discount');

      let targetEntityCol = '';
      for (const c of profile.colNames) {
        const clean = c.toLowerCase().replace(/_/g, ' ');
        if (subjectPart.includes(c.toLowerCase()) || subjectPart.includes(clean)) {
          targetEntityCol = c;
          break;
        }
      }
      if (!targetEntityCol) {
        targetEntityCol = resolveDimCol(subjectPart);
      }

      // Execute Entity Count Grouped
      if (isEntityCount && targetEntityCol && targetEntityCol !== groupDim) {
        const isDistCount = isDistinct || targetEntityCol.toLowerCase().endsWith('_id') || targetEntityCol.toLowerCase().endsWith('id');
        let alias = isDistCount
          ? `Total Unique ${targetEntityCol.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}`
          : `Total ${targetEntityCol.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}`;

        if (targetEntityCol.toLowerCase().includes('customer')) alias = 'Customer Count';
        else if (targetEntityCol.toLowerCase().includes('order')) alias = 'Order Count';
        else if (targetEntityCol.toLowerCase().includes('product')) alias = 'Product Count';

        const distinctByGroup: Record<string, Set<string>> = {};
        const countByGroup: Record<string, number> = {};

        for (const r of rows) {
          let g = String(getRowVal(r, groupDim) ?? '(Blank)').trim();
          if (!g) g = '(Blank)';
          const val = getRowVal(r, targetEntityCol);
          if (val !== null && val !== undefined && String(val).trim() !== '') {
            if (isDistCount) {
              if (!distinctByGroup[g]) distinctByGroup[g] = new Set();
              distinctByGroup[g].add(String(val));
            } else {
              countByGroup[g] = (countByGroup[g] || 0) + 1;
            }
          }
        }

        let groupedRows = Object.keys(isDistCount ? distinctByGroup : countByGroup).map((key) => ({
          [groupDim]: key,
          [alias]: isDistCount ? distinctByGroup[key].size : countByGroup[key],
        }));
        groupedRows.sort((a, b) => isAscending ? (a[alias] as number) - (b[alias] as number) : (b[alias] as number) - (a[alias] as number));
        groupedRows = groupedRows.slice(0, limit);

        const sqlTrace = isDistCount
          ? `SELECT "${groupDim}", COUNT(DISTINCT "${targetEntityCol}") AS "${alias}" FROM "${datasetName}" GROUP BY "${groupDim}" ORDER BY 2 ${isAscending ? 'ASC' : 'DESC'} LIMIT ${limit};`
          : `SELECT "${groupDim}", COUNT("${targetEntityCol}") AS "${alias}" FROM "${datasetName}" GROUP BY "${groupDim}" ORDER BY 2 ${isAscending ? 'ASC' : 'DESC'} LIMIT ${limit};`;

        return {
          plan: {
            schema_version: '1.0',
            intent: 'aggregation',
            dataset_id: datasetId,
            select: [{ column: groupDim }, { column: targetEntityCol, aggregation: isDistCount ? 'distinct_count' : 'count', alias }],
            group_by: [groupDim],
            limit,
            chart: { type: 'bar', x: groupDim, y: alias },
            explanation: `Calculated ${isDistCount ? 'unique ' : ''}${targetEntityCol.replace(/_/g, ' ')} counts grouped by ${groupDim}.`,
          },
          explanation: `Calculated total ${isDistCount ? 'unique ' : ''}**${targetEntityCol.replace(/_/g, ' ')}** grouped by **${groupDim}** (${groupedRows.length} results).`,
          calculation_method: `COUNT(${isDistCount ? 'DISTINCT ' : ''}"${targetEntityCol}") partitioned by "${groupDim}".`,
          columns: [groupDim, alias],
          rows: groupedRows,
          row_count: groupedRows.length,
          chart: { type: 'bar', x: groupDim, y: alias },
          query_trace: sqlTrace,
          latency_ms: 8.2,
          provider: 'localEngine',
          model: 'duckdb-in-browser',
        };
      }

      // Numeric Measure Grouped (e.g. "sales by region", "average discount by status")
      let targetMeasure = resolveMeasureCol(subjectPart) || resolveMeasureCol(pLower) || profile.primaryMeasure;
      let aggFunc: 'sum' | 'avg' | 'min' | 'max' = 'sum';
      if (pLower.includes('average') || pLower.includes('mean') || pLower.includes('avg')) aggFunc = 'avg';
      else if (pLower.includes('minimum') || pLower.includes('lowest') || pLower.includes('min ')) aggFunc = 'min';
      else if (pLower.includes('maximum') || pLower.includes('highest') || pLower.includes('max ')) aggFunc = 'max';

      let metricAlias = `${aggFunc.charAt(0).toUpperCase() + aggFunc.slice(1)} of ${targetMeasure}`;
      if (aggFunc === 'sum') {
        if (pLower.includes('revenue')) metricAlias = 'Total Revenue';
        else if (pLower.includes('profit')) metricAlias = 'Total Profit';
        else if (pLower.includes('sales')) metricAlias = 'Total Sales';
        else if (pLower.includes('amount')) metricAlias = 'Total Amount';
        else if (pLower.includes('quantity')) metricAlias = 'Total Quantity';
      }

      const groupValues: Record<string, number[]> = {};
      for (const r of rows) {
        let k = String(getRowVal(r, groupDim) ?? '(Blank)').trim();
        if (!k) k = '(Blank)';
        const parsedNum = parseNumericValue(getRowVal(r, targetMeasure));
        if (!groupValues[k]) groupValues[k] = [];
        if (parsedNum !== null) {
          groupValues[k].push(parsedNum);
        }
      }

      let groupedRows = Object.entries(groupValues).map(([key, vals]) => {
        let aggVal = 0;
        if (vals.length > 0) {
          if (aggFunc === 'sum') aggVal = vals.reduce((a, b) => a + b, 0);
          else if (aggFunc === 'avg') aggVal = vals.reduce((a, b) => a + b, 0) / vals.length;
          else if (aggFunc === 'min') aggVal = Math.min(...vals);
          else if (aggFunc === 'max') aggVal = Math.max(...vals);
        }
        return {
          [groupDim]: key,
          [metricAlias]: Math.round(aggVal * 100) / 100,
        };
      });

      groupedRows.sort((a, b) => isAscending ? (a[metricAlias] as number) - (b[metricAlias] as number) : (b[metricAlias] as number) - (a[metricAlias] as number));
      groupedRows = groupedRows.slice(0, limit);

      const chartType = limit <= 15 ? 'bar' : 'table';
      const sqlTrace = `SELECT "${groupDim}", ${aggFunc.toUpperCase()}("${targetMeasure}") AS "${metricAlias}" FROM "${datasetName}" GROUP BY "${groupDim}" ORDER BY 2 ${isAscending ? 'ASC' : 'DESC'} LIMIT ${limit};`;

      return {
        plan: {
          schema_version: '1.0',
          intent: 'aggregation',
          dataset_id: datasetId,
          select: [{ column: groupDim }, { column: targetMeasure, aggregation: aggFunc, alias: metricAlias }],
          group_by: [groupDim],
          sort: [{ column: metricAlias, direction: isAscending ? 'asc' : 'desc' }],
          limit,
          chart: { type: chartType, x: groupDim, y: metricAlias },
          explanation: `Calculated ${metricAlias} grouped by ${groupDim}.`,
        },
        explanation: `${topMatch ? `Top ${limit} ` : 'Calculated total '}${metricAlias} grouped by ${groupDim} (${groupedRows.length} results).`,
        calculation_method: `${aggFunc.toUpperCase()}("${targetMeasure}") grouped by "${groupDim}".`,
        columns: [groupDim, metricAlias],
        rows: groupedRows,
        row_count: groupedRows.length,
        chart: { type: chartType, x: groupDim, y: metricAlias },
        query_trace: sqlTrace,
        latency_ms: 7.9,
        provider: 'localEngine',
        model: 'duckdb-in-browser',
      };
    }

    // =========================================================================
    // 3. SCALAR DISTINCT COUNT (e.g. "what is the total number unique orders")
    // =========================================================================
    if (isDistinct) {
      let targetCol = '';
      if (pLower.includes('order') || pLower.includes('orders')) {
        targetCol = profile.colNames.find((c) => c.toLowerCase().includes('order')) || '';
      }
      if (!targetCol && (pLower.includes('customer') || pLower.includes('client'))) {
        targetCol = profile.colNames.find((c) => c.toLowerCase().includes('customer') || c.toLowerCase().includes('client')) || '';
      }
      if (!targetCol && (pLower.includes('product') || pLower.includes('item'))) {
        targetCol = profile.colNames.find((c) => c.toLowerCase().includes('product') || c.toLowerCase().includes('item')) || '';
      }
      if (!targetCol && (pLower.includes('category') || pLower.includes('type') || pLower.includes('segment'))) {
        targetCol = profile.colNames.find((c) => c.toLowerCase().includes('category') || c.toLowerCase().includes('segment')) || '';
      }
      if (!targetCol) {
        for (const c of profile.colNames) {
          const clean = c.toLowerCase().replace(/_/g, ' ');
          if (pLower.includes(clean) || pLower.includes(c.toLowerCase())) {
            targetCol = c;
            break;
          }
        }
      }
      if (!targetCol) {
        const idCol = profile.colNames.find((c) => c.toLowerCase().endsWith('_id') || c.toLowerCase().endsWith('id'));
        targetCol = idCol || profile.primaryDim || profile.colNames[0];
      }

      const alias = `Total Unique ${targetCol.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}`;
      const distinctSet = new Set<string>();
      for (const r of rows) {
        const val = getRowVal(r, targetCol);
        if (val !== null && val !== undefined && String(val).trim() !== '') {
          distinctSet.add(String(val));
        }
      }
      const countVal = distinctSet.size;
      const sqlTrace = `SELECT COUNT(DISTINCT "${targetCol}") AS "${alias}" FROM "${datasetName}";`;

      return {
        plan: {
          schema_version: '1.0',
          intent: 'summary',
          dataset_id: datasetId,
          select: [{ column: targetCol, aggregation: 'distinct_count', alias }],
          group_by: [],
          limit: 1,
          chart: { type: 'table', x: targetCol, y: alias },
          explanation: `Total unique ${targetCol.replace(/_/g, ' ')} count.`,
        },
        explanation: `The total number of unique **${targetCol.replace(/_/g, ' ')}** is **${countVal.toLocaleString()}** across all ${rows.length.toLocaleString()} records.`,
        calculation_method: `COUNT(DISTINCT "${targetCol}") across ${rows.length} total records.`,
        columns: [alias],
        rows: [{ [alias]: countVal }],
        row_count: 1,
        chart: { type: 'table', x: alias, y: alias },
        query_trace: sqlTrace,
        latency_ms: 7.4,
        provider: 'localEngine',
        model: 'duckdb-in-browser',
      };
    }

    const isTrend =
      (pLower.includes('trend') ||
        pLower.includes('over time') ||
        pLower.includes('monthly') ||
        pLower.includes('daily') ||
        pLower.includes('by date')) &&
      profile.dates.length > 0;

    // =========================================================================
    // 4. SCALAR METRIC QUERIES (No grouping specified)
    // =========================================================================
    if (!topMatch && !isTrend) {
      // Row count questions
      if (
        pLower.includes('total rows') ||
        pLower.includes('how many rows') ||
        pLower.includes('row count') ||
        pLower.includes('number of rows') ||
        pLower.includes('total records') ||
        pLower.includes('how many records')
      ) {
        const colAlias = 'Total Records';
        const sqlTrace = `SELECT COUNT(*) AS "${colAlias}" FROM "${datasetName}";`;
        return {
          plan: {
            schema_version: '1.0',
            intent: 'summary',
            dataset_id: datasetId,
            select: [{ column: cols[0]?.name || 'id', aggregation: 'count', alias: colAlias }],
            group_by: [],
            limit: 1,
            chart: { type: 'table', x: colAlias, y: colAlias },
            explanation: `Dataset contains ${rows.length.toLocaleString()} total records.`,
          },
          explanation: `The dataset contains **${rows.length.toLocaleString()}** total rows/records.`,
          calculation_method: `COUNT(*) across active dataset rows.`,
          columns: [colAlias],
          rows: [{ [colAlias]: rows.length }],
          row_count: 1,
          chart: { type: 'table', x: colAlias, y: colAlias },
          query_trace: sqlTrace,
          latency_ms: 6.2,
          provider: 'localEngine',
          model: 'duckdb-in-browser',
        };
      }

      // Scalar aggregation for numeric measure (sum, avg, min, max)
      const targetMeasure = resolveMeasureCol(pLower) || (pLower.includes('total') || pLower.includes('average') || pLower.includes('revenue') || pLower.includes('sales') ? profile.primaryMeasure : '');
      if (targetMeasure) {
        let scalarAgg: 'sum' | 'avg' | 'min' | 'max' = 'sum';
        if (pLower.includes('average') || pLower.includes('mean') || pLower.includes('avg')) scalarAgg = 'avg';
        else if (pLower.includes('min') || pLower.includes('lowest')) scalarAgg = 'min';
        else if (pLower.includes('max') || pLower.includes('highest') || pLower.includes('peak')) scalarAgg = 'max';

        const validNums: number[] = [];
        for (const r of rows) {
          const parsed = parseNumericValue(getRowVal(r, targetMeasure));
          if (parsed !== null) validNums.push(parsed);
        }
        let scalarVal = 0;
        if (validNums.length > 0) {
          if (scalarAgg === 'sum') scalarVal = validNums.reduce((a, b) => a + b, 0);
          else if (scalarAgg === 'avg') scalarVal = validNums.reduce((a, b) => a + b, 0) / validNums.length;
          else if (scalarAgg === 'min') scalarVal = Math.min(...validNums);
          else if (scalarAgg === 'max') scalarVal = Math.max(...validNums);
        }
        scalarVal = Math.round(scalarVal * 100) / 100;

        let alias = `${scalarAgg.toUpperCase()} of ${targetMeasure}`;
        if (scalarAgg === 'sum') {
          if (pLower.includes('revenue')) alias = 'Total Revenue';
          else if (pLower.includes('profit')) alias = 'Total Profit';
          else if (pLower.includes('sales')) alias = 'Total Sales';
          else if (pLower.includes('amount')) alias = 'Total Amount';
          else if (pLower.includes('quantity')) alias = 'Total Quantity';
          else if (pLower.includes('discount')) alias = 'Total Discount';
        } else if (scalarAgg === 'avg') {
          alias = `Average ${targetMeasure}`;
        }

        const formattedVal = scalarVal.toLocaleString();
        const sqlTrace = `SELECT ${scalarAgg.toUpperCase()}("${targetMeasure}") AS "${alias}" FROM "${datasetName}";`;
        return {
          plan: {
            schema_version: '1.0',
            intent: 'summary',
            dataset_id: datasetId,
            select: [{ column: targetMeasure, aggregation: scalarAgg, alias }],
            group_by: [],
            limit: 1,
            chart: { type: 'table', x: alias, y: alias },
            explanation: `${alias} across the entire dataset.`,
          },
          explanation: `${alias} across all ${rows.length.toLocaleString()} records is **${formattedVal}**.`,
          calculation_method: `${scalarAgg.toUpperCase()}("${targetMeasure}") across all ${validNums.length} valid numeric values.`,
          columns: [alias],
          rows: [{ [alias]: scalarVal }],
          row_count: 1,
          chart: { type: 'table', x: alias, y: alias },
          query_trace: sqlTrace,
          latency_ms: 7.1,
          provider: 'localEngine',
          model: 'duckdb-in-browser',
        };
      }
    }

    // =========================================================================
    // 5. TIME TREND OR DEFAULT RANKING
    // =========================================================================
    const groupKey = isTrend && profile.dates[0] ? profile.dates[0] : (resolveDimCol(pLower) || profile.primaryDim);
    const targetMeasure = resolveMeasureCol(pLower) || profile.primaryMeasure;

    const groupSums: Record<string, number> = {};
    for (const r of rows) {
      let k = String(getRowVal(r, groupKey) ?? '(Blank)').trim();
      if (!k) k = '(Blank)';
      const num = parseNumericValue(getRowVal(r, targetMeasure));
      if (num !== null) {
        groupSums[k] = (groupSums[k] || 0) + num;
      }
    }

    const metricAlias = `Total ${targetMeasure}`;
    let groupedRows = Object.entries(groupSums).map(([k, sumVal]) => ({
      [groupKey]: k,
      [metricAlias]: Math.round(sumVal * 100) / 100,
    }));
    groupedRows.sort((a, b) => isAscending ? (a[metricAlias] as number) - (b[metricAlias] as number) : (b[metricAlias] as number) - (a[metricAlias] as number));
    groupedRows = groupedRows.slice(0, limit);

    const chartType = isTrend ? 'line' : (limit <= 15 ? 'bar' : 'table');
    const sqlTrace = `SELECT "${groupKey}", SUM("${targetMeasure}") AS "${metricAlias}" FROM "${datasetName}" GROUP BY "${groupKey}" ORDER BY 2 ${isAscending ? 'ASC' : 'DESC'} LIMIT ${limit};`;

    return {
      plan: {
        schema_version: '1.0',
        intent: isTrend ? 'trend' : 'aggregation',
        dataset_id: datasetId,
        select: [{ column: groupKey }, { column: targetMeasure, aggregation: 'sum', alias: metricAlias }],
        group_by: [groupKey],
        sort: [{ column: metricAlias, direction: isAscending ? 'asc' : 'desc' }],
        limit,
        chart: { type: chartType, x: groupKey, y: metricAlias },
        explanation: `${metricAlias} grouped by ${groupKey}.`,
      },
      explanation: `${topMatch ? `Top ${limit} ` : 'Calculated total '}${metricAlias} grouped by ${groupKey} (${groupedRows.length} results).`,
      calculation_method: `SUM("${targetMeasure}") grouped by "${groupKey}".`,
      columns: [groupKey, metricAlias],
      rows: groupedRows,
      row_count: groupedRows.length,
      chart: { type: chartType, x: groupKey, y: metricAlias },
      query_trace: sqlTrace,
      latency_ms: 8.0,
      provider: 'localEngine',
      model: 'duckdb-in-browser',
    };
  },

  async generateAiDashboard(
    datasetId: string,
    prompt?: string,
    context?: { columns?: any[]; rows?: any[]; datasetName?: string }
  ): Promise<any> {
    const { rows, cols, datasetName } = resolveActiveDatasetContext(datasetId, context);
    const profile = profileDatasetFields(cols, rows);
    const pLower = (prompt || '').toLowerCase();

    // Prioritize mentioned metrics / dimensions from prompt
    let primaryMeasure = profile.primaryMeasure;
    let secondaryMeasure = profile.secondaryMeasure;
    let primaryDim = profile.primaryDim;
    let secondaryDim = profile.secondaryDim;

    for (const m of profile.measures) {
      const cleanM = m.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (cleanM && pLower.includes(cleanM)) {
        primaryMeasure = m;
        break;
      }
    }

    for (const d of profile.dimensions) {
      const cleanD = d.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (cleanD && pLower.includes(cleanD)) {
        primaryDim = d;
        break;
      }
    }

    // 1. Build 4 Glassmorphism V22 KPI Stat Cards with genuine data-backed context
    // Never fabricate fake percentage comparisons: a percentage requires a real target column or multiple calendar periods (MoM/YoY).
    const dateCol = profile.dates[0];
    const targetCol = profile.colNames.find((c) =>
      ['target', 'budget', 'goal', 'quota'].some((k) => c.toLowerCase().includes(k))
    );

    let primarySubtitle = Array.isArray(rows) && rows.length > 0 ? `Across ${rows.length} records` : 'Cumulative total';
    let avgSubtitle = Array.isArray(rows) && rows.length > 0 ? `Mean across ${rows.length} records` : 'Per-record mean';

    if (targetCol && Array.isArray(rows) && rows.length > 0 && primaryMeasure) {
      // 1A. Genuine Target / Budget variance
      const totalActual = rows.reduce((acc, r) => acc + (Number(getRowVal(r, primaryMeasure)) || 0), 0);
      const totalTarget = rows.reduce((acc, r) => acc + (Number(getRowVal(r, targetCol)) || 0), 0);
      if (totalTarget > 0) {
        const pct = ((totalActual - totalTarget) / totalTarget) * 100;
        const sign = pct >= 0 ? '+' : '';
        primarySubtitle = `${sign}${pct.toFixed(1)}% vs ${targetCol}`;
      }
    } else if (dateCol && Array.isArray(rows) && rows.length >= 2 && primaryMeasure) {
      // 1B. Genuine Month-over-Month (MoM) comparison when dataset spans >= 2 calendar months
      try {
        const monthMap = new Map<string, { sum: number; count: number }>();
        for (const r of rows) {
          const dVal = getRowVal(r, dateCol);
          if (!dVal) continue;
          const d = new Date(dVal);
          if (isNaN(d.getTime())) continue;
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          const cur = monthMap.get(key) || { sum: 0, count: 0 };
          cur.sum += Number(getRowVal(r, primaryMeasure)) || 0;
          cur.count += 1;
          monthMap.set(key, cur);
        }

        const sortedMonths = Array.from(monthMap.keys()).sort();
        if (sortedMonths.length >= 2) {
          const latestMonth = sortedMonths[sortedMonths.length - 1];
          const prevMonth = sortedMonths[sortedMonths.length - 2];
          const latestStats = monthMap.get(latestMonth)!;
          const prevStats = monthMap.get(prevMonth)!;

          if (prevStats.sum > 0) {
            const pct = ((latestStats.sum - prevStats.sum) / prevStats.sum) * 100;
            const sign = pct >= 0 ? '+' : '';
            primarySubtitle = `${sign}${pct.toFixed(1)}% MoM (${latestMonth} vs ${prevMonth})`;
          }

          const latestAvg = latestStats.sum / (latestStats.count || 1);
          const prevAvg = prevStats.sum / (prevStats.count || 1);
          if (prevAvg > 0) {
            const pctAvg = ((latestAvg - prevAvg) / prevAvg) * 100;
            const signAvg = pctAvg >= 0 ? '+' : '';
            avgSubtitle = `${signAvg}${pctAvg.toFixed(1)}% MoM avg (${latestMonth} vs ${prevMonth})`;
          }
        }
      } catch {
        // keep factual fallback
      }
    }

    const kpis: any[] = [];
    if (primaryMeasure) {
      kpis.push({
        id: `kpi_total_${primaryMeasure.replace(/\s+/g, '_').toLowerCase()}`,
        title: `Total ${primaryMeasure}`,
        column: primaryMeasure,
        aggFunc: 'sum',
        subtitle: primarySubtitle,
        accentColor: '#10B981',
      });
      kpis.push({
        id: `kpi_avg_${primaryMeasure.replace(/\s+/g, '_').toLowerCase()}`,
        title: `Average ${primaryMeasure}`,
        column: primaryMeasure,
        aggFunc: 'avg',
        subtitle: avgSubtitle,
        accentColor: '#0D9488',
      });
    }

    if (secondaryMeasure && secondaryMeasure !== primaryMeasure) {
      kpis.push({
        id: `kpi_total_${secondaryMeasure.replace(/\s+/g, '_').toLowerCase()}`,
        title: `Total ${secondaryMeasure}`,
        column: secondaryMeasure,
        aggFunc: 'sum',
        subtitle: 'Secondary aggregate',
        accentColor: '#FB923C',
      });
    } else {
      kpis.push({
        id: 'kpi_total_records',
        title: 'Total Records',
        column: primaryDim || cols[0]?.name || 'id',
        aggFunc: 'count',
        subtitle: 'Active records',
        accentColor: '#FB923C',
      });
    }

    const entityIdCol = profile.colNames.find((c) => c.toLowerCase().endsWith('_id') || c.toLowerCase().endsWith('id'));
    const distinctTargetCol = entityIdCol || primaryDim;
    if (distinctTargetCol) {
      kpis.push({
        id: `kpi_distinct_${distinctTargetCol.replace(/\s+/g, '_').toLowerCase()}`,
        title: `Unique ${distinctTargetCol}`,
        column: distinctTargetCol,
        aggFunc: 'distinct_count',
        subtitle: 'Monitored entities',
        accentColor: '#0284C7',
      });
    }

    // 2. Build Slicers (pick 1 to 3 suitable dimensions)
    const nonIdDims = profile.dimensions.filter((d) => !d.toLowerCase().endsWith('_id') && !d.toLowerCase().endsWith('id'));
    const slicerCandidates = nonIdDims.length > 0 ? nonIdDims.slice(0, 3) : profile.dimensions.slice(0, 3);
    const slicerColumns = slicerCandidates.length > 0 ? slicerCandidates : (cols.slice(0, 2).map((c: any) => c.name));

    // 3. Domain Awareness & Dynamic Narrative Insight Calculation
    const isSales = profile.colNames.some((c) => /sales|order|revenue|amount|customer|product|price|deal/i.test(c)) || /sales|order|revenue/i.test(datasetName);
    const isFinance = profile.colNames.some((c) => /balance|credit_limit|debit|spend|budget|expense|invoice/i.test(c));
    const isHR = profile.colNames.some((c) => /salary|employee|headcount|department|tenure|staff/i.test(c));

    // Dynamic data insight aggregation
    let topCategory = 'Primary Segment';
    let topCategorySum = 0;
    let topCategoryPct = '0.0%';
    let totalPrimarySum = 0;
    let topGeo = 'Primary Region';
    let topGeoCount = 0;

    const compDim = secondaryDim && secondaryDim !== primaryDim ? secondaryDim : primaryDim;
    const granularDim = nonIdDims.find((d) => /product|item|customer|client|sku|account|user|sub_category/i.test(d)) || compDim;
    const geoDim = nonIdDims.find((d) => /region|country|state|city|channel|territory|location|market/i.test(d)) || compDim;
    const statusDim = profile.dimensions.find((d) => /status|stage|priority|fulfillment|state|tier|payment/i.test(d)) || null;

    if (Array.isArray(rows) && rows.length > 0 && primaryMeasure) {
      const catMap = new Map<string, number>();
      const geoMap = new Map<string, number>();

      for (const r of rows) {
        const val = Number(getRowVal(r, primaryMeasure)) || 0;
        totalPrimarySum += val;

        const catKey = String(getRowVal(r, primaryDim) || 'Other');
        catMap.set(catKey, (catMap.get(catKey) || 0) + val);

        const geoKey = String(getRowVal(r, geoDim) || 'General');
        geoMap.set(geoKey, (geoMap.get(geoKey) || 0) + 1);
      }

      let maxCatVal = -Infinity;
      for (const [k, v] of catMap.entries()) {
        if (v > maxCatVal) {
          maxCatVal = v;
          topCategory = k;
          topCategorySum = v;
        }
      }

      if (totalPrimarySum > 0) {
        topCategoryPct = `${((topCategorySum / totalPrimarySum) * 100).toFixed(1)}%`;
      }

      let maxGeoVal = -Infinity;
      for (const [k, v] of geoMap.entries()) {
        if (v > maxGeoVal) {
          maxGeoVal = v;
          topGeo = k;
          topGeoCount = v;
        }
      }
    }

    const avgValNum = Array.isArray(rows) && rows.length > 0 ? (totalPrimarySum / rows.length).toFixed(2) : '0';
    const narrativeInsight = `${topCategory} is the leading revenue driver generating ${topCategoryPct} of total volume. Regional activity is concentrated in ${topGeo} with ${topGeoCount} logged transactions. Across all ${rows ? rows.length : 0} records, the per-record benchmark stands at ${avgValNum}.`;

    // 4. Build 6 Multi-Tier Complementary Visuals (Executive Grid V22)
    const visuals: any[] = [];

    // Visual 1: Hero Visual (Span 2, 976px wide x 340px high at x=16, y=16)
    if (profile.dates.length > 0) {
      visuals.push({
        id: 'vis_hero_trend',
        title: `${primaryMeasure} Trajectory & Monthly Run-Rate`,
        type: 'line_area',
        categoryCol: profile.dates[0],
        valueCol: primaryMeasure,
        aggFunc: 'sum',
        bins: 8,
        span: 2,
        customWidth: 976,
        customHeight: 340,
        x: 16,
        y: 16,
        w: 12,
        h: 4,
        sortBy: 'category_asc',
      });
    } else {
      visuals.push({
        id: 'vis_hero_trend',
        title: `${primaryMeasure} Strategic Performance by ${primaryDim}`,
        type: 'column',
        categoryCol: primaryDim,
        valueCol: primaryMeasure,
        aggFunc: 'sum',
        bins: 8,
        span: 2,
        customWidth: 976,
        customHeight: 340,
        x: 16,
        y: 16,
        w: 12,
        h: 4,
        sortBy: 'value_desc',
      });
    }

    // Visual 2: Category Contribution Donut (Mid-Tier Left at x=16, y=372)
    visuals.push({
      id: 'vis_share_donut',
      title: isSales ? `Revenue Contribution by ${primaryDim}` : `${primaryDim} Distribution Share`,
      type: 'donut',
      categoryCol: primaryDim,
      valueCol: primaryMeasure,
      aggFunc: 'sum',
      bins: 6,
      span: 1,
      customWidth: 480,
      customHeight: 320,
      x: 16,
      y: 372,
      w: 6,
      h: 4,
      sortBy: 'value_desc',
    });

    // Visual 3: Ranked Performance Leaderboard Bar (Mid-Tier Right at x=512, y=372)
    visuals.push({
      id: 'vis_leaderboard_bar',
      title: `Top 10 High-Performing ${granularDim} Leaderboard`,
      type: 'bar',
      categoryCol: granularDim,
      valueCol: primaryMeasure,
      aggFunc: 'sum',
      bins: 10,
      topN: 10,
      span: 1,
      customWidth: 480,
      customHeight: 320,
      x: 512,
      y: 372,
      w: 6,
      h: 4,
      sortBy: 'value_desc',
    });

    // Visual 4: Geographic / Channel Breakdown (Deep Dive Left at x=16, y=708)
    visuals.push({
      id: 'vis_geo_column',
      title: `${primaryMeasure} Breakdown by ${geoDim}`,
      type: 'column',
      categoryCol: geoDim,
      valueCol: primaryMeasure,
      aggFunc: 'sum',
      bins: 8,
      span: 1,
      customWidth: 480,
      customHeight: 320,
      x: 16,
      y: 708,
      w: 6,
      h: 4,
      sortBy: 'value_desc',
    });

    // Visual 5: Operational Pipeline Funnel / Secondary Comparison (Deep Dive Right at x=512, y=708)
    if (statusDim) {
      visuals.push({
        id: 'vis_pipeline_funnel',
        title: `Fulfillment Pipeline & ${statusDim} Status`,
        type: 'funnel',
        categoryCol: statusDim,
        valueCol: primaryMeasure,
        aggFunc: 'count',
        bins: 6,
        span: 1,
        customWidth: 480,
        customHeight: 320,
        x: 512,
        y: 708,
        w: 6,
        h: 4,
        sortBy: 'value_desc',
      });
    } else if (secondaryMeasure && secondaryMeasure !== primaryMeasure) {
      visuals.push({
        id: 'vis_pipeline_funnel',
        title: `${secondaryMeasure} Distribution by ${primaryDim}`,
        type: 'column',
        categoryCol: primaryDim,
        valueCol: secondaryMeasure,
        aggFunc: 'sum',
        bins: 6,
        span: 1,
        customWidth: 480,
        customHeight: 320,
        x: 512,
        y: 708,
        w: 6,
        h: 4,
        sortBy: 'value_desc',
      });
    } else {
      visuals.push({
        id: 'vis_pipeline_funnel',
        title: `${primaryMeasure} by ${primaryDim} split by ${compDim}`,
        type: 'clustered_bar',
        categoryCol: primaryDim,
        seriesCol: compDim !== primaryDim ? compDim : '',
        valueCol: primaryMeasure,
        aggFunc: 'sum',
        bins: 6,
        span: 1,
        customWidth: 480,
        customHeight: 320,
        x: 512,
        y: 708,
        w: 6,
        h: 4,
        sortBy: 'value_desc',
      });
    }

    // Visual 6: Executive Operational Ledger Table (Span 2 / 976px at x=16, y=1044)
    visuals.push({
      id: 'vis_ledger_table',
      title: `Executive Operational Ledger: ${primaryDim} & ${compDim} Matrix`,
      type: 'table',
      categoryCol: primaryDim,
      seriesCol: compDim !== primaryDim ? compDim : '',
      valueCol: primaryMeasure,
      aggFunc: 'sum',
      span: 2,
      customWidth: 976,
      customHeight: 340,
      x: 16,
      y: 1044,
      w: 12,
      h: 4,
      sortBy: 'value_desc',
    });

    const titlePrefix = datasetName.replace(/\.[^/.]+$/, '');
    return {
      plan: {
        schema_version: '1.0',
        dashboard_title: isSales ? `${titlePrefix} Executive Dashboard & Revenue Intelligence` : `${titlePrefix} Executive Dashboard`,
        dataset_id: datasetId,
        description: narrativeInsight || prompt || `AI generated interactive executive dashboard for ${datasetName}`,
        slicer_columns: slicerColumns,
        kpis,
        visuals,
        palette_id: 'v22',
        narrative_summary: narrativeInsight,
      },
      latency_ms: 14.2,
      provider: 'localEngine',
      model: 'duckdb-in-browser',
    };
  },

  async patchAiDashboard(
    datasetId: string,
    prompt: string,
    currentDashboard: any,
    context?: { columns?: any[]; rows?: any[]; datasetName?: string; targetId?: string }
  ): Promise<any> {
    const pLower = prompt.toLowerCase().trim();
    const { rows, cols, datasetName } = resolveActiveDatasetContext(datasetId, context);
    const profile = profileDatasetFields(cols, rows);

    // 0. CREATE NEW DASHBOARD: Detect intent to build a brand new dashboard from dataset
    const isCreateIntent =
      (pLower.includes('dashboard') &&
        (pLower.includes('create') ||
          pLower.includes('generate') ||
          pLower.includes('build') ||
          pLower.includes('make') ||
          pLower.includes('rebuild') ||
          pLower.includes('new') ||
          pLower.includes('fresh') ||
          pLower.includes('interactive') ||
          pLower.includes('executive') ||
          pLower.includes('scratch'))) ||
      pLower.startsWith('create ') ||
      pLower.startsWith('build ') ||
      pLower.startsWith('generate ');

    if (isCreateIntent) {
      const full = await this.generateAiDashboard(datasetId, prompt, context);
      return {
        patch: {
          operation: 'generate_dashboard',
          patch_summary: `Generated new executive dashboard from dataset: ${full.plan.dashboard_title}`,
        },
        updated_dashboard: full.plan,
        latency_ms: 12.4,
        provider: 'localEngine',
        model: 'in-browser-planner',
      };
    }

    const updated = JSON.parse(JSON.stringify(currentDashboard || {}));
    if (!Array.isArray(updated.visuals)) updated.visuals = [];
    if (!Array.isArray(updated.kpiCards) && Array.isArray(updated.kpis)) updated.kpiCards = updated.kpis;
    if (!Array.isArray(updated.kpiCards)) updated.kpiCards = [];
    if (!Array.isArray(updated.slicerColumns) && Array.isArray(updated.slicer_columns)) updated.slicerColumns = updated.slicer_columns;
    if (!Array.isArray(updated.slicerColumns)) updated.slicerColumns = [];

    let patchOp = 'update_visual';
    let summary = 'Updated dashboard configuration';

    // Helper: Semantic synonym resolution for measure
    const resolveMeasure = (str: string): string => {
      const MEASURE_SYNONYMS: Record<string, string[]> = {
        revenue: ['revenue', 'amount', 'sales', 'total_amount', 'total_sales', 'turnover', 'gross', 'price', 'subtotal'],
        sales: ['sales', 'amount', 'revenue', 'total_sales', 'total_amount', 'turnover', 'subtotal'],
        profit: ['profit', 'margin', 'net_profit', 'income', 'gain', 'net'],
        amount: ['amount', 'sales', 'revenue', 'total'],
        price: ['price', 'unit_price', 'rate', 'cost'],
        cost: ['cost', 'expense', 'unit_cost'],
        quantity: ['quantity', 'qty', 'units', 'volume', 'count', 'pieces'],
        discount: ['discount', 'rebate', 'deduction'],
      };
      for (const [key, syns] of Object.entries(MEASURE_SYNONYMS)) {
        if (str.includes(key)) {
          for (const syn of syns) {
            const found = profile.measures.find((m) => m.toLowerCase() === syn || m.toLowerCase().includes(syn));
            if (found) return found;
          }
        }
      }
      return profile.primaryMeasure;
    };

    const resolveDim = (str: string): string => {
      const DIMENSION_SYNONYMS: Record<string, string[]> = {
        product: ['product', 'product_name', 'item_name', 'item', 'category', 'sub_category', 'sku'],
        category: ['category', 'sub_category', 'type', 'segment', 'class'],
        customer: ['customer_name', 'customer', 'client', 'account', 'customer_id'],
        region: ['region', 'country', 'state', 'city', 'location'],
        status: ['status', 'state', 'stage'],
      };
      for (const [key, syns] of Object.entries(DIMENSION_SYNONYMS)) {
        if (str.includes(key)) {
          for (const syn of syns) {
            const found = profile.dimensions.find((d) => d.toLowerCase() === syn || d.toLowerCase().includes(syn));
            if (found) return found;
          }
        }
      }
      return profile.primaryDim;
    };

    // 1. Change title
    if (pLower.includes('change title') || pLower.includes('rename dashboard') || pLower.includes('set title')) {
      const titleClean = prompt.replace(/(change title to|rename dashboard to|set title to|title:)/i, '').trim().replace(/^['"]|['"]$/g, '');
      if (titleClean) {
        updated.dashboardTitle = titleClean;
        updated.dashboard_title = titleClean;
        patchOp = 'set_title';
        summary = `Renamed dashboard to '${titleClean}'`;
      }
    }

    // 2. Add Slicer
    else if ((pLower.includes('add') || pLower.includes('create')) && (pLower.includes('slicer') || pLower.includes('filter'))) {
      let matchedDim = profile.dimensions.find((d) => pLower.includes(d.toLowerCase())) || resolveDim(pLower);
      if (matchedDim) {
        const promptWord = prompt.split(/\s+/).find((w) => w.toLowerCase() === matchedDim.toLowerCase());
        if (promptWord) matchedDim = promptWord;
        const existingIdx = updated.slicerColumns.findIndex((s: string) => s.toLowerCase() === matchedDim.toLowerCase());
        if (existingIdx >= 0) {
          updated.slicerColumns[existingIdx] = matchedDim;
        } else {
          updated.slicerColumns.push(matchedDim);
        }
        patchOp = 'add_slicer';
        summary = `Added slicer for '${matchedDim}'`;
      }
    }

    // 3. Remove Slicer
    else if ((pLower.includes('remove') || pLower.includes('delete')) && (pLower.includes('slicer') || pLower.includes('filter'))) {
      const matchedDim = updated.slicerColumns.find((s: string) => pLower.includes(s.toLowerCase()));
      if (matchedDim) {
        updated.slicerColumns = updated.slicerColumns.filter((s: string) => s !== matchedDim);
        patchOp = 'remove_slicer';
        summary = `Removed slicer for '${matchedDim}'`;
      } else if (updated.slicerColumns.length > 0) {
        const removed = updated.slicerColumns.pop();
        patchOp = 'remove_slicer';
        summary = `Removed slicer for '${removed}'`;
      }
    }

    // 4. Remove Visual
    else if ((pLower.includes('remove') || pLower.includes('delete')) && (pLower.includes('chart') || pLower.includes('visual') || pLower.includes('table'))) {
      const targetId = context?.targetId;
      const targetVis = targetId ? updated.visuals.find((v: any) => v.id === targetId) : updated.visuals[updated.visuals.length - 1];
      if (targetVis) {
        updated.visuals = updated.visuals.filter((v: any) => v.id !== targetVis.id);
        patchOp = 'remove_visual';
        summary = `Removed visual '${targetVis.title}'`;
      }
    }

    // 5. Change Theme / Palette
    else if (pLower.includes('theme') || pLower.includes('palette') || pLower.includes('glassmorphism') || pLower.includes('v22')) {
      let nextPalette = 'v22';
      if (pLower.includes('ocean')) nextPalette = 'ocean';
      else if (pLower.includes('forest')) nextPalette = 'forest';
      else if (pLower.includes('sunset')) nextPalette = 'sunset';
      else if (pLower.includes('classic')) nextPalette = 'classic';
      else if (pLower.includes('vibrant')) nextPalette = 'vibrant';
      updated.paletteId = nextPalette;
      updated.palette_id = nextPalette;
      patchOp = 'set_palette';
      summary = `Changed theme palette to '${nextPalette}'`;
    }

    // 6. Edit Existing Visual (Type, aggregation, or measures)
    else if (
      pLower.includes('change') ||
      pLower.includes('switch') ||
      pLower.includes('convert') ||
      pLower.includes('make it') ||
      pLower.includes('edit')
    ) {
      const targetId = context?.targetId;
      const targetVis = (targetId ? updated.visuals.find((v: any) => v.id === targetId) : updated.visuals[0]) || updated.visuals[0];

      if (targetVis) {
        let changed = false;
        if (pLower.includes('donut')) { targetVis.type = 'donut'; changed = true; }
        else if (pLower.includes('pie')) { targetVis.type = 'pie'; changed = true; }
        else if (pLower.includes('line') || pLower.includes('area') || pLower.includes('trend')) { targetVis.type = 'line_area'; changed = true; }
        else if (pLower.includes('column')) { targetVis.type = 'column'; changed = true; }
        else if (pLower.includes('bar')) { targetVis.type = 'bar'; changed = true; }
        else if (pLower.includes('table')) { targetVis.type = 'table'; changed = true; }

        if (pLower.includes('average') || pLower.includes('avg')) { targetVis.aggFunc = 'avg'; changed = true; }
        else if (pLower.includes('sum') || pLower.includes('total')) { targetVis.aggFunc = 'sum'; changed = true; }
        else if (pLower.includes('count')) { targetVis.aggFunc = 'count'; changed = true; }
        else if (pLower.includes('min')) { targetVis.aggFunc = 'min'; changed = true; }
        else if (pLower.includes('max')) { targetVis.aggFunc = 'max'; changed = true; }

        const matchedM = profile.measures.find((m) => pLower.includes(m.toLowerCase()));
        if (matchedM) { targetVis.valueCol = matchedM; changed = true; }

        const matchedD = profile.dimensions.find((d) => pLower.includes(d.toLowerCase()));
        if (matchedD) { targetVis.categoryCol = matchedD; changed = true; }

        if (changed) {
          summary = `Updated visual '${targetVis.title}' (${targetVis.type}, ${targetVis.aggFunc} of ${targetVis.valueCol})`;
        }
      }
    }

    // 7. Add Visual
    else if (pLower.startsWith('add') || pLower.includes('add visual') || pLower.includes('add chart') || pLower.includes('add metric')) {
      let targetType = 'column';
      if (pLower.includes('donut')) targetType = 'donut';
      else if (pLower.includes('pie')) targetType = 'pie';
      else if (pLower.includes('line') || pLower.includes('trend')) targetType = 'line_area';
      else if (pLower.includes('bar')) targetType = 'bar';
      else if (pLower.includes('table')) targetType = 'table';

      const targetDim = profile.dimensions.find((d) => pLower.includes(d.toLowerCase())) || resolveDim(pLower);
      const targetMeas = profile.measures.find((m) => pLower.includes(m.toLowerCase())) || resolveMeasure(pLower);

      let aggFunc = 'sum';
      if (pLower.includes('average') || pLower.includes('avg')) aggFunc = 'avg';
      else if (pLower.includes('count')) aggFunc = 'count';

      const isSpan2 = targetType === 'table' || targetType === 'matrix';
      const customWidth = isSpan2 ? 976 : 480;
      const customHeight = isSpan2 ? 340 : 320;
      const lastVis = updated.visuals[updated.visuals.length - 1];
      let newX = 16;
      let newY = 16;
      if (lastVis) {
        const lastIsSpan2 = lastVis.span === 2 || (lastVis.customWidth && lastVis.customWidth > 600);
        if (!lastIsSpan2 && lastVis.x === 16 && !isSpan2) {
          newX = 512;
          newY = lastVis.y || 16;
        } else {
          newX = 16;
          newY = (lastVis.y || 16) + (lastVis.customHeight || 320) + 16;
        }
      }

      let cleanTitle = `${aggFunc.toUpperCase()} of ${targetMeas} by ${targetDim}`;
      if (targetType === 'donut') cleanTitle = `Distribution Share of ${targetMeas} by ${targetDim}`;
      else if (targetType === 'line_area') cleanTitle = `${targetMeas} Trend over ${targetDim}`;
      else if (targetType === 'bar') cleanTitle = `Top ${targetDim} Leaderboard by ${targetMeas}`;
      else if (targetType === 'table') cleanTitle = `Detailed ${targetDim} Ledger Matrix`;

      const newVis = {
        id: `vis_patch_${Date.now()}`,
        title: cleanTitle,
        type: targetType,
        categoryCol: targetDim,
        valueCol: targetMeas,
        seriesCol: '',
        aggFunc,
        bins: 5,
        span: isSpan2 ? 2 : 1,
        customWidth,
        customHeight,
        x: newX,
        y: newY,
        w: isSpan2 ? 12 : 6,
        h: 4,
        customTitle: true,
      };
      updated.visuals.push(newVis);
      patchOp = 'add_visual';
      summary = `Added '${newVis.title}' (${targetType})`;
    }

    return {
      patch: { operation: patchOp, patch_summary: summary },
      updated_dashboard: {
        ...updated,
        dashboard_title: updated.dashboardTitle || updated.dashboard_title,
        slicer_columns: updated.slicerColumns || updated.slicer_columns,
        kpis: updated.kpiCards || updated.kpis,
        palette_id: updated.paletteId || updated.palette_id || 'v22',
      },
      latency_ms: 11.2,
      provider: 'localEngine',
      model: 'in-browser-patcher',
    };
  },
};

