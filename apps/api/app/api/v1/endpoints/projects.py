import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.api.deps import get_current_user_optional
from app.models.user import User
from app.models.project import Project
from app.schemas.project import ProjectCreate, ProjectResponse

router = APIRouter()


@router.get("", response_model=List[ProjectResponse])
def list_projects(
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    """List projects."""
    query = db.query(Project)
    if current_user:
        query = query.filter(Project.owner_id == current_user.id)
    return query.order_by(Project.updated_at.desc()).all()


@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
def create_project(
    project_in: ProjectCreate,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    """Create a new project."""
    if not current_user:
        current_user = db.query(User).filter(User.email == "demo@stepsheet.dev").first()
        if not current_user:
            from app.core.security import hash_password
            current_user = User(
                id=str(uuid.uuid4()),
                email="demo@stepsheet.dev",
                hashed_password=hash_password("demo123456"),
                full_name="Demo Analyst",
            )
            db.add(current_user)
            db.commit()
            db.refresh(current_user)

    project = Project(
        id=str(uuid.uuid4()),
        title=project_in.title,
        description=project_in.description,
        owner_id=current_user.id,
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


@router.get("/{project_id}", response_model=ProjectResponse)
def get_project(
    project_id: str,
    db: Session = Depends(get_db),
):
    """Get project by ID."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(
    project_id: str,
    db: Session = Depends(get_db),
):
    """Delete a project."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    db.delete(project)
    db.commit()
    return None
