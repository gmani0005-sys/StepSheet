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


# Phase 4 Parameter Models
class ConditionalRule(BaseModel):
    column: str
    operator: str
    value: Optional[Any] = None
    result: Any


class ConditionalParams(BaseModel):
    new_column: str
    rules: List[ConditionalRule]
    else_value: Optional[Any] = None


class AggregateItem(BaseModel):
    column: str
    agg_func: Literal["sum", "count", "avg", "min", "max", "distinct_count"]
    output_column: str


class GroupByParams(BaseModel):
    group_by_columns: List[str]
    aggregations: List[AggregateItem]


class WindowCalcParams(BaseModel):
    calc_type: Literal["running_total", "rank", "percent_of_total", "moving_avg", "lag", "lead"]
    target_column: str
    output_column: str
    partition_by: List[str] = Field(default_factory=list)
    order_by: str = ""
    order_direction: Literal["asc", "desc"] = "asc"
    window_size: Optional[int] = 3
    offset: Optional[int] = 1


class TextTransformParams(BaseModel):
    column: str
    operation: Literal[
        "trim", "clean", "upper", "lower", "proper", "left", "right", "mid", "concat", "length", "extract_delimiter"
    ]
    output_column: Optional[str] = None
    length: Optional[int] = None
    start: Optional[int] = None
    delimiter: Optional[str] = None
    concat_columns: List[str] = Field(default_factory=list)
    concat_separator: str = ""


class DateTransformParams(BaseModel):
    column: str
    operation: Literal["extract_part", "eomonth", "datedif", "add_time", "fiscal_year"]
    output_column: Optional[str] = None
    date_part: Optional[str] = None
    second_column: Optional[str] = None
    unit: Optional[str] = None
    amount: Optional[int] = None
    fiscal_start_month: Optional[int] = 1


class MathTransformParams(BaseModel):
    operation: Literal["arithmetic", "round", "roundup", "rounddown", "abs", "percent_change", "bin"]
    column1: str
    column2: Optional[str] = None
    output_column: Optional[str] = None
    math_operator: Optional[str] = None
    decimals: Optional[int] = 2
    bins: Optional[List[Dict[str, Any]]] = None


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
        "conditional",
        "group_by",
        "window_calc",
        "text_transform",
        "date_transform",
        "math_transform",
        "pivot",
        "unpivot",
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
