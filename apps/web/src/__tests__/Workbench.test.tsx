import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { TopBar } from '../components/layout/TopBar';
import { AppendModal } from '../components/joins/AppendModal';
import { JoinBuilderModal } from '../components/joins/JoinBuilderModal';
import { RelationshipsModal } from '../components/joins/RelationshipsModal';
import { ConditionalModal } from '../components/transforms/ConditionalModal';
import { GroupByModal } from '../components/transforms/GroupByModal';
import { NaturalLanguageStepBar } from '../components/ai/NaturalLanguageStepBar';
import { ReviewGeneratedStepModal } from '../components/ai/ReviewGeneratedStepModal';
import { QualityModal } from '../components/quality/QualityModal';
import { ExportModal } from '../components/export/ExportModal';
import { TemplatesModal } from '../components/templates/TemplatesModal';
import { VersionHistoryModal } from '../components/versioning/VersionHistoryModal';
import { ShareModal } from '../components/collab/ShareModal';
import { AuditModal } from '../components/audit/AuditModal';
import { EditStepModal } from '../components/steps/EditStepModal';
import { RightPanel } from '../components/layout/RightPanel';
import { LeftPanel } from '../components/layout/LeftPanel';
import { DataGrid } from '../components/grid/DataGrid';
import { useWorkbenchStore } from '../store/workbenchStore';
import { localEngine } from '../api/localEngine';

