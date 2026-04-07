import os
from functools import lru_cache
from typing import List

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    APP_NAME: str = "Heradyne"
    ENVIRONMENT: str = "development"
    DEBUG: bool = False  # Secure default

    # Database
    DATABASE_URL: str = "postgresql://heradyne:heradyne_dev@localhost:5432/heradyne"

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # Security — all insecure defaults will raise on startup in production
    SECRET_KEY: str = "INSECURE_DEFAULT_CHANGE_THIS"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Field-level encryption key (32+ chars, store in env)
    FIELD_ENCRYPTION_KEY: str = "INSECURE_DEFAULT_ENCRYPTION_KEY_32"

    # CORS — restrict in production
    CORS_ORIGINS: str = "http://localhost:3000"

    # File uploads
    UPLOAD_DIR: str = "./uploads"
    MAX_UPLOAD_SIZE_MB: int = 50
    ALLOWED_EXTENSIONS: List[str] = ["pdf", "doc", "docx", "xls", "xlsx", "csv", "txt", "png", "jpg", "jpeg"]

    # MFA — require for privileged roles in production
    MFA_REQUIRED_ROLES: List[str] = ["lender", "credit_committee", "insurer", "admin"]
    MFA_ISSUER: str = "Heradyne"

    # Session / idle timeout
    SESSION_IDLE_TIMEOUT_MINUTES: int = 15

    # Rate limiting
    RATE_LIMIT_LOGIN: str = "5/minute"
    RATE_LIMIT_REGISTER: str = "3/minute"
    RATE_LIMIT_API: str = "100/minute"
    RATE_LIMIT_AI: str = "10/minute"

    # Security alerting webhook (Slack/PagerDuty/etc)
    SECURITY_WEBHOOK_URL: str = ""

    # Account lockout
    LOCKOUT_MAX_ATTEMPTS: int = 5
    LOCKOUT_DURATION_SECONDS: int = 900

    @property
    def cors_origins_list(self) -> List[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",")]

    class Config:
        env_file = ".env"
        case_sensitive = True


@lru_cache()
def get_settings() -> Settings:
    s = Settings()
    # Fail fast on insecure production config
    if s.ENVIRONMENT == "production":
        if "INSECURE" in s.SECRET_KEY:
            raise RuntimeError("SECRET_KEY is not configured for production")
        if "INSECURE" in s.FIELD_ENCRYPTION_KEY:
            raise RuntimeError("FIELD_ENCRYPTION_KEY is not configured for production")
        if "*" in s.CORS_ORIGINS:
            raise RuntimeError("CORS_ORIGINS must not be wildcard in production")
    return s


settings = get_settings()
