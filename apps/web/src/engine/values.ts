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
// Currency markers recognised around a number, before or after it:
// symbols ($ € £ ¥ ₹) and codes/abbreviations common in Indian and
// international exports (Rs, Rs., INR, USD, EUR, GBP, AED, SGD).
const CURRENCY_PREFIX = /^(?:[$€£¥₹]|rs\.?|inr|usd|eur|gbp|aed|sgd)\s*/i;
const CURRENCY_SUFFIX = /\s*(?:[$€£¥₹]|rs\.?|inr|usd|eur|gbp|aed|sgd|\/-)$/i;

/**
 * Parse the numeric core of a value (sign, currency and % already handled
 * by the caller) in any of the grouping conventions found in real exports:
 *   1234.5 / 1,234.5        international
 *   1,23,456.78 / 2,00,000  Indian lakh/crore grouping
 *   1.234,56 / 99,5         European decimal comma
 *   1.234.567               European thousands (2+ dot groups only)
 * Returns null for anything else.
 */
function parseNumberCore(core: string): number | null {
  let normalised: string | null = null;
  if (/^\d+(\.\d+)?$|^\.\d+$/.test(core)) normalised = core;
  else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(core)) normalised = core.replace(/,/g, '');
  else if (/^\d{1,2}(,\d{2})+,\d{3}(\.\d+)?$/.test(core)) normalised = core.replace(/,/g, ''); // Indian
  else if (/^\d{1,3}(\.\d{3})+,\d+$/.test(core)) normalised = core.replace(/\./g, '').replace(',', '.'); // 1.234,56
  else if (/^\d+,\d{1,2}$/.test(core)) normalised = core.replace(',', '.'); // 99,5 / 1234,56
  else if (/^\d{1,3}(\.\d{3}){2,}$/.test(core)) normalised = core.replace(/\./g, ''); // 1.234.567
  if (normalised === null) return null;
  const n = Number(normalised);
  return Number.isFinite(n) ? n : null;
}

/** Strip sign, currency and percent around a number; null if no number core. */
function splitNumberParts(raw: string): { core: string; negative: boolean; percent: boolean } | null {
  let s = raw.trim();
  if (s === '') return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1).trim();
  }
  // sign and currency may come in either order: -₹500, ₹-500, Rs. -1,234
  for (let pass = 0; pass < 2; pass++) {
    if (/^[-+]/.test(s)) {
      if (s[0] === '-') negative = !negative;
      s = s.slice(1).trim();
    }
    s = s.replace(CURRENCY_PREFIX, '').trim();
  }
  s = s.replace(CURRENCY_SUFFIX, '').trim();
  let percent = false;
  if (/%$/.test(s)) {
    percent = true;
    s = s.slice(0, -1).trim();
  }
  // SAP / mainframe style trailing minus: "1,234.00-"
  if (/\d-$/.test(s)) {
    negative = !negative;
    s = s.slice(0, -1).trim();
  }
  if (s === '') return null;
  return { core: s, negative, percent };
}

/**
 * Parse a value as a number. Accepts currency symbols/codes, accounting
 * negatives (1,234.00), trailing minus (1234-), percentages (15% -> 0.15)
 * and international, Indian (1,23,456.78) and European (1.234,56)
 * grouping. Scientific notation ("1.5E+03") only with allowScientific --
 * an explicit conversion asks for it, but a value like "12E4" in a free
 * text column is more often a code than a number.
 * Anything else (blanks, free text) -> null. Never returns NaN.
 */
export function parseSharedNumber(raw: any, opts: { allowScientific?: boolean } = {}): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw === 'boolean') return null;
  const str = String(raw).trim();
  if (str === '') return null;
  const parts = splitNumberParts(str);
  if (!parts) return null;
  let n: number | null;
  if (/^(?:\d+\.?\d*|\.\d+)[eE][-+]?\d+$/.test(parts.core)) {
    if (!opts.allowScientific) return null; // scientific stays text unless asked (SPEC.md import rule)
    n = Number(parts.core);
    if (!Number.isFinite(n)) return null;
  } else {
    n = parseNumberCore(parts.core);
  }
  if (n === null) return null;
  let result = parts.percent ? n / 100 : n;
  if (parts.negative) result = -result;
  return cleanFloat(result);
}

/** Remove binary-float noise while never doing user-visible rounding. */
export function cleanFloat(n: number): number {
  if (!Number.isFinite(n)) return n;
  if (Number.isInteger(n)) return n;
  // Round to 15 significant digits -- Excel's precision -- which removes
  // binary-float noise (0.1+0.2) without the visible loss 12 digits caused
  // after subtracting near-equal numbers (MOD(762/0.57,2) drifted in the
  // 9th digit).
  const abs = Math.abs(n);
  const digits = abs === 0 ? 0 : Math.max(0, 15 - Math.ceil(Math.log10(abs)));
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
  const parts = splitNumberParts(s);
  if (!parts) return false;
  const core = parts.core;
  if (/[eE]/.test(core)) return false; // scientific notation stays text on import
  if (parseNumberCore(core) === null) return false;
  const digitsOnly = core.replace(/[,.]/g, '');
  if (digitsOnly.length > 1 && digitsOnly[0] === '0' && !/^0[.,]\d+$/.test(core) && !core.includes(',')) {
    return false; // leading-zero code, e.g. "00501"
  }
  const significant = digitsOnly.replace(/^0+/, '') || '0';
  if (significant.length > 15) return false; // precision-losing long id/card number
  return true;
}

