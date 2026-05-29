import logging
from urllib.parse import urljoin

from openai import OpenAI

from app.config import settings

logger = logging.getLogger(__name__)


class LlmClient:
    def __init__(self) -> None:
        self.chat_client = OpenAI(
            api_key=settings.github_token,
            base_url=settings.github_api_base_url,
        )
        self.embedding_client = OpenAI(
            api_key=settings.effective_embedding_token,
            base_url=settings.github_api_base_url,
        )
        self.chat_completions_url = urljoin(f"{settings.github_api_base_url.rstrip('/')}/", "chat/completions")
        self.embeddings_url = urljoin(f"{settings.github_api_base_url.rstrip('/')}/", "embeddings")
        logger.info(
            "LLM clients initialized: base_url=%s llm_model=%s embedding_model=%s",
            settings.github_api_base_url,
            settings.llm_model,
            settings.embedding_model,
        )

    def create_embedding(self, text: str) -> list[float]:
        logger.info(
            "LLM embedding request started: base_url=%s endpoint=%s model=%s text_len=%d",
            settings.github_api_base_url,
            self.embeddings_url,
            settings.embedding_model,
            len(text),
        )
        response = self.embedding_client.embeddings.create(
            model=settings.embedding_model,
            input=text,
        )
        logger.info(
            "LLM embedding request succeeded: model=%s dimensions=%d",
            settings.embedding_model,
            len(response.data[0].embedding),
        )
        return response.data[0].embedding

    def create_chat_completion(self, messages: list[dict]) -> str:
        logger.info(
            "LLM chat request started: base_url=%s endpoint=%s model=%s messages=%d",
            settings.github_api_base_url,
            self.chat_completions_url,
            settings.llm_model,
            len(messages),
        )
        response = self.chat_client.chat.completions.create(
            model=settings.llm_model,
            messages=messages,
            temperature=settings.llm_temperature,
        )
        logger.info(
            "LLM chat request succeeded: model=%s choices=%d",
            settings.llm_model,
            len(response.choices),
        )
        return response.choices[0].message.content or ""
