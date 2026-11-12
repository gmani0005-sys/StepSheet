import os
from typing import List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.dataset import Dataset
from app.schemas.joins import (
    PreJoinHealthCheckRequest,
    PreJoinHealthCheckResponse,
    JoinKeyPair,
)
from app.services.storage import get_storage_service
from app.services.join_service import join_service
from app.api.deps import get_current_user_enforced, check_dataset_access

router = APIRouter()


@router.post("/health-check", response_model=PreJoinHealthCheckResponse)
def pre_join_health_check(
    req: PreJoinHealthCheckRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user_enforced),
):
    """
    Run pre-join health check analyzing cardinality (1:1, 1:N, N:1, N:N),
    key nulls, duplicate keys, type mismatches, and fan-out risk.
    """
    left_ds = db.query(Dataset).filter(Dataset.id == req.left_dataset_id).first()
    right_ds = db.query(Dataset).filter(Dataset.id == req.right_dataset_id).first()

    if not left_ds or not right_ds:
        raise HTTPException(status_code=404, detail="Left or right dataset not found")
    check_dataset_access(left_ds, current_user)
    check_dataset_access(right_ds, current_user)

    storage = get_storage_service()
    left_path = storage.get_local_path(left_ds.parquet_path)
    right_path = storage.get_local_path(right_ds.parquet_path)

    if not os.path.exists(left_path) or not os.path.exists(right_path):
        raise HTTPException(status_code=404, detail="Dataset parquet file not found on disk")

    try:
        report = join_service.run_health_check(
            left_parquet_path=left_path,
            right_parquet_path=right_path,
            key_pairs=req.key_pairs,
            join_type=req.join_type,
        )
        return report
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to execute health check: {str(e)}")


@router.get("/suggest-keys/{left_id}/{right_id}")
def suggest_join_keys(
    left_id: str,
    right_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user_enforced),
):
    """
    Suggest matching join key pairs between two datasets based on column names and types.
    """
    left_ds = db.query(Dataset).filter(Dataset.id == left_id).first()
    right_ds = db.query(Dataset).filter(Dataset.id == right_id).first()
    if not left_ds or not right_ds:
        raise HTTPException(status_code=404, detail="Dataset not found")
    check_dataset_access(left_ds, current_user)
    check_dataset_access(right_ds, current_user)

    left_cols = {c["name"].lower(): c["name"] for c in (left_ds.schema_metadata or [])}
    right_cols = {c["name"].lower(): c["name"] for c in (right_ds.schema_metadata or [])}

    suggestions: List[Dict[str, str]] = []
    # Check exact name matches
    for l_key, l_orig in left_cols.items():
        if l_key in right_cols:
            suggestions.append({"left_col": l_orig, "right_col": right_cols[l_key]})

    # Check common ID variations e.g. customer_id ↔ id or cust_id
    if not suggestions:
        for l_key, l_orig in left_cols.items():
            for r_key, r_orig in right_cols.items():
                if "id" in l_key and "id" in r_key:
                    suggestions.append({"left_col": l_orig, "right_col": r_orig})
                    break

    return {"suggested_keys": suggestions}
