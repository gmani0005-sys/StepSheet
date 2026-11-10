from typing import Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.services.ollama_manager import ollama_manager
from app.services.credit_ledger import credit_ledger

router = APIRouter()


class PullModelRequest(BaseModel):
    model_tag: str


class HealthTestRequest(BaseModel):
    model_tag: Optional[str] = None


@router.get("/system-check")
def get_system_check():
    """
    Returns hardware specs (RAM, CPU, GPU, Disk) and Ollama service status.
    """
    specs = ollama_manager.get_hardware_specs()
    is_running = ollama_manager.is_service_running()
    binary_path = ollama_manager.find_ollama_binary()

    return {
        "hardware": specs,
        "ollama_installed": bool(binary_path),
        "ollama_binary": binary_path,
        "ollama_running": is_running,
        "base_url": ollama_manager.base_url,
    }


@router.post("/start-service")
def start_ollama_service():
    """
    Attempts to start the Ollama background service if it is stopped.
    """
    result = ollama_manager.start_service()
    if result.get("status") == "error":
        raise HTTPException(status_code=500, detail=result.get("message"))
    return result


@router.get("/models-catalog")
def get_models_catalog():
    """
    Returns the tested hardware-aware model catalog with installation statuses.
    """
    return ollama_manager.get_catalog()


@router.get("/installed-models")
def get_installed_models():
    """
    Lists all models currently stored in local Ollama storage.
    """
    return ollama_manager.list_installed_models()


@router.post("/pull-model")
def pull_model(req: PullModelRequest):
    """
    Starts downloading a model in the background with progress tracking.
    """
    result = ollama_manager.start_model_pull(req.model_tag)
    if result.get("status") == "error":
        raise HTTPException(status_code=400, detail=result.get("message"))
    return result


@router.get("/pull-status/{model_tag:path}")
def get_pull_status(model_tag: str):
    """
    Returns the current download progress percentage and transfer speed.
    """
    return ollama_manager.get_pull_status(model_tag)


@router.post("/health-test")
def run_health_test(req: HealthTestRequest):
    """
    Validates that the local model can produce structured JSON output.
    """
    result = ollama_manager.run_health_test(req.model_tag)
    if not result.get("ready"):
        raise HTTPException(status_code=503, detail=result.get("error", "Local AI health check failed."))
    return result


@router.get("/entitlements")
def get_entitlements(provider: str = Query("ollama"), db: Session = Depends(get_db)):
    """
    Returns AI credits and entitlement quota.
    Local Ollama mode is completely free and unlimited.
    """
    return credit_ledger.get_entitlement_status(db, provider=provider)
