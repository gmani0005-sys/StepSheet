/**
 * Minimal, dependency-light XLSX writer for flat tabular exports.
 *
 * Why this exists instead of ExcelJS (see exportExcel in api/localEngine.ts):
 *
 *  - ExcelJS's Document-model Workbook builds a full in-memory Row/Cell object
 *    graph per row via sheet.addRow(). Measured at ~38s for 100K rows and
 *    ~80s for 250K rows (~300us/row), i.e. a projected 5+ minutes at 1M rows.
 *
 *  - ExcelJS's fast streaming WorkbookWriter (ExcelJS.stream.xlsx) is NOT
 *    usable here: it only exists in ExcelJS's Node entry point (excel.js,
 *    backed by `archiver` + Node streams). The package.json "browser" field
 *    points Vite's production build at dist/exceljs.min.js, which exports only
 *    Workbook/ValueType/FormulaType/RelationshipType/DocumentType/
 *    ReadingOrder/ErrorValue -- `ExcelJS.stream` is undefined there, so every
 *    browser export would throw "Cannot read properties of undefined
 *    (reading 'xlsx')". (Benchmarks run via vite-node looked fine only
 *    because SSR resolves the Node entry instead.) It also hangs forever in
 *    workbook.commit() under Vitest.
 *
 * This writer emits the parts a valid single-sheet .xlsx needs, writes every
 * cell inline (numbers as <v>, booleans as t="b", ISO dates and date-times
 * as real Excel date serials with a date format, everything else as
 * t="inlineStr" -- no sharedStrings part), and zips with JSZip, which
 * runs identically in the browser, Node and Vitest. Measured at ~1.3s for
 * 100K rows and ~11.6s for 1M rows, round-trip verified with an independent
 * reader (openpyxl) for exact row count and cell values.
 */

import { dateToExcelSerial, parseSharedDate } from './values';

/** Excel's hard per-sheet row limit (including the header row). */
export const EXCEL_MAX_ROWS = 1_048_576;

// Rows are serialized to XML text in batches, and each batch is UTF-8 encoded
// on its own, so we never build one giant JS string for the whole sheet: V8
// caps string length at ~2^29 chars (~512M), which a wide 1M-row sheet could
// exceed, failing with "RangeError: Invalid string length".
const ROWS_PER_CHUNK = 10_000;

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

const CONTENT_TYPES =
  XML_HEADER +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
  '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
  '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
  '</Types>';

const ROOT_RELS =
  XML_HEADER +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
  '</Relationships>';

const WORKBOOK_RELS =
  XML_HEADER +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
  '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
  '</Relationships>';

// Cell styles: s="0" default, s="1" date (yyyy-mm-dd), s="2" date-time.
// Dates were previously written as text, so Excel could not group, filter or
// calculate on them without converting first.
const STYLES =
  XML_HEADER +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<numFmts count="2"><numFmt numFmtId="164" formatCode="yyyy-mm-dd"/><numFmt numFmtId="165" formatCode="yyyy-mm-dd hh:mm:ss"/></numFmts>' +
  '<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>' +
  '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  '</styleSheet>';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?Z?$/;

/** An ISO date / date-time string as an Excel serial + style, else null. */
function excelDateCell(text: string): { serial: number; style: 1 | 2 } | null {
  const isDate = ISO_DATE.test(text);
  if (!isDate && !ISO_DATETIME.test(text)) return null;
  const d = parseSharedDate(text);
  if (!d) return null;
  // Whole days from the date part (dateToExcelSerial rounds, which would
  // push an afternoon timestamp onto the next day), plus the time of day.
  const dayOnly = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const serial = dateToExcelSerial(dayOnly) + (d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds()) / 86400;
  if (!(serial >= 1)) return null; // before 1900-01-01: Excel has no date for it, keep as text
  return { serial, style: isDate ? 1 : 2 };
}

const escapeSheetName = (name: string) =>
  // Excel forbids : \ / ? * [ ] in sheet names and caps them at 31 chars.
  (name.replace(/[:\\/?*[\]]/g, '_').slice(0, 31) || 'Sheet1')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const workbookXml = (sheetName: string) =>
  XML_HEADER +
  '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
  `<sheets><sheet name="${escapeSheetName(sheetName)}" sheetId="1" r:id="rId1"/></sheets>` +
  '</workbook>';

