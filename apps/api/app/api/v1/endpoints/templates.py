import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.api.deps import get_current_user_optional
from app.models.user import User
from app.models.dataset import Dataset
from app.models.template import PipelineTemplate
from app.schemas.template import (
    TemplateCreate,
    TemplateResponse,
    SuggestMappingRequest,
    SuggestMappingResponse,
    TemplateApplyRequest,
    TemplateApplyResponse,
)
from app.services.template_service import template_service
from app.services.audit_service import audit_service

router = APIRouter()


@router.get("", response_model=List[TemplateResponse])
def list_templates(
    db: Session = Depends(get_db),
):
    """
    List all available pipeline templates, including built-in starter templates
    and user-saved custom templates.
    """
    builtins = template_service.get_builtin_templates()
    custom_records = db.query(PipelineTemplate).order_by(PipelineTemplate.created_at.desc()).all()

    results: List[TemplateResponse] = []
    # Add built-in templates
    from datetime import datetime, timezone
    for b in builtins:
        results.append(
            TemplateResponse(
                id=b["id"],
                name=b["name"],
                description=b.get("description"),
                category=b.get("category", "General"),
                required_columns=b.get("required_columns", []),
                steps=b.get("steps", []),
                is_builtin=True,
                created_by=b.get("created_by", "system"),
                created_at=datetime.now(timezone.utc),
            )
        )

    # Add custom database templates
    for c in custom_records:
        results.append(
            TemplateResponse(
                id=c.id,
                name=c.name,
                description=c.description,
                category=c.category,
                required_columns=c.required_columns or [],
                steps=c.steps or [],
                is_builtin=c.is_builtin,
                created_by=c.created_by,
                created_at=c.created_at,
            )
        )

    return results


@router.post("", response_model=TemplateResponse, status_code=status.HTTP_201_CREATED)
def create_custom_template(
    req: TemplateCreate,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    """Save an existing pipeline definition as a reusable template."""
    author_email = current_user.email if current_user else "demo@stepsheet.dev"

    template = PipelineTemplate(
        id=str(uuid.uuid4()),
        name=req.name,
        description=req.description,
        category=req.category,
        required_columns=[c.model_dump() for c in req.required_columns],
        steps=[s.model_dump() for s in req.steps],
        is_builtin=False,
        created_by=author_email,
    )
    db.add(template)
    db.commit()
    db.refresh(template)

    audit_service.record_event(
        db=db,
        action="template_created",
        actor_email=author_email,
        resource_type="template",
        details={"template_id": template.id, "template_name": template.name},
    )

    return template


@router.post("/{template_id}/suggest-mapping", response_model=SuggestMappingResponse)
def suggest_column_mapping(
    template_id: str,
    req: SuggestMappingRequest,
    db: Session = Depends(get_db),
):
    """
    Analyzes the target dataset's columns and computes a fuzzy mapping suggestion
    for every required column in the template.
    """
    dataset = db.query(Dataset).filter(Dataset.id == req.dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Target dataset not found")

    dataset_cols = [c["name"] for c in (dataset.schema_metadata or [])]

    # Find template
    req_cols = []
    builtins = template_service.get_builtin_templates()
    matched_builtin = next((b for b in builtins if b["id"] == template_id), None)
    if matched_builtin:
        req_cols = matched_builtin.get("required_columns", [])
    else:
        db_tpl = db.query(PipelineTemplate).filter(PipelineTemplate.id == template_id).first()
        if not db_tpl:
            raise HTTPException(status_code=404, detail="Template not found")
        req_cols = db_tpl.required_columns or []

    suggestions = template_service.suggest_column_mapping(req_cols, dataset_cols)
    all_matched = all(s.suggested_column is not None for s in suggestions)

    return SuggestMappingResponse(
        template_id=template_id,
        dataset_id=dataset.id,
        suggestions=suggestions,
        all_matched=all_matched,
    )


@router.post("/{template_id}/apply", response_model=TemplateApplyResponse)
def apply_template_to_dataset(
    template_id: str,
    req: TemplateApplyRequest,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    """
    Rewrites template steps with user-confirmed column mappings, producing an instantiated
    list of executable steps ready to apply to the dataset pipeline.
    """
    dataset = db.query(Dataset).filter(Dataset.id == req.dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Target dataset not found")

    # Find template steps
    template_steps = []
    builtins = template_service.get_builtin_templates()
    matched_builtin = next((b for b in builtins if b["id"] == template_id), None)
    if matched_builtin:
        template_steps = matched_builtin.get("steps", [])
    else:
        db_tpl = db.query(PipelineTemplate).filter(PipelineTemplate.id == template_id).first()
        if not db_tpl:
            raise HTTPException(status_code=404, detail="Template not found")
        template_steps = db_tpl.steps or []

    rewritten = template_service.rewrite_steps_with_mapping(
        template_steps=template_steps,
        column_mapping=req.column_mapping,
    )

    actor_email = current_user.email if current_user else "demo@stepsheet.dev"
    audit_service.record_event(
        db=db,
        action="template_applied",
        actor_email=actor_email,
        resource_type="pipeline",
        details={
            "template_id": template_id,
            "dataset_id": dataset.id,
            "steps_count": len(rewritten),
        },
    )

    return TemplateApplyResponse(
        template_id=template_id,
        dataset_id=dataset.id,
        rewritten_steps=rewritten,
        applied_count=len(rewritten),
    )
