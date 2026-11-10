import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createDashboardPdfBlob,
  createDashboardExcelXml,
  createDashboardPresentationBlob,
  createDashboardHtmlBlob,
  exportShareApi,
  DashboardExportData,
} from '../api/exportShareApi';

// Polyfill blob.text() for jsdom environment if missing
if (!Blob.prototype.text) {
  Blob.prototype.text = function () {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsText(this);
    });
  };
}

describe('Dashboard Exporter & Deliverables', () => {
  const sampleData: DashboardExportData = {
    title: 'Q3 Executive Performance',
    datasetName: 'Orders_Q3',
    kpis: [
      {
        title: 'Gross Revenue',
        value: 1250000,
        formattedValue: '$1.25M',
        aggFunc: 'sum',
        subtitle: 'Across all active regions',
        column: 'Revenue',
      },
      {
        title: 'Units Sold',
        value: 45000,
        formattedValue: '45.0K',
        aggFunc: 'sum',
        subtitle: 'Delivered orders',
        column: 'Units',
      },
    ],
    visuals: [
      {
        id: 'vis_1',
        title: 'Revenue by Segment',
        type: 'bar',
        categoryCol: 'Segment',
        valueCol: 'Revenue',
        aggFunc: 'sum',
        items: [
          { category: 'Enterprise', value: 750000, percentage: '60.0%', count: 120 },
          { category: 'Consumer', value: 500000, percentage: '40.0%', count: 330 },
        ],
      },
    ],
    filteredRowCount: 450,
    totalRowCount: 450,
    rows: [
      { Segment: 'Enterprise', Revenue: 750000, Units: 25000 },
      { Segment: 'Consumer', Revenue: 500000, Units: 20000 },
    ],
    columns: ['Segment', 'Revenue', 'Units'],
    steps: [{ id: 's1', type: 'filter_rows', label: 'Filter Revenue > 0', enabled: true, params: {} }],
  };

  beforeEach(() => {
    if (!window.URL.createObjectURL) {
      window.URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
    }
    if (!window.URL.revokeObjectURL) {
      window.URL.revokeObjectURL = vi.fn();
    }
  });

  it('creates valid PDF blob with header and content', async () => {
    const blob = createDashboardPdfBlob(sampleData);
    expect(blob).toBeDefined();
    expect(blob.type).toBe('application/pdf');
    expect(blob.size).toBeGreaterThan(100);

    const text = await blob.text();
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text.includes('Q3 Executive Performance')).toBe(true);
  });

  it('creates valid XML Spreadsheet with Workbook namespace and worksheet tabs', async () => {
    const blob = createDashboardExcelXml(sampleData);
    expect(blob).toBeDefined();
    expect(blob.type).toBe('application/vnd.ms-excel');

    const xml = await blob.text();
    expect(xml.includes('urn:schemas-microsoft-com:office:spreadsheet')).toBe(true);
    expect(xml.includes('Dashboard Summary')).toBe(true);
    expect(xml.includes('Underlying Data')).toBe(true);
    expect(xml.includes('Pipeline Lineage')).toBe(true);
    expect(xml.includes('Gross Revenue')).toBe(true);
  });

  it('creates standalone HTML dashboard deck with embedded visual charts', async () => {
    const blob = createDashboardHtmlBlob(sampleData);
    expect(blob.type).toContain('text/html');
    const html = await blob.text();
    expect(html.includes('Q3 Executive Performance')).toBe(true);
    expect(html.includes('Revenue by Segment')).toBe(true);
    expect(html.includes('Enterprise')).toBe(true);
    expect(html.includes('stepsheet-packaged-data')).toBe(true);
  });

  it('creates presentation package zip blob', async () => {
    const blob = createDashboardPresentationBlob(sampleData);
    expect(blob.type).toBe('application/zip');
    expect(blob.size).toBeGreaterThan(100);
  });

  it('downloads dashboard deliverables without throwing errors', async () => {
    const mockClick = vi.fn();
    const origCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const el = origCreateElement(tagName);
      if (tagName === 'a') {
        el.click = mockClick;
      }
      return el;
    });

    // Test PDF
    await exportShareApi.downloadDashboard(sampleData, 'pdf');
    expect(mockClick).toHaveBeenCalled();

    // Test Universal Packaged Workbook (.sswb.html)
    mockClick.mockClear();
    await exportShareApi.downloadDashboard(sampleData, 'sswb_html');
    expect(mockClick).toHaveBeenCalled();

    // Test Packaged Workbook Raw (.sswb)
    mockClick.mockClear();
    await exportShareApi.downloadDashboard(sampleData, 'sswb');
    expect(mockClick).toHaveBeenCalled();

    // Test Packaged Workbook
    mockClick.mockClear();
    await exportShareApi.downloadDashboard(sampleData, 'packaged_workbook');
    expect(mockClick).toHaveBeenCalled();

    // Test PPTX
    mockClick.mockClear();
    await exportShareApi.downloadDashboard(sampleData, 'pptx');
    expect(mockClick).toHaveBeenCalled();
  });
});
