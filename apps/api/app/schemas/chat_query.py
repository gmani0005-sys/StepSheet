from typing import List, Dict, Any, Optional, Literal
from pydantic import BaseModel, Field


class ChatSelectField(BaseModel):
    column: str
    aggregation: Optional[Literal["sum", "avg", "min", "max", "count", "distinct_count", "median"]] = None
    alias: Optional[str] = None


class ChatFilterRule(BaseModel):
    column: str
    operator: Literal["eq", "neq", "gt", "gte", "lt", "lte", "contains", "not_contains", "is_null", "is_not_null", "between"]
    value: Optional[Any] = None


class ChatSortRule(BaseModel):
    column: str
    direction: Literal["asc", "desc"] = "desc"


class ChatChartConfig(BaseModel):
    type: Literal["bar", "column", "line", "pie", "donut", "table", "area"] = "bar"
    x: str
    y: str
    series: Optional[str] = None


class ChatQueryPlan(BaseModel):
    schema_version: str = "1.0"
    intent: Literal["aggregation", "filter", "summary", "ranking", "trend", "missing_values", "outliers", "general"] = "aggregation"
    dataset_id: str
    select: List[ChatSelectField] = Field(default_factory=list)
    filters: List[ChatFilterRule] = Field(default_factory=list)
    group_by: List[str] = Field(default_factory=list)
    sort: List[ChatSortRule] = Field(default_factory=list)
    limit: Optional[int] = Field(default=10, ge=1, le=1000)
    chart: Optional[ChatChartConfig] = None
    explanation: str = ""
    assumptions: List[str] = Field(default_factory=list)


class ChatQueryRequest(BaseModel):
    dataset_id: str
    prompt: str
    idempotency_key: Optional[str] = None
    model_tag: Optional[str] = None
    columns: Optional[List[Dict[str, Any]]] = None
    sample_rows: Optional[List[Dict[str, Any]]] = None
    dataset_name: Optional[str] = None


class ChatQueryResponse(BaseModel):
    plan: ChatQueryPlan
    explanation: str
    calculation_method: str
    columns: List[str]
    rows: List[Dict[str, Any]]
    row_count: int
    chart: Optional[ChatChartConfig] = None
    query_trace: str
    latency_ms: float
    provider: str
    model: str
