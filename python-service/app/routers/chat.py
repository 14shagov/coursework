import logging

from fastapi import APIRouter, HTTPException

from app.schemas import ChatRequest, ChatResponse
from app.services.llm_client import LlmClient

router = APIRouter(prefix="/chat", tags=["chat"])
llm_client = LlmClient()
logger = logging.getLogger(__name__)


@router.post("", response_model=ChatResponse)
def chat(req: ChatRequest) -> ChatResponse:
    try:
        context_chunks = req.contextChunks or []
        logger.info(
            "Incoming /chat request: messages=%d context_chunks=%d",
            len(req.messages),
            len(context_chunks),
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
            logger.info(
                "Context message: %s",
                context_text,
            )

        answer = llm_client.create_chat_completion(messages)
        return ChatResponse(content=answer)
    except Exception as ex:
        logger.exception("LLM provider error in /chat: %s", ex)
        raise HTTPException(status_code=502, detail=f"LLM provider error: {ex}")
