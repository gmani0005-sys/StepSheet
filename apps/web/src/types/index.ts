export type DataType = 'text' | 'integer' | 'float' | 'boolean' | 'date' | 'timestamp';

export interface ColumnSchema {
  name: string;
  data_type: DataType;
  physical_type: string;
  nullable: boolean;
}

export interface Dataset {
  id: string;
  project_id?: string;
  name: string;
  original_filename: string;
  file_format: string;
  row_count: number;
  column_count: number;
  file_size_bytes: number;
  schema_metadata: ColumnSchema[];
  created_at: string;
  updated_at: string;
}

export interface SortCondition {
  column: string;
  direction: 'asc' | 'desc';
}

export interface FilterCondition {
  column: string;
  operator: 'eq' | 'neq' | 'contains' | 'gt' | 'gte' | 'lt' | 'lte' | 'is_null' | 'is_not_null';
  value: any;
}

export interface DatasetRowsResponse {
  dataset_id: string;
  total_rows: number;
  filtered_rows: number;
  offset: number;
  limit: number;
  columns: ColumnSchema[];
  rows: Record<string, any>[];
}

export interface HistogramBin {
  bin_start: number;
  bin_end: number;
  count: number;
  label: string;
}

export interface TopValue {
  value: any;
  count: number;
  percentage: number;
}

export interface ColumnProfile {
  column_name: string;
  data_type: DataType;
  total_count: number;
  null_count: number;
  null_percentage: number;
  distinct_count: number;
  distinct_percentage: number;
  is_unique: boolean;
  min_value?: any;
  max_value?: any;
  mean_value?: number;
  median_value?: number;
  std_dev?: number;
  min_length?: number;
  max_length?: number;
  avg_length?: number;
  top_values: TopValue[];
  histogram?: HistogramBin[];
}

export interface DatasetProfileResponse {
  dataset_id: string;
  total_rows: number;
  total_columns: number;
  columns: ColumnProfile[];
}

export interface User {
  id: string;
  email: string;
  full_name?: string;
  is_active: boolean;
  is_superuser: boolean;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: User;
}
