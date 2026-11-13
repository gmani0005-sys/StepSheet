import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { TopBar } from '../components/layout/TopBar';
import { AppendModal } from '../components/joins/AppendModal';
import { JoinBuilderModal } from '../components/joins/JoinBuilderModal';
import { XLookupModal } from '../components/joins/XLookupModal';
import { VLookupModal } from '../components/joins/VLookupModal';
import { RelationshipsModal } from '../components/joins/RelationshipsModal';
import { ConditionalModal } from '../components/transforms/ConditionalModal';
import { GroupByModal } from '../components/transforms/GroupByModal';
import { PivotUnpivotModal } from '../components/transforms/PivotUnpivotModal';
import { NaturalLanguageStepBar } from '../components/ai/NaturalLanguageStepBar';
import { ReviewGeneratedStepModal } from '../components/ai/ReviewGeneratedStepModal';
import { QualityModal } from '../components/quality/QualityModal';
import { ExportModal } from '../components/export/ExportModal';
import { TemplatesModal } from '../components/templates/TemplatesModal';
import { VersionHistoryModal } from '../components/versioning/VersionHistoryModal';
import { ShareModal } from '../components/collab/ShareModal';
import { AuditModal } from '../components/audit/AuditModal';
import { DashboardModal } from '../components/dashboard/DashboardModal';
import { EditStepModal } from '../components/steps/EditStepModal';
import { FormulaBuilderModal } from '../components/transforms/FormulaBuilderModal';
import { DataCleaningModal } from '../components/transforms/DataCleaningModal';
import { TableOperationsModal } from '../components/transforms/TableOperationsModal';
import { StepBuilderModal } from '../components/steps/StepBuilderModal';
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
    expect(screen.getByText(/Add Custom Column/i)).toBeDefined();
    expect(screen.getByText('Append New Records Only')).toBeDefined();
    expect(screen.getByText('Upsert / Replace by Key')).toBeDefined();
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

  it('classifies a case-change NL instruction as text_transform, not filter_rows (regression)', async () => {
    const datasets = await localEngine.listDatasets();
    const aiRes = await localEngine.generateAiStep(datasets[0].id, 'capitalize product names');
    expect(aiRes.step.type).toBe('text_transform');
    expect(aiRes.step.params.operation).toBe('proper');
    expect(aiRes.step.params.column).toBe('product');

    const preview = await localEngine.previewPipeline(datasets[0].id, [aiRes.step]);
    expect(preview.rows.length).toBeGreaterThan(0);
    // The product column should now be proper-cased, e.g. "Laptop Pro 15"
    expect(preview.rows[0].product).toMatch(/^[A-Z][a-z]/);
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

  it('verifies all modals, quality checks, column profiles, full dataset runs, code exports, and wizard step types never return undefined fields', async () => {
    const datasets = await localEngine.listDatasets();
    const ordersId = datasets[0].id;
    const custId = datasets[1].id;

    // 1. Column Profile (including median_value and histogram)
    const profile = await localEngine.getColumnProfile(ordersId, 'amount');
    expect(typeof profile.total_count).toBe('number');
    expect(typeof profile.distinct_count).toBe('number');
    expect(typeof profile.median_value).toBe('number');
    expect(Array.isArray(profile.histogram)).toBe(true);

    // 2. Quick Audit & Custom Quality Rules
    const audit = await localEngine.runQuickAudit(ordersId);
    expect(typeof audit.health_score).toBe('number');
    expect(typeof audit.total_rules).toBe('number');
    expect(typeof audit.passed_count).toBe('number');
    expect(typeof audit.failed_count).toBe('number');
    expect(audit.results[0].status).toMatch(/^(pass|fail)$/);
    expect(typeof audit.results[0].label).toBe('string');
    expect(typeof audit.results[0].message).toBe('string');

    const customCheck = await localEngine.runQualityCheck(ordersId, [
      {
        id: 'r1',
        rule_type: 'range',
        column: 'amount',
        label: 'Positive Amount',
        params: { min: 100, max: 500 },
      },
      {
        id: 'r2',
        rule_type: 'allowed_values',
        column: 'region',
        label: 'Allowed Region',
        params: { allowed_values: ['North', 'East'] },
      },
    ]);
    expect(customCheck.total_rules).toBe(2);
    expect(typeof customCheck.results[0].failed_rows_count).toBe('number');

    // 3. UI Wizard Steps (matching exact parameter names emitted by UI Modals)
    const uiSteps: any[] = [
      {
        id: 'w-math',
        type: 'math_transform',
        label: 'Math two_col',
        enabled: true,
        params: {
          mode: 'two_col',
          column1: 'amount',
          column2: 'discount',
          math_operator: 'subtract',
          output_column: 'net_amt',
          round_digits: 2,
        },
      },
      {
        id: 'w-cond',
        type: 'conditional',
        label: 'IF tier',
        enabled: true,
        params: {
          output_column: 'deal_size',
          rules: [{ column: 'amount', operator: 'gte', value: 1000, then_value: 'Large' }],
          else_value: 'Standard',
        },
      },
      {
        id: 'w-text',
        type: 'text_transform',
        label: 'Upper region',
        enabled: true,
        params: {
          column: 'region',
          operation: 'upper',
          output_column: 'region_upper',
        },
      },
      {
        id: 'w-date',
        type: 'date_transform',
        label: 'Extract year',
        enabled: true,
        params: {
          column: 'order_date',
          operation: 'extract_part',
          date_part: 'year',
          output_column: 'order_year',
        },
      },
      {
        id: 'w-win',
        type: 'window_calc',
        label: 'Running sum',
        enabled: true,
        params: {
          calc_type: 'running_sum',
          value_column: 'amount',
          partition_by: ['region'],
          order_by: 'order_date',
          output_column: 'running_amt',
        },
      },
      {
        id: 'w-xlookup',
        type: 'xlookup',
        label: 'Lookup customer name',
        enabled: true,
        params: {
          lookup_column: 'customer_id',
          right_dataset_id: custId,
          right_Lookup_column: 'customer_id',
          return_columns: ['customer_name'],
        },
      },
    ];

    const preview = await localEngine.previewPipeline(ordersId, uiSteps);
    expect(preview.rows.length).toBeGreaterThan(0);
    expect(preview.rows[0].net_amt).toBeDefined();
    expect(preview.rows[0].deal_size).toBeDefined();
    expect(preview.rows[0].region_upper).toBeDefined();
    expect(preview.rows[0].order_year).toBeDefined();
    expect(preview.rows[0].running_amt).toBeDefined();
    expect(preview.rows[0].customer_name).toBeDefined();

    // 4. GroupBy UI Step
    const groupPreview = await localEngine.previewPipeline(ordersId, [
      {
        id: 'w-group',
        type: 'group_by',
        label: 'Group by region',
        enabled: true,
        params: {
          group_by_columns: ['region'],
          aggregations: [{ column: 'amount', function: 'sum', output_name: 'region_total' }],
        },
      },
    ]);
    expect(groupPreview.rows.length).toBeGreaterThan(0);
    expect(groupPreview.rows[0].region_total).toBeDefined();

    // 5. Run Full Pipeline & Export Code
    const fullRun = await localEngine.runFullPipeline(ordersId, uiSteps);
    expect(fullRun.status).toBe('completed');
    expect(typeof fullRun.total_rows).toBe('number');
    expect(typeof fullRun.column_count).toBe('number');
    expect(typeof fullRun.execution_time_ms).toBe('number');

    const exportedCode = await localEngine.exportCode(ordersId, uiSteps);
    expect(typeof exportedCode.sql).toBe('string');
    expect(Array.isArray(exportedCode.excel_formulas)).toBe(true);
    expect(exportedCode.excel_formulas.length).toBeGreaterThan(0);
    expect(typeof exportedCode.excel_formulas[0].step).toBe('string');
    expect(typeof exportedCode.excel_formulas[0].formula).toBe('string');

    // 6. VLOOKUP Step Execution & Separate Wizards
    const vlookupPreview = await localEngine.previewPipeline(ordersId, [
      {
        id: 'w-vlookup',
        type: 'vlookup',
        label: 'VLOOKUP Col #5 (account_tier)',
        enabled: true,
        params: {
          lookup_dataset_id: custId,
          left_key_col: 'customer_id',
          right_key_col: 'customer_id',
          col_index_num: 5,
          return_column: 'account_tier',
          output_column: 'vlookup_tier',
          range_lookup: false,
          if_not_found: 'Not found',
        },
      },
    ]);
    expect(vlookupPreview.rows.length).toBeGreaterThan(0);
    expect(vlookupPreview.rows[0].vlookup_tier).toBeDefined();
    expect(vlookupPreview.steps[0].generated_code.excel_formula).toContain('VLOOKUP');

    render(<XLookupModal isOpen={true} onClose={() => {}} />);
    expect(screen.getByText('XLOOKUP Wizard')).toBeDefined();
    expect(screen.getByText('Apply XLOOKUP Step')).toBeDefined();

    render(<VLookupModal isOpen={true} onClose={() => {}} />);
    expect(screen.getByText('VLOOKUP Wizard')).toBeDefined();
    expect(screen.getByText('Apply VLOOKUP Step')).toBeDefined();

    // 7. EditStepModal Visual Editors for VLOOKUP and XLOOKUP
    useWorkbenchStore.setState({
      datasets,
      selectedDataset: datasets[0],
      columns: datasets[0].schema_metadata,
      isEditStepModalOpen: true,
      editingStep: {
        id: 'edit-vlookup-1',
        type: 'vlookup',
        label: 'VLOOKUP Col #2 (customer_name)',
        enabled: true,
        params: {
          lookup_dataset_id: custId,
          left_key_col: 'customer_id',
          right_key_col: 'customer_id',
          col_index_num: 2,
          return_column: 'customer_name',
          range_lookup: false,
          if_not_found: 'Not found',
        },
      },
    });
    render(<EditStepModal />);
    expect(screen.getAllByText(/1\. Table Array \(Lookup Reference Table\)/i).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText(/FALSE \(0\) — Exact Match/i).length).toBeGreaterThanOrEqual(2);

    // 8. Excel PivotTable Builder & Live Matrix Execution
    const pivotPreview = await localEngine.previewPipeline(ordersId, [
      {
        id: 'w-pivot',
        type: 'pivot',
        label: 'PivotTable: SUM(amount) by region × category',
        enabled: true,
        params: {
          index_columns: ['region'],
          pivot_column: 'category',
          value_column: 'amount',
          agg_func: 'sum',
          include_row_totals: true,
          include_grand_total: true,
        },
      },
    ]);
    expect(pivotPreview.rows.length).toBeGreaterThan(1);
    expect(pivotPreview.rows[0].Row_Total).toBeDefined();
    expect(pivotPreview.rows[pivotPreview.rows.length - 1].region).toBe('Grand Total');
    expect(pivotPreview.steps[0].generated_code.excel_formula).toContain('PIVOTBY');

    const pivotRender = render(
      <PivotUnpivotModal isOpen={false} onClose={() => {}} initialMode="pivot" />
    );
    pivotRender.rerender(
      <PivotUnpivotModal isOpen={true} onClose={() => {}} initialMode="pivot" />
    );
    expect(screen.getByText('Excel PivotTable Builder')).toBeDefined();
    expect(screen.getByText('Live PivotTable Preview')).toBeDefined();
    expect(screen.getByText('Apply PivotTable to Sheet')).toBeDefined();

    // 8b. PivotTable apply is a destructive, in-place reshape of the active
    // sheet (regression: previously applied silently with no warning) - it
    // must be gated behind a confirmation the user can cancel.
    const stepsBeforePivot = useWorkbenchStore.getState().steps.length;
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValueOnce(false);
    fireEvent.click(screen.getByText('Apply PivotTable to Sheet'));
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringMatching(/replace your current sheet view/i));
    expect(useWorkbenchStore.getState().steps.length).toBe(stepsBeforePivot);

    confirmSpy.mockReturnValueOnce(true);
    fireEvent.click(screen.getByText('Apply PivotTable to Sheet'));
    await waitFor(() => {
      expect(useWorkbenchStore.getState().steps.length).toBe(stepsBeforePivot + 1);
    });
    const stepsAfterPivot = useWorkbenchStore.getState().steps;
    expect(stepsAfterPivot[stepsAfterPivot.length - 1]?.type).toBe('pivot');
    confirmSpy.mockRestore();

    // 9. Visual Dashboard & Custom Visuals Studio (with Table, Matrix Table, Legend Editor & Conditional Formatting)
    const dashRender = render(<DashboardModal isOpen={false} onClose={() => {}} />);
    dashRender.rerender(<DashboardModal isOpen={true} onClose={() => {}} />);
    expect(screen.getByText(/Visual Dashboard & Custom Visuals Studio/i)).toBeDefined();
    expect(screen.getByText('Visualizations Pane')).toBeDefined();
    expect(screen.getByText(/Slicers \(Multi-Select\):/i)).toBeDefined();
    expect(screen.getAllByText(/Add KPI Card/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Add Slicer/i).length).toBeGreaterThan(0);
    expect(screen.queryByText('KPI Card')).toBeNull();
    expect(screen.getAllByText('Clustered Bar').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Histogram').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Donut').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Pie').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Table').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Matrix Table').length).toBeGreaterThan(0);
    // The Format pane's title editor is a labelled input (not visible text),
    // and its sections are numbered (a "General" section added in f1a39d8
    // shifted the numbers), so match the section names without their numbers.
    expect(screen.getByLabelText('Edit Visual Title')).toBeDefined();
    expect(screen.getByText(/\d+\. Edit Legend & Colors/i)).toBeDefined();
    expect(screen.getByText(/\d+\. Conditional Formatting/i)).toBeDefined();

    // Verify Legend Position dropdown options (Left, Left Center, Right, Right Center, Top Left, Top Right) update the visual layout
    expect(screen.queryByText(/Place Legend Inside Visual/i)).toBeNull();
    const legendSelect = screen.getByLabelText('Legend Position');
    fireEvent.change(legendSelect, { target: { value: 'left_center' } });
    expect(screen.getByTestId('visual-layout-vis_1').getAttribute('data-legend-pos')).toBe('left_center');
    fireEvent.change(legendSelect, { target: { value: 'right_center' } });
    expect(screen.getByTestId('visual-layout-vis_1').getAttribute('data-legend-pos')).toBe('right_center');
    fireEvent.change(legendSelect, { target: { value: 'top_right' } });
    expect(screen.getByTestId('visual-layout-vis_1').getAttribute('data-legend-pos')).toBe('top_right');
    fireEvent.change(legendSelect, { target: { value: 'left' } });
    expect(screen.getByTestId('visual-layout-vis_1').getAttribute('data-legend-pos')).toBe('left');
    fireEvent.change(legendSelect, { target: { value: 'right' } });
    expect(screen.getByTestId('visual-layout-vis_1').getAttribute('data-legend-pos')).toBe('right');
    fireEvent.change(legendSelect, { target: { value: 'top_left' } });
    expect(screen.getByTestId('visual-layout-vis_1').getAttribute('data-legend-pos')).toBe('top_left');

    // Verify Pie chart renders solid SVG wedge paths (not a Donut ring)
    expect(screen.getByTestId('donut-svg-vis_2')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /Pie/i }));
    const pieSvg = screen.getByTestId('pie-svg-vis_1');
    expect(pieSvg.querySelectorAll('path').length).toBeGreaterThan(0);

    // Verify Global Theme updates both Pie and Donut slice colors
    const themeSelect = screen.getByLabelText('Dashboard Color Theme');
    fireEvent.change(themeSelect, { target: { value: 'sunset' } });
    const piePathsAfterTheme = screen.getByTestId('pie-svg-vis_1').querySelectorAll('path');
    expect(piePathsAfterTheme[0].getAttribute('fill')).toBe('#EA580C');
    const donutCirclesAfterTheme = screen.getByTestId('donut-svg-vis_2').querySelectorAll('circle');
    expect(donutCirclesAfterTheme[0].getAttribute('stroke')).toBe('#EA580C');

    // Verify Data Label Position (Inside End, Outside End, Inside Center) and Data Label Format (Only Totals, Totals and Percentage)
    const labelPosSelect = screen.getByLabelText('Data Label Position');
    const labelFormatSelect = screen.getByLabelText('Data Label Format');
    fireEvent.change(labelPosSelect, { target: { value: 'inside_end' } });
    expect((labelPosSelect as HTMLSelectElement).value).toBe('inside_end');
    fireEvent.change(labelPosSelect, { target: { value: 'inside_center' } });
    expect((labelPosSelect as HTMLSelectElement).value).toBe('inside_center');
    fireEvent.change(labelFormatSelect, { target: { value: 'totals_and_percentage' } });
    expect((labelFormatSelect as HTMLSelectElement).value).toBe('totals_and_percentage');

    // Verify Dashboard Title Text Box option above KPI Cards
    const dashboardTitleInput = screen.getByLabelText('Dashboard Title') as HTMLInputElement;
    expect(dashboardTitleInput).toBeDefined();
    fireEvent.change(dashboardTitleInput, { target: { value: 'Q4 Revenue Performance Dashboard' } });
    expect(dashboardTitleInput.value).toBe('Q4 Revenue Performance Dashboard');

    // Verify Diagonal Mouse Resize on visual tile (width & height updated without blanking)
    const resizeHandle = screen.getByTestId('resize-handle-vis_1');
    fireEvent.mouseDown(resizeHandle, { button: 0, clientX: 400, clientY: 300 });
    fireEvent.mouseMove(window, { clientX: 540, clientY: 390 });
    fireEvent.mouseUp(window);
    const tile1AfterResize = screen.getByTestId('visual-tile-vis_1') as HTMLElement;
    expect(tile1AfterResize.style.width).toBe('620px');
    expect(tile1AfterResize.style.height).toBe('410px');

    // Verify Long-Press Hover & Place/Align in Order
    const dragGrip1 = screen.getByTestId('drag-grip-vis_1');
    fireEvent.mouseDown(dragGrip1, { button: 0 });
    expect(screen.getByTestId('visual-tile-vis_1').getAttribute('data-hover-dragging')).toBe('true');
    expect(screen.getByTestId('hover-badge-vis_1')).toBeDefined();
    fireEvent.mouseEnter(screen.getByTestId('visual-tile-vis_2'));
    fireEvent.mouseUp(window);
    const orderedTiles = screen
      .getByTestId('visuals-canvas-grid')
      .querySelectorAll('[data-visual-tile="true"]');
    expect(orderedTiles[0].getAttribute('data-visual-id')).toBe('vis_2');
    expect(orderedTiles[1].getAttribute('data-visual-id')).toBe('vis_1');

    // Verify Canvas Interaction Toolbar & Position/Size details are removed while Zoom is in the top header
    expect(screen.queryByTestId('canvas-undo-btn')).toBeNull();
    expect(screen.queryByTestId('layout-input-x')).toBeNull();
    expect(screen.getByTestId('canvas-zoom-select')).toBeDefined();

    // Verify Press-and-Hold Left Mouse Freeform Drag on Canvas with Snapping & Alignment Guides
    const tile2 = screen.getByTestId('visual-tile-vis_2') as HTMLElement;
    expect(tile2.style.left).toBe('16px');
    expect(tile2.style.top).toBe('16px');

    fireEvent.mouseDown(tile2, { button: 0, clientX: 50, clientY: 50 });
    // Drag right by ~494px so left edge (16 + 494 = 510) is within 6px of vis_1's left edge (512px) -> snaps to 512px & shows vertical alignment guide!
    fireEvent.mouseMove(window, { clientX: 544, clientY: 130 });
    expect(screen.getAllByTestId('alignment-guide-vertical').length).toBeGreaterThan(0);
    expect(tile2.style.left).toBe('512px');
    expect(tile2.style.top).toBe('96px');
    fireEvent.mouseUp(window);

    // Verify Keyboard Nudging (ArrowRight & ArrowDown +8px grid step)
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect((screen.getByTestId('visual-tile-vis_2') as HTMLElement).style.left).toBe('520px');
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    expect((screen.getByTestId('visual-tile-vis_2') as HTMLElement).style.top).toBe('104px');

    // Verify Keyboard Undo (Ctrl+Z) & Redo (Ctrl+Y)
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    expect((screen.getByTestId('visual-tile-vis_2') as HTMLElement).style.top).toBe('96px');
    fireEvent.keyDown(window, { key: 'y', ctrlKey: true });
    expect((screen.getByTestId('visual-tile-vis_2') as HTMLElement).style.top).toBe('104px');

    // Verify Escape during drag cancels and restores pre-drag coordinates
    const tile2ForEsc = screen.getByTestId('visual-tile-vis_2') as HTMLElement;
    fireEvent.mouseDown(tile2ForEsc, { button: 0, clientX: 50, clientY: 50 });
    fireEvent.mouseMove(window, { clientX: 250, clientY: 200 });
    expect(tile2ForEsc.style.left).not.toBe('520px');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(tile2ForEsc.style.left).toBe('520px');

    // Verify Lock toggle prevents moving a locked visual
    fireEvent.click(screen.getByTestId('lock-visual-btn-vis_2'));
    expect(tile2ForEsc.getAttribute('data-locked')).toBe('true');
    fireEvent.mouseDown(tile2ForEsc, { button: 0, clientX: 50, clientY: 50 });
    fireEvent.mouseMove(window, { clientX: 300, clientY: 250 });
    fireEvent.mouseUp(window);
    expect(tile2ForEsc.style.left).toBe('520px');
    fireEvent.click(screen.getByTestId('lock-visual-btn-vis_2'));
    expect(tile2ForEsc.getAttribute('data-locked')).toBe('false');

    // Verify Multi-Page Dashboards: Bottom Pages Bar, + Add Page, Inline Rename, and Top Page Selector Dropdown
    expect(screen.getByTestId('dashboard-pages-bar')).toBeDefined();
    expect(screen.getByTestId('page-tab-page_1').getAttribute('data-active')).toBe('true');

    // Click "+ Add Page" to create Page 2 and switch to it
    fireEvent.click(screen.getByTestId('add-dashboard-page-btn'));
    expect(screen.getByTestId('page-tab-page_2').getAttribute('data-active')).toBe('true');
    expect((screen.getByTestId('top-page-select') as HTMLSelectElement).value).toBe('page_2');

    // Rename Page 2 inline
    fireEvent.click(screen.getByTestId('edit-page-name-btn-page_2'));
    const renameInput = screen.getByTestId('rename-page-input-page_2') as HTMLInputElement;
    fireEvent.change(renameInput, { target: { value: 'Regional Overview' } });
    fireEvent.click(screen.getByTestId('save-page-name-btn-page_2'));
    expect(screen.getByTestId('page-tab-page_2').textContent).toContain('Regional Overview');

    // Switch back to Page 1 using the Top Page Dropdown
    fireEvent.change(screen.getByTestId('top-page-select'), { target: { value: 'page_1' } });
    expect(screen.getByTestId('page-tab-page_1').getAttribute('data-active')).toBe('true');
    expect((screen.getByLabelText('Dashboard Title') as HTMLInputElement).value).toBe(
      'Q4 Revenue Performance Dashboard'
    );

    // Verify Active Sheet / Connection Query Dropdown in top header allows switching sheets across pages
    const sheetQuerySelect = screen.getByTestId('active-sheet-query-select') as HTMLSelectElement;
    expect(sheetQuerySelect).toBeDefined();
    expect(sheetQuerySelect.innerHTML).toContain('Orders (Sample XLSX)');
    expect(sheetQuerySelect.innerHTML).toContain('Customers (Sample CSV)');

    // Switch to Page 2 and select Customers (Sample CSV) from the Active Sheet / Query dropdown
    fireEvent.change(screen.getByTestId('top-page-select'), { target: { value: 'page_2' } });
    const customersDs = useWorkbenchStore
      .getState()
      .datasets.find((d) => d.name.includes('Customers'));
    if (customersDs) {
      fireEvent.change(sheetQuerySelect, { target: { value: `sheet:${customersDs.id}` } });
    }
    expect(screen.getByTestId('page-tab-page_1')).toBeDefined();
    expect(screen.getByTestId('page-tab-page_2')).toBeDefined();
  });

  it('renders Custom Column in catalog and executes custom column and incremental append in localEngine', async () => {
    // 1. RightPanel catalog contains Custom Column
    useWorkbenchStore.setState({ activeTab: 'catalog' });
    render(<RightPanel />);
    expect(screen.getAllByText('Custom Column').length).toBeGreaterThan(0);

    // 2. StepBuilderModal renders for custom_column
    useWorkbenchStore.setState({
      isStepWizardOpen: true,
      activeWizardStepType: 'custom_column',
      editingStep: null,
    });
    render(<StepBuilderModal />);
    expect(screen.getByText('Add Custom Column')).toBeDefined();
    expect(screen.getByPlaceholderText(/Total_Amount, Profit_Margin/i)).toBeDefined();

    // 3. Test localEngine execution for custom_column
    const baseDataset = {
      meta: {
        id: 'ds-jan',
        name: 'Sales_Jan',
        project_id: 'p1',
        file_id: 'f1',
        file_format: 'csv' as const,
        row_count: 2,
        column_count: 2,
        size_bytes: 100,
        storage_path: '',
        schema_metadata: [
          { name: 'id', data_type: 'integer', nullable: false },
          { name: 'amount', data_type: 'float', nullable: false },
        ],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      rows: [
        { id: 1, amount: 100 },
        { id: 2, amount: 200 },
      ],
    };

    const febDataset = {
      meta: {
        id: 'ds-feb',
        name: 'Sales_Feb',
        project_id: 'p1',
        file_id: 'f2',
        file_format: 'csv' as const,
        row_count: 2,
        column_count: 2,
        size_bytes: 100,
        storage_path: '',
        schema_metadata: [
          { name: 'id', data_type: 'integer', nullable: false },
          { name: 'amount', data_type: 'float', nullable: false },
        ],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      rows: [
        { id: 2, amount: 250 }, // overlapping key
        { id: 3, amount: 300 }, // new key
      ],
    };

    // Execute append with custom column (Month) and append_new_only incremental mode
    const appendStep: any = {
      id: 'step-append-1',
      type: 'append',
      label: 'Append Feb Sales',
      enabled: true,
      params: {
        append_dataset_id: 'ds-feb',
        append_dataset_name: 'Sales_Feb',
        add_custom_column: true,
        custom_column_name: 'Month',
        primary_value: 'January',
        appended_value: 'February',
        incremental_mode: 'append_new_only',
        key_column: 'id',
      },
    };

    const runResult = await localEngine.runPipeline('ds-jan', [appendStep], 100, [baseDataset as any, febDataset as any]);
    expect(runResult.rows.length).toBe(3); // id 1 (Jan), id 2 (Jan), id 3 (Feb) - id 2 from Feb was deduplicated
    expect(runResult.rows[0].Month).toBe('January');
    expect(runResult.rows[1].Month).toBe('January');
    expect(runResult.rows[2].Month).toBe('February');
    expect(runResult.rows[2].id).toBe(3);

    // Test standalone custom_column step with static value
    const customColStep: any = {
      id: 'step-cc-1',
      type: 'custom_column',
      label: 'Add Status Column',
      enabled: true,
      params: {
        new_column: 'Status',
        value: 'Active',
      },
    };
    const ccResult = await localEngine.runPipeline('ds-jan', [customColStep], 100, [baseDataset as any]);
    expect(ccResult.rows[0].Status).toBe('Active');
    expect(ccResult.rows[1].Status).toBe('Active');
  });

  it('supports editing applied aggregation step and synchronizing function, alias, and step label', () => {
    const groupStep: any = {
      id: 'step-group-1',
      type: 'group_by',
      label: 'Group by region (sum_amount)',
      enabled: true,
      params: {
        group_by_columns: ['region'],
        aggregations: [
          { column: 'amount', agg_func: 'sum', function: 'sum', output_column: 'sum_amount', alias: 'sum_amount' },
        ],
      },
    };

    const mockDataset = {
      id: 'ds-agg',
      name: 'Sales',
      original_filename: 'sales.csv',
      file_format: 'csv' as const,
      row_count: 10,
      column_count: 2,
      file_size_bytes: 100,
      schema_metadata: [
        { name: 'region', data_type: 'text', physical_type: 'VARCHAR', nullable: false },
        { name: 'amount', data_type: 'float', physical_type: 'FLOAT', nullable: false },
      ],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    useWorkbenchStore.setState({
      datasets: [mockDataset as any],
      selectedDataset: mockDataset as any,
      columns: mockDataset.schema_metadata as any,
      steps: [groupStep],
      isEditStepModalOpen: true,
      editingStep: groupStep,
    });

    render(<EditStepModal />);
    expect(screen.getByText('Edit Applied Step')).toBeDefined();
    expect(screen.getByDisplayValue('Group by region (sum_amount)')).toBeDefined();

    // Select dropdown for aggregation function
    const funcSelect = screen.getByDisplayValue('SUM');
    expect(funcSelect).toBeDefined();

    // Change agg_func to AVG
    fireEvent.change(funcSelect, { target: { value: 'avg' } });

    // Verify alias and label update
    expect(screen.getByDisplayValue('avg_amount')).toBeDefined();
    expect(screen.getAllByDisplayValue(/avg_amount/i).length).toBe(2);
  });

  it('executes custom column formulas with arithmetic, string functions, and conditionals in localEngine', async () => {
    const dataset = {
      meta: {
        id: 'ds-calc',
        name: 'Orders',
        project_id: 'p1',
        file_id: 'f1',
        file_format: 'csv' as const,
        row_count: 2,
        column_count: 4,
        size_bytes: 200,
        storage_path: '',
        schema_metadata: [
          { name: 'item', data_type: 'text', nullable: false },
          { name: 'price', data_type: 'float', nullable: false },
          { name: 'qty', data_type: 'integer', nullable: false },
          { name: 'category', data_type: 'text', nullable: false },
        ],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      rows: [
        { item: 'Widget Pro', price: 50, qty: 3, category: 'hardware' },
        { item: 'Cloud Sub', price: 120, qty: 1, category: 'software' },
      ],
    };

    // 1. Arithmetic formula: [price] * [qty]
    const stepArith: any = {
      id: 'step-arith',
      type: 'custom_column',
      label: 'Compute Total',
      enabled: true,
      params: {
        new_column: 'Total_Price',
        formula: '[price] * [qty]',
      },
    };
    const resArith = await localEngine.runPipeline('ds-calc', [stepArith], 100, [dataset as any]);
    expect(resArith.rows[0].Total_Price).toBe(150);
    expect(resArith.rows[1].Total_Price).toBe(120);

    // 2. Text formula: UPPER([category])
    const stepText: any = {
      id: 'step-text',
      type: 'custom_column',
      label: 'Upper Category',
      enabled: true,
      params: {
        new_column: 'Cat_Upper',
        formula: 'UPPER([category])',
      },
    };
    const resText = await localEngine.runPipeline('ds-calc', [stepText], 100, [dataset as any]);
    expect(resText.rows[0].Cat_Upper).toBe('HARDWARE');
    expect(resText.rows[1].Cat_Upper).toBe('SOFTWARE');

    // 3. Conditional formula: IF([price] > 100, "High", "Standard")
    const stepCond: any = {
      id: 'step-cond',
      type: 'custom_column',
      label: 'Classify Tier',
      enabled: true,
      params: {
        new_column: 'Price_Tier',
        formula: 'IF([price] > 100, "High", "Standard")',
      },
    };
    const resCond = await localEngine.runPipeline('ds-calc', [stepCond], 100, [dataset as any]);
    expect(resCond.rows[0].Price_Tier).toBe('Standard');
    expect(resCond.rows[1].Price_Tier).toBe('High');
  });

  it('supports multi-table append stacking three datasets in localEngine', async () => {
    const ds1 = {
      meta: {
        id: 'ds-q1',
        name: 'Q1',
        project_id: 'p1',
        file_id: 'f1',
        file_format: 'csv' as const,
        row_count: 1,
        column_count: 2,
        size_bytes: 50,
        storage_path: '',
        schema_metadata: [
          { name: 'id', data_type: 'integer', nullable: false },
          { name: 'val', data_type: 'integer', nullable: false },
        ],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      rows: [{ id: 1, val: 10 }],
    };
    const ds2 = {
      meta: {
        id: 'ds-q2',
        name: 'Q2',
        project_id: 'p1',
        file_id: 'f2',
        file_format: 'csv' as const,
        row_count: 1,
        column_count: 2,
        size_bytes: 50,
        storage_path: '',
        schema_metadata: [
          { name: 'id', data_type: 'integer', nullable: false },
          { name: 'val', data_type: 'integer', nullable: false },
        ],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      rows: [{ id: 2, val: 20 }],
    };
    const ds3 = {
      meta: {
        id: 'ds-q3',
        name: 'Q3',
        project_id: 'p1',
        file_id: 'f3',
        file_format: 'csv' as const,
        row_count: 1,
        column_count: 2,
        size_bytes: 50,
        storage_path: '',
        schema_metadata: [
          { name: 'id', data_type: 'integer', nullable: false },
          { name: 'val', data_type: 'integer', nullable: false },
        ],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      rows: [{ id: 3, val: 30 }],
    };

    const multiAppendStep: any = {
      id: 'step-multi-append',
      type: 'append',
      label: 'Append Q2 and Q3',
      enabled: true,
      params: {
        dataset_ids: ['ds-q2', 'ds-q3'],
      },
    };

    const stacked = await localEngine.runPipeline('ds-q1', [multiAppendStep], 100, [ds1 as any, ds2 as any, ds3 as any]);
    expect(stacked.rows.length).toBe(3);
    expect(stacked.rows.map((r: any) => r.id)).toEqual([1, 2, 3]);
  });

  it('renders FormulaBuilderModal with searchable function catalog and token insertion', () => {
    useWorkbenchStore.setState({
      selectedDataset: {
        id: 'ds-test',
        name: 'Orders',
        project_id: 'p1',
        original_filename: 'test.csv',
        file_format: 'csv',
        row_count: 3,
        column_count: 3,
        file_size_bytes: 100,
        schema_metadata: [
          { name: 'Price', data_type: 'float', physical_type: 'float8', nullable: false },
          { name: 'Qty', data_type: 'integer', physical_type: 'int4', nullable: false },
          { name: 'Email', data_type: 'text', physical_type: 'varchar', nullable: false },
        ],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      columns: [
        { name: 'Price', data_type: 'float' as const, physical_type: 'float8', nullable: false },
        { name: 'Qty', data_type: 'integer' as const, physical_type: 'int4', nullable: false },
        { name: 'Email', data_type: 'text' as const, physical_type: 'varchar', nullable: false },
      ],
      rows: [
        { Price: 19.99, Qty: 2, Email: 'john.doe@example.com' },
        { Price: 150.5, Qty: 1, Email: 'jane.smith@acme.org' },
      ],
    });

    render(<FormulaBuilderModal isOpen={true} onClose={() => {}} />);
    expect(screen.getByText('Guided Formula & Calculated Column Builder')).toBeDefined();
    expect(screen.getByPlaceholderText(/Search functions/i)).toBeDefined();
    expect(screen.getByText('Sample Row Evaluation Preview')).toBeDefined();
  });

  it('evaluates Excel formulas (ROUND, IF, TEXTBEFORE, TEXTAFTER, NETWORKDAYS, EOMONTH, CLEAN) in localEngine', async () => {
    const ds = {
      meta: {
        id: 'ds-calc',
        name: 'CalcTest',
        project_id: 'p1',
        file_id: 'f1',
        file_format: 'csv' as const,
        row_count: 2,
        column_count: 5,
        size_bytes: 100,
        storage_path: '',
        schema_metadata: [
          { name: 'Price', data_type: 'float', nullable: false },
          { name: 'Email', data_type: 'string', nullable: false },
          { name: 'StartDate', data_type: 'string', nullable: false },
          { name: 'EndDate', data_type: 'string', nullable: false },
        ],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      rows: [
        { Price: 19.456, Email: 'alice.wonder@company.com', StartDate: '2026-01-05', EndDate: '2026-01-09' },
        { Price: 120.89, Email: 'bob.builder@acme.org', StartDate: '2026-02-01', EndDate: '2026-02-10' },
      ],
    };

    const steps: any[] = [
      {
        id: 's1',
        type: 'custom_column',
        label: 'Round Price',
        enabled: true,
        params: { new_column: 'Rounded', formula: 'ROUND([Price], 1)' },
      },
      {
        id: 's2',
        type: 'custom_column',
        label: 'User Name',
        enabled: true,
        params: { new_column: 'User', formula: 'TEXTBEFORE([Email], "@")' },
      },
      {
        id: 's3',
        type: 'custom_column',
        label: 'Domain',
        enabled: true,
        params: { new_column: 'Domain', formula: 'TEXTAFTER([Email], "@")' },
      },
      {
        id: 's4',
        type: 'custom_column',
        label: 'WorkDays',
        enabled: true,
        params: { new_column: 'WorkDays', formula: 'NETWORKDAYS([StartDate], [EndDate])' },
      },
      {
        id: 's5',
        type: 'custom_column',
        label: 'PriceTier',
        enabled: true,
        params: { new_column: 'PriceTier', formula: 'IF([Price] > 100, "Premium", "Standard")' },
      },
    ];

    const res = await localEngine.runPipeline('ds-calc', steps, 100, [ds as any]);
    expect(res.rows[0].Rounded).toBe(19.5);
    expect(res.rows[0].User).toBe('alice.wonder');
    expect(res.rows[0].Domain).toBe('company.com');
    expect(res.rows[0].WorkDays).toBe(5);
    expect(res.rows[0].PriceTier).toBe('Standard');
    expect(res.rows[1].PriceTier).toBe('Premium');
  });

  it('renders DataCleaningModal and executes duplicates_only, impute_missing, standardize_values, and flag_outliers in localEngine', async () => {
    useWorkbenchStore.setState({
      selectedDataset: {
        id: 'ds-clean',
        name: 'DirtyData',
        project_id: 'p1',
        original_filename: 'test.csv',
        file_format: 'csv',
        row_count: 5,
        column_count: 3,
        file_size_bytes: 100,
        schema_metadata: [
          { name: 'category', data_type: 'text', physical_type: 'varchar', nullable: false },
          { name: 'amount', data_type: 'float', physical_type: 'float8', nullable: true },
        ],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      columns: [
        { name: 'category', data_type: 'text' as const, physical_type: 'varchar', nullable: false },
        { name: 'amount', data_type: 'float' as const, physical_type: 'float8', nullable: true },
      ],
      rows: [
        { category: 'electr', amount: 100 },
        { category: 'electr', amount: 100 },
        { category: 'Electronics', amount: null },
        { category: 'Books', amount: 50 },
        { category: 'Books', amount: 9999 }, // Outlier
        { category: 'Toys', amount: 55 },
      ],
    });

    render(<DataCleaningModal isOpen={true} onClose={() => {}} />);
    expect(screen.getByText(/Cleaning & Hygiene Studio/i)).toBeDefined();
    expect(screen.getByText(/Audit Duplicates Only/i)).toBeDefined();

    const ds = {
      meta: {
        id: 'ds-clean',
        name: 'DirtyData',
        project_id: 'p1',
        file_id: 'f1',
        file_format: 'csv' as const,
        row_count: 5,
        column_count: 2,
        size_bytes: 100,
        storage_path: '',
        schema_metadata: [
          { name: 'category', data_type: 'string', nullable: false },
          { name: 'amount', data_type: 'float', nullable: true },
        ],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      rows: [
        { category: 'electr', amount: 100 },
        { category: 'electr', amount: 100 },
        { category: 'Electronics', amount: null },
        { category: 'Books', amount: 50 },
        { category: 'Books', amount: 9999 },
        { category: 'Toys', amount: 55 },
      ],
    };

    // Test Duplicates Only mode
    const dedupStep: any = {
      id: 'step-dedup-audit',
      type: 'remove_duplicates',
      label: 'Audit Duplicates',
      enabled: true,
      params: { columns: ['category'], keep: 'duplicates_only' },
    };
    const dedupRes = await localEngine.runPipeline('ds-clean', [dedupStep], 100, [ds as any]);
    expect(dedupRes.rows.length).toBe(4); // 'electr' (2) and 'Books' (2) are duplicated

    // Test Impute Missing (mean)
    const imputeStep: any = {
      id: 'step-impute',
      type: 'impute_missing',
      label: 'Impute Mean',
      enabled: true,
      params: { column: 'amount', strategy: 'mean' },
    };
    const imputeRes = await localEngine.runPipeline('ds-clean', [imputeStep], 100, [ds as any]);
    expect(imputeRes.rows[2].amount).toBeGreaterThan(0);

    // Test Standardize Values (mapping table)
    const stdStep: any = {
      id: 'step-std',
      type: 'standardize_values',
      label: 'Standardize Category',
      enabled: true,
      params: { column: 'category', mapping: { electr: 'Electronics' } },
    };
    const stdRes = await localEngine.runPipeline('ds-clean', [stdStep], 100, [ds as any]);
    expect(stdRes.rows[0].category).toBe('Electronics');

    // Test Flag Outliers (IQR)
    const outlierStep: any = {
      id: 'step-outlier',
      type: 'flag_outliers',
      label: 'Flag Outliers',
      enabled: true,
      params: { column: 'amount', iqr_multiplier: 1.5, output_column: 'is_outlier' },
    };
    const outlierRes = await localEngine.runPipeline('ds-clean', [outlierStep], 100, [ds as any]);
    expect(outlierRes.rows.some((r: any) => r.is_outlier === true)).toBe(true);
  });

  it('renders TableOperationsModal and executes remove_column, reorder_columns, promote_headers, remove_rows, top_bottom_n, and transpose in localEngine', async () => {
    render(<TableOperationsModal isOpen={true} onClose={() => {}} />);
    expect(screen.getByText('Table Structure & Reshape Studio')).toBeDefined();
    expect(screen.getByText('Manage Columns')).toBeDefined();
    expect(screen.getByText('Promote Headers')).toBeDefined();
    expect(screen.getByText('Remove Rows')).toBeDefined();
    expect(screen.getByText('Top / Bottom N')).toBeDefined();
    expect(screen.getByText('Transpose Table')).toBeDefined();

    const ds = {
      meta: {
        id: 'ds-ops',
        name: 'TableOps',
        project_id: 'p1',
        file_id: 'f1',
        file_format: 'csv' as const,
        row_count: 4,
        column_count: 3,
        size_bytes: 100,
        storage_path: '',
        schema_metadata: [
          { name: 'col_a', data_type: 'string', nullable: false },
          { name: 'col_b', data_type: 'integer', nullable: false },
          { name: 'col_c', data_type: 'float', nullable: false },
        ],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      rows: [
        { col_a: 'Row1', col_b: 10, col_c: 100.5 },
        { col_a: 'Row2', col_b: 40, col_c: 200.5 },
        { col_a: 'Row3', col_b: 20, col_c: 300.5 },
        { col_a: 'Row4', col_b: 30, col_c: 400.5 },
      ],
    };

    // 1. Remove Column (drop col_c)
    const dropStep: any = {
      id: 's-drop',
      type: 'remove_column',
      label: 'Drop col_c',
      enabled: true,
      params: { columns: ['col_c'], keep_selected: false },
    };
    const dropRes = await localEngine.runPipeline('ds-ops', [dropStep], 100, [ds as any]);
    expect(dropRes.rows[0].col_c).toBeUndefined();
    expect(dropRes.rows[0].col_a).toBe('Row1');

    // 2. Reorder Columns
    const reorderStep: any = {
      id: 's-reorder',
      type: 'reorder_columns',
      label: 'Reorder cols',
      enabled: true,
      params: { column_order: ['col_b', 'col_a', 'col_c'] },
    };
    const reorderRes = await localEngine.runPipeline('ds-ops', [reorderStep], 100, [ds as any]);
    expect(Object.keys(reorderRes.rows[0])).toEqual(['col_b', 'col_a', 'col_c']);

    // 3. Remove Rows (top 1)
    const removeRowsStep: any = {
      id: 's-rm-rows',
      type: 'remove_rows',
      label: 'Remove top 1',
      enabled: true,
      params: { mode: 'top_n', count: 1 },
    };
    const rmRes = await localEngine.runPipeline('ds-ops', [removeRowsStep], 100, [ds as any]);
    expect(rmRes.rows.length).toBe(3);
    expect(rmRes.rows[0].col_a).toBe('Row2');

    // 4. Top N
    const topStep: any = {
      id: 's-top',
      type: 'top_bottom_n',
      label: 'Top 2 by col_b',
      enabled: true,
      params: { column: 'col_b', mode: 'top', n: 2 },
    };
    const topRes = await localEngine.runPipeline('ds-ops', [topStep], 100, [ds as any]);
    expect(topRes.rows.length).toBe(2);
    expect(topRes.rows[0].col_b).toBe(40);
    expect(topRes.rows[1].col_b).toBe(30);

    // 5. Transpose
    const transposeStep: any = {
      id: 's-transpose',
      type: 'transpose',
      label: 'Transpose Table',
      enabled: true,
      params: {},
    };
    const transRes = await localEngine.runPipeline('ds-ops', [transposeStep], 100, [ds as any]);
    expect(transRes.rows.length).toBe(3); // 3 original columns become 3 rows
    expect(transRes.rows[0].Attribute).toBe('col_a');
  });

  it('renders EditStepModal visual editor for remove_column, reorder_columns, impute_missing, and flag_outliers', () => {
    useWorkbenchStore.setState({
      isEditStepModalOpen: true,
      editingStep: {
        id: 'step-edit-test',
        type: 'remove_column',
        label: 'Remove col_c',
        enabled: true,
        params: { columns: ['col_c'], keep_selected: false },
      },
    });

    render(<EditStepModal />);
    expect(screen.getByText('Drop Selected Columns')).toBeDefined();
    expect(screen.getByText('Keep Only Selected Columns')).toBeDefined();
  });
});


