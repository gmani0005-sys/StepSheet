from typing import Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.dataset import Dataset
from app.schemas.steps import StepSchema
from app.schemas.chat_query import ChatQueryRequest, ChatQueryResponse
from app.schemas.ai_dashboard import (
    GenerateDashboardRequest,
    GenerateDashboardResponse,
    PatchDashboardRequest,
    PatchDashboardResponse,
)
from app.services.llm_adapter import llm_adapter
from app.services.chat_query_service import chat_query_service
from app.services.ai_dashboard_service import ai_dashboard_service

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


@router.post("/chat-query", response_model=ChatQueryResponse)
def execute_chat_query(req: ChatQueryRequest, db: Session = Depends(get_db)):
    """
    Feature A: Chat with Data. Translates analytical plain English questions into
    a safe structured DuckDB plan, executes locally, and returns explanation,
    calculated tables, and chart visuals.
    """
    try:
        response = chat_query_service.process_chat_query(
            db=db,
            dataset_id=req.dataset_id,
            prompt=req.prompt,
            model_tag=req.model_tag,
            idempotency_key=req.idempotency_key,
            columns=req.columns,
            sample_rows=req.sample_rows,
            dataset_name=req.dataset_name,
        )
        return response
    except ValueError as ve:
        raise HTTPException(status_code=404 if "not found" in str(ve) else 400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Chat query execution failed: {str(e)}")


@router.post("/generate-dashboard", response_model=GenerateDashboardResponse)
def generate_interactive_dashboard(req: GenerateDashboardRequest, db: Session = Depends(get_db)):
    """
    Feature B: Native Julius-style interactive dashboard generation from a plain-English prompt.
    Profiles dataset locally, plans KPIs/visuals/slicers, verifies in DuckDB, and returns structured plan.
    """
    try:
        response = ai_dashboard_service.generate_dashboard(
            db=db,
            dataset_id=req.dataset_id,
            prompt=req.prompt,
            model_tag=req.model_tag,
            idempotency_key=req.idempotency_key,
            columns=req.columns,
            sample_rows=req.sample_rows,
            dataset_name=req.dataset_name,
        )
        return response
    except ValueError as ve:
        raise HTTPException(status_code=404 if "not found" in str(ve) else 400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Dashboard generation failed: {str(e)}")


@router.post("/patch-dashboard", response_model=PatchDashboardResponse)
def patch_interactive_dashboard(req: PatchDashboardRequest, db: Session = Depends(get_db)):
    """
    Conversational Dashboard Editing: Takes plain-English editing commands (e.g. 'Add a monthly trend',
    'Remove pie chart', 'Add region slicer') and applies constrained patches without rebuilding unrelated visuals.
    """
    try:
        response = ai_dashboard_service.patch_dashboard(
            db=db,
            dataset_id=req.dataset_id,
            prompt=req.prompt,
            current_dashboard=req.current_dashboard,
            model_tag=req.model_tag,
            idempotency_key=req.idempotency_key,
            columns=req.columns,
            sample_rows=req.sample_rows,
            dataset_name=req.dataset_name,
        )
        return response
    except ValueError as ve:
        raise HTTPException(status_code=404 if "not found" in str(ve) else 400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Dashboard patch failed: {str(e)}")
