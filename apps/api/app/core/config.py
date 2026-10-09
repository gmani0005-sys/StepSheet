import os
from typing import List, Union
from pydantic import AnyHttpUrl, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PROJECT_NAME: str = "StepSheet"
    ENVIRONMENT: str = "development"
    DEBUG: bool = True
    API_V1_STR: str = "/api/v1"

    # Security & JWT
    SECRET_KEY: str = "stepsheet-super-secret-key-change-in-production-32-chars-min"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 1 day for dev convenience
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    ALGORITHM: str = "HS256"

    # Database
    DATABASE_URL: str = "sqlite:///./stepsheet.db"

    # Storage
    STORAGE_BACKEND: str = "local"  # "local" | "s3"
    LOCAL_STORAGE_DIR: str = "./storage"

    # S3 / MinIO
    S3_ENDPOINT_URL: str = "http://localhost:9000"
    S3_ACCESS_KEY: str = "minioadmin"
    S3_SECRET_KEY: str = "minioadmin"
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


settings = Settings()
