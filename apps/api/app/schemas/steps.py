from typing import List, Dict, Any, Optional, Literal, Union
from pydantic import BaseModel, Field
from datetime import datetime
from app.schemas.dataset import ColumnSchema


class ChangeTypeParams(BaseModel):
    column: str
    target_type: Literal["text", "integer", "float", "date", "boolean"]


class RenameColumnParams(BaseModel):
    column: str
    new_name: str


class FilterRowsParams(BaseModel):
    column: str
    operator: Literal[
        "eq",
        "neq",
        "gt",
        "gte",
        "lt",
        "lte",
        "contains",
        "starts_with",
        "ends_with",
        "is_null",
        "is_not_null",
    ]
    value: Optional[Any] = None


class SortRowsParams(BaseModel):
    column: str
    direction: Literal["asc", "desc"] = "asc"


class RemoveDuplicatesParams(BaseModel):
    columns: List[str] = Field(default_factory=list)  # empty = all columns
    keep: Literal["first", "last"] = "first"


class FillDownParams(BaseModel):
    column: str
    direction: Literal["down", "up"] = "down"


class ReplaceValuesParams(BaseModel):
    column: str
    search_value: Optional[str] = None
    replace_value: Optional[str] = None
    match_type: Literal["exact", "contains", "is_null"] = "exact"


class SplitColumnParams(BaseModel):
    column: str
    delimiter: str = ","
    new_column_names: List[str] = Field(default_factory=list)
    keep_original: bool = False


class StepSchema(BaseModel):
    id: str
    type: Literal[
        "change_type",
        "rename_column",
        "filter_rows",
        "sort_rows",
        "remove_duplicates",
        "fill_down",
        "replace_values",
        "split_column",
        "xlookup",
        "append",
        "join",
    ]
    label: str
    enabled: bool = True
    params: Dict[str, Any]
    description: Optional[str] = None


class GeneratedCode(BaseModel):
    sql: str
    polars: str
    power_query_m: str
    excel_formula: Optional[str] = None


class PipelinePreviewRequest(BaseModel):
    dataset_id: str
    steps: List[StepSchema] = Field(default_factory=list)
    offset: int = 0
    limit: int = 100


class StepSummary(BaseModel):
    step_id: str
    label: str
    type: str
    enabled: bool
    generated_code: GeneratedCode


class PipelinePreviewResponse(BaseModel):
    dataset_id: str
    total_rows: int
    filtered_rows: int
    offset: int
    limit: int
    columns: List[ColumnSchema]
    rows: List[Dict[str, Any]]
    compiled_sql: str
    steps: List[StepSummary]
