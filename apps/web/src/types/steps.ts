export type StepType =
  | 'change_type'
  | 'rename_column'
  | 'remove_column'
  | 'reorder_columns'
  | 'promote_headers'
  | 'remove_rows'
  | 'transpose'
  | 'filter_rows'
  | 'sort_rows'
  | 'remove_duplicates'
  | 'fill_down'
  | 'replace_values'
  | 'standardize_values'
  | 'impute_missing'
  | 'flag_outliers'
  | 'top_bottom_n'
  | 'split_column'
  | 'xlookup'
  | 'vlookup'
  | 'append'
  | 'join'
  | 'conditional'
  | 'group_by'
  | 'window_calc'
  | 'text_transform'
  | 'date_transform'
  | 'math_transform'
  | 'pivot'
  | 'unpivot'
  | 'custom_column';

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
  /** Plain-language notes about values the step could not handle (never silent). */
  warnings?: string[];
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
