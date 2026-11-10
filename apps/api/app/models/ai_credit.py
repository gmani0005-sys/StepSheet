import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, Float, DateTime, JSON
from app.core.database import Base


class AiCreditTransaction(Base):
    __tablename__ = "ai_credit_transactions"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), nullable=True, index=True)
    idempotency_key = Column(String(128), unique=True, index=True, nullable=True)
    operation_type = Column(String(64), nullable=False, index=True)  # chat_query, generate_dashboard, patch_dashboard
    provider = Column(String(64), nullable=False)  # ollama, gemini, heuristic
    model = Column(String(64), nullable=True)
    credits_debited = Column(Integer, default=0, nullable=False)
    status = Column(String(32), default="completed", nullable=False)  # pending, completed, refunded, failed
    latency_ms = Column(Float, nullable=True)
    prompt_tokens = Column(Integer, nullable=True)
    completion_tokens = Column(Integer, nullable=True)
    metadata_json = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
