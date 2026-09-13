import pytest
from pydantic import ValidationError

from app.config import Settings


def test_accepts_required_provider_urls() -> None:
    settings = Settings(
        github_token="token",
        chat_api_base_url="https://chat.example.test/v1",
        embedding_api_base_url="https://embedding.example.test/v1",
    )

    assert settings.chat_api_base_url == "https://chat.example.test/v1"


@pytest.mark.parametrize("field", ["chat_api_base_url", "embedding_api_base_url"])
def test_rejects_blank_or_invalid_provider_url(field: str) -> None:
    values = {
        "github_token": "token",
        "chat_api_base_url": "https://chat.example.test/v1",
        "embedding_api_base_url": "https://embedding.example.test/v1",
    }
    values[field] = "not-a-url"

    with pytest.raises(ValidationError):
        Settings(**values)
