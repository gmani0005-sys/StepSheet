import os
import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from app.models.dataset import Dataset
from app.models.project import Project
from app.schemas.export_job import ExportJobCreate
from app.schemas.steps import StepSchema
from app.services.storage import get_storage_service
from app.services.step_compiler import step_compiler
from app.services.duckdb_engine import duckdb_engine
from app.services.quality_service import quality_service
from app.services.join_service import join_service


@dataclass
class ExportSnapshot:
    job_id: str
    project_id: Optional[str]
    project_name: str
    dataset_id: str
    dataset_name: str
    total_raw_rows: int
    data_as_of: str
    
    # Processed Data
    columns: List[str]
    column_types: Dict[str, str]
    rows: List[Dict[str, Any]]
    total_exported_rows: int
    
    # Exclusions & Warnings
    excluded_columns: List[str]
    formula_exclusion_warnings: List[str]
    
    # Pipeline
    steps: List[StepSchema]
    step_summaries: List[Any]
    compiled_sql: str
    
    # Content block data
    content_blocks: List[str]
    lookup_tables: Dict[str, Dict[str, Any]]  # dataset_id -> {name, columns, rows}
    quality_report: Optional[Dict[str, Any]] = None
    join_reports: List[Dict[str, Any]] = field(default_factory=list)
    report_pages: List[Dict[str, Any]] = field(default_factory=list)
    
    # Metadata & Branding
    watermark: Optional[str] = None
    confidentiality_notice: Optional[str] = None
    author: str = "StepSheet Analyst"


