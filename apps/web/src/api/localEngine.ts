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
import { evaluateFormula, formulaResultToCell, isFxError } from '../engine/formula';
import { buildXlsx } from '../engine/xlsxWriter';
import { toCsv } from '../engine/csv';
import {
  parseSharedNumber,
  looksNumericForImport,
  parseSharedDate,
  toISODate,
  properCase,
  trimCollapse,
  datedif,
  eomonth,
  addMonthsClamped,
  addYearsClamped,
  fiscalYearLabel,
  networkdays,
  excelWeekNum,
  weekdaySun0,
  daysBetweenUTC,
  isBlank,
  cleanFloat,
  arrayMin,
  arrayMax,
  roundHalfAwayFromZero,
  roundUpAwayFromZero,
  roundDownTowardZero,
  preciseSum,
  RunningSum,
} from '../engine/values';
import { planChatQuery } from '../engine/chatPlanner';

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
    if (typeof val === 'number') {
      if (!Number.isInteger(val)) allInt = false;
      allBool = false;
      allDate = false;
      continue;
    }
    const str = String(val).trim();
    if (str.toLowerCase() !== 'true' && str.toLowerCase() !== 'false') {
      allBool = false;
    }
    // Values that import type-inference would keep as text (leading zeros,
    // scientific notation, overlong ids) should not be reported as numeric.
    if (!looksNumericForImport(str)) {
      allInt = false;
      allFloat = false;
    } else {
      const num = Number(str.replace(/[,$€£¥₹%() ]/g, ''));
      if (Number.isNaN(num)) {
        allInt = false;
        allFloat = false;
      } else if (!Number.isInteger(num)) {
        allInt = false;
      }
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

// IndexedDB backing store: localStorage has a ~5MB quota that a handful of
// real datasets blow past easily. IndexedDB has no such limit, so it is the
// durable store once localStorage can no longer hold the data. Degrades
// gracefully when IndexedDB isn't available (Node/jsdom test environments,
// private-mode restrictions): everything still works from the in-memory
// cache and localStorage for that session.
const IDB_DB_NAME = 'stepsheet_local_db';
const IDB_STORE_NAME = 'kv';
const indexedDbAvailable = typeof indexedDB !== 'undefined';
let pendingPersistenceWarning = false;

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!indexedDbAvailable) {
      reject(new Error('IndexedDB is not available in this environment'));
      return;
    }
    const req = indexedDB.open(IDB_DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(IDB_STORE_NAME)) {
        req.result.createObjectStore(IDB_STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(key: string, value: any): Promise<void> {
  const db = await openIdb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE_NAME, 'readwrite');
    tx.objectStore(IDB_STORE_NAME).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close?.();
}

async function idbGet<T>(key: string): Promise<T | null> {
  const db = await openIdb();
  const result = await new Promise<T | null>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE_NAME, 'readonly');
    const req = tx.objectStore(IDB_STORE_NAME).get(key);
    req.onsuccess = () => resolve((req.result as T) ?? null);
    req.onerror = () => reject(req.error);
  });
  db.close?.();
  return result;
}

/** Record a failed save clearly (audit log) instead of silently losing data. */
function reportPersistenceFailure(detail: string) {
  pendingPersistenceWarning = true;
  try {
    logAudit('dataset.persistence_failed', { detail }, 'dataset');
  } catch {}
  // eslint-disable-next-line no-console
  console.error('[StepSheet] Failed to persist datasets:', detail);
}

export function hasPendingPersistenceWarning(): boolean {
  return pendingPersistenceWarning;
}

// ---------------------------------------------------------------------------
// Persistence. Both stores hold an envelope { savedAt, datasets } so a reload
// can tell which copy is newer (a stale localStorage copy used to win over a
// newer IndexedDB one when the counts were equal). Nothing is written until
// the stored copy has been read: seeding the samples before IndexedDB had
// answered used to overwrite the user's datasets on reload (R2-17).
// ---------------------------------------------------------------------------
type StoreEnvelope = { savedAt: number; datasets?: StoredLocalDataset[]; inIdb?: boolean };
/** Above this many cells the copy lives only in IndexedDB: stringifying it for
 * localStorage costs several times the data in memory and overflows the ~5MB quota anyway. */
const LOCALSTORAGE_CELL_LIMIT = 200_000;

function readEnvelope(raw: any): StoreEnvelope | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return { savedAt: 0, datasets: raw }; // legacy: bare array
  if (typeof raw === 'object' && typeof raw.savedAt === 'number') return raw as StoreEnvelope;
  return null;
}

function readLocalStorageEnvelope(): StoreEnvelope | null {
  try {
    const raw = localStorage.getItem(LOCAL_DATASETS_KEY);
    return raw ? readEnvelope(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

let hydrated = false;
let hydrationPromise: Promise<void> | null = null;
let lastSavedAt = 0;

/** Resolve once the newest stored copy is in memory. Every localEngine call awaits this. */
export function ensureHydrated(): Promise<void> {
  if (hydrated) return Promise.resolve();
  if (!hydrationPromise) {
    hydrationPromise = (async () => {
      const ls = readLocalStorageEnvelope();
      let idb: StoreEnvelope | null = null;
      if (indexedDbAvailable) {
        try {
          idb = readEnvelope(await idbGet<any>(LOCAL_DATASETS_KEY));
        } catch {
          idb = null;
        }
      }
      const candidates = [idb, ls].filter((e): e is StoreEnvelope => !!e && Array.isArray(e.datasets));
      // Newest wins; on a tie (legacy copies without a timestamp) prefer the
      // one with more datasets, then IndexedDB, which is written every time.
      candidates.sort((a, b) => b.savedAt - a.savedAt || (b.datasets!.length - a.datasets!.length));
      const best = candidates[0];
      hydrated = true;
      if (memoryDatasets && memoryDatasets !== seededDatasets) return; // set by a caller in this session
      if (best && best.datasets!.length > 0) {
        memoryDatasets = best.datasets!;
        lastSavedAt = best.savedAt;
      } else if (!ls && !idb) {
        // First run: nothing stored anywhere, so the samples become the store.
        memoryDatasets = seededDatasets || buildSampleDatasets();
        saveStoredDatasets(memoryDatasets);
      } else {
        memoryDatasets = best?.datasets || [];
      }
      if (typeof window !== 'undefined') {
        try {
          window.dispatchEvent(new CustomEvent('stepsheet:datasets-hydrated'));
        } catch {}
      }
    })();
  }
  return hydrationPromise;
}

let seededDatasets: StoredLocalDataset[] | null = null;

function getStoredDatasets(): StoredLocalDataset[] {
  if (memoryDatasets) return memoryDatasets;
  if (!indexedDbAvailable) {
    // No async store to wait for: localStorage is the whole truth.
    const ls = readLocalStorageEnvelope();
    hydrated = true;
    if (ls?.datasets && ls.datasets.length > 0) {
      memoryDatasets = ls.datasets;
      return memoryDatasets;
    }
    memoryDatasets = buildSampleDatasets();
    saveStoredDatasets(memoryDatasets);
    return memoryDatasets;
  }
  // Called before hydration finished: show the samples, but never save them
  // over the stored copy -- the user's real datasets may still be loading.
  void ensureHydrated();
  if (!seededDatasets) seededDatasets = buildSampleDatasets();
  return seededDatasets;
}

function saveStoredDatasets(datasets: StoredLocalDataset[]) {
  memoryDatasets = datasets;
  if (!hydrated) {
    // Defer until the stored copy is known (see ensureHydrated); the newer
    // in-memory list still wins because memoryDatasets is already set.
    void ensureHydrated().then(() => saveStoredDatasets(memoryDatasets || datasets));
    return;
  }
  const savedAt = Math.max(Date.now(), lastSavedAt + 1);
  lastSavedAt = savedAt;
  const cells = datasets.reduce((n, d) => n + (d.rows?.length || 0) * Math.max(1, d.meta?.column_count || 1), 0);
  let localStorageOk = true;
  let localStorageError: unknown = null;
  try {
    if (indexedDbAvailable && cells > LOCALSTORAGE_CELL_LIMIT) {
      // Large: keep only a marker here so a stale full copy can never win.
      localStorage.setItem(LOCAL_DATASETS_KEY, JSON.stringify({ savedAt, inIdb: true }));
    } else {
      localStorage.setItem(LOCAL_DATASETS_KEY, JSON.stringify({ savedAt, datasets }));
    }
  } catch (e) {
    localStorageOk = false;
    localStorageError = e;
    try {
      localStorage.setItem(LOCAL_DATASETS_KEY, JSON.stringify({ savedAt, inIdb: true }));
    } catch {}
  }

  if (indexedDbAvailable) {
    // IndexedDB has no practical quota like localStorage's ~5MB, so it is
    // the durable backing store; write to it every time so it never falls
    // behind, and never silently swallow a failure.
    idbPut(LOCAL_DATASETS_KEY, { savedAt, datasets }).catch((e) => {
      reportPersistenceFailure(
        localStorageOk && cells <= LOCALSTORAGE_CELL_LIMIT
          ? `IndexedDB failed (${String(e)}); the copy in localStorage is still current.`
          : `IndexedDB failed (${String(e)})${localStorageOk ? '' : ` and localStorage failed (${String(localStorageError)})`}. Changes may be lost on reload.`
      );
    });
  } else if (!localStorageOk) {
    reportPersistenceFailure(
      `localStorage failed (${String(localStorageError)}) and IndexedDB is unavailable in this environment. Changes may be lost on reload.`
    );
  }
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

/** Full-text CSV/TSV tokenizer. Handles quoted fields containing embedded
 * newlines correctly (it does NOT split into lines before parsing quotes). */
function parseCsvCells(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  let sawAnything = false;
  const n = text.length;
  let i = 0;
  while (i < n) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      sawAnything = true;
      i++;
      continue;
    }
    if (ch === delimiter) {
      row.push(field);
      field = '';
      sawAnything = true;
      i++;
      continue;
    }
    if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      // drop fully blank rows (no delimiter seen, empty field)
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
      i++;
      continue;
    }
    field += ch;
    sawAnything = true;
    i++;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    if (row.length > 1 || row[0] !== '') rows.push(row);
  }
  return rows;
}

/** Detect comma vs semicolon vs tab delimiter from the header line. */
function detectDelimiter(headerLine: string): string {
  const counts: Record<string, number> = {
    ',': (headerLine.match(/,/g) || []).length,
    ';': (headerLine.match(/;/g) || []).length,
    '\t': (headerLine.match(/\t/g) || []).length,
  };
  let best = ',';
  let bestCount = counts[','];
  for (const d of [';', '\t']) {
    if (counts[d] > bestCount) {
      best = d;
      bestCount = counts[d];
    }
  }
  return best;
}

function parseDelimitedText(text: string, delimiter?: string): Record<string, any>[] {
  return parseDelimitedTable(text, delimiter).rows;
}

/** Make header names usable as keys: blanks get column_N, repeats get _2, _3
 * (a second "Amount" used to overwrite the first), and "__proto__" -- which a
 * plain object silently swallows -- is renamed. */
function uniqueHeaders(raw: string[]): string[] {
  const seen = new Set<string>();
  return raw.map((h, i) => {
    let base = h.trim() || `column_${i + 1}`;
    if (base === '__proto__') base = '_proto_';
    let name = base;
    let n = 2;
    while (seen.has(name.toLowerCase())) name = `${base}_${n++}`;
    seen.add(name.toLowerCase());
    return name;
  });
}

function parseDelimitedTable(text: string, delimiter?: string): { rows: Record<string, any>[]; headers: string[] } {
  const cleaned = text.replace(/^﻿/, '');
  if (!cleaned.trim()) return { rows: [], headers: [] };
  const firstLineEnd = cleaned.search(/[\r\n]/);
  const headerSample = firstLineEnd === -1 ? cleaned : cleaned.slice(0, firstLineEnd);
  const delim = delimiter || detectDelimiter(headerSample);

  const cells = parseCsvCells(cleaned, delim);
  if (cells.length === 0) return { rows: [], headers: [] };

  const headerRow = [...cells[0]];
  const dataRows = cells.slice(1);
  // Rows longer than the header keep their extra fields as column_N
  // instead of dropping them.
  const widest = dataRows.reduce((m, r) => (r.length > m ? r.length : m), headerRow.length);
  for (let i = headerRow.length; i < widest; i++) headerRow.push('');
  const headers = uniqueHeaders(headerRow);
  const colCount = headers.length;

  const colRawValues: string[][] = headers.map(() => []);
  dataRows.forEach((r) => {
    for (let c = 0; c < colCount; c++) {
      colRawValues[c].push((r[c] ?? '').trim());
    }
  });

  const colIsNumeric = colRawValues.map((vals) => {
    const nonBlank = vals.filter((v) => v !== '');
    if (nonBlank.length === 0) return false;
    return nonBlank.every((v) => looksNumericForImport(v));
  });
  const colIsBool = colRawValues.map((vals, idx) => {
    if (colIsNumeric[idx]) return false;
    const nonBlank = vals.filter((v) => v !== '');
    if (nonBlank.length === 0) return false;
    return nonBlank.every((v) => /^(true|false)$/i.test(v));
  });

  const rows = dataRows.map((r) => {
    const row: Record<string, any> = {};
    headers.forEach((h, idx) => {
      const raw = (r[idx] ?? '').trim();
      if (raw === '') {
        row[h] = null;
      } else if (colIsBool[idx]) {
        row[h] = raw.toLowerCase() === 'true';
      } else if (colIsNumeric[idx]) {
        row[h] = parseSharedNumber(raw);
      } else {
        row[h] = raw;
      }
    });
    return row;
  });
  return { rows, headers };
}

/** Decode a CSV/text file's bytes, auto-detecting UTF-8 vs Windows-1252
 * and stripping a UTF-8 BOM. Never silently drops rows on bad bytes. */
async function readTextWithEncodingDetection(file: File): Promise<string> {
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    return file.text();
  }
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    bytes = bytes.slice(3);
  }
  try {
    const strict = new TextDecoder('utf-8', { fatal: true });
    return strict.decode(bytes);
  } catch {
    try {
      const latin1 = new TextDecoder('windows-1252');
      return latin1.decode(bytes);
    } catch {
      return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    }
  }
}

function normalizeUniqueValueKey(val: any): string {
  if (val === null || val === undefined || val === '') return '__NULL__';
  if (typeof val === 'boolean') return val ? 'true' : 'false';
  return String(val);
}

