import logging

from fastapi import FastAPI

from app.config import settings
from app.routers import chat, embed

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [%(name)s] %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI(title="RAG Python Service", version="1.0.0")


@app.on_event("startup")
def log_config_summary() -> None:
    logger.info(
        "startup_config_summary",
        extra={
            "config": {
                "github_api_base_url": settings.github_api_base_url,
                "llm_model": settings.llm_model,
                "embedding_model": settings.embedding_model,
                "has_chat_token": bool(settings.github_token.strip()),
                "has_embedding_token": bool((settings.embedding_github_token or "").strip()),
                "embedding_token_source": (
                    "EMBEDDING_GITHUB_TOKEN"
                    if (settings.embedding_github_token or "").strip()
                    else "GITHUB_TOKEN_FALLBACK"
                ),
            }
        },
    )


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(embed.router)
app.include_router(chat.router)
