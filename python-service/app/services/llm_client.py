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

    def create_chat_completion(self, messages: list[dict]) -> tuple[str, str | None]:
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

        message = response.choices[0].message if response.choices else None
        content = (message.content if message else None) or ""
        reasoning = getattr(message, "reasoning_content", None) or None

        # Gemini OpenAI-compatible endpoint may also expose thought text
        # under a top-level `thought` field on the candidate/message wrapper
        # in some SDK versions. Normalize it into `reasoning`.
        if not reasoning:
            thought = getattr(message, "thought", None)
            if thought:
                reasoning = thought

        # Fallback: parse `response.candidates[0].content.parts` and join
        # parts where `part.thought` is true.
        if not reasoning:
            try:
                candidates = getattr(response, "candidates", None) or []
                if candidates:
                    parts = getattr(candidates[0].content, "parts", None) or []
                    thought_parts = [p.text for p in parts if getattr(p, "thought", False) and getattr(p, "text", None)]
                    if thought_parts:
                        reasoning = "".join(thought_parts)
            except Exception as parse_error:
                logger.debug("thought parse fallback skipped: %s", parse_error)

        logger.info(
            "LLM chat request succeeded: model=%s choices=%d has_thinking=%s",
            settings.llm_model,
            len(response.choices),
            reasoning is not None,
        )

        return content, reasoning
