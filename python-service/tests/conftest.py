import os
import sys
import types

os.environ.setdefault("GITHUB_TOKEN", "test-token")
os.environ.setdefault("CHAT_API_BASE_URL", "https://chat.example.test/v1")
os.environ.setdefault("EMBEDDING_API_BASE_URL", "https://embedding.example.test/v1")
os.environ.setdefault("LLM_MODEL", "Qwen3.6-35B-A3B")
os.environ.setdefault(
    "LLM_ALLOWED_MODELS",
    "DeepSeek-V4-Flash,DeepSeek-V4-Pro,glm-4.5-air,Qwen3.6-35B-A3B,step-3.7-flash",
)

if "openai" not in sys.modules:
    openai = types.ModuleType("openai")

    class OpenAI:
        def __init__(self, **_kwargs) -> None:
            pass

    openai.OpenAI = OpenAI
    sys.modules["openai"] = openai
