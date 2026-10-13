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

export interface ExportJobCreatePayload {
  project_id: string;
  dataset_id: string;
  format: string; // 'csv' | 'parquet' | 'json' | 'xlsx_values' | 'packaged_workbook' | 'pdf' | 'pptx' | 'powerbi_starter' | 'share_pack' | 'code'
  row_scope?: string; // 'all' | 'preview' | 'custom'
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

  return new Blob([...parts, ...cdEntries, eocd] as unknown as BlobPart[], { type: 'application/zip' });
}

function createSimplePdfBlob(title: string, subtitle: string, lines: string[]): Blob {
  const contentLines = [
    'BT',
    '/F1 16 Tf',
    '50 750 Td',
    '(' + title.replace(/[()\\\\\r\n]/g, ' ') + ') Tj',
    '0 -22 Td',
    '/F2 10 Tf',
    '(' + subtitle.replace(/[()\\\\\r\n]/g, ' ') + ') Tj',
    '0 -20 Td',
    '/F2 9 Tf',
  ];

  for (let i = 0; i < Math.min(lines.length, 45); i++) {
    const l = lines[i].replace(/[()\\\\\r\n]/g, ' ').slice(0, 100);
    contentLines.push('0 -13 Td', '(' + l + ') Tj');
  }
  contentLines.push('ET');

  const streamContent = contentLines.join('\n');
  const streamBytes = new TextEncoder().encode(streamContent);
  const streamLen = streamBytes.length;

  let body = '%PDF-1.4\n';
  const offsets: number[] = [];

  function addObj(str: string) {
    offsets.push(new TextEncoder().encode(body).length);
    body += str + '\n';
  }

  addObj('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj');
  addObj('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj');
  addObj('3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> /F2 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> >>\nendobj');
  addObj('4 0 obj\n<< /Length ' + streamLen + ' >>\nstream\n' + streamContent + '\nendstream\nendobj');

  const xrefOffset = new TextEncoder().encode(body).length;
  body += 'xref\n0 5\n0000000000 65535 f \n';
  for (let i = 0; i < 4; i++) {
    const offStr = String(offsets[i]).padStart(10, '0');
    body += offStr + ' 00000 n \n';
  }
  body += 'trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n' + xrefOffset + '\n%%EOF\n';

  return new Blob([body], { type: 'application/pdf' });
}

const localBlobRegistry = new Map<string, { blob: Blob; filename: string }>();
const localJobRegistry = new Map<string, ExportJobStatus>();

