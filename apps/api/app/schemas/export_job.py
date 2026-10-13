from datetime import datetime
from typing import List, Dict, Any, Optional, Literal
from pydantic import BaseModel, Field
from app.schemas.steps import StepSchema


class ExportJobCreate(BaseModel):
    project_id: Optional[str] = None
    dataset_id: str
    format: Optional[str] = None
    formats: List[str] = Field(default_factory=lambda: ["csv"])
    content_blocks: List[str] = Field(default_factory=lambda: ["data", "steps", "lineage", "quality", "lookups", "dictionary"])
    row_scope: Literal["all", "filtered", "first_n", "preview", "custom"] = "all"
    row_limit: Optional[int] = None
    preview_row_cap: int = 50
    excluded_columns: List[str] = Field(default_factory=list)
    
    # Specific options
    include_lineage: Optional[bool] = None
    include_quality: Optional[bool] = None
    include_lookups: Optional[bool] = None
    include_dictionary: Optional[bool] = None
    include_visuals: Optional[bool] = None
    options: Optional[Dict[str, Any]] = None

    # Format specific options
    csv_delimiter: str = ","
    csv_encoding: Literal["utf-8", "utf-8-sig", "windows-1252", "latin1"] = "utf-8"
    csv_quote_style: Literal["minimal", "all", "nonnumeric"] = "minimal"
    include_formulas: bool = True
    watermark: Optional[str] = None
    confidentiality_notice: Optional[str] = None
    
    steps: List[StepSchema] = Field(default_factory=list)
    report_pages: Optional[List[Dict[str, Any]]] = None


class ExportFileMetadata(BaseModel):
    file_id: str
    filename: str
    format: str
    size_bytes: int
    mime_type: str
    download_url: str


class ExportJobResponse(BaseModel):
    id: str
    project_id: Optional[str] = None
    dataset_id: Optional[str] = None
    status: str
    progress_pct: int
    current_step: str
    formats: List[str] = Field(default_factory=list)
    files: List[ExportFileMetadata] = Field(default_factory=list)
    error_message: Optional[str] = None
    created_at: datetime
    completed_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