describe('StepSheet Workbench', () => {
  it('renders brand name and Share action directly in TopBar', () => {
    render(<TopBar />);
    expect(screen.getByText('StepSheet')).toBeDefined();
    expect(screen.getByText('Workbench')).toBeDefined();
    expect(screen.getByText('Canvas / ER')).toBeDefined();
    expect(screen.getByText('Share')).toBeDefined();
    expect(screen.queryByText('Project')).toBeNull();
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

  it('renders RelationshipsModal with ER Canvas and JoinBuilderModal with health check', async () => {
    render(
      <RelationshipsModal
        isOpen={true}
        onClose={() => {}}
        onOpenJoinBuilder={() => {}}
      />
    );
    expect(screen.getByText('Multi-Table Relationships & ER Canvas')).toBeDefined();
    expect(screen.getByText('Project Datasets (2)')).toBeDefined();

    render(
      <JoinBuilderModal
        isOpen={true}
        onClose={() => {}}
        initialRightDatasetId="d2"
        initialKeyPair={{ left_col: 'id', right_col: 'id' }}
      />
    );
    expect(screen.getByText('Join Builder')).toBeDefined();
    expect(screen.getByText('Apply Join Step')).toBeDefined();

    const health = await localEngine.checkJoinHealth({
      left_dataset_id: 'local-sample-orders',
      right_dataset_id: 'local-sample-customers',
      key_pairs: [{ left_col: 'customer_id', right_col: 'customer_id' }],
      join_type: 'left',
    });
    expect(health.estimated_result_rows).toBeGreaterThan(0);
    expect(Array.isArray(health.type_mismatches)).toBe(true);
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

  it('renders QualityModal with Audit & Health Scorecard tabs', () => {
    const ds = useWorkbenchStore.getState().selectedDataset;
    render(
      <QualityModal
        isOpen={true}
        onClose={() => {}}
        dataset={ds}
        steps={[]}
        columns={[{ name: 'id', data_type: 'integer', physical_type: 'INT64', nullable: false }]}
      />
    );
    expect(screen.getByText('Data Integrity & Quality Suite')).toBeDefined();
    expect(screen.getByText(/Audit Results & Violations/i)).toBeDefined();
    expect(screen.getByText(/Custom Rule Builder/i)).toBeDefined();
  });

  it('renders ExportModal with format options (Excel, CSV, Parquet, JSON, Code, Full Run)', () => {
    const ds = useWorkbenchStore.getState().selectedDataset;
    render(
      <ExportModal
        isOpen={true}
        onClose={() => {}}
        dataset={ds}
        steps={[]}
      />
    );
    expect(screen.getByText('Export & Output Suite')).toBeDefined();
    expect(screen.getAllByText(/Live Excel Formulas/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Files & Spreadsheets/i)).toBeDefined();
  });

  it('renders TemplatesModal with Catalog and Save tabs', () => {
    const ds = useWorkbenchStore.getState().selectedDataset;
    render(
      <TemplatesModal
        isOpen={true}
        onClose={() => {}}
        dataset={ds}
        columns={[{ name: 'id', data_type: 'integer', physical_type: 'INT64', nullable: false }]}
        currentSteps={[]}
        onApplySteps={() => {}}
      />
    );
    expect(screen.getByText('Pipeline Templates & Reusability')).toBeDefined();
    expect(screen.getByText('Template Catalog')).toBeDefined();
  });

  it('renders VersionHistoryModal with Timeline and Diff tabs', () => {
    render(
      <VersionHistoryModal
        isOpen={true}
        onClose={() => {}}
        projectId="test-proj-id"
        currentSteps={[]}
        onRestoreSteps={() => {}}
      />
    );
    expect(screen.getByText('Project Versioning & Step Diff')).toBeDefined();
    expect(screen.getByText(/Version Timeline/i)).toBeDefined();
    expect(screen.getByText('Step Diff & Comparison')).toBeDefined();
  });

  it('renders ShareModal with roles and link generator', () => {
    render(
      <ShareModal
        isOpen={true}
        onClose={() => {}}
        projectId="test-proj-id"
        projectTitle="Test Project"
      />
    );
    expect(screen.getByText('Share Project & Access Control')).toBeDefined();
    expect(screen.getByText('Viewer')).toBeDefined();
    expect(screen.getByText('Editor')).toBeDefined();
    expect(screen.getByText('Generate Share Link')).toBeDefined();
  });

  it('renders AuditModal with governance trail and filters', () => {
    render(
      <AuditModal
        isOpen={true}
        onClose={() => {}}
        projectId="test-proj-id"
      />
    );
    expect(screen.getByText('Audit Trail & Governance')).toBeDefined();
    expect(screen.getByText('All Actions')).toBeDefined();
    expect(screen.getByText('Versions')).toBeDefined();
  });

  it('renders EditStepModal with parameter inputs and step label', () => {
    useWorkbenchStore.setState({
      isEditStepModalOpen: true,
      editingStep: {
        id: 'step-edit-1',
        type: 'change_type',
        label: 'Change amount to float',
        enabled: true,
        params: { column: 'amount', target_type: 'float' },
      },
      columns: [
        { name: 'amount', data_type: 'text', physical_type: 'VARCHAR', nullable: true },
      ],
    });

    render(<EditStepModal />);
    expect(screen.getByText('Edit Applied Step')).toBeDefined();
    expect(screen.getByDisplayValue('Change amount to float')).toBeDefined();
    expect(screen.getByText('Save Changes')).toBeDefined();
  });

  it('renders RightPanel with edit button in applied steps list', () => {
    useWorkbenchStore.setState({
      activeTab: 'applied',
      steps: [
        {
          id: 'step-filter-1',
          type: 'filter_rows',
          label: 'Filter rows where amount > 100',
          enabled: true,
          params: { column: 'amount', operator: 'gt', value: '100' },
        },
      ],
    });

    render(<RightPanel />);
    expect(screen.getByText('Filter rows where amount > 100')).toBeDefined();
    expect(screen.getByTitle('Edit Step Parameters')).toBeDefined();
  });

  it('renders LeftPanel with Connections & Queries and preserves steps across tables', async () => {
    const ds1 = {
      id: 'ds-orders',
      name: 'Orders',
      original_filename: 'orders.xlsx',
      file_format: 'xlsx',
      file_size_bytes: 2048,
      row_count: 1000,
      column_count: 8,
      schema_metadata: [
        { name: 'order_id', data_type: 'text' as const, physical_type: 'VARCHAR', nullable: false },
        { name: 'amount', data_type: 'float' as const, physical_type: 'DOUBLE', nullable: true },
      ],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const ds2 = {
      id: 'ds-customers',
      name: 'Customers',
      original_filename: 'customers.csv',
      file_format: 'csv',
      file_size_bytes: 1024,
      row_count: 100,
      column_count: 5,
      schema_metadata: [
        { name: 'customer_id', data_type: 'text' as const, physical_type: 'VARCHAR', nullable: false },
        { name: 'region', data_type: 'text' as const, physical_type: 'VARCHAR', nullable: true },
      ],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const appliedStep = {
      id: 'step-1',
      type: 'filter_rows' as const,
      label: 'Filter amount > 50',
      enabled: true,
      params: { column: 'amount', operator: 'gt', value: '50' },
    };

    useWorkbenchStore.setState({
      datasets: [ds1, ds2],
      selectedDataset: ds1,
      steps: [appliedStep],
      queries: [],
      activeQueryId: null,
      datasetPipelines: {},
      isLeftPanelOpen: true,
    });

    // Switch to ds2 (Customers) to inspect columns
    await useWorkbenchStore.getState().selectDataset('ds-customers');
    expect(useWorkbenchStore.getState().selectedDataset?.id).toBe('ds-customers');
    // Steps on ds1 were auto-saved into Connections & Queries!
    expect(useWorkbenchStore.getState().queries.length).toBeGreaterThanOrEqual(1);
    expect(useWorkbenchStore.getState().queries[0].datasetId).toBe('ds-orders');
    expect(useWorkbenchStore.getState().queries[0].steps.length).toBe(1);

    // Switch back to ds1 (Orders) -> steps are automatically restored!
    await useWorkbenchStore.getState().selectDataset('ds-orders');
    expect(useWorkbenchStore.getState().selectedDataset?.id).toBe('ds-orders');
    expect(useWorkbenchStore.getState().steps.length).toBe(1);
    expect(useWorkbenchStore.getState().steps[0].label).toBe('Filter amount > 50');

    render(<LeftPanel />);
    expect(screen.getByText('Connections & Queries')).toBeDefined();
    expect(screen.getByText('Datasets & Sheets')).toBeDefined();
  });

  it('executes standalone localEngine for single-click HTML mode', async () => {
    const datasets = await localEngine.listDatasets();
    expect(datasets.length).toBeGreaterThanOrEqual(2);

    const aiRes = await localEngine.generateAiStep(
      datasets[0].id,
      'create discounted column = amount - discount'
    );
    expect(aiRes.step.type).toBe('math_transform');
    expect(aiRes.step.params.target_column).toBe('discounted');

    const preview = await localEngine.previewPipeline(datasets[0].id, [aiRes.step]);
    expect(preview.rows.length).toBeGreaterThan(0);
    expect(preview.rows[0].discounted).toBeDefined();
  });

  it('renders DataGrid transitioning from null selectedDataset to loaded dataset and opens column unique values dropdown', () => {
    // 1. Start with selectedDataset: null (simulating initial startup render)
    useWorkbenchStore.setState({
      selectedDataset: null,
      columns: [],
      rows: [],
      allRows: [],
      totalRows: 0,
      filteredRows: 0,
    });

    const { rerender } = render(<DataGrid />);
    expect(screen.getByText('Welcome to StepSheet')).toBeDefined();

    // 2. Transition to loaded dataset (must not violate Rules of Hooks)
    useWorkbenchStore.setState({
      selectedDataset: {
        id: 'ds-test',
        name: 'Customers',
        original_filename: 'customers.csv',
        file_format: 'csv',
        file_size_bytes: 1000,
        row_count: 3,
        column_count: 2,
        schema_metadata: [
          { name: 'region', data_type: 'text', physical_type: 'VARCHAR', nullable: false },
          { name: 'account_tier', data_type: 'text', physical_type: 'VARCHAR', nullable: false },
        ],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      columns: [
        { name: 'region', data_type: 'text', physical_type: 'VARCHAR', nullable: false },
        { name: 'account_tier', data_type: 'text', physical_type: 'VARCHAR', nullable: false },
      ],
      rows: [
        { region: 'North', account_tier: 'Enterprise' },
        { region: 'South', account_tier: 'SMB' },
        { region: 'North', account_tier: 'Mid-Market' },
      ],
      allRows: [
        { region: 'North', account_tier: 'Enterprise' },
        { region: 'South', account_tier: 'SMB' },
        { region: 'North', account_tier: 'Mid-Market' },
      ],
      totalRows: 3,
      filteredRows: 3,
    });

    rerender(<DataGrid />);
    const container = screen.getByTestId('grid-scroll-container');
    expect(container).toBeDefined();
    expect(container.className).toContain('overflow-x-auto');
    expect(container.className).toContain('grid-scrollbar');

    // Open unique values dropdown on 'region' column
    const dropdownBtn = screen.getByTestId('col-dropdown-region');
    expect(dropdownBtn).toBeDefined();
    fireEvent.click(dropdownBtn);

    const dropdownMenu = screen.getByTestId('column-unique-dropdown');
    expect(dropdownMenu).toBeDefined();
    expect(screen.getByText('2 unique')).toBeDefined();
    expect(screen.getByText('North')).toBeDefined();
    expect(screen.getByText('South')).toBeDefined();
  });
});



