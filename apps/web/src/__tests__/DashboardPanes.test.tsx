import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { DashboardModal } from '../components/dashboard/DashboardModal';
import { useWorkbenchStore } from '../store/workbenchStore';
import { exportShareApi } from '../api/exportShareApi';

describe('DashboardModal Power BI-Style Panes (Filters | Visualizations | Data)', () => {
  beforeEach(() => {
    useWorkbenchStore.setState({
      datasets: [
        {
          id: 'orders',
          name: 'Orders',
          original_filename: 'orders.csv',
          file_format: 'csv',
          row_count: 100,
          column_count: 2,
          file_size_bytes: 1024,
          schema_metadata: [
            { name: 'amount', data_type: 'float', physical_type: 'FLOAT', nullable: false },
            { name: 'category', data_type: 'text', physical_type: 'VARCHAR', nullable: false },
          ],
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      ],
      selectedDataset: null,
    });
  });

  it('renders all three side panes (Filters, Visualizations, Data) with proper headers', () => {
    render(<DashboardModal isOpen={true} onClose={() => {}} />);

    // 1. Check pane existence
    expect(screen.getByTestId('dashboard-filters-pane')).toBeDefined();
    expect(screen.getByTestId('dashboard-visualizations-pane')).toBeDefined();
    expect(screen.getByTestId('dashboard-data-pane')).toBeDefined();

    // 2. Check pane titles
    expect(screen.getByText('Filters')).toBeDefined();
    expect(screen.getByText('Visualizations')).toBeDefined();
    expect(screen.getByText('Data')).toBeDefined();
  });

  it('allows collapsing and expanding panes via chevron collapse buttons', () => {
    render(<DashboardModal isOpen={true} onClose={() => {}} />);

    const collapseFiltersBtn = screen.getByTestId('pane-collapse-filters');
    fireEvent.click(collapseFiltersBtn);

    // Filters pane should now be collapsed into slim 32px strip
    const strip = screen.getByTestId('pane-strip-filters');
    expect(strip).toBeDefined();

    // Clicking the strip should re-expand it
    fireEvent.click(strip);
    expect(screen.getByTestId('dashboard-filters-pane')).toBeDefined();
  });

  it('switches between Build visual, Format, and Theme tabs in Visualizations pane', () => {
    render(<DashboardModal isOpen={true} onClose={() => {}} />);

    // Click Format tab
    const formatTab = screen.getByRole('button', { name: /Format/i });
    fireEvent.click(formatTab);
    expect(screen.getByPlaceholderText('Search format settings')).toBeDefined();

    // Click Theme tab
    const themeTab = screen.getByRole('button', { name: /Theme/i });
    fireEvent.click(themeTab);
    expect(screen.getByText('Dashboard Color Theme')).toBeDefined();
    expect(screen.getByLabelText('Visualizations Theme Palette')).toBeDefined();

    // Switch back to Build visual tab
    const buildTab = screen.getByRole('button', { name: /Build/i });
    fireEvent.click(buildTab);
    expect(screen.getByText('Visualizations Pane')).toBeDefined();
  });

  it('supports searching within the Data pane and expanding table trees', () => {
    render(<DashboardModal isOpen={true} onClose={() => {}} />);

    const dataSearchInput = screen.getByPlaceholderText('Search data fields');
    expect(dataSearchInput).toBeDefined();

    // Filter fields by search
    fireEvent.change(dataSearchInput, { target: { value: 'amount' } });
    expect((dataSearchInput as HTMLInputElement).value).toBe('amount');
  });

  it('handles keyboard shortcuts Alt+1, Alt+2, Alt+3 to toggle panes', () => {
    render(<DashboardModal isOpen={true} onClose={() => {}} />);

    // Alt+1 toggles Filters
    fireEvent.keyDown(window, { key: '1', altKey: true });
    expect(screen.getByTestId('pane-strip-filters')).toBeDefined();

    // Alt+1 again re-opens Filters
    fireEvent.keyDown(window, { key: '1', altKey: true });
    expect(screen.getByTestId('dashboard-filters-pane')).toBeDefined();

    // Alt+2 toggles Visualizations
    fireEvent.keyDown(window, { key: '2', altKey: true });
    expect(screen.getByTestId('pane-strip-visualizations')).toBeDefined();

    // Alt+3 toggles Data
    fireEvent.keyDown(window, { key: '3', altKey: true });
    expect(screen.getByTestId('pane-strip-data')).toBeDefined();
  });

  it('renders Download and Share buttons in the dashboard portion and opens dropdowns', () => {
    render(<DashboardModal isOpen={true} onClose={() => {}} />);

    // 1. Verify Download and Share buttons exist in the dashboard header
    const downloadBtn = screen.getByTestId('dashboard-download-btn');
    const shareBtn = screen.getByTestId('dashboard-share-btn');
    expect(downloadBtn).toBeDefined();
    expect(shareBtn).toBeDefined();

    // 2. Click Download dropdown chevron to open options
    const downloadDropdownBtn = screen.getByTestId('dashboard-download-dropdown-btn');
    fireEvent.click(downloadDropdownBtn);
    expect(screen.getByText('Universal Packaged Workbook (.sswb.html)')).toBeDefined();
    expect(screen.getByText('StepSheet Package (.sswb)')).toBeDefined();
    expect(screen.getByText('Export & Share Studio...')).toBeDefined();
    expect(screen.getByText('Packaged Workbook (.xls)')).toBeDefined();
    expect(screen.getByText('PDF Executive Dashboard (.pdf)')).toBeDefined();

    // 3. Click Share dropdown chevron to open share options
    const shareDropdownBtn = screen.getByTestId('dashboard-share-dropdown-btn');
    fireEvent.click(shareDropdownBtn);
    expect(screen.getByText('Shareable Link & Access...')).toBeDefined();
    expect(screen.getByText('Copy Dashboard Link')).toBeDefined();
  });

  it('renders Full Screen toggle button and toggles full screen mode', () => {
    render(<DashboardModal isOpen={true} onClose={() => {}} />);
    const fullScreenBtn = screen.getByTestId('dashboard-fullscreen-btn');
    expect(fullScreenBtn).toBeDefined();
    expect(fullScreenBtn.getAttribute('title')).toContain('Expand to Full Screen');

    fireEvent.click(fullScreenBtn);
    expect(fullScreenBtn.getAttribute('title')).toContain('Exit Full Screen');
  });

  it('triggers deliverable generation and download when clicking Download button', async () => {
    const downloadSpy = vi.spyOn(exportShareApi, 'downloadDashboard').mockResolvedValue(undefined);
    render(<DashboardModal isOpen={true} onClose={() => {}} />);
    const downloadBtn = screen.getByTestId('dashboard-download-btn');
    fireEvent.click(downloadBtn);
    await waitFor(() => {
      expect(downloadSpy).toHaveBeenCalled();
    });
    downloadSpy.mockRestore();
  });

  it('creates a fresh blank canvas on Add Page without duplicating existing tiles, and duplicates only via explicit Duplicate button', async () => {
    if (typeof localStorage !== 'undefined' && typeof localStorage.clear === 'function') {
      localStorage.clear();
    }
    const testDataset = {
      id: 'orders',
      name: 'Orders',
      original_filename: 'orders.csv',
      file_format: 'csv' as const,
      row_count: 100,
      column_count: 2,
      file_size_bytes: 1024,
      schema_metadata: [
        { name: 'amount', data_type: 'float', physical_type: 'FLOAT', nullable: false },
        { name: 'category', data_type: 'text', physical_type: 'VARCHAR', nullable: false },
      ],
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
    };
    useWorkbenchStore.setState({
      datasets: [testDataset as any],
      selectedDataset: testDataset as any,
      columns: [
        { name: 'amount', data_type: 'float', physical_type: 'FLOAT', nullable: false },
        { name: 'category', data_type: 'text', physical_type: 'VARCHAR', nullable: false },
      ],
      rows: [
        { amount: 100, category: 'Hardware' },
        { amount: 200, category: 'Software' },
      ],
    });

    render(<DashboardModal isOpen={true} onClose={() => {}} />);

    // Initially Page 1 has default tiles
    await waitFor(() => {
      expect(screen.getByTestId('page-tab-page_1')).toBeDefined();
    });

    // Click Add Page button
    const addPageBtn = screen.getByTestId('add-dashboard-page-btn');
    expect(addPageBtn).toBeDefined();
    fireEvent.click(addPageBtn);

    // Page 2 tab should now exist and be active
    await waitFor(() => {
      expect(screen.getByTestId('page-tab-page_2')).toBeDefined();
    });

    // The fresh canvas empty state must be displayed for Page 2
    expect(screen.getByTestId('fresh-page-empty-state')).toBeDefined();
    expect(screen.getByText(/Fresh Canvas — Page 2/i)).toBeDefined();

    // Switch back to Page 1
    fireEvent.click(screen.getByTestId('page-tab-page_1'));
    // Page 1 should NOT show fresh page empty state (it has its default tiles)
    expect(screen.queryByTestId('fresh-page-empty-state')).toBeNull();

    // Now test duplicate functionality on Page 1
    const duplicatePage1Btn = screen.getByTestId('duplicate-page-btn-page_1');
    expect(duplicatePage1Btn).toBeDefined();
    fireEvent.click(duplicatePage1Btn);

    // Duplicated page tab should exist
    await waitFor(() => {
      expect(screen.getAllByText('Page 1 (Copy)').length).toBeGreaterThan(0);
    });

    // Duplicated page should NOT be empty since it clones Page 1's visuals
    expect(screen.queryByTestId('fresh-page-empty-state')).toBeNull();

    // Switch back to Page 2 (the fresh blank page) - it must still be empty!
    fireEvent.click(screen.getByTestId('page-tab-page_2'));
    expect(screen.getByTestId('fresh-page-empty-state')).toBeDefined();
  });

  it('renders distinct dynamic delta badges and subtitles for each KPI card instead of hardcoding +14.2% on all cards', () => {
    const testDataset = {
      id: 'orders',
      name: 'Orders',
      original_filename: 'orders.csv',
      file_format: 'csv' as const,
      row_count: 100,
      column_count: 2,
      file_size_bytes: 1024,
      schema_metadata: [
        { name: 'amount', data_type: 'float', physical_type: 'FLOAT', nullable: false },
        { name: 'category', data_type: 'text', physical_type: 'VARCHAR', nullable: false },
      ],
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
    };
    useWorkbenchStore.setState({
      datasets: [testDataset as any],
      selectedDataset: testDataset as any,
      columns: [
        { name: 'amount', data_type: 'float', physical_type: 'FLOAT', nullable: false },
        { name: 'category', data_type: 'text', physical_type: 'VARCHAR', nullable: false },
      ],
      rows: [
        { amount: 100, category: 'Hardware' },
        { amount: 200, category: 'Software' },
      ],
    });

    render(<DashboardModal isOpen={true} onClose={() => {}} />);

    // Default KPI cards are kpi_1, kpi_2, kpi_3, kpi_4
    const badge1 = screen.getByTestId('kpi-delta-badge-kpi_1');
    const badge2 = screen.getByTestId('kpi-delta-badge-kpi_2');
    const badge3 = screen.getByTestId('kpi-delta-badge-kpi_3');
    const badge4 = screen.getByTestId('kpi-delta-badge-kpi_4');

    expect(badge1).toBeDefined();
    expect(badge2).toBeDefined();
    expect(badge3).toBeDefined();
    expect(badge4).toBeDefined();

    // Verify badges do NOT all contain '+14.2% vs target'
    const allBadgesText = [
      badge1.textContent,
      badge2.textContent,
      badge3.textContent,
      badge4.textContent,
    ];

    // Card 4 is Distinct categories, its badge should be DISTINCT, not +14.2%
    expect(badge4.textContent).toContain('DISTINCT');
    // Ensure badges are distinct and not all identical
    const uniqueBadges = new Set(allBadgesText);
    expect(uniqueBadges.size).toBeGreaterThan(1);
  });

  it('shows the trend badge\'s comparison period inline, not only on hover (regression)', async () => {
    const testDataset = {
      id: 'orders-mom-badge-test',
      name: 'Orders',
      original_filename: 'orders.csv',
      file_format: 'csv' as const,
      row_count: 4,
      column_count: 3,
      file_size_bytes: 1024,
      schema_metadata: [
        { name: 'amount', data_type: 'float', physical_type: 'FLOAT', nullable: false },
        { name: 'category', data_type: 'text', physical_type: 'VARCHAR', nullable: false },
        { name: 'order_date', data_type: 'text', physical_type: 'VARCHAR', nullable: false },
      ],
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
    };
    // Seed a saved dashboard config (what a real AI-generated MoM KPI subtitle
    // looks like) so the modal loads a KPI card whose subtitle embeds a
    // percentage and a comparison period, matching the format
    // generateAiDashboard actually produces.
    window.localStorage.setItem(
      'stepsheet_dashboards_v3',
      JSON.stringify({
        [testDataset.id]: {
          dashboardTitle: 'Orders Dashboard',
          paletteId: 'v22',
          slicerColumns: [],
          visuals: [
            { id: 'vis_1', title: 'Amount by Category', type: 'column', categoryCol: 'category', valueCol: 'amount', aggFunc: 'sum' },
          ],
          kpiCards: [
            {
              id: 'kpi_1',
              title: 'Total Amount',
              column: 'amount',
              aggFunc: 'sum',
              subtitle: '+9.1% MoM: 1.2K in 2025-10 (2 rows) vs 1.5K in 2025-09 (2 rows)',
              accentColor: '#10B981',
            },
          ],
        },
      })
    );

    useWorkbenchStore.setState({
      datasets: [testDataset as any],
      selectedDataset: testDataset as any,
      columns: testDataset.schema_metadata as any,
      rows: [
        { amount: 1000, category: 'Hardware', order_date: '2025-10-01' },
        { amount: 1200, category: 'Hardware', order_date: '2025-10-15' },
        { amount: 800, category: 'Software', order_date: '2025-09-05' },
        { amount: 700, category: 'Software', order_date: '2025-09-20' },
      ],
    });

    render(<DashboardModal isOpen={true} onClose={() => {}} />);

    const badge1 = await waitFor(() => screen.getByTestId('kpi-delta-badge-kpi_1'));
    // The visible badge text (not just its title/tooltip) must include a
    // short "vs <period>" fragment so the baseline is visible at a glance,
    // instead of being truncated away with only the full detail on hover.
    expect(badge1.textContent).toMatch(/vs\s+2025-09/);

    window.localStorage.removeItem('stepsheet_dashboards_v3');
  });
});

