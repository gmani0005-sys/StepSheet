// Shared number/text/date parsing utilities used by the formula engine and
// every pipeline step. These implement the "Numbers" / "Text" / "Dates"
// sections of SPEC.md so that both the Formula Builder and the step engine
// agree on how a value parses.

// ---------------------------------------------------------------------------
// Numbers
// ---------------------------------------------------------------------------

const MONTH_NAMES: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  january: 1, february: 2, march: 3, april: 4, june: 6, july: 7,
  august: 8, september: 9, october: 10, november: 11, december: 12,
};

/**
 * Parse a value as a number the way Excel/SPEC.md expects:
 * accepts real numbers, "1,234.50", "$500", "₹1,200", "(300)" = -300, "15%" = 0.15.
 * Anything else (including blanks, scientific notation typed as text, and
 * free text) is "not a number" -> null. Never returns NaN.
 */
export function parseSharedNumber(raw: any): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw === 'boolean') return null;
  let s = String(raw).trim();
  if (s === '') return null;
  if (/[eE]/.test(s)) return null; // scientific notation stays text (SPEC.md import rule)

  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1).trim();
  }
  if (/^[-+]/.test(s)) {
    if (s[0] === '-') negative = !negative; // (−..) and leading - cancel out; keep simple: treat leading - as negative
    s = s.slice(1).trim();
  }
  // strip currency symbols (prefix or suffix) and surrounding whitespace
  s = s.replace(/^[$€£¥₹]\s*/, '').replace(/\s*[$€£¥₹]$/, '').trim();

  let isPercent = false;
  if (/%$/.test(s)) {
    isPercent = true;
    s = s.slice(0, -1).trim();
  }
  if (s === '') return null;
  // thousands separators
  if (!/^\d{1,3}(,\d{3})*(\.\d+)?$|^\d+(\.\d+)?$|^\.\d+$/.test(s)) return null;
  const cleaned = s.replace(/,/g, '');
  const num = Number(cleaned);
  if (Number.isNaN(num)) return null;
  let result = num;
  if (isPercent) result = result / 100;
  if (negative) result = -result;
  return cleanFloat(result);
}

/** Remove binary-float noise while never doing user-visible rounding. */
export function cleanFloat(n: number): number {
  if (!Number.isFinite(n)) return n;
  if (Number.isInteger(n)) return n;
  // round to 12 significant digits to kill float noise, nothing more
  const abs = Math.abs(n);
  const digits = abs === 0 ? 0 : Math.max(0, 12 - Math.ceil(Math.log10(abs)));
  const factor = Math.pow(10, Math.min(15, digits));
  return Math.round(n * factor) / factor;
}

/**
 * Stricter check used only for CSV/XLSX import column-type inference.
 * Rejects values that look numeric but should stay text: scientific
 * notation ("1E5"), leading zeros ("00501"), and numbers too long to keep
 * integer precision (16+ digit card numbers / ids).
 */
export function looksNumericForImport(raw: string): boolean {
  const s = raw.trim();
  if (s === '') return false;
  if (/[eE]/.test(s)) return false;
  let core = s;
  if (/^\(.*\)$/.test(core)) core = core.slice(1, -1).trim();
  if (/^[-+]/.test(core)) core = core.slice(1).trim();
  core = core.replace(/^[$€£¥₹]\s*/, '').replace(/\s*[$€£¥₹]$/, '').trim();
  if (/%$/.test(core)) core = core.slice(0, -1).trim();
  if (!/^\d{1,3}(,\d{3})*(\.\d+)?$|^\d+(\.\d+)?$|^\.\d+$/.test(core)) return false;
  const digitsOnly = core.replace(/[,.]/g, '');
  if (digitsOnly.length > 1 && digitsOnly[0] === '0' && !/^0\.\d+$/.test(core) && !core.includes(',')) {
    return false; // leading-zero code, e.g. "00501"
  }
  const significant = digitsOnly.replace(/^0+/, '') || '0';
  if (significant.length > 15) return false; // precision-losing long id/card number
  return true;
}

export function isBlank(v: any): boolean {
  return v === null || v === undefined || v === '';
}

/**
 * Scale-safe replacements for Math.min(...arr) / Math.max(...arr).
 *
 * The spread-call form throws `RangeError: Maximum call stack size exceeded`
 * once `arr.length` is large enough to overflow the JS engine's per-call
 * argument limit — in V8 this is not a fixed constant but depends on the
 * current call-stack depth, so it can trip anywhere from roughly 60K to a
 * few hundred thousand elements depending on how deep the call site is
 * nested. At the row counts a real analytics workload deals with (a
 * `group_by`, a pivot cell, or a "what is the min/max X" question over a
 * dataset of hundreds of thousands to millions of rows), hitting this is
 * close to certain. A manual reduction loop has no such limit.
 */
export function arrayMin(arr: number[]): number {
  let m = Infinity;
  for (let i = 0; i < arr.length; i++) if (arr[i] < m) m = arr[i];
  return m;
}

