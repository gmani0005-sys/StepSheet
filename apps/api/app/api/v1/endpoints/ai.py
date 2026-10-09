from typing import Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.dataset import Dataset
from app.schemas.steps import StepSchema
from app.services.llm_adapter import llm_adapter

router = APIRouter()


class GenerateStepRequest(BaseModel):
    dataset_id: str
    prompt: str


class GenerateStepResponse(BaseModel):
    step: StepSchema
    explanation: str
    confidence: float
    provider: str


@router.get("/status")
def get_ai_status():
    """
    Returns the current status of the AI Assistant configuration.
    """
    return llm_adapter.get_status()


@router.post("/generate-step", response_model=GenerateStepResponse)
def generate_step(req: GenerateStepRequest, db: Session = Depends(get_db)):
    """
    Translates a plain-English analyst sentence into a pre-filled, typed step form
    ready for user review and confirmation before applying.
    """
    dataset = db.query(Dataset).filter(Dataset.id == req.dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    columns = [
        {
            "name": c.get("name") if isinstance(c, dict) else getattr(c, "name", ""),
            "data_type": c.get("data_type") if isinstance(c, dict) else getattr(c, "data_type", "text"),
            "physical_type": c.get("physical_type") if isinstance(c, dict) else getattr(c, "physical_type", "VARCHAR"),
        }
        for c in (dataset.schema_metadata or [])
    ]

    # Other datasets in the workspace for possible lookup context
    other_datasets = (
        db.query(Dataset)
        .filter(Dataset.id != req.dataset_id)
        .limit(5)
        .all()
    )
    other_list = [{"id": d.id, "name": d.name} for d in other_datasets]

    try:
        result = llm_adapter.generate_step(
            prompt=req.prompt,
            dataset_name=dataset.name,
            columns=columns,
            other_datasets=other_list,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to generate step: {str(e)}")
