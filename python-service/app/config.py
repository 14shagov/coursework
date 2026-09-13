from urllib.parse import urlparse

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

EMBEDDING_DIMENSIONS = 3072


class Settings(BaseSettings):
    github_token: str = Field(..., min_length=1)
    embedding_github_token: str | None = None
    llm_model: str = Field("openai/gpt-4.1", min_length=1)
    embedding_model: str = Field("openai/text-embedding-3-large", min_length=1)
    chat_api_base_url: str = Field(..., min_length=1)
    embedding_api_base_url: str = Field(..., min_length=1)
    llm_temperature: float = 0.0
    llm_reasoning_effort: str = Field("high", min_length=1)

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @field_validator("github_token", "llm_model", "embedding_model", "llm_reasoning_effort")
    @classmethod
    def require_non_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("must not be blank")
        return value

    @field_validator("chat_api_base_url", "embedding_api_base_url")
    @classmethod
    def require_http_url(cls, value: str) -> str:
        value = value.strip()
        parsed = urlparse(value)
        if not value or parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ValueError("must be a non-blank HTTP or HTTPS URL")
        return value

    @property
    def effective_embedding_token(self) -> str:
        token = (self.embedding_github_token or self.github_token).strip()
        return token or self.github_token


settings = Settings()
