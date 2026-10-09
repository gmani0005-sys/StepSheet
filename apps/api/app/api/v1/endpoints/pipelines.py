import os
import math
import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.dataset import Dataset
from app.models.pipeline import Pipeline
from app.schemas.steps import (
    PipelinePreviewRequest,
    PipelinePreviewResponse,
    StepSchema,
)
from app.schemas.dataset import ColumnSchema
from app.services.storage import get_storage_service
from app.services.duckdb_engine import duckdb_engine
from app.services.step_compiler import step_compiler

router = APIRouter()


@router.post("/preview", response_model=PipelinePreviewResponse)
def preview_pipeline(
    req: PipelinePreviewRequest,
    db: Session = Depends(get_db),
):
    """
    Execute a reactive preview of an applied step pipeline on the dataset using DuckDB.
    Returns transformed rows, updated schema, and compiled code for each step.
    """
    dataset = db.query(Dataset).filter(Dataset.id == req.dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    storage = get_storage_service()
    local_parquet_path = storage.get_local_path(dataset.parquet_path)

    if not os.path.exists(local_parquet_path):
        raise HTTPException(status_code=404, detail="Parquet file not found")

    # Get initial columns
    initial_schema = dataset.schema_metadata or []
    initial_cols = [c["name"] for c in initial_schema]

    try:
        compiled_sql, step_summaries, final_cols = step_compiler.compile_pipeline(
            parquet_path=local_parquet_path,
            steps=req.steps,
            initial_columns=initial_cols,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to compile pipeline: {str(e)}")

    conn = duckdb_engine.get_connection()
    try:
        # Count total rows produced by pipeline
        count_sql = f"SELECT count(*) FROM (\n{compiled_sql}\n);"
        filtered_rows = conn.execute(count_sql).fetchone()[0]

        # Fetch paginated rows window
        paginated_sql = f"{compiled_sql}\nLIMIT {req.limit} OFFSET {req.offset};"
        cursor = conn.execute(paginated_sql)
        desc = cursor.description
        col_names = [d[0] for d in desc]
        raw_rows = cursor.fetchall()

        # Describe types of transformed columns
        desc_sql = f"DESCRIBE SELECT * FROM (\n{compiled_sql}\n) LIMIT 0;"
        type_rows = conn.execute(desc_sql).fetchall()
        transformed_schema: List[ColumnSchema] = []
        for tr in type_rows:
            c_name = str(tr[0])
            p_type = str(tr[1])
            transformed_schema.append(
                ColumnSchema(
                    name=c_name,
                    physical_type=p_type,
                    data_type=duckdb_engine.map_duckdb_type_to_simple(p_type),
                    nullable=True,
                )
            )

        # Clean NaNs and formats for JSON
        rows_data = []
        for r in raw_rows:
            record = {}
            for col_name, val in zip(col_names, r):
                if val is None:
                    record[col_name] = None
                elif isinstance(val, float) and (math.isnan(val) or math.isinf(val)):
                    record[col_name] = None
                elif hasattr(val, "isoformat"):
                    record[col_name] = val.isoformat()
                else:
                    record[col_name] = val
            rows_data.append(record)

        return PipelinePreviewResponse(
            dataset_id=dataset.id,
            total_rows=dataset.row_count,
            filtered_rows=filtered_rows,
            offset=req.offset,
            limit=req.limit,
            columns=transformed_schema,
            rows=rows_data,
            compiled_sql=compiled_sql,
            steps=step_summaries,
        )

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"DuckDB step execution error: {str(e)}")
    finally:
        conn.close()


@router.post("", status_code=status.HTTP_201_CREATED)
def save_pipeline(
    project_id: str,
    name: str,
    dataset_id: str,
    steps: List[StepSchema],
    db: Session = Depends(get_db),
):
    """Save pipeline steps definition to database."""
    pipeline = Pipeline(
        id=str(uuid.uuid4()),
        project_id=project_id,
        name=name,
        source_dataset_id=dataset_id,
        steps=[s.model_dump() for s in steps],
    )
    db.add(pipeline)
    db.commit()
    db.refresh(pipeline)
    return {
        "id": pipeline.id,
        "name": pipeline.name,
        "steps_count": len(steps),
        "created_at": pipeline.created_at,
    }
