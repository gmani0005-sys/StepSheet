export type JoinType =
  | 'inner'
  | 'left'
  | 'right'
  | 'full'
  | 'left_anti'
  | 'right_anti'
  | 'left_semi'
  | 'cross'
  | 'self'
  | 'range'
  | 'fuzzy';

export type CardinalityVerdict = 'one-to-one' | 'one-to-many' | 'many-to-one' | 'many-to-many';

export interface JoinKeyPair {
  left_col: string;
  right_col: string;
  trim_whitespace?: boolean;
  case_insensitive?: boolean;
}

export interface TypeMismatch {
  left_col: string;
  left_type: string;
  right_col: string;
  right_type: string;
  suggested_cast: string;
}

export interface PreJoinHealthCheckResponse {
  left_row_count: number;
  right_row_count: number;
  left_key_nulls: number;
  right_key_nulls: number;
  left_key_duplicates: number;
  right_key_duplicates: number;
  cardinality: CardinalityVerdict;
  cardinality_description: string;
  fanout_warning?: string | null;
  type_mismatches: TypeMismatch[];
  estimated_match_rate: number;
  estimated_result_rows: number;
  suggested_fixes: string[];
}
