from typing import List, Dict, Any, Optional, Literal
from pydantic import BaseModel, Field

JoinType = Literal[
    "inner",
    "left",
    "right",
    "full",
    "left_anti",
    "right_anti",
    "left_semi",
    "cross",
    "self",
    "range",
    "fuzzy",
]

CardinalityVerdict = Literal["one-to-one", "one-to-many", "many-to-one", "many-to-many"]


class JoinKeyPair(BaseModel):
    left_col: str
    right_col: str
    trim_whitespace: bool = False
    case_insensitive: bool = False


class PreJoinHealthCheckRequest(BaseModel):
    left_dataset_id: str
    right_dataset_id: str
    key_pairs: List[JoinKeyPair] = Field(default_factory=list)
    join_type: JoinType = "left"


class TypeMismatch(BaseModel):
    left_col: str
    left_type: str
    right_col: str
    right_type: str
    suggested_cast: str


class PreJoinHealthCheckResponse(BaseModel):
    left_row_count: int
    right_row_count: int
    left_key_nulls: int
    right_key_nulls: int
    left_key_duplicates: int
    right_key_duplicates: int
    cardinality: CardinalityVerdict
    cardinality_description: str
    fanout_warning: Optional[str] = None
    type_mismatches: List[TypeMismatch] = Field(default_factory=list)
    estimated_match_rate: float
    estimated_result_rows: int
    suggested_fixes: List[str] = Field(default_factory=list)


class JoinResultReport(BaseModel):
    left_rows: int
    right_rows: int
    matched_rows: int
    left_only_rows: int
    right_only_rows: int
    result_rows: int
    is_reconciled: bool
    reconciliation_message: str


class XLookupParams(BaseModel):
    lookup_dataset_id: str
    left_key_col: str
    right_key_col: str
    return_columns: List[str]
    if_not_found: Optional[str] = "Not found"
    match_type: Literal["exact", "fuzzy"] = "exact"


class AppendParams(BaseModel):
    append_dataset_id: str
    alignment: Literal["name", "position"] = "name"
    alignment_mode: Optional[str] = "by_name"
    union_type: Literal["all", "distinct"] = "all"
    add_custom_column: bool = False
    custom_column_name: Optional[str] = None
    primary_value: Optional[str] = None
    appended_value: Optional[str] = None
    incremental_mode: Optional[Literal["all", "distinct", "append_new_only", "upsert"]] = "all"
    key_column: Optional[str] = None


class JoinParams(BaseModel):
    right_dataset_id: str
    join_type: JoinType = "left"
    key_pairs: List[JoinKeyPair] = Field(default_factory=list)
    selected_right_columns: List[str] = Field(default_factory=list)
    suffix_left: str = "_left"
    suffix_right: str = "_right"
    dedupe_right_first: bool = False
    range_condition: Optional[Dict[str, Any]] = None  # left_col, r_start, r_end
    fuzzy_threshold: Optional[float] = 0.8
