import os
import sys
import types

os.environ.setdefault("GITHUB_TOKEN", "test-token")
os.environ.setdefault("CHAT_API_BASE_URL", "https://chat.example.test/v1")
os.environ.setdefault("EMBEDDING_API_BASE_URL", "https://embedding.example.test/v1")

if "openai" not in sys.modules:
    openai = types.ModuleType("openai")

    class OpenAI:
        def __init__(self, **_kwargs) -> None:
            pass

    openai.OpenAI = OpenAI
    sys.modules["openai"] = openai
