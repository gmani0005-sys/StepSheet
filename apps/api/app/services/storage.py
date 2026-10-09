import os
import shutil
from abc import ABC, abstractmethod
from pathlib import Path
from typing import BinaryIO, Union
from app.core.config import settings


class StorageService(ABC):
    @abstractmethod
    def save_file(self, file_obj: BinaryIO, relative_path: str) -> str:
        """Save a file stream and return its absolute or reference path."""
        pass

    @abstractmethod
    def get_local_path(self, storage_path: str) -> str:
        """Get a local file system path for DuckDB/Polars to read directly."""
        pass

    @abstractmethod
    def delete_file(self, storage_path: str) -> bool:
        """Delete a file from storage."""
        pass

    @abstractmethod
    def file_exists(self, storage_path: str) -> bool:
        """Check if file exists."""
        pass


class LocalStorageService(StorageService):
    def __init__(self, base_dir: Union[str, Path] = None):
        self.base_dir = Path(base_dir or settings.LOCAL_STORAGE_DIR).resolve()
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def save_file(self, file_obj: BinaryIO, relative_path: str) -> str:
        target_path = self.base_dir / relative_path
        target_path.parent.mkdir(parents=True, exist_ok=True)
        with open(target_path, "wb") as f:
            shutil.copyfileobj(file_obj, f)
        return str(target_path)

    def get_local_path(self, storage_path: str) -> str:
        # If it's already an absolute path or relative to base_dir
        path = Path(storage_path)
        if path.is_absolute():
            return str(path)
        return str((self.base_dir / storage_path).resolve())

    def delete_file(self, storage_path: str) -> bool:
        try:
            path = Path(self.get_local_path(storage_path))
            if path.exists():
                path.unlink()
                return True
            return False
        except Exception:
            return False

    def file_exists(self, storage_path: str) -> bool:
        path = Path(self.get_local_path(storage_path))
        return path.exists()


class S3StorageService(StorageService):
    def __init__(self):
        import boto3
        from botocore.client import Config

        self.s3_client = boto3.client(
            "s3",
            endpoint_url=settings.S3_ENDPOINT_URL,
            aws_access_key_id=settings.S3_ACCESS_KEY,
            aws_secret_access_key=settings.S3_SECRET_KEY,
            region_name=settings.S3_REGION,
            config=Config(signature_version="s3v4"),
        )
        self.bucket = settings.S3_BUCKET_NAME
        self.local_cache_dir = Path(settings.LOCAL_STORAGE_DIR) / "cache"
        self.local_cache_dir.mkdir(parents=True, exist_ok=True)
        self._ensure_bucket()

    def _ensure_bucket(self):
        try:
            self.s3_client.head_bucket(Bucket=self.bucket)
        except Exception:
            try:
                self.s3_client.create_bucket(Bucket=self.bucket)
            except Exception:
                pass

    def save_file(self, file_obj: BinaryIO, relative_path: str) -> str:
        # Save to S3
        key = relative_path.replace("\\", "/")
        self.s3_client.upload_fileobj(file_obj, self.bucket, key)
        # Also cache locally for DuckDB direct file access
        local_path = self.local_cache_dir / relative_path
        local_path.parent.mkdir(parents=True, exist_ok=True)
        file_obj.seek(0)
        with open(local_path, "wb") as f:
            shutil.copyfileobj(file_obj, f)
        return key

    def get_local_path(self, storage_path: str) -> str:
        key = storage_path.replace("\\", "/")
        local_path = self.local_cache_dir / key
        if not local_path.exists():
            local_path.parent.mkdir(parents=True, exist_ok=True)
            self.s3_client.download_file(self.bucket, key, str(local_path))
        return str(local_path)

    def delete_file(self, storage_path: str) -> bool:
        try:
            key = storage_path.replace("\\", "/")
            self.s3_client.delete_object(Bucket=self.bucket, Key=key)
            local_path = self.local_cache_dir / key
            if local_path.exists():
                local_path.unlink()
            return True
        except Exception:
            return False

    def file_exists(self, storage_path: str) -> bool:
        try:
            key = storage_path.replace("\\", "/")
            self.s3_client.head_object(Bucket=self.bucket, Key=key)
            return True
        except Exception:
            return False


def get_storage_service() -> StorageService:
    if settings.STORAGE_BACKEND == "s3":
        try:
            return S3StorageService()
        except Exception:
            # Fallback to local storage if S3 fails to connect in dev
            return LocalStorageService()
    return LocalStorageService()
