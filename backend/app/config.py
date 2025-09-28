"""Configuration helpers for the autocomplete backend."""

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    google_api_key: str = Field(..., env="GOOGLE_API_KEY")
    gemini_model: str = Field(
        "gemini-2.5-flash-lite",
        validation_alias="GEMINI_MODEL",
        description="Preferred Gemini model short name (e.g. 'gemini-2.5-pro').",
    )
    suggestions_count: int = Field(
        5,
        ge=1,
        le=10,
        validation_alias="SUGGESTIONS_COUNT",
    )

    model_config = SettingsConfigDict(
        env_file=str(Path(__file__).resolve().parent.parent / ".env"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    """Return cached app settings."""
    return Settings()
