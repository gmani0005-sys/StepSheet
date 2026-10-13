import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Text, JSON
from sqlalchemy.orm import relationship
from app.core.database import Base


class ExportJob(Base):
    __tablename__ = "export_jobs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=True)
    dataset_id = Column(String(36), nullable=True)
    created_by = Column(String(255), default="demo@stepsheet.dev")

    # Status: pending, processing, completed, failed, cancelled
    status = Column(String(20), default="pending", nullable=False)
    progress_pct = Column(Integer, default=0, nullable=False)
    current_step = Column(String(255), default="Initializing...", nullable=False)

    # Requested configuration snapshot
    formats = Column(JSON, default=list)  # ["csv", "parquet", "json", "xlsx", "pdf", "pptx", etc.]
    content_blocks = Column(JSON, default=list)  # ["data", "steps", "quality", "joins", "report"]
    row_scope = Column(String(20), default="all")  # "all", "filtered", "first_n"
    row_limit = Column(Integer, nullable=True)
    excluded_columns = Column(JSON, default=list)

    # Generated files metadata: list of {file_id, filename, format, size_bytes, storage_path, mime_type}
    files = Column(JSON, default=list)
    error_message = Column(Text, nullable=True)

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    completed_at = Column(DateTime, nullable=True)
    expires_at = Column(DateTime, nullable=True)

    project = relationship("Project", backref="export_jobs", lazy="joined")