export function arrayMax(arr: number[]): number {
  let m = -Infinity;
  for (let i = 0; i < arr.length; i++) if (arr[i] > m) m = arr[i];
  return m;
}

const ROUND_EPS = 1e-9;

/** Excel ROUND: half away from zero, supports negative digits. */
export function roundHalfAwayFromZero(n: number, digits: number): number {
  const factor = Math.pow(10, digits);
  const scaled = n * factor;
  const rounded = n >= 0 ? Math.floor(scaled + 0.5 + ROUND_EPS) : Math.ceil(scaled - 0.5 - ROUND_EPS);
  return rounded / factor;
}

/** Excel ROUNDUP: always away from zero. */
export function roundUpAwayFromZero(n: number, digits: number): number {
  const factor = Math.pow(10, digits);
  const scaled = n * factor;
  const rounded = n >= 0 ? Math.ceil(scaled - ROUND_EPS) : Math.floor(scaled + ROUND_EPS);
  return rounded / factor;
}

/** Excel ROUNDDOWN: always toward zero. */
export function roundDownTowardZero(n: number, digits: number): number {
  const factor = Math.pow(10, digits);
  const scaled = n * factor;
  const rounded = n >= 0 ? Math.floor(scaled + ROUND_EPS) : Math.ceil(scaled - ROUND_EPS);
  return rounded / factor;
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

export function properCase(s: string): string {
  let out = '';
  let prevIsLetter = false;
  for (const ch of s) {
    const isLetter = /[A-Za-z]/.test(ch);
    if (isLetter) {
      out += prevIsLetter ? ch.toLowerCase() : ch.toUpperCase();
    } else {
      out += ch;
    }
    prevIsLetter = isLetter;
  }
  return out;
}

export function trimCollapse(s: string): string {
  return s.trim().replace(/\s+/g, ' ');
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

export const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);
export const MS_PER_DAY = 86400000;

export function excelSerialToDate(serial: number): Date {
  return new Date(EXCEL_EPOCH_MS + serial * MS_PER_DAY);
}

export function dateToExcelSerial(d: Date): number {
  return Math.round((d.getTime() - EXCEL_EPOCH_MS) / MS_PER_DAY);
}

/**
 * Parse a value into a UTC calendar-date `Date` (time components kept only
 * when a timestamp was explicitly present). Returns null when unparseable.
 * `asDateStep` allows plain numeric values in the Excel-serial range to be
 * treated as dates (only used by date-typed steps, per SPEC.md).
 */
export function parseSharedDate(raw: any, opts: { asDateStep?: boolean } = {}): Date | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw;

  if (typeof raw === 'number') {
    if (opts.asDateStep && raw >= 1 && raw <= 2958465) return excelSerialToDate(raw);
    return null;
  }

  const s = String(raw).trim();
  if (s === '') return null;

  // Excel serial typed as text, only under a date step
  if (opts.asDateStep && /^\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    if (n >= 1 && n <= 2958465) return excelSerialToDate(n);
  }

  // ISO yyyy-mm-dd (optional time)
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    const [, y, mo, d, hh, mi, se] = m;
    return new Date(Date.UTC(+y, +mo - 1, +d, hh ? +hh : 0, mi ? +mi : 0, se ? +se : 0));
  }

  // yyyy/mm/dd
  m = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (m) {
    const [, y, mo, d] = m;
    if (+mo <= 12 && +d <= 31) return new Date(Date.UTC(+y, +mo - 1, +d));
  }

  // d-MMM-yyyy (e.g. 31-Jan-2024)
  m = s.match(/^(\d{1,2})[-\s]([A-Za-z]{3,})[-\s](\d{4})$/);
  if (m) {
    const [, d, monStr, y] = m;
    const mon = MONTH_NAMES[monStr.toLowerCase()];
    if (mon) return new Date(Date.UTC(+y, mon - 1, +d));
  }

  // dd/mm/yyyy or dd-mm-yyyy (day-first by default; swap to mm/dd if the
  // "month" slot would otherwise be invalid)
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) {
    let [, aStr, bStr, yStr] = m;
    let a = +aStr;
    let b = +bStr;
    const y = +yStr;
    let day: number, month: number;
    if (a > 12) {
      day = a;
      month = b;
    } else if (b > 12) {
      month = a;
      day = b;
    } else {
      day = a;
      month = b;
    }
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return new Date(Date.UTC(y, month - 1, day));
    }
    return null;
  }

  // Fall back to native parsing for things like full ISO timestamps with Z,
  // but guard against timezone shifting a pure date.
  const native = new Date(s);
  if (!Number.isNaN(native.getTime())) {
    if (/^\d{4}-\d{2}-\d{2}T/.test(s) || /Z$/.test(s)) return native;
  }
  return null;
}

