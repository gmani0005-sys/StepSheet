/**
 * Dashboard data -- the ONE place a dashboard's numbers are computed.
 *
 * Round 4 QA found the dashboard had its own copies of number parsing,
 * grouping and date bucketing, separate from the engine and from each other:
 * the screen, the export and the generator's insight text could disagree.
 * Specifically:
 *  - numbers were read with a naive strip-and-Number ("12,5" -> 125; "₹1,23,456"
 *    and "1.234,56 €" dropped), unlike every other part of the app;
 *  - "North", " north" and "NORTH" were three bars;
 *  - dates were bucketed in the browser's local time zone (a row dated
 *    1 May landed in April for a user in New York);
 *  - shares were % of the top 10 shown, not of the total;
 *  - MIN/MAX used Math.min(...values), which crashes past ~125K rows;
 *  - the export grouped differently (no date buckets, a different top N).
 *
 * Everything here is pure (rows in, numbers out) so the modal, the export and
 * the tests all call the same code.
 */
import { parseSharedNumber, parseSharedDate, preciseSum, cleanFloat } from './values';

export type DashRow = Record<string, any>;
export type DateInterval = 'month' | 'quarter' | 'year';

export interface DashVisualSpec {
  type?: string;
  categoryCol?: string;
  valueCol?: string;
  seriesCol?: string;
  aggFunc?: string;
  sortBy?: string;
  topN?: number;
  bins?: number;
}

export interface DashItem {
  category: string;
  value: number;
  count: number;
  /** % of the total across ALL categories (not just those shown), 1 decimal. */
  share: number;
  rows: DashRow[];
}

const norm = (s: string) => s.toLowerCase().trim();
const squash = (s: string) => s.toLowerCase().replace(/[\s_-]/g, '');

/** A row's value for a column: exact name, then case/space/underscore-insensitive.
 * Never a substring match -- "id" must not silently read "order_id". */
export function dashGet(row: DashRow | null | undefined, col: string | null | undefined): any {
  if (!row || !col) return undefined;
  if (Object.prototype.hasOwnProperty.call(row, col)) return row[col];
  const n = norm(col);
  const s = squash(col);
  let loose: string | undefined;
  for (const k of Object.keys(row)) {
    if (norm(k) === n) return row[k];
    if (loose === undefined && squash(k) === s) loose = k;
  }
  return loose === undefined ? undefined : row[loose];
}

export const isBlankCell = (v: any) => v === null || v === undefined || String(v).trim() === '';

/** The same number reader as the steps, import and Chat. */
export function dashNumber(v: any): number | null {
  if (v === null || v === undefined || typeof v === 'boolean') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  return parseSharedNumber(String(v), { allowScientific: true });
}

/** A metric, or null when there is nothing to compute (an average of no numbers). */
export function dashMetricOrNull(rows: DashRow[], col: string | undefined, fn: string | undefined): number | null {
  const f = String(fn || 'sum').toLowerCase().trim();
  if (f === 'count') return rows.length; // records
  if (f === 'distinct' || f === 'distinct_count' || f === 'unique') {
    const seen = new Set<string>();
    for (const r of rows) {
      const v = dashGet(r, col);
      if (!isBlankCell(v)) seen.add(norm(String(v)));
    }
    return seen.size;
  }
  const nums: number[] = [];
  for (const r of rows) {
    const n = dashNumber(dashGet(r, col));
    if (n !== null) nums.push(n);
  }
  if (nums.length === 0) return f === 'sum' ? 0 : null;
  if (f === 'min' || f === 'max') {
    // A loop, never Math.min(...nums): spreading 500K values overflows the stack.
    let m = nums[0];
    for (const x of nums) if (f === 'min' ? x < m : x > m) m = x;
    return m;
  }
  const total = preciseSum(nums);
  if (f === 'avg' || f === 'mean' || f === 'average') return cleanFloat(total / nums.length);
  return cleanFloat(total);
}

/** As dashMetricOrNull, with "nothing" drawn as 0 (a bar of zero height). */
export function dashMetric(rows: DashRow[], col: string | undefined, fn: string | undefined): number {
  return dashMetricOrNull(rows, col, fn) ?? 0;
}

export function isDateCategory(col: string | undefined, columns: Array<{ name: string; data_type?: string }> = []): boolean {
  if (!col) return false;
  return (
    /date|time|timestamp|order_date|created_at|updated_at/i.test(col) ||
    columns.some((c) => c.name === col && ['date', 'timestamp'].includes(String(c.data_type || '').toLowerCase()))
  );
}

