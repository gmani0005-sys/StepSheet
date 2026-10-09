from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
from datetime import datetime
from app.schemas.steps import StepSchema


class RequiredColumnSchema(BaseModel):
    name: str
    data_type: str = "text"  # 'text', 'numeric', 'date', 'boolean'
    description: Optional[str] = None


class TemplateCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=255)
    description: Optional[str] = None
    category: str = "General"
    required_columns: List[RequiredColumnSchema] = []
    steps: List[StepSchema]


class TemplateResponse(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    category: str
    required_columns: List[RequiredColumnSchema]
    steps: List[Dict[str, Any]]
    is_builtin: bool
    created_by: str
    created_at: datetime

    class Config:
        from_attributes = True


class ColumnMappingSuggestion(BaseModel):
    template_column: str
    suggested_column: Optional[str] = None
    confidence: float = 0.0  # 0.0 to 1.0
    match_reason: str = "Unmatched"


class SuggestMappingRequest(BaseModel):
    dataset_id: str


class SuggestMappingResponse(BaseModel):
    template_id: str
    dataset_id: str
    suggestions: List[ColumnMappingSuggestion]
    all_matched: bool


class TemplateApplyRequest(BaseModel):
    dataset_id: str
    column_mapping: Dict[str, str]  # template_column_name -> actual_dataset_column_name


class TemplateApplyResponse(BaseModel):
    template_id: str
    dataset_id: str
    rewritten_steps: List[Dict[str, Any]]
    applied_count: int
