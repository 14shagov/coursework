import logging
from urllib.parse import urljoin

from openai import OpenAI

from app.config import settings

logger = logging.getLogger(__name__)
#swag

def _split_qwen_content(buffer: str, in_thinking: bool, *, finalize: bool) -> tuple[list[tuple[str, str]], str, bool]:
    """Separate Qwen <think> blocks when a compatible provider puts them in content."""
    events: list[tuple[str, str]] = []

    while True:
        marker = "</think>" if in_thinking else "<think>"
        marker_index = buffer.find(marker)
        if marker_index >= 0:
            text = buffer[:marker_index]
            if text:
                events.append(("reasoning" if in_thinking else "content", text))
            buffer = buffer[marker_index + len(marker):]
            in_thinking = not in_thinking
            continue

        if finalize:
            if buffer:
                events.append(("reasoning" if in_thinking else "content", buffer))
            return events, "", in_thinking

        suffix_length = 0
        for length in range(min(len(buffer), len(marker) - 1), 0, -1):
            if marker.startswith(buffer[-length:]):
                suffix_length = length
                break

        ready_text = buffer[:-suffix_length] if suffix_length else buffer
        if ready_text:
            events.append(("reasoning" if in_thinking else "content", ready_text))
        return events, buffer[-suffix_length:] if suffix_length else "", in_thinking


class LlmClient:
    def __init__(self) -> None:
        self.chat_client = OpenAI(
            api_key=settings.github_token,
            base_url=settings.chat_api_base_url,
        )
        self.embedding_client = OpenAI(
            api_key=settings.effective_embedding_token,
            base_url=settings.embedding_api_base_url,
        )
        self.chat_completions_url = urljoin(f"{settings.chat_api_base_url.rstrip('/')}/", "chat/completions")
        self.embeddings_url = urljoin(f"{settings.embedding_api_base_url.rstrip('/')}/", "embeddings")
        logger.info(
            "LLM clients initialized: chat_url=%s embedding_url=%s llm_model=%s embedding_model=%s",
            settings.chat_api_base_url,
            settings.embedding_api_base_url,
            settings.llm_model,
            settings.embedding_model,
        )

    def create_embedding(self, text: str) -> list[float]:
        logger.info(
            "LLM embedding request started: endpoint_url=%s model=%s text_len=%d",
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

    def resolve_chat_model(self, requested_model: str | None) -> str:
        model = (requested_model or settings.llm_model).strip()
        if model not in settings.allowed_chat_models:
            raise ValueError("Unsupported chat model")
        return model

    def create_chat_completion(self, messages: list[dict], model: str | None = None) -> tuple[str, str | None]:
        model = self.resolve_chat_model(model)
        logger.info(
            "LLM chat request started: endpoint_url=%s model=%s messages=%d",
            self.chat_completions_url,
            model,
            len(messages),
        )

        response = self.chat_client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=settings.llm_temperature,
            extra_body={"reasoning_effort": settings.llm_reasoning_effort},
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
                logger.debug("thought parse fallback skipped: error_type=%s", type(parse_error).__name__)

        logger.info(
            "LLM chat request succeeded: model=%s choices=%d has_thinking=%s",
            model,
            len(response.choices),
            reasoning is not None,
        )

        return content, reasoning

    def create_title(self, content: str) -> str:
        model = self.resolve_chat_model(settings.title_llm_model)
        prompt = (
            "Сформируй короткое название чата по сообщению пользователя. "
            "Верни только название без кавычек, до 60 символов, на языке сообщения."
        )
        response = self.chat_client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": prompt},
                {"role": "user", "content": content},
            ],
            temperature=0.0,
        )
        message = response.choices[0].message if response.choices else None
        return ((message.content if message else None) or "").strip()

    def stream_chat_completion(self, messages: list[dict], model: str | None = None):
        """Stream chat completion, yielding (chunk_type, text) tuples.
        
        chunk_type is one of:
          - "reasoning" — text from reasoning_content / thought fields
          - "content"   — text from delta.content
          - "done"      — final marker
        """
        model = self.resolve_chat_model(model)
        logger.info(
            "LLM streaming chat request started: endpoint_url=%s model=%s messages=%d",
            self.chat_completions_url,
            model,
            len(messages),
        )

        stream = self.chat_client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=settings.llm_temperature,
            stream=True,
            extra_body={"reasoning_effort": settings.llm_reasoning_effort},
        )

        content_buffer = ""
        content_is_thinking = False

        for chunk in stream:
            choices = chunk.choices or []
            for choice in choices:
                delta = choice.delta
                if delta is None:
                    continue

                # Check for reasoning_content (most common field)
                reasoning = getattr(delta, "reasoning_content", None)
                if not reasoning:
                    reasoning = getattr(delta, "reasoning", None)
                if not reasoning:
                    # Some providers use "thought"
                    reasoning = getattr(delta, "thought", None)

                if reasoning:
                    yield ("reasoning", reasoning)

                # Regular content
                content = getattr(delta, "content", None)
                if content:
                    content_buffer += content
                    events, content_buffer, content_is_thinking = _split_qwen_content(
                        content_buffer, content_is_thinking, finalize=False
                    )
                    yield from events

        events, _, _ = _split_qwen_content(content_buffer, content_is_thinking, finalize=True)
        yield from events

        yield ("done", "")

        logger.info("LLM streaming chat request succeeded")
