import uuid
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from app.models.audit import AuditLog


class AuditService:
    def record_event(
        self,
        db: Session,
        action: str,
        project_id: Optional[str] = None,
        actor_email: str = "demo@stepsheet.dev",
        resource_type: str = "pipeline",
        details: Optional[Dict[str, Any]] = None,
    ) -> AuditLog:
        log = AuditLog(
            id=str(uuid.uuid4()),
            project_id=project_id,
            action=action,
            actor_email=actor_email,
            resource_type=resource_type,
            details=details or {},
        )
        db.add(log)
        db.commit()
        db.refresh(log)
        return log

    def list_logs(
        self,
        db: Session,
        project_id: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
        action_filter: Optional[str] = None,
    ) -> List[AuditLog]:
        query = db.query(AuditLog)
        if project_id:
            query = query.filter(AuditLog.project_id == project_id)
        if action_filter:
            query = query.filter(AuditLog.action.ilike(f"%{action_filter}%"))
        return query.order_by(AuditLog.timestamp.desc()).offset(offset).limit(limit).all()

    def count_logs(
        self,
        db: Session,
        project_id: Optional[str] = None,
        action_filter: Optional[str] = None,
    ) -> int:
        query = db.query(AuditLog)
        if project_id:
            query = query.filter(AuditLog.project_id == project_id)
        if action_filter:
            query = query.filter(AuditLog.action.ilike(f"%{action_filter}%"))
        return query.count()


audit_service = AuditService()
