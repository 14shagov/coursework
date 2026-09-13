import pytest
from fastapi import HTTPException

from app.config import EMBEDDING_DIMENSIONS
from app.routers.embed import embed, llm_client
from app.schemas import EmbedRequest


def test_rejects_incompatible_embedding_dimensions(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(llm_client, "create_embedding", lambda _: [0.0])

    with pytest.raises(HTTPException) as exception:
        embed(EmbedRequest(text="test"))

    assert exception.value.detail == "Embedding provider returned incompatible vector dimensions"


def test_accepts_contract_embedding_dimensions(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(llm_client, "create_embedding", lambda _: [0.0] * EMBEDDING_DIMENSIONS)

    assert len(embed(EmbedRequest(text="test")).embedding) == EMBEDDING_DIMENSIONS
