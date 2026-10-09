from typing import List, Dict, Any, Optional, Literal
from pydantic import BaseModel, Field
from datetime import datetime
from app.schemas.steps import StepSchema


class QualityRule(BaseModel):
    id: str
    rule_type: Literal[
        "not_null",
        "unique",
        "range",
        "allowed_values",
        "regex",
        "referential_integrity",
        "cross_column",
        "row_count_reconciliation",
        "sum_reconciliation",
    ]
    column: str
    label: str
    severity: Literal["error", "warning", "info"] = "error"
    params: Dict[str, Any] = Field(default_factory=dict)


class QualityCheckRequest(BaseModel):
    dataset_id: str
    rules: List[QualityRule] = Field(default_factory=list)
    pipeline_steps: List[StepSchema] = Field(default_factory=list)


class RuleResult(BaseModel):
    rule_id: str
    rule_type: str
    column: str
    label: str
    severity: str
    status: Literal["pass", "fail"]
    total_rows: int
    failed_rows_count: int
    failed_percentage: float
    sample_failing_rows: List[Dict[str, Any]] = Field(default_factory=list)
    query_expression: str = ""
    message: str = ""


class QualityReportResponse(BaseModel):
    dataset_id: str
    total_rules: int
    passed_count: int
    failed_count: int
    health_score: float  # 0.0 - 100.0
    results: List[RuleResult]
    evaluated_at: str
