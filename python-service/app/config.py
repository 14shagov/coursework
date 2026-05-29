from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    github_token: str = Field(..., min_length=1)
    embedding_github_token: str | None = None
    llm_model: str = "openai/gpt-4.1"
    embedding_model: str = "openai/text-embedding-3-small"
    github_api_base_url: str = "https://models.github.ai/inference"
    llm_temperature: float = 0.0

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @model_validator(mode="after")
    def validate_embeddings_mode(self) -> "Settings":
        chat_token = self.github_token.strip()
        embedding_token = (self.embedding_github_token or "").strip()
        llm_model = self.llm_model.strip()
        embedding_model = self.embedding_model.strip()

        errors: list[str] = []

        if not chat_token:
            errors.append("Отсутствует GITHUB_TOKEN (chat-токен).")

        # Политика перехода: если EMBEDDING_GITHUB_TOKEN не задан,
        # используем fallback на GITHUB_TOKEN.
        if not embedding_token and not chat_token:
            errors.append(
                "Отсутствует EMBEDDING_GITHUB_TOKEN и недоступен fallback на GITHUB_TOKEN."
            )

        if not llm_model:
            errors.append("LLM_MODEL должен быть непустым.")

        if not embedding_model:
            errors.append("EMBEDDING_MODEL должен быть непустым.")

        if errors:
            raise ValueError("Ошибка конфигурации python-service:\n- " + "\n- ".join(errors))

        return self

    @property
    def effective_embedding_token(self) -> str:
        return (self.embedding_github_token or self.github_token).strip()


settings = Settings()
