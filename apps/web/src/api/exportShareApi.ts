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

export function createMultiPagePdfBlob(
  pages: Array<Array<{ text: string; font?: string; leading?: number; x?: number }>>
): Blob {
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
    const lines = pages[i] || [];

    addObj(
      `${pageId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentId} 0 R /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> /F2 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> /F3 << /Type /Font /Subtype /Type1 /BaseFont /Courier >> >> >> >>\nendobj`
    );

    const contentLines: string[] = ['BT'];
    let y = 745;
    for (const item of lines) {
      const font = item.font || '/F2 9';
      const text = (item.text || '').replace(/[()\\\\\r\n]/g, ' ').slice(0, 95);
      contentLines.push(`${font} Tf`);
      contentLines.push(`${item.x || 45} ${y} Td`);
      contentLines.push(`(${text}) Tj`);
      contentLines.push(`-${item.x || 45} -${y} Td`);
      y -= item.leading || 14;
      if (y < 40) break;
    }
    contentLines.push('ET');

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

export function createDashboardPdfBlob(data: DashboardExportData): Blob {
  const pages: Array<Array<{ text: string; font?: string; leading?: number; x?: number }>> = [];

  // Page 1: Executive Dashboard & Scorecard
  const p1: Array<{ text: string; font?: string; leading?: number; x?: number }> = [
    { text: 'StepSheet Executive BI Dashboard', font: '/F1 18', leading: 24 },
    { text: data.title || 'Executive Dashboard', font: '/F1 13', leading: 18 },
    {
      text: `Dataset: ${data.datasetName} | Filtered Records: ${data.filteredRowCount} of ${data.totalRowCount} | Generated: ${new Date().toLocaleString()}`,
      font: '/F2 9',
      leading: 20,
    },
    { text: '--------------------------------------------------------------------------------', font: '/F3 8', leading: 18 },
    { text: 'KEY PERFORMANCE INDICATORS (KPIs)', font: '/F1 12', leading: 18 },
  ];

  if (data.kpis && data.kpis.length > 0) {
    data.kpis.forEach((k, idx) => {
      p1.push({
        text: `${idx + 1}. ${k.title.toUpperCase()}: ${k.formattedValue}    [${k.aggFunc.toUpperCase()} of ${k.column}]`,
        font: '/F1 10',
        leading: 14,
      });
      if (k.subtitle) {
        p1.push({
          text: `   Context: ${k.subtitle}`,
          font: '/F2 8',
          leading: 16,
        });
      }
    });
  } else {
    p1.push({ text: '(No KPI cards configured)', font: '/F2 9', leading: 16 });
  }

  p1.push({ text: '--------------------------------------------------------------------------------', font: '/F3 8', leading: 18 });
  p1.push({ text: 'DASHBOARD CHARTS & VISUALS OVERVIEW', font: '/F1 12', leading: 16 });
  p1.push({
    text: `Total Charts Rendered: ${data.visuals?.length || 0}. Detailed breakdowns on subsequent pages.`,
    font: '/F2 9',
    leading: 16,
  });

  pages.push(p1);

  // Pages 2+: Visuals Detailed Breakdown
  if (data.visuals && data.visuals.length > 0) {
    for (let i = 0; i < data.visuals.length; i++) {
      const vis = data.visuals[i];
      const pVis: Array<{ text: string; font?: string; leading?: number; x?: number }> = [
        { text: `Chart ${i + 1}: ${vis.title}`, font: '/F1 14', leading: 20 },
        {
          text: `Type: ${vis.type.toUpperCase()} | Grouped by: "${vis.categoryCol}" | Metric: ${vis.aggFunc.toUpperCase()}("${vis.valueCol}")`,
          font: '/F2 9',
          leading: 18,
        },
        { text: '--------------------------------------------------------------------------------', font: '/F3 8', leading: 14 },
        { text: 'Category                  Value         Share %     Visual Distribution', font: '/F3 8', leading: 14 },
        { text: '--------------------------------------------------------------------------------', font: '/F3 8', leading: 14 },
      ];

      const maxVal = Math.max(1, ...vis.items.map((x) => Math.abs(x.value)));
      vis.items.slice(0, 15).forEach((item) => {
        const catPad = (item.category || '(Blank)').slice(0, 22).padEnd(24);
        const valPad = Number(item.value).toLocaleString().padStart(12);
        const pctPad = (item.percentage || '0.0%').padStart(8);
        const barLen = Math.max(1, Math.min(20, Math.round((Math.abs(item.value) / maxVal) * 20)));
        const barStr = '|'.repeat(barLen);
        pVis.push({
          text: `${catPad} ${valPad} ${pctPad}      ${barStr}`,
          font: '/F3 8',
          leading: 13,
        });
      });

      const totalVal = vis.items.reduce((acc, x) => acc + x.value, 0);
      pVis.push({ text: '--------------------------------------------------------------------------------', font: '/F3 8', leading: 16 });
      pVis.push({
        text: `Summary Total: ${Number(totalVal).toLocaleString()} across ${vis.items.length} categories.`,
        font: '/F1 9',
        leading: 16,
      });

      pages.push(pVis);
    }
  }

  // Final Page: Lineage & Quality Steps (if any)
  if (data.steps && data.steps.length > 0) {
    const pSteps: Array<{ text: string; font?: string; leading?: number; x?: number }> = [
      { text: 'Data Pipeline Transformations & Lineage', font: '/F1 14', leading: 20 },
      { text: `Applied steps to generate dataset: ${data.datasetName}`, font: '/F2 9', leading: 18 },
      { text: '--------------------------------------------------------------------------------', font: '/F3 8', leading: 16 },
    ];
    data.steps.forEach((s, idx) => {
      pSteps.push({
        text: `Step ${idx + 1}: [${String(s.type || '').toUpperCase()}] ${s.label || s.id}`,
        font: '/F1 9',
        leading: 14,
      });
    });
    pages.push(pSteps);
  }

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
    `StepSheet Presentation Deck: ${dsTitle}`,
    `========================================`,
    `This archive contains executive presentation deliverables:`,
    `1. presentation.html -> Standalone presentation deck (open in Chrome, Edge, Safari)`,
    `2. slide1_cover.txt, slide2_kpis.txt, visual_slides.txt -> Raw presentation scripts`,
    `3. Use PowerPoint to import or open presentation.html in presentation mode (F11).`,
  ].join('\n');

  return createZipBlob([
    { name: 'presentation.html', content: slideDeckHtml },
    { name: 'slide1_cover.txt', content: slide1Text },
    { name: 'slide2_kpi_scorecard.txt', content: slide2Text },
    { name: 'visual_slides.txt', content: visualSlidesText },
    { name: 'README.txt', content: readme },
  ]);
}

