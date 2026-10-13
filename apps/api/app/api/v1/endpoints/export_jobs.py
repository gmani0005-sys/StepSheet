import os
import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.api.deps import get_current_user_optional
from app.models.user import User
from app.models.export_job import ExportJob
from app.schemas.export_job import ExportJobCreate, ExportJobResponse, ExportFileMetadata
from app.services.exporters.job_worker import export_worker

router = APIRouter()


@router.post(
    "",
    response_model=ExportJobResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create background export job",
)
def create_export_job(
    req: ExportJobCreate,
    background_tasks: BackgroundTasks,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    job_id = str(uuid.uuid4())
    author = current_user.email if current_user else "demo@stepsheet.dev"

    if req.format:
        req.formats = [req.format]
    if req.row_scope == "custom" and req.row_limit:
        req.row_scope = "first_n"
    elif req.row_scope == "preview":
        req.row_scope = "first_n"
        req.row_limit = 500
    if req.include_lineage is True and "lineage" not in req.content_blocks:
        req.content_blocks.append("lineage")
    if req.include_quality is True and "quality" not in req.content_blocks:
        req.content_blocks.append("quality")
    if req.include_lookups is True and "lookups" not in req.content_blocks:
        req.content_blocks.append("lookups")
    if req.include_dictionary is True and "dictionary" not in req.content_blocks:
        req.content_blocks.append("dictionary")

    job = ExportJob(
        id=job_id,
        project_id=req.project_id,
        dataset_id=req.dataset_id,
        created_by=author,
        status="pending",
        progress_pct=5,
        current_step="Queued for processing...",
        formats=req.formats,
        content_blocks=req.content_blocks,
        row_scope=req.row_scope,
        row_limit=req.row_limit,
        excluded_columns=req.excluded_columns,
        files=[],
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    # Launch background worker
    background_tasks.add_task(export_worker.run_job_sync, job_id, req, author)

    return ExportJobResponse(
        id=job.id,
        project_id=job.project_id,
        dataset_id=job.dataset_id,
        status=job.status,
        progress_pct=job.progress_pct,
        current_step=job.current_step,
        formats=job.formats or [],
        files=[],
        error_message=None,
        created_at=job.created_at,
        completed_at=job.completed_at,
        expires_at=job.expires_at,
    )


@router.get(
    "/{job_id}",
    response_model=ExportJobResponse,
    summary="Get export job status and generated files",
)
def get_export_job(
    job_id: str,
    db: Session = Depends(get_db),
):
    job = db.query(ExportJob).filter(ExportJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Export job not found")

    file_metas = [ExportFileMetadata(**f) for f in (job.files or [])]

    return ExportJobResponse(
        id=job.id,
        project_id=job.project_id,
        dataset_id=job.dataset_id,
        status=job.status,
        progress_pct=job.progress_pct,
        current_step=job.current_step,
        formats=job.formats or [],
        files=file_metas,
        error_message=job.error_message,
        created_at=job.created_at,
        completed_at=job.completed_at,
        expires_at=job.expires_at,
    )


@router.get(
    "/{job_id}/files/{file_id}",
    summary="Download or stream an exported file",
)
def download_export_file(
    job_id: str,
    file_id: str,
    db: Session = Depends(get_db),
):
    job = db.query(ExportJob).filter(ExportJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Export job not found")

    target_file = None
    for f in (job.files or []):
        if f.get("file_id") == file_id:
            target_file = f
            break

    if not target_file:
        raise HTTPException(status_code=404, detail="File not found in export job")

    storage_path = target_file.get("storage_path")
    if not storage_path or not os.path.exists(storage_path):
        raise HTTPException(status_code=404, detail="File no longer exists on disk")

    filename = target_file.get("filename", "export_file")
    mime_type = target_file.get("mime_type", "application/octet-stream")

    return FileResponse(
        path=storage_path,
        media_type=mime_type,
        filename=filename,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post(
    "/{job_id}/cancel",
    summary="Cancel an active export job",
)
def cancel_export_job(
    job_id: str,
    db: Session = Depends(get_db),
):
    job = db.query(ExportJob).filter(ExportJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Export job not found")

    export_worker.cancel_job(job_id)
    job.status = "cancelled"
    job.current_step = "Job cancelled by user"
    db.commit()
    return {"status": "cancelled", "job_id": job_id}


@router.get(
    "/history/{project_id}",
    response_model=List[ExportJobResponse],
    summary="List export history for a project",
)
def list_export_history(
    project_id: str,
    limit: int = 20,
    db: Session = Depends(get_db),
):
    jobs = (
        db.query(ExportJob)
        .filter(ExportJob.project_id == project_id)
        .order_by(ExportJob.created_at.desc())
        .limit(limit)
        .all()
    )

    results = []
    for job in jobs:
        file_metas = [ExportFileMetadata(**f) for f in (job.files or [])]
        results.append(
            ExportJobResponse(
                id=job.id,
                project_id=job.project_id,
                dataset_id=job.dataset_id,
                status=job.status,
                progress_pct=job.progress_pct,
                current_step=job.current_step,
                formats=job.formats or [],
                files=file_metas,
                error_message=job.error_message,
                created_at=job.created_at,
                completed_at=job.completed_at,
                expires_at=job.expires_at,
            )
        )
    return results
