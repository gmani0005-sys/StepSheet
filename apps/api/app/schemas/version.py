from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
from datetime import datetime
from app.schemas.steps import StepSchema


class VersionCreate(BaseModel):
    message: str = Field(..., min_length=1, max_length=255)
    steps: List[StepSchema]
    dataset_id: Optional[str] = None


class VersionResponse(BaseModel):
    id: str
    project_id: str
    version_number: int
    message: str
    author_email: str
    steps_snapshot: List[Dict[str, Any]]
    dataset_id: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class ParamDiffItem(BaseModel):
    param_key: str
    old_value: Any
    new_value: Any


class StepDiffItem(BaseModel):
    step_id: str
    change_type: str  # 'added', 'removed', 'modified', 'unchanged'
    step_type: str
    label: str
    old_position: Optional[int] = None
    new_position: Optional[int] = None
    param_diffs: List[ParamDiffItem] = []


class VersionDiffResponse(BaseModel):
    from_version: int
    to_version: int
    total_changes: int
    added_count: int
    removed_count: int
    modified_count: int
    diff_steps: List[StepDiffItem]


class VersionRestoreResponse(BaseModel):
    project_id: str
    restored_version: int
    steps_count: int
    message: str
