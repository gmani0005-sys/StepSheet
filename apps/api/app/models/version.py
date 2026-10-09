import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Text, JSON
from sqlalchemy.orm import relationship
from app.core.database import Base


class ProjectVersion(Base):
    __tablename__ = "project_versions"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    version_number = Column(Integer, nullable=False)
    message = Column(String(255), nullable=False, default="Updated pipeline")
    author_email = Column(String(255), nullable=False, default="demo@stepsheet.dev")
    steps_snapshot = Column(JSON, nullable=False, default=list)
    dataset_id = Column(String(36), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    project = relationship("Project")
