import secrets
import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.api.deps import get_current_user_optional
from app.models.user import User
from app.models.project import Project
from app.models.share import ProjectShare
from app.schemas.share import (
    ShareCreate,
    ShareResponse,
    ShareAccessResponse,
)
from app.services.audit_service import audit_service

router = APIRouter()


@router.post(
    "/projects/{project_id}/shares",
    response_model=ShareResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_project_share(
    project_id: str,
    req: ShareCreate,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    """
    Creates a secure shareable link for a project with specific access roles ('viewer' or 'editor').
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    author_email = current_user.email if current_user else "demo@stepsheet.dev"
    token = secrets.token_urlsafe(24)

    expires_at = None
    if req.expires_in_days:
        expires_at = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=req.expires_in_days)

    share = ProjectShare(
        id=str(secrets.token_hex(16)),
        project_id=project_id,
        token=token,
        role=req.role,
        created_by=author_email,
        expires_at=expires_at,
    )
    db.add(share)
    db.commit()
    db.refresh(share)

    audit_service.record_event(
        db=db,
        action="project_shared",
        project_id=project_id,
        actor_email=author_email,
        resource_type="share",
        details={"role": req.role, "token_prefix": token[:8]},
    )

    share_url = f"/share/{token}"
    return ShareResponse(
        id=share.id,
        project_id=share.project_id,
        token=share.token,
        role=share.role,
        created_by=share.created_by,
        created_at=share.created_at,
        expires_at=share.expires_at,
        share_url=share_url,
    )


@router.get("/projects/{project_id}/shares", response_model=List[ShareResponse])
def list_project_shares(
    project_id: str,
    db: Session = Depends(get_db),
):
    """List active share links for a project."""
    shares = db.query(ProjectShare).filter(ProjectShare.project_id == project_id).all()
    results: List[ShareResponse] = []
    for s in shares:
        results.append(
            ShareResponse(
                id=s.id,
                project_id=s.project_id,
                token=s.token,
                role=s.role,
                created_by=s.created_by,
                created_at=s.created_at,
                expires_at=s.expires_at,
                share_url=f"/share/{s.token}",
            )
        )
    return results


@router.delete("/projects/{project_id}/shares/{share_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_project_share(
    project_id: str,
    share_id: str,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    """Revokes a share link, disabling future access."""
    share = (
        db.query(ProjectShare)
        .filter(ProjectShare.id == share_id, ProjectShare.project_id == project_id)
        .first()
    )
    if not share:
        raise HTTPException(status_code=404, detail="Share record not found")

    author_email = current_user.email if current_user else "demo@stepsheet.dev"
    db.delete(share)
    db.commit()

    audit_service.record_event(
        db=db,
        action="share_revoked",
        project_id=project_id,
        actor_email=author_email,
        resource_type="share",
        details={"share_id": share_id},
    )
    return None


@router.get("/share/{token}", response_model=ShareAccessResponse)
def access_shared_project(
    token: str,
    db: Session = Depends(get_db),
):
    """
    Validates a shared link token and returns the project context and permitted capabilities.
    """
    share = db.query(ProjectShare).filter(ProjectShare.token == token).first()
    if not share:
        raise HTTPException(status_code=404, detail="Invalid or expired share link")

    if share.expires_at:
        now_utc = datetime.datetime.now(datetime.timezone.utc)
        exp = share.expires_at
        if exp.tzinfo is None:
            now_utc = datetime.datetime.utcnow()
        if exp < now_utc:
            raise HTTPException(status_code=410, detail="Share link has expired")

    project = db.query(Project).filter(Project.id == share.project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Associated project not found")

    return ShareAccessResponse(
        valid=True,
        project_id=project.id,
        project_title=project.title,
        role=share.role,
        can_edit=(share.role == "editor"),
        created_by=share.created_by,
    )
