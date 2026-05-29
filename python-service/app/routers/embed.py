from fastapi import APIRouter, HTTPException

from app.schemas import EmbedRequest, EmbedResponse
from app.services.llm_client import LlmClient

router = APIRouter(prefix="/embed", tags=["embed"])
llm_client = LlmClient()


@router.post("", response_model=EmbedResponse)
def embed(req: EmbedRequest) -> EmbedResponse:
    try:
        vector = llm_client.create_embedding(req.text)
        return EmbedResponse(embedding=vector)
    except Exception as ex:
        raise HTTPException(status_code=502, detail=f"Embedding provider error: {ex}")
