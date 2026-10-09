from typing import List, Dict, Any, Optional
from pydantic import BaseModel, ConfigDict
from datetime import datetime


class ColumnSchema(BaseModel):
    name: str
    data_type: str  # text, integer, float, boolean, date, timestamp, unknown
    physical_type: str  # DuckDB type (VARCHAR, BIGINT, DOUBLE, etc.)
    nullable: bool = True


class DatasetBase(BaseModel):
    name: str


class DatasetCreate(DatasetBase):
    project_id: Optional[str] = None


class DatasetResponse(DatasetBase):
    id: str
    project_id: Optional[str] = None
    original_filename: str
    file_format: str
    row_count: int
    column_count: int
    file_size_bytes: int
    schema_metadata: List[ColumnSchema]
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class FilterCondition(BaseModel):
    column: str
    operator: str  # eq, neq, contains, gt, gte, lt, lte, is_null, is_not_null
    value: Optional[Any] = None


class SortCondition(BaseModel):
    column: str
    direction: str = "asc"  # asc or desc


class DatasetRowsRequest(BaseModel):
    offset: int = 0
    limit: int = 100
    sort: Optional[List[SortCondition]] = None
    filters: Optional[List[FilterCondition]] = None
    search: Optional[str] = None


class DatasetRowsResponse(BaseModel):
    dataset_id: str
    total_rows: int
    filtered_rows: int
    offset: int
    limit: int
    columns: List[ColumnSchema]
    rows: List[Dict[str, Any]]
