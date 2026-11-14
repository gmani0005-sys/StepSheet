import { toCsv } from '../engine/csv';
import { storage } from '../utils/storage';
import { StepDefinition } from '../types/steps';
import { localEngine } from './localEngine';
import { useWorkbenchStore } from '../store/workbenchStore';

const isFileProtocol =
  typeof window !== 'undefined' && window.location?.protocol === 'file:';

const isStandalone =
  isFileProtocol ||
  (typeof window !== 'undefined' && Boolean((window as any).__STEPSHEET_STANDALONE__));

const API_BASE = isFileProtocol ? 'http://127.0.0.1:8000/api/v1' : '/api/v1';

function getAuthHeader(): Record<string, string> {
  const token = storage.get('stepsheet_access_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export interface DashboardExportKpi {
  title: string;
  value: number | string;
  formattedValue: string;
  aggFunc: string;
  subtitle: string;
  column: string;
}

export interface DashboardExportVisualItem {
  category: string;
  value: number;
  percentage: string;
  count: number;
}

export interface DashboardExportVisual {
  id: string;
  title: string;
  type: string;
  categoryCol: string;
  valueCol: string;
  aggFunc: string;
  insight?: string;
  items: DashboardExportVisualItem[];
}

export interface DashboardExportData {
  title: string;
  datasetName: string;
  kpis: DashboardExportKpi[];
  visuals: DashboardExportVisual[];
  filteredRowCount: number;
  totalRowCount: number;
  rows: Record<string, any>[];
  columns: string[];
  steps?: StepDefinition[];
}

export interface ExportJobCreatePayload {
  project_id: string;
  dataset_id: string;
  format: string;
  row_scope?: string;
  row_limit?: number;
  excluded_columns?: string[];
  include_lineage?: boolean;
  include_quality?: boolean;
  include_lookups?: boolean;
  include_dictionary?: boolean;
  include_visuals?: boolean;
  options?: Record<string, any>;
  steps?: StepDefinition[];
}

export interface ExportFileItem {
  file_id: string;
  filename: string;
  file_type: string;
  size_bytes: number;
  download_url: string;
}

export interface ExportJobStatus {
  job_id: string;
  project_id: string;
  dataset_id: string;
  format: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress_pct: number;
  message?: string;
  files: ExportFileItem[];
  created_at: string;
  completed_at?: string;
  total_rows?: number;
  error_message?: string;
}

function escapeXml(val: any): string {
  if (val === null || val === undefined) return '';
  return String(val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function crc32(buf: Uint8Array): number {
  let table = (crc32 as any).table;
  if (!table) {
    table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      table[i] = c;
    }
    (crc32 as any).table = table;
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

function stringToUint8Array(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

function createZipBlob(files: Array<{ name: string; content: string | Uint8Array }>): Blob {
  const parts: Uint8Array[] = [];
  const cdEntries: Uint8Array[] = [];
  let offset = 0;

  for (const f of files) {
    const fnBytes = stringToUint8Array(f.name);
    const dataBytes = typeof f.content === 'string' ? stringToUint8Array(f.content) : f.content;
    const crc = crc32(dataBytes);
    const size = dataBytes.length;

    // Local file header (30 bytes)
    const lh = new Uint8Array(30);
    const dvLh = new DataView(lh.buffer);
    dvLh.setUint32(0, 0x04034b50, true);
    dvLh.setUint16(4, 20, true);
    dvLh.setUint16(6, 0, true);
    dvLh.setUint16(8, 0, true); // STORE
    dvLh.setUint16(10, 0, true);
    dvLh.setUint16(12, 0, true);
    dvLh.setUint32(14, crc, true);
    dvLh.setUint32(18, size, true);
    dvLh.setUint32(22, size, true);
    dvLh.setUint16(26, fnBytes.length, true);
    dvLh.setUint16(28, 0, true);

    parts.push(lh, fnBytes, dataBytes);

    // Central directory header (46 bytes)
    const cd = new Uint8Array(46);
    const dvCd = new DataView(cd.buffer);
    dvCd.setUint32(0, 0x02014b50, true);
    dvCd.setUint16(4, 20, true);
    dvCd.setUint16(6, 20, true);
    dvCd.setUint16(8, 0, true);
    dvCd.setUint16(10, 0, true); // STORE
    dvCd.setUint16(12, 0, true);
    dvCd.setUint16(14, 0, true);
    dvCd.setUint32(16, crc, true);
    dvCd.setUint32(20, size, true);
    dvCd.setUint32(24, size, true);
    dvCd.setUint16(28, fnBytes.length, true);
    dvCd.setUint16(30, 0, true);
    dvCd.setUint16(32, 0, true);
    dvCd.setUint16(34, 0, true);
    dvCd.setUint16(36, 0, true);
    dvCd.setUint32(38, 0, true);
    dvCd.setUint32(42, offset, true);

    cdEntries.push(cd, fnBytes);
    offset += 30 + fnBytes.length + size;
  }

  const cdOffset = offset;
  let cdSize = 0;
  for (const b of cdEntries) cdSize += b.length;

  const eocd = new Uint8Array(22);
  const dvEocd = new DataView(eocd.buffer);
  dvEocd.setUint32(0, 0x06054b50, true);
  dvEocd.setUint16(4, 0, true);
  dvEocd.setUint16(6, 0, true);
  dvEocd.setUint16(8, files.length, true);
  dvEocd.setUint16(10, files.length, true);
  dvEocd.setUint32(12, cdSize, true);
  dvEocd.setUint32(16, cdOffset, true);
  dvEocd.setUint16(20, 0, true);

  return new Blob([...parts, ...cdEntries, eocd] as unknown as BlobPart[], {
    type: 'application/zip',
  });
}

type PdfTextItem = { kind?: 'text'; text: string; font?: string; leading?: number; x?: number };
type PdfRawItem = { kind: 'raw'; ops: string; consumesHeight?: number };
type PdfPageItem = PdfTextItem | PdfRawItem;

export function createMultiPagePdfBlob(pages: Array<PdfPageItem[]>): Blob {
  let body = '%PDF-1.4\n';
  const offsets: number[] = [];

  function addObj(str: string) {
    offsets.push(new TextEncoder().encode(body).length);
    body += str + '\n';
  }

  const pageCount = Math.max(1, pages.length);
  const pageObjIds: number[] = [];
  const contentObjIds: number[] = [];

  // obj 1: Catalog
  addObj('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj');

  let curId = 3;
  for (let i = 0; i < pageCount; i++) {
    pageObjIds.push(curId++);
    contentObjIds.push(curId++);
  }

  const kidsStr = pageObjIds.map((id) => `${id} 0 R`).join(' ');
  addObj(`2 0 obj\n<< /Type /Pages /Kids [${kidsStr}] /Count ${pageCount} >>\nendobj`);

  for (let i = 0; i < pageCount; i++) {
    const pageId = pageObjIds[i];
    const contentId = contentObjIds[i];
    const items = pages[i] || [];

    addObj(
      `${pageId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentId} 0 R /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> /F2 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> /F3 << /Type /Font /Subtype /Type1 /BaseFont /Courier >> /F4 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique >> >> >> >>\nendobj`
    );

    // A page mixes two kinds of content: ordinary text lines (rendered with
    // the running Td-offset trick below) and raw graphics/text operators
    // for real charts and report chrome (see buildChartOps, header/footer
    // builders below). Text needs an open BT...ET block; raw ops are
    // emitted outside one, since they draw their own shapes and their own
    // small BT...ET label blocks internally.
    const contentLines: string[] = [];
    let y = 745;
    let textOpen = false;
    for (const item of items) {
      if ('kind' in item && item.kind === 'raw') {
        if (textOpen) {
          contentLines.push('ET');
          textOpen = false;
        }
        contentLines.push(item.ops);
        if (item.consumesHeight) y -= item.consumesHeight;
        continue;
      }
      if (y < 40) continue; // keep y in sync for later raw items, just stop adding more text
      const textItem = item as PdfTextItem;
      if (!textOpen) {
        contentLines.push('BT');
        textOpen = true;
      }
      const font = textItem.font || '/F2 9';
      const text = pdfTextEscape(textItem.text || '').slice(0, 95);
      contentLines.push(`${font} Tf`);
      contentLines.push(`${textItem.x || 45} ${y} Td`);
      contentLines.push(`(${text}) Tj`);
      contentLines.push(`-${textItem.x || 45} -${y} Td`);
      y -= textItem.leading || 14;
    }
    if (textOpen) contentLines.push('ET');

    const streamContent = contentLines.join('\n');
    const streamLen = new TextEncoder().encode(streamContent).length;
    addObj(`${contentId} 0 obj\n<< /Length ${streamLen} >>\nstream\n${streamContent}\nendstream\nendobj`);
  }

  const totalObjs = curId;
  const xrefOffset = new TextEncoder().encode(body).length;
  body += `xref\n0 ${totalObjs}\n0000000000 65535 f \n`;
  for (let i = 0; i < offsets.length; i++) {
    const offStr = String(offsets[i]).padStart(10, '0');
    body += `${offStr} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${totalObjs} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return new Blob([body], { type: 'application/pdf' });
}

// ---------------------------------------------------------------------
// "Consulting deck" visual language for the PDF export: a restrained
// navy / slate / gold palette, generous whitespace, thin rules instead of
// fills, small-caps section eyebrows, and a header/footer on every page --
// the conventions of a report built to be handed to a leadership team,
// rather than a default BI-tool export.
// ---------------------------------------------------------------------
const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN_X = 54;
const CONTENT_W = PAGE_W - MARGIN_X * 2; // 504

const NAVY: [number, number, number] = [0.071, 0.145, 0.267];
const NAVY_LIGHT: [number, number, number] = [0.29, 0.388, 0.51];
const SLATE: [number, number, number] = [0.25, 0.25, 0.27];
const GRAY_MED: [number, number, number] = [0.45, 0.45, 0.47];
const GRAY_LIGHT: [number, number, number] = [0.82, 0.82, 0.83];
const GRAY_FAINT: [number, number, number] = [0.955, 0.957, 0.962];
const GOLD: [number, number, number] = [0.698, 0.553, 0.102];
const WHITE: [number, number, number] = [1, 1, 1];

// A muted, print-friendly qualitative palette (navy/slate/gold family)
// rather than a bright default BI-tool palette.
const CHART_PALETTE: Array<[number, number, number]> = [
  NAVY,
  [0.231, 0.408, 0.616],
  [0.106, 0.459, 0.451],
  GOLD,
  [0.459, 0.502, 0.541],
  [0.502, 0.161, 0.176],
  [0.58, 0.706, 0.827],
  [0.224, 0.388, 0.247],
  [0.337, 0.337, 0.345],
  [0.635, 0.439, 0.439],
];

function pdfTextEscape(s: string): string {
  // Base-14 fonts (Helvetica etc.) in a hand-rolled, non-embedded PDF use
  // single-byte WinAnsi/StandardEncoding, so any character outside that
  // range (including "nice" Unicode punctuation like an ellipsis) renders
  // as a garbled glyph instead of being shown or dropped. Replace anything
  // outside printable Latin-1 with a plain '?' to stay safe.
  return (s || '')
    .replace(/[()\\\r\n]/g, ' ')
    .replace(/[^\x20-\x7e]/g, '?');
}

function pdfTruncate(s: string, n: number): string {
  const str = s || '';
  return str.length > n ? str.slice(0, n - 1) + '...' : str;
}

// Exact Helvetica AFM glyph widths (per 1000 em) for digits and the
// punctuation that appears in formatted numbers/percentages -- lets value
// columns right-align precisely instead of guessing. Letters fall back to
// a reasonable average width, which is fine since those are always
// left-aligned category text, never the thing being aligned.
const HELV_WIDTHS: Record<string, number> = {
  '0': 556, '1': 556, '2': 556, '3': 556, '4': 556, '5': 556, '6': 556, '7': 556, '8': 556, '9': 556,
  '.': 278, ',': 278, '%': 789, '-': 333, ' ': 278, '+': 584, ':': 278, '(': 333, ')': 333,
};
function pdfApproxWidth(text: string, size: number, bold = false): number {
  let w = 0;
  for (const ch of text) {
    const known = HELV_WIDTHS[ch];
    w += (known !== undefined ? known : bold ? 610 : 556) / 1000;
  }
  return w * size;
}

function pdfLabelOp(
  x: number,
  y: number,
  size: number,
  text: string,
  bold = false,
  color: [number, number, number] = SLATE,
  italic = false
): string {
  const font = italic ? '/F4' : bold ? '/F1' : '/F2';
  const [r, g, b] = color;
  return `${r} ${g} ${b} rg\nBT ${font} ${size} Tf 1 0 0 1 ${x.toFixed(1)} ${y.toFixed(1)} Tm (${pdfTextEscape(text)}) Tj ET\n`;
}

/** Right-aligns a label so its right edge lands at `rightEdge`. */
function pdfLabelOpRight(
  rightEdge: number,
  y: number,
  size: number,
  text: string,
  bold = false,
  color: [number, number, number] = SLATE
): string {
  const w = pdfApproxWidth(text, size, bold);
  return pdfLabelOp(rightEdge - w, y, size, text, bold, color);
}

function pdfRectOp(x: number, y: number, w: number, h: number, rgb: [number, number, number]): string {
  const [r, g, b] = rgb;
  return `${r} ${g} ${b} rg\n${x.toFixed(1)} ${y.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)} re f\n`;
}

function pdfRuleOp(x1: number, y: number, x2: number, color: [number, number, number], widthPt = 0.75): string {
  const [r, g, b] = color;
  return `${r} ${g} ${b} RG ${widthPt} w\n${x1.toFixed(1)} ${y.toFixed(1)} m ${x2.toFixed(1)} ${y.toFixed(1)} l S\n`;
}

/**
 * Standard report header for every content page: a thin navy rule, a small
 * caps "eyebrow" label (e.g. "CHART 2 OF 6"), a bold title, an optional
 * gray meta subtitle, and a closing hairline -- the consulting-deck
 * convention of a consistent masthead instead of an ad hoc heading per page.
 */
function buildContentHeaderOps(eyebrow: string, title: string, subtitle?: string): { ops: string; bottomY: number } {
  let ops = '';
  let y = 760;
  ops += pdfRuleOp(MARGIN_X, y, PAGE_W - MARGIN_X, NAVY, 2);
  y -= 16;
  ops += pdfLabelOp(MARGIN_X, y, 8, eyebrow.toUpperCase(), true, NAVY_LIGHT);
  y -= 19;
  ops += pdfLabelOp(MARGIN_X, y, 15.5, pdfTruncate(title, 70), true, NAVY);
  y -= 10;
  if (subtitle) {
    y -= 10;
    ops += pdfLabelOp(MARGIN_X, y, 9, pdfTruncate(subtitle, 100), false, GRAY_MED, true);
  }
  y -= 10;
  ops += pdfRuleOp(MARGIN_X, y, PAGE_W - MARGIN_X, GRAY_LIGHT, 0.75);
  y -= 16;
  return { ops, bottomY: y };
}

/** A consistent footer on every page: confidentiality line + page number. */
function buildFooterOps(pageNum: number, totalPages: number, datasetName: string): string {
  const y = 34;
  let ops = pdfRuleOp(MARGIN_X, y + 14, PAGE_W - MARGIN_X, GRAY_LIGHT, 0.6);
  ops += pdfLabelOp(
    MARGIN_X,
    y,
    7.5,
    `PREPARED FOR LEADERSHIP REVIEW  |  ${pdfTruncate(datasetName || 'Dataset', 42).toUpperCase()}`,
    false,
    GRAY_MED
  );
  ops += pdfLabelOpRight(PAGE_W - MARGIN_X, y, 7.5, `Page ${pageNum} of ${totalPages}`, false, GRAY_MED);
  return ops;
}

/**
 * Builds raw PDF content-stream operators that draw a REAL chart -- filled
 * bars, columns, a donut/pie with legend, or a line/area plot -- inside the
 * box [x, x+w] x [yTop-h, yTop]. This is what turns the PDF export into an
 * actual visual dashboard instead of a page of numbers with ASCII "|" bars.
 */
function buildChartOps(vis: DashboardExportVisual, x: number, yTop: number, w: number, h: number): string {
  const items = (vis.items || []).filter((it) => Number.isFinite(it.value)).slice(0, 8);
  if (items.length === 0) return '';
  const type = (vis.type || '').toLowerCase();
  let ops = `${GRAY_LIGHT[0]} ${GRAY_LIGHT[1]} ${GRAY_LIGHT[2]} RG 0.75 w\n${x.toFixed(1)} ${(yTop - h).toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)} re S\n`;

  if (type === 'donut' || type === 'pie') {
    const total = items.reduce((acc, it) => acc + Math.abs(it.value), 0) || 1;
    const cx = x + w * 0.3;
    const cy = yTop - h / 2;
    const rOuter = Math.min(w * 0.3, h / 2) - 8;
    let angle = -Math.PI / 2;
    const segs = 48;
    items.forEach((it, i) => {
      const frac = Math.abs(it.value) / total;
      const sweep = frac * Math.PI * 2;
      const [r, g, b] = CHART_PALETTE[i % CHART_PALETTE.length];
      const steps = Math.max(2, Math.round(segs * frac));
      let path = `${r} ${g} ${b} rg\n${cx.toFixed(1)} ${cy.toFixed(1)} m\n`;
      for (let s = 0; s <= steps; s++) {
        const a = angle + (sweep * s) / steps;
        path += `${(cx + rOuter * Math.cos(a)).toFixed(1)} ${(cy + rOuter * Math.sin(a)).toFixed(1)} l\n`;
      }
      path += 'h f\n';
      ops += path;
      angle += sweep;
    });
    if (type === 'donut') {
      const rInner = rOuter * 0.55;
      let hole = `1 1 1 rg\n${(cx + rInner).toFixed(1)} ${cy.toFixed(1)} m\n`;
      for (let s = 0; s <= segs; s++) {
        const a = (Math.PI * 2 * s) / segs;
        hole += `${(cx + rInner * Math.cos(a)).toFixed(1)} ${(cy + rInner * Math.sin(a)).toFixed(1)} l\n`;
      }
      hole += 'h f\n';
      ops += hole;
    }
    const legendX = x + w * 0.58;
    let legendY = yTop - 14;
    items.forEach((it, i) => {
      const [r, g, b] = CHART_PALETTE[i % CHART_PALETTE.length];
      if (legendY < yTop - h + 10) return;
      ops += pdfRectOp(legendX, legendY - 7, 8, 8, [r, g, b]);
      ops += pdfLabelOp(
        legendX + 12,
        legendY - 6,
        8,
        `${pdfTruncate(it.category || '(Blank)', 20)}  (${it.percentage})`,
        false,
        [r, g, b]
      );
      legendY -= 16;
    });
  } else if (type === 'line_area' || type === 'line' || type === 'area') {
    const vals = items.map((it) => it.value);
    const maxVal = Math.max(...vals, 0);
    const minVal = Math.min(...vals, 0);
    const range = maxVal - minVal || 1;
    const plotX = x + 8;
    const plotW = w - 16;
    const baseY = yTop - h + 14;
    const plotH = h - 28;
    const stepX = items.length > 1 ? plotW / (items.length - 1) : 0;
    const pts = items.map((it, i) => ({
      x: plotX + stepX * i,
      y: baseY + ((it.value - minVal) / range) * plotH,
    }));
    const [r, g, b] = CHART_PALETTE[0];
    let area = `${(r * 0.25 + 0.75).toFixed(2)} ${(g * 0.25 + 0.75).toFixed(2)} ${(b * 0.25 + 0.75).toFixed(2)} rg\n`;
    area += `${pts[0].x.toFixed(1)} ${baseY.toFixed(1)} m\n`;
    pts.forEach((p) => (area += `${p.x.toFixed(1)} ${p.y.toFixed(1)} l\n`));
    area += `${pts[pts.length - 1].x.toFixed(1)} ${baseY.toFixed(1)} l\nh f\n`;
    ops += area;
    let line = `${r} ${g} ${b} RG 2 w\n${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)} m\n`;
    pts.slice(1).forEach((p) => (line += `${p.x.toFixed(1)} ${p.y.toFixed(1)} l\n`));
    line += 'S\n';
    ops += line;
    pts.forEach((p) => {
      ops += pdfRectOp(p.x - 2, p.y - 2, 4, 4, [r, g, b]);
    });
    const maxIdx = vals.indexOf(maxVal);
    Array.from(new Set([0, maxIdx, pts.length - 1])).forEach((idx) => {
      if (idx < 0 || idx >= pts.length) return;
      ops += pdfLabelOp(pts[idx].x - 10, pts[idx].y + 8, 7, Number(items[idx].value).toLocaleString(), false, [r, g, b]);
    });
    ops += pdfLabelOp(pts[0].x - 10, baseY - 11, 6.5, pdfTruncate(items[0].category, 10), false, [r, g, b]);
    ops += pdfLabelOp(
      pts[pts.length - 1].x - 10,
      baseY - 11,
      6.5,
      pdfTruncate(items[items.length - 1].category, 10),
      false,
      [r, g, b]
    );
  } else if (type === 'funnel') {
    const maxVal = Math.max(...items.map((it) => Math.abs(it.value)), 1);
    const rowH = h / items.length;
    const midX = x + w / 2;
    items.forEach((it, i) => {
      const frac = Math.abs(it.value) / maxVal;
      const barW = Math.max(w * 0.12, w * 0.9 * frac);
      const barX = midX - barW / 2;
      const barY = yTop - (i + 1) * rowH + rowH * 0.15;
      const barH = rowH * 0.7;
      const [r, g, b] = CHART_PALETTE[i % CHART_PALETTE.length];
      ops += pdfRectOp(barX, barY, barW, barH, [r, g, b]);
      // White text on top of the solid-colored bar for contrast.
      ops += pdfLabelOp(
        midX - 60,
        barY + barH / 2 - 3,
        8,
        `${pdfTruncate(it.category, 16)}: ${Number(it.value).toLocaleString()}`,
        true,
        WHITE
      );
    });
  } else if (type === 'column') {
    const maxVal = Math.max(...items.map((it) => Math.abs(it.value)), 1);
    const n = items.length;
    const colW = (w / n) * 0.55;
    const gap = w / n - colW;
    const baseY = yTop - h + 18;
    items.forEach((it, i) => {
      const barX = x + gap / 2 + i * (w / n);
      const barH = (Math.abs(it.value) / maxVal) * (h - 36);
      const [r, g, b] = CHART_PALETTE[i % CHART_PALETTE.length];
      ops += pdfRectOp(barX, baseY, colW, barH, [r, g, b]);
      ops += pdfLabelOp(barX, baseY + barH + 4, 7, Number(it.value).toLocaleString(), true, [r, g, b]);
      ops += pdfLabelOp(barX - 2, yTop - h + 5, 6.5, pdfTruncate(it.category || '(Blank)', 10), false, [r, g, b]);
    });
  } else {
    // BAR, CLUSTERED_BAR, and any other category/value visual -> horizontal bars.
    const maxVal = Math.max(...items.map((it) => Math.abs(it.value)), 1);
    const n = items.length;
    const rowH = h / n;
    const labelW = 150;
    const barAreaX = x + labelW;
    const barAreaW = w - labelW - 70;
    items.forEach((it, i) => {
      const barY = yTop - (i + 1) * rowH + rowH * 0.18;
      const barH = rowH * 0.64;
      const barW = Math.max(2, (Math.abs(it.value) / maxVal) * barAreaW);
      const [r, g, b] = CHART_PALETTE[i % CHART_PALETTE.length];
      ops += pdfLabelOp(x, barY + barH / 2 - 3, 8, pdfTruncate(it.category || '(Blank)', 22), false, [r, g, b]);
      ops += pdfRectOp(barAreaX, barY, barW, barH, [r, g, b]);
      ops += pdfLabelOp(barAreaX + barW + 6, barY + barH / 2 - 3, 7.5, Number(it.value).toLocaleString(), false, [r, g, b]);
    });
  }

  return ops;
}

/** A light "key insight" callout -- the consulting-deck habit of stating
 * the takeaway in words, not just showing the chart and letting the reader
 * work it out. Only drawn when the dashboard actually computed one. */
function buildInsightCalloutOps(x: number, yTop: number, w: number, insight: string): { ops: string; height: number } {
  const h = 30;
  let ops = pdfRectOp(x, yTop - h, w, h, GRAY_FAINT);
  ops += pdfRectOp(x, yTop - h, 3, h, GOLD);
  ops += pdfLabelOp(x + 14, yTop - 13, 7.5, 'KEY INSIGHT', true, NAVY);
  ops += pdfLabelOp(x + 14, yTop - 24, 9, pdfTruncate(insight, 110), false, SLATE, true);
  return { ops, height: h };
}

/** A 2-column grid of bordered KPI "stat cards" -- label, big number, one
 * line of context -- instead of a numbered text list. */
function buildKpiCardsOps(kpis: DashboardExportKpi[], x: number, yTop: number, w: number): { ops: string; height: number } {
  const cols = 2;
  const gap = 14;
  const cardW = (w - gap * (cols - 1)) / cols;
  const cardH = 78;
  const rows = Math.ceil(kpis.length / cols);
  let ops = '';
  kpis.forEach((k, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cardX = x + col * (cardW + gap);
    const cardY = yTop - (row + 1) * cardH - row * gap;
    ops += pdfRectOp(cardX, cardY, cardW, cardH, GRAY_FAINT);
    ops += pdfRectOp(cardX, cardY, 3, cardH, NAVY);
    ops += `${GRAY_LIGHT[0]} ${GRAY_LIGHT[1]} ${GRAY_LIGHT[2]} RG 0.6 w\n${cardX.toFixed(1)} ${cardY.toFixed(1)} ${cardW.toFixed(1)} ${cardH.toFixed(1)} re S\n`;
    ops += pdfLabelOp(cardX + 14, cardY + cardH - 18, 7.5, pdfTruncate(k.title.toUpperCase(), 34), true, GRAY_MED);
    ops += pdfLabelOp(cardX + 14, cardY + cardH - 42, 19, pdfTruncate(k.formattedValue, 18), true, NAVY);
    ops += pdfLabelOp(cardX + 14, cardY + 16, 6.5, `${k.aggFunc.toUpperCase()} OF ${k.column}`, false, GRAY_MED);
    if (k.subtitle) {
      ops += pdfLabelOp(cardX + 14, cardY + 6, 7, pdfTruncate(k.subtitle, 50), false, GRAY_MED, true);
    }
  });
  return { ops, height: rows * cardH + (rows - 1) * gap };
}

type PdfTableColumn = { label: string; width: number; align: 'left' | 'right' };

/** A real ruled table with proportional columns (header rule + bottom
 * rule, no fills, right-aligned numeric columns) -- a plain monospace-
 * padded text block reads as a terminal dump, not a leadership report. */
function buildTableOps(
  columns: PdfTableColumn[],
  rows: string[][],
  x: number,
  yTop: number
): { ops: string; height: number } {
  const headerSize = 8;
  const rowSize = 8;
  const rowH = 14.5;
  let ops = '';
  let y = yTop;
  const colStarts: number[] = [];
  let cx = x;
  columns.forEach((c) => {
    colStarts.push(cx);
    cx += c.width;
  });
  const tableRight = cx;

  columns.forEach((c, i) => {
    if (c.align === 'right') {
      ops += pdfLabelOpRight(colStarts[i] + c.width, y, headerSize, c.label.toUpperCase(), true, NAVY);
    } else {
      ops += pdfLabelOp(colStarts[i], y, headerSize, c.label.toUpperCase(), true, NAVY);
    }
  });
  y -= 6;
  ops += pdfRuleOp(x, y, tableRight, NAVY, 1.1);
  y -= 12;

  rows.forEach((row) => {
    columns.forEach((c, i) => {
      const text = row[i] || '';
      if (c.align === 'right') {
        ops += pdfLabelOpRight(colStarts[i] + c.width, y, rowSize, text, false, SLATE);
      } else {
        ops += pdfLabelOp(colStarts[i], y, rowSize, text, false, SLATE);
      }
    });
    y -= rowH;
  });

  y += rowH - 9;
  ops += pdfRuleOp(x, y, tableRight, GRAY_LIGHT, 0.6);
  const height = yTop - y + 4;
  return { ops, height };
}

export function createDashboardPdfBlob(data: DashboardExportData): Blob {
  // Build every page's body content first (without header/footer chrome,
  // since the footer needs the final page count, which we only know once
  // every page is assembled).
  const bodyPages: Array<PdfPageItem[]> = [];

  // Page 1: cover page, styled like the title page of a report handed to
  // a leadership team -- a navy masthead, scope/date metadata, and a
  // contents list -- rather than a plain heading.
  {
    const bandH = 118;
    let ops = pdfRectOp(0, PAGE_H - bandH, PAGE_W, bandH, NAVY);
    ops += pdfRectOp(0, PAGE_H - bandH - 3, PAGE_W, 3, GOLD);
    ops += pdfLabelOp(MARGIN_X, PAGE_H - 54, 21, pdfTruncate(data.title || 'Executive Dashboard', 46), true, WHITE);
    ops += pdfLabelOp(MARGIN_X, PAGE_H - 75, 10, 'EXECUTIVE DASHBOARD  |  REVENUE INTELLIGENCE REPORT', false, [0.78, 0.82, 0.89]);
    ops += pdfLabelOp(MARGIN_X, PAGE_H - 96, 9, `Dataset: ${data.datasetName}`, false, [0.78, 0.82, 0.89]);

    let y = PAGE_H - bandH - 36;
    ops += pdfLabelOp(
      MARGIN_X,
      y,
      9.5,
      `Scope: ${data.filteredRowCount.toLocaleString()} of ${data.totalRowCount.toLocaleString()} records (filtered view)`,
      false,
      SLATE
    );
    y -= 16;
    ops += pdfLabelOp(
      MARGIN_X,
      y,
      9.5,
      `Prepared: ${new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}`,
      false,
      SLATE
    );
    y -= 26;
    ops += pdfRuleOp(MARGIN_X, y, PAGE_W - MARGIN_X, GRAY_LIGHT, 0.75);
    y -= 24;
    ops += pdfLabelOp(MARGIN_X, y, 10.5, 'CONTENTS', true, NAVY);
    y -= 20;
    const visualCount = data.visuals?.length || 0;
    const contents = ['1.  Executive Summary & Key Performance Indicators'];
    if (visualCount > 0) {
      contents.push(`2${visualCount > 1 ? `-${1 + visualCount}` : ''}.  Detailed Visual Analysis (${visualCount} chart${visualCount === 1 ? '' : 's'})`);
    }
    if (data.steps && data.steps.length > 0) {
      contents.push(`${2 + visualCount}.  Appendix: Data Lineage & Methodology`);
    }
    contents.forEach((line) => {
      ops += pdfLabelOp(MARGIN_X + 4, y, 9.5, line, false, SLATE);
      y -= 16;
    });

    bodyPages.push([{ kind: 'raw', ops }]);
  }

  // Page 2: Executive Summary -- KPI cards, not a numbered text list.
  {
    const header = buildContentHeaderOps(
      'Executive Summary',
      'Key Performance Indicators',
      `Core metrics computed across the active filtered view of ${data.datasetName}`
    );
    const items: PdfPageItem[] = [{ kind: 'raw', ops: header.ops, consumesHeight: 745 - header.bottomY }];
    if (data.kpis && data.kpis.length > 0) {
      const cards = buildKpiCardsOps(data.kpis, MARGIN_X, header.bottomY, CONTENT_W);
      items.push({ kind: 'raw', ops: cards.ops, consumesHeight: cards.height });
    } else {
      items.push({ kind: 'raw', ops: pdfLabelOp(MARGIN_X, header.bottomY - 10, 9.5, 'No KPI cards are configured on this dashboard.', false, GRAY_MED) });
    }
    bodyPages.push(items);
  }

  // Pages 3+: one real chart per visual, its key-insight callout (when the
  // dashboard computed one), and its detailed data table.
  if (data.visuals && data.visuals.length > 0) {
    for (let i = 0; i < data.visuals.length; i++) {
      const vis = data.visuals[i];
      const header = buildContentHeaderOps(
        `Chart ${i + 1} of ${data.visuals.length}`,
        vis.title,
        `${vis.type.toUpperCase()}  |  Grouped by "${vis.categoryCol}"  |  Measure: ${vis.aggFunc.toUpperCase()}("${vis.valueCol}")`
      );
      let cursorY = header.bottomY;
      const pVis: PdfPageItem[] = [{ kind: 'raw', ops: header.ops, consumesHeight: 745 - header.bottomY }];

      if (vis.insight) {
        const callout = buildInsightCalloutOps(MARGIN_X, cursorY, CONTENT_W, vis.insight);
        pVis.push({ kind: 'raw', ops: callout.ops, consumesHeight: callout.height + 14 });
        cursorY -= callout.height + 14;
      }

      const isTabular = vis.type === 'table' || vis.type === 'matrix';
      if (!isTabular && vis.items && vis.items.length > 0) {
        const chartTop = cursorY;
        const chartH = 176;
        const ops = buildChartOps(vis, MARGIN_X, chartTop, CONTENT_W, chartH);
        if (ops) {
          const consumesHeight = chartH + 22;
          pVis.push({ kind: 'raw', ops, consumesHeight });
          cursorY -= consumesHeight;
        }
      }

      pVis.push({ kind: 'raw', ops: pdfLabelOp(MARGIN_X, cursorY, 9, 'DETAILED DATA', true, NAVY), consumesHeight: 16 });
      cursorY -= 16;

      const tableRows = vis.items.slice(0, 15).map((item) => [
        pdfTruncate(item.category || '(Blank)', 42),
        Number(item.value).toLocaleString(),
        item.percentage || '0.0%',
      ]);
      const table = buildTableOps(
        [
          { label: 'Category', width: 290, align: 'left' },
          { label: 'Value', width: 120, align: 'right' },
          { label: 'Share %', width: 94, align: 'right' },
        ],
        tableRows,
        MARGIN_X,
        cursorY
      );
      pVis.push({ kind: 'raw', ops: table.ops, consumesHeight: table.height + 12 });
      cursorY -= table.height + 12;

      const totalVal = vis.items.reduce((acc, x) => acc + x.value, 0);
      pVis.push({
        kind: 'raw',
        ops: pdfLabelOp(
          MARGIN_X,
          cursorY,
          9,
          `Total: ${Number(totalVal).toLocaleString()} across ${vis.items.length} categor${vis.items.length === 1 ? 'y' : 'ies'}`,
          true,
          NAVY
        ),
      });

      bodyPages.push(pVis);
    }
  }

  // Final page: Appendix -- data lineage & methodology (if any transform
  // steps were applied to produce this dataset).
  if (data.steps && data.steps.length > 0) {
    const header = buildContentHeaderOps(
      'Appendix',
      'Data Lineage & Methodology',
      `Transformation steps applied to produce ${data.datasetName}`
    );
    let cursorY = header.bottomY;
    const items: PdfPageItem[] = [{ kind: 'raw', ops: header.ops, consumesHeight: 745 - header.bottomY }];
    data.steps.forEach((s, idx) => {
      const line = `${idx + 1}.  [${String(s.type || '').toUpperCase()}]  ${s.label || s.id}`;
      items.push({ kind: 'raw', ops: pdfLabelOp(MARGIN_X, cursorY, 9, pdfTruncate(line, 95), false, SLATE), consumesHeight: 15 });
      cursorY -= 15;
    });
    bodyPages.push(items);
  }

  // Second pass: now that the final page count is known, prepend/append
  // the consistent header/footer chrome to every page.
  const totalPages = bodyPages.length;
  const pages: Array<PdfPageItem[]> = bodyPages.map((items, idx) => [
    ...items,
    { kind: 'raw', ops: buildFooterOps(idx + 1, totalPages, data.datasetName) },
  ]);

  return createMultiPagePdfBlob(pages);
}

export function createDashboardExcelXml(data: DashboardExportData): Blob {
  const dsTitle = data.title || 'Executive Dashboard';
  const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal">
   <Alignment ss:Vertical="Bottom"/>
   <Font ss:FontName="Calibri" ss:Size="11" ss:Color="#000000"/>
  </Style>
  <Style ss:ID="Title">
   <Font ss:FontName="Calibri" ss:Size="16" ss:Bold="1" ss:Color="#185C37"/>
  </Style>
  <Style ss:ID="Subtitle">
   <Font ss:FontName="Calibri" ss:Size="10" ss:Italic="1" ss:Color="#605E5C"/>
  </Style>
  <Style ss:ID="SectionHeader">
   <Font ss:FontName="Calibri" ss:Size="12" ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#217346" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="SubHeader">
   <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#185C37" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="TableHeader">
   <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#2B579A" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="KpiVal">
   <Font ss:FontName="Calibri" ss:Size="13" ss:Bold="1" ss:Color="#217346"/>
  </Style>
 </Styles>

 <Worksheet ss:Name="Dashboard Summary">
  <Table>
   <Row ss:StyleID="Title"><Cell><Data ss:Type="String">${escapeXml(dsTitle)}</Data></Cell></Row>
   <Row ss:StyleID="Subtitle"><Cell><Data ss:Type="String">Dataset: ${escapeXml(data.datasetName)} | Filtered Records: ${data.filteredRowCount} of ${data.totalRowCount} | Generated: ${new Date().toLocaleString()}</Data></Cell></Row>
   <Row/>

   <!-- KPI SCORECARD -->
   <Row ss:StyleID="SectionHeader"><Cell><Data ss:Type="String">KEY PERFORMANCE INDICATORS (KPIs)</Data></Cell><Cell/><Cell/><Cell/><Cell/></Row>
   <Row ss:StyleID="SubHeader">
    <Cell><Data ss:Type="String">KPI Title</Data></Cell>
    <Cell><Data ss:Type="String">Value</Data></Cell>
    <Cell><Data ss:Type="String">Calculation</Data></Cell>
    <Cell><Data ss:Type="String">Target Field</Data></Cell>
    <Cell><Data ss:Type="String">Context</Data></Cell>
   </Row>
   ${(data.kpis || [])
     .map(
       (k) => `   <Row>
    <Cell><Data ss:Type="String">${escapeXml(k.title)}</Data></Cell>
    <Cell ss:StyleID="KpiVal"><Data ss:Type="String">${escapeXml(k.formattedValue)}</Data></Cell>
    <Cell><Data ss:Type="String">${escapeXml(k.aggFunc.toUpperCase())}</Data></Cell>
    <Cell><Data ss:Type="String">${escapeXml(k.column)}</Data></Cell>
    <Cell><Data ss:Type="String">${escapeXml(k.subtitle)}</Data></Cell>
   </Row>`
     )
     .join('\n')}
   <Row/>

   <!-- VISUALIZATIONS -->
   <Row ss:StyleID="SectionHeader"><Cell><Data ss:Type="String">VISUALIZATION CHARTS &amp; SUMMARY TABLES</Data></Cell><Cell/><Cell/><Cell/><Cell/></Row>
   ${(data.visuals || [])
     .map(
       (v) => `   <Row ss:StyleID="TableHeader">
    <Cell><Data ss:Type="String">${escapeXml(v.title)} [${escapeXml(v.type.toUpperCase())}] — Dimension: ${escapeXml(v.categoryCol)} | Measure: ${escapeXml(v.aggFunc)}(${escapeXml(v.valueCol)})</Data></Cell>
    <Cell/><Cell/><Cell/>
   </Row>
   <Row ss:StyleID="Default">
    <Cell><Data ss:Type="String">Category</Data></Cell>
    <Cell><Data ss:Type="String">Metric Value</Data></Cell>
    <Cell><Data ss:Type="String">Share %</Data></Cell>
    <Cell><Data ss:Type="String">Count</Data></Cell>
   </Row>
   ${v.items
     .map(
       (it) => `   <Row>
    <Cell><Data ss:Type="String">${escapeXml(it.category)}</Data></Cell>
    <Cell><Data ss:Type="Number">${it.value}</Data></Cell>
    <Cell><Data ss:Type="String">${escapeXml(it.percentage)}</Data></Cell>
    <Cell><Data ss:Type="Number">${it.count}</Data></Cell>
   </Row>`
     )
     .join('\n')}
   <Row/>`
     )
     .join('\n')}
  </Table>
 </Worksheet>

 <Worksheet ss:Name="Underlying Data">
  <Table>
   <Row ss:StyleID="SubHeader">
    ${(data.columns || []).map((c) => `<Cell><Data ss:Type="String">${escapeXml(c)}</Data></Cell>`).join('')}
   </Row>
   ${(data.rows || [])
     .map(
       (r) => `   <Row>
    ${(data.columns || [])
      .map((c) => {
        const v = r[c];
        const isNum = typeof v === 'number' || (!isNaN(Number(v)) && v !== '' && v !== null);
        const valStr = v === null || v === undefined ? '' : escapeXml(v);
        return isNum && v !== '' && v !== null
          ? `<Cell><Data ss:Type="Number">${v}</Data></Cell>`
          : `<Cell><Data ss:Type="String">${valStr}</Data></Cell>`;
      })
      .join('')}
   </Row>`
     )
     .join('\n')}
  </Table>
 </Worksheet>

 <Worksheet ss:Name="Pipeline Lineage">
  <Table>
   <Row ss:StyleID="SubHeader">
    <Cell><Data ss:Type="String">Step #</Data></Cell>
    <Cell><Data ss:Type="String">Type</Data></Cell>
    <Cell><Data ss:Type="String">Label</Data></Cell>
   </Row>
   ${(data.steps || [])
     .map(
       (s, i) => `   <Row>
    <Cell><Data ss:Type="Number">${i + 1}</Data></Cell>
    <Cell><Data ss:Type="String">${escapeXml(s.type)}</Data></Cell>
    <Cell><Data ss:Type="String">${escapeXml(s.label || s.id)}</Data></Cell>
   </Row>`
     )
     .join('\n')}
  </Table>
 </Worksheet>
</Workbook>`;

  return new Blob([xml], { type: 'application/vnd.ms-excel' });
}

export function createDashboardPresentationBlob(data: DashboardExportData): Blob {
  const dsTitle = data.title || 'Executive Dashboard';

  const slideDeckHtml = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeXml(dsTitle)} — Presentation Deck</title>
  <style>
    body { font-family: Calibri, Aptos, sans-serif; margin: 0; background: #0F172A; color: #F8FAFC; overflow-x: hidden; }
    .slide { width: 100vw; height: 100vh; box-sizing: border-box; padding: 48px 64px; display: flex; flex-direction: column; justify-content: space-between; border-bottom: 2px solid #334155; }
    .header { font-size: 32px; font-weight: bold; color: #34D399; margin-bottom: 8px; }
    .subheader { font-size: 16px; color: #94A3B8; margin-bottom: 32px; }
    .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 20px; }
    .kpi-card { background: #1E293B; border: 1px solid #334155; border-radius: 12px; padding: 24px; border-left: 6px solid #10B981; }
    .kpi-title { font-size: 14px; text-transform: uppercase; color: #94A3B8; font-weight: 600; }
    .kpi-val { font-size: 36px; font-weight: 800; color: #F8FAFC; margin: 12px 0; font-family: monospace; }
    .kpi-sub { font-size: 12px; color: #64748B; }
    .table-container { background: #1E293B; border-radius: 12px; border: 1px solid #334155; overflow: hidden; }
    table { width: 100%; border-collapse: collapse; text-align: left; font-size: 14px; }
    th { background: #0F766E; color: white; padding: 12px 16px; font-weight: bold; }
    td { padding: 10px 16px; border-bottom: 1px solid #334155; }
    .bar { height: 12px; background: #10B981; border-radius: 4px; }
    .footer { font-size: 12px; color: #64748B; text-align: right; }
  </style>
</head>
<body>
  <!-- Slide 1: Title -->
  <div class="slide" style="justify-content: center; align-items: center; text-align: center;">
    <div>
      <div style="font-size: 48px; font-weight: 900; color: #34D399; margin-bottom: 16px;">${escapeXml(dsTitle)}</div>
      <div style="font-size: 20px; color: #94A3B8; margin-bottom: 32px;">Executive Business Intelligence Deck • StepSheet</div>
      <div style="display: inline-block; background: #1E293B; padding: 12px 24px; border-radius: 8px; font-size: 14px; color: #CBD5E1;">
        Dataset: <strong>${escapeXml(data.datasetName)}</strong> &bull; Records: <strong>${data.filteredRowCount}</strong> &bull; Generated: ${new Date().toLocaleDateString()}
      </div>
    </div>
  </div>

  <!-- Slide 2: KPIs -->
  <div class="slide">
    <div>
      <div class="header">Executive KPIs &amp; Performance Metrics</div>
      <div class="subheader">Core high-level summary cards across active business operations</div>
      <div class="kpi-grid">
        ${(data.kpis || [])
          .map(
            (k) => `        <div class="kpi-card">
          <div class="kpi-title">${escapeXml(k.title)}</div>
          <div class="kpi-val">${escapeXml(k.formattedValue)}</div>
          <div class="kpi-sub">${escapeXml(k.aggFunc.toUpperCase())} of ${escapeXml(k.column)} &bull; ${escapeXml(k.subtitle)}</div>
        </div>`
          )
          .join('\n')}
      </div>
    </div>
    <div class="footer">StepSheet Presentation Deck &bull; Slide 2 of ${2 + (data.visuals?.length || 0)}</div>
  </div>

  <!-- Subsequent Slides: Visual Charts -->
  ${(data.visuals || [])
    .map((v, idx) => {
      const maxVal = Math.max(1, ...v.items.map((x) => Math.abs(x.value)));
      return `  <div class="slide">
    <div>
      <div class="header">${escapeXml(v.title)}</div>
      <div class="subheader">Visual Type: <strong>${escapeXml(v.type.toUpperCase())}</strong> &bull; Dimension: <strong>${escapeXml(v.categoryCol)}</strong> &bull; Measure: <strong>${escapeXml(v.aggFunc)}(${escapeXml(v.valueCol)})</strong></div>
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>Category</th>
              <th style="text-align: right;">Metric Value</th>
              <th style="text-align: right;">Share %</th>
              <th style="width: 35%;">Distribution</th>
            </tr>
          </thead>
          <tbody>
            ${v.items
              .slice(0, 10)
              .map(
                (it) => `            <tr>
              <td><strong>${escapeXml(it.category)}</strong></td>
              <td style="text-align: right; font-family: monospace;">${Number(it.value).toLocaleString()}</td>
              <td style="text-align: right; font-weight: bold; color: #34D399;">${escapeXml(it.percentage)}</td>
              <td><div class="bar" style="width: ${Math.max(4, Math.round((Math.abs(it.value) / maxVal) * 100))}%;"></div></td>
            </tr>`
              )
              .join('\n')}
          </tbody>
        </table>
      </div>
    </div>
    <div class="footer">StepSheet Presentation Deck &bull; Slide ${3 + idx} of ${2 + (data.visuals?.length || 0)}</div>
  </div>`;
    })
    .join('\n')}
</body>
</html>`;

  const slide1Text = [
    `=== SLIDE 1: COVER SLIDE ===`,
    `Title: ${dsTitle}`,
    `Subtitle: Executive Business Intelligence Deck`,
    `Dataset: ${data.datasetName}`,
    `Active Records: ${data.filteredRowCount} of ${data.totalRowCount}`,
    `Date: ${new Date().toLocaleString()}`,
  ].join('\n');

  const slide2Text = [
    `=== SLIDE 2: EXECUTIVE KPI SCORECARD ===`,
    ...(data.kpis || []).map(
      (k, i) =>
        `[KPI ${i + 1}] ${k.title}: ${k.formattedValue} (${k.aggFunc.toUpperCase()} of ${k.column}) - ${k.subtitle}`
    ),
  ].join('\n');

  const visualSlidesText = (data.visuals || [])
    .map((v, i) =>
      [
        `=== SLIDE ${3 + i}: ${v.title} [${v.type.toUpperCase()}] ===`,
        `Dimension: ${v.categoryCol} | Measure: ${v.aggFunc}(${v.valueCol})`,
        `------------------------------------------------------------`,
        `Category                 Value            Share %`,
        ...v.items.map(
          (it) =>
            `${it.category.slice(0, 20).padEnd(24)} ${Number(it.value).toLocaleString().padStart(12)} ${it.percentage.padStart(8)}`
        ),
      ].join('\n')
    )
    .join('\n\n');

  const readme = [
    `StepSheet Presentation Pack: ${dsTitle}`,
    `========================================`,
    `This is an HTML slide deck, not a native PowerPoint (.pptx) file.`,
    `It will not open in Microsoft PowerPoint.`,
    ``,
    `To present:`,
    `1. Open presentation.html in any browser (Chrome, Edge, Safari).`,
    `2. Press F11 for full-screen presentation mode.`,
    ``,
    `Also included:`,
    `- slide1_cover.txt, slide2_kpi_scorecard.txt, visual_slides.txt`,
    `  Plain-text versions of each slide's content, handy for pasting`,
    `  into an existing PowerPoint deck if you need a real .pptx file.`,
  ].join('\n');

  return createZipBlob([
    { name: 'presentation.html', content: slideDeckHtml },
    { name: 'slide1_cover.txt', content: slide1Text },
    { name: 'slide2_kpi_scorecard.txt', content: slide2Text },
    { name: 'visual_slides.txt', content: visualSlidesText },
    { name: 'README.txt', content: readme },
  ]);
}

export function createDashboardSswbJsonBlob(data: DashboardExportData): Blob {
  const jsonStr = JSON.stringify(
    {
      title: data.title || 'Executive Dashboard',
      datasetName: data.datasetName || 'Dataset',
      kpis: data.kpis || [],
      visuals: data.visuals || [],
      rows: (data.rows || []).slice(0, 10000),
      columns: data.columns || [],
      steps: data.steps || [],
      filteredRowCount: data.filteredRowCount,
      totalRowCount: data.totalRowCount,
      exportedAt: new Date().toISOString(),
    },
    null,
    2
  );
  return new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
}

export function createDashboardSswbHtmlBlob(data: DashboardExportData): Blob {
  const dsTitle = data.title || 'Executive Dashboard';
  const dsName = data.datasetName || 'Dataset';
  const eTitle = escapeXml(dsTitle);
  const eDsName = escapeXml(dsName);
  const stepsCount = (data.steps || []).length;
  const filteredCount = data.filteredRowCount || (data.rows || []).length;

  const safeDataJson = JSON.stringify({
    title: dsTitle,
    datasetName: dsName,
    kpis: data.kpis || [],
    visuals: data.visuals || [],
    rows: (data.rows || []).slice(0, 10000),
    columns: data.columns || [],
    steps: data.steps || [],
    filteredRowCount: data.filteredRowCount,
    totalRowCount: data.totalRowCount,
    exportedAt: new Date().toISOString(),
  }).replace(/<\//g, '<\\/');

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${eTitle} — StepSheet Packaged Workbook</title>
  <style>
    :root {
      --primary: #185C37;
      --primary-dark: #124629;
      --primary-light: #E6F2EB;
      --accent: #217346;
      --bg: #F4F6F8;
      --card-bg: #FFFFFF;
      --text-main: #1E293B;
      --text-muted: #64748B;
      --border: #E2E8F0;
      --border-dark: #CBD5E1;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Aptos, Calibri, sans-serif;
      background: var(--bg);
      color: var(--text-main);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    .topbar {
      background: var(--primary);
      color: white;
      padding: 10px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      box-shadow: 0 2px 8px rgba(0,0,0,0.15);
      position: sticky;
      top: 0;
      z-index: 100;
    }
    .brand-section {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .brand-icon {
      width: 32px;
      height: 32px;
      background: rgba(255,255,255,0.2);
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      font-size: 16px;
      border: 1px solid rgba(255,255,255,0.3);
    }
    .brand-title {
      font-size: 16px;
      font-weight: 800;
      letter-spacing: -0.3px;
    }
    .brand-badge {
      background: #10B981;
      color: #064E3B;
      font-size: 10px;
      font-weight: 800;
      padding: 2px 8px;
      border-radius: 4px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .topbar-meta {
      font-size: 12px;
      opacity: 0.9;
    }
    .topbar-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .btn {
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      border: 1px solid transparent;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: all 0.15s ease;
      text-decoration: none;
    }
    .btn-light {
      background: white;
      color: var(--primary);
      border-color: rgba(255,255,255,0.8);
    }
    .btn-light:hover {
      background: #F1F5F9;
    }
    .btn-outline {
      background: rgba(255,255,255,0.12);
      color: white;
      border-color: rgba(255,255,255,0.25);
    }
    .btn-outline:hover {
      background: rgba(255,255,255,0.2);
    }

    .nav-tabs {
      background: white;
      border-bottom: 1px solid var(--border);
      padding: 0 24px;
      display: flex;
      gap: 8px;
    }
    .nav-tab {
      padding: 12px 18px;
      font-size: 13px;
      font-weight: 600;
      color: var(--text-muted);
      cursor: pointer;
      border-bottom: 2px solid transparent;
      transition: all 0.15s ease;
    }
    .nav-tab:hover {
      color: var(--text-main);
    }
    .nav-tab.active {
      color: var(--primary);
      border-bottom-color: var(--primary);
    }

    .container {
      max-width: 1480px;
      width: 100%;
      margin: 0 auto;
      padding: 20px 24px 48px;
      flex: 1;
    }

    .slicer-card {
      background: white;
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 14px 18px;
      margin-bottom: 20px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.03);
    }
    .slicer-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 10px;
    }
    .slicer-title {
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      color: var(--text-muted);
    }
    .slicer-clear {
      font-size: 11px;
      font-weight: 700;
      color: var(--primary);
      background: none;
      border: none;
      cursor: pointer;
    }
    .slicer-clear:hover {
      text-decoration: underline;
    }
    .slicer-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      max-height: 90px;
      overflow-y: auto;
    }
    .chip {
      padding: 4px 10px;
      border-radius: 20px;
      font-size: 11px;
      font-weight: 600;
      background: #F1F5F9;
      color: #334155;
      border: 1px solid var(--border);
      cursor: pointer;
      transition: all 0.12s ease;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .chip:hover {
      background: #E2E8F0;
    }
    .chip.selected {
      background: var(--primary);
      color: white;
      border-color: var(--primary-dark);
    }
    .chip-count {
      font-size: 9px;
      opacity: 0.75;
    }

    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }
    .kpi-card {
      background: white;
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 16px 20px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.03);
      position: relative;
      overflow: hidden;
      border-left: 5px solid var(--accent);
    }
    .kpi-title {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      color: var(--text-muted);
      letter-spacing: 0.5px;
    }
    .kpi-value {
      font-size: 28px;
      font-weight: 800;
      color: var(--text-main);
      margin: 8px 0 4px;
      font-family: monospace;
    }
    .kpi-sub {
      font-size: 11px;
      color: var(--text-muted);
    }

    .visuals-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(480px, 1fr));
      gap: 20px;
    }
    .visual-card {
      background: white;
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 18px 20px;
      box-shadow: 0 1px 4px rgba(0,0,0,0.04);
      display: flex;
      flex-direction: column;
    }
    .visual-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 14px;
      padding-bottom: 10px;
      border-bottom: 1px solid #F1F5F9;
    }
    .visual-title {
      font-size: 14px;
      font-weight: 700;
      color: #0F172A;
    }
    .visual-badge {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      background: var(--primary-light);
      color: var(--primary);
      padding: 2px 8px;
      border-radius: 4px;
      border: 1px solid rgba(24,92,55,0.2);
    }
    .chart-container {
      flex: 1;
      min-height: 240px;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }

    svg.chart-svg {
      width: 100%;
      height: 240px;
      overflow: visible;
    }
    .bar-rect {
      fill: var(--accent);
      transition: fill 0.2s;
    }
    .bar-rect:hover {
      fill: var(--primary-dark);
    }
    .axis-text {
      font-size: 10px;
      fill: #64748B;
    }
    .val-text {
      font-size: 10px;
      font-weight: bold;
      fill: #1E293B;
    }

    .table-card {
      background: white;
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 18px 20px;
      box-shadow: 0 1px 4px rgba(0,0,0,0.04);
    }
    .table-toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 16px;
      flex-wrap: wrap;
    }
    .search-input {
      padding: 8px 14px;
      border: 1px solid var(--border);
      border-radius: 6px;
      font-size: 13px;
      min-width: 280px;
      outline: none;
    }
    .search-input:focus {
      border-color: var(--primary);
    }
    .table-responsive {
      overflow-x: auto;
      max-height: 600px;
      border: 1px solid var(--border);
      border-radius: 8px;
    }
    table.data-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
      text-align: left;
    }
    table.data-table th {
      background: #F8FAFC;
      color: #334155;
      padding: 10px 14px;
      font-weight: 700;
      border-bottom: 2px solid var(--border);
      cursor: pointer;
      user-select: none;
      white-space: nowrap;
      position: sticky;
      top: 0;
      z-index: 10;
    }
    table.data-table th:hover {
      background: #F1F5F9;
    }
    table.data-table td {
      padding: 8px 14px;
      border-bottom: 1px solid #F1F5F9;
      white-space: nowrap;
    }
    table.data-table tr:hover td {
      background: #F8FAFC;
    }
    .pagination {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-top: 14px;
      font-size: 12px;
      color: var(--text-muted);
    }

    .lineage-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .lineage-item {
      background: white;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 12px 16px;
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .lineage-idx {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: var(--primary-light);
      color: var(--primary);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      font-size: 12px;
    }

    #chart-tooltip {
      position: fixed;
      display: none;
      background: rgba(15, 23, 42, 0.95);
      color: white;
      padding: 6px 10px;
      border-radius: 6px;
      font-size: 11px;
      pointer-events: none;
      z-index: 1000;
      box-shadow: 0 4px 12px rgba(0,0,0,0.25);
    }

    @media print {
      .topbar-actions, .nav-tabs, .slicer-card, .btn { display: none !important; }
      body { background: white !important; }
      .visual-card { break-inside: avoid; border: 1px solid #CCC !important; box-shadow: none !important; }
    }
  </style>
</head>
<body>
  <!-- Embedded StepSheet Workbook Data Island -->
  <script id="stepsheet-packaged-data" type="application/json">
${safeDataJson}
  </script>

  <!-- Top Navigation Header -->
  <div class="topbar">
    <div class="brand-section">
      <div class="brand-icon">S</div>
      <div>
        <div style="display:flex; align-items:center; gap:8px;">
          <span class="brand-title">${eTitle}</span>
          <span class="brand-badge">.SSWB Universal Workbook</span>
        </div>
        <div class="topbar-meta">Dataset: <strong>${eDsName}</strong> &bull; <span id="hdr-row-count">${filteredCount}</span> rows packaged</div>
      </div>
    </div>
    <div class="topbar-actions">
      <button class="btn btn-outline" id="btn-fullscreen" onclick="toggleFullScreen()">⛶ Full Screen</button>
      <button class="btn btn-outline" onclick="window.print()">🖨️ Print / PDF</button>
      <button class="btn btn-light" onclick="exportDataCsv()">📥 Export CSV</button>
      <button class="btn btn-light" onclick="exportRawSswb()">💾 Save .sswb</button>
    </div>
  </div>

  <!-- Navigation Tabs -->
  <div class="nav-tabs">
    <div class="nav-tab active" id="tab-btn-dash" onclick="switchTab('dash')">📊 Visual Dashboard</div>
    <div class="nav-tab" id="tab-btn-data" onclick="switchTab('data')">📋 Packaged Data Table</div>
    <div class="nav-tab" id="tab-btn-lineage" onclick="switchTab('lineage')">⚡ Pipeline Lineage (${stepsCount})</div>
  </div>

  <!-- Main Container -->
  <div class="container">
    <!-- VIEW 1: DASHBOARD -->
    <div id="view-dash">
      <!-- Slicer Bar -->
      <div class="slicer-card" id="slicer-container">
        <div class="slicer-header">
          <div class="slicer-title">Interactive Dimension Slicers (Click to Filter Dashboard)</div>
          <button class="slicer-clear" id="slicer-clear-btn" onclick="clearFilters()" style="display:none;">Clear All Filters</button>
        </div>
        <div class="slicer-chips" id="slicer-chips-area"></div>
      </div>

      <!-- KPI Scorecards -->
      <div class="kpi-grid" id="kpi-cards-grid"></div>

      <!-- Visual Charts Grid -->
      <div class="visuals-grid" id="visuals-grid"></div>
    </div>

    <!-- VIEW 2: DATA TABLE -->
    <div id="view-data" style="display:none;">
      <div class="table-card">
        <div class="table-toolbar">
          <input type="text" class="search-input" id="table-search" placeholder="Search across all columns..." oninput="handleTableSearch(this.value)" />
          <div style="font-size:12px; color:var(--text-muted);" id="table-record-info">Loading...</div>
        </div>
        <div class="table-responsive">
          <table class="data-table" id="raw-data-table">
            <thead>
              <tr id="table-header-row"></tr>
            </thead>
            <tbody id="table-body"></tbody>
          </table>
        </div>
        <div class="pagination">
          <button class="btn btn-light" onclick="changePage(-1)">&larr; Previous</button>
          <span id="page-indicator">Page 1 of 1</span>
          <button class="btn btn-light" onclick="changePage(1)">Next &rarr;</button>
        </div>
      </div>
    </div>

    <!-- VIEW 3: LINEAGE -->
    <div id="view-lineage" style="display:none;">
      <div class="table-card">
        <h3 style="margin-bottom:14px; font-size:16px;">Pipeline Lineage &amp; Applied Transformations</h3>
        <div class="lineage-list" id="lineage-list-container"></div>
      </div>
    </div>
  </div>

  <div id="chart-tooltip"></div>

  <!-- Client-side Interactive Engine -->
  <script>
    var PACKAGE = JSON.parse(document.getElementById('stepsheet-packaged-data').textContent);
    var allRows = PACKAGE.rows || [];
    var activeFilters = new Map();
    var activeTab = 'dash';

    var searchQ = '';
    var sortCol = null;
    var sortAsc = true;
    var currentPage = 1;
    var pageSize = 50;

    var PALETTE = ['#217346', '#2563EB', '#D97706', '#9333EA', '#059669', '#DC2626', '#0284C7', '#7C3AED'];

    function init() {
      buildSlicers();
      renderDashboard();
      renderLineage();
      renderTable();
    }

    function switchTab(tab) {
      activeTab = tab;
      document.getElementById('view-dash').style.display = tab === 'dash' ? 'block' : 'none';
      document.getElementById('view-data').style.display = tab === 'data' ? 'block' : 'none';
      document.getElementById('view-lineage').style.display = tab === 'lineage' ? 'block' : 'none';

      document.getElementById('tab-btn-dash').className = 'nav-tab' + (tab === 'dash' ? ' active' : '');
      document.getElementById('tab-btn-data').className = 'nav-tab' + (tab === 'data' ? ' active' : '');
      document.getElementById('tab-btn-lineage').className = 'nav-tab' + (tab === 'lineage' ? ' active' : '');
    }

    function getFilteredRows() {
      if (activeFilters.size === 0) return allRows;
      return allRows.filter(function(r) {
        var it = activeFilters.entries();
        var entry;
        while (!(entry = it.next()).done) {
          var col = entry.value[0];
          var valSet = entry.value[1];
          var rowVal = String(r[col] != null ? r[col] : '(Blank)');
          if (!valSet.has(rowVal)) return false;
        }
        return true;
      });
    }

    function buildSlicers() {
      var container = document.getElementById('slicer-chips-area');
      container.innerHTML = '';

      var catCols = new Set();
      (PACKAGE.visuals || []).forEach(function(v) {
        if (v.categoryCol && v.type !== 'histogram') catCols.add(v.categoryCol);
      });

      if (catCols.size === 0 && PACKAGE.columns) {
        PACKAGE.columns.slice(0, 3).forEach(function(c) { catCols.add(c); });
      }

      catCols.forEach(function(col) {
        var valCounts = new Map();
        allRows.forEach(function(r) {
          var v = String(r[col] != null ? r[col] : '(Blank)');
          valCounts.set(v, (valCounts.get(v) || 0) + 1);
        });

        var sorted = Array.from(valCounts.entries()).sort(function(a, b) { return b[1] - a[1]; }).slice(0, 10);
        sorted.forEach(function(pair) {
          var val = pair[0];
          var cnt = pair[1];
          var chip = document.createElement('button');
          chip.className = 'chip';
          chip.innerHTML = '<strong>' + escapeHtml(col) + ':</strong> ' + escapeHtml(val) + ' <span class="chip-count">(' + cnt + ')</span>';
          chip.onclick = function() { toggleFilter(col, val); };
          chip.dataset.col = col;
          chip.dataset.val = val;
          container.appendChild(chip);
        });
      });
    }

    function toggleFilter(col, val) {
      if (!activeFilters.has(col)) {
        activeFilters.set(col, new Set());
      }
      var s = activeFilters.get(col);
      if (s.has(val)) {
        s.delete(val);
        if (s.size === 0) activeFilters.delete(col);
      } else {
        s.add(val);
      }

      document.querySelectorAll('.chip').forEach(function(c) {
        var cCol = c.dataset.col;
        var cVal = c.dataset.val;
        var isSel = activeFilters.has(cCol) && activeFilters.get(cCol).has(cVal);
        c.className = 'chip' + (isSel ? ' selected' : '');
      });

      document.getElementById('slicer-clear-btn').style.display = activeFilters.size > 0 ? 'inline' : 'none';
      renderDashboard();
      renderTable();
    }

    function clearFilters() {
      activeFilters.clear();
      document.querySelectorAll('.chip').forEach(function(c) { c.className = 'chip'; });
      document.getElementById('slicer-clear-btn').style.display = 'none';
      renderDashboard();
      renderTable();
    }

    function renderDashboard() {
      var filtered = getFilteredRows();
      document.getElementById('hdr-row-count').textContent = filtered.length.toLocaleString();

      var kpiContainer = document.getElementById('kpi-cards-grid');
      kpiContainer.innerHTML = '';
      (PACKAGE.kpis || []).forEach(function(k, idx) {
        var metricVal = 0;
        var col = k.column;
        var agg = (k.aggFunc || 'sum').toLowerCase();

        if (agg === 'count') {
          metricVal = filtered.length;
        } else if (agg === 'distinct') {
          metricVal = new Set(filtered.map(function(r) { return r[col]; })).size;
        } else {
          var nums = filtered.map(function(r) { return Number(r[col]); }).filter(function(n) { return !isNaN(n); });
          if (agg === 'sum') metricVal = nums.reduce(function(a,b) { return a + b; }, 0);
          else if (agg === 'avg') metricVal = nums.length ? nums.reduce(function(a,b) { return a + b; }, 0) / nums.length : 0;
          else if (agg === 'min') metricVal = nums.length ? Math.min.apply(null, nums) : 0;
          else if (agg === 'max') metricVal = nums.length ? Math.max.apply(null, nums) : 0;
        }

        var formatted = metricVal >= 1e6 ? (metricVal/1e6).toFixed(2) + 'M' : metricVal >= 1e3 ? (metricVal/1e3).toFixed(1) + 'K' : Number(metricVal.toFixed(1)).toLocaleString();

        var card = document.createElement('div');
        card.className = 'kpi-card';
        card.style.borderLeftColor = PALETTE[idx % PALETTE.length];
        card.innerHTML = '<div class="kpi-title">' + escapeHtml(k.title) + '</div>' +
          '<div class="kpi-value">' + formatted + '</div>' +
          '<div class="kpi-sub">' + escapeHtml(agg.toUpperCase()) + ' of ' + escapeHtml(col) + ' &bull; ' + escapeHtml(k.subtitle || 'Active Filtered Rows') + '</div>';
        kpiContainer.appendChild(card);
      });

      var visualsContainer = document.getElementById('visuals-grid');
      visualsContainer.innerHTML = '';

      (PACKAGE.visuals || []).forEach(function(v, vIdx) {
        var card = document.createElement('div');
        card.className = 'visual-card';

        var catMap = new Map();
        filtered.forEach(function(r) {
          var cat = String(r[v.categoryCol] != null ? r[v.categoryCol] : '(Blank)');
          if (!catMap.has(cat)) catMap.set(cat, []);
          catMap.get(cat).push(r);
        });

        var agg = (v.aggFunc || 'sum').toLowerCase();
        var items = Array.from(catMap.entries()).map(function(pair) {
          var cat = pair[0];
          var gRows = pair[1];
          var val = 0;
          if (agg === 'count') val = gRows.length;
          else {
            var nums = gRows.map(function(r) { return Number(r[v.valueCol]); }).filter(function(n) { return !isNaN(n); });
            if (agg === 'sum') val = nums.reduce(function(a,b) { return a + b; }, 0);
            else if (agg === 'avg') val = nums.length ? nums.reduce(function(a,b) { return a + b; }, 0) / nums.length : 0;
            else if (agg === 'min') val = nums.length ? Math.min.apply(null, nums) : 0;
            else if (agg === 'max') val = nums.length ? Math.max.apply(null, nums) : 0;
          }
          return { category: cat, value: val, count: gRows.length };
        });

        items.sort(function(a,b) { return b.value - a.value; });
        items = items.slice(0, 8);
        var totalVal = items.reduce(function(a,b) { return a + Math.max(0, b.value); }, 0) || 1;
        items.forEach(function(it) {
          it.pct = ((Math.max(0, it.value) / totalVal) * 100).toFixed(1) + '%';
        });

        var vType = (v.type || 'bar').toLowerCase();
        var chartHtml = '';

        if (vType === 'pie' || vType === 'donut') {
          chartHtml = renderSvgDonut(items, vType === 'donut');
        } else if (vType === 'column' || vType === 'histogram' || vType === 'stacked_column' || vType === 'clustered_column') {
          chartHtml = renderSvgColumn(items);
        } else {
          chartHtml = renderSvgBar(items);
        }

        card.innerHTML = '<div class="visual-header">' +
          '<div>' +
            '<div class="visual-title">' + escapeHtml(v.title) + '</div>' +
            '<div style="font-size:11px; color:#64748B;">' + escapeHtml(v.categoryCol) + ' &bull; ' + escapeHtml(v.aggFunc) + '(' + escapeHtml(v.valueCol) + ')</div>' +
          '</div>' +
          '<div class="visual-badge">' + escapeHtml(v.type) + '</div>' +
        '</div>' +
        '<div class="chart-container">' + chartHtml + '</div>';
        visualsContainer.appendChild(card);
      });
    }

    function renderSvgBar(items) {
      var maxVal = Math.max.apply(null, items.map(function(x) { return Math.abs(x.value); }).concat([1]));
      var rows = items.map(function(it, idx) {
        var pct = Math.max(2, Math.round((Math.abs(it.value) / maxVal) * 100));
        var color = PALETTE[idx % PALETTE.length];
        return '<div style="margin-bottom:10px;">' +
          '<div style="display:flex; justify-content:space-between; font-size:11px; margin-bottom:3px;">' +
            '<span style="font-weight:600; max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">' + escapeHtml(it.category) + '</span>' +
            '<span style="font-weight:700; color:#334155;">' + Number(it.value).toLocaleString() + ' <span style="font-size:10px; color:#64748B;">(' + it.pct + ')</span></span>' +
          '</div>' +
          '<div style="height:14px; background:#F1F5F9; border-radius:4px; overflow:hidden;">' +
            '<div style="height:100%; width:' + pct + '%; background:' + color + '; border-radius:4px; transition:width 0.3s ease;"></div>' +
          '</div>' +
        '</div>';
      }).join('');
      return '<div>' + rows + '</div>';
    }

    function renderSvgColumn(items) {
      var maxVal = Math.max.apply(null, items.map(function(x) { return Math.abs(x.value); }).concat([1]));
      var w = 460;
      var h = 200;
      var padL = 30;
      var padB = 40;
      var colW = Math.max(16, (w - padL) / (items.length || 1) - 12);

      var cols = items.map(function(it, idx) {
        var barH = Math.max(4, (Math.abs(it.value) / maxVal) * (h - padB - 20));
        var x = padL + idx * (colW + 12);
        var y = h - padB - barH;
        var color = PALETTE[idx % PALETTE.length];
        return '<rect x="' + x + '" y="' + y + '" width="' + colW + '" height="' + barH + '" rx="3" fill="' + color + '" class="bar-rect" onmousemove="showTip(event, \\'' + escapeHtml(it.category) + ': ' + Number(it.value).toLocaleString() + ' (' + it.pct + ')\\')" onmouseout="hideTip()"></rect>' +
          '<text x="' + (x + colW/2) + '" y="' + (h - padB + 16) + '" text-anchor="middle" class="axis-text">' + escapeHtml(it.category.slice(0, 8)) + '</text>' +
          '<text x="' + (x + colW/2) + '" y="' + (y - 4) + '" text-anchor="middle" class="val-text">' + Number(it.value).toLocaleString() + '</text>';
      }).join('');

      return '<svg viewBox="0 0 ' + w + ' ' + h + '" class="chart-svg">' + cols + '</svg>';
    }

    function renderSvgDonut(items, isDonut) {
      var r = 80;
      var cx = 100;
      var cy = 100;
      var curAngle = -Math.PI / 2;

      var paths = items.map(function(it, idx) {
        var slicePct = Math.max(0.001, parseFloat(it.pct) / 100);
        var nextAngle = curAngle + slicePct * 2 * Math.PI;
        var x1 = cx + r * Math.cos(curAngle);
        var y1 = cy + r * Math.sin(curAngle);
        var x2 = cx + r * Math.cos(nextAngle);
        var y2 = cy + r * Math.sin(nextAngle);
        var largeArc = slicePct > 0.5 ? 1 : 0;
        var color = PALETTE[idx % PALETTE.length];
        var pathData = 'M ' + cx + ' ' + cy + ' L ' + x1 + ' ' + y1 + ' A ' + r + ' ' + r + ' 0 ' + largeArc + ' 1 ' + x2 + ' ' + y2 + ' Z';
        curAngle = nextAngle;

        return '<path d="' + pathData + '" fill="' + color + '" onmousemove="showTip(event, \\'' + escapeHtml(it.category) + ': ' + Number(it.value).toLocaleString() + ' (' + it.pct + ')\\')" onmouseout="hideTip()"></path>';
      }).join('');

      var cutout = isDonut ? '<circle cx="' + cx + '" cy="' + cy + '" r="' + (r * 0.55) + '" fill="white"></circle>' : '';

      var legend = items.map(function(it, idx) {
        var color = PALETTE[idx % PALETTE.length];
        return '<div style="display:flex; align-items:center; gap:6px; font-size:11px; margin-bottom:4px;">' +
          '<div style="width:10px; height:10px; background:' + color + '; border-radius:2px; shrink-0;"></div>' +
          '<span style="font-weight:600; max-width:140px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">' + escapeHtml(it.category) + '</span>' +
          '<span style="color:#64748B;">(' + it.pct + ')</span>' +
        '</div>';
      }).join('');

      return '<div style="display:flex; align-items:center; justify-content:space-around; gap:16px;">' +
        '<svg viewBox="0 0 200 200" style="width:160px; height:160px;">' + paths + cutout + '</svg>' +
        '<div style="max-height:180px; overflow-y:auto;">' + legend + '</div>' +
      '</div>';
    }

    function renderTable() {
      var filtered = getFilteredRows();
      var cols = PACKAGE.columns || (filtered.length ? Object.keys(filtered[0]) : []);

      var viewRows = filtered;
      if (searchQ) {
        var q = searchQ.toLowerCase();
        viewRows = viewRows.filter(function(r) {
          return cols.some(function(c) { return String(r[c] != null ? r[c] : '').toLowerCase().includes(q); });
        });
      }

      if (sortCol) {
        viewRows = viewRows.slice().sort(function(a,b) {
          var va = a[sortCol];
          var vb = b[sortCol];
          if (typeof va === 'number' && typeof vb === 'number') {
            return sortAsc ? va - vb : vb - va;
          }
          return sortAsc ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
        });
      }

      var totalPages = Math.max(1, Math.ceil(viewRows.length / pageSize));
      if (currentPage > totalPages) currentPage = totalPages;

      document.getElementById('table-record-info').textContent = 'Showing ' + viewRows.length.toLocaleString() + ' rows (Page ' + currentPage + ' of ' + totalPages + ')';
      document.getElementById('page-indicator').textContent = 'Page ' + currentPage + ' of ' + totalPages;

      var thead = document.getElementById('table-header-row');
      thead.innerHTML = cols.map(function(c) {
        var isCur = sortCol === c;
        var arrow = isCur ? (sortAsc ? ' ▲' : ' ▼') : '';
        return '<th onclick="sortTable(\\'' + escapeHtml(c) + '\\')">' + escapeHtml(c) + arrow + '</th>';
      }).join('');

      var tbody = document.getElementById('table-body');
      var start = (currentPage - 1) * pageSize;
      var pageData = viewRows.slice(start, start + pageSize);

      tbody.innerHTML = pageData.map(function(r) {
        return '<tr>' + cols.map(function(c) { return '<td>' + escapeHtml(r[c] != null ? r[c] : '') + '</td>'; }).join('') + '</tr>';
      }).join('');
    }

    function handleTableSearch(val) {
      searchQ = val;
      currentPage = 1;
      renderTable();
    }

    function sortTable(col) {
      if (sortCol === col) sortAsc = !sortAsc;
      else { sortCol = col; sortAsc = true; }
      renderTable();
    }

    function changePage(delta) {
      currentPage += delta;
      renderTable();
    }

    function renderLineage() {
      var container = document.getElementById('lineage-list-container');
      var steps = PACKAGE.steps || [];
      if (!steps.length) {
        container.innerHTML = '<div style="color:#64748B; font-size:13px;">No pipeline transformation steps recorded for this workbook.</div>';
        return;
      }
      container.innerHTML = steps.map(function(s, idx) {
        return '<div class="lineage-item">' +
          '<div class="lineage-idx">' + (idx + 1) + '</div>' +
          '<div style="flex:1;">' +
            '<div style="display:flex; align-items:center; gap:8px;">' +
              '<span style="font-weight:700; font-size:13px;">' + escapeHtml(s.label || s.id || 'Step') + '</span>' +
              '<span style="font-size:10px; font-weight:800; background:#F1F5F9; padding:2px 6px; border-radius:4px; text-transform:uppercase;">' + escapeHtml(s.type || '') + '</span>' +
            </div>' +
            '<div style="font-size:11px; color:#64748B; margin-top:2px;">' + escapeHtml(JSON.stringify(s.params || {})) + '</div>' +
          '</div>' +
        '</div>';
      }).join('');
    }

    function exportDataCsv() {
      var rows = getFilteredRows();
      var cols = PACKAGE.columns || (rows.length ? Object.keys(rows[0]) : []);
      var csv = [
        cols.join(','),
      ].concat(rows.map(function(r) {
        return cols.map(function(c) {
          var val = String(r[c] != null ? r[c] : '');
          // CSV formula-injection guard (same rule as engine/csv.ts csvCell)
          if (typeof r[c] === 'string' && /^[=+@\\t\\r-]/.test(val) && isNaN(Number(val.replace(/[$,%\\s]/g, '')))) val = "'" + val;
          return val.includes(',') || val.includes('"') || val.includes('\\n') || val.includes('\\r') ? '"' + val.replace(/"/g, '""') + '"' : val;
        }).join(',');
      })).join('\\n');

      var blob = new Blob([csv], { type: 'text/csv' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = (PACKAGE.title || 'StepSheet') + '_data.csv';
      a.click();
      URL.revokeObjectURL(url);
    }

    function exportRawSswb() {
      var blob = new Blob([JSON.stringify(PACKAGE, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = (PACKAGE.title || 'StepSheet') + '_packaged_workbook.sswb';
      a.click();
      URL.revokeObjectURL(url);
    }

    function toggleFullScreen() {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(function() {});
      } else {
        if (document.exitFullscreen) document.exitFullscreen().catch(function() {});
      }
    }

    function showTip(e, text) {
      var tip = document.getElementById('chart-tooltip');
      tip.textContent = text;
      tip.style.display = 'block';
      tip.style.left = (e.clientX + 14) + 'px';
      tip.style.top = (e.clientY + 14) + 'px';
    }

    function hideTip() {
      document.getElementById('chart-tooltip').style.display = 'none';
    }

    function escapeHtml(s) {
      if (s === null || s === undefined) return '';
      return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    window.onload = init;
  </script>
</body>
</html>`;

  return new Blob([html], { type: 'text/html;charset=utf-8;' });
}

export const createDashboardHtmlBlob = createDashboardSswbHtmlBlob;

function triggerBrowserDownload(blob: Blob, filename: string): void {
  const blobUrl = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    window.URL.revokeObjectURL(blobUrl);
    if (a.parentNode) {
      a.parentNode.removeChild(a);
    }
  }, 1500);
}

async function fetchDirectDashboardBlob(
  data: DashboardExportData,
  format: string
): Promise<{ blob: Blob; filename: string } | null> {
  const safeTitle = (data.title || data.datasetName || 'Dashboard').replace(/[^a-zA-Z0-9_-]/g, '_');
  const endpointsToTry = [
    `${API_BASE}/export/direct-dashboard`,
    `${API_BASE}/exports/direct-dashboard`,
    'http://127.0.0.1:8000/api/v1/export/direct-dashboard',
    'http://localhost:8000/api/v1/export/direct-dashboard',
  ];

  const payload = {
    title: data.title || 'Executive Dashboard',
    dataset_name: data.datasetName || 'Dataset',
    kpis: data.kpis || [],
    visuals: data.visuals || [],
    rows: data.rows || [],
    columns: data.columns || [],
    steps: data.steps || [],
    filtered_row_count: data.filteredRowCount,
    total_row_count: data.totalRowCount,
    format:
      format === 'sswb_html' || format === 'packaged_workbook' || format === 'sswb.html'
        ? 'sswb_html'
        : format === 'sswb'
        ? 'sswb'
        : format === 'xlsx_values'
        ? 'xlsx'
        : format,
  };

  for (const url of endpointsToTry) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const blob = await res.blob();
        let filename = '';
        const disp = res.headers.get('content-disposition');
        if (disp) {
          const m = disp.match(/filename="?([^"]+)"?/);
          if (m && m[1]) filename = m[1];
        }
        if (!filename) {
          const ext =
            format === 'sswb_html' || format === 'packaged_workbook' || format === 'sswb.html'
              ? 'sswb.html'
              : format === 'sswb'
              ? 'sswb'
              : format === 'pptx'
              ? 'pptx'
              : format === 'pdf'
              ? 'pdf'
              : format === 'csv'
              ? 'csv'
              : format === 'html'
              ? 'html'
              : 'xlsx';
          filename = `${safeTitle}_${
            format === 'sswb_html' || format === 'packaged_workbook' || format === 'sswb.html' || format === 'sswb'
              ? 'packaged_workbook'
              : format === 'pptx'
              ? 'presentation'
              : 'dashboard'
          }.${ext}`;
        }
        return { blob, filename };
      }
    } catch {
      // Continue next endpoint
    }
  }
  return null;
}

const localBlobRegistry = new Map<string, { blob: Blob; filename: string }>();
const localJobRegistry = new Map<string, ExportJobStatus>();

async function createLocalExportJob(payload: ExportJobCreatePayload): Promise<ExportJobStatus> {
  const dData = payload.options?.dashboardData as DashboardExportData | undefined;

  let dsName = dData?.datasetName || 'dataset';
  if (dsName === 'dataset') {
    try {
      const dss = await localEngine.listDatasets();
      const d = dss.find((x: any) => x.id === payload.dataset_id);
      if (d && d.name) dsName = d.name.replace(/[^a-zA-Z0-9_-]/g, '_');
    } catch {}
    try {
      const store = useWorkbenchStore.getState();
      if (store.selectedDataset?.name) {
        dsName = store.selectedDataset.name.replace(/[^a-zA-Z0-9_-]/g, '_');
      }
    } catch {}
  }

  const safeTitle = (dData?.title || dsName).replace(/[^a-zA-Z0-9_-]/g, '_');
  const format = payload.format || 'xlsx_values';

  let blob: Blob;
  let filename = '';
  let fileType = '';

  if (dData) {
    const remote = await fetchDirectDashboardBlob(dData, format);
    if (remote) {
      blob = remote.blob;
      filename = remote.filename;
      fileType =
        format === 'sswb_html' || format === 'packaged_workbook' || format === 'sswb.html'
          ? 'html'
          : format === 'sswb'
          ? 'sswb'
          : format === 'pptx'
          ? 'pptx'
          : format === 'pdf'
          ? 'pdf'
          : format === 'csv'
          ? 'csv'
          : 'xlsx';
    } else {
      if (format === 'sswb_html' || format === 'packaged_workbook' || format === 'sswb.html') {
        blob = createDashboardSswbHtmlBlob(dData);
        filename = `${safeTitle}_packaged_workbook.sswb.html`;
        fileType = 'html';
      } else if (format === 'sswb') {
        blob = createDashboardSswbJsonBlob(dData);
        filename = `${safeTitle}_packaged_workbook.sswb`;
        fileType = 'sswb';
      } else if (format === 'pdf') {
        blob = createDashboardPdfBlob(dData);
        filename = `${safeTitle}_dashboard.pdf`;
        fileType = 'pdf';
      } else if (format === 'pptx') {
        blob = createDashboardPresentationBlob(dData);
        filename = `${safeTitle}_presentation_pack.zip`;
        fileType = 'zip';
      } else if (format === 'html') {
        blob = createDashboardHtmlBlob(dData);
        filename = `${safeTitle}_dashboard.html`;
        fileType = 'html';
      } else if (format === 'xlsx_values') {
        blob = createDashboardExcelXml(dData);
        filename = `${safeTitle}_packaged_workbook.xml`;
        fileType = 'xml';
      } else if (format === 'csv') {
        const delim = payload.options?.csv_delimiter || ',';
        const csvLines = [
          dData.columns.join(delim),
          ...dData.rows.map((r) =>
            dData.columns
              .map((c) => {
                const val = r[c];
                if (val === null || val === undefined) return '';
                const s = String(val);
                return s.includes(',') || s.includes('"') || s.includes('\n')
                  ? `"${s.replace(/"/g, '""')}"`
                  : s;
              })
              .join(delim)
          ),
        ];
        blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
        filename = `${safeTitle}_data.csv`;
        fileType = 'csv';
      } else {
        blob = createDashboardExcelXml(dData);
        filename = `${safeTitle}_packaged_workbook.xml`;
        fileType = 'xml';
      }
    }
  } else {

    // Standard data export fallback
    const rowLimit =
      payload.row_scope === 'custom' && payload.row_limit ? payload.row_limit : 50000;
    let preview: any = { rows: [], columns: [], steps: [] };
    try {
      preview = await localEngine.previewPipeline(payload.dataset_id, payload.steps || [], {
        offset: 0,
        limit: rowLimit,
      });
    } catch {
      preview = { rows: [], columns: [] };
    }

    let rawRows: Record<string, any>[] = preview.rows || [];
    let rawCols: string[] = (preview.columns || []).map((c: any) => c.name || c);

    if (rawRows.length === 0) {
      try {
        const store = useWorkbenchStore.getState();
        if (store.allRows && store.allRows.length > 0) rawRows = store.allRows;
        else if (store.rows && store.rows.length > 0) rawRows = store.rows;
        if (rawCols.length === 0 && store.columns && store.columns.length > 0) {
          rawCols = store.columns.map((c) => c.name);
        }
      } catch {}
    }

    if (rawCols.length === 0 && rawRows.length > 0) {
      rawCols = Object.keys(rawRows[0]);
    }

    const cols =
      payload.excluded_columns && payload.excluded_columns.length > 0
        ? rawCols.filter((c) => !payload.excluded_columns?.includes(c))
        : rawCols;

    let rows = rawRows;
    if (payload.row_scope === 'preview') rows = rows.slice(0, 200);
    else if (payload.row_scope === 'custom' && payload.row_limit) {
      rows = rows.slice(0, payload.row_limit);
    }

    const delim = payload.options?.csv_delimiter || ',';
    const csvContent = [
      cols.join(delim),
      ...rows.map((r) =>
        cols
          .map((c) => {
            const val = r[c];
            if (val === null || val === undefined) return '';
            const s = String(val);
            return s.includes(',') || s.includes('"') || s.includes('\n')
              ? `"${s.replace(/"/g, '""')}"`
              : s;
          })
          .join(delim)
      ),
    ].join('\n');

    if (format === 'csv') {
      blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      filename = `${safeTitle}_export.csv`;
      fileType = 'csv';
    } else if (format === 'json') {
      blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' });
      filename = `${safeTitle}_export.json`;
      fileType = 'json';
    } else if (format === 'pdf') {
      blob = createMultiPagePdfBlob([
        [
          { text: 'StepSheet Executive Summary Report', font: '/F1 16', leading: 22 },
          { text: `Dataset: ${dsName} | Records: ${rows.length}`, font: '/F2 9', leading: 18 },
          { text: '--------------------------------------------------------------------------------', font: '/F3 8', leading: 14 },
          ...rows.slice(0, 30).map((r, i) => ({
            text: `${i + 1}. ` + cols.slice(0, 5).map((c) => `${c}: ${r[c]}`).join(' | '),
            font: '/F3 8',
            leading: 13,
          })),
        ],
      ]);
      filename = `${safeTitle}_executive_report.pdf`;
      fileType = 'pdf';
    } else {
      const mockDData: DashboardExportData = {
        title: safeTitle,
        datasetName: dsName,
        kpis: [
          {
            title: 'Total Records',
            value: rows.length,
            formattedValue: String(rows.length),
            aggFunc: 'count',
            subtitle: 'Data Records',
            column: cols[0] || 'id',
          },
        ],
        visuals: [],
        filteredRowCount: rows.length,
        totalRowCount: rows.length,
        rows,
        columns: cols,
      };
      blob = createDashboardExcelXml(mockDData);
      filename = `${safeTitle}_packaged_workbook.xml`;
      fileType = 'xml';
    }
  }


  const fileId = `file_${Date.now()}`;
  localBlobRegistry.set(`${payload.dataset_id}_${fileId}`, { blob, filename });
  const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  localBlobRegistry.set(`${jobId}_${fileId}`, { blob, filename });
  localBlobRegistry.set(fileId, { blob, filename });

  const files: ExportFileItem[] = [
    {
      file_id: fileId,
      filename,
      file_type: fileType,
      size_bytes: blob.size,
      download_url: `#local-${fileId}`,
    },
  ];

  const job: ExportJobStatus = {
    job_id: jobId,
    project_id: payload.project_id,
    dataset_id: payload.dataset_id,
    format: payload.format,
    status: 'completed',
    progress_pct: 100,
    message: 'Generated successfully',
    files,
    created_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
    total_rows: dData ? dData.filteredRowCount : 0,
  };

  localJobRegistry.set(jobId, job);
  return job;
}

/**
 * Records a quick-download (downloadDashboard) into the same local job
 * registry that the Export & Share Studio's "History" tab reads from, so a
 * download triggered from the dashboard's download-split-button actually
 * shows up under Export History instead of leaving that tab permanently
 * empty. There is no backend in this standalone app, so this is the only
 * record of the download that exists anywhere.
 */
function registerLocalExportHistoryEntry(
  data: DashboardExportData,
  format: string,
  filename: string,
  sizeBytes: number
): void {
  try {
    const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const fileId = `file_${Date.now()}`;
    const job: ExportJobStatus = {
      job_id: jobId,
      project_id: 'local',
      dataset_id: data.datasetName || 'dataset',
      format,
      status: 'completed',
      progress_pct: 100,
      message: 'Downloaded successfully',
      files: [
        {
          file_id: fileId,
          filename,
          file_type: format,
          size_bytes: sizeBytes,
          download_url: `#local-${fileId}`,
        },
      ],
      created_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      total_rows: data.filteredRowCount,
    };
    localJobRegistry.set(jobId, job);
  } catch {
    // History is a convenience, never worth failing the download over.
  }
}

export const exportShareApi = {
  /**
   * Direct high-fidelity Dashboard export for PDF, PPTX, Packaged Workbook, HTML, and CSV.
   */
  async downloadDashboard(data: DashboardExportData, format: string): Promise<void> {
    const safeTitle = (data.title || data.datasetName || 'Dashboard').replace(/[^a-zA-Z0-9_-]/g, '_');

    // 1. First attempt to call the high-fidelity Python backend service (xlsxwriter, python-pptx, reportlab)
    const remote = await fetchDirectDashboardBlob(data, format);
    if (remote) {
      triggerBrowserDownload(remote.blob, remote.filename);
      return;
    }

    // 2. Client-side offline fallback
    let blob: Blob;
    let filename: string;

    if (format === 'sswb_html' || format === 'packaged_workbook' || format === 'sswb.html') {
      blob = createDashboardSswbHtmlBlob(data);
      filename = `${safeTitle}_packaged_workbook.sswb.html`;
    } else if (format === 'sswb') {
      blob = createDashboardSswbJsonBlob(data);
      filename = `${safeTitle}_packaged_workbook.sswb`;
    } else if (format === 'pdf') {
      blob = createDashboardPdfBlob(data);
      filename = `${safeTitle}_dashboard.pdf`;
    } else if (format === 'pptx') {
      blob = createDashboardPresentationBlob(data);
      filename = `${safeTitle}_presentation_pack.zip`;
    } else if (format === 'html') {
      blob = createDashboardSswbHtmlBlob(data);
      filename = `${safeTitle}_dashboard.html`;
    } else if (format === 'json') {
      blob = new Blob([JSON.stringify(data.rows, null, 2)], {
        type: 'application/json;charset=utf-8;',
      });
      filename = `${safeTitle}_data.json`;
    } else if (format === 'csv') {
      const csvLines = [
        ...toCsv(data.columns, data.rows).split('\n'),
      ];
      blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
      filename = `${safeTitle}_data.csv`;
    } else if (format === 'powerbi_starter') {
      const csvLines = [
        ...toCsv(data.columns, data.rows).split('\n'),
      ].join('\n');
      const mScript = [
        `let`,
        `  Source = Csv.Document(File.Contents("${data.datasetName}.csv"), [Delimiter=",", Encoding=65001, QuoteStyle=QuoteStyle.Csv]),`,
        `  #Headers = Table.PromoteHeaders(Source, [PromoteAllScalars=true])`,
        `in`,
        `  #Headers`,
      ].join('\n');
      const dictionary = [
        `Dataset: ${data.datasetName}`,
        `Total Rows: ${data.filteredRowCount}`,
        `Columns:`,
        ...data.columns.map((c) => `  - ${c}`),
      ].join('\n');
      blob = createZipBlob([
        { name: `${data.datasetName}.csv`, content: csvLines },
        { name: 'PowerQuery_M_Script.m', content: mScript },
        { name: 'Schema_Dictionary.txt', content: dictionary },
        { name: 'README.txt', content: `StepSheet Power BI Starter Pack for ${data.datasetName}` },
      ]);
      filename = `${safeTitle}_powerbi_starter.zip`;
    } else {
      // xlsx_values / packaged_workbook
      // NOTE: this is the "Excel 2003 XML Spreadsheet" (SpreadsheetML) format.
      // Excel opens it natively by double-click only when it carries the
      // conventional .xls extension — a .xlsx or .xml extension on this
      // exact same content either shows a "file corrupt" warning (.xlsx,
      // since that expects a real OOXML zip) or doesn't auto-open in Excel
      // at all (.xml, no default file association). .xls is the correct,
      // honest extension for this content.
      blob = createDashboardExcelXml(data);
      filename = `${safeTitle}_packaged_workbook.xls`;
    }

    triggerBrowserDownload(blob, filename);
    registerLocalExportHistoryEntry(data, format, filename, blob.size);
  },


  async createJob(payload: ExportJobCreatePayload): Promise<ExportJobStatus> {
    if (isStandalone || payload.options?.dashboardData) {
      return createLocalExportJob(payload);
    }
    try {
      const res = await fetch(`${API_BASE}/exports`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        return createLocalExportJob(payload);
      }
      return res.json();
    } catch {
      return createLocalExportJob(payload);
    }
  },

  async getJob(jobId: string): Promise<ExportJobStatus> {
    if (localJobRegistry.has(jobId)) {
      return localJobRegistry.get(jobId)!;
    }
    const res = await fetch(`${API_BASE}/exports/${jobId}`, {
      headers: getAuthHeader(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to fetch export job status');
    }
    return res.json();
  },

  async cancelJob(jobId: string): Promise<ExportJobStatus> {
    if (localJobRegistry.has(jobId)) {
      const job = localJobRegistry.get(jobId)!;
      job.status = 'cancelled';
      return job;
    }
    const res = await fetch(`${API_BASE}/exports/${jobId}`, {
      method: 'DELETE',
      headers: getAuthHeader(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to cancel export job');
    }
    return res.json();
  },

  async getHistory(projectId: string): Promise<ExportJobStatus[]> {
    try {
      const res = await fetch(`${API_BASE}/exports/history/${projectId}`, {
        headers: getAuthHeader(),
      });
      if (res.ok) {
        const remote = await res.json();
        const local = Array.from(localJobRegistry.values());
        return [...local, ...(Array.isArray(remote) ? remote : [])];
      }
    } catch {}
    return Array.from(localJobRegistry.values());
  },

  getFileDownloadUrl(jobId: string, fileId: string): string {
    return `${API_BASE}/exports/${jobId}/files/${fileId}`;
  },

  async downloadFile(jobId: string, fileId: string, filename: string): Promise<void> {
    const local = localBlobRegistry.get(`${jobId}_${fileId}`) || localBlobRegistry.get(fileId);
    if (local) {
      triggerBrowserDownload(local.blob, filename || local.filename);
      return;
    }
    const url = this.getFileDownloadUrl(jobId, fileId);
    const res = await fetch(url, { headers: getAuthHeader() });
    if (!res.ok) {
      throw new Error(`Failed to download file ${filename}`);
    }
    const blob = await res.blob();
    triggerBrowserDownload(blob, filename);
  },

  async pollJobUntilDone(
    jobId: string,
    onProgress?: (job: ExportJobStatus) => void,
    intervalMs = 500,
    maxWaitMs = 60000
  ): Promise<ExportJobStatus> {
    if (localJobRegistry.has(jobId)) {
      const job = localJobRegistry.get(jobId)!;
      if (onProgress) onProgress(job);
      return job;
    }
    const startTime = Date.now();
    while (Date.now() - startTime < maxWaitMs) {
      const job = await this.getJob(jobId);
      if (onProgress) onProgress(job);

      if (job.status === 'completed') {
        return job;
      }
      if (job.status === 'failed') {
        throw new Error(job.error_message || 'Export job failed');
      }
      if (job.status === 'cancelled') {
        throw new Error('Export job was cancelled');
      }

      await new Promise((r) => setTimeout(r, intervalMs));
    }
    throw new Error('Export job timed out');
  },
};