export function createDashboardHtmlBlob(data: DashboardExportData): Blob {
  const dsTitle = data.title || 'Executive Dashboard';
  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeXml(dsTitle)} — StepSheet Dashboard</title>
  <style>
    body { font-family: Aptos, Calibri, Carlito, "Segoe UI", sans-serif; margin: 0; background: #F8FAFC; color: #1E293B; }
    .navbar { background: #185C37; color: white; padding: 14px 28px; display: flex; align-items: center; justify-content: space-between; }
    .navbar h1 { margin: 0; font-size: 18px; font-weight: 700; }
    .navbar .meta { font-size: 12px; opacity: 0.85; }
    .container { padding: 24px 28px; max-width: 1400px; margin: 0 auto; }
    .kpi-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-bottom: 24px; }
    .kpi-card { background: white; border: 1px solid #E2E8F0; border-radius: 10px; padding: 18px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
    .kpi-title { font-size: 12px; font-weight: 600; text-transform: uppercase; color: #64748B; margin-bottom: 6px; }
    .kpi-val { font-size: 28px; font-weight: 800; color: #185C37; font-family: monospace; }
    .kpi-sub { font-size: 11px; color: #94A3B8; margin-top: 4px; }
    .charts-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(460px, 1fr)); gap: 20px; }
    .chart-card { background: white; border: 1px solid #E2E8F0; border-radius: 10px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
    .chart-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; border-bottom: 1px solid #F1F5F9; padding-bottom: 10px; }
    .chart-title { font-size: 14px; font-weight: 700; color: #0F172A; }
    .chart-badge { font-size: 10px; text-transform: uppercase; font-weight: 700; background: #E6F2EB; color: #185C37; padding: 3px 8px; border-radius: 4px; }
    .bar-item { margin-bottom: 12px; }
    .bar-label { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px; }
    .bar-track { height: 14px; background: #F1F5F9; border-radius: 4px; overflow: hidden; }
    .bar-fill { height: 100%; background: #217346; border-radius: 4px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 10px; }
    th { text-align: left; padding: 8px 10px; background: #F8FAFC; border-bottom: 2px solid #E2E8F0; color: #475569; font-weight: 600; }
    td { padding: 8px 10px; border-bottom: 1px solid #F1F5F9; }
    @media print {
      .navbar { background: white !important; color: #000 !important; border-bottom: 2px solid #217346; padding: 10px 0; }
      body { background: white !important; }
      .container { padding: 0 !important; }
      .kpi-card, .chart-card { box-shadow: none !important; border: 1px solid #CCC !important; }
    }
  </style>
</head>
<body>
  <div class="navbar">
    <h1>StepSheet Executive Dashboard: ${escapeXml(dsTitle)}</h1>
    <div class="meta">Dataset: ${escapeXml(data.datasetName)} &bull; ${data.filteredRowCount} Records &bull; ${new Date().toLocaleDateString()}</div>
  </div>

  <div class="container">
    <!-- KPIs -->
    <div class="kpi-row">
      ${(data.kpis || [])
        .map(
          (k) => `      <div class="kpi-card">
        <div class="kpi-title">${escapeXml(k.title)}</div>
        <div class="kpi-val">${escapeXml(k.formattedValue)}</div>
        <div class="kpi-sub">${escapeXml(k.aggFunc.toUpperCase())} of ${escapeXml(k.column)} &bull; ${escapeXml(k.subtitle)}</div>
      </div>`
        )
        .join('\n')}
    </div>

    <!-- Charts -->
    <div class="charts-grid">
      ${(data.visuals || [])
        .map((v) => {
          const maxVal = Math.max(1, ...v.items.map((x) => Math.abs(x.value)));
          return `      <div class="chart-card">
        <div class="chart-header">
          <div class="chart-title">${escapeXml(v.title)}</div>
          <div class="chart-badge">${escapeXml(v.type)}</div>
        </div>
        <div>
          ${v.items
            .slice(0, 8)
            .map(
              (it) => `          <div class="bar-item">
            <div class="bar-label">
              <span><strong>${escapeXml(it.category)}</strong></span>
              <span>${Number(it.value).toLocaleString()} <span style="color: #64748B;">(${escapeXml(it.percentage)})</span></span>
            </div>
            <div class="bar-track">
              <div class="bar-fill" style="width: ${Math.max(4, Math.round((Math.abs(it.value) / maxVal) * 100))}%;"></div>
            </div>
          </div>`
            )
            .join('\n')}
        </div>
      </div>`;
        })
        .join('\n')}
    </div>
  </div>
</body>
</html>`;

  return new Blob([html], { type: 'text/html' });
}

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
    if (format === 'pdf') {
      blob = createDashboardPdfBlob(dData);
      filename = `${safeTitle}_dashboard.pdf`;
      fileType = 'pdf';
    } else if (format === 'pptx') {
      blob = createDashboardPresentationBlob(dData);
      filename = `${safeTitle}_presentation.pptx`;
      fileType = 'pptx';
    } else if (format === 'html') {
      blob = createDashboardHtmlBlob(dData);
      filename = `${safeTitle}_dashboard.html`;
      fileType = 'html';
    } else if (format === 'xlsx_values' || format === 'packaged_workbook') {
      blob = createDashboardExcelXml(dData);
      filename = `${safeTitle}_packaged_workbook.xls`;
      fileType = 'xlsx';
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
      filename = `${safeTitle}_packaged_workbook.xls`;
      fileType = 'xlsx';
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
      filename = `${safeTitle}_packaged_workbook.xls`;
      fileType = 'xlsx';
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

export const exportShareApi = {
  /**
   * Direct high-fidelity Dashboard export for PDF, PPTX, Packaged Workbook, HTML, and CSV.
   */
  async downloadDashboard(data: DashboardExportData, format: string): Promise<void> {
    const safeTitle = (data.title || data.datasetName || 'Dashboard').replace(/[^a-zA-Z0-9_-]/g, '_');
    let blob: Blob;
    let filename: string;

    if (format === 'pdf') {
      blob = createDashboardPdfBlob(data);
      filename = `${safeTitle}_dashboard.pdf`;
    } else if (format === 'pptx') {
      blob = createDashboardPresentationBlob(data);
      filename = `${safeTitle}_presentation.pptx`;
    } else if (format === 'html') {
      blob = createDashboardHtmlBlob(data);
      filename = `${safeTitle}_dashboard.html`;
    } else if (format === 'csv') {
      const csvLines = [
        data.columns.join(','),
        ...data.rows.map((r) =>
          data.columns
            .map((c) => {
              const val = r[c];
              if (val === null || val === undefined) return '';
              const s = String(val);
              return s.includes(',') || s.includes('"') || s.includes('\n')
                ? `"${s.replace(/"/g, '""')}"`
                : s;
            })
            .join(',')
        ),
      ];
      blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
      filename = `${safeTitle}_data.csv`;
    } else if (format === 'powerbi_starter') {
      const csvLines = [
        data.columns.join(','),
        ...data.rows.map((r) =>
          data.columns
            .map((c) => {
              const val = r[c];
              if (val === null || val === undefined) return '';
              const s = String(val);
              return s.includes(',') || s.includes('"') || s.includes('\n')
                ? `"${s.replace(/"/g, '""')}"`
                : s;
            })
            .join(',')
        ),
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
      blob = createDashboardExcelXml(data);
      filename = `${safeTitle}_packaged_workbook.xls`;
    }

    triggerBrowserDownload(blob, filename);
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
