import os
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.dataset import Dataset
from app.schemas.profiling import DatasetProfileResponse, ColumnProfile
from app.services.storage import get_storage_service
from app.services.profiler import profiler_service

router = APIRouter()


@router.get("/{dataset_id}", response_model=DatasetProfileResponse)
def get_dataset_profile(
    dataset_id: str,
    db: Session = Depends(get_db),
):
    """
    Generate or retrieve rich column profile metrics for the dataset.
    Includes null %, distinct count, min/max/mean/median, top values, and histograms.
    """
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    storage = get_storage_service()
    local_parquet_path = storage.get_local_path(dataset.parquet_path)

    if not os.path.exists(local_parquet_path):
        raise HTTPException(status_code=404, detail="Parquet file not found")

    try:
        profile_res = profiler_service.profile_dataset(local_parquet_path)
        profile_res.dataset_id = dataset.id
        return profile_res
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to compute profile: {str(e)}")


@router.get("/{dataset_id}/column/{column_name}", response_model=ColumnProfile)
def get_column_profile(
    dataset_id: str,
    column_name: str,
    db: Session = Depends(get_db),
):
    """Retrieve profile metrics for a specific column."""
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    storage = get_storage_service()
    local_parquet_path = storage.get_local_path(dataset.parquet_path)

    if not os.path.exists(local_parquet_path):
        raise HTTPException(status_code=404, detail="Parquet file not found")

    try:
        profile_res = profiler_service.profile_dataset(local_parquet_path)
        for col in profile_res.columns:
            if col.column_name == column_name:
                return col
        raise HTTPException(status_code=404, detail=f"Column '{column_name}' not found in dataset")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to compute column profile: {str(e)}")
