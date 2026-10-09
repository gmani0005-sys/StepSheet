export type StepType =
  | 'change_type'
  | 'rename_column'
  | 'filter_rows'
  | 'sort_rows'
  | 'remove_duplicates'
  | 'fill_down'
  | 'replace_values'
  | 'split_column'
  | 'xlookup'
  | 'append'
  | 'join';

export interface StepDefinition {
  id: string;
  type: StepType;
  label: string;
  enabled: boolean;
  params: Record<string, any>;
  description?: string;
}

export interface GeneratedCode {
  sql: string;
  polars: string;
  power_query_m: string;
  excel_formula?: string | null;
}

export interface StepSummary {
  step_id: string;
  label: string;
  type: string;
  enabled: boolean;
  generated_code: GeneratedCode;
}

export interface PipelinePreviewResponse {
  dataset_id: string;
  total_rows: number;
  filtered_rows: number;
  offset: number;
  limit: number;
  columns: Array<{
    name: string;
    data_type: 'text' | 'integer' | 'float' | 'boolean' | 'date' | 'timestamp';
    physical_type: string;
    nullable: boolean;
  }>;
  rows: Record<string, any>[];
  compiled_sql: string;
  steps: StepSummary[];
}
