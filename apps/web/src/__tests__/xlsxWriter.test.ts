import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { buildXlsx, columnLetter, escapeXmlText, EXCEL_MAX_ROWS } from '../engine/xlsxWriter';

// engine/xlsxWriter.ts replaced ExcelJS for exportExcel (see its header
// comment). These tests pin down the file structure, cell typing and escaping,
// and -- most importantly -- that the output is readable by ExcelJS's own
// reader, which is exactly what StepSheet uses when the exported file is
// re-imported.

const sheetXml = async (bytes: ArrayBuffer) =>
  (await JSZip.loadAsync(bytes)).file('xl/worksheets/sheet1.xml')!.async('string');

describe('xlsxWriter', () => {
  it('maps column indexes to Excel letters', () => {
    expect([0, 1, 25, 26, 27, 51, 52, 701, 702, 16383].map(columnLetter)).toEqual([
      'A', 'B', 'Z', 'AA', 'AB', 'AZ', 'BA', 'ZZ', 'AAA', 'XFD',
    ]);
  });

  it('escapes XML metacharacters and strips control chars XML 1.0 forbids', () => {
    expect(escapeXmlText('a<b & c>d')).toBe('a&lt;b &amp; c&gt;d');
    expect(escapeXmlText('x\u0001y\u0008z\u000B')).toBe('xyz');
    expect(escapeXmlText('tab\tnl\ncr\r')).toBe('tab\tnl\ncr\r');
  });

  it('writes a valid package with the four required parts', async () => {
    const zip = await JSZip.loadAsync(await buildXlsx(['a'], [{ a: 1 }]));
    for (const part of ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/worksheets/sheet1.xml']) {
      expect(zip.file(part), part).not.toBeNull();
    }
  });

  it('types cells: numbers, booleans, strings, real date cells; blanks omitted; non-finite as text', async () => {
    const xml = await sheetXml(
      await buildXlsx(['n', 'b', 's', 'z', 'inf', 'd'], [
        { n: -12.5, b: true, s: 'Tom & <Jerry>', z: null, inf: Infinity, d: new Date(Date.UTC(2024, 0, 2)) },
        { n: 0, b: false, s: '', z: undefined, inf: NaN },
      ]),
    );
    expect(xml).toContain('<c r="A2"><v>-12.5</v></c>');
    expect(xml).toContain('<c r="B2" t="b"><v>1</v></c>');
    expect(xml).toContain('<c r="C2" t="inlineStr"><is><t xml:space="preserve">Tom &amp; &lt;Jerry&gt;</t></is></c>');
    expect(xml).not.toContain('r="D2"');
    expect(xml).toContain('<t xml:space="preserve">Infinity</t>');
    // Dates are real Excel date cells (serial + a date style), not text:
    // 2024-01-02 is serial 45293.
    expect(xml).toContain('<c r="F2" s="2"><v>45293</v></c>');
    expect(xml).toContain('<c r="A3"><v>0</v></c>');
    expect(xml).toContain('<c r="B3" t="b"><v>0</v></c>');
    expect(xml).not.toContain('r="C3"');
    expect(xml).toContain('<t xml:space="preserve">NaN</t>');
  });

  it('round-trips through ExcelJS (the reader StepSheet re-imports .xlsx with)', async () => {
    const rows = [
      { id: 1, name: 'Ünïcødé ✓ 日本', amount: 1234.56, paid: true },
      { id: 2, name: '  leading/trailing  ', amount: null, paid: false },
      { id: 3, name: 'a<b>&"q"', amount: -0.001, paid: true },
    ];
    const bytes = await buildXlsx(['id', 'name', 'amount', 'paid'], rows);
    const ExcelJS: any = (await import('exceljs')).default ?? (await import('exceljs'));
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes);
    const ws = wb.worksheets[0];
    expect(ws.name).toBe('Sheet1');
    expect(ws.rowCount).toBe(4);
    const values = (r: number) => (ws.getRow(r).values as any[]).slice(1);
    expect(values(1)).toEqual(['id', 'name', 'amount', 'paid']);
    expect(values(2)).toEqual([1, 'Ünïcødé ✓ 日本', 1234.56, true]);
    expect(values(3)).toEqual([2, '  leading/trailing  ', undefined, false]);
    expect(values(4)).toEqual([3, 'a<b>&"q"', -0.001, true]);
  }, 15000);

  it('refuses (rather than silently truncating) data beyond Excel\'s row limit', async () => {
    const tooMany = { length: EXCEL_MAX_ROWS } as unknown as Record<string, unknown>[];
    await expect(buildXlsx(['a'], tooMany)).rejects.toThrow(/at most (1,048,575|10,48,575) data rows/);
  });
});
