import os
import sys
import warnings
from typing import List, Union
from pydantic import AnyHttpUrl, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# These are the values committed to source control. Using them in a non-debug
# deployment is a known, serious security issue (SPEC.md: "default SECRET_KEY
# committed"). See Settings.__init__ below for the fail-fast/warn behaviour.
_DEFAULT_SECRET_KEY = "stepsheet-super-secret-key-change-in-production-32-chars-min"
_DEFAULT_S3_SECRET_KEY = "minioadmin"


class Settings(BaseSettings):
    PROJECT_NAME: str = "StepSheet"
    ENVIRONMENT: str = "development"
    DEBUG: bool = True
    API_V1_STR: str = "/api/v1"

    # Security & JWT
    SECRET_KEY: str = _DEFAULT_SECRET_KEY
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 1 day for dev convenience
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    ALGORITHM: str = "HS256"

    # When True, every preview/export/join/dataset-detail endpoint requires a
    # valid access token AND enforces that the caller owns the dataset(s)
    # involved. Defaults to False so local/anonymous use keeps working exactly
    # as before (a known tradeoff -- see the shared demo-user fallback in
    # app/api/deps.py and app/api/v1/endpoints/datasets.py). Set
    # REQUIRE_AUTH=true in production to turn on real per-user isolation.
    REQUIRE_AUTH: bool = False

    # Database
    DATABASE_URL: str = "sqlite:///./stepsheet.db"

    # Storage
    STORAGE_BACKEND: str = "local"  # "local" | "s3"
    LOCAL_STORAGE_DIR: str = "./storage"

    # S3 / MinIO
    S3_ENDPOINT_URL: str = "http://localhost:9000"
    S3_ACCESS_KEY: str = "minioadmin"
    S3_SECRET_KEY: str = _DEFAULT_S3_SECRET_KEY
    S3_BUCKET_NAME: str = "stepsheet-datasets"
    S3_REGION: str = "us-east-1"

    # DuckDB Execution
    DUCKDB_MEMORY_LIMIT: str = "4GB"
    DUCKDB_THREADS: int = 4
    PREVIEW_SAMPLE_ROWS: int = 200
    MAX_UPLOAD_SIZE_BYTES: int = 500 * 1024 * 1024  # 500 MB

    # CORS
    CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]

    # LLM Assistant
    ENABLE_LLM_ASSISTANT: bool = False
    LLM_PROVIDER: str = "ollama"
    LLM_ENDPOINT: str = "http://localhost:11434/v1"
    LLM_API_KEY: str = ""
    LLM_MODEL: str = "llama3"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        # Fail fast (outside DEBUG) or warn loudly (in DEBUG) when the
        # committed default secrets are still in effect. We don't hard-fail
        # under DEBUG so local dev and the test suite (which never sets
        # SECRET_KEY) keep working without extra setup.
        running_tests = "pytest" in sys.modules
        if self.SECRET_KEY == _DEFAULT_SECRET_KEY:
            msg = (
                "SECRET_KEY is still the default value committed in source "
                "control. Set a real, random SECRET_KEY via environment "
                "variable or .env before deploying outside local development."
            )
            if self.DEBUG or running_tests:
                warnings.warn(msg, stacklevel=2)
            else:
                raise RuntimeError(msg)
        if self.STORAGE_BACKEND == "s3" and self.S3_SECRET_KEY == _DEFAULT_S3_SECRET_KEY:
            msg = (
                "S3_SECRET_KEY is still the default MinIO dev credential. Set "
                "a real S3_SECRET_KEY via environment variable or .env before "
                "deploying outside local development."
            )
            if self.DEBUG or running_tests:
                warnings.warn(msg, stacklevel=2)
            else:
                raise RuntimeError(msg)


settings = Settings()
