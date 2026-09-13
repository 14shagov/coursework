import json
import logging
from uuid import uuid4

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from app.schemas import ChatRequest, ChatResponse
from app.services.llm_client import LlmClient

router = APIRouter(prefix="/chat", tags=["chat"])
llm_client = LlmClient()
logger = logging.getLogger(__name__)


@router.post("", response_model=ChatResponse)
def chat(req: ChatRequest) -> ChatResponse:
    request_id = str(uuid4())
    try:
        context_chunks = req.contextChunks or []
        logger.info(
            "Incoming /chat request: request_id=%s messages=%d context_chunks=%d context_length=%d",
            request_id,
            len(req.messages),
            len(context_chunks),
            sum(len(chunk) for chunk in context_chunks),
        )
        messages = [msg.model_dump() for msg in req.messages]

        if context_chunks:
            context_text = "\n\n".join(context_chunks)
            system_message = {
                "role": "system",
                "content": (
                    "Ты отвечаешь только на основании контекста базы знаний ниже. "
                    "Не добавляй факты из общих знаний. "
                    "Если данных в контексте недостаточно, прямо так и скажи.\n\n"
                    f"КОНТЕКСТ БАЗЫ ЗНАНИЙ:\n{context_text}"
                ),
            }
            messages = [system_message] + messages
        answer, thinking = llm_client.create_chat_completion(messages)
        logger.info("/chat completed: request_id=%s provider_outcome=success", request_id)
        return ChatResponse(content=answer, thinking=thinking)
    except Exception as exception:
        logger.error("LLM provider error in /chat: request_id=%s error_type=%s", request_id,
                     type(exception).__name__)
        raise HTTPException(status_code=502, detail="LLM provider error")


def _sse_event(chunk_type: str, text: str) -> str:
    """Format a Server-Sent Event with JSON data payload."""
    payload = json.dumps({"type": chunk_type, "text": text}, ensure_ascii=False)
    return f"data: {payload}\n\n"


def _stream_generator(req: ChatRequest):
    """Generator that yields SSE events from the LLM stream."""
    request_id = str(uuid4())
    try:
        context_chunks = req.contextChunks or []
        logger.info(
            "Incoming /chat/stream request: request_id=%s messages=%d context_chunks=%d context_length=%d",
            request_id,
            len(req.messages),
            len(context_chunks),
            sum(len(chunk) for chunk in context_chunks),
        )
        messages = [msg.model_dump() for msg in req.messages]

        if context_chunks:
            context_text = "\n\n".join(context_chunks)
            system_message = {
                "role": "system",
                "content": (
                    "Ты отвечаешь только на основании контекста базы знаний ниже. "
                    "Не добавляй факты из общих знаний. "
                    "Если данных в контексте недостаточно, прямо так и скажи.\n\n"
                    f"КОНТЕКСТ БАЗЫ ЗНАНИЙ:\n{context_text}"
                ),
            }
            messages = [system_message] + messages

        for chunk_type, text in llm_client.stream_chat_completion(messages):
            yield _sse_event(chunk_type, text)
        logger.info("/chat/stream completed: request_id=%s provider_outcome=success", request_id)
    except Exception as exception:
        logger.error("LLM provider error in /chat/stream: request_id=%s error_type=%s", request_id,
                     type(exception).__name__)
        error_payload = json.dumps({"type": "error", "text": "LLM provider error"}, ensure_ascii=False)
        yield f"data: {error_payload}\n\n"


@router.post("/stream", response_class=StreamingResponse)
def chat_stream(req: ChatRequest) -> StreamingResponse:
    return StreamingResponse(
        _stream_generator(req),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
