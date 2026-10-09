from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.api.deps import get_current_user_optional
from app.models.user import User
from app.models.project import Project
from app.models.version import ProjectVersion
from app.schemas.version import (
    VersionCreate,
    VersionResponse,
    VersionDiffResponse,
    VersionRestoreResponse,
)
from app.services.version_service import version_service
from app.services.audit_service import audit_service

router = APIRouter()


@router.get("/projects/{project_id}/versions", response_model=List[VersionResponse])
def list_versions(
    project_id: str,
    db: Session = Depends(get_db),
):
    """List historical pipeline version snapshots for a project."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    return version_service.list_versions(db=db, project_id=project_id)


@router.post(
    "/projects/{project_id}/versions",
    response_model=VersionResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_version_snapshot(
    project_id: str,
    req: VersionCreate,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    """Save an immutable milestone version snapshot of the current pipeline."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    author_email = current_user.email if current_user else "demo@stepsheet.dev"

    steps_dicts = [s.model_dump() for s in req.steps]
    version = version_service.create_version(
        db=db,
        project_id=project_id,
        message=req.message,
        steps=steps_dicts,
        author_email=author_email,
        dataset_id=req.dataset_id,
    )

    audit_service.record_event(
        db=db,
        action="version_created",
        project_id=project_id,
        actor_email=author_email,
        resource_type="version",
        details={
            "version_number": version.version_number,
            "message": version.message,
            "steps_count": len(steps_dicts),
        },
    )

    return version


@router.get(
    "/projects/{project_id}/versions/diff",
    response_model=VersionDiffResponse,
)
def diff_project_versions(
    project_id: str,
    from_version: int = Query(..., ge=1),
    to_version: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    """
    Computes visual and structured step diff between two project versions.
    Shows added, deleted, and modified steps with parameter-level deltas.
    """
    v_from = (
        db.query(ProjectVersion)
        .filter(ProjectVersion.project_id == project_id, ProjectVersion.version_number == from_version)
        .first()
    )
    v_to = (
        db.query(ProjectVersion)
        .filter(ProjectVersion.project_id == project_id, ProjectVersion.version_number == to_version)
        .first()
    )

    if not v_from:
        raise HTTPException(status_code=404, detail=f"Version {from_version} not found")
    if not v_to:
        raise HTTPException(status_code=404, detail=f"Version {to_version} not found")

    return version_service.diff_steps(
        from_ver_num=from_version,
        to_ver_num=to_version,
        old_steps=v_from.steps_snapshot or [],
        new_steps=v_to.steps_snapshot or [],
    )


@router.post(
    "/projects/{project_id}/versions/{version_id}/restore",
    response_model=VersionRestoreResponse,
)
def restore_project_version(
    project_id: str,
    version_id: str,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    """
    Restores the project pipeline steps from a chosen historical version snapshot.
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    author_email = current_user.email if current_user else "demo@stepsheet.dev"

    try:
        new_v = version_service.restore_version(
            db=db,
            project_id=project_id,
            version_id=version_id,
            author_email=author_email,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    audit_service.record_event(
        db=db,
        action="version_restored",
        project_id=project_id,
        actor_email=author_email,
        resource_type="version",
        details={
            "restored_from_id": version_id,
            "new_version_number": new_v.version_number,
            "steps_count": len(new_v.steps_snapshot),
        },
    )

    return VersionRestoreResponse(
        project_id=project_id,
        restored_version=new_v.version_number,
        steps_count=len(new_v.steps_snapshot),
        message=new_v.message,
    )
