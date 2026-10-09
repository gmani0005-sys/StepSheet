import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, Text, JSON, Boolean
from app.core.database import Base


class PipelineTemplate(Base):
    __tablename__ = "pipeline_templates"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    category = Column(String(100), nullable=False, default="General")
    required_columns = Column(JSON, nullable=False, default=list)  # list of {name, type, description}
    steps = Column(JSON, nullable=False, default=list)  # list of StepSchema dicts
    is_builtin = Column(Boolean, default=False)
    created_by = Column(String(255), nullable=False, default="system")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
