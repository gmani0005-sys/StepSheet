export type StepType =
  | 'change_type'
  | 'rename_column'
  | 'filter_rows'
  | 'sort_rows'
  | 'remove_duplicates'
  | 'fill_down'
  | 'replace_values'
  | 'split_column';

export interface ChangeTypeParams {
  column: string;
  target_type: 'text' | 'integer' | 'float' | 'date' | 'boolean';
}

export interface RenameColumnParams {
  column: string;
  new_name: string;
}

export interface FilterRowsParams {
  column: string;
  operator:
    | 'eq'
    | 'neq'
    | 'gt'
    | 'gte'
    | 'lt'
    | 'lte'
    | 'contains'
    | 'starts_with'
    | 'ends_with'
    | 'is_null'
    | 'is_not_null';
  value?: any;
}

export interface SortRowsParams {
  column: string;
  direction: 'asc' | 'desc';
}

export interface RemoveDuplicatesParams {
  columns: string[]; // empty means all columns
  keep: 'first' | 'last';
}

export interface FillDownParams {
  column: string;
  direction: 'down' | 'up';
}

export interface ReplaceValuesParams {
  column: string;
  search_value: string;
  replace_value: string;
  match_type: 'exact' | 'contains' | 'is_null';
}

export interface SplitColumnParams {
  column: string;
  delimiter: string;
  new_column_names: string[];
  keep_original?: boolean;
}

export type StepParams =
  | ChangeTypeParams
  | RenameColumnParams
  | FilterRowsParams
  | SortRowsParams
  | RemoveDuplicatesParams
  | FillDownParams
  | ReplaceValuesParams
  | SplitColumnParams;

export interface StepDefinition<TParams = any> {
  id: string;
  type: StepType;
  label: string;
  enabled: boolean;
  params: TParams;
  description?: string;
}

export interface PipelineDefinition {
  id: string;
  name: string;
  sourceDatasetId: string;
  steps: StepDefinition[];
  version: number;
}