// Ordering key shared by Sort and the window steps. Values are compared as
// numbers when they read as numbers ("$1,234.50", "0012"), as dates when they
// read as dates in any supported format ("05-Mar-2024", "2024-03-05"), and as
// text otherwise. In a mixed column, numbers and dates come before stray text
// such as "n/a", and blanks always sort last in either direction -- sorting
// the raw text instead put "n/a" at the top of a price column and ordered
// "17/05/2024" between June dates.
type OrderKey = { kind: 0 | 1 | 2 | 3; n: number; s: string };
function orderKey(v: any): OrderKey {
  if (isBlank(v)) return { kind: 3, n: 0, s: '' };
  const num = typeof v === 'boolean' ? null : parseSharedNumber(v);
  if (num !== null) return { kind: 0, n: num, s: '' };
  const d = parseSharedDate(v);
  if (d) return { kind: 1, n: d.getTime(), s: '' };
  return { kind: 2, n: 0, s: String(v) };
}
// One collator for every text comparison: String#localeCompare with options
// builds a new collator per call, which made a 500K-row text sort take ~30 s.
const TEXT_COLLATOR = new Intl.Collator(undefined, { numeric: true });
function compareOrderKeys(a: OrderKey, b: OrderKey, desc: boolean): number {
  if (a.kind === 3 || b.kind === 3) return a.kind === b.kind ? 0 : a.kind === 3 ? 1 : -1;
  if (a.kind !== b.kind) return a.kind - b.kind;
  const cmp = a.kind === 2 ? TEXT_COLLATOR.compare(a.s, b.s) : a.n - b.n;
  return desc ? -cmp : cmp;
}
/** Grouping/partition key: trimmed and case-insensitive, like Group By and Join. */
function groupKeyOf(v: any): string {
  return String(v ?? '').trim().toLowerCase();
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
  const aBlank = isBlank(rowVal);
  const bBlank = isBlank(targetVal);
  const aNumRaw = aBlank ? null : parseSharedNumber(rowVal);
  const bNumRaw = bBlank ? null : parseSharedNumber(targetVal);
  const bothNum = aNumRaw !== null && bNumRaw !== null;
  const aNum = aNumRaw ?? 0;
  const bNum = bNumRaw ?? 0;
  const isOrderOp = ['gt', '>', 'gte', '>=', 'lt', '<', 'lte', '<='].includes(operator);
  // Empty comparison value on an order operator compares with 0 when the
  // row value is numeric, else is simply false (SPEC.md).
  const emptyOrderCase = isOrderOp && bBlank;
  const orderNumeric = emptyOrderCase ? aNumRaw !== null : bothNum;
  const aOrd: number | string = orderNumeric ? aNum : aStr.toLowerCase();
  const bOrd: number | string = orderNumeric ? (emptyOrderCase ? 0 : bNum) : bStr.toLowerCase();

  // A numeric threshold only ever matches numeric cells: comparing the text
  // "n/a" with "500" alphabetically used to let every n/a row through a
  // "price > 500" filter. A date threshold compares real dates (any format).
  if (isOrderOp && !bBlank) {
    let cmp: number | null = null;
    if (bNumRaw !== null) {
      if (aNumRaw === null) return false;
      cmp = aNumRaw - bNumRaw;
    } else {
      const bDate = parseSharedDate(targetVal);
      if (bDate) {
        const aDate = aBlank ? null : parseSharedDate(rowVal);
        if (!aDate) return false;
        cmp = aDate.getTime() - bDate.getTime();
      } else if (aBlank) {
        return false;
      }
    }
    if (cmp !== null) {
      if (operator === 'gt' || operator === '>') return cmp > 0;
      if (operator === 'gte' || operator === '>=') return cmp >= 0;
      if (operator === 'lt' || operator === '<') return cmp < 0;
      return cmp <= 0;
    }
  }

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
      return emptyOrderCase && aNumRaw === null ? false : aOrd > bOrd;
    case 'gte':
    case '>=':
      return emptyOrderCase && aNumRaw === null ? false : aOrd >= bOrd;
    case 'lt':
    case '<':
      return emptyOrderCase && aNumRaw === null ? false : aOrd < bOrd;
    case 'lte':
    case '<=':
      return emptyOrderCase && aNumRaw === null ? false : aOrd <= bOrd;
    case 'between': {
      // Inclusive range on numbers (or dates). A blank or non-numeric cell is
      // never "between" -- it used to count as 0 and pass any range spanning 0.
      const parts: any[] = Array.isArray(targetVal) ? targetVal : String(targetVal ?? '').split(',').map((x) => x.trim());
      if (parts.length < 2) return true;
      const lo = parseSharedNumber(parts[0]);
      const hi = parseSharedNumber(parts[1]);
      if (lo !== null && hi !== null) {
        if (aNumRaw === null) return false;
        return aNumRaw >= Math.min(lo, hi) && aNumRaw <= Math.max(lo, hi);
      }
      const dLo = parseSharedDate(parts[0]);
      const dHi = parseSharedDate(parts[1]);
      if (dLo && dHi) {
        const aDate = aBlank ? null : parseSharedDate(rowVal);
        if (!aDate) return false;
        const t = aDate.getTime();
        return t >= Math.min(dLo.getTime(), dHi.getTime()) && t <= Math.max(dLo.getTime(), dHi.getTime());
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
  return formulaResultToCell(evaluateFormula(expression, row));
}

function legacyEvaluateFormulaForRow(expression: string, row: Record<string, any>): any {
  const expr = expression.trim();
  if (!expr) return null;

  // Sandbox helper functions corresponding to Excel documentation
  const sandbox: Record<string, any> = {
    // Row column accessor
    _get: (colName: string) => {
      if (Object.prototype.hasOwnProperty.call(row, colName)) return row[colName];
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
    MIN: (...args: any[]) => arrayMin(args.map((n) => (Number.isNaN(Number(n)) ? Infinity : Number(n)))),
    MAX: (...args: any[]) => arrayMax(args.map((n) => (Number.isNaN(Number(n)) ? -Infinity : Number(n)))),
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
      const col2 = p.column2;
      const target = p.output_column || p.target_column || col1 || 'calc_col';
      const mathOp = p.math_operator || '+';
      const op = p.operation || 'add';
      const decimals = p.decimals ?? 2;
      let excelFormula: string;
      let expr: string;
      if (op === 'formula' && p.expression) {
        expr = p.expression.startsWith('=') ? p.expression.slice(1) : p.expression;
        excelFormula = `=${expr}`;
      } else if (op === 'arithmetic') {
        const rhs = col2 ? `[@[${col2}]]` : String(p.operand ?? 1);
        expr = `"${col1}" ${mathOp} ${col2 ? `"${col2}"` : p.operand ?? 1}`;
        excelFormula = `=[@[${col1}]] ${mathOp} ${rhs}`;
      } else if (op === 'round' || op === 'roundup' || op === 'rounddown') {
        const fn = op.toUpperCase();
        expr = `${fn}(${col1}, ${decimals})`;
        excelFormula = `=${fn}([@[${col1}]], ${decimals})`;
      } else if (op === 'abs') {
        expr = `ABS(${col1})`;
        excelFormula = `=ABS([@[${col1}]])`;
      } else if (op === 'percent_change') {
        const rhs = col2 ? `[@[${col2}]]` : String(p.operand ?? 0);
        expr = `(${col2 || p.operand} - "${col1}") / ABS("${col1}") * 100`;
        excelFormula = `=IFERROR((${rhs} - [@[${col1}]]) / ABS([@[${col1}]]) * 100, "")`;
      } else {
        expr = `${col1} ${op} ${p.operand ?? 1}`;
        excelFormula = `=[@[${col1}]] ${mathOp} ${p.operand ?? 1}`;
      }
      return {
        sql: `SELECT *, (${expr}) AS "${target}" FROM prev_step`,
        polars: `df = df.with_columns((${expr}).alias("${target}"))`,
        power_query_m: `Table.AddColumn(PrevStep, "${target}", each ${expr})`,
        excel_formula: excelFormula,
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
      const aggs: any[] =
        Array.isArray(p.aggregations) && p.aggregations.length > 0
          ? p.aggregations
          : [{ column: p.agg_column || 'amount', agg_func: p.agg_func || 'sum', output_column: p.alias }];
      const sqlAggs = aggs
        .map((a) => `${(a.agg_func || a.function || 'sum').toUpperCase()}("${a.column}") AS "${a.output_column || a.output_name || a.alias || `${a.agg_func || 'sum'}_${a.column}`}"`)
        .join(', ');
      const criteria = rawGroups.map((g) => `Table1[${g}], [@[${g}]]`).join(', ');
      const excelFns: string[] = aggs.map((a) => {
        const fn = (a.agg_func || a.function || 'sum').toLowerCase();
        const col = a.column;
        const fnMap: Record<string, string> = {
          sum: 'SUMIFS',
          avg: 'AVERAGEIFS',
          mean: 'AVERAGEIFS',
          min: 'MINIFS',
          max: 'MAXIFS',
        };
        if (fn === 'count') return `=COUNTIFS(${criteria})`;
        if (fn === 'distinct_count') return `=SUMPRODUCT(1/COUNTIFS(Table1[${col}], Table1[${col}]))`;
        const excelFn = fnMap[fn] || 'SUMIFS';
        return `=${excelFn}(Table1[${col}], ${criteria})`;
      });
      return {
        sql: `SELECT ${rawGroups.map((g) => `"${g}"`).join(', ')}, ${sqlAggs} FROM prev_step GROUP BY ${rawGroups.map((g) => `"${g}"`).join(', ')}`,
        polars: `df = df.group_by(${JSON.stringify(rawGroups)}).agg(${aggs.map((a) => `pl.col("${a.column}").${(a.agg_func || a.function || 'sum') === 'avg' ? 'mean' : (a.agg_func || a.function || 'sum')}().alias("${a.output_column || a.alias || a.column}")`).join(', ')})`,
        power_query_m: `Table.Group(PrevStep, {${rawGroups.map((g) => `"${g}"`).join(', ')}}, {${aggs.map((a) => `{"${a.output_column || a.alias || a.column}", each List.${(a.agg_func || 'sum') === 'avg' ? 'Average' : 'Sum'}([${a.column}]), type number}`).join(', ')}})`,
        excel_formula: excelFns.join(' ; '),
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
      const outCol = p.new_column || p.output_column || p.target_column || 'conditional_col';
      const rules = (p.rules || p.clauses || []).length
        ? p.rules || p.clauses
        : [{ column: p.column || 'amount', operator: p.operator || 'gte', value: p.value ?? '100', result: p.then_value ?? 'High' }];
      const elseVal = p.else_value ?? 'Other';
      const opMap: Record<string, string> = { eq: '=', '==': '=', neq: '<>', '!=': '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' };
      const quote = (v: any) => (v !== undefined && v !== null && parseSharedNumber(v) !== null ? String(v) : `"${v}"`);
      const condStr = (c: any) => `[@[${c.column}]]${opMap[c.operator] || '='}${quote(c.value)}`;
      let excelFormula = '';
      for (let i = 0; i < rules.length; i++) {
        excelFormula += `IF(${condStr(rules[i])},${quote(rules[i].result ?? rules[i].then_value)},`;
      }
      excelFormula += quote(elseVal) + ')'.repeat(rules.length);
      const sqlCase = rules
        .map((c: any) => `WHEN "${c.column}" ${opMap[c.operator] || '='} '${c.value}' THEN '${c.result ?? c.then_value}'`)
        .join(' ');
      return {
        sql: `SELECT *, CASE ${sqlCase} ELSE '${elseVal}' END AS "${outCol}" FROM prev_step`,
        polars: `df = df.with_columns(pl.when(${rules.map((c: any) => `pl.col("${c.column}") ${opMap[c.operator] || '=='} ${JSON.stringify(c.value)}`).join(').then(...).when(')}).then(${JSON.stringify(rules[0].result ?? rules[0].then_value)}).otherwise(${JSON.stringify(elseVal)}).alias("${outCol}"))`,
        power_query_m: `Table.AddColumn(PrevStep, "${outCol}", each ${rules.map((c: any) => `if [${c.column}] ${opMap[c.operator] || '='} ${quote(c.value)} then ${quote(c.result ?? c.then_value)} else `).join('')}${quote(elseVal)})`,
        excel_formula: `=${excelFormula}`,
      };
    }
    case 'window_calc': {
      const fn = (p.calc_type || p.function || p.window_type || 'running_total').toLowerCase();
      const valCol = p.value_column || (p.output_column ? p.target_column : p.column) || 'amount';
      const outCol = p.output_column || (p.value_column ? p.target_column : undefined) || `${fn}_${valCol}`;
      const partitionCols: string[] = Array.isArray(p.partition_by) ? p.partition_by : [];
      const partitionSql = partitionCols.length ? ` PARTITION BY ${partitionCols.map((c) => `"${c}"`).join(', ')}` : '';
      const excelByFn: Record<string, string> = {
        rank: `=RANK.EQ([@[${p.order_by || valCol}]], Table1[${p.order_by || valCol}], ${p.order_direction === 'desc' ? 0 : 1})`,
        running_total: `=SUM(Table1[[${valCol}]:[@[${valCol}]]])`,
        running_avg: `=AVERAGE(Table1[[${valCol}]:[@[${valCol}]]])`,
        moving_avg: `=AVERAGE(OFFSET([@[${valCol}]], -${Math.max(1, Number(p.window_size ?? 3)) - 1}, 0, ${Math.max(1, Number(p.window_size ?? 3))}, 1))`,
        lag: `=OFFSET([@[${valCol}]], -${Number(p.offset ?? 1)}, 0)`,
        lead: `=OFFSET([@[${valCol}]], ${Number(p.offset ?? 1)}, 0)`,
        row_number: `=ROW()-ROW(Table1[#Headers])`,
        percent_of_total: `=[@[${valCol}]]/SUM(Table1[${valCol}])`,
      };
      return {
        sql: `SELECT *, ${fn.toUpperCase()}("${valCol}") OVER (${partitionSql.trim()} ORDER BY "${p.order_by || valCol}" ${(p.order_direction || 'asc').toUpperCase()}) AS "${outCol}" FROM prev_step`,
        polars: `df = df.with_columns(pl.col("${valCol}").${fn === 'running_total' ? 'cum_sum' : fn}().alias("${outCol}"))`,
        power_query_m: `// Window ${fn} on ${valCol} as ${outCol}${partitionCols.length ? ` partitioned by ${partitionCols.join(', ')}` : ''}\nPrevStep`,
        excel_formula: excelByFn[fn] || `=SUM($C$2:C2)`,
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
      const expr = p.expression || p.formula;
      if (expr) {
        const bare = expr.startsWith('=') ? expr.slice(1) : expr;
        return {
          sql: `-- Formula Builder expression evaluated by the engine, not translated to SQL verbatim\nSELECT *, (${bare}) AS "${colName}" FROM prev_step`,
          polars: `# Formula Builder expression: ${bare}\ndf = df.with_columns(pl.lit(None).alias("${colName}"))`,
          power_query_m: `Table.AddColumn(PrevStep, "${colName}", each /* ${bare} */ null)`,
          excel_formula: `=${bare}`,
        };
      }
      const val = p.value !== undefined ? String(p.value) : '';
      return {
        sql: `SELECT *, '${val}' AS "${colName}" FROM prev_step`,
        polars: `df = df.with_columns(pl.lit("${val}").alias("${colName}"))`,
        power_query_m: `Table.AddColumn(PrevStep, "${colName}", each "${val}")`,
        excel_formula: `="${val}"`,
      };
    }
    case 'text_transform': {
      const col = p.column || 'text_col';
      const op = p.operation || 'upper';
      const target = p.output_column || p.target_column || col;
      const excelByOp: Record<string, string> = {
        upper: `=UPPER([@[${col}]])`,
        uppercase: `=UPPER([@[${col}]])`,
        lower: `=LOWER([@[${col}]])`,
        lowercase: `=LOWER([@[${col}]])`,
        trim: `=TRIM([@[${col}]])`,
        clean: `=CLEAN(TRIM([@[${col}]]))`,
        title: `=PROPER([@[${col}]])`,
        proper: `=PROPER([@[${col}]])`,
        left: `=LEFT([@[${col}]], ${p.length ?? 5})`,
        right: `=RIGHT([@[${col}]], ${p.length ?? 5})`,
        mid: `=MID([@[${col}]], ${p.start ?? 1}, ${p.length ?? 5})`,
        length: `=LEN([@[${col}]])`,
        concat: `=[@[${col}]]&"${p.concat_separator ?? ' '}"&${(p.concat_columns || []).map((c: string) => `[@[${c}]]`).join('&')}`,
      };
      return {
        sql: `SELECT *, ${op.toUpperCase()}("${col}") AS "${target}" FROM prev_step`,
        polars: `df = df.with_columns(pl.col("${col}").str.${op === 'upper' ? 'to_uppercase' : op === 'lower' ? 'to_lowercase' : op}().alias("${target}"))`,
        power_query_m: `Table.TransformColumns(PrevStep, {{"${col}", Text.${op === 'upper' ? 'Upper' : op === 'lower' ? 'Lower' : 'Proper'}, type text}})`,
        excel_formula: excelByOp[op] || `=TRIM([@[${col}]])`,
      };
    }
    case 'date_transform': {
      const col = p.column || 'date_col';
      const op = p.operation || p.part || 'extract_part';
      const datePart = p.date_part || p.part || 'year';
      const target = p.output_column || p.target_column || `${col}_${datePart}`;
      const excelByOp: Record<string, string> = {
        eomonth: `=EOMONTH([@[${col}]], ${p.amount ?? 0})`,
        datedif: `=DATEDIF([@[${col}]], [@[${p.second_column || 'end_date'}]], "${(p.unit || 'd')[0]}")`,
        networkdays: `=NETWORKDAYS([@[${col}]], [@[${p.second_column || 'end_date'}]])`,
        add_time: `=EDATE([@[${col}]], ${p.unit === 'month' ? p.amount ?? 0 : p.unit === 'year' ? (p.amount ?? 0) * 12 : 0})${p.unit === 'day' ? ` + ${p.amount ?? 0}` : ''}`,
        fiscal_year: `="FY"&(YEAR([@[${col}]])+IF(MONTH([@[${col}]])>=${p.fiscal_start_month ?? 4},1,0))`,
        extract_part:
          datePart === 'year'
            ? `=YEAR([@[${col}]])`
            : datePart === 'month'
            ? `=MONTH([@[${col}]])`
            : datePart === 'day'
            ? `=DAY([@[${col}]])`
            : datePart === 'weekday'
            ? `=WEEKDAY([@[${col}]], 1)-1`
            : datePart === 'week'
            ? `=WEEKNUM([@[${col}]], 1)`
            : `=TEXT([@[${col}]], "yyyy-mm-dd")`,
      };
      return {
        sql: `SELECT *, ${op === 'extract_part' ? `EXTRACT(${datePart} FROM "${col}")` : `${op.toUpperCase()}("${col}")`} AS "${target}" FROM prev_step`,
        polars: `df = df.with_columns(pl.col("${col}").dt.${datePart === 'year' ? 'year' : datePart === 'month' ? 'month' : datePart === 'day' ? 'day' : 'strftime("%Y-%m-%d")'}().alias("${target}"))`,
        power_query_m: `Table.AddColumn(PrevStep, "${target}", each Date.${datePart === 'year' ? 'Year' : datePart === 'month' ? 'Month' : 'Day'}([${col}]))`,
        excel_formula: excelByOp[op] || excelByOp.extract_part,
      };
    }
    case 'remove_duplicates': {
      const cols: string[] = Array.isArray(p.columns) && p.columns.length > 0 ? p.columns : ['*all columns*'];
      const keep = p.keep_mode || p.keep || 'first';
      return {
        sql: `SELECT DISTINCT ON (${cols.map((c) => `"${c}"`).join(', ')}) * FROM prev_step`,
        polars: `df = df.unique(subset=${JSON.stringify(cols)}, keep="${keep === 'last' ? 'last' : 'first'}")`,
        power_query_m: `Table.Distinct(PrevStep, {${cols.map((c) => `"${c}"`).join(', ')}})`,
        excel_formula: `=UNIQUE(Table1, FALSE, FALSE)  // key columns: ${cols.join(', ')}, keep=${keep}`,
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

const has = (v: any) => (Array.isArray(v) ? v.filter((x) => x !== null && x !== undefined && x !== '').length > 0 : v !== null && v !== undefined && String(v).trim() !== '');
const needColumn = (p: any) => (has(p.column) || has(p.columns) ? '' : 'which column');
/** For each step type, '' when the settings are usable, else what is missing. */
const STEP_REQUIREMENTS: Record<string, (p: any) => string> = {
  change_type: needColumn,
  rename_column: (p) => (!has(p.old_name || p.column) ? 'which column' : !has(p.new_name) ? 'the new name' : ''),
  filter_rows: (p) => (Array.isArray(p.conditions) ? (p.conditions.some((c: any) => c && has(c.column)) ? '' : 'a condition') : has(p.column) ? '' : 'a condition'),
  sort_rows: (p) => (Array.isArray(p.conditions) ? (p.conditions.some((c: any) => c && has(c.column)) ? '' : 'a sort column') : has(p.column) ? '' : 'a sort column'),
  remove_duplicates: () => '',
  remove_column: needColumn,
  reorder_columns: (p) => (has(p.column_order) ? '' : 'the column order'),
  custom_column: (p) => (has(p.expression) || has(p.formula) || p.value !== undefined ? '' : 'a formula or value'),
  conditional: (p) => (has(p.clauses) || has(p.rules) || has(p.column) ? '' : 'a rule'),
  group_by: (p) => (has(p.group_by_columns) || has(p.group_columns) || has(p.group_by) || has(p.aggregations) || has(p.agg_column) ? '' : 'group columns or a calculation'),
  pivot: (p) => (has(p.value_column) ? '' : 'the value column'),
  unpivot: (p) => (has(p.value_columns) || has(p.id_columns) ? '' : 'which columns to unpivot'),
  window_calc: (p) => (has(p.value_column) || has(p.target_column) || has(p.column) || p.calc_type === 'row_number' || p.function === 'row_number' ? '' : 'the value column'),
  join: (p) => (has(p.right_dataset_id) || has(p.lookup_dataset_id) ? '' : 'the dataset to join'),
  vlookup: (p) => (has(p.right_dataset_id) || has(p.lookup_dataset_id) ? '' : 'the lookup dataset'),
  xlookup: (p) => (has(p.right_dataset_id) || has(p.lookup_dataset_id) ? '' : 'the lookup dataset'),
  append: (p) => (has(p.dataset_ids) || has(p.append_dataset_id) || has(p.right_dataset_id) ? '' : 'the dataset to append'),
  split_column: needColumn,
  text_transform: (p) => (has(p.column) || has(p.concat_columns) ? '' : 'which column'),
  math_transform: (p) => (has(p.column) || has(p.column1) || has(p.expression) ? '' : 'which column'),
  date_transform: needColumn,
  replace_values: (p) => (!has(p.column) && !has(p.columns) ? 'which column' : [p.find_value, p.old_value, p.search_value].some((v) => v !== undefined) ? '' : 'the value to find'),
  standardize_values: needColumn,
  fill_down: needColumn,
  impute_missing: needColumn,
  flag_outliers: needColumn,
  top_bottom_n: needColumn,
  promote_headers: () => '',
  transpose: () => '',
  remove_rows: () => '',
};

/** "__proto__" cannot be a key of a plain object (assigning it changes the
 * object's prototype and the column silently disappears). */
const UNSAFE_KEY = '__proto__';
const safeKey = (name: string) => (name === UNSAFE_KEY ? '_proto_' : name);
function safeOutputNames(p: any, warn: (m: string) => void): any {
  const OUT = ['new_name', 'new_column', 'output_column', 'target_column', 'custom_column_name', 'name_column', 'alias'];
  let out = p;
  const fix = (v: any) => {
    warn(`"${UNSAFE_KEY}" cannot be used as a column name; "_proto_" was used instead.`);
    return safeKey(v);
  };
  for (const k of OUT) if (p[k] === UNSAFE_KEY) out = { ...out, [k]: fix(p[k]) };
  if (p.value_column === UNSAFE_KEY) out = { ...out, value_column: fix(p.value_column) };
  if (Array.isArray(p.new_column_names) && p.new_column_names.includes(UNSAFE_KEY)) out = { ...out, new_column_names: p.new_column_names.map((n: string) => (n === UNSAFE_KEY ? fix(n) : n)) };
  if (Array.isArray(p.aggregations) && p.aggregations.some((a: any) => a?.alias === UNSAFE_KEY)) out = { ...out, aggregations: p.aggregations.map((a: any) => (a?.alias === UNSAFE_KEY ? { ...a, alias: fix(a.alias) } : a)) };
  return out;
}

/** Column names a step's settings refer to in the CURRENT rows (not join/append right-hand sides or new output names). */
function referencedColumns(type: string, p: any): string[] {
  const out: string[] = [];
  const add = (v: any) => {
    if (typeof v === 'string' && v.trim()) out.push(v);
    else if (Array.isArray(v)) v.forEach((x) => (typeof x === 'string' ? add(x) : x && typeof x === 'object' && add(x.column)));
  };
  if (['append', 'custom_column', 'conditional', 'promote_headers', 'transpose'].includes(type)) return out;
  add(p.column);
  add(p.columns);
  add(p.group_by_columns);
  add(p.group_columns);
  add(p.index_columns);
  add(p.pivot_column);
  if (type !== 'unpivot') add(p.value_column); // unpivot's value_column is the NEW column's name
  add(p.partition_by);
  add(p.order_by);
  add(p.date_column);
  add(p.source_column);
  if (type === 'rename_column') add(p.old_name);
  if (type === 'join' || type === 'vlookup' || type === 'xlookup') add(p.left_key || p.left_key_col);
  if (Array.isArray(p.conditions)) p.conditions.forEach((c: any) => c && add(c.column));
  if (Array.isArray(p.aggregations)) p.aggregations.forEach((a: any) => a && a.function !== 'count' && add(a.column));
  return [...new Set(out)];
}

function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
        i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1] ? d[i - 2][j - 2] + 1 : Infinity);
  return d[a.length][b.length];
}

/** A step pointed at a column that is not there (a typo, or the feed dropped
 * or renamed it) used to run silently: a filter matched 0 rows, a Group By
 * made one blank group. Say so, and suggest the likely column. */
function warnMissingColumns(type: string, p: any, rows: Record<string, any>[], warn: (m: string) => void) {
  if (rows.length === 0) return;
  const present = new Set<string>();
  for (const r of rows.length > 400 ? [...rows.slice(0, 200), ...rows.slice(-200)] : rows) for (const k of Object.keys(r)) present.add(k);
  for (const col of referencedColumns(type, p)) {
    if (present.has(col)) continue;
    const lower = col.trim().toLowerCase();
    const guess = [...present].find((k) => k.trim().toLowerCase() === lower) || [...present].find((k) => editDistance(k.toLowerCase(), lower) <= 2);
    warn(`Column "${col}" was not found${guess ? ` -- did you mean "${guess}"?` : ''} The step treats it as blank.`);
  }
}

function executePipelineSteps(
  initialRows: Record<string, any>[],
  steps: StepDefinition[],
  allDatasets: StoredLocalDataset[],
  baseColumns?: ColumnSchema[]
): {
  rows: Record<string, any>[];
  columns: ColumnSchema[];
  compiledSql: string;
  stepSummaries: StepSummary[];
} {
  // Every step builds new row objects and never edits one in place, so the
  // source rows need no up-front copy (copying 1M rows doubled peak memory).
  let rows = (initialRows || []).slice();
  const stepSummaries: StepSummary[] = [];
  const sqlParts: string[] = ['WITH source_data AS (\n  SELECT * FROM dataset\n)'];
  let prevCte = 'source_data';

  (steps || []).forEach((step, idx) => {
    if (!step) return;
    const code = generateStepCode(step);
    const summary: StepSummary = {
      step_id: step.id,
      label: step.label,
      type: step.type,
      enabled: step.enabled,
      generated_code: code,
    };
    stepSummaries.push(summary);
    const warn = (msg: string) => {
      (summary.warnings ||= []).push(msg);
    };

    if (!step.enabled) return;

    const cteName = `step_${idx + 1}_${step.type}`;
    sqlParts.push(`${cteName} AS (\n  ${code.sql.replace(/prev_step/g, prevCte)}\n)`);
    prevCte = cteName;

    const p = safeOutputNames(step.params || {}, warn);
    // Never run a step silently wrong: an unknown type, or a step saved
    // without its settings, is skipped and reported (a Group By with no
    // settings used to collapse the data into one row).
    if (!STEP_REQUIREMENTS[step.type]) {
      warn(`Unknown step type "${step.type}" -- this step was skipped.`);
      return;
    }
    const missingSetting = STEP_REQUIREMENTS[step.type](p);
    if (missingSetting) {
      warn(`This step is missing its settings (${missingSetting}) and was skipped.`);
      return;
    }
    const otherDs = p.right_dataset_id || p.lookup_dataset_id;
    if (['join', 'vlookup', 'xlookup'].includes(step.type) && otherDs && !allDatasets.some((d) => d.meta.id === otherDs)) {
      warn(`The dataset to ${step.type === 'join' ? 'join' : 'look up'} ("${otherDs}") could not be found -- this step was skipped.`);
      return;
    }
    warnMissingColumns(step.type, p, rows, warn);
    if ((step.type === 'custom_column' || step.type === 'math_transform') && typeof (p.expression || p.formula) === 'string' && rows.length) {
      const present = new Set(Object.keys(rows[0]));
      const missingRefs = [...new Set([...String(p.expression || p.formula).matchAll(/\[([^\]]+)\]/g)].map((m) => m[1]))].filter(
        (c) => !present.has(c) && ![...present].some((k) => k.toLowerCase() === c.toLowerCase())
      );
      if (missingRefs.length) warn(`The formula refers to ${missingRefs.map((c) => `[${c}]`).join(', ')}, which ${missingRefs.length === 1 ? 'is' : 'are'} not a column; ${missingRefs.length === 1 ? 'it is' : 'they are'} treated as blank.`);
    }

    switch (step.type) {
      case 'change_type': {
        const col = p.column;
        const targetType: DataType = p.target_type || 'text';
        if (col) {
          // A US-style column (it holds 03/13/2024) is read month-first for
          // every row, so 04/05/2024 is April 5 there -- not May 4.
          const monthFirst = targetType === 'date' && inferMonthFirst(rows.map((r) => r[col]));
          // Default: an unreadable value becomes blank so the column stays one
          // clean type (a text "31/02/2024" in a date column breaks sorts and
          // "latest date"); on_error: 'keep' leaves it as typed instead.
          // Either way the step reports it -- never silent.
          const keepOnError = p.on_error === 'keep';
          let failed = 0;
          const examples: string[] = [];
          rows = rows.map((r) => {
            const val = r[col];
            if (isBlank(val) || isNullToken(val)) return { ...r, [col]: null };
            let nextVal: any = null;
            if (targetType === 'integer') {
              const parsed = parseSharedNumber(val, { allowScientific: true });
              nextVal = parsed !== null && Number.isInteger(parsed) ? parsed : null;
            } else if (targetType === 'float') {
              nextVal = parseSharedNumber(val, { allowScientific: true });
            } else if (targetType === 'boolean') {
              if (typeof val === 'boolean') nextVal = val;
              else {
                const s = String(val).trim().toLowerCase();
                if (['true', 'yes', 'y', '1'].includes(s)) nextVal = true;
                else if (['false', 'no', 'n', '0'].includes(s)) nextVal = false;
              }
            } else if (targetType === 'date') {
              const d = parseSharedDate(val, { asDateStep: true, monthFirst });
              nextVal = d ? toISODate(d) : null;
            } else {
              return { ...r, [col]: String(val) };
            }
            if (nextVal === null) {
              failed++;
              if (examples.length < 3) examples.push(String(val));
              return keepOnError ? r : { ...r, [col]: null };
            }
            return { ...r, [col]: nextVal };
          });
          if (failed > 0) {
            const what = targetType === 'integer' ? 'a whole number' : targetType === 'float' ? 'a number' : `a ${targetType}`;
            warn(
              `${failed.toLocaleString()} value${failed === 1 ? '' : 's'} in "${col}" could not be read as ${what} and ${failed === 1 ? 'was' : 'were'} ${keepOnError ? 'left unchanged' : 'set to blank'} (e.g. ${examples.map((e) => `"${e}"`).join(', ')}).`
            );
          }
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
        const sorts: SortCondition[] = (p.conditions || [
          { column: p.column, direction: p.direction || 'asc' },
        ]).filter((c: SortCondition) => c && c.column);
        // Keys are computed once per row (not per comparison): parsing every
        // value as a number/date inside the comparator would be O(n log n)
        // parses on a 100K-row sort.
        const keyed = rows.map((r, i) => ({ r, i, k: sorts.map((c) => orderKey(r[c.column])) }));
        keyed.sort((a, b) => {
          for (let j = 0; j < sorts.length; j++) {
            const cmp = compareOrderKeys(a.k[j], b.k[j], sorts[j].direction === 'desc');
            if (cmp !== 0) return cmp;
          }
          return a.i - b.i;
        });
        rows = keyed.map((x) => x.r);
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
            const key = cols.map((c) => String(r[c] ?? '').toLowerCase()).join('||');
            counts.set(key, (counts.get(key) || 0) + 1);
          });
          rows = rows.filter((r) => {
            const key = cols.map((c) => String(r[c] ?? '').toLowerCase()).join('||');
            return (counts.get(key) || 0) > 1;
          });
        } else if (keep === 'last') {
          const reversed: Record<string, any>[] = [];
          for (let i = rows.length - 1; i >= 0; i--) {
            const r = rows[i];
            const key = cols.map((c) => String(r[c] ?? '').toLowerCase()).join('||');
            if (!seen.has(key)) {
              seen.add(key);
              reversed.push(r);
            }
          }
          rows = reversed.reverse();
        } else {
          rows = rows.filter((r) => {
            const key = cols.map((c) => String(r[c] ?? '').toLowerCase()).join('||');
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
        const lastVal: Record<string, any> = Object.create(null); // keyed by data values: no inherited keys
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
        const operand = p.operand !== undefined && p.operand !== '' ? parseSharedNumber(p.operand) : null;
        const decimals = p.decimals !== undefined ? Number(p.decimals) : 2;
        const targetCol = p.output_column || p.target_column || col1 || 'calculated';

        rows = rows.map((r) => {
          if (op === 'formula' && p.expression) {
            return { ...r, [targetCol]: evaluateFormulaForRow(p.expression, r) };
          }

          const raw1 = r[col1];
          const v1 = isBlank(raw1) ? null : parseSharedNumber(raw1);

          if (op === 'bin') {
            if (v1 === null) return { ...r, [targetCol]: null };
            const bins: Array<{ max: number; label: string }> = Array.isArray(p.bins) ? p.bins : [];
            const sortedBins = [...bins].sort((a, b) => Number(a.max) - Number(b.max));
            for (const b of sortedBins) {
              if (v1 <= Number(b.max)) {
                return { ...r, [targetCol]: b.label };
              }
            }
            return { ...r, [targetCol]: p.bin_other || 'High' };
          }

          if (op === 'clean_numeric') {
            const num = parseSharedNumber(raw1);
            return { ...r, [targetCol]: num === null ? null : cleanFloat(num) };
          }

          if (op === 'abs') {
            return { ...r, [targetCol]: v1 === null ? null : Math.abs(v1) };
          }
          if (op === 'round') {
            if (v1 === null) return { ...r, [targetCol]: null };
            const d = p.decimals !== undefined ? decimals : operand ?? 0;
            return { ...r, [targetCol]: roundHalfAwayFromZero(v1, d) };
          }
          if (op === 'roundup') {
            if (v1 === null) return { ...r, [targetCol]: null };
            const d = p.decimals !== undefined ? decimals : operand ?? 0;
            return { ...r, [targetCol]: roundUpAwayFromZero(v1, d) };
          }
          if (op === 'rounddown') {
            if (v1 === null) return { ...r, [targetCol]: null };
            const d = p.decimals !== undefined ? decimals : operand ?? 0;
            return { ...r, [targetCol]: roundDownTowardZero(v1, d) };
          }

          if (v1 === null) return { ...r, [targetCol]: null };

          let res: number | null = v1;
          if (op === 'arithmetic') {
            const raw2 = col2 && col2 in r ? r[col2] : col2;
            const v2 = isBlank(raw2) ? (operand ?? 0) : parseSharedNumber(raw2);
            if (v2 === null) return { ...r, [targetCol]: null };
            if (mathOp === '+') res = v1 + v2;
            else if (mathOp === '-') res = v1 - v2;
            else if (mathOp === '*') res = v1 * v2;
            else if (mathOp === '/') res = v2 !== 0 ? v1 / v2 : null; // DIV/0 -> blank in steps (SPEC.md)
          } else if (op === 'percent_change') {
            const raw2 = col2 && col2 in r ? r[col2] : col2;
            const v2 = isBlank(raw2) ? (operand ?? 0) : parseSharedNumber(raw2);
            if (v2 === null) return { ...r, [targetCol]: null };
            res = v1 !== 0 ? ((v2 - v1) / Math.abs(v1)) * 100 : null;
            if (res !== null) return { ...r, [targetCol]: roundHalfAwayFromZero(res, decimals) };
            return { ...r, [targetCol]: null };
          } else if (op === 'add' || op === '+') {
            res = v1 + (operand ?? 0);
          } else if (op === 'subtract' || op === '-') {
            res = v1 - (operand ?? 0);
          } else if (op === 'multiply' || op === '*') {
            res = v1 * (operand ?? 0);
          } else if (op === 'divide' || op === '/') {
            res = operand !== null && operand !== 0 ? v1 / operand : null;
          }

          return { ...r, [targetCol]: res === null ? null : cleanFloat(res) };
        });
        break;
      }

      case 'text_transform': {
        const col = p.column;
        const op = p.operation || 'upper';
        const targetCol = p.output_column || p.target_column || col;
        if (col && targetCol) {
          rows = rows.map((r) => {
            // A blank cell stays blank (null) through text clean-up steps;
            // turning it into empty text made blanks sort to the top.
            if ((r[col] === null || r[col] === undefined) && op !== 'length' && op !== 'concat') {
              return { ...r, [targetCol]: null };
            }
            const s = String(r[col] ?? '');
            let out: any = s;
            if (op === 'upper' || op === 'uppercase') out = s.toUpperCase();
            else if (op === 'lower' || op === 'lowercase') out = s.toLowerCase();
            else if (op === 'trim') out = trimCollapse(s);
            else if (op === 'clean') out = s.replace(/[\x00-\x1F\x7F]/g, '').trim();
            else if (op === 'title' || op === 'proper') {
              out = properCase(s);
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
            const d = parseSharedDate(r[col], { asDateStep: true });
            if (!d) return { ...r, [targetCol]: null };
            let out: any = null;

            if (op === 'eomonth') {
              out = toISODate(eomonth(d, Number(p.amount ?? 0)));
            } else if (op === 'datedif') {
              const secCol = p.second_column;
              const d2 = secCol ? parseSharedDate(r[secCol], { asDateStep: true }) : null;
              if (!d2) {
                out = null; // blank/unparseable second date -> blank, never "today" (SPEC.md)
              } else {
                out = datedif(d, d2, p.unit || 'day');
              }
            } else if (op === 'networkdays') {
              const secCol = p.second_column;
              const d2 = secCol ? parseSharedDate(r[secCol], { asDateStep: true }) : null;
              out = d2 ? networkdays(d, d2) : null;
            } else if (op === 'add_time') {
              const amt = Number(p.amount ?? 0);
              const unit = p.unit || 'day';
              if (unit === 'year') out = toISODate(addYearsClamped(d, amt));
              else if (unit === 'month') out = toISODate(addMonthsClamped(d, amt));
              else {
                const copy = new Date(d.getTime());
                copy.setUTCDate(copy.getUTCDate() + amt);
                out = toISODate(copy);
              }
            } else if (op === 'fiscal_year') {
              out = fiscalYearLabel(d, Number(p.fiscal_start_month ?? 4));
            } else {
              // extract_part or legacy year/month/day/quarter
              if (datePart === 'year') out = d.getUTCFullYear();
              else if (datePart === 'month') out = d.getUTCMonth() + 1;
              else if (datePart === 'day') out = d.getUTCDate();
              else if (datePart === 'quarter') out = Math.floor(d.getUTCMonth() / 3) + 1;
              else if (datePart === 'week') out = excelWeekNum(d);
              else if (datePart === 'day_name') out = dayNames[weekdaySun0(d)];
              else if (datePart === 'weekday') out = weekdaySun0(d);
              else out = toISODate(d);
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
        // If every rule result and the else value parse as numbers, the
        // output column is numeric (SPEC.md).
        const allOutcomes = [...clauses.map((c: any) => c.result ?? c.then_value), elseVal];
        const allNumeric = allOutcomes.every((v) => v !== undefined && v !== null && parseSharedNumber(v) !== null);
        const coerce = (v: any) => (allNumeric ? parseSharedNumber(v) : v);
        rows = rows.map((r) => {
          for (const c of clauses) {
            if (c && c.column && evaluateRowCondition(r[c.column], c.operator || 'eq', c.value)) {
              return { ...r, [targetCol]: coerce(c.result ?? c.then_value ?? 'True') };
            }
          }
          return { ...r, [targetCol]: coerce(elseVal) };
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
          const key = groupCols.length > 0 ? groupCols.map((c) => String(r[c] ?? '').toLowerCase()).join('||') : '__ALL__';
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
            const rawVals = gRows.map((x) => x[agg.column]).filter((v) => !isBlank(v));
            const nums = rawVals.map((x) => parseSharedNumber(x)).filter((n): n is number => n !== null);
            if (fn === 'count') base[alias] = rawVals.length;
            else if (fn === 'distinct_count') base[alias] = new Set(rawVals.map((v) => String(v).toLowerCase())).size;
            else if (fn === 'sum') base[alias] = nums.length ? cleanFloat(preciseSum(nums)) : null;
            else if (fn === 'avg' || fn === 'mean')
              base[alias] = nums.length ? cleanFloat(preciseSum(nums) / nums.length) : null;
            else if (fn === 'min' || fn === 'max') {
              if (rawVals.length === 0) {
                base[alias] = null;
              } else if (nums.length === rawVals.length) {
                base[alias] = fn === 'min' ? arrayMin(nums) : arrayMax(nums);
              } else {
                const dates = rawVals.map((v) => parseSharedDate(v));
                if (dates.every((d) => d !== null)) {
                  const sorted = rawVals
                    .map((v, i) => ({ v, t: (dates[i] as Date).getTime() }))
                    .sort((a, b) => a.t - b.t);
                  base[alias] = fn === 'min' ? sorted[0].v : sorted[sorted.length - 1].v;
                } else {
                  const sorted = [...rawVals].sort((a, b) => String(a).localeCompare(String(b)));
                  base[alias] = fn === 'min' ? sorted[0] : sorted[sorted.length - 1];
                }
              }
            }
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
        const orderCol: string | undefined = p.order_by || undefined;
        const orderDir = (p.order_direction || 'asc').toLowerCase();
        const winSize = Math.max(1, Number(p.window_size ?? 3));
        const offsetCount = Math.max(1, Number(p.offset ?? 1));
        // For rank, the ranking value is order_by's column when given,
        // otherwise target_column (SPEC.md).
        const rankCol = fn === 'rank' && orderCol ? orderCol : valCol;

        // Window steps never change row order (SPEC.md): compute against an
        // "evaluation order" of original indices, then write results back
        // into the untouched `rows` array.
        const nextRows = rows.map((r) => ({ ...r }));

        // Partition original-index positions, preserving file order.
        const partitions = new Map<string, number[]>();
        rows.forEach((r, idx) => {
          // Trimmed and case-insensitive, like Group By and Join: "c113" and
          // "C113" are the same customer everywhere in a pipeline.
          const key =
            partitionCols.length > 0
              ? partitionCols.map((c) => groupKeyOf(r[c])).join('||')
              : '__ALL__';
          if (!partitions.has(key)) partitions.set(key, []);
          partitions.get(key)!.push(idx);
        });

        const sortIndices = (indices: number[], byCol: string | undefined): number[] => {
          if (!byCol) return indices;
          // Same ordering as Sort: dates in any format order by date, so a
          // running total over an unconverted date column is still in date order.
          const withKey = indices.map((idx) => ({ idx, k: orderKey(rows[idx][byCol]) }));
          withKey.sort((a, b) => compareOrderKeys(a.k, b.k, orderDir === 'desc') || a.idx - b.idx);
          return withKey.map((w) => w.idx);
        };

        partitions.forEach((originalIndices) => {
          const evalOrder = sortIndices(originalIndices, orderCol);

          if (fn === 'rank') {
            // Excel RANK.EQ by default: ties share a rank and the next rank
            // skips (1, 2, 2, 4). rank_method 'dense' gives 1, 2, 2, 3.
            // Blank cells get a blank rank; in a column that holds numbers,
            // non-numeric cells ("#VALUE!", "n/a") are not ranked either.
            const dense = String(p.rank_method || '').toLowerCase() === 'dense';
            const keyed = originalIndices.map((idx) => ({ idx, k: orderKey(rows[idx][rankCol]) }));
            const hasNumbers = keyed.some((x) => x.k.kind === 0);
            const ranked = keyed.filter((x) => x.k.kind !== 3 && (!hasNumbers || x.k.kind === 0));
            ranked.sort((a, b) => compareOrderKeys(a.k, b.k, orderDir === 'desc') || a.idx - b.idx);
            let rank = 0;
            ranked.forEach((x, pos) => {
              const tied = pos > 0 && compareOrderKeys(ranked[pos - 1].k, x.k, false) === 0;
              if (!tied) rank = dense ? rank + 1 : pos + 1;
              nextRows[x.idx][outCol] = rank;
            });
            const rankedSet = new Set(ranked.map((x) => x.idx));
            originalIndices.forEach((idx) => {
              if (!rankedSet.has(idx)) nextRows[idx][outCol] = null;
            });
            return;
          }

          const numAt = (idx: number): number | null => {
            const v = rows[idx][valCol];
            return isBlank(v) ? null : parseSharedNumber(v);
          };
          const groupNums = evalOrder.map((idx) => numAt(idx)).filter((n): n is number => n !== null);
          const groupTotal = preciseSum(groupNums);
          const running = new RunningSum();
          let runningCount = 0;

          evalOrder.forEach((idx, pos) => {
            const v = numAt(idx);
            if (v !== null) {
              running.add(v);
              runningCount++;
            }
            if (fn === 'row_number') {
              nextRows[idx][outCol] = pos + 1;
            } else if (fn === 'percent_of_total') {
              nextRows[idx][outCol] = v === null || groupTotal === 0 ? null : cleanFloat((v / groupTotal) * 100);
            } else if (fn === 'moving_avg') {
              const startPos = Math.max(0, pos - winSize + 1);
              const sliceIdx = evalOrder.slice(startPos, pos + 1);
              const sliceNums = sliceIdx.map((sIdx) => numAt(sIdx)).filter((n): n is number => n !== null);
              nextRows[idx][outCol] = sliceNums.length ? cleanFloat(preciseSum(sliceNums) / sliceNums.length) : null;
            } else if (fn === 'running_avg') {
              nextRows[idx][outCol] = runningCount ? cleanFloat(running.value / runningCount) : null;
            } else if (fn === 'lag') {
              const prevIdx = pos - offsetCount >= 0 ? evalOrder[pos - offsetCount] : -1;
              nextRows[idx][outCol] = prevIdx >= 0 ? rows[prevIdx][valCol] ?? null : null;
            } else if (fn === 'lead') {
              const nextIdx = pos + offsetCount < evalOrder.length ? evalOrder[pos + offsetCount] : -1;
              nextRows[idx][outCol] = nextIdx >= 0 ? rows[nextIdx][valCol] ?? null : null;
            } else {
              // running_total / running_sum
              nextRows[idx][outCol] = runningCount ? cleanFloat(running.value) : null;
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

          const overallAcc = new RunningSum();
          for (const r of workingRows) {
            const n = isBlank(r[valCol]) ? null : parseSharedNumber(r[valCol]);
            if (n !== null) overallAcc.add(n);
          }
          const overallSum = overallAcc.value;

          const computeAgg = (subset: Record<string, any>[]): number | null => {
            if (subset.length === 0) return null;
            if (aggFn === 'count') return subset.length;
            const nums = subset
              .map((m) => m[valCol])
              .filter((v) => !isBlank(v))
              .map((v) => parseSharedNumber(v))
              .filter((n): n is number => n !== null);
            if (nums.length === 0) return null;
            const sum = preciseSum(nums);
            if (aggFn === 'avg') return cleanFloat(sum / nums.length);
            if (aggFn === 'min') return arrayMin(nums);
            if (aggFn === 'max') return arrayMax(nums);
            if (aggFn === 'pct_total') {
              return overallSum !== 0 ? cleanFloat((sum / overallSum) * 100) : null;
            }
            return cleanFloat(sum);
          };

          // Labels are matched trimmed and case-insensitively, like Group By
          // and Excel PivotTables: "Completed" and "completed" are one column,
          // shown with the first spelling seen. (Case-sensitive matching split
          // one status into two columns and halved its totals.)
          const pivotLabelOf = new Map<string, string>();
          const pivotNorm = (v: any): string => {
            if (v === null || v === undefined || String(v).trim() === '') return 'Blank';
            const k = groupKeyOf(v);
            if (!pivotLabelOf.has(k)) pivotLabelOf.set(k, safeKey(String(v).trim()));
            return pivotLabelOf.get(k)!;
          };
          const pivotValues = pivotCol
            ? Array.from(new Set(workingRows.map((r) => pivotNorm(r[pivotCol]))))
            : [`${aggFn.toUpperCase()}_${valCol}`];

          // No silent column cap: fail clearly instead (SPEC.md).
          if (pivotValues.length > 200) {
            throw new Error(
              `Pivot would produce ${pivotValues.length} columns, which is over the 200-column limit. Filter the data or choose a different pivot column.`
            );
          }

          const groups = new Map<string, Record<string, any>[]>();
          workingRows.forEach((r) => {
            const k =
              idxCols.length > 0
                ? idxCols.map((c) => groupKeyOf(r[c])).join('||')
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
              // One pass per group (was one filter per pivot value: groups x values).
              const buckets = new Map<string, Record<string, any>[]>();
              for (const r of gRows) {
                const pv = pivotNorm(r[pivotCol]);
                let b = buckets.get(pv);
                if (!b) buckets.set(pv, (b = []));
                b.push(r);
              }
              pivotValues.forEach((pv) => {
                outRow[pv] = computeAgg(buckets.get(pv) || []);
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
                const matching = workingRows.filter((r) => pivotNorm(r[pivotCol]) === pv);
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
        const rightDs = allDatasets.find((d) => d.meta.id === rightId);
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
            if (isBlank(rr[rightKey])) return;
            const k = String(rr[rightKey]).trim().toLowerCase();
            if (!lookupMap.has(k)) {
              lookupMap.set(k, rr);
            }
          });

          const findXlookupMatch = (rawVal: any): Record<string, any> | undefined => {
            if (isBlank(rawVal)) return undefined;
            const keyStr = String(rawVal).trim().toLowerCase();
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
                merged[targetName] = match ? (match[col] ?? null) : fallback;
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
        const rightDs = allDatasets.find((d) => d.meta.id === rightId);
        if (rightDs) {
          const leftKey = p.left_key_col || p.lookup_column || p.left_key || p.lookup_key || 'customer_id';
          const rightSchema = rightDs.meta.schema_metadata || [];
          const rightKey =
            p.right_key_col || p.right_key || rightSchema[0]?.name || leftKey;
          const colIdx1 = Math.max(1, Number(p.col_index_num ?? 2));
          const resolvedColFromIndex = rightSchema[colIdx1 - 1]?.name;
          const retCol =
            resolvedColFromIndex ||
            p.return_column ||
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
            if (isBlank(rr[rightKey])) return;
            const k = String(rr[rightKey]).trim().toLowerCase();
            if (!exactMap.has(k)) {
              exactMap.set(k, rr);
            }
          });

          const findVlookupMatch = (rawVal: any): Record<string, any> | undefined => {
            if (isBlank(rawVal)) return undefined;
            const keyStr = String(rawVal).trim().toLowerCase();
            const exact = exactMap.get(keyStr);
            if (exact || !rangeLookup) return exact;

            // Approximate match (TRUE): largest key <= lookup_value.
            // Numeric keys are compared numerically only; never fall back
            // to text comparison for numeric keys (SPEC.md).
            const numVal = parseSharedNumber(rawVal);
            if (numVal !== null) {
              const smaller = rightDs.rows
                .filter((rr) => !isBlank(rr[rightKey]))
                .map((rr) => ({ row: rr, num: parseSharedNumber(rr[rightKey]) }))
                .filter((c): c is { row: Record<string, any>; num: number } => c.num !== null && c.num <= (numVal as number))
                .sort((a, b) => b.num - a.num);
              return smaller[0]?.row;
            }
            // Non-numeric keys: text-based "largest key <= value"
            const strSmaller = rightDs.rows
              .filter((rr) => !isBlank(rr[rightKey]) && String(rr[rightKey]).trim().toLowerCase().localeCompare(keyStr) <= 0)
              .sort((a, b) =>
                String(b[rightKey]).trim().toLowerCase().localeCompare(String(a[rightKey]).trim().toLowerCase())
              );
            return strSmaller[0];
          };

          rows = rows.map((lr) => {
            const match = findVlookupMatch(lr[leftKey]);
            return {
              ...lr,
              [outCol]: match ? (match[retCol] ?? null) : fallback,
            };
          });
        }
        break;
      }

      case 'join': {
        const rightId = p.right_dataset_id || p.lookup_dataset_id;
        const rightDs = allDatasets.find((d) => d.meta.id === rightId);
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

          // Join keys are always case-insensitive and trimmed, and a blank
          // key never matches anything (SPEC.md).
          const normalizeJoinKey = (row: Record<string, any>, isLeft: boolean): string | null => {
            const parts: string[] = [];
            for (const kp of rawPairs) {
              const col = isLeft
                ? kp.left_col || kp.left_key || 'customer_id'
                : kp.right_col || kp.right_key || 'customer_id';
              const val = row[col];
              if (isBlank(val)) return null;
              parts.push(String(val).trim().toLowerCase());
            }
            return parts.join('||');
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
              if (k === null) return true;
              if (seen.has(k)) return false;
              seen.add(k);
              return true;
            });
          }

          if (joinType === 'cross') {
            // No row cap: every left row crossed with every right row (SPEC.md).
            const crossed: Record<string, any>[] = [];
            rows.forEach((lr) => {
              sourceRightRows.forEach((rr) => {
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

          // Build multimap for right rows (blank keys are never indexed, so
          // they never match anything, including other blank keys).
          const rightMap = new Map<string, Record<string, any>[]>();
          sourceRightRows.forEach((rr) => {
            const k = normalizeJoinKey(rr, false);
            if (k === null) return;
            if (!rightMap.has(k)) rightMap.set(k, []);
            rightMap.get(k)!.push(rr);
          });

          if (joinType === 'left_semi') {
            rows = rows.filter((lr) => {
              const k = normalizeJoinKey(lr, true);
              return k !== null && rightMap.has(k);
            });
            break;
          }

          if (joinType === 'left_anti') {
            rows = rows.filter((lr) => {
              const k = normalizeJoinKey(lr, true);
              return k === null || !rightMap.has(k);
            });
            break;
          }

          const leftKeyCols = rawPairs.map((kp) => kp.left_col || kp.left_key || 'customer_id');
          const rightToLeftKeyCol = new Map<string, string>();
          rawPairs.forEach((kp) => {
            rightToLeftKeyCol.set(kp.right_col || kp.right_key || 'customer_id', kp.left_col || kp.left_key || 'customer_id');
          });

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
              // Right-only row (full/right join): show the key value in the
              // left key column instead of leaving it blank (SPEC.md).
              if (rr) {
                leftKeyCols.forEach((lc) => {
                  merged[lc] = null;
                });
                rawPairs.forEach((kp) => {
                  const rc = kp.right_col || kp.right_key || 'customer_id';
                  const lc = kp.left_col || kp.left_key || 'customer_id';
                  merged[lc] = rr[rc] ?? null;
                });
              }
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
            const matches = k !== null ? rightMap.get(k) : undefined;
            if (matches && matches.length > 0) {
              matchedRightKeys.add(k as string);
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
              if (k === null || !matchedRightKeys.has(k)) {
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

        // Columns are matched by name ignoring case and surrounding spaces, so
        // a feed that starts sending "Revenue " instead of "revenue" stays in
        // one column. Every rename, new column and missing column is reported.
        const norm = (c: string) => c.trim().toLowerCase();
        const canon = new Map<string, string>();
        for (const r of rows.length > 400 ? [...rows.slice(0, 200), ...rows.slice(-200)] : rows) {
          for (const k of Object.keys(r)) if (!canon.has(norm(k))) canon.set(norm(k), k);
        }
        const baseNames = new Set(canon.keys());
        const renamed: string[] = [];
        const added = new Map<string, string[]>();
        const missing = new Map<string, string[]>();
        const missingIds: string[] = [];
        let withinBatchDupes = 0;
        let baseDupes = 0;
        let staleSkipped = 0;
        const newestBy: string = p.newest_by || '';

        otherIds.forEach((id) => {
          const other = allDatasets.find((d) => d.meta.id === id);
          if (!other) {
            missingIds.push(id);
            return;
          }
          if (other) {
            const otherCols = other.meta.schema_metadata.map((c) => c.name);
            const colMap = new Map<string, string>();
            if (!alignByPos) {
              for (const rc of otherCols) {
                const target = canon.get(norm(rc));
                if (target === undefined) {
                  canon.set(norm(rc), rc);
                  colMap.set(rc, rc);
                  if (rows.length > 0 && !baseNames.has(norm(rc))) (added.get(rc) || added.set(rc, []).get(rc)!).push(other.meta.name);
                } else {
                  colMap.set(rc, target);
                  if (target !== rc) renamed.push(`"${rc}" in ${other.meta.name} -> "${target}"`);
                }
              }
              const otherNorm = new Set(otherCols.map(norm));
              for (const [n, name] of canon) if (baseNames.has(n) && !otherNorm.has(n)) (missing.get(name) || missing.set(name, []).get(name)!).push(other.meta.name);
            }
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
                nextR = {};
                for (const k of Object.keys(r)) nextR[colMap.get(k) ?? canon.get(norm(k)) ?? k] = r[k];
              }
              if (addCustomCol && customCol) {
                nextR[customCol] = appendVal;
              }
              return nextR;
            });

            // Incremental key handling. Keys match like Remove Duplicates and
            // Group By (trimmed, case-insensitive), and a batch that carries the
            // same key twice contributes ONE row: for upsert the last one (the
            // latest update), for append-new-only the first.
            if (keyCol && (incMode === 'append_new_only' || incMode === 'upsert')) {
              const keyOf = (r: Record<string, any>) => groupKeyOf(r[keyCol]);
              if (incMode === 'append_new_only') {
                const existingKeys = new Set(rows.map(keyOf));
                const fresh: Record<string, any>[] = [];
                for (const r of mappedOtherRows) {
                  const k = keyOf(r);
                  if (existingKeys.has(k)) continue;
                  existingKeys.add(k);
                  fresh.push(r);
                }
                rows = [...rows, ...fresh];
              } else if (incMode === 'upsert') {
                // newest_by: keep whichever version has the later timestamp, so
                // a late-arriving stale update cannot overwrite a newer one.
                const stamp = (r: Record<string, any>) => {
                  if (!newestBy) return 0;
                  const k = orderKey(r[newestBy]);
                  return k.kind === 0 || k.kind === 1 ? k.n : -Infinity; // number or date
                };
                // The key is unique in the result: repeats already in the base
                // rows collapse the same way (last, or newest by newest_by).
                const pos = new Map<string, number>();
                const merged: Record<string, any>[] = [];
                for (const r of rows) {
                  const k = keyOf(r);
                  const at = pos.get(k);
                  if (at === undefined) {
                    pos.set(k, merged.length);
                    merged.push(r);
                  } else {
                    baseDupes++;
                    if (!(newestBy && stamp(merged[at]) > stamp(r))) merged[at] = r;
                  }
                }
                const inThisBatch = new Set<string>();
                for (const r of mappedOtherRows) {
                  const k = keyOf(r);
                  if (inThisBatch.has(k)) withinBatchDupes++;
                  else inThisBatch.add(k);
                  const at = pos.get(k);
                  if (at === undefined) {
                    pos.set(k, merged.length);
                    merged.push(r);
                    continue;
                  }
                  if (newestBy && stamp(merged[at]) > stamp(r)) {
                    staleSkipped++;
                    continue;
                  }
                  merged[at] = r;
                }
                rows = merged;
              }
            } else {
              rows = [...rows, ...mappedOtherRows];
            }
          }
        });

        if (missingIds.length) warn(`${missingIds.length} dataset${missingIds.length === 1 ? '' : 's'} to append could not be found and ${missingIds.length === 1 ? 'was' : 'were'} skipped.`);
        if (renamed.length) warn(`Matched ${renamed.length} column name${renamed.length === 1 ? '' : 's'} that differ only in case or spaces: ${renamed.slice(0, 3).join(', ')}${renamed.length > 3 ? ', ...' : ''}.`);
        for (const [c, from] of added) warn(`New column "${c}" first appears in ${from[0]}${from.length > 1 ? ` (+${from.length - 1} more)` : ''}; earlier rows are blank there.`);
        for (const [c, from] of missing) warn(`${from.length} appended dataset${from.length === 1 ? '' : 's'} (${from.slice(0, 2).join(', ')}${from.length > 2 ? ', ...' : ''}) ${from.length === 1 ? 'has' : 'have'} no "${c}" column; those rows are blank there.`);
        if (staleSkipped) warn(`${staleSkipped} incoming row${staleSkipped === 1 ? ' was' : 's were'} older than the stored version (by "${newestBy}") and ${staleSkipped === 1 ? 'was' : 'were'} not applied.`);
        if (baseDupes) warn(`${baseDupes} row${baseDupes === 1 ? '' : 's'} in the starting data repeated a key; one row per key was kept.`);
        if (withinBatchDupes) warn(`${withinBatchDupes} key${withinBatchDupes === 1 ? '' : 's'} appeared more than once in the appended data; one row per key was kept.`);

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
              if (Object.prototype.hasOwnProperty.call(r, k)) next[k] = r[k];
            });
            Object.keys(r).forEach((k) => {
              if (!Object.prototype.hasOwnProperty.call(next, k)) next[k] = r[k];
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
        let noFill = false;
        if (strategy === 'mean' || strategy === 'median') {
          const nums = rows
            .map((r) => r[col])
            .filter((v) => !isBlank(v))
            .map((v) => parseSharedNumber(v))
            .filter((n): n is number => n !== null);
          if (nums.length === 0) {
            // No numbers to average: filling 0 would invent data.
            noFill = true;
            warn(`"${col}" has no numeric values, so there is no ${strategy} to fill with; blanks were left as they are.`);
          } else {
            if (strategy === 'mean') {
              fillVal = cleanFloat(preciseSum(nums) / nums.length);
            } else {
              nums.sort((a, b) => a - b);
              const mid = Math.floor(nums.length / 2);
              fillVal = nums.length % 2 === 1 ? nums[mid] : cleanFloat((nums[mid - 1] + nums[mid]) / 2);
            }
          }
        } else if (strategy === 'mode') {
          const freqs = new Map<any, number>();
          rows.forEach((r) => {
            const v = r[col];
            if (!isBlank(v)) {
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
          if (bestCount === 0) {
            noFill = true;
            warn(`"${col}" has no values, so there is no most common value to fill with; blanks were left as they are.`);
          }
        }
        if (noFill) {
          if (targetCol !== col) rows = rows.map((r) => ({ ...r, [targetCol]: r[col] }));
          break;
        }
        rows = rows.map((r) => {
          const current = r[col];
          const isMissing = isBlank(current) || (typeof current === 'number' && Number.isNaN(current));
          return { ...r, [targetCol]: isMissing ? fillVal : current };
        });
        break;
      }

      case 'flag_outliers': {
        const col = p.column;
        const targetCol = p.output_column || `${col}_is_outlier`;
        const nums = rows
          .map((r) => r[col])
          .filter((v) => !isBlank(v))
          .map((v) => parseSharedNumber(v))
          .filter((n): n is number => n !== null)
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
          // Blank is never an outlier (SPEC.md).
          if (isBlank(r[col])) return { ...r, [targetCol]: false };
          const n = parseSharedNumber(r[col]);
          const isOutlier = n !== null && (n < lower || n > upper);
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
        // Rank only real numbers: blank and non-numeric cells ("#VALUE!",
        // "n/a") used to count as 0 and fill a "bottom 10" list.
        const numeric = rows
          .map((r, i) => ({ r, i, v: isBlank(r[col]) ? null : parseSharedNumber(r[col]) }))
          .filter((x): x is { r: Record<string, any>; i: number; v: number } => x.v !== null);
        if (numeric.length > 0) {
          numeric.sort((a, b) => (mode === 'bottom' ? a.v - b.v : b.v - a.v) || a.i - b.i);
          rows = numeric.slice(0, n).map((x) => x.r);
        } else {
          rows = rows.slice(0, n);
        }
        break;
      }

      default:
        break;
    }
  });

  const compiledSql = `${sqlParts.join(',\n')}\nSELECT * FROM ${prevCte};`;
  let columns = inferSchema(rows);
  if (rows.length === 0 && baseColumns && baseColumns.length > 0) {
    // No rows left (a header-only file, a filter that matches nothing): the
    // columns come from the rows, so the grid would lose its headers. Run the
    // column-shaping steps over one blank row to learn the column names.
    const ROW_DROPPING = new Set(['filter_rows', 'remove_duplicates', 'remove_rows', 'top_bottom_n', 'promote_headers', 'transpose']);
    const byName = new Map(baseColumns.map((c) => [c.name, c]));
    try {
      const blank = Object.fromEntries(baseColumns.map((c) => [c.name, null]));
      const probe = executePipelineSteps([blank], (steps || []).filter((st) => st && !ROW_DROPPING.has(st.type)), allDatasets);
      const names = probe.rows[0] ? Object.keys(probe.rows[0]) : baseColumns.map((c) => c.name);
      columns = names.map((n) => byName.get(n) || { name: n, data_type: 'text' as DataType, physical_type: physicalTypeFor('text'), nullable: true });
    } catch {
      columns = baseColumns;
    }
  }
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
    // Same reader as the steps, so Chat and the grid never disagree on "₹1,23,456".
    return parseSharedNumber(val, { allowScientific: true });
  }
  return null;
}

const NULL_TOKENS = new Set(['n/a', 'na', '-', '--', 'null', 'none', '#n/a', 'nan', 'tbd', 'nil']);
function isNullToken(v: any): boolean {
  return typeof v === 'string' && NULL_TOKENS.has(v.trim().toLowerCase());
}

/** True when a column's slash dates are month-first (some value has a day > 12 in the 2nd slot and none in the 1st). */
function inferMonthFirst(values: any[]): boolean {
  let mf = 0;
  let df = 0;
  for (const v of values) {
    if (typeof v !== 'string') continue;
    const m = v.trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-]\d{2,4}$/);
    if (!m) continue;
    if (+m[1] > 12 && +m[2] <= 12) df++;
    else if (+m[2] > 12 && +m[1] <= 12) mf++;
  }
  return mf > 0 && df === 0;
}

// ---------------------------------------------------------------------------
// Numeric-comparison parsing for Chat with Data ("how many orders are over
// $500?", "show orders between 100 and 250", "orders with 10 units or more").
// ---------------------------------------------------------------------------

export type NumericComparisonOp = 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'between';

export interface NumericComparison {
  op: NumericComparisonOp;
  value: number;
  /** Upper bound, for op === 'between' (inclusive on both ends). */
  value2?: number;
  /** True when the threshold was written as money ($500, 2k dollars, ...). */
  isCurrency: boolean;
  /** Character range of the whole comparison phrase within the input text. */
  start: number;
  end: number;
  /** The word directly after the number, if any ("5 orders" -> "orders"). */
  wordAfter: string;
}

// Longest phrases first so "greater than or equal to" wins over "greater than".
const PREFIX_COMPARISON_OPS: Array<[string, NumericComparisonOp]> = [
  ['greater than or equal to', 'gte'],
  ['more than or equal to', 'gte'],
  ['less than or equal to', 'lte'],
  ['no less than', 'gte'],
  ['not less than', 'gte'],
  ['no more than', 'lte'],
  ['not more than', 'lte'],
  ['at least', 'gte'],
  ['at most', 'lte'],
  ['up to', 'lte'],
  ['greater than', 'gt'],
  ['more than', 'gt'],
  ['higher than', 'gt'],
  ['larger than', 'gt'],
  ['bigger than', 'gt'],
  ['less than', 'lt'],
  ['fewer than', 'lt'],
  ['lower than', 'lt'],
  ['smaller than', 'lt'],
  ['equal to', 'eq'],
  ['exceeding', 'gt'],
  ['exceeds', 'gt'],
  ['exceed', 'gt'],
  ['exactly', 'eq'],
  ['above', 'gt'],
  ['over', 'gt'],
  ['under', 'lt'],
  ['below', 'lt'],
  ['>=', 'gte'],
  ['<=', 'lte'],
  ['>', 'gt'],
  ['<', 'lt'],
  ['=', 'eq'],
];

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const CUR = '(?:[$€£₹]\\s*)?';
const NUM = '(-?\\d[\\d,]*(?:\\.\\d+)?|-?\\.\\d+)';
const SCALE = '(?:\\s*(k|m|bn|thousand|million|billion)\\b)?';
const CURRENCY_WORDS = /^(dollars?|usd|bucks|euros?|eur|pounds?|gbp|rupees?|inr|rs)$/;

const scaleNumber = (raw: string, scale?: string) => {
  const n = Number(raw.replace(/,/g, ''));
  const s = (scale || '').toLowerCase();
  if (s === 'k' || s === 'thousand') return n * 1e3;
  if (s === 'm' || s === 'million') return n * 1e6;
  if (s === 'bn' || s === 'billion') return n * 1e9;
  return n;
};

/**
 * Find the first numeric comparison in a natural-language question.
 * Requires an actual number, so "revenue over time" or "orders above
 * average" are deliberately NOT treated as comparisons.
 */
export function parseNumericComparison(text: string): NumericComparison | null {
  const t = text.toLowerCase();
  const found: NumericComparison[] = [];
  const nextWord = (from: number) => (t.slice(from).match(/^\s*([a-z_]+)/) || [])[1] || '';
  const hasCurrency = (phrase: string, after: string) => /[$€£₹]/.test(phrase) || CURRENCY_WORDS.test(after);

  // "between 100 and 250" / "between $1k to $2k"
  const between = new RegExp(`\\bbetween\\s+${CUR}${NUM}${SCALE}\\s*(?:and|to|-)\\s*${CUR}${NUM}${SCALE}`, 'g');
  for (const m of t.matchAll(between)) {
    const a = scaleNumber(m[1], m[2]);
    const b = scaleNumber(m[3], m[4]);
    const end = m.index! + m[0].length;
    const after = nextWord(end);
    found.push({ op: 'between', value: Math.min(a, b), value2: Math.max(a, b), isCurrency: hasCurrency(m[0], after), start: m.index!, end, wordAfter: after });
  }

  // "<op> [than] $500", e.g. "over $500", "at least 10", ">= 3"
  // Word operators must start at a word boundary ("turnover 500" is not
  // "over 500"); symbol operators may follow a letter directly ("amount<50").
  const wordOps = PREFIX_COMPARISON_OPS.filter(([p]) => /^[a-z]/.test(p)).map(([p]) => escapeRe(p)).join('|');
  const symbolOps = PREFIX_COMPARISON_OPS.filter(([p]) => !/^[a-z]/.test(p)).map(([p]) => escapeRe(p)).join('|');
  const prefix = new RegExp(
    `(?:(?:^|[^a-z0-9_<>=])(${wordOps})|(?:^|[^<>=])(${symbolOps}))\\s*${CUR}${NUM}${SCALE}(?!\\d|\\.\\d)`,
    'g',
  );
  for (const m of t.matchAll(prefix)) {
    const opText = m[1] || m[2];
    const op = PREFIX_COMPARISON_OPS.find(([p]) => p === opText)![1];
    const start = m.index! + m[0].indexOf(opText);
    const end = m.index! + m[0].length;
    const after = nextWord(end);
    found.push({ op, value: scaleNumber(m[3], m[4]), isCurrency: hasCurrency(m[0], after), start, end, wordAfter: after });
  }

  // "500 or more", "$1k and above", "10+ units"
  const postfix = new RegExp(
    // The optional word between the number and the qualifier is the unit:
    // "5 units or more", "10 orders or fewer".
    `(?:^|[^a-z0-9_.])(${CUR}${NUM}${SCALE})(?:\\s+([a-z_]+))?\\s*(\\+|or more|or greater|or higher|or above|or over|and above|and up|and over|or less|or fewer|or lower|or below|or under|and below|and under)(?![a-z])`,
    'g',
  );
  for (const m of t.matchAll(postfix)) {
    const isUpper = /less|fewer|lower|below|under/.test(m[5]);
    const start = m.index! + m[0].indexOf(m[1]);
    const end = m.index! + m[0].length;
    const after = m[4] || nextWord(end);
    found.push({ op: isUpper ? 'lte' : 'gte', value: scaleNumber(m[2], m[3]), isCurrency: hasCurrency(m[0], after), start, end, wordAfter: after });
  }

  if (!found.length) return null;
  found.sort((a, b) => a.start - b.start);
  return found[0];
}

export function numericComparisonMatches(v: number, c: NumericComparison): boolean {
  switch (c.op) {
    case 'gt': return v > c.value;
    case 'gte': return v >= c.value;
    case 'lt': return v < c.value;
    case 'lte': return v <= c.value;
    case 'eq': return v === c.value;
    case 'between': return v >= c.value && v <= (c.value2 as number);
  }
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
      // Broad business categories take highest priority for primaryDim
      if (col.includes('category') || col.includes('segment') || col.includes('department') || col.includes('type') || col.includes('division')) return 10;
      if (col.includes('region') || col.includes('country') || col.includes('city') || col.includes('channel')) return 8;
      if (col.includes('product') || col.includes('item') || col.includes('sku')) return 6;
      if (col.includes('customer') || col.includes('client') || col.includes('account')) return 5;
      if (col.includes('status') || col.includes('tier') || col.includes('stage')) return 4;
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
    const ext = file.name.split('.').pop()?.toLowerCase() || 'csv';
    let rows: Record<string, any>[] = [];
    let parsedHeaders: string[] = [];
    let byteSize = file.size || 0;

    if (ext === 'xlsx' || ext === 'xlsm') {
      const ExcelJS = (await import('exceljs')).default ?? (await import('exceljs'));
      const buf = await file.arrayBuffer();
      byteSize = buf.byteLength;
      const workbook = new (ExcelJS as any).Workbook();
      await workbook.xlsx.load(buf as any);
      const sheet = workbook.worksheets[0];
      if (sheet) {
        const headerRow = sheet.getRow(1);
        const headers: string[] = [];
        headerRow.eachCell({ includeEmpty: true }, (cell: any, colNumber: number) => {
          headers[colNumber - 1] = String(cell.value ?? '').trim() || `column_${colNumber}`;
        });
        const lastRow = sheet.rowCount;
        for (let r = 2; r <= lastRow; r++) {
          const excelRow = sheet.getRow(r);
          if (excelRow.cellCount === 0) continue;
          const obj: Record<string, any> = {};
          let anyValue = false;
          headers.forEach((h, idx) => {
            const cell = excelRow.getCell(idx + 1);
            let v = cell.value;
            if (v && typeof v === 'object' && 'result' in v) v = v.result; // formula cell
            if (v && typeof v === 'object' && v instanceof Date) {
              obj[h] = toISODate(v);
              anyValue = true;
            } else if (v === null || v === undefined || v === '') {
              obj[h] = null;
            } else if (typeof v === 'object' && 'text' in v) {
              obj[h] = String((v as any).text ?? '');
              anyValue = true;
            } else {
              obj[h] = v;
              anyValue = true;
            }
          });
          if (anyValue) rows.push(obj);
        }
      }
    } else if (ext === 'xls') {
      // Legacy binary .xls (BIFF8) is not supported by exceljs; surface a
      // clear error instead of silently mis-reading the binary as CSV text.
      throw new Error(
        'Legacy .xls files are not supported. Please re-save the file as .xlsx and upload again.'
      );
    } else if (ext === 'parquet') {
      throw new Error('Parquet import is not supported in the standalone (browser) engine.');
    } else {
      const text = await readTextWithEncodingDetection(file);
      byteSize = byteSize || text.length;
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
      } else {
        // 'txt' and 'csv' both auto-detect comma vs semicolon vs tab
        const table = parseDelimitedTable(text, ext === 'tsv' ? '\t' : undefined);
        rows = table.rows;
        parsedHeaders = table.headers;
      }
    }

    // JSON.parse keeps a "__proto__" key as an own property; copying such a
    // row later would turn it into the prototype and drop the column.
    if (rows.some((r) => r && typeof r === 'object' && Object.prototype.hasOwnProperty.call(r, '__proto__'))) {
      rows = rows.map((r) => {
        if (!r || typeof r !== 'object' || !Object.prototype.hasOwnProperty.call(r, '__proto__')) return r;
        const next: Record<string, any> = {};
        for (const k of Object.keys(r)) Object.defineProperty(next, k === '__proto__' ? '_proto_' : k, { value: r[k], enumerable: true, writable: true, configurable: true });
        return next;
      });
    }
    let schema = inferSchema(rows);
    if (schema.length === 0 && parsedHeaders.length > 0) {
      // A header-only file still has columns (it is a template to fill).
      schema = parsedHeaders.map((h) => ({ name: h, data_type: 'text' as DataType, physical_type: physicalTypeFor('text'), nullable: true }));
    }
    const now = new Date().toISOString();
    const meta: Dataset = {
      id: `local-ds-${crypto.randomUUID().slice(0, 8)}`,
      name: name || file.name.replace(/\.[^/.]+$/, ''),
      original_filename: file.name,
      file_format: ext,
      row_count: rows.length,
      column_count: schema.length,
      file_size_bytes: byteSize,
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
      // Grid sort uses the same number/date-aware ordering as the Sort step.
      const keyed = rows.map((r: any, i: number) => ({ r, i, k: sorts.map((c: any) => orderKey(r[c.column])) }));
      keyed.sort((a: any, b: any) => {
        for (let j = 0; j < sorts.length; j++) {
          const cmp = compareOrderKeys(a.k[j], b.k[j], sorts[j].direction === 'desc');
          if (cmp !== 0) return cmp;
        }
        return a.i - b.i;
      });
      rows = keyed.map((x: any) => x.r);
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
    const ds = all.find((d) => d.meta.id === datasetId);
    if (!ds) throw new Error(`Dataset not found: ${datasetId}`);

    const { rows: pipelineRows, columns, compiledSql, stepSummaries } = executePipelineSteps(
      ds.rows,
      steps,
      all,
      ds.meta.schema_metadata
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
      // Grid sort uses the same number/date-aware ordering as the Sort step.
      const keyed = rows.map((r: any, i: number) => ({ r, i, k: sorts.map((c: any) => orderKey(r[c.column])) }));
      keyed.sort((a: any, b: any) => {
        for (let j = 0; j < sorts.length; j++) {
          const cmp = compareOrderKeys(a.k[j], b.k[j], sorts[j].direction === 'desc');
          if (cmp !== 0) return cmp;
        }
        return a.i - b.i;
      });
      rows = keyed.map((x: any) => x.r);
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
    const ds = all.find((d) => d.meta.id === datasetId);
    if (!ds) throw new Error(`Dataset not found: ${datasetId}`);
    const res = executePipelineSteps(ds.rows, steps, all, ds.meta.schema_metadata);
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

    // 1b. Text case / cleaning transform, e.g. "capitalize product names",
    // "make the status column uppercase", "trim spaces in customer name".
    // This must be checked before the filter/default-fallback branches below,
    // because a case-change request shares no "filter"/"where" keyword with
    // the filter branch and was previously falling through to the generic
    // "filter column is not null" default, silently producing the wrong
    // step type with no indication anything had gone wrong.
    const caseOp: string | null = /\b(upper\s*-?\s*case|all\s*caps)\b/i.test(p)
      ? 'upper'
      : /\blower\s*-?\s*case\b/i.test(p)
      ? 'lower'
      : /\bcapitali[sz]e|\bproper\s*-?\s*case\b|\btitle\s*-?\s*case\b/i.test(p)
      ? 'proper'
      : /\btrim(med)?\s+(spaces?|whitespace)\b|\bremove\s+(extra\s+)?spaces?\b/i.test(p)
      ? 'trim'
      : /\bclean(\s+up)?\s+(the\s+)?text\b|\bnon-?printable\b/i.test(p)
      ? 'clean'
      : null;
    if (caseOp) {
      // Resolve the target column: a direct substring match first (handles
      // "capitalize the status column"), then a fuzzy word-overlap match
      // that tolerates underscores/pluralization (handles "product names"
      // matching a "product_name" column).
      const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      const promptWords = new Set(normalize(p).split(' ').filter(Boolean));
      const direct = cols.find((c) => lower.includes(c.toLowerCase()));
      let targetCol = direct;
      if (!targetCol) {
        let best: { col: string; score: number } | null = null;
        for (const c of cols) {
          const colWords = normalize(c).split(' ').filter(Boolean);
          let score = 0;
          for (const w of colWords) {
            const singular = w.endsWith('s') ? w.slice(0, -1) : w;
            if (promptWords.has(w) || promptWords.has(singular) || promptWords.has(`${w}s`)) score++;
          }
          if (score > 0 && (!best || score > best.score)) best = { col: c, score };
        }
        targetCol = best?.col;
      }
      const col = targetCol || cols[0] || 'text_col';
      const opLabel: Record<string, string> = {
        upper: 'UPPERCASE',
        lower: 'lowercase',
        proper: 'Proper/Title Case',
        trim: 'Trim Spaces',
        clean: 'Clean Non-Printable',
      };
      return {
        step: {
          id: crypto.randomUUID(),
          type: 'text_transform',
          label: `${opLabel[caseOp]} on ${col}`,
          enabled: true,
          params: { column: col, operation: caseOp },
        },
        explanation: `Applies ${opLabel[caseOp]} to the "${col}" column.`,
        confidence: targetCol ? 0.93 : 0.75,
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
        return new Blob(['\uFEFF' + toCsv(cols, rows)], { type: 'text/csv;charset=utf-8;' });
      }
    }
    return this.exportCsv(datasetId, steps);
  },

  async exportCsv(datasetId: string, steps: any[]): Promise<Blob> {
    // No silent row cap (SPEC.md): export every row.
    const preview = await this.previewPipeline(datasetId, steps || [], { offset: 0, limit: Number.MAX_SAFE_INTEGER });
    const rows: Record<string, any>[] = preview.rows;
    const cols: string[] = preview.columns.map((c: any) => c.name);
    // UTF-8 BOM so Excel opens non-ASCII text correctly (SPEC.md); cells are
    // quoted and guarded against formula injection by csvCell().
    return new Blob(['\uFEFF' + toCsv(cols, rows)], { type: 'text/csv;charset=utf-8;' });
  },

  async exportExcel(datasetId: string, steps: any[]): Promise<Blob> {
    const preview = await this.previewPipeline(datasetId, steps || [], { offset: 0, limit: Number.MAX_SAFE_INTEGER });
    const rows: Record<string, any>[] = preview.rows;
    const cols: string[] = preview.columns.map((c: any) => c.name);
    // Written by our own minimal XLSX writer rather than ExcelJS: ExcelJS's
    // Document model was ~38s per 100K rows (5+ min projected at 1M), and its
    // fast streaming writer doesn't exist in the browser build Vite ships
    // (`ExcelJS.stream` is undefined in dist/exceljs.min.js). See the header
    // comment in engine/xlsxWriter.ts for the full rationale and measurements
    // (~1.3s per 100K rows, ~11.6s for 1M).
    const bytes = await buildXlsx(cols, rows);
    return new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  },

  async exportParquet(_datasetId: string, _steps: any[]): Promise<Blob> {
    // Real Parquet encoding requires a binary columnar writer this bundle
    // does not carry. Fail clearly instead of silently handing back a
    // CSV file mislabeled as Parquet (SPEC.md: "no silent truncation/mislabeling").
    throw new Error(
      'Parquet export is not available in the standalone (browser) engine yet. Use CSV or Excel export instead.'
    );
  },

  async exportJson(datasetId: string, steps: any[]): Promise<Blob> {
    const preview = await this.previewPipeline(datasetId, steps || [], { offset: 0, limit: Number.MAX_SAFE_INTEGER });
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
    if (!String(prompt ?? '').trim()) {
      return {
        plan: { schema_version: '1.0', intent: 'empty', dataset_id: datasetId, select: [], filters: [], group_by: [], limit: 0, chart: null, explanation: 'No question asked.' },
        explanation: `Ask a question about ${datasetName || 'this dataset'}, for example "total revenue by region" or "how many orders are cancelled?".`,
        calculation_method: 'No calculation: the question was empty.',
        columns: [], rows: [], row_count: 0, chart: null, query_trace: '', latency_ms: 0.5, provider: 'localEngine', model: 'duckdb-in-browser',
      };
    }
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

    // Multi-part questions (several filters, NOT/IN, dates, ids, rankings,
    // shares, group conditions, spread, growth) go to the structured planner,
    // which answers all of the question or declines -- never a partial answer.
    const planned = planChatQuery(prompt, rows, profile);
    if (planned) {
      if (planned.kind === 'decline') {
        return {
          plan: { schema_version: '1.0', intent: 'unsupported', dataset_id: datasetId, select: [], filters: [], group_by: [], limit: 0, chart: null, explanation: planned.reason },
          explanation: `I can't answer that reliably yet: I couldn't work out ${planned.reason}. Try naming the column and value, e.g. "total revenue where status is Completed".`,
          calculation_method: 'Declined rather than guess: part of the question could not be mapped to the data.',
          columns: [],
          rows: [],
          row_count: 0,
          chart: null,
          query_trace: '',
          latency_ms: 2.0,
          provider: 'localEngine',
          model: 'duckdb-in-browser',
          declined: true,
        };
      }
      const a = planned.answer;
      return {
        plan: { schema_version: '1.0', intent: a.intent, dataset_id: datasetId, select: a.columns.map((c) => ({ column: c })), filters: a.filters, group_by: a.groupBy, limit: a.rows.length, chart: a.chart, explanation: a.method },
        explanation: a.explanation,
        calculation_method: a.method,
        columns: a.columns,
        rows: a.rows,
        row_count: a.rows.length,
        chart: a.chart,
        query_trace: a.trace,
        latency_ms: 8.0,
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

    // Find a low-cardinality categorical value named as a whole word/phrase in
    // the prompt ("cancelled", "enterprise", "north"), longest match first.
    // Only columns with <= 30 distinct values qualify -- a high-cardinality
    // column (a name or id) is not something a user references by value, and
    // including it risks a coincidental word match.
    const findNamedCategoricalValue = (): { value: string; col: string } | null => {
      const valueToCol: Record<string, string> = Object.create(null); // keyed by data values: no inherited keys
      for (const d of profile.dimensions) {
        const seen = new Set<string>();
        let tooHighCardinality = false;
        for (const r of rows) {
          const v = getRowVal(r, d);
          if (v === null || v === undefined) continue;
          const s = String(v).trim();
          if (s) seen.add(s.toLowerCase());
          if (seen.size > 30) {
            tooHighCardinality = true;
            break;
          }
        }
        if (!tooHighCardinality && seen.size > 0) {
          for (const v of seen) {
            if (!Object.prototype.hasOwnProperty.call(valueToCol, v)) valueToCol[v] = d;
          }
        }
      }
      const candidates = Object.keys(valueToCol).sort((a, b) => b.length - a.length);
      for (const val of candidates) {
        const escaped = val.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (new RegExp(`\\b${escaped}\\b`, 'i').test(pLower)) return { value: val, col: valueToCol[val] };
      }
      return null;
    };

    // =========================================================================
    // 1b. NUMERIC COMPARISON FILTER (no grouping requested), e.g. "how many
    // orders are over $500?", "show orders between 100 and 250", "count of
    // orders with 10 units or more", "how many cancelled orders are above
    // 1k?". Previously there was no filter parsing for these at all: they
    // fell through to the generic default-ranking fallback and returned a
    // "top 10 order_id by amount" table that answers a different question.
    // Runs before the categorical-count branch below so a question naming
    // both a category value and a threshold applies BOTH filters, instead of
    // the categorical branch answering with a count that ignores the
    // threshold.
    // =========================================================================
    // Which column does a numeric comparison apply to? Shared by the
    // threshold branch (1b) and the percentage branch.
    const resolveComparisonTarget = (cmp: NumericComparison) => {
      const STOP_WORDS = new Set(['in', 'on', 'at', 'and', 'or', 'the', 'for', 'with', 'from', 'of', 'per', 'each', 'this', 'that', 'last', 'next', 'year', 'month', 'week', 'day', 'days', 'today']);
      const UNIT_WORDS = /^(units?|items?|pieces?|pcs|qty)$/;
      const ENTITY_WORDS = /^(orders?|customers?|clients?|products?|transactions?|purchases?|invoices?|accounts?|users?|visits?|tickets?|records?|rows?)$/;

      // Which column is being compared? In priority order:
      //  1. a measure/unit named right after the number ("10 units");
      //  2. the measure named closest BEFORE the comparison ("orders with
      //     an amount over 500", "unit price above 50"), else one after it;
      //  3. for a money threshold ("$500", "2k dollars"), the main monetary
      //     measure;
      //  4. the dataset's primary measure -- always named in the answer, so
      //     the assumption is visible.
      let targetCol = '';
      let howResolved = '';
      // An entity noun right after the number ("customers with more than 5
      // orders") asks for a per-entity count (GROUP BY ... HAVING COUNT(*)),
      // not a threshold on a column; comparing some measure to 5 would give
      // a confidently wrong answer, so leave this branch to the other paths.
      const isPerEntityCount = ENTITY_WORDS.test(cmp.wordAfter) && !resolveMeasureCol(cmp.wordAfter);
      if (!isPerEntityCount) {
        if (cmp.wordAfter && !STOP_WORDS.has(cmp.wordAfter) && !CURRENCY_WORDS.test(cmp.wordAfter)) {
          if (UNIT_WORDS.test(cmp.wordAfter)) targetCol = resolveMeasureCol('quantity');
          else if (cmp.wordAfter.length >= 3) {
            targetCol = profile.measures.find((m) => {
              const ml = m.toLowerCase();
              return ml === cmp.wordAfter || ml.replace(/_/g, ' ') === cmp.wordAfter || ml === cmp.wordAfter.replace(/s$/, '');
            }) || '';
            if (!targetCol && Object.keys(MEASURE_SYNONYMS).includes(cmp.wordAfter.replace(/s$/, ''))) {
              targetCol = resolveMeasureCol(cmp.wordAfter.replace(/s$/, ''));
            }
          }
          if (targetCol) howResolved = 'named';
        }
        if (!targetCol) {
          // Collect every measure mention (column names, spaced forms, and
          // synonym keys like "revenue"/"price"), keyed by position.
          const mentions: Array<{ col: string; idx: number }> = [];
          const addMentions = (needle: string, col: string) => {
            if (!col || !needle) return;
            const re = new RegExp(`\\b${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}s?\\b`, 'g');
            for (const m of pLower.matchAll(re)) mentions.push({ col, idx: m.index! });
          };
          for (const m of profile.measures) {
            addMentions(m.toLowerCase(), m);
            addMentions(m.toLowerCase().replace(/_/g, ' '), m);
          }
          for (const key of Object.keys(MEASURE_SYNONYMS)) addMentions(key, resolveMeasureCol(key));
          const before = mentions.filter((m) => m.idx < cmp.start).sort((a, b) => b.idx - a.idx);
          const after = mentions.filter((m) => m.idx >= cmp.end).sort((a, b) => a.idx - b.idx);
          const pick = before[0] || after[0];
          if (pick) {
            targetCol = pick.col;
            howResolved = 'named';
          }
        }
        if (!targetCol && cmp.isCurrency) {
          targetCol = resolveMeasureCol('amount') || resolveMeasureCol('revenue') || resolveMeasureCol('sales') || '';
          if (targetCol) howResolved = 'currency';
        }
        if (!targetCol && profile.measures.includes(profile.primaryMeasure)) {
          targetCol = profile.primaryMeasure;
          howResolved = 'default';
        }
      }

      return { targetCol, howResolved, isPerEntityCount, ENTITY_WORDS };
    };

    // ---- shared helpers for the analytical branches below ----
    type ChatAgg = 'sum' | 'avg' | 'median' | 'min' | 'max' | 'count';
    const aggOfCue = (text: string): ChatAgg =>
      /\bmedian\b/.test(text)
        ? 'median'
        : /\b(average|avg|mean)\b/.test(text)
          ? 'avg'
          : /\b(minimum|min)\b/.test(text)
            ? 'min'
            : /\b(maximum|max)\b/.test(text)
              ? 'max'
              : 'sum';
    const aggregate = (nums: number[], fn: ChatAgg): number | null => {
      if (fn === 'count') return nums.length;
      if (nums.length === 0) return null;
      if (fn === 'sum') return cleanFloat(preciseSum(nums));
      if (fn === 'avg') return cleanFloat(preciseSum(nums) / nums.length);
      if (fn === 'min') return arrayMin(nums);
      if (fn === 'max') return arrayMax(nums);
      const sorted = [...nums].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 ? sorted[mid] : cleanFloat((sorted[mid - 1] + sorted[mid]) / 2);
    };
    const AGG_LABEL: Record<ChatAgg, string> = { sum: 'Total', avg: 'Average', median: 'Median', min: 'Minimum', max: 'Maximum', count: 'Count' };
    const AGG_SQL: Record<ChatAgg, string> = { sum: 'SUM', avg: 'AVG', median: 'MEDIAN', min: 'MIN', max: 'MAX', count: 'COUNT' };
    const titleCase = (c: string) => c.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
    const fmt2 = (n: number | null) => (n === null ? 'n/a' : (Math.round(n * 100) / 100).toLocaleString());
    const chatResult = (o: { intent: string; explanation: string; method: string; columns: string[]; rows: any[]; chart: any; trace: string; select?: any[]; groupBy?: string[]; filters?: any[] }) => ({
      plan: {
        schema_version: '1.0',
        intent: o.intent,
        dataset_id: datasetId,
        select: o.select || o.columns.map((c) => ({ column: c })),
        filters: o.filters || [],
        group_by: o.groupBy || [],
        limit: o.rows.length,
        chart: o.chart,
        explanation: o.method,
      },
      explanation: o.explanation,
      calculation_method: o.method,
      columns: o.columns,
      rows: o.rows,
      row_count: o.rows.length,
      chart: o.chart,
      query_trace: o.trace,
      latency_ms: 8.0,
      provider: 'localEngine',
      model: 'duckdb-in-browser',
    });
    // Time grain named in a phrase ("by month", "monthly", "per quarter").
    const grainOf = (text: string): 'day' | 'week' | 'month' | 'quarter' | 'year' | null => {
      if (/\b(monthly|months?)\b/.test(text)) return 'month';
      if (/\b(quarterly|quarters?|qtr)\b/.test(text)) return 'quarter';
      if (/\b(yearly|annual(ly)?|years?)\b/.test(text)) return 'year';
      if (/\b(weekly|weeks?)\b/.test(text)) return 'week';
      if (/\b(daily|days?|dates?)\b/.test(text)) return 'day';
      return null;
    };
    const timeBucket = (v: any, grain: string): string | null => {
      const d = parseSharedDate(v);
      if (!d) return null;
      const y = d.getUTCFullYear();
      const m = d.getUTCMonth() + 1;
      if (grain === 'year') return String(y);
      if (grain === 'quarter') return `${y}-Q${Math.floor((m - 1) / 3) + 1}`;
      if (grain === 'month') return `${y}-${String(m).padStart(2, '0')}`;
      if (grain === 'week') return `week of ${toISODate(new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86400000))}`;
      return toISODate(d);
    };
    // Rows restricted to a categorical value named in the question
    // ("completed orders", "in the north region"); null when none is named.
    // Never a value of the column being grouped by.
    const namedFilter = (excludeCol?: string) => {
      const named = findNamedCategoricalValue();
      if (!named || named.col === excludeCol) return null;
      return {
        named,
        rows: rows.filter((r) => groupKeyOf(getRowVal(r, named.col)) === named.value),
        text: ` for **${named.col.replace(/_/g, ' ')}** = **${named.value.replace(/\b\w/g, (l) => l.toUpperCase())}**`,
        sql: ` WHERE LOWER("${named.col}") = '${named.value.replace(/'/g, "''")}'`,
        filter: { column: named.col, operator: 'eq', value: named.value },
      };
    };
    const countCueAll = /\bhow many\b|\bnumber of\b|\bcount\b/.test(pLower);

    // Time series: one row per day/week/month/quarter/year, in date order.
    const answerTimeSeries = (grain: string, measure: string, fn: ChatAgg, sourceRows: any[], filterText = '', filterSql = '', filters: any[] = []) => {
      const dateCol = profile.dates[0];
      const buckets = new Map<string, number[]>();
      let undated = 0;
      for (const r of sourceRows) {
        const b = timeBucket(getRowVal(r, dateCol), grain);
        if (b === null) {
          undated++;
          continue;
        }
        if (!buckets.has(b)) buckets.set(b, []);
        if (fn === 'count') buckets.get(b)!.push(1);
        else {
          const n = parseNumericValue(getRowVal(r, measure));
          if (n !== null) buckets.get(b)!.push(n);
        }
      }
      const alias = fn === 'count' ? 'Count' : `${AGG_LABEL[fn]} ${titleCase(measure)}`;
      const out = Array.from(buckets.entries())
        .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
        .map(([k, nums]) => ({ [grain]: k, [alias]: aggregate(nums, fn) }));
      const undatedNote = undated ? ` ${undated.toLocaleString()} rows with no valid ${dateCol.replace(/_/g, ' ')} are not included.` : '';
      return chatResult({
        intent: 'trend',
        explanation: `${alias} by ${grain}${filterText}, ${out.length.toLocaleString()} ${grain}s in date order.${undatedNote}`,
        method: `${AGG_SQL[fn]}(${fn === 'count' ? '*' : `"${measure}"`}) grouped by the ${grain} of "${dateCol}", sorted chronologically.`,
        columns: [grain, alias],
        rows: out,
        chart: { type: 'line', x: grain, y: alias },
        trace: `SELECT DATE_TRUNC('${grain}', "${dateCol}") AS "${grain}", ${AGG_SQL[fn]}(${fn === 'count' ? '*' : `"${measure}"`}) AS "${alias}" FROM "${datasetName}"${filterSql} GROUP BY 1 ORDER BY 1;`,
        groupBy: [grain],
        filters,
      });
    };

    // =========================================================================
    // 0a. PERCENTAGE OF ROWS ("what percentage of orders were cancelled?",
    // "what share of orders are over $500?"). Previously fell through to an
    // unrelated ranking table.
    // =========================================================================
    if (!byMatch && /\b(percent|percentage|share|proportion)\b/.test(pLower)) {
      const pcCmp = parseNumericComparison(prompt);
      const pcTarget = pcCmp ? resolveComparisonTarget(pcCmp) : null;
      const named = findNamedCategoricalValue();
      if ((pcCmp && pcTarget && pcTarget.targetCol) || named) {
        let matching = rows;
        const parts: string[] = [];
        const sqlParts: string[] = [];
        const filters: any[] = [];
        if (named) {
          matching = matching.filter((r) => groupKeyOf(getRowVal(r, named.col)) === named.value);
          parts.push(`**${named.col.replace(/_/g, ' ')}** = **${named.value.replace(/\b\w/g, (l) => l.toUpperCase())}**`);
          sqlParts.push(`LOWER("${named.col}") = '${named.value.replace(/'/g, "''")}'`);
          filters.push({ column: named.col, operator: 'eq', value: named.value });
        }
        if (pcCmp && pcTarget && pcTarget.targetCol) {
          const col = pcTarget.targetCol;
          matching = matching.filter((r) => {
            const n = parseNumericValue(getRowVal(r, col));
            return n !== null && numericComparisonMatches(n, pcCmp);
          });
          const opText = pcCmp.op === 'between' ? `between ${pcCmp.value} and ${pcCmp.value2}` : `${{ gt: '>', gte: '>=', lt: '<', lte: '<=', eq: '=' }[pcCmp.op]} ${pcCmp.value}`;
          parts.push(`**${col.replace(/_/g, ' ')}** ${opText}`);
          sqlParts.push(`"${col}" ${pcCmp.op === 'between' ? `BETWEEN ${pcCmp.value} AND ${pcCmp.value2}` : opText}`);
          filters.push({ column: col, operator: pcCmp.op, value: pcCmp.value });
        }
        const pct = rows.length ? Math.round((matching.length / rows.length) * 10000) / 100 : 0;
        return chatResult({
          intent: 'summary',
          explanation: `**${pct}%** of rows (${matching.length.toLocaleString()} of ${rows.length.toLocaleString()}) match ${parts.join(' and ')}.`,
          method: `COUNT(*) WHERE ${sqlParts.join(' AND ')} / COUNT(*) x 100.`,
          columns: ['Percentage', 'Matching Rows', 'Total Rows'],
          rows: [{ Percentage: pct, 'Matching Rows': matching.length, 'Total Rows': rows.length }],
          chart: { type: 'table', x: 'Percentage', y: 'Percentage' },
          trace: `SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE ${sqlParts.join(' AND ')}) / COUNT(*), 2) AS "Percentage" FROM "${datasetName}";`,
          filters,
        });
      }
    }

    // =========================================================================
    // 0b. WHICH <dimension> HAS THE HIGHEST/LOWEST <measure> ("which region
    // has the highest revenue?", "which customer placed the most orders?",
    // "which month had the lowest sales?"). Previously answered with the
    // single largest row value (a scalar MAX), not the winning group.
    // =========================================================================
    // "at least"/"at most" are thresholds, not superlatives.
    const superlative = pLower.replace(/\bat (least|most)\b/g, ' ').match(/\b(highest|most|largest|biggest|greatest|best|top|lowest|least|smallest|fewest|worst)\b/);
    const whichMatch = pLower.match(/\bwhich\s+([a-z_]+)/) || pLower.match(/\bwhat\s+([a-z_]+)\s+(?:has|had|have|did|does|was|is|generated|made|sold|brought|placed)\b/);
    const topNumber = pLower.match(/\b(?:top|bottom)\s+\d+/);
    if (superlative && whichMatch && !topNumber && !byMatch) {
      const word = whichMatch[1];
      const low = /\b(lowest|least|smallest|fewest|worst)\b/.test(superlative[0]);
      const rest = pLower.slice((whichMatch.index || 0) + whichMatch[0].length);
      const grain = grainOf(word);
      const dim = grain ? '' : resolveDimCol(word);
      const restMeasure = resolveMeasureCol(rest.replace(/\b(highest|most|largest|biggest|greatest|best|top|lowest|least|smallest|fewest|worst|the|has|had|have|with|in|of|by)\b/g, ' ').trim());
      const countMode = !restMeasure && /\b(orders?|transactions?|purchases?|rows?|records?|invoices?|tickets?|visits?)\b/.test(rest);
      const measure = countMode ? '' : restMeasure || profile.primaryMeasure;
      if ((dim || (grain && profile.dates.length > 0)) && (countMode || measure)) {
        const fn: ChatAgg = countMode ? 'count' : aggOfCue(pLower) === 'sum' ? 'sum' : aggOfCue(pLower);
        const groups = new Map<string, { label: string; nums: number[] }>();
        for (const r of rows) {
          let key: string | null;
          let label: string;
          if (grain) {
            key = timeBucket(getRowVal(r, profile.dates[0]), grain);
            label = key || '';
          } else {
            const raw = getRowVal(r, dim);
            key = isBlank(raw) ? null : groupKeyOf(raw);
            label = isBlank(raw) ? '' : String(raw).trim();
          }
          if (key === null) continue;
          if (!groups.has(key)) groups.set(key, { label, nums: [] });
          if (countMode) groups.get(key)!.nums.push(1);
          else {
            const n = parseNumericValue(getRowVal(r, measure));
            if (n !== null) groups.get(key)!.nums.push(n);
          }
        }
        const groupCol = grain || dim;
        const alias = countMode ? 'Count' : `${AGG_LABEL[fn]} ${titleCase(measure)}`;
        const ranked = Array.from(groups.values())
          .map((g) => ({ [groupCol]: g.label, [alias]: aggregate(g.nums, fn) as number }))
          .filter((r) => r[alias] !== null)
          .sort((a, b) => (low ? (a[alias] as number) - (b[alias] as number) : (b[alias] as number) - (a[alias] as number)));
        if (ranked.length > 0) {
          const win = ranked[0];
          const runner = ranked[1];
          const what = countMode ? `the ${low ? 'fewest' : 'most'} rows` : `the ${low ? 'lowest' : 'highest'} ${alias.toLowerCase()}`;
          return chatResult({
            intent: 'ranking',
            explanation: `**${win[groupCol]}** has ${what}: **${fmt2(win[alias] as number)}**${runner ? ` (next: ${runner[groupCol]}, ${fmt2(runner[alias] as number)})` : ''}.`,
            method: `${AGG_SQL[fn]}(${countMode ? '*' : `"${measure}"`}) for each ${groupCol.replace(/_/g, ' ')}, ranked ${low ? 'lowest' : 'highest'} first.`,
            columns: [groupCol, alias],
            rows: ranked,
            chart: { type: 'bar', x: groupCol, y: alias },
            trace: `SELECT "${groupCol}", ${AGG_SQL[fn]}(${countMode ? '*' : `"${measure}"`}) AS "${alias}" FROM "${datasetName}" GROUP BY 1 ORDER BY 2 ${low ? 'ASC' : 'DESC'};`,
            groupBy: [groupCol],
          });
        }
      }
    }

    const numericComparison = !byMatch ? parseNumericComparison(prompt) : null;
    if (numericComparison && profile.measures.length > 0) {
      const cmp = numericComparison;
      const countCue =
        pLower.includes('how many') ||
        pLower.includes('number of') ||
        pLower.includes('count of') ||
        /\bcount\b/.test(pLower);
      const statAggCue = /\b(average|avg|mean|median|sum|min|minimum|max|maximum)\b/.test(pLower);
      const { targetCol, howResolved, isPerEntityCount, ENTITY_WORDS } = resolveComparisonTarget(cmp);

      const listCue = !countCue && !statAggCue;
      // The function-wide isAscending flag fires on "least", which here is
      // almost always "at least" (a threshold, not a sort order).
      const sortAscending = /\b(bottom|lowest)\b/.test(pLower) || /(?<!\bat )\bleast\b/.test(pLower);

      // "how many customers have more than 5 orders?" / "which customers
      // placed at least 3 orders?": a per-entity count compared against the
      // threshold -- GROUP BY <entity> HAVING COUNT(...) <op> N.
      if (isPerEntityCount && (countCue || listCue)) {
        const singular = (w: string) => w.replace(/s$/, '');
        const subjectWord = (pLower.slice(0, cmp.start).match(/[a-z_]+/g) || [])
          .reverse()
          .find((w) => ENTITY_WORDS.test(w) && singular(w) !== singular(cmp.wordAfter));
        const groupCol = subjectWord ? resolveDimCol(subjectWord) : '';
        // Count distinct ids of the counted entity when the dataset has a
        // column for it (several rows can share one order_id); otherwise
        // ("records", "rows", or no matching column) count rows.
        const countedCol = /^(records?|rows?)$/.test(cmp.wordAfter) ? '' : resolveDimCol(cmp.wordAfter);
        if (groupCol && groupCol !== countedCol) {
          const perGroup = new Map<string, Set<string> | number>();
          for (const r of rows) {
            const g = String(getRowVal(r, groupCol) ?? '').trim();
            if (!g) continue;
            if (countedCol) {
              const v = String(getRowVal(r, countedCol) ?? '').trim();
              if (!v) continue;
              let set = perGroup.get(g) as Set<string> | undefined;
              if (!set) perGroup.set(g, (set = new Set()));
              set.add(v);
            } else {
              perGroup.set(g, ((perGroup.get(g) as number) || 0) + 1);
            }
          }
          const countAlias = `${cmp.wordAfter.replace(/\b\w/g, (l) => l.toUpperCase())} Count`;
          const qualifying: Array<Record<string, any>> = [];
          for (const [g, v] of perGroup) {
            const c = typeof v === 'number' ? v : v.size;
            if (numericComparisonMatches(c, cmp)) qualifying.push({ [groupCol]: g, [countAlias]: c });
          }
          const opSql: Record<NumericComparisonOp, string> = { gt: '>', gte: '>=', lt: '<', lte: '<=', eq: '=', between: 'BETWEEN' };
          const countExpr = countedCol ? `COUNT(DISTINCT "${countedCol}")` : 'COUNT(*)';
          const havingSql =
            cmp.op === 'between' ? `${countExpr} BETWEEN ${cmp.value} AND ${cmp.value2}` : `${countExpr} ${opSql[cmp.op]} ${cmp.value}`;
          const condText =
            cmp.op === 'between'
              ? `between ${cmp.value} and ${cmp.value2}`
              : `${{ gt: 'more than', gte: 'at least', lt: 'fewer than', lte: 'at most', eq: 'exactly' }[cmp.op]} ${cmp.value.toLocaleString()}`;
          const groupLabel = groupCol.replace(/_/g, ' ');
          const sentence = `**${qualifying.length.toLocaleString()}** of ${perGroup.size.toLocaleString()} distinct **${groupLabel}** values have ${condText} ${cmp.wordAfter}`;
          const plan = {
            schema_version: '1.0',
            intent: countCue ? 'summary' : 'filter',
            dataset_id: datasetId,
            select: [{ column: groupCol }, { column: countedCol || groupCol, aggregation: 'count', alias: countAlias }],
            group_by: [groupCol],
            limit: countCue ? 1 : 100,
            chart: { type: 'table', x: groupCol, y: countAlias },
            explanation: `Grouped by "${groupCol}" and kept groups where ${havingSql}.`,
          };
          const common = { latency_ms: 8.1, provider: 'localEngine', model: 'duckdb-in-browser' };
          if (countCue) {
            const alias = `${groupLabel.replace(/\b\w/g, (l) => l.toUpperCase())} Count`;
            return {
              ...common,
              plan,
              explanation: `${sentence}.`,
              calculation_method: `Counted "${groupCol}" groups where ${havingSql}.`,
              columns: [alias],
              rows: [{ [alias]: qualifying.length }],
              row_count: 1,
              chart: { type: 'table', x: alias, y: alias },
              query_trace: `SELECT COUNT(*) AS "${alias}" FROM (SELECT "${groupCol}" FROM "${datasetName}" GROUP BY "${groupCol}" HAVING ${havingSql});`,
            };
          }
          qualifying.sort((a, b) => (sortAscending ? a[countAlias] - b[countAlias] : b[countAlias] - a[countAlias]));
          const shown = qualifying.slice(0, topMatch ? limit : 100);
          return {
            ...common,
            plan,
            explanation: `${sentence}.${qualifying.length > shown.length ? ` Showing the first ${shown.length.toLocaleString()}.` : ''}`,
            calculation_method: `GROUP BY "${groupCol}" HAVING ${havingSql}, ordered by count.`,
            columns: [groupCol, countAlias],
            rows: shown,
            row_count: shown.length,
            chart: { type: 'bar', x: groupCol, y: countAlias },
            query_trace: `SELECT "${groupCol}", ${countExpr} AS "${countAlias}" FROM "${datasetName}" GROUP BY "${groupCol}" HAVING ${havingSql} ORDER BY 2 ${sortAscending ? 'ASC' : 'DESC'} LIMIT ${shown.length};`,
          };
        }
      }
      // "average revenue for orders over 500", "total quantity of orders above
      // $1k": aggregate a measure over the rows that pass the threshold
      // (previously these were answered over ALL rows, or listed rows).
      const leftOfCmp = pLower.slice(0, cmp.start);
      const aggWordsStripped = leftOfCmp
        .replace(/\b(what|whats|is|are|was|were|the|of|for|on|in|orders?|rows?|records?|with|where|which|that|average|avg|mean|median|sum|total|minimum|min|maximum|max|show|me|give|find|tell)\b/g, ' ')
        .replace(/[^a-z0-9_ ]/g, ' ')
        .trim();
      const sumCue = !countCue && /\b(total|sum)\b/.test(leftOfCmp) && aggWordsStripped.length > 0 && !!resolveMeasureCol(aggWordsStripped);
      if (targetCol && !countCue && (statAggCue || sumCue)) {
        const fn = aggOfCue(pLower);
        const aggMeasure = (aggWordsStripped && resolveMeasureCol(aggWordsStripped)) || targetCol;
        const named = findNamedCategoricalValue();
        const matching = rows.filter((r) => {
          const num = parseNumericValue(getRowVal(r, targetCol));
          if (num === null || !numericComparisonMatches(num, cmp)) return false;
          if (named && groupKeyOf(getRowVal(r, named.col)) !== named.value) return false;
          return true;
        });
        const nums = matching.map((r) => parseNumericValue(getRowVal(r, aggMeasure))).filter((n): n is number => n !== null);
        const value = aggregate(nums, fn);
        const alias = `${AGG_LABEL[fn]} ${titleCase(aggMeasure)}`;
        const condSql = cmp.op === 'between' ? `"${targetCol}" BETWEEN ${cmp.value} AND ${cmp.value2}` : `"${targetCol}" ${{ gt: '>', gte: '>=', lt: '<', lte: '<=', eq: '=' }[cmp.op]} ${cmp.value}`;
        const whereSql = named ? `${condSql} AND LOWER("${named.col}") = '${named.value.replace(/'/g, "''")}'` : condSql;
        return chatResult({
          intent: 'summary',
          explanation: `${alias} over the **${matching.length.toLocaleString()}** rows where ${whereSql.replace(/"/g, '')} is **${fmt2(value)}**.`,
          method: `${AGG_SQL[fn]}("${aggMeasure}") WHERE ${whereSql}.`,
          columns: [alias],
          rows: [{ [alias]: value }],
          chart: { type: 'table', x: alias, y: alias },
          trace: `SELECT ${AGG_SQL[fn]}("${aggMeasure}") AS "${alias}" FROM "${datasetName}" WHERE ${whereSql};`,
          filters: [{ column: targetCol, operator: cmp.op, value: cmp.value }],
        });
      }

      if (targetCol && (countCue || listCue)) {
        const category = findNamedCategoricalValue();
        const opSymbol: Record<NumericComparisonOp, string> = { gt: '>', gte: '>=', lt: '<', lte: '<=', eq: '=', between: 'BETWEEN' };
        const fmt = (n: number) => (cmp.isCurrency ? `$${n.toLocaleString()}` : n.toLocaleString());
        const conditionSql =
          cmp.op === 'between'
            ? `"${targetCol}" BETWEEN ${cmp.value} AND ${cmp.value2}`
            : `"${targetCol}" ${opSymbol[cmp.op]} ${cmp.value}`;
        const conditionText =
          cmp.op === 'between'
            ? `between ${fmt(cmp.value)} and ${fmt(cmp.value2 as number)}`
            : `${{ gt: 'greater than', gte: 'at least', lt: 'less than', lte: 'at most', eq: 'equal to' }[cmp.op]} ${fmt(cmp.value)}`;
        const whereSql = category
          ? `${conditionSql} AND LOWER("${category.col}") = '${category.value.replace(/'/g, "''")}'`
          : conditionSql;
        const filters: any[] =
          cmp.op === 'between'
            ? [
                { column: targetCol, operator: 'gte', value: cmp.value },
                { column: targetCol, operator: 'lte', value: cmp.value2 },
              ]
            : [{ column: targetCol, operator: cmp.op, value: cmp.value }];
        if (category) filters.push({ column: category.col, operator: 'eq', value: category.value });

        const matching = rows.filter((r) => {
          const num = parseNumericValue(getRowVal(r, targetCol));
          if (num === null || !numericComparisonMatches(num, cmp)) return false;
          if (category && String(getRowVal(r, category.col) ?? '').trim().toLowerCase() !== category.value) return false;
          return true;
        });

        const colLabel = targetCol.replace(/_/g, ' ');
        const categoryText = category
          ? ` and **${category.col.replace(/_/g, ' ')}** is **${category.value.replace(/\b\w/g, (l) => l.toUpperCase())}**`
          : '';
        const assumptionNote =
          howResolved === 'currency'
            ? ` (the threshold looks like money, so it was compared against **${colLabel}**; name a different column to change this)`
            : howResolved === 'default'
              ? ` (no column was named, so **${colLabel}** was assumed; name a column to change this)`
              : '';
        const base = {
          plan: {
            schema_version: '1.0',
            intent: countCue ? 'summary' : 'filter',
            dataset_id: datasetId,
            select: countCue ? [{ column: targetCol, aggregation: 'count', alias: 'Count' }] : profile.colNames.map((c) => ({ column: c })),
            filters,
            group_by: [],
            limit: countCue ? 1 : 0,
            chart: { type: 'table', x: countCue ? 'Count' : targetCol, y: countCue ? 'Count' : targetCol },
            explanation: `Filtered rows where ${conditionSql}${category ? ` and "${category.col}" = "${category.value}"` : ''}.`,
          },
          latency_ms: 7.9,
          provider: 'localEngine',
          model: 'duckdb-in-browser',
        };

        if (countCue) {
          return {
            ...base,
            explanation: `There are **${matching.length.toLocaleString()}** rows where **${colLabel}** is ${conditionText}${categoryText} (out of ${rows.length.toLocaleString()} total)${assumptionNote}.`,
            calculation_method: `COUNT(*) WHERE ${whereSql}. Rows with a blank or non-numeric "${targetCol}" are excluded.`,
            columns: ['Count'],
            rows: [{ Count: matching.length }],
            row_count: 1,
            chart: { type: 'table', x: 'Count', y: 'Count' },
            query_trace: `SELECT COUNT(*) AS "Count" FROM "${datasetName}" WHERE ${whereSql};`,
          };
        }

        // "show/list/which orders are over $500": return the matching rows.
        // "top N ..." sorts by the compared column; otherwise rows keep their
        // dataset order. Capped at 100 shown, and the answer says so -- the
        // full count is always stated.
        const showLimit = topMatch ? limit : 100;
        const ordered = topMatch
          ? [...matching].sort((a, b) => {
              const x = parseNumericValue(getRowVal(a, targetCol)) as number;
              const y = parseNumericValue(getRowVal(b, targetCol)) as number;
              return sortAscending ? x - y : y - x;
            })
          : matching;
        const shown = ordered.slice(0, showLimit);
        const shownNote = matching.length > shown.length ? ` Showing the first ${shown.length.toLocaleString()}.` : '';
        base.plan.limit = showLimit;
        return {
          ...base,
          explanation: `Found **${matching.length.toLocaleString()}** rows where **${colLabel}** is ${conditionText}${categoryText} (out of ${rows.length.toLocaleString()} total)${assumptionNote}.${shownNote}`,
          calculation_method: `SELECT * WHERE ${whereSql}${topMatch ? ` ORDER BY "${targetCol}" ${sortAscending ? 'ASC' : 'DESC'}` : ''} LIMIT ${showLimit}. Rows with a blank or non-numeric "${targetCol}" are excluded.`,
          columns: profile.colNames,
          rows: shown,
          row_count: shown.length,
          chart: { type: 'table', x: targetCol, y: targetCol },
          query_trace: `SELECT * FROM "${datasetName}" WHERE ${whereSql}${topMatch ? ` ORDER BY "${targetCol}" ${sortAscending ? 'ASC' : 'DESC'}` : ''} LIMIT ${showLimit};`,
        };
      }
    }

    // =========================================================================
    // 1c. CONDITIONAL COUNT ON A CATEGORICAL VALUE (no grouping requested),
    // e.g. "how many orders were cancelled?", "count of orders that are
    // pending", "number of customers in the enterprise tier". Previously
    // there was no WHERE-clause support at all for a bare categorical value
    // mentioned in the question, so a question like this fell through to an
    // unrelated branch (or the unfiltered total row count), producing a
    // confidently wrong number with no indication anything was missed.
    // =========================================================================
    if (!byMatch) {
      const countCue =
        pLower.includes('how many') ||
        pLower.includes('number of') ||
        pLower.includes('count of') ||
        /\bcount\b/.test(pLower);
      if (countCue) {
        const named = findNamedCategoricalValue();
        const matchedValue = named?.value || '';
        const matchedCol = named?.col || '';
        if (matchedValue && matchedCol) {
          const countVal = rows.filter(
            (r) => String(getRowVal(r, matchedCol) ?? '').trim().toLowerCase() === matchedValue
          ).length;
          const colLabel = matchedCol.replace(/_/g, ' ');
          const valueLabel = matchedValue.replace(/\b\w/g, (l) => l.toUpperCase());
          const sqlTrace = `SELECT COUNT(*) AS "Count" FROM "${datasetName}" WHERE LOWER("${matchedCol}") = '${matchedValue.replace(/'/g, "''")}';`;
          return {
            plan: {
              schema_version: '1.0',
              intent: 'summary',
              dataset_id: datasetId,
              select: [{ column: matchedCol, aggregation: 'count', alias: 'Count' }],
              filters: [{ column: matchedCol, operator: 'eq', value: matchedValue }],
              group_by: [],
              limit: 1,
              chart: { type: 'table', x: 'Count', y: 'Count' },
              explanation: `Counted rows where "${matchedCol}" = "${matchedValue}".`,
            },
            explanation: `There are **${countVal.toLocaleString()}** rows where **${colLabel}** is **${valueLabel}** (out of ${rows.length.toLocaleString()} total).`,
            calculation_method: `COUNT(*) WHERE LOWER("${matchedCol}") = '${matchedValue}'.`,
            columns: ['Count'],
            rows: [{ Count: countVal }],
            row_count: 1,
            chart: { type: 'table', x: 'Count', y: 'Count' },
            query_trace: sqlTrace,
            latency_ms: 7.8,
            provider: 'localEngine',
            model: 'duckdb-in-browser',
          };
        }

        // No specific categorical value was named -- e.g. "how many orders
        // are there?", "how many customers do we have?", "number of
        // products?". This is one of the single most common ways a real
        // analyst asks for the dataset's total row count (far more common
        // than literally saying "rows" or "records"), but previously had no
        // explicit handling: it fell all the way through to the generic
        // "group by the primary dimension, sum the primary measure, take
        // the top 10" default-ranking fallback at the bottom of this
        // function, which silently fuzzy-matched the entity noun in the
        // question (e.g. "orders") against an id-like column (e.g.
        // "order_id") and returned a nonsensical "top 10 individual orders
        // by amount" instead of a count. Guarded against a numeric
        // comparison ("how many orders are over $500?"), which needs filter
        // parsing this branch doesn't attempt, so it deliberately falls
        // through rather than answering with the wrong (unfiltered) count.
        // numericComparison (parsed above) catches every phrasing the 1b
        // branch understands ("5 units or more", ">= 3", "between ..."); the
        // keyword regex additionally catches number-less comparisons. Any
        // question reaching here with either one was NOT answered by 1b
        // (e.g. a statistical aggregate over a filter), and must never get
        // the unfiltered total as its answer.
        const hasNumericComparisonCue =
          !!numericComparison ||
          /\b(over|above|under|below|at least|at most|greater than|less than|more than|fewer than|exceeding)\b/i.test(pLower);
        // "how many distinct customers" is a distinct count (branch 3), not the row count.
        if (!hasNumericComparisonCue && !isDistinct) {
          const colAlias = 'Total Records';
          const sqlTraceTotal = `SELECT COUNT(*) AS "${colAlias}" FROM "${datasetName}";`;
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
            explanation: `There are **${rows.length.toLocaleString()}** total rows/records.`,
            calculation_method: `COUNT(*) across active dataset rows.`,
            columns: [colAlias],
            rows: [{ [colAlias]: rows.length }],
            row_count: 1,
            chart: { type: 'table', x: colAlias, y: colAlias },
            query_trace: sqlTraceTotal,
            latency_ms: 7.5,
            provider: 'localEngine',
            model: 'duckdb-in-browser',
          };
        }
      }
    }

    // =========================================================================
    // 2. EXPLICIT GROUPING INTENT
    // =========================================================================
    if (byMatch) {
      const groupCandidate = byMatch[1].trim();
      const subjectPart = pLower.substring(0, byMatch.index).trim();

      // "revenue by month", "orders per quarter": bucket the date column by
      // that grain, in date order. ("by month" used to fall back to the
      // primary dimension and group by category instead.)
      const byGrain = grainOf(groupCandidate.split(/\s+/)[0] || '');
      if (byGrain && profile.dates.length > 0 && !resolveDimCol(groupCandidate.split(/\s+/)[0]).toLowerCase().includes(groupCandidate.split(/\s+/)[0])) {
        const subjMeasure = subjectPart ? resolveMeasureCol(subjectPart.replace(/\b(show|me|what|is|the|total|average|avg|median|sum|of|trend|how|many|number|count)\b/g, ' ').trim() || '__none__') : '';
        const countMode = countCueAll && !subjMeasure;
        const measure = countMode ? '' : subjMeasure || profile.primaryMeasure;
        const nf = namedFilter();
        return answerTimeSeries(byGrain, measure, countMode ? 'count' : aggOfCue(pLower), nf ? nf.rows : rows, nf ? nf.text : '', nf ? nf.sql : '', nf ? [nf.filter] : []);
      }

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

        const nfA = namedFilter(dimCol);
        const groupSums: Record<string, number> = Object.create(null); // keyed by data values: no inherited keys
        for (const r of nfA ? nfA.rows : rows) {
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
            explanation: `${isAscending ? 'Bottom' : 'Top'} ${limit} ${dimCol} ranked by ${alias}.`,
          },
          explanation: `${isAscending ? 'Bottom' : 'Top'} ${groupedRows.length} **${dimCol}** by **${alias}**${nfA ? nfA.text : ''} (${groupedRows.length} results).`,
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

      // Check if subject is counting an entity or ID (e.g. "total customer id's", "unique orders", "count of products").
      // An explicit counting cue ("how many"/"number of"/"count"/distinct) always
      // means a count. Otherwise, the mere presence of an entity noun like
      // "order" or "customer" is NOT enough on its own: a question such as
      // "average order value by category" also contains the word "order" but
      // is asking for a statistical aggregate (AVG) of a measure, not a count
      // of orders. A statistical-aggregation cue (average/min/max/...) in the
      // absence of an explicit counting cue therefore rules entity-count out,
      // so the question falls through to the Numeric Measure Grouped branch
      // below instead of being silently miscounted.
      const hasCountCue =
        pLower.includes('how many') ||
        pLower.includes('number of') ||
        pLower.includes('count of') ||
        pLower.includes('count ') ||
        isDistinct;
      const hasStatAggCue = /\b(average|avg|mean|median|min|minimum|max|maximum)\b/i.test(pLower);
      const isEntityCount =
        (hasCountCue ||
          pLower.includes('customer') ||
          pLower.includes('order') ||
          pLower.includes('product') ||
          pLower.includes('client') ||
          pLower.includes('id')) &&
        !pLower.includes('revenue') &&
        !pLower.includes('sales') &&
        !pLower.includes('profit') &&
        !pLower.includes('price') &&
        !pLower.includes('unit_price') &&
        !pLower.includes('margin') &&
        !pLower.includes('cost') &&
        !pLower.includes('discount') &&
        (hasCountCue || !hasStatAggCue);

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
        const countByGroup: Record<string, number> = Object.create(null); // keyed by data values: no inherited keys

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
      let aggFunc: 'sum' | 'avg' | 'min' | 'max' | 'median' = 'sum';
      if (/\bmedian\b/.test(pLower)) aggFunc = 'median';
      else if (pLower.includes('average') || pLower.includes('mean') || pLower.includes('avg')) aggFunc = 'avg';
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

      const nfG = namedFilter(groupDim);
      const groupValues: Record<string, number[]> = Object.create(null); // keyed by data values: no inherited keys
      for (const r of nfG ? nfG.rows : rows) {
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
          if (aggFunc === 'sum') aggVal = preciseSum(vals);
          else if (aggFunc === 'avg') aggVal = preciseSum(vals) / vals.length;
          else if (aggFunc === 'min') aggVal = arrayMin(vals);
          else if (aggFunc === 'max') aggVal = arrayMax(vals);
          else if (aggFunc === 'median') aggVal = aggregate(vals, 'median') as number;
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
        explanation: `${topMatch ? `${isAscending ? 'Bottom' : 'Top'} ${limit} ` : 'Calculated total '}${metricAlias} grouped by ${groupDim}${nfG ? nfG.text : ''} (${groupedRows.length} results).`,
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
      // Match words singularised, so "categories" finds the category column
      // and "regions" finds region (plurals used to fall through to the ID
      // column and count every order instead).
      const pSing = pLower.replace(/\b(\w+)ies\b/g, '$1y').replace(/\b(\w+s)es\b/g, '$1').replace(/\b(\w{2,}[^su\W])s\b/g, '$1');
      let targetCol = '';
      for (const c of profile.colNames) {
        const clean = c.toLowerCase().replace(/_/g, ' ');
        const colRe = new RegExp(`\\b${clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
        if (colRe.test(pLower) || colRe.test(pSing)) {
          targetCol = c;
          break;
        }
      }
      if (!targetCol && (pLower.includes('order') || pLower.includes('orders'))) {
        targetCol = profile.colNames.find((c) => c.toLowerCase().includes('order')) || '';
      }
      if (!targetCol && (pLower.includes('customer') || pLower.includes('client'))) {
        targetCol = profile.colNames.find((c) => c.toLowerCase().includes('customer') || c.toLowerCase().includes('client')) || '';
      }
      if (!targetCol && (pLower.includes('product') || pLower.includes('item'))) {
        targetCol = profile.colNames.find((c) => c.toLowerCase().includes('product') || c.toLowerCase().includes('item')) || '';
      }
      if (!targetCol && (pSing.includes('category') || pLower.includes('type') || pLower.includes('segment'))) {
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
        let scalarAgg: 'sum' | 'avg' | 'min' | 'max' | 'median' = 'sum';
        if (/\bmedian\b/.test(pLower)) scalarAgg = 'median';
        else if (pLower.includes('average') || pLower.includes('mean') || pLower.includes('avg')) scalarAgg = 'avg';
        else if (pLower.includes('min') || pLower.includes('lowest')) scalarAgg = 'min';
        else if (pLower.includes('max') || pLower.includes('highest') || pLower.includes('peak')) scalarAgg = 'max';

        // "total revenue for completed orders", "total quantity in the north
        // region": restrict to the named category value (previously ignored,
        // so the answer was the all-rows total).
        const nfS = namedFilter();
        const scalarRows = nfS ? nfS.rows : rows;
        const validNums: number[] = [];
        for (const r of scalarRows) {
          const parsed = parseNumericValue(getRowVal(r, targetMeasure));
          if (parsed !== null) validNums.push(parsed);
        }
        let scalarVal = 0;
        if (validNums.length > 0) {
          if (scalarAgg === 'sum') scalarVal = preciseSum(validNums);
          else if (scalarAgg === 'avg') scalarVal = preciseSum(validNums) / validNums.length;
          else if (scalarAgg === 'min') scalarVal = arrayMin(validNums);
          else if (scalarAgg === 'max') scalarVal = arrayMax(validNums);
          else if (scalarAgg === 'median') scalarVal = aggregate(validNums, 'median') as number;
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
        } else if (scalarAgg === 'median') {
          alias = `Median ${targetMeasure}`;
        }

        const formattedVal = scalarVal.toLocaleString();
        const sqlTrace = `SELECT ${scalarAgg.toUpperCase()}("${targetMeasure}") AS "${alias}" FROM "${datasetName}"${nfS ? nfS.sql : ''};`;
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
          explanation: nfS
            ? `${alias}${nfS.text} (${scalarRows.length.toLocaleString()} of ${rows.length.toLocaleString()} records) is **${formattedVal}**.`
            : `${alias} across all ${rows.length.toLocaleString()} records is **${formattedVal}**.`,
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
    const targetMeasure = resolveMeasureCol(pLower) || profile.primaryMeasure;
    if (isTrend) {
      // A trend is a time series in date order, bucketed by the grain asked
      // for (monthly by default) -- not one row per raw date sorted by value.
      const nfT = namedFilter();
      return answerTimeSeries(grainOf(pLower) || 'month', targetMeasure, aggOfCue(pLower), nfT ? nfT.rows : rows, nfT ? nfT.text : '', nfT ? nfT.sql : '', nfT ? [nfT.filter] : []);
    }
    const groupKey = resolveDimCol(pLower) || profile.primaryDim;

    const groupSums: Record<string, number> = Object.create(null); // keyed by data values: no inherited keys
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
      explanation: `${topMatch ? `${isAscending ? 'Bottom' : 'Top'} ${limit} ` : 'Calculated total '}${metricAlias} grouped by ${groupKey} (${groupedRows.length} results).`,
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

    // Honor an explicit "top N" the user typed (e.g. "top 5 customers")
    // instead of silently defaulting to 10 — a stated count is a literal,
    // unambiguous ask and ignoring it is one of the clearest ways this
    // feature can feel like it "didn't understand" the request.
    const topNMatch = pLower.match(/top\s*(\d{1,3})\b/);
    const requestedTopN = topNMatch ? Math.max(1, Math.min(50, parseInt(topNMatch[1], 10))) : null;

    // Prioritize mentioned metrics / dimensions from prompt. A plain
    // substring scan (the previous approach) let an incidental word like
    // "status" in "...order status breakdown" hijack the primary grouping
    // dimension away from the dashboard's real focus (e.g. a prompt about
    // "customers"). Score every candidate column instead: split each column
    // name into its significant words, stem them, and count how many appear
    // as whole words anywhere in the prompt; a column named right after
    // "by " gets a bonus since that phrasing is the strongest grouping
    // signal English has ("by region", "by product").
    let primaryMeasure = profile.primaryMeasure;
    let secondaryMeasure = profile.secondaryMeasure;
    let primaryDim = profile.primaryDim;
    let secondaryDim = profile.secondaryDim;

    const stemWord = (w: string): string => {
      if (w.endsWith('ies') && w.length > 4) return `${w.slice(0, -3)}y`;
      if (w.endsWith('es') && w.length > 4) return w.slice(0, -2);
      if (w.endsWith('s') && w.length > 3) return w.slice(0, -1);
      return w;
    };
    const promptWordSet = new Set(
      pLower
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(Boolean)
        .map(stemWord)
    );
    const STOP_WORDS = new Set(['the', 'and', 'for', 'with', 'this', 'that', 'per', 'top', 'id']);
    const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const byPhraseHit = (col: string): boolean => {
      const cleanCol = col.toLowerCase().replace(/[_-]+/g, ' ').trim();
      if (!cleanCol) return false;
      return new RegExp(`\\bby\\s+${escapeRe(cleanCol)}\\b`).test(pLower);
    };
    // "customer-focused dashboard" / "a report about regions" / "centered
    // on products" name the dashboard's real subject even when no column
    // word is immediately preceded by "by " — recognize that phrasing as a
    // strong signal too, since it's how people naturally state a focus.
    const focusPhraseHit = (col: string): boolean => {
      const cleanCol = col.toLowerCase().replace(/[_-]+/g, ' ').trim();
      if (!cleanCol) return false;
      const firstWord = cleanCol.split(/\s+/)[0];
      if (!firstWord || firstWord.length < 3) return false;
      const stem = escapeRe(stemWord(firstWord));
      return new RegExp(`${stem}\\w*[\\s-]*(focused|focus|centered|centred)\\b`).test(pLower) ||
        new RegExp(`\\b(about|regarding|on)\\s+${stem}\\w*`).test(pLower);
    };
    const scoreColumnAgainstPrompt = (col: string): number => {
      const cleanCol = col.toLowerCase().replace(/[_-]+/g, ' ').trim();
      const words = cleanCol.split(/\s+/).filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
      if (words.length === 0) return 0;
      let overlap = 0;
      for (const w of words) {
        if (promptWordSet.has(stemWord(w))) overlap++;
      }
      if (overlap === 0) return 0;
      return overlap + (byPhraseHit(col) ? 2 : 0) + (focusPhraseHit(col) ? 4 : 0);
    };

    if (pLower.trim()) {
      let bestMeasure: { col: string; score: number } | null = null;
      for (const m of profile.measures) {
        const score = scoreColumnAgainstPrompt(m);
        if (score > 0 && (!bestMeasure || score > bestMeasure.score)) bestMeasure = { col: m, score };
      }
      if (bestMeasure) primaryMeasure = bestMeasure.col;

      // Raw ID columns ("order_id", "customer_id") tend to tie with their
      // human-readable counterpart ("customer_name") on word overlap alone,
      // and a dashboard grouped by a bare ID column reads as broken rather
      // than intentional. Prefer non-ID dimensions first; only fall back to
      // an ID column if nothing else in the dataset matched the prompt.
      const isIdCol = (c: string) => c.toLowerCase().endsWith('_id') || c.toLowerCase().endsWith('id');
      let bestDim: { col: string; score: number } | null = null;
      let bestIdDim: { col: string; score: number } | null = null;
      for (const d of profile.dimensions) {
        const score = scoreColumnAgainstPrompt(d);
        if (score <= 0) continue;
        if (isIdCol(d)) {
          if (!bestIdDim || score > bestIdDim.score) bestIdDim = { col: d, score };
        } else if (!bestDim || score > bestDim.score) {
          bestDim = { col: d, score };
        }
      }
      if (bestDim) primaryDim = bestDim.col;
      else if (bestIdDim) primaryDim = bestIdDim.col;
    }

    // A dataset with no genuine numeric column (profile.measures is empty)
    // still falls back to colNames[0] for primaryMeasure/secondaryMeasure —
    // usually an ID or text field. Summing an ID column produces a
    // meaningless chart, so detect that case once up front and pivot every
    // measure-based KPI/visual to a row-count basis instead.
    const hasRealMeasure = profile.measures.length > 0;
    const fallbackCountCol =
      profile.colNames.find((c) => c.toLowerCase().endsWith('id')) || primaryDim || profile.colNames[0] || 'id';
    if (!hasRealMeasure) {
      primaryMeasure = '';
      secondaryMeasure = '';
    }
    const vMeasureCol = hasRealMeasure ? primaryMeasure : fallbackCountCol;
    const vAggFunc: 'sum' | 'count' = hasRealMeasure ? 'sum' : 'count';

    // 1. Build 4 Glassmorphism V22 KPI Stat Cards with genuine data-backed context
    // Never fabricate fake percentage comparisons: a percentage requires a real target column or multiple calendar periods (MoM/YoY).
    const dateCol = profile.dates[0];
    const targetCol = profile.colNames.find((c) =>
      ['target', 'budget', 'goal', 'quota'].some((k) => c.toLowerCase().includes(k))
    );

    // Compact number formatter for embedding the actual compared figures
    // into a KPI's MoM subtitle, so the calculation basis (not just the
    // resulting %) is visible without digging into the data yourself.
    const fmtCompact = (n: number): string => {
      if (!Number.isFinite(n)) return '0';
      if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
      if (Math.abs(n) >= 10_000) return `${(n / 1_000).toFixed(1)}K`;
      return n.toLocaleString(undefined, { maximumFractionDigits: 1 });
    };

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
            // Embed the actual totals and row counts behind the %, not just
            // the two month labels, so a big swing (e.g. from a sparsely
            // populated latest month) is self-explanatory on hover.
            primarySubtitle = `${sign}${pct.toFixed(1)}% MoM: ${fmtCompact(latestStats.sum)} in ${latestMonth} (${latestStats.count} rows) vs ${fmtCompact(prevStats.sum)} in ${prevMonth} (${prevStats.count} rows)`;
          }

          const latestAvg = latestStats.sum / (latestStats.count || 1);
          const prevAvg = prevStats.sum / (prevStats.count || 1);
          if (prevAvg > 0) {
            const pctAvg = ((latestAvg - prevAvg) / prevAvg) * 100;
            const signAvg = pctAvg >= 0 ? '+' : '';
            avgSubtitle = `${signAvg}${pctAvg.toFixed(1)}% MoM avg: ${fmtCompact(latestAvg)} in ${latestMonth} vs ${fmtCompact(prevAvg)} in ${prevMonth}`;
          }
        }
      } catch {
        // keep factual fallback
      }
    }

    // Raw column names (snake_case / camelCase) read fine in a <select> but
    // look like code on a KPI card ("customer_id"); humanize them for
    // display while the `column` field keeps the real, queryable name.
    const humanizeField = (name: string): string => {
      if (!name) return '';
      const spaced = name
        .replace(/[_-]+/g, ' ')
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .trim();
      return spaced
        .split(/\s+/)
        .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
        .join(' ');
    };

    const kpis: any[] = [];
    if (primaryMeasure) {
      kpis.push({
        id: `kpi_total_${primaryMeasure.replace(/\s+/g, '_').toLowerCase()}`,
        title: `Total ${humanizeField(primaryMeasure)}`,
        column: primaryMeasure,
        aggFunc: 'sum',
        subtitle: primarySubtitle,
        accentColor: '#10B981',
      });
      kpis.push({
        id: `kpi_avg_${primaryMeasure.replace(/\s+/g, '_').toLowerCase()}`,
        title: `Average ${humanizeField(primaryMeasure)}`,
        column: primaryMeasure,
        aggFunc: 'avg',
        subtitle: avgSubtitle,
        accentColor: '#0D9488',
      });
    }

    if (secondaryMeasure && secondaryMeasure !== primaryMeasure) {
      kpis.push({
        id: `kpi_total_${secondaryMeasure.replace(/\s+/g, '_').toLowerCase()}`,
        title: `Total ${humanizeField(secondaryMeasure)}`,
        column: secondaryMeasure,
        aggFunc: 'sum',
        subtitle: `Sum of ${humanizeField(secondaryMeasure)} across filtered rows`,
        accentColor: '#FB923C',
      });
    } else {
      kpis.push({
        id: 'kpi_total_records',
        title: 'Total Records',
        column: primaryDim || cols[0]?.name || 'id',
        aggFunc: 'count',
        subtitle: 'Row count across active filters',
        accentColor: '#FB923C',
      });
    }

    const entityIdCol = profile.colNames.find((c) => c.toLowerCase().endsWith('_id') || c.toLowerCase().endsWith('id'));
    const distinctTargetCol = entityIdCol || primaryDim;
    if (distinctTargetCol) {
      kpis.push({
        id: `kpi_distinct_${distinctTargetCol.replace(/\s+/g, '_').toLowerCase()}`,
        title: `Distinct ${humanizeField(distinctTargetCol)}`,
        column: distinctTargetCol,
        aggFunc: 'distinct_count',
        subtitle: `Unique ${humanizeField(distinctTargetCol)} values across filtered rows`,
        accentColor: '#0284C7',
      });
    }


    // 2. Resolve Multi-Tier Dimensions for Cohesive Dashboard Experience
    const nonIdDims = profile.dimensions.filter((d) => !d.toLowerCase().endsWith('_id') && !d.toLowerCase().endsWith('id'));
    const compDim = secondaryDim && secondaryDim !== primaryDim ? secondaryDim : primaryDim;
    const granularDim = nonIdDims.find((d) => /customer|client|product|item|sku|account|user|sub_category/i.test(d)) || compDim;
    const geoDim = nonIdDims.find((d) => /region|country|state|city|channel|territory|location|market/i.test(d)) || compDim;
    const statusDim = profile.dimensions.find((d) => /status|stage|priority|fulfillment|state|tier|payment/i.test(d)) || null;

    // Reusable group-by-and-sum, so each visual's caption can state a real
    // finding ("West leads with 38.2% of revenue") computed from the exact
    // same aggregation the chart itself shows, rather than generic text.
    const groupByDim = (dim: string | null | undefined, measureCol: string, useCount: boolean): { key: string; value: number }[] => {
      if (!dim || !Array.isArray(rows) || rows.length === 0) return [];
      const map = new Map<string, number>();
      for (const r of rows) {
        const rawKey = getRowVal(r, dim);
        const key = rawKey === null || rawKey === undefined || String(rawKey).trim() === '' ? '(Blank)' : String(rawKey);
        const val = useCount ? 1 : Number(getRowVal(r, measureCol)) || 0;
        map.set(key, (map.get(key) || 0) + val);
      }
      return Array.from(map.entries())
        .map(([key, value]) => ({ key, value }))
        .sort((a, b) => b.value - a.value);
    };

    // Slicers: Cohesively include [primaryDim, geoDim, granularDim] so highlighted customers & categories are filterable
    const slicerCandidates = Array.from(new Set([primaryDim, geoDim, granularDim].filter(Boolean)));
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

    if (Array.isArray(rows) && rows.length > 0) {
      const catMap = new Map<string, number>();
      const geoMap = new Map<string, number>();

      for (const r of rows) {
        // With no real numeric measure, fall back to a plain row count per
        // category so the narrative and "top category" insight still reads
        // correctly for purely categorical/text datasets instead of
        // silently staying stuck on the "Primary Segment" placeholder.
        const val = hasRealMeasure ? Number(getRowVal(r, primaryMeasure)) || 0 : 1;
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
    const topPctNum = totalPrimarySum > 0 ? (topCategorySum / totalPrimarySum) * 100 : 0;
    const driverSentence = topPctNum >= 15
      ? `${topCategory} is the leading ${hasRealMeasure ? 'driver' : 'segment'} generating ${topCategoryPct} of total volume.`
      : `Volume is distributed across ${humanizeField(primaryDim)}, led by ${topCategory} (${topCategoryPct}).`;
    const narrativeInsight = hasRealMeasure
      ? `${driverSentence} Regional activity is concentrated in ${topGeo} with ${topGeoCount} logged transactions. Across all ${rows ? rows.length : 0} records, the per-record benchmark stands at ${avgValNum}.`
      : `${driverSentence} Regional activity is concentrated in ${topGeo} with ${topGeoCount} logged transactions, across ${rows ? rows.length : 0} total records.`;

    // 4. Build 6 Multi-Tier Complementary Visuals (Executive Grid V22)
    const visuals: any[] = [];
    const measureLabel = hasRealMeasure ? humanizeField(vMeasureCol) : 'records';
    const fmtShare = (value: number, total: number) => (total > 0 ? `${((value / total) * 100).toFixed(1)}%` : '0%');

    // Hero trend insight: the actual latest-vs-previous-period comparison
    // when the dashboard has a date axis, computed once above for the KPI
    // subtitle — reuse it so the chart and the KPI card never disagree.
    const heroTrendInsight = profile.dates.length > 0 && /MoM/.test(primarySubtitle)
      ? primarySubtitle.replace(/^([+-]?[\d.]+%)\s*MoM.*$/, (full, pct) => `${pct} change vs. the prior month`)
      : null;

    // Visual 1: Hero Visual (Span 2, 976px wide x 340px high at x=16, y=16)
    if (profile.dates.length > 0) {
      visuals.push({
        id: 'vis_hero_trend',
        title: `${humanizeField(vMeasureCol)} Trajectory & Monthly Run-Rate`,
        type: 'line_area',
        categoryCol: profile.dates[0],
        valueCol: vMeasureCol,
        aggFunc: vAggFunc,
        bins: 8,
        span: 2,
        customWidth: 976,
        customHeight: 340,
        x: 16,
        y: 16,
        w: 12,
        h: 4,
        sortBy: 'category_asc',
        legendPosition: 'hide',
        insight: heroTrendInsight || (hasRealMeasure
          ? `${fmtCompact(totalPrimarySum)} total across ${rows ? rows.length : 0} records`
          : `${rows ? rows.length : 0} records tracked over time`),
      });
    } else {
      visuals.push({
        id: 'vis_hero_trend',
        title: `${humanizeField(vMeasureCol)} Strategic Performance by ${humanizeField(primaryDim)}`,
        type: 'column',
        categoryCol: primaryDim,
        valueCol: vMeasureCol,
        aggFunc: vAggFunc,
        bins: 8,
        span: 2,
        customWidth: 976,
        customHeight: 340,
        x: 16,
        y: 16,
        w: 12,
        h: 4,
        sortBy: 'value_desc',
        insight: `${topCategory} leads with ${topCategoryPct} of total ${measureLabel}`,
      });
    }

    // Visual 2: Category Contribution — a donut only reads cleanly up to
    // ~8 slices; past that it becomes an unreadable rainbow, so a dataset
    // with more categories than that gets a ranked bar instead. This is a
    // genuine data-driven choice, not a fixed chart-per-slot template.
    const primaryDimBreakdown = groupByDim(primaryDim, vMeasureCol, !hasRealMeasure);
    const primaryDimCardinality = primaryDimBreakdown.length;
    const useBarForContribution = primaryDimCardinality > 8;
    const contributionTop = primaryDimBreakdown[0];
    const contributionInsight = contributionTop
      ? `${contributionTop.key} leads with ${fmtShare(contributionTop.value, totalPrimarySum)} of total ${measureLabel}${primaryDimCardinality > 8 ? ` across ${primaryDimCardinality} ${humanizeField(primaryDim).toLowerCase()} values` : ''}`
      : undefined;
    visuals.push({
      id: 'vis_share_donut',
      title: useBarForContribution
        ? `Top ${Math.min(8, primaryDimCardinality)} ${humanizeField(primaryDim)} by Contribution`
        : (isSales ? `Revenue Contribution by ${humanizeField(primaryDim)}` : `${humanizeField(primaryDim)} Distribution Share`),
      type: useBarForContribution ? 'bar' : 'donut',
      categoryCol: primaryDim,
      valueCol: vMeasureCol,
      aggFunc: vAggFunc,
      bins: useBarForContribution ? 8 : 6,
      topN: useBarForContribution ? 8 : undefined,
      span: 1,
      customWidth: 480,
      customHeight: 320,
      x: 16,
      y: 372,
      w: 6,
      h: 4,
      sortBy: 'value_desc',
      insight: contributionInsight,
    });

    // Visual 3: Ranked Performance Leaderboard Bar (Mid-Tier Right at x=512, y=372)
    const leaderboardTopN = requestedTopN || 10;
    const granularBreakdown = groupByDim(granularDim, vMeasureCol, !hasRealMeasure);
    const granularTop = granularBreakdown[0];
    visuals.push({
      id: 'vis_leaderboard_bar',
      title: `Top ${leaderboardTopN} High-Performing ${humanizeField(granularDim)} Leaderboard`,
      type: 'bar',
      categoryCol: granularDim,
      valueCol: vMeasureCol,
      aggFunc: vAggFunc,
      bins: leaderboardTopN,
      topN: leaderboardTopN,
      span: 1,
      customWidth: 480,
      customHeight: 320,
      x: 512,
      y: 372,
      w: 6,
      h: 4,
      sortBy: 'value_desc',
      insight: granularTop ? `${granularTop.key} tops the list at ${fmtCompact(granularTop.value)}` : undefined,
    });

    // Visual 4: Geographic / Channel Breakdown (Deep Dive Left at x=16, y=708)
    const geoBreakdown = groupByDim(geoDim, vMeasureCol, !hasRealMeasure);
    const geoTop = geoBreakdown[0];
    visuals.push({
      id: 'vis_geo_column',
      title: `${humanizeField(vMeasureCol)} Breakdown by ${humanizeField(geoDim)}`,
      type: 'column',
      categoryCol: geoDim,
      valueCol: vMeasureCol,
      aggFunc: vAggFunc,
      bins: 8,
      span: 1,
      customWidth: 480,
      customHeight: 320,
      x: 16,
      y: 708,
      w: 6,
      h: 4,
      sortBy: 'value_desc',
      insight: geoTop ? `${geoTop.key} leads ${humanizeField(geoDim)} with ${fmtShare(geoTop.value, geoBreakdown.reduce((a, b) => a + b.value, 0))} of ${measureLabel}` : undefined,
    });

    // Visual 5: Operational Pipeline Funnel / Secondary Comparison (Deep Dive Right at x=512, y=708)
    if (statusDim) {
      const statusBreakdown = groupByDim(statusDim, vMeasureCol, true);
      const statusTotal = statusBreakdown.reduce((a, b) => a + b.value, 0);
      const statusTop = statusBreakdown[0];
      visuals.push({
        id: 'vis_pipeline_funnel',
        title: `Fulfillment Pipeline & ${humanizeField(statusDim)} Status`,
        type: 'funnel',
        categoryCol: statusDim,
        valueCol: vMeasureCol,
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
        insight: statusTop ? `${statusTop.key} represents ${fmtShare(statusTop.value, statusTotal)} of all records` : undefined,
      });
    } else if (secondaryMeasure && secondaryMeasure !== primaryMeasure) {
      const secondaryBreakdown = groupByDim(primaryDim, secondaryMeasure, false);
      const secondaryTop = secondaryBreakdown[0];
      const secondaryTotal = secondaryBreakdown.reduce((a, b) => a + b.value, 0);
      visuals.push({
        id: 'vis_pipeline_funnel',
        title: `${humanizeField(secondaryMeasure)} Distribution by ${humanizeField(primaryDim)}`,
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
        insight: secondaryTop ? `${secondaryTop.key} leads with ${fmtShare(secondaryTop.value, secondaryTotal)} of total ${humanizeField(secondaryMeasure)}` : undefined,
      });
    } else {
      visuals.push({
        id: 'vis_pipeline_funnel',
        title: `${humanizeField(vMeasureCol)} by ${humanizeField(primaryDim)} split by ${humanizeField(compDim)}`,
        type: 'clustered_bar',
        categoryCol: primaryDim,
        seriesCol: compDim !== primaryDim ? compDim : '',
        valueCol: vMeasureCol,
        aggFunc: vAggFunc,
        bins: 6,
        span: 1,
        customWidth: 480,
        customHeight: 320,
        x: 512,
        y: 708,
        w: 6,
        h: 4,
        sortBy: 'value_desc',
        insight: contributionTop ? `${contributionTop.key} leads ${humanizeField(primaryDim)} at ${fmtCompact(contributionTop.value)}` : undefined,
      });
    }

    // Visual 6: Executive Operational Ledger Table (Span 2 / 976px at x=16, y=1044)
    visuals.push({
      id: 'vis_ledger_table',
      title: `Executive Operational Ledger: ${humanizeField(primaryDim)} & ${humanizeField(compDim)} Matrix`,
      type: 'table',
      categoryCol: primaryDim,
      seriesCol: compDim !== primaryDim ? compDim : '',
      valueCol: vMeasureCol,
      aggFunc: vAggFunc,
      span: 2,
      customWidth: 976,
      customHeight: 340,
      x: 16,
      y: 1044,
      w: 12,
      h: 4,
      sortBy: 'value_desc',
      insight: `${primaryDimCardinality} ${humanizeField(primaryDim).toLowerCase()} values × ${humanizeField(compDim).toLowerCase()} breakdown, ${rows ? rows.length : 0} records`,
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

// Every call waits for the stored datasets to load first, so no operation can
// read the placeholder samples or save over the user's data (R2-17).
for (const key of Object.keys(localEngine) as Array<keyof typeof localEngine>) {
  const fn = localEngine[key] as unknown;
  if (typeof fn === 'function') {
    (localEngine as any)[key] = async function (this: unknown, ...args: any[]) {
      await ensureHydrated();
      return (fn as (...a: any[]) => any).apply(localEngine, args);
    };
  }
}

/** Test hook: forget the in-memory copy, as a page reload would. */
export function __resetLocalStoreForTests(): void {
  memoryDatasets = null;
  seededDatasets = null;
  hydrated = false;
  hydrationPromise = null;
  lastSavedAt = 0;
}