export function toISODate(d: Date): string {
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

export function daysInMonth(year: number, month1to12: number): number {
  return new Date(Date.UTC(year, month1to12, 0)).getUTCDate();
}

/** Add months, clamping the day to the end of the resulting month. */
export function addMonthsClamped(d: Date, months: number): Date {
  const y = d.getUTCFullYear();
  const mo = d.getUTCMonth();
  const day = d.getUTCDate();
  const targetMonthIdx = mo + months;
  const targetYear = y + Math.floor(targetMonthIdx / 12);
  const targetMonth = ((targetMonthIdx % 12) + 12) % 12;
  const maxDay = daysInMonth(targetYear, targetMonth + 1);
  return new Date(Date.UTC(targetYear, targetMonth, Math.min(day, maxDay), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()));
}

export function addYearsClamped(d: Date, years: number): Date {
  return addMonthsClamped(d, years * 12);
}

export function daysBetweenUTC(a: Date, b: Date): number {
  const au = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const bu = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
  return Math.round((bu - au) / MS_PER_DAY);
}

export function eomonth(d: Date, monthsAhead = 0): Date {
  const y = d.getUTCFullYear();
  const mo = d.getUTCMonth();
  const idx = mo + monthsAhead;
  const targetYear = y + Math.floor(idx / 12);
  const targetMonth = ((idx % 12) + 12) % 12;
  return new Date(Date.UTC(targetYear, targetMonth + 1, 0));
}

/** Excel WEEKNUM type 1: week starts Sunday, Jan 1 is week 1. */
export function excelWeekNum(d: Date): number {
  const startOfYear = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const startDow = startOfYear.getUTCDay(); // 0=Sun
  const dayOfYear = daysBetweenUTC(startOfYear, d);
  return Math.floor((dayOfYear + startDow) / 7) + 1;
}

/** 0-6, Sunday = 0 */
export function weekdaySun0(d: Date): number {
  return d.getUTCDay();
}

type DatedifUnit = 'y' | 'm' | 'd' | 'ym' | 'yd' | 'md';

function normalizeDatedifUnit(unit: string): DatedifUnit {
  const u = (unit || 'd').toLowerCase();
  if (u === 'year' || u === 'years' || u === 'y') return 'y';
  if (u === 'month' || u === 'months' || u === 'm') return 'm';
  if (u === 'day' || u === 'days' || u === 'd') return 'd';
  if (u === 'ym' || u === 'yd' || u === 'md') return u as DatedifUnit;
  return 'd';
}

export function datedif(start: Date, end: Date, unit: string): number | null {
  const u = normalizeDatedifUnit(unit);
  if (end.getTime() < start.getTime()) return null;
  const sy = start.getUTCFullYear();
  const sm = start.getUTCMonth() + 1;
  const sd = start.getUTCDate();
  const ey = end.getUTCFullYear();
  const em = end.getUTCMonth() + 1;
  const ed = end.getUTCDate();

  const wholeYears = () => {
    let y = ey - sy;
    if (em < sm || (em === sm && ed < sd)) y--;
    return y;
  };
  const wholeMonths = () => {
    let m = (ey - sy) * 12 + (em - sm);
    if (ed < sd) m--;
    return m;
  };

  switch (u) {
    case 'y':
      return wholeYears();
    case 'm':
      return wholeMonths();
    case 'd':
      return daysBetweenUTC(start, end);
    case 'ym': {
      const m = wholeMonths();
      return ((m % 12) + 12) % 12;
    }
    case 'yd': {
      const wy = wholeYears();
      const advanced = addYearsClamped(start, wy);
      return daysBetweenUTC(advanced, end);
    }
    case 'md': {
      const wm = wholeMonths();
      const advanced = addMonthsClamped(start, wm);
      return daysBetweenUTC(advanced, end);
    }
    default:
      return daysBetweenUTC(start, end);
  }
}

export function fiscalYearLabel(d: Date, fiscalStartMonth: number): string {
  const startMonth = fiscalStartMonth && fiscalStartMonth >= 1 && fiscalStartMonth <= 12 ? fiscalStartMonth : 1;
  const month = d.getUTCMonth() + 1;
  const year = d.getUTCFullYear();
  const fy = startMonth > 1 && month >= startMonth ? year + 1 : year;
  return `FY${fy}`;
}

export function networkdays(start: Date, end: Date): number {
  const a = start.getTime() <= end.getTime() ? start : end;
  const b = start.getTime() <= end.getTime() ? end : start;
  let count = 0;
  const cur = new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate()));
  const endU = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
  while (cur.getTime() <= endU) {
    const dow = cur.getUTCDay();
    if (dow !== 0 && dow !== 6) count++;
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return start.getTime() <= end.getTime() ? count : -count;
}

export function workday(start: Date, days: number): Date {
  const cur = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  let remaining = Math.trunc(days);
  const step = remaining >= 0 ? 1 : -1;
  while (remaining !== 0) {
    cur.setUTCDate(cur.getUTCDate() + step);
    const dow = cur.getUTCDay();
    if (dow !== 0 && dow !== 6) remaining -= step;
  }
  return cur;
}
