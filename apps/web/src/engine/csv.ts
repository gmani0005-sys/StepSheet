import { parseSharedNumber } from './values';

/**
 * One CSV cell, quoted per RFC 4180 and guarded against CSV formula
 * injection (OWASP): text that starts with = + - @ tab or CR is run as a
 * formula when the file is opened in Excel or Google Sheets (e.g.
 * =HYPERLINK("http://evil.example","click")), so it is prefixed with an
 * apostrophe, which spreadsheets display as plain text. Real numbers
 * (-0.5, "-1,200") are left alone.
 */
export function csvCell(val: unknown): string {
  if (val === null || val === undefined) return '';
  let s = String(val);
  if (typeof val === 'string' && /^[=+\-@\t\r]/.test(s) && parseSharedNumber(s) === null) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** A whole CSV document: header row + one line per row (values by column name). */
export function toCsv(columns: string[], rows: Record<string, unknown>[]): string {
  return [columns.map(csvCell).join(','), ...rows.map((r) => columns.map((c) => csvCell(r[c])).join(','))].join('\n');
}