/**
 * Compensated (Neumaier) summation. Adding many values one by one lets
 * rounding error build up -- 0.1 added a million times gave
 * 100,000.000001 -- this keeps the running error and adds it back.
 */
export function preciseSum(nums: number[]): number {
  let sum = 0;
  let comp = 0;
  for (const x of nums) {
    const t = sum + x;
    comp += Math.abs(sum) >= Math.abs(x) ? sum - t + x : x - t + sum;
    sum = t;
  }
  return sum + comp;
}

/** Incremental form of preciseSum for running totals. */
export class RunningSum {
  private sum = 0;
  private comp = 0;
  add(x: number): void {
    const t = this.sum + x;
    this.comp += Math.abs(this.sum) >= Math.abs(x) ? this.sum - t + x : x - t + this.sum;
    this.sum = t;
  }
  get value(): number {
    return this.sum + this.comp;
  }
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
    // Any Unicode letter (é, Ñ, ü ...), like Excel -- A-Z only turned
    // "élise" into "éLise" and "MÜLLER" into "MüLler".
    const isLetter = /\p{L}/u.test(ch);
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
/** Build a UTC date only if every component is in range for that month. */
function validDate(y: number, mo: number, d: number, hh = 0, mi = 0, se = 0): Date | null {
  if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) return null;
  if (hh > 23 || mi > 59 || se > 59) return null;
  return new Date(Date.UTC(y, mo - 1, d, hh, mi, se));
}

function to24h(h: number, ampm?: string): number {
  if (!ampm) return h;
  const pm = ampm.toLowerCase() === 'pm';
  if (h === 12) return pm ? 12 : 0;
  return pm ? h + 12 : h;
}

export function parseSharedDate(raw: any, opts: { asDateStep?: boolean; monthFirst?: boolean } = {}): Date | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw;

  if (typeof raw === 'number') {
    if (opts.asDateStep && raw >= 1 && raw <= 2958465) return excelSerialToDate(raw);
    return null;
  }

  // Drop a leading weekday ("Tue, 05 Mar 2024") and ordinal suffixes
  // ("5th March 2024") -- they carry no extra information.
  const s = String(raw)
    .trim()
    .replace(/^(?:mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)[a-z]*\.?,?\s+(?=\d|[a-z])/i, '')
    .replace(/\b(\d{1,2})(?:st|nd|rd|th)\b/gi, '$1');
  if (s === '') return null;

  // Excel serial typed as text, only under a date step
  if (opts.asDateStep && /^\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    if (n >= 1 && n <= 2958465) return excelSerialToDate(n);
  }

  // Every branch builds its date through validDate(), which rejects
  // impossible calendar dates instead of letting Date.UTC roll them into the
  // next month ("31/02/2024" used to become 2 March, "2024-02-30" 1 March --
  // silently shifting rows between months in every date step and formula).
  // A string that names an impossible date is simply not a date.

  // ISO yyyy-mm-dd (optional time, optional seconds)
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?\s*(am|pm)?)?(?![\d])/i);
  if (m) {
    const [, y, mo, d, hh, mi, se, ap] = m;
    return validDate(+y, +mo, +d, hh ? to24h(+hh, ap) : 0, mi ? +mi : 0, se ? +se : 0);
  }

  // yyyy/mm/dd
  m = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (m) {
    const [, y, mo, d] = m;
    return validDate(+y, +mo, +d);
  }

  // d-MMM-yyyy / d MMM yyyy / d Month yyyy (e.g. 31-Jan-2024, 5 March 2024)
  m = s.match(/^(\d{1,2})[-\s]([A-Za-z]{3,})[-\s,]*(\d{4})$/);
  if (m) {
    const [, d, monStr, y] = m;
    const mon = MONTH_NAMES[monStr.toLowerCase()];
    if (mon) return validDate(+y, mon, +d);
  }

  // Month d, yyyy / Mon d yyyy (e.g. March 5, 2024; Mar 5 2024)
  m = s.match(/^([A-Za-z]{3,})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/);
  if (m) {
    const [, monStr, d, y] = m;
    const mon = MONTH_NAMES[monStr.toLowerCase()];
    if (mon) return validDate(+y, mon, +d);
  }

  // dd/mm/yyyy or dd-mm-yyyy (day-first by default; swap to mm/dd if the
  // "month" slot would otherwise be invalid)
  // Two-digit years follow Excel: 00-29 -> 2000s, 30-99 -> 1900s.
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})$/);
  if (m) {
    const [, aStr, bStr, yStr] = m;
    const a = +aStr;
    const b = +bStr;
    const y = yStr.length === 2 ? (+yStr < 30 ? 2000 + +yStr : 1900 + +yStr) : +yStr;
    let day: number, month: number;
    if (a > 12) {
      day = a;
      month = b;
    } else if (b > 12) {
      month = a;
      day = b;
    } else if (opts.monthFirst) {
      // the column as a whole is month-first (US), e.g. it also holds 03/13/2024
      month = a;
      day = b;
    } else {
      day = a;
      month = b;
    }
    return validDate(y, month, day);
  }

  // A bare time of day ("14:30", "2:30 PM", "2:30:15 pm"): Excel stores it as
  // a fraction of a day on its 1899-12-30 epoch, so HOUR/MINUTE/SECOND work.
  m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (m) {
    const [, hh, mi, se, ap] = m;
    const h = to24h(+hh, ap);
    if (h > 23 || +mi > 59 || (se !== undefined && +se > 59)) return null;
    return new Date(Date.UTC(1899, 11, 30, h, +mi, se ? +se : 0));
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
