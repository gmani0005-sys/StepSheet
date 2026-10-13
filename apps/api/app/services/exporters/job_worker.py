import os
import uuid
import threading
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List
from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.core.config import settings
from app.models.export_job import ExportJob
from app.schemas.export_job import ExportJobCreate, ExportFileMetadata
from app.services.exporters.snapshot import build_export_snapshot, ExportSnapshot
from app.services.exporters.datafile_exporter import (
    export_csv_file,
    export_parquet_file,
    export_json_file,
    export_xlsx_values_file,
)
from app.services.exporters.packaged_workbook_exporter import export_packaged_workbook_file
from app.services.exporters.pdf_exporter import export_pdf_report_file
from app.services.exporters.presentation_exporter import export_presentation_file
from app.services.exporters.starter_pack_exporter import (
    export_powerbi_starter_pack_file,
    export_pipeline_code_bundle_file,
    export_complete_share_pack_file,
)
from app.services.audit_service import audit_service


def get_worker_db() -> Session:
    from app.core.database import get_db
    from app.main import app
    if get_db in app.dependency_overrides:
        gen = app.dependency_overrides[get_db]()
        return next(gen)
    return SessionLocal()


class ExportJobWorker:
    def __init__(self):
        self._cancelled_jobs = set()

    def cancel_job(self, job_id: str):
        self._cancelled_jobs.add(job_id)

    def is_cancelled(self, job_id: str) -> bool:
        return job_id in self._cancelled_jobs

    def submit_export_job(self, job_id: str, req: ExportJobCreate, author: str = "demo@stepsheet.dev"):
        """Launches the export job in a dedicated background worker thread."""
        thread = threading.Thread(
            target=self._run_job,
            args=(job_id, req, author),
            daemon=True,
            name=f"export-job-{job_id[:8]}",
        )
        thread.start()

    def run_job_sync(self, job_id: str, req: ExportJobCreate, author: str = "demo@stepsheet.dev"):
        """Runs the export job synchronously (e.g. via FastAPI BackgroundTasks)."""
        self._run_job(job_id, req, author)

    def _update_job_status(
        self,
        job_id: str,
        status: str,
        progress_pct: int,
        current_step: str,
        files: List[Dict[str, Any]] = None,
        error_message: str = None,
    ):
        db: Session = get_worker_db()
        try:
            job = db.query(ExportJob).filter(ExportJob.id == job_id).first()
            if job:
                job.status = status
                job.progress_pct = progress_pct
                job.current_step = current_step
                if files is not None:
                    job.files = files
                if error_message is not None:
                    job.error_message = error_message
                if status == "completed":
                    job.completed_at = datetime.now(timezone.utc)
                    job.expires_at = datetime.now(timezone.utc) + timedelta(days=7)
                db.commit()
        finally:
            db.close()

    def _run_job(self, job_id: str, req: ExportJobCreate, author: str):
        db: Session = get_worker_db()
        output_dir = os.path.join(settings.LOCAL_STORAGE_DIR, "exports", job_id)
        os.makedirs(output_dir, exist_ok=True)

        try:
            if self.is_cancelled(job_id):
                self._update_job_status(job_id, "cancelled", 0, "Job was cancelled.")
                return

            self._update_job_status(job_id, "processing", 15, "Capturing snapshot from pipeline...")

            # 1. Build immutable snapshot
            snapshot = build_export_snapshot(job_id, req, db, author)

            if self.is_cancelled(job_id):
                self._update_job_status(job_id, "cancelled", 0, "Job was cancelled.")
                return

            self._update_job_status(job_id, "processing", 35, "Generating requested file formats...")

            generated_files: List[Dict[str, Any]] = []
            formats_to_build = req.formats or ["csv"]
            num_formats = len(formats_to_build)

            for idx, fmt in enumerate(formats_to_build):
                if self.is_cancelled(job_id):
                    self._update_job_status(job_id, "cancelled", 0, "Job was cancelled.")
                    return

                pct = 35 + int(((idx + 1) / max(1, num_formats)) * 55)
                self._update_job_status(job_id, "processing", pct, f"Generating {fmt.upper()}...")

                file_id = str(uuid.uuid4())

                if fmt == "csv":
                    path, size, mime = export_csv_file(
                        snapshot,
                        output_dir,
                        delimiter=req.csv_delimiter,
                        encoding=req.csv_encoding,
                        quote_style=req.csv_quote_style,
                    )
                    filename = os.path.basename(path)
                    generated_files.append({
                        "file_id": file_id,
                        "filename": filename,
                        "format": "csv",
                        "size_bytes": size,
                        "storage_path": path,
                        "mime_type": mime,
                        "download_url": f"/api/v1/exports/{job_id}/files/{file_id}",
                    })

                elif fmt == "parquet":
                    path, size, mime = export_parquet_file(snapshot, output_dir)
                    filename = os.path.basename(path)
                    generated_files.append({
                        "file_id": file_id,
                        "filename": filename,
                        "format": "parquet",
                        "size_bytes": size,
                        "storage_path": path,
                        "mime_type": mime,
                        "download_url": f"/api/v1/exports/{job_id}/files/{file_id}",
                    })

                elif fmt == "json":
                    path, size, mime = export_json_file(snapshot, output_dir)
                    filename = os.path.basename(path)
                    generated_files.append({
                        "file_id": file_id,
                        "filename": filename,
                        "format": "json",
                        "size_bytes": size,
                        "storage_path": path,
                        "mime_type": mime,
                        "download_url": f"/api/v1/exports/{job_id}/files/{file_id}",
                    })

                elif fmt in ("packaged_workbook", "xlsx_packaged"):
                    include_lineage = "steps" in req.content_blocks or "lineage" in req.content_blocks
                    include_quality = "quality" in req.content_blocks
                    include_lookups = "lookups" in req.content_blocks
                    include_dict = "dictionary" in req.content_blocks
                    path, size, mime = export_packaged_workbook_file(
                        snapshot,
                        output_dir,
                        include_live_formulas=req.include_formulas,
                        include_lineage=include_lineage,
                        include_quality=include_quality,
                        include_lookups=include_lookups,
                        include_dictionary=include_dict,
                    )
                    filename = os.path.basename(path)
                    generated_files.append({
                        "file_id": file_id,
                        "filename": filename,
                        "format": "xlsx",
                        "size_bytes": size,
                        "storage_path": path,
                        "mime_type": mime,
                        "download_url": f"/api/v1/exports/{job_id}/files/{file_id}",
                    })

                elif fmt in ("xlsx_values", "xlsx"):
                    path, size, mime = export_xlsx_values_file(snapshot, output_dir)
                    filename = os.path.basename(path)
                    generated_files.append({
                        "file_id": file_id,
                        "filename": filename,
                        "format": "xlsx",
                        "size_bytes": size,
                        "storage_path": path,
                        "mime_type": mime,
                        "download_url": f"/api/v1/exports/{job_id}/files/{file_id}",
                    })

                elif fmt in ("pdf", "pdf_report"):
                    path, size, mime = export_pdf_report_file(snapshot, output_dir, preview_row_limit=req.preview_row_cap)
                    filename = os.path.basename(path)
                    generated_files.append({
                        "file_id": file_id,
                        "filename": filename,
                        "format": "pdf",
                        "size_bytes": size,
                        "storage_path": path,
                        "mime_type": mime,
                        "download_url": f"/api/v1/exports/{job_id}/files/{file_id}",
                    })

                elif fmt in ("pptx", "powerpoint", "presentation"):
                    path, size, mime = export_presentation_file(snapshot, output_dir)
                    filename = os.path.basename(path)
                    generated_files.append({
                        "file_id": file_id,
                        "filename": filename,
                        "format": "pptx",
                        "size_bytes": size,
                        "storage_path": path,
                        "mime_type": mime,
                        "download_url": f"/api/v1/exports/{job_id}/files/{file_id}",
                    })

                elif fmt in ("powerbi_starter", "powerbi"):
                    path, size, mime = export_powerbi_starter_pack_file(snapshot, output_dir)
                    filename = os.path.basename(path)
                    generated_files.append({
                        "file_id": file_id,
                        "filename": filename,
                        "format": "zip",
                        "size_bytes": size,
                        "storage_path": path,
                        "mime_type": mime,
                        "download_url": f"/api/v1/exports/{job_id}/files/{file_id}",
                    })

                elif fmt in ("code", "code_bundle", "pipeline_code"):
                    path, size, mime = export_pipeline_code_bundle_file(snapshot, output_dir)
                    filename = os.path.basename(path)
                    generated_files.append({
                        "file_id": file_id,
                        "filename": filename,
                        "format": "zip",
                        "size_bytes": size,
                        "storage_path": path,
                        "mime_type": mime,
                        "download_url": f"/api/v1/exports/{job_id}/files/{file_id}",
                    })

                elif fmt in ("share_pack", "all_formats", "complete_pack"):
                    wb_path, _, _ = export_packaged_workbook_file(snapshot, output_dir)
                    pdf_path, _, _ = export_pdf_report_file(snapshot, output_dir)
                    pptx_path, _, _ = export_presentation_file(snapshot, output_dir)
                    csv_path, _, _ = export_csv_file(snapshot, output_dir)

                    bundle_items = [
                        (wb_path, os.path.basename(wb_path)),
                        (pdf_path, os.path.basename(pdf_path)),
                        (pptx_path, os.path.basename(pptx_path)),
                        (csv_path, os.path.basename(csv_path)),
                    ]
                    path, size, mime = export_complete_share_pack_file(snapshot, output_dir, bundle_items)
                    filename = os.path.basename(path)
                    generated_files.append({
                        "file_id": file_id,
                        "filename": filename,
                        "format": "zip",
                        "size_bytes": size,
                        "storage_path": path,
                        "mime_type": mime,
                        "download_url": f"/api/v1/exports/{job_id}/files/{file_id}",
                    })

            self._update_job_status(
                job_id,
                "completed",
                100,
                f"Completed. {len(generated_files)} file(s) generated.",
                files=generated_files,
            )

            # Audit log event
            audit_service.record_event(
                db=db,
                action="export_created",
                project_id=req.project_id,
                actor_email=author,
                resource_type="export",
                details={
                    "job_id": job_id,
                    "formats": formats_to_build,
                    "row_count": snapshot.total_exported_rows,
                },
            )

        except Exception as e:
            self._update_job_status(
                job_id,
                "failed",
                0,
                f"Error generating export: {str(e)}",
                error_message=str(e),
            )
        finally:
            db.close()


export_worker = ExportJobWorker()
