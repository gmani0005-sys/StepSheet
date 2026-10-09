from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.schemas.audit import AuditListResponse, AuditResponse
from app.services.audit_service import audit_service

router = APIRouter()


@router.get("/projects/{project_id}/audit", response_model=AuditListResponse)
def list_project_audit_trail(
    project_id: str,
    action: Optional[str] = Query(None, description="Filter by action name substring"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """
    Returns chronological audit log entries of actions performed on this project.
    """
    total = audit_service.count_logs(db=db, project_id=project_id, action_filter=action)
    items = audit_service.list_logs(
        db=db,
        project_id=project_id,
        limit=limit,
        offset=offset,
        action_filter=action,
    )
    return AuditListResponse(
        total=total,
        items=[AuditResponse.model_validate(it) for it in items],
    )