def build_export_snapshot(
    job_id: str,
    req: ExportJobCreate,
    db: Session,
    author: str = "demo@stepsheet.dev",
) -> ExportSnapshot:
    """
    Builds an immutable, self-consistent snapshot from the real DuckDB/Polars engine.
    Numbers are strictly identical across all generated formats.
    """
    dataset = db.query(Dataset).filter(Dataset.id == req.dataset_id).first()
    if not dataset:
        raise ValueError(f"Dataset {req.dataset_id} not found")

    project_name = "StepSheet Project"
    if req.project_id:
        proj = db.query(Project).filter(Project.id == req.project_id).first()
        if proj:
            project_name = proj.title

    storage = get_storage_service()
    local_path = storage.get_local_path(dataset.parquet_path)
    if not os.path.exists(local_path):
        raise ValueError(f"Dataset parquet file not found at {local_path}")

    initial_cols = [c["name"] for c in (dataset.schema_metadata or [])]
    dataset_paths = {dataset.id: local_path}

    lookup_tables: Dict[str, Dict[str, Any]] = {}
    join_reports: List[Dict[str, Any]] = []

    # Identify and load referenced lookup / join datasets
    for s in req.steps:
        params = s.params or {}
        for key_name in ["lookup_dataset_id", "right_dataset_id", "append_dataset_id"]:
            ref_id = params.get(key_name)
            if ref_id and ref_id not in dataset_paths:
                ref_ds = db.query(Dataset).filter(Dataset.id == ref_id).first()
                if ref_ds:
                    ref_local_path = storage.get_local_path(ref_ds.parquet_path)
                    dataset_paths[ref_id] = ref_local_path

                    # Also cache lookup table rows for self-contained workbook packaging
                    if "data" in req.content_blocks or "steps" in req.content_blocks:
                        try:
                            conn = duckdb_engine.get_connection()
                            ref_escaped = ref_local_path.replace("\\", "/")
                            cur = conn.execute(f"SELECT * FROM read_parquet('{ref_escaped}') LIMIT 5000")
                            ref_cols = [d[0] for d in cur.description]
                            ref_rows = [dict(zip(ref_cols, r)) for r in cur.fetchall()]
                            lookup_tables[ref_id] = {
                                "id": ref_id,
                                "name": ref_ds.name,
                                "columns": ref_cols,
                                "rows": ref_rows,
                            }
                        except Exception:
                            pass

    # Compile and execute the full pipeline
    conn = duckdb_engine.get_connection()
    if req.steps:
        compiled_sql, step_summaries, final_cols = step_compiler.compile_pipeline(
            parquet_path=local_path,
            steps=req.steps,
            initial_columns=initial_cols,
            dataset_paths=dataset_paths,
        )
    else:
        escaped_path = local_path.replace("\\", "/")
        compiled_sql = f"SELECT * FROM read_parquet('{escaped_path}')"
        step_summaries = []
        final_cols = initial_cols

    # Apply row scope
    query_sql = compiled_sql
    if req.row_scope == "first_n" and req.row_limit and req.row_limit > 0:
        query_sql = f"SELECT * FROM ({compiled_sql}) LIMIT {int(req.row_limit)}"

    cur = conn.execute(query_sql)
    all_query_cols = [d[0] for d in cur.description]
    raw_rows = [dict(zip(all_query_cols, r)) for r in cur.fetchall()]

    # Filter out excluded columns (Privacy rule)
    excluded_set = set(req.excluded_columns or [])
    active_columns = [c for c in all_query_cols if c not in excluded_set]

    # Check for formula dependencies on excluded columns
    formula_warnings = []
    for s in req.steps:
        params = s.params or {}
        for k, v in params.items():
            if isinstance(v, str) and v in excluded_set:
                formula_warnings.append(
                    f"Step '{s.label}' references excluded column '{v}'. Formulas falling back to static values."
                )

    # Strip excluded columns from all rows
    processed_rows = []
    for row in raw_rows:
        filtered_row = {k: v for k, v in row.items() if k not in excluded_set}
        processed_rows.append(filtered_row)

    # Determine column data types
    col_types = {}
    schema_map = {c["name"]: c.get("data_type", "text") for c in (dataset.schema_metadata or [])}
    for col in active_columns:
        col_types[col] = schema_map.get(col, "text")

    # Evaluate Quality Rules if requested
    quality_rep = None
    if "quality" in req.content_blocks:
        try:
            audit_rules = quality_service.generate_quick_audit_rules(dataset.id, dataset.schema_metadata or [])
            eval_res = quality_service.evaluate_quality_rules(
                dataset_id=dataset.id,
                local_parquet_path=local_path,
                initial_columns=initial_cols,
                rules=audit_rules,
                pipeline_steps=req.steps,
                dataset_paths=dataset_paths,
            )
            quality_rep = eval_res.model_dump()
        except Exception:
            quality_rep = None

    # Evaluate Join Health if requested
    if "joins" in req.content_blocks:
        for s in req.steps:
            if s.type == "join" and s.params:
                r_id = s.params.get("right_dataset_id")
                k_pairs = s.params.get("key_pairs") or []
                if r_id and r_id in dataset_paths and k_pairs:
                    try:
                        from app.schemas.joins import JoinKeyPair
                        kp_objs = [JoinKeyPair(**kp) for kp in k_pairs]
                        j_check = join_service.run_health_check(
                            left_parquet_path=local_path,
                            right_parquet_path=dataset_paths[r_id],
                            key_pairs=kp_objs,
                            join_type=s.params.get("join_type", "left"),
                        )
                        join_reports.append({
                            "step_label": s.label,
                            "right_dataset_id": r_id,
                            "report": j_check.model_dump(),
                        })
                    except Exception:
                        pass

    now_utc = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

    return ExportSnapshot(
        job_id=job_id,
        project_id=req.project_id,
        project_name=project_name,
        dataset_id=dataset.id,
        dataset_name=dataset.name,
        total_raw_rows=dataset.row_count,
        data_as_of=now_utc,
        columns=active_columns,
        column_types=col_types,
        rows=processed_rows,
        total_exported_rows=len(processed_rows),
        excluded_columns=list(excluded_set),
        formula_exclusion_warnings=formula_warnings,
        steps=req.steps,
        step_summaries=step_summaries,
        compiled_sql=compiled_sql,
        content_blocks=req.content_blocks,
        lookup_tables=lookup_tables,
        quality_report=quality_rep,
        join_reports=join_reports,
        report_pages=req.report_pages or [],
        watermark=req.watermark,
        confidentiality_notice=req.confidentiality_notice,
        author=author,
    )
