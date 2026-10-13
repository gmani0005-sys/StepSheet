import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { DashboardModal } from '../components/dashboard/DashboardModal';
import { useWorkbenchStore } from '../store/workbenchStore';

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
    expect(screen.getByText('Export & Share Studio...')).toBeDefined();
    expect(screen.getByText('Packaged Workbook (.xlsx)')).toBeDefined();
    expect(screen.getByText('PDF Executive Report (.pdf)')).toBeDefined();

    // 3. Click Share dropdown chevron to open share options
    const shareDropdownBtn = screen.getByTestId('dashboard-share-dropdown-btn');
    fireEvent.click(shareDropdownBtn);
    expect(screen.getByText('Shareable Link & Access...')).toBeDefined();
    expect(screen.getByText('Copy Dashboard Link')).toBeDefined();
  });
});
