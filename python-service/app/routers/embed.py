from fastapi import APIRouter, HTTPException

from app.config import EMBEDDING_DIMENSIONS
from app.schemas import EmbedRequest, EmbedResponse
from app.services.llm_client import LlmClient

router = APIRouter(prefix="/embed", tags=["embed"])
llm_client = LlmClient()


@router.post("", response_model=EmbedResponse)
def embed(req: EmbedRequest) -> EmbedResponse:
    try:
        vector = llm_client.create_embedding(req.text)
        if len(vector) != EMBEDDING_DIMENSIONS:
            raise HTTPException(
                status_code=502,
                detail="Embedding provider returned incompatible vector dimensions",
            )
        return EmbedResponse(embedding=vector)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=502, detail="Embedding provider error")
