/**
 * Defects found by the 120-domain uncleaned-data validation run (finance, pharma,
 * science, manufacturing, IT, space, advertising, edtech and more; each checked against
 * an independent pandas reference): exports' Unicode minus and space-grouped
 * thousands, scientific notation in Clean Numeric, compact and serial dates, blank
 * replacement, padded headers, Excel error and rich-text cells, per-step timing.
 */
import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { localEngine } from '../api/localEngine';
import { parseSharedNumber } from '../engine/values';

const jsonFile = (rows: any[]) => ({ name: 'r.json', type: 'application/json', size: 1, text: async () => JSON.stringify(rows), arrayBuffer: async () => new TextEncoder().encode(JSON.stringify(rows)).buffer }) as any;
const csvFile = (text: string, name = 'c.csv') => ({ name, type: 'text/csv', size: text.length, text: async () => text, arrayBuffer: async () => new TextEncoder().encode(text).buffer }) as any;
const steps = (list: any[]) => list.map((s, i) => ({ id: `u${i}`, label: s.type, enabled: true, ...s }));
const run = async (rows: any[], list: any[]) => {
  const ds = await localEngine.uploadDataset(jsonFile(rows), 'u');
  return localEngine.runPipeline(ds.id, steps(list), 1e6);
};

describe('numbers as exports write them', () => {
  it('reads the Unicode minus, en dash and space-grouped thousands', () => {
    expect(parseSharedNumber('−42')).toBe(-42);
    expect(parseSharedNumber('−$1,234.50')).toBe(-1234.5);
    expect(parseSharedNumber('1 234')).toBe(1234);
    expect(parseSharedNumber('1 234 567,50')).toBe(1234567.5);
    expect(parseSharedNumber('€ 12 500')).toBe(12500);
    expect(parseSharedNumber('12 kg')).toBeNull(); // units need an explicit clean-up step
    expect(parseSharedNumber('Room 12 34')).toBeNull(); // not a grouped number
  });
  it('Clean Numeric reads scientific notation, as Change Type does', async () => {
    const r = await run([{ q: '1.2E+03' }, { q: '(5)' }, { q: 'N/A' }], [{ type: 'math_transform', params: { column: 'q', operation: 'clean_numeric' } }]);
    expect(r.rows.map((x: any) => x.q)).toEqual([1200, -5, null]);
  });
  it('Clean Numeric says which values it could not read, like Change Type', async () => {
    const r = await run([{ q: '12 kg' }, { q: '7' }, { q: 'N/A' }], [{ type: 'math_transform', params: { column: 'q', operation: 'clean_numeric' } }]);
    expect(r.rows.map((x: any) => x.q)).toEqual([null, 7, null]);
    expect(r.stepSummaries[0].warnings).toEqual(['1 value in "q" could not be read as a number and was set to blank (e.g. "12 kg").']);
  });
});

describe('dates only an explicit Change Type reads', () => {
  it('compact yyyymmdd and an Excel serial become dates', async () => {
    const r = await run([{ d: '20260305' }, { d: '46086' }, { d: 46086 }, { d: '20261340' }], [{ type: 'change_type', params: { column: 'd', target_type: 'date' } }]);
    expect(r.rows.map((x: any) => x.d)).toEqual(['2026-03-05', '2026-03-05', '2026-03-05', null]); // month 13 is not a date
  });
});

describe('clean-up steps', () => {
  it('Replace Values in "is blank" mode needs no value to find', async () => {
    const r = await run([{ c: 'A' }, { c: '' }, { c: null }], [{ type: 'replace_values', params: { column: 'c', match_type: 'is_null', replace_value: 'Unknown' } }]);
    expect(r.rows.map((x: any) => x.c)).toEqual(['A', 'Unknown', 'Unknown']);
    expect(r.stepSummaries[0].warnings).toBeUndefined();
  });
  it('every step reports its time and row count', async () => {
    const r = await run([{ a: 1 }, { a: 1 }, { a: 2 }], [{ type: 'remove_duplicates', params: { columns: ['a'], keep: 'first' } }]);
    expect(r.stepSummaries[0].rows_out).toBe(2);
    expect(typeof r.stepSummaries[0].duration_ms).toBe('number');
  });
});

describe('import', () => {
  it('collapses runs of spaces inside CSV headers', async () => {
    const ds = await localEngine.uploadDataset(csvFile('  Row ID ,Txn  Date,Cost  Per Unit\n1,2026-01-01,5\n'));
    expect(ds.schema_metadata.map((c) => c.name)).toEqual(['Row ID', 'Txn Date', 'Cost Per Unit']);
  });
  it('keeps Excel error and rich-text cells as text, never "[object Object]"', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Data');
    ws.addRow(['id', 'price', 'note']);
    ws.addRow([1, { error: '#N/A' }, { richText: [{ text: 'Rush ' }, { text: 'order', font: { bold: true } }] }]);
    ws.addRow([2, { formula: '1/0', result: { error: '#DIV/0!' } }, 'plain']);
    ws.addRow([3, 9.5, null]);
    const buf = new Uint8Array(await wb.xlsx.writeBuffer());
    const ds = await localEngine.uploadDataset({ name: 'e.xlsx', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', size: buf.byteLength, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) } as any);
    const r = await localEngine.runPipeline(ds.id, steps([{ type: 'change_type', params: { column: 'price', target_type: 'float' } }]), 1e6);
    expect(r.rows.map((x: any) => x.note)).toEqual(['Rush order', 'plain', null]);
    expect(r.rows.map((x: any) => x.price)).toEqual([null, null, 9.5]);
    expect(r.stepSummaries[0].warnings?.[0]).toMatch(/"#DIV\/0!"/); // #N/A is a missing value; #DIV/0! is reported, by its text
  });
});
