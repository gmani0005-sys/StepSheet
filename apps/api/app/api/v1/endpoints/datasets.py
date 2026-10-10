import os
import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.api.deps import get_current_user_optional
from app.models.user import User
from app.models.dataset import Dataset
from app.schemas.dataset import (
    DatasetResponse,
    DatasetRowsRequest,
    DatasetRowsResponse,
    ColumnSchema,
)
from app.services.storage import get_storage_service
from app.services.duckdb_engine import duckdb_engine

router = APIRouter()


@router.post("/upload", response_model=DatasetResponse, status_code=status.HTTP_201_CREATED)
async def upload_dataset(
    file: UploadFile = File(...),
    name: Optional[str] = Form(None),
    project_id: Optional[str] = Form(None),
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    """
    Upload a CSV, XLSX, or Parquet dataset.
    The file is stored, converted to canonical Parquet, and indexed in DuckDB.
    """
    if not current_user:
        # Create or fetch default demo user for frictionless local dev
        current_user = db.query(User).filter(User.email == "demo@stepsheet.dev").first()
        if not current_user:
            from app.core.security import hash_password
            current_user = User(
                id=str(uuid.uuid4()),
                email="demo@stepsheet.dev",
                hashed_password=hash_password("demo123456"),
                full_name="Demo Analyst",
            )
            db.add(current_user)
            db.commit()
            db.refresh(current_user)

    filename = file.filename or "dataset.csv"
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in ["csv", "xlsx", "xls", "parquet"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file format '{ext}'. Supported formats: CSV, XLSX, Parquet.",
        )

    storage = get_storage_service()
    dataset_id = str(uuid.uuid4())
    raw_rel_path = f"raw/{dataset_id}_{filename}"
    parquet_rel_path = f"parquet/{dataset_id}.parquet"

    # Save uploaded file
    try:
        raw_storage_path = storage.save_file(file.file, raw_rel_path)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save file: {str(e)}",
        )

    # Ingest and convert to Parquet
    local_raw_path = storage.get_local_path(raw_storage_path)
    local_parquet_path = storage.get_local_path(parquet_rel_path)
    os.makedirs(os.path.dirname(local_parquet_path), exist_ok=True)

    try:
        row_count, col_count, columns = duckdb_engine.ingest_file_to_parquet(
            source_path=local_raw_path,
            target_parquet_path=local_parquet_path,
            file_format=ext,
        )
    except Exception as e:
        # Cleanup uploaded raw file on error
        storage.delete_file(raw_storage_path)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to process and ingest data: {str(e)}",
        )

    # Calculate file size
    file_size = os.path.getsize(local_parquet_path) if os.path.exists(local_parquet_path) else 0

    dataset = Dataset(
        id=dataset_id,
        project_id=project_id,
        owner_id=current_user.id,
        name=name or filename.rsplit(".", 1)[0],
        original_filename=filename,
        file_format=ext,
        file_path=raw_storage_path,
        parquet_path=parquet_rel_path,
        row_count=row_count,
        column_count=col_count,
        file_size_bytes=file_size,
        schema_metadata=[c.model_dump() for c in columns],
    )
    db.add(dataset)
    db.commit()
    db.refresh(dataset)

    return DatasetResponse(
        id=dataset.id,
        project_id=dataset.project_id,
        name=dataset.name,
        original_filename=dataset.original_filename,
        file_format=dataset.file_format,
        row_count=dataset.row_count,
        column_count=dataset.column_count,
        file_size_bytes=dataset.file_size_bytes,
        schema_metadata=columns,
        created_at=dataset.created_at,
        updated_at=dataset.updated_at,
    )


