import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from app.core.database import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=True)
    action = Column(String(100), nullable=False)  # 'create_step', 'update_step', 'delete_step', 'run_full', etc.
    actor_email = Column(String(255), nullable=False, default="demo@stepsheet.dev")
    resource_type = Column(String(50), nullable=False, default="pipeline")
    details = Column(JSON, nullable=True, default=dict)
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)

    project = relationship("Project")
