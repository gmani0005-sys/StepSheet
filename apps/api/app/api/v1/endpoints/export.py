import os
import io
import json
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.dataset import Dataset
from app.schemas.export import ExportRequest, CodeExportResponse, RunFullPipelineRequest, RunFullPipelineResponse
from app.services.export_service import export_service
from app.services.storage import get_storage_service

router = APIRouter()


def _get_dataset_context(dataset_id: str, db: Session, steps: list):
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    storage = get_storage_service()
    local_path = storage.get_local_path(dataset.parquet_path)
    if not os.path.exists(local_path):
        raise HTTPException(status_code=404, detail="Dataset parquet file not found")

    initial_cols = [c["name"] for c in (dataset.schema_metadata or [])]
    dataset_paths = {dataset.id: local_path}

    for s in steps:
        params = s.params or {}
        for key_name in ["lookup_dataset_id", "right_dataset_id", "append_dataset_id"]:
            ref_id = params.get(key_name)
            if ref_id and ref_id not in dataset_paths:
                ref_ds = db.query(Dataset).filter(Dataset.id == ref_id).first()
                if ref_ds:
                    dataset_paths[ref_id] = storage.get_local_path(ref_ds.parquet_path)

    return local_path, initial_cols, dataset_paths


@router.post("/excel")
def export_excel(req: ExportRequest, db: Session = Depends(get_db)):
    local_path, initial_cols, dataset_paths = _get_dataset_context(req.dataset_id, db, req.steps)
    try:
        content = export_service.export_excel_bytes(
            local_parquet_path=local_path,
            initial_columns=initial_cols,
            steps=req.steps,
            dataset_paths=dataset_paths,
            include_formulas=req.include_formulas,
            include_documentation=req.include_documentation,
        )
        filename = f"stepsheet_export_{req.dataset_id[:8]}.xlsx"
        return StreamingResponse(
            io.BytesIO(content),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Excel export error: {str(e)}")


@router.post("/csv")
def export_csv(req: ExportRequest, db: Session = Depends(get_db)):
    local_path, initial_cols, dataset_paths = _get_dataset_context(req.dataset_id, db, req.steps)
    try:
        content = export_service.export_csv_bytes(
            local_parquet_path=local_path,
            initial_columns=initial_cols,
            steps=req.steps,
            dataset_paths=dataset_paths,
        )
        filename = f"stepsheet_export_{req.dataset_id[:8]}.csv"
        return StreamingResponse(
            io.BytesIO(content),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"CSV export error: {str(e)}")


@router.post("/parquet")
def export_parquet(req: ExportRequest, db: Session = Depends(get_db)):
    local_path, initial_cols, dataset_paths = _get_dataset_context(req.dataset_id, db, req.steps)
    try:
        content = export_service.export_parquet_bytes(
            local_parquet_path=local_path,
            initial_columns=initial_cols,
            steps=req.steps,
            dataset_paths=dataset_paths,
        )
        filename = f"stepsheet_export_{req.dataset_id[:8]}.parquet"
        return StreamingResponse(
            io.BytesIO(content),
            media_type="application/octet-stream",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Parquet export error: {str(e)}")


@router.post("/json")
def export_json(req: ExportRequest, db: Session = Depends(get_db)):
    local_path, initial_cols, dataset_paths = _get_dataset_context(req.dataset_id, db, req.steps)
    try:
        content = export_service.export_json_bytes(
            local_parquet_path=local_path,
            initial_columns=initial_cols,
            steps=req.steps,
            dataset_paths=dataset_paths,
        )
        filename = f"stepsheet_export_{req.dataset_id[:8]}.json"
        return StreamingResponse(
            io.BytesIO(content),
            media_type="application/json",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"JSON export error: {str(e)}")


@router.post("/code", response_model=CodeExportResponse)
def export_code(req: ExportRequest, db: Session = Depends(get_db)):
    local_path, initial_cols, dataset_paths = _get_dataset_context(req.dataset_id, db, req.steps)
    try:
        return export_service.generate_code_bundle(
            dataset_id=req.dataset_id,
            local_parquet_path=local_path,
            initial_columns=initial_cols,
            steps=req.steps,
            dataset_paths=dataset_paths,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Code generation error: {str(e)}")


@router.post("/run-full", response_model=RunFullPipelineResponse)
def run_full_pipeline(req: RunFullPipelineRequest, db: Session = Depends(get_db)):
    local_path, initial_cols, dataset_paths = _get_dataset_context(req.dataset_id, db, req.steps)
    try:
        return export_service.run_full_pipeline(
            dataset_id=req.dataset_id,
            local_parquet_path=local_path,
            initial_columns=initial_cols,
            steps=req.steps,
            dataset_paths=dataset_paths,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Pipeline execution error: {str(e)}")


@router.post("/pipeline-spec")
def export_pipeline_spec(req: ExportRequest):
    try:
        spec = {
            "version": "1.0",
            "dataset_id": req.dataset_id,
            "step_count": len(req.steps),
            "steps": [s.model_dump() for s in req.steps],
        }
        content = json.dumps(spec, indent=2).encode("utf-8")
        filename = f"pipeline_spec_{req.dataset_id[:8]}.json"
        return StreamingResponse(
            io.BytesIO(content),
            media_type="application/json",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Pipeline spec export error: {str(e)}")
