import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { TopBar } from '../components/layout/TopBar';
import { AppendModal } from '../components/joins/AppendModal';
import { RelationshipsModal } from '../components/joins/RelationshipsModal';
import { useWorkbenchStore } from '../store/workbenchStore';

describe('StepSheet Workbench', () => {
  it('renders brand name and actions in TopBar', () => {
    render(<TopBar />);
    expect(screen.getByText('StepSheet')).toBeDefined();
    expect(screen.getByText('Workbench')).toBeDefined();
    expect(screen.getByText('Canvas / ER')).toBeDefined();
  });

  it('renders AppendModal when open', () => {
    useWorkbenchStore.setState({
      selectedDataset: {
        id: 'd1',
        name: 'Orders',
        file_path: 'orders.parquet',
        parquet_path: 'orders.parquet',
        file_format: 'csv',
        file_size_bytes: 1000,
        row_count: 50,
        column_count: 3,
        schema_metadata: [
          { name: 'id', data_type: 'integer', physical_type: 'INT64', nullable: false },
          { name: 'name', data_type: 'text', physical_type: 'VARCHAR', nullable: true },
        ],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      datasets: [
        {
          id: 'd1',
          name: 'Orders',
          file_path: 'orders.parquet',
          parquet_path: 'orders.parquet',
          file_format: 'csv',
          file_size_bytes: 1000,
          row_count: 50,
          column_count: 3,
          schema_metadata: [],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: 'd2',
          name: 'Customers',
          file_path: 'cust.parquet',
          parquet_path: 'cust.parquet',
          file_format: 'csv',
          file_size_bytes: 1000,
          row_count: 20,
          column_count: 2,
          schema_metadata: [],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
      columns: [
        { name: 'id', data_type: 'integer', physical_type: 'INT64', nullable: false },
        { name: 'name', data_type: 'text', physical_type: 'VARCHAR', nullable: true },
      ],
    });

    render(<AppendModal isOpen={true} onClose={() => {}} />);
    expect(screen.getByText('Append / Union Tables')).toBeDefined();
    expect(screen.getByText('Union All (Default)')).toBeDefined();
    expect(screen.getByText('Match by Column Name')).toBeDefined();
  });

  it('renders RelationshipsModal with ER Canvas', () => {
    render(
      <RelationshipsModal
        isOpen={true}
        onClose={() => {}}
        onOpenJoinBuilder={() => {}}
      />
    );
    expect(screen.getByText('Multi-Table Relationships & ER Canvas')).toBeDefined();
    expect(screen.getByText('Project Datasets (2)')).toBeDefined();
  });
});