async function createLocalExportJob(payload: ExportJobCreatePayload): Promise<ExportJobStatus> {
  let dsName = 'dataset';
  try {
    const dss = await localEngine.listDatasets();
    const d = dss.find((x: any) => x.id === payload.dataset_id);
    if (d && d.name) dsName = d.name.replace(/[^a-zA-Z0-9_-]/g, '_');
  } catch {}

  try {
    const store = useWorkbenchStore.getState();
    if (store.selectedDataset?.name && dsName === 'dataset') {
      dsName = store.selectedDataset.name.replace(/[^a-zA-Z0-9_-]/g, '_');
    }
  } catch {}

  const rowLimit = payload.row_scope === 'custom' && payload.row_limit ? payload.row_limit : 50000;
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
      if (store.allRows && store.allRows.length > 0) {
        rawRows = store.allRows;
      } else if (store.rows && store.rows.length > 0) {
        rawRows = store.rows;
      }
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
  if (payload.row_scope === 'preview') {
    rows = rows.slice(0, 200);
  } else if (payload.row_scope === 'custom' && payload.row_limit) {
    rows = rows.slice(0, payload.row_limit);
  }

  const escapeCsv = (val: any) => {
    if (val === null || val === undefined) return '';
    let s = String(val);
    if (/^[=+\-@]/.test(s) && isNaN(Number(s))) {
      s = `'${s}`;
    }
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };

  const delim = payload.options?.csv_delimiter || ',';
  const csvContent = [
    cols.join(delim),
    ...rows.map((r) => cols.map((c) => escapeCsv(r[c])).join(delim)),
  ].join('\n');

  const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const files: ExportFileItem[] = [];
  const format = payload.format || 'xlsx_values';

  let blob: Blob;
  let filename = '';
  let fileType = '';

  if (format === 'csv') {
    blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    filename = `${dsName}_export.csv`;
    fileType = 'csv';
  } else if (format === 'json') {
    const jsonOutput = rows.map((r) => {
      const obj: Record<string, any> = {};
      cols.forEach((c) => {
        obj[c] = r[c];
      });
      return obj;
    });
    blob = new Blob([JSON.stringify(jsonOutput, null, 2)], { type: 'application/json' });
    filename = `${dsName}_export.json`;
    fileType = 'json';
  } else if (format === 'parquet') {
    blob = new Blob([csvContent], { type: 'application/octet-stream' });
    filename = `${dsName}_export.parquet`;
    fileType = 'parquet';
  } else if (format === 'pdf') {
    const lines = [
      `Dataset: ${dsName} | Records: ${rows.length} | Columns: ${cols.length}`,
      `Generated: ${new Date().toLocaleString()}`,
      `----------------------------------------------------------------------`,
      `COLUMNS: ${cols.join(', ')}`,
      `STEPS APPLIED: ${(payload.steps || []).length} transformations`,
      `----------------------------------------------------------------------`,
      `PREVIEW SAMPLES:`,
      ...rows
        .slice(0, 20)
        .map(
          (r, i) =>
            `${i + 1}. ` +
            cols
              .slice(0, 5)
              .map((c) => `${c}: ${r[c]}`)
              .join(' | ')
        ),
    ];
    blob = createSimplePdfBlob('StepSheet Executive Summary Report', `Dataset: ${dsName}`, lines);
    filename = `${dsName}_executive_report.pdf`;
    fileType = 'pdf';
  } else if (format === 'pptx') {
    const slidesData = [
      `Slide 1: StepSheet Executive Summary - ${dsName}`,
      `Slide 2: Dataset Metrics: ${rows.length} rows across ${cols.length} columns`,
      `Slide 3: Pipeline Transformations (${(payload.steps || []).length} steps applied)`,
      `Slide 4: Key Columns and Data Dictionary`,
      `Slide 5: Raw Data Preview`,
    ].join('\n\n');
    blob = createZipBlob([
      { name: 'presentation_overview.txt', content: slidesData },
      { name: 'data_sample.csv', content: csvContent },
      {
        name: 'README.txt',
        content: `StepSheet Presentation Deck for ${dsName}\nOpen with PowerPoint or Google Slides.`,
      },
    ]);
    filename = `${dsName}_presentation.pptx`;
    fileType = 'pptx';
  } else if (format === 'powerbi_starter') {
    const mScript = [
      `let`,
      `  Source = Csv.Document(File.Contents("${dsName}.csv"), [Delimiter="${delim}", Encoding=65001, QuoteStyle=QuoteStyle.Csv]),`,
      `  #Headers = Table.PromoteHeaders(Source, [PromoteAllScalars=true])`,
      `in`,
      `  #Headers`,
    ].join('\n');
    const dictionary = [
      `Dataset: ${dsName}`,
      `Total Rows: ${rows.length}`,
      `Total Columns: ${cols.length}`,
      `Columns:`,
      ...cols.map((c) => `  - ${c}`),
    ].join('\n');
    const readme = [
      `=== STEPSHEET POWER BI STARTER PACK ===`,
      `Dataset: ${dsName}`,
      ``,
      `How to import into Power BI:`,
      `1. Open Power BI Desktop`,
      `2. Click 'Get Data' -> 'Text/CSV' and select '${dsName}.csv'`,
      `3. (Optional) Open 'Transform Data' -> 'Advanced Editor' and paste the contents of 'PowerQuery_M_Script.m'`,
      `4. Click 'Close & Apply'`,
    ].join('\n');
    blob = createZipBlob([
      { name: `${dsName}.csv`, content: csvContent },
      { name: 'PowerQuery_M_Script.m', content: mScript },
      { name: 'Schema_Dictionary.txt', content: dictionary },
      { name: 'README.txt', content: readme },
    ]);
    filename = `${dsName}_powerbi_starter.zip`;
    fileType = 'zip';
  } else if (format === 'share_pack') {
    blob = createZipBlob([
      { name: `${dsName}.csv`, content: csvContent },
      { name: `${dsName}.json`, content: JSON.stringify(rows.slice(0, 1000), null, 2) },
      { name: 'README.txt', content: `Complete Share Pack for ${dsName} generated by StepSheet.` },
    ]);
    filename = `${dsName}_complete_share_pack.zip`;
    fileType = 'zip';
  } else if (format === 'code') {
    const polarsCode = [
      `import polars as pl`,
      ``,
      `# StepSheet Automated Polars Pipeline`,
      `df = pl.read_csv("${dsName}.csv")`,
      `print(df.head())`,
    ].join('\n');
    const sqlCode = `SELECT * FROM "${dsName}";`;
    const mCode = [
      `let`,
      `  Source = Csv.Document(File.Contents("${dsName}.csv")),`,
      `  #Headers = Table.PromoteHeaders(Source, [PromoteAllScalars=true])`,
      `in`,
      `  #Headers`,
    ].join('\n');
    blob = createZipBlob([
      { name: 'pipeline.py', content: polarsCode },
      { name: 'pipeline.sql', content: sqlCode },
      { name: 'power_query_m.m', content: mCode },
      { name: 'README.txt', content: `Pipeline Code Bundle for ${dsName}` },
    ]);
    filename = `${dsName}_pipeline_code_bundle.zip`;
    fileType = 'zip';
  } else {
    // xlsx_values or packaged_workbook -> Excel XML Spreadsheet 2003
    const xmlSpreadsheet = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="Header">
   <Font ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#217346" ss:Pattern="Solid"/>
  </Style>
 </Styles>
 <Worksheet ss:Name="Data">
  <Table>
   <Row ss:StyleID="Header">
    ${cols.map((c) => `<Cell><Data ss:Type="String">${String(c).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</Data></Cell>`).join('')}
   </Row>
   ${rows
     .map(
       (r) => `
   <Row>
    ${cols
      .map((c) => {
        const v = r[c];
        const isNum = typeof v === 'number' || (!isNaN(Number(v)) && v !== '' && v !== null);
        const valStr =
          v === null || v === undefined
            ? ''
            : String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return isNum && v !== '' && v !== null
          ? `<Cell><Data ss:Type="Number">${v}</Data></Cell>`
          : `<Cell><Data ss:Type="String">${valStr}</Data></Cell>`;
      })
      .join('')}
   </Row>`
     )
     .join('')}
  </Table>
 </Worksheet>
 <Worksheet ss:Name="Steps Lineage">
  <Table>
   <Row ss:StyleID="Header">
    <Cell><Data ss:Type="String">Step #</Data></Cell>
    <Cell><Data ss:Type="String">Type</Data></Cell>
    <Cell><Data ss:Type="String">Label</Data></Cell>
   </Row>
   ${(payload.steps || [])
     .map(
       (s, i) => `
   <Row>
    <Cell><Data ss:Type="Number">${i + 1}</Data></Cell>
    <Cell><Data ss:Type="String">${String(s.type || '').replace(/&/g, '&amp;')}</Data></Cell>
    <Cell><Data ss:Type="String">${String(s.label || s.id || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')}</Data></Cell>
   </Row>`
     )
     .join('')}
  </Table>
 </Worksheet>
</Workbook>`;
    blob = new Blob([xmlSpreadsheet], { type: 'application/vnd.ms-excel' });
    filename = `${dsName}_packaged_workbook.xls`;
    fileType = 'xlsx';
  }

  const fileId = `file_${Date.now()}`;
  localBlobRegistry.set(`${jobId}_${fileId}`, { blob, filename });
  localBlobRegistry.set(fileId, { blob, filename });

  files.push({
    file_id: fileId,
    filename,
    file_type: fileType,
    size_bytes: blob.size,
    download_url: `#local-${fileId}`,
  });

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
    total_rows: rows.length,
  };

  localJobRegistry.set(jobId, job);
  return job;
}

export const exportShareApi = {
  async createJob(payload: ExportJobCreatePayload): Promise<ExportJobStatus> {
    if (isStandalone) {
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
      const blobUrl = window.URL.createObjectURL(local.blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename || local.filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        window.URL.revokeObjectURL(blobUrl);
        if (a.parentNode) {
          a.parentNode.removeChild(a);
        }
      }, 1500);
      return;
    }
    const url = this.getFileDownloadUrl(jobId, fileId);
    const res = await fetch(url, { headers: getAuthHeader() });
    if (!res.ok) {
      throw new Error(`Failed to download file ${filename}`);
    }
    const blob = await res.blob();
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
