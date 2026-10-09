from typing import Optional, List
from pydantic import BaseModel, ConfigDict
from datetime import datetime


class ProjectBase(BaseModel):
    title: str
    description: Optional[str] = None


class ProjectCreate(ProjectBase):
    pass


class ProjectResponse(ProjectBase):
    id: str
    owner_id: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
