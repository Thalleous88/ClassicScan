from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import List

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    database_url: str = Field(..., alias="DATABASE_URL")
    secret_key: str = Field(..., alias="SECRET_KEY")

    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24

    port: int = Field(default=23000, alias="PORT")
    cors_origins: str = Field(default="*", alias="CORS_ORIGINS")

    max_upload_bytes: int = Field(default=25 * 1024 * 1024, alias="MAX_UPLOAD_BYTES")
    max_pdf_pages: int = Field(default=10, alias="MAX_PDF_PAGES")
    storage_dir: Path = Field(default=Path("./storage"), alias="STORAGE_DIR")

    tesseract_path: str | None = Field(default=None, alias="TESSERACT_PATH")
    ocr_lang: str = Field(default="eng", alias="OCR_LANG")
    ocr_debug: bool = Field(default=False, alias="OCR_DEBUG")

    @field_validator("secret_key")
    @classmethod
    def _reject_dev_secret(cls, v: str) -> str:
        if not v or v.strip().lower() in {"changeme", "classicscan", "secret"}:
            raise ValueError(
                "SECRET_KEY must be set to a strong random value (see .env.example)."
            )
        return v

    @field_validator("database_url")
    @classmethod
    def _require_database_url(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("DATABASE_URL is required.")
        return v

    @property
    def cors_origin_list(self) -> List[str]:
        raw = (self.cors_origins or "").strip()
        if not raw:
            return []
        if raw == "*":
            return ["*"]
        return [o.strip() for o in raw.split(",") if o.strip()]

    @property
    def storage_dir_path(self) -> Path:
        p = self.storage_dir
        if not p.is_absolute():

            backend_root = Path(__file__).resolve().parent.parent.parent
            p = (backend_root / p).resolve()
        return p

@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()

_settings = get_settings()
DATABASE_URL = _settings.database_url
SECRET_KEY = _settings.secret_key
ALGORITHM = _settings.algorithm
ACCESS_TOKEN_EXPIRE_MINUTES = _settings.access_token_expire_minutes