// XML 1.0 forbids most C0 control chars even when escaped; a stray one (e.g. a
// \u0001 pasted into a CSV cell) would make Excel reject the whole file as
// corrupt, so strip them. Tab, LF and CR are legal and kept.
// eslint-disable-next-line no-control-regex
const INVALID_XML_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;

export const escapeXmlText = (s: string): string =>
  s.replace(INVALID_XML_CHARS, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** 0 -> "A", 25 -> "Z", 26 -> "AA", ... */
export const columnLetter = (index: number): string => {
  let n = index + 1;
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};

const cellXml = (ref: string, v: unknown): string => {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'number') {
    // Non-finite numbers have no XLSX numeric representation; keep them
    // visible as text rather than silently blanking the cell.
    if (Number.isFinite(v)) return `<c r="${ref}"><v>${v}</v></c>`;
  } else if (typeof v === 'boolean') {
    return `<c r="${ref}" t="b"><v>${v ? 1 : 0}</v></c>`;
  }
  let text: string;
  if (v instanceof Date) text = Number.isNaN(v.getTime()) ? '' : v.toISOString();
  else if (typeof v === 'object') text = JSON.stringify(v);
  else text = String(v);
  if (text === '') return '';
  const date = excelDateCell(text);
  if (date) return `<c r="${ref}" s="${date.style}"><v>${date.serial}</v></c>`;
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXmlText(text)}</t></is></c>`;
};

/**
 * Build a single-sheet .xlsx: a header row of `columns`, then one row per
 * entry in `rows` (values looked up by column name). Returns the zipped bytes
 * (an ArrayBuffer, which is directly usable as a BlobPart).
 *
 * Throws (rather than silently truncating -- SPEC.md) when the data would
 * exceed Excel's 1,048,576-row sheet limit.
 */
export async function buildXlsx(
  columns: string[],
  rows: Record<string, unknown>[],
  sheetName = 'Sheet1',
): Promise<ArrayBuffer> {
  if (rows.length + 1 > EXCEL_MAX_ROWS) {
    throw new Error(
      `This result has ${rows.length.toLocaleString()} rows, but an Excel sheet holds at most ` +
        `${(EXCEL_MAX_ROWS - 1).toLocaleString()} data rows. Filter the data first, or export as CSV instead.`,
    );
  }

  const letters = columns.map((_, i) => columnLetter(i));
  const rowXml = (rowNum: number, values: unknown[]): string => {
    let s = `<row r="${rowNum}">`;
    for (let i = 0; i < values.length; i++) s += cellXml(letters[i] + rowNum, values[i]);
    return s + '</row>';
  };

  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  chunks.push(
    encoder.encode(
      XML_HEADER +
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' +
        rowXml(1, columns),
    ),
  );
  for (let start = 0; start < rows.length; start += ROWS_PER_CHUNK) {
    const end = Math.min(start + ROWS_PER_CHUNK, rows.length);
    const parts: string[] = [];
    for (let r = start; r < end; r++) {
      const record = rows[r];
      const values = new Array(columns.length);
      for (let c = 0; c < columns.length; c++) values[c] = record[columns[c]];
      parts.push(rowXml(r + 2, values));
    }
    chunks.push(encoder.encode(parts.join('')));
  }
  chunks.push(encoder.encode('</sheetData></worksheet>'));

  let total = 0;
  for (const c of chunks) total += c.length;
  const sheetBytes = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    sheetBytes.set(c, offset);
    offset += c.length;
  }
  chunks.length = 0;

  const JSZipModule: any = await import('jszip');
  const JSZip = JSZipModule.default ?? JSZipModule;
  const zip = new JSZip();
  zip.file('[Content_Types].xml', CONTENT_TYPES);
  zip.file('_rels/.rels', ROOT_RELS);
  zip.file('xl/workbook.xml', workbookXml(sheetName));
  zip.file('xl/_rels/workbook.xml.rels', WORKBOOK_RELS);
  zip.file('xl/styles.xml', STYLES);
  zip.file('xl/worksheets/sheet1.xml', sheetBytes);
  // Level 1: the sheet XML is highly repetitive, so fast deflate already gets
  // most of the size win; higher levels cost noticeably more time at 1M rows.
  return zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE', compressionOptions: { level: 1 } });
}
