import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { TopBar } from '../components/layout/TopBar';
import { AppendModal } from '../components/joins/AppendModal';
import { RelationshipsModal } from '../components/joins/RelationshipsModal';
import { ConditionalModal } from '../components/transforms/ConditionalModal';
import { GroupByModal } from '../components/transforms/GroupByModal';
import { NaturalLanguageStepBar } from '../components/ai/NaturalLanguageStepBar';
import { ReviewGeneratedStepModal } from '../components/ai/ReviewGeneratedStepModal';
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
        original_filename: 'orders.csv',
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
          original_filename: 'orders.csv',
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
          original_filename: 'cust.csv',
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

  it('renders ConditionalModal with IF / IFS builder', () => {
    render(<ConditionalModal isOpen={true} onClose={() => {}} />);
    expect(screen.getByText('IF / IFS / Conditional Column')).toBeDefined();
    expect(screen.getByText('Add Else If Rule')).toBeDefined();
  });

  it('renders GroupByModal with aggregations', () => {
    render(<GroupByModal isOpen={true} onClose={() => {}} />);
    expect(screen.getByText('Group By & Aggregations')).toBeDefined();
    expect(screen.getByText('Add Aggregation')).toBeDefined();
  });

  it('renders NaturalLanguageStepBar with prompt input and suggestions', () => {
    render(<NaturalLanguageStepBar />);
    expect(screen.getByPlaceholderText(/Describe transformation in plain English/i)).toBeDefined();
    expect(screen.getByText('Create Step')).toBeDefined();
  });

  it('renders ReviewGeneratedStepModal with review requirement', () => {
    render(
      <ReviewGeneratedStepModal
        isOpen={true}
        step={{
          id: 's1',
          type: 'filter_rows',
          label: 'Filter amount > 100',
          enabled: true,
          params: { column: 'amount', operator: 'gt', value: '100' },
        }}
        explanation="Filters dataset to only rows where amount is greater than 100"
        confidence={0.95}
        provider="heuristic"
        onClose={() => {}}
        onApply={() => {}}
      />
    );
    expect(screen.getByText('Review AI Generated Step')).toBeDefined();
    expect(screen.getByText('Review Required')).toBeDefined();
    expect(screen.getByText('Confirm & Apply to Pipeline')).toBeDefined();
  });
});

