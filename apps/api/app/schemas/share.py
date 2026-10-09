from typing import Optional
from pydantic import BaseModel, Field
from datetime import datetime


class ShareCreate(BaseModel):
    role: str = Field("viewer", pattern="^(viewer|editor)$")
    expires_in_days: Optional[int] = Field(None, ge=1, le=365)


class ShareResponse(BaseModel):
    id: str
    project_id: str
    token: str
    role: str
    created_by: str
    created_at: datetime
    expires_at: Optional[datetime] = None
    share_url: str

    class Config:
        from_attributes = True


class ShareAccessResponse(BaseModel):
    valid: bool
    project_id: str
    project_title: str
    role: str
    can_edit: bool
    created_by: str
