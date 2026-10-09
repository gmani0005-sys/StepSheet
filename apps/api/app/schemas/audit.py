from typing import Dict, Any, Optional, List
from pydantic import BaseModel
from datetime import datetime


class AuditCreate(BaseModel):
    action: str
    resource_type: str = "pipeline"
    details: Optional[Dict[str, Any]] = None


class AuditResponse(BaseModel):
    id: str
    project_id: Optional[str] = None
    action: str
    actor_email: str
    resource_type: str
    details: Optional[Dict[str, Any]] = None
    timestamp: datetime

    class Config:
        from_attributes = True


class AuditListResponse(BaseModel):
    total: int
    items: List[AuditResponse]
