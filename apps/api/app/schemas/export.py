from typing import List, Dict, Any, Optional, Literal
from pydantic import BaseModel, Field
from app.schemas.steps import StepSchema


class ExportRequest(BaseModel):
    dataset_id: str
    steps: List[StepSchema] = Field(default_factory=list)
    format: Literal["xlsx", "csv", "parquet", "json"] = "xlsx"
    include_formulas: bool = True
    include_documentation: bool = True


class CodeExportResponse(BaseModel):
    dataset_id: str
    sql: str
    power_query_m: str
    polars: str
    excel_formulas: List[Dict[str, str]]


class RunFullPipelineRequest(BaseModel):
    dataset_id: str
    steps: List[StepSchema] = Field(default_factory=list)


class RunFullPipelineResponse(BaseModel):
    dataset_id: str
    total_rows: int
    column_count: int
    execution_time_ms: float
    status: str
    sample_preview: List[Dict[str, Any]]


class DirectDashboardExportRequest(BaseModel):
    title: Optional[str] = "Executive Dashboard"
    dataset_name: Optional[str] = "Dataset"
    kpis: List[Dict[str, Any]] = Field(default_factory=list)
    visuals: List[Dict[str, Any]] = Field(default_factory=list)
    rows: List[Dict[str, Any]] = Field(default_factory=list)
    columns: List[str] = Field(default_factory=list)
    steps: List[Dict[str, Any]] = Field(default_factory=list)
    filtered_row_count: Optional[int] = None
    total_row_count: Optional[int] = None
    format: str = "xlsx"

