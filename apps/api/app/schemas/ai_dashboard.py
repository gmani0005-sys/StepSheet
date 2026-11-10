from typing import List, Dict, Any, Optional, Literal
from pydantic import BaseModel, Field


class DashboardKpiPlan(BaseModel):
    id: str
    title: str
    column: str
    aggFunc: Literal["sum", "avg", "min", "max", "count", "distinct_count"] = "sum"
    subtitle: str = ""
    accentColor: str = "#107C41"


class DashboardVisualPlan(BaseModel):
    id: str
    title: str
    type: Literal[
        "bar",
        "clustered_bar",
        "column",
        "stacked_column",
        "donut",
        "pie",
        "line_area",
        "waterfall",
        "gauge",
        "funnel",
        "treemap",
        "table",
    ] = "bar"
    categoryCol: str
    valueCol: str
    seriesCol: Optional[str] = ""
    aggFunc: Literal["sum", "avg", "min", "max", "count", "distinct_count"] = "sum"
    bins: Optional[int] = 5


class DashboardPlan(BaseModel):
    schema_version: str = "1.0"
    dashboard_title: str
    dataset_id: str
    description: str = ""
    slicer_columns: List[str] = Field(default_factory=list)
    kpis: List[DashboardKpiPlan] = Field(default_factory=list)
    visuals: List[DashboardVisualPlan] = Field(default_factory=list)
    palette_id: str = "classic"


class GenerateDashboardRequest(BaseModel):
    dataset_id: str
    prompt: Optional[str] = (
        "Build a complete dashboard for this dataset. Identify the important KPIs, trends, comparisons, and breakdowns. Add useful filters."
    )
    model_tag: Optional[str] = None
    idempotency_key: Optional[str] = None
    columns: Optional[List[Dict[str, Any]]] = None
    sample_rows: Optional[List[Dict[str, Any]]] = None
    dataset_name: Optional[str] = None


class GenerateDashboardResponse(BaseModel):
    plan: DashboardPlan
    latency_ms: float
    provider: str
    model: str
    verified_visual_count: int
    verified_kpi_count: int


class DashboardPatchOperation(BaseModel):
    schema_version: str = "1.0"
    operation: Literal[
        "generate_dashboard",
        "add_visual",
        "remove_visual",
        "update_visual",
        "add_kpi",
        "remove_kpi",
        "add_slicer",
        "remove_slicer",
        "set_title",
        "set_palette",
    ]
    target_id: Optional[str] = None
    patch_summary: str = ""
    visual: Optional[DashboardVisualPlan] = None
    kpi: Optional[DashboardKpiPlan] = None
    slicer_column: Optional[str] = None
    title: Optional[str] = None
    palette_id: Optional[str] = None


class PatchDashboardRequest(BaseModel):
    dataset_id: str
    prompt: str
    current_dashboard: DashboardPlan
    model_tag: Optional[str] = None
    idempotency_key: Optional[str] = None
    columns: Optional[List[Dict[str, Any]]] = None
    sample_rows: Optional[List[Dict[str, Any]]] = None
    dataset_name: Optional[str] = None


class PatchDashboardResponse(BaseModel):
    patch: DashboardPatchOperation
    updated_dashboard: DashboardPlan
    latency_ms: float
    provider: str
    model: str
