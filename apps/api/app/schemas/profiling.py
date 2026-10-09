from typing import List, Dict, Any, Optional
from pydantic import BaseModel


class HistogramBin(BaseModel):
    bin_start: float
    bin_end: float
    count: int
    label: str


class TopValue(BaseModel):
    value: Any
    count: int
    percentage: float


class ColumnProfile(BaseModel):
    column_name: str
    data_type: str  # text, integer, float, boolean, date, timestamp
    total_count: int
    null_count: int
    null_percentage: float
    distinct_count: int
    distinct_percentage: float
    is_unique: bool
    
    # Numeric stats
    min_value: Optional[Any] = None
    max_value: Optional[Any] = None
    mean_value: Optional[float] = None
    median_value: Optional[float] = None
    std_dev: Optional[float] = None

    # Text stats
    min_length: Optional[int] = None
    max_length: Optional[int] = None
    avg_length: Optional[float] = None

    # Value distributions
    top_values: List[TopValue] = []
    histogram: Optional[List[HistogramBin]] = None


class DatasetProfileResponse(BaseModel):
    dataset_id: str
    total_rows: int
    total_columns: int
    columns: List[ColumnProfile]