/** UTC calendar parts of a date cell (time-zone offsets honoured, browser zone ignored). */
export function dashDateParts(v: any): { y: number; m: number } | null {
  if (isBlankCell(v)) return null;
  const d = v instanceof Date ? v : parseSharedDate(v);
  if (!d || Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  if (y < 1990 || y > 2100) return null;
  return { y, m: d.getUTCMonth() + 1 };
}

export function dateIntervalFor(rows: DashRow[], col: string): DateInterval {
  let minY = 9999;
  let maxY = 0;
  const seen = new Set<any>();
  for (const r of rows) {
    const v = dashGet(r, col);
    if (seen.has(v)) continue; // the span only needs each distinct value once
    if (seen.size < 200_000) seen.add(v);
    const p = dashDateParts(v);
    if (!p) continue;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  if (maxY === 0) return 'month';
  const span = maxY - minY;
  return span > 6 ? 'year' : span > 3 ? 'quarter' : 'month';
}

export function periodKey(p: { y: number; m: number }, interval: DateInterval): string {
  if (interval === 'year') return String(p.y);
  if (interval === 'quarter') return `${p.y}-Q${Math.floor((p.m - 1) / 3) + 1}`;
  return `${p.y}-${String(p.m).padStart(2, '0')}`;
}

/** Does a date cell fall in a period label ("2024-03", "2024-Q1", "2024")? */
export function cellInPeriod(cell: any, period: string): boolean {
  const p = dashDateParts(cell);
  if (!p) return false;
  if (/^\d{4}-\d{2}$/.test(period)) return periodKey(p, 'month') === period;
  if (/^\d{4}-Q[1-4]$/.test(period)) return periodKey(p, 'quarter') === period;
  if (/^\d{4}$/.test(period)) return String(p.y) === period;
  return false;
}

/** Category labels that ignore case and surrounding spaces, shown with the first spelling seen. */
export function makeLabeler(): (v: any) => string {
  const first = new Map<string, string>();
  const exact = new Map<string, string>(); // raw text -> label: values repeat, so most rows hit this
  return (v: any) => {
    if (v === null || v === undefined) return '(Blank)';
    const raw = typeof v === 'string' ? v : String(v);
    const hit = exact.get(raw);
    if (hit !== undefined) return hit;
    if (raw.trim() === '') return '(Blank)';
    const s = raw.trim();
    const k = norm(s);
    let label = first.get(k);
    if (label === undefined) first.set(k, (label = s));
    if (exact.size < 200_000) exact.set(raw, label);
    return label;
  };
}

/** Slicer / cross-filter match: same case- and space-insensitive rule as the categories. */
export function sameCategory(cell: any, label: string): boolean {
  if (label === '(Blank)') return isBlankCell(cell);
  return !isBlankCell(cell) && norm(String(cell)) === norm(label);
}

/**
 * The items a category visual shows: grouped, aggregated, sorted and cut to
 * its top N, with each share taken over the total of ALL categories.
 */
export function dashItems(
  rows: DashRow[],
  vis: DashVisualSpec,
  columns: Array<{ name: string; data_type?: string }> = []
): { items: DashItem[]; total: number; hidden: number; isDate: boolean; interval: DateInterval } {
  const col = vis.categoryCol || '';
  const isDate = isDateCategory(col, columns);
  const isTrend = vis.type === 'line_area' || vis.type === 'stacked_area' || isDate;
  const interval = isDate ? dateIntervalFor(rows, col) : 'month';
  const label = makeLabeler();
  const dateKey = new Map<any, string>(); // a date string repeats on many rows: parse it once
  const groups = new Map<string, DashRow[]>();
  for (const r of rows) {
    const raw = dashGet(r, col);
    let key: string;
    if (isBlankCell(raw)) key = '(Blank)';
    else if (isDate) {
      let k = dateKey.get(raw);
      if (k === undefined) {
        const p = dashDateParts(raw);
        k = p ? periodKey(p, interval) : String(raw).trim();
        if (dateKey.size < 200_000) dateKey.set(raw, k);
      }
      key = k;
    } else key = label(raw);
    let g = groups.get(key);
    if (!g) groups.set(key, (g = []));
    g.push(r);
  }
  let all = Array.from(groups.entries()).map(([category, g]) => ({
    category,
    value: dashMetric(g, vis.valueCol, vis.aggFunc),
    count: g.length,
    share: 0,
    rows: g,
  }));
  // "(Blank)" sorts after real categories, so on a tie a real value leads.
  const byCat = (a: DashItem, b: DashItem) =>
    (a.category === '(Blank)' ? 1 : 0) - (b.category === '(Blank)' ? 1 : 0) ||
    a.category.localeCompare(b.category, undefined, { numeric: true });
  if (isTrend && vis.sortBy !== 'value_desc' && vis.sortBy !== 'value_asc') all.sort(byCat);
  else if (vis.sortBy === 'value_desc') all.sort((a, b) => b.value - a.value || byCat(a, b));
  else if (vis.sortBy === 'value_asc') all.sort((a, b) => a.value - b.value || byCat(a, b));
  else all.sort(byCat);
  const total = all.reduce((s, x) => s + Math.max(0, x.value), 0);
  for (const x of all) x.share = total > 0 ? Math.round((Math.max(0, x.value) / total) * 1000) / 10 : 0;
  const limit = isTrend ? Math.max(36, vis.topN || 36) : vis.topN || 10;
  const items = all.slice(0, limit);
  return { items, total, hidden: all.length - items.length, isDate, interval };
}

/** Series for a matrix / multi-series visual: the largest ones by the visual's metric, not the first seen. */
export function dashSeriesKeys(rows: DashRow[], seriesCol: string, vis: DashVisualSpec, max: number): { keys: string[]; hidden: number } {
  const label = makeLabeler();
  const groups = new Map<string, DashRow[]>();
  for (const r of rows) {
    const k = label(dashGet(r, seriesCol));
    let g = groups.get(k);
    if (!g) groups.set(k, (g = []));
    g.push(r);
  }
  const ranked = Array.from(groups.entries())
    .map(([k, g]) => ({ k, v: dashMetric(g, vis.valueCol, vis.aggFunc) }))
    .sort((a, b) => b.v - a.v || a.k.localeCompare(b.k, undefined, { numeric: true }));
  return { keys: ranked.slice(0, max).map((x) => x.k), hidden: Math.max(0, ranked.length - max) };
}

export interface HistBucket { label: string; low: number; high: number; count: number }

export function dashHistogram(rows: DashRow[], vis: DashVisualSpec, fmt: (n: number) => string = (n) => String(n)): HistBucket[] {
  const nums: number[] = [];
  for (const r of rows) {
    const n = dashNumber(dashGet(r, vis.valueCol));
    if (n !== null) nums.push(n);
  }
  if (nums.length === 0) return [];
  let lo = nums[0];
  let hi = nums[0];
  for (const x of nums) {
    if (x < lo) lo = x;
    if (x > hi) hi = x;
  }
  const bins = Math.max(3, Math.min(25, vis.bins || 8));
  const step = (hi === lo ? 1 : hi - lo) / bins;
  const buckets: HistBucket[] = Array.from({ length: bins }, (_, i) => {
    const low = lo + i * step;
    const high = i === bins - 1 ? hi : lo + (i + 1) * step;
    return { label: `${fmt(low)}–${fmt(high)}`, low, high, count: 0 };
  });
  for (const x of nums) buckets[Math.min(bins - 1, Math.max(0, Math.floor((x - lo) / step)))].count++;
  return buckets;
}

/** Monthly totals of a measure by UTC month, for "month over month" text. */
export function monthlyTotals(rows: DashRow[], dateCol: string, valueCol: string): Map<string, { sum: number; count: number }> {
  const acc = new Map<string, { nums: number[]; count: number }>();
  const memo = new Map<any, string | null>();
  for (const r of rows) {
    const raw = dashGet(r, dateCol);
    let k = memo.get(raw);
    if (k === undefined) {
      const p = dashDateParts(raw);
      k = p ? periodKey(p, 'month') : null;
      if (memo.size < 200_000) memo.set(raw, k);
    }
    if (k === null) continue;
    let a = acc.get(k);
    if (!a) acc.set(k, (a = { nums: [], count: 0 }));
    a.count++;
    const n = dashNumber(dashGet(r, valueCol));
    if (n !== null) a.nums.push(n);
  }
  const out = new Map<string, { sum: number; count: number }>();
  for (const [k, a] of acc) out.set(k, { sum: cleanFloat(preciseSum(a.nums)), count: a.count });
  return out;
}
