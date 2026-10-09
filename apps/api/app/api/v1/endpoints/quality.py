import os
import io
import csv
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.dataset import Dataset
from app.schemas.quality import QualityRule, QualityCheckRequest, QualityReportResponse
from app.services.quality_service import quality_service
from app.services.storage import get_storage_service
from app.services.duckdb_engine import duckdb_engine
from app.services.step_compiler import step_compiler

router = APIRouter()


@router.post("/check", response_model=QualityReportResponse)
def evaluate_quality_rules(
    req: QualityCheckRequest,
    db: Session = Depends(get_db),
):
    dataset = db.query(Dataset).filter(Dataset.id == req.dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    storage = get_storage_service()
    local_path = storage.get_local_path(dataset.parquet_path)
    if not os.path.exists(local_path):
        raise HTTPException(status_code=404, detail="Dataset parquet file not found")

    initial_cols = [c["name"] for c in (dataset.schema_metadata or [])]
    dataset_paths = {dataset.id: local_path}

    # Collect reference dataset paths if any
    for r in req.rules:
        f_id = (r.params or {}).get("foreign_dataset_id")
        if f_id and f_id not in dataset_paths:
            f_ds = db.query(Dataset).filter(Dataset.id == f_id).first()
            if f_ds:
                dataset_paths[f_id] = storage.get_local_path(f_ds.parquet_path)

    try:
        return quality_service.evaluate_quality_rules(
            dataset_id=req.dataset_id,
            local_parquet_path=local_path,
            initial_columns=initial_cols,
            rules=req.rules,
            pipeline_steps=req.pipeline_steps,
            dataset_paths=dataset_paths,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Quality check error: {str(e)}")


@router.post("/quick-audit/{dataset_id}", response_model=QualityReportResponse)
def run_quick_audit(
    dataset_id: str,
    db: Session = Depends(get_db),
):
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    storage = get_storage_service()
    local_path = storage.get_local_path(dataset.parquet_path)
    if not os.path.exists(local_path):
        raise HTTPException(status_code=404, detail="Dataset parquet file not found")

    col_info = dataset.schema_metadata or []
    initial_cols = [c["name"] for c in col_info]
    rules = quality_service.generate_quick_audit_rules(dataset_id, col_info)

    try:
        return quality_service.evaluate_quality_rules(
            dataset_id=dataset_id,
            local_parquet_path=local_path,
            initial_columns=initial_cols,
            rules=rules,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Quick audit error: {str(e)}")


@router.post("/export-failing-rows")
def export_failing_rows(
    req: QualityCheckRequest,
    db: Session = Depends(get_db),
):
    if not req.rules:
        raise HTTPException(status_code=400, detail="At least one rule must be provided.")

    dataset = db.query(Dataset).filter(Dataset.id == req.dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    storage = get_storage_service()
    local_path = storage.get_local_path(dataset.parquet_path)
    if not os.path.exists(local_path):
        raise HTTPException(status_code=404, detail="Dataset parquet file not found")

    initial_cols = [c["name"] for c in (dataset.schema_metadata or [])]
    rule = req.rules[0]
    col = rule.column
    rtype = rule.rule_type
    params = rule.params or {}

    try:
        conn = duckdb_engine.get_connection()
        if req.pipeline_steps:
            compiled_sql, _, _ = step_compiler.compile_pipeline(
                parquet_path=local_path,
                steps=req.pipeline_steps,
                initial_columns=initial_cols,
                dataset_paths={dataset.id: local_path},
            )
            sql_source = compiled_sql
        else:
            escaped = local_path.replace("\\", "/")
            sql_source = f"SELECT * FROM read_parquet('{escaped}')"

        conn.execute(f"CREATE OR REPLACE TEMPORARY VIEW target_data AS {sql_source}")

        if rtype == "not_null":
            fail_cond = f'"{col}" IS NULL'
        elif rtype == "unique":
            fail_cond = f'"{col}" IN (SELECT "{col}" FROM target_data WHERE "{col}" IS NOT NULL GROUP BY "{col}" HAVING COUNT(*) > 1)'
        elif rtype == "range":
            min_v = params.get("min")
            max_v = params.get("max")
            conds = []
            if min_v is not None:
                conds.append(f'CAST("{col}" AS DOUBLE) < {min_v}')
            if max_v is not None:
                conds.append(f'CAST("{col}" AS DOUBLE) > {max_v}')
            fail_cond = " OR ".join(conds) if conds else "1=0"
        elif rtype == "allowed_values":
            allowed = params.get("allowed_values", [])
            formatted_vals = ", ".join([f"'{str(v).replace('\'', '\'\'')}'" for v in allowed])
            fail_cond = f'CAST("{col}" AS VARCHAR) NOT IN ({formatted_vals})'
        elif rtype == "regex":
            pattern = params.get("pattern", "").replace("'", "''")
            fail_cond = f"NOT REGEXP_MATCHES(CAST(\"{col}\" AS VARCHAR), '{pattern}')"
        elif rtype == "cross_column":
            col2 = params.get("compare_column", "")
            op = params.get("operator", "<=")
            fail_cond = f'NOT ("{col}" {op} "{col2}")'
        else:
            fail_cond = "1=1"

        cur = conn.execute(f"SELECT * FROM target_data WHERE {fail_cond}")
        col_names = [d[0] for d in cur.description]
        rows = cur.fetchall()

        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(col_names)
        for r in rows:
            writer.writerow(r)
        buf.seek(0)

        filename = f"failing_rows_{rule.rule_type}_{rule.column}.csv"
        return StreamingResponse(
            io.BytesIO(buf.getvalue().encode("utf-8")),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Export failing rows error: {str(e)}")
