import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, BigInteger, DateTime, ForeignKey, Text, JSON
from sqlalchemy.orm import relationship
from app.core.database import Base


class Dataset(Base):
    __tablename__ = "datasets"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=True)
    owner_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False)
    original_filename = Column(String(255), nullable=False)
    file_format = Column(String(20), nullable=False)  # csv, xlsx, parquet
    file_path = Column(String(512), nullable=False)  # path to raw or parquet file
    parquet_path = Column(String(512), nullable=False)  # path to optimized parquet
    row_count = Column(BigInteger, default=0)
    column_count = Column(Integer, default=0)
    file_size_bytes = Column(BigInteger, default=0)
    schema_metadata = Column(JSON, nullable=True)  # list of {name, type, physical_type}
    profile_metadata = Column(JSON, nullable=True)  # cached column profile metrics
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    owner = relationship("User", back_populates="datasets")
    project = relationship("Project", back_populates="datasets")
