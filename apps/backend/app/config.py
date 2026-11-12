from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=("../../.env", ".env"), extra="ignore")
    database_url: str = "postgresql+asyncpg://examguard:examguard_local@localhost:5432/examguard"
    admin_token: str = Field(default="examguard-local-teacher-key", min_length=16)
    allow_legacy_admin: bool = False
    cors_origins: str = (
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:8080,http://127.0.0.1:8080"
    )
    upload_dir: Path = Path("uploads/screenshots")
    seed_demo: bool = True
    heartbeat_timeout_seconds: int = Field(default=8, ge=5, le=120)
    monitoring_lease_seconds: int = Field(default=12, ge=5, le=15)
    max_screenshot_bytes: int = Field(default=5 * 1024 * 1024, ge=1024)


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
