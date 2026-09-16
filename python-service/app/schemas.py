from typing import List, Literal, Optional

from pydantic import BaseModel


class EmbedRequest(BaseModel):
    text: str


class EmbedResponse(BaseModel):
    embedding: List[float]


class ChatMessage(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    contextChunks: Optional[List[str]] = None
    llmModel: Optional[str] = None


class ChatResponse(BaseModel):
    content: str
    thinking: str | None = None


class TitleRequest(BaseModel):
    content: str


class TitleResponse(BaseModel):
    title: str
