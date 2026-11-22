/**
 * Quick Download / Export & Share in the browser app: "Excel" is a real
 * .xlsx (not Excel 2003 XML), every row is exported (no 50,000-row cap), and
 * CSV cells are guarded against formula injection.
 */
import { describe, it, expect, vi } from 'vitest';
import JSZip from 'jszip';
import { localEngine, __resetLocalStoreForTests } from '../api/localEngine';
import { exportShareApi } from '../api/exportShareApi';

const csvFile = (t: string, name: string) => ({ name, type: 'text/csv', size: t.length, text: async () => t, arrayBuffer: async () => new TextEncoder().encode(t).buffer }) as any;
const read = (b: Blob, as: 'text' | 'buf') => new Promise<any>((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); as === 'text' ? fr.readAsText(b) : fr.readAsArrayBuffer(b); });

async function download(datasetId: string, format: string, steps: any[] = []) {
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
  let captured: Blob | null = null;
  const orig = URL.createObjectURL;
  URL.createObjectURL = ((b: Blob) => { captured = b; return 'blob:x'; }) as any;
  try {
    const job = await exportShareApi.createJob({ project_id: 'p', dataset_id: datasetId, format, row_scope: 'all', steps } as any);
    const done = await exportShareApi.pollJobUntilDone(job.job_id);
    const f = done.files![0];
    await exportShareApi.downloadFile(done.job_id, f.file_id, f.filename);
    return { filename: f.filename, blob: captured as unknown as Blob };
  } finally {
    URL.createObjectURL = orig;
    vi.unstubAllGlobals();
  }
}

describe('quick download', () => {
  it('Excel is a real .xlsx with every row (60,000 > old 50,000 cap)', async () => {
    __resetLocalStoreForTests();
    const lines = ['id,name'];
    for (let i = 1; i <= 60000; i++) lines.push(`${i},n${i}`);
    const ds = await localEngine.uploadDataset(csvFile(lines.join('\n'), 'big.csv'), 'big');
    const { filename, blob } = await download(ds.id, 'xlsx_values');
    expect(filename).toMatch(/\.xlsx$/);
    const buf = new Uint8Array(await read(blob, 'buf'));
    expect([buf[0], buf[1]]).toEqual([0x50, 0x4b]); // zip
    const zip = await JSZip.loadAsync(buf);
    const sheet = await zip.file('xl/worksheets/sheet1.xml')!.async('string');
    expect(sheet).toContain('<row r="60001">');
  }, 60000);

  it('CSV has every row of the pipeline and neutralises formulas', async () => {
    __resetLocalStoreForTests();
    const ds = await localEngine.uploadDataset(csvFile('x,y\n"=HYPERLINK(""http://evil"",""x"")",1\n@SUM(A1),2\nok,3\n', 'inj.csv'), 'inj');
    const steps = [{ id: 'f', label: 'f', type: 'filter_rows', enabled: true, params: { conditions: [{ column: 'y', operator: 'gte', value: '1' }] } }];
    const { filename, blob } = await download(ds.id, 'csv', steps);
    expect(filename).toMatch(/\.csv$/);
    const lines = (await read(blob, 'text')).replace(/^﻿/, '').trim().split(/\r?\n/);
    expect(lines.length).toBe(4);
    expect(lines.slice(1).some((l: string) => /^"?[=@]/.test(l))).toBe(false);
  });
});