@router.get("", response_model=List[DatasetResponse])
def list_datasets(
    project_id: Optional[str] = None,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    """List datasets available to the current user."""
    query = db.query(Dataset)
    if current_user:
        query = query.filter(Dataset.owner_id == current_user.id)
    if project_id:
        query = query.filter(Dataset.project_id == project_id)
    datasets = query.order_by(Dataset.created_at.desc()).all()

    result = []
    for d in datasets:
        cols = [ColumnSchema(**c) for c in (d.schema_metadata or [])]
        result.append(
            DatasetResponse(
                id=d.id,
                project_id=d.project_id,
                name=d.name,
                original_filename=d.original_filename,
                file_format=d.file_format,
                row_count=d.row_count,
                column_count=d.column_count,
                file_size_bytes=d.file_size_bytes,
                schema_metadata=cols,
                created_at=d.created_at,
                updated_at=d.updated_at,
            )
        )
    return result


@router.get("/{dataset_id}", response_model=DatasetResponse)
def get_dataset(
    dataset_id: str,
    db: Session = Depends(get_db),
):
    """Retrieve metadata for a dataset."""
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    cols = [ColumnSchema(**c) for c in (dataset.schema_metadata or [])]
    return DatasetResponse(
        id=dataset.id,
        project_id=dataset.project_id,
        name=dataset.name,
        original_filename=dataset.original_filename,
        file_format=dataset.file_format,
        row_count=dataset.row_count,
        column_count=dataset.column_count,
        file_size_bytes=dataset.file_size_bytes,
        schema_metadata=cols,
        created_at=dataset.created_at,
        updated_at=dataset.updated_at,
    )


@router.post("/{dataset_id}/rows", response_model=DatasetRowsResponse)
def get_dataset_rows(
    dataset_id: str,
    request: DatasetRowsRequest,
    db: Session = Depends(get_db),
):
    """
    Fetch a paginated/virtualized row window from the dataset with optional sorting, filtering, and search.
    The browser receives only the requested window (default 100 rows).
    """
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    storage = get_storage_service()
    local_parquet_path = storage.get_local_path(dataset.parquet_path)

    if not os.path.exists(local_parquet_path):
        raise HTTPException(status_code=404, detail="Dataset parquet file not found in storage")

    try:
        total_rows, filtered_rows, rows, columns = duckdb_engine.fetch_rows(
            parquet_path=local_parquet_path,
            offset=request.offset,
            limit=request.limit,
            sort_conditions=request.sort,
            filter_conditions=request.filters,
            search_query=request.search,
        )
        return DatasetRowsResponse(
            dataset_id=dataset.id,
            total_rows=total_rows,
            filtered_rows=filtered_rows,
            offset=request.offset,
            limit=request.limit,
            columns=columns,
            rows=rows,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to query dataset rows: {str(e)}")


@router.delete("/{dataset_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_dataset(
    dataset_id: str,
    db: Session = Depends(get_db),
):
    """Delete a dataset and its storage files."""
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    storage = get_storage_service()
    storage.delete_file(dataset.file_path)
    storage.delete_file(dataset.parquet_path)

    db.delete(dataset)
    db.commit()
    return None


@router.post("/load-samples", response_model=List[DatasetResponse], status_code=status.HTTP_201_CREATED)
def load_sample_datasets(
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    """
    Ingest and register sample datasets (Orders and Customers) for quick demo and acceptance testing.
    """
    from pathlib import Path
    import shutil

    candidates = [
        Path.cwd() / "samples",
        Path(__file__).resolve().parents[6] / "samples",
        Path(__file__).resolve().parents[4] / "samples",
    ]
    samples_dir = next((c for c in candidates if c.exists()), None)
    if not samples_dir:
        raise HTTPException(status_code=404, detail="Samples directory not found on server")

    if not current_user:
        current_user = db.query(User).filter(User.email == "demo@stepsheet.dev").first()
        if not current_user:
            from app.core.security import hash_password
            current_user = User(
                id=str(uuid.uuid4()),
                email="demo@stepsheet.dev",
                hashed_password=hash_password("demo123456"),
                full_name="Demo Analyst",
            )
            db.add(current_user)
            db.commit()
            db.refresh(current_user)

    storage = get_storage_service()
    results: List[DatasetResponse] = []

    sample_files = [
        ("orders.xlsx", "xlsx", "Orders (Sample XLSX)"),
        ("customers.csv", "csv", "Customers (Sample CSV)"),
    ]

    for fname, ext, friendly_name in sample_files:
        src_path = samples_dir / fname
        if not src_path.exists():
            continue

        dataset_id = str(uuid.uuid4())
        raw_rel_path = f"raw/{dataset_id}_{fname}"
        parquet_rel_path = f"parquet/{dataset_id}.parquet"

        local_raw_path = storage.get_local_path(raw_rel_path)
        local_parquet_path = storage.get_local_path(parquet_rel_path)
        os.makedirs(os.path.dirname(local_raw_path), exist_ok=True)
        os.makedirs(os.path.dirname(local_parquet_path), exist_ok=True)

        shutil.copyfile(src_path, local_raw_path)

        try:
            row_count, col_count, columns = duckdb_engine.ingest_file_to_parquet(
                source_path=local_raw_path,
                target_parquet_path=local_parquet_path,
                file_format=ext,
            )
        except Exception as e:
            continue

        file_size = os.path.getsize(local_parquet_path) if os.path.exists(local_parquet_path) else 0

        dataset = Dataset(
            id=dataset_id,
            owner_id=current_user.id,
            name=friendly_name,
            original_filename=fname,
            file_format=ext,
            file_path=raw_rel_path,
            parquet_path=parquet_rel_path,
            row_count=row_count,
            column_count=col_count,
            file_size_bytes=file_size,
            schema_metadata=[c.model_dump() for c in columns],
        )
        db.add(dataset)
        db.commit()
        db.refresh(dataset)

        results.append(
            DatasetResponse(
                id=dataset.id,
                project_id=dataset.project_id,
                name=dataset.name,
                original_filename=dataset.original_filename,
                file_format=dataset.file_format,
                row_count=dataset.row_count,
                column_count=dataset.column_count,
                file_size_bytes=dataset.file_size_bytes,
                schema_metadata=columns,
                created_at=dataset.created_at,
                updated_at=dataset.updated_at,
            )
        )

    return results
