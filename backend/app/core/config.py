from typing import List, Union
from pydantic import AnyHttpUrl, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PROJECT_NAME: str = "TruthLens News Aggregator"
    VERSION: str = "0.1.0"
    DESCRIPTION: str = "Агрегатор новин з гібридною системою виявлення неправдивої інформації та маніпуляцій"
    ENVIRONMENT: str = "development"
    DEBUG: bool = True
    API_V1_STR: str = "/api/v1"

    # CORS Settings
    BACKEND_CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]

    @field_validator("BACKEND_CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> List[str]:
        if isinstance(v, str) and not v.startswith("["):
            return [i.strip() for i in v.split(",") if i.strip()]
        elif isinstance(v, (list, str)):
            import json
            if isinstance(v, str):
                try:
                    return json.loads(v)
                except Exception:
                    return [v]
            return v
        return []

    # Security & JWT Authentication
    SECRET_KEY: str = "truthlens-super-secret-key-for-jwt-signing-2026-secure-diploma"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 1 day
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30  # 30 days

    # Google OAuth2 (optional)
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""

    # Database
    DATABASE_URL: str = "sqlite+aiosqlite:///./news_aggregator.db"

    # Ingestion configuration
    INGESTION_INTERVAL_MINUTES: int = 5
    MAX_ARTICLES_PER_FEED: int = 20

    # Fact Checking APIs
    GOOGLE_FACT_CHECK_API_KEY: str = ""

    # ML & NLP settings
    EMBEDDING_MODEL_NAME: str = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
    CLASSIFIER_MODEL_PATH: str = "models/truthlens_classifier"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore"
    )


settings = Settings()
