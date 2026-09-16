from types import SimpleNamespace

from app.services.llm_client import LlmClient


class FakeCompletions:
    def __init__(self, result) -> None:
        self.result = result
        self.calls = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        return self.result


def fake_client(result):
    completions = FakeCompletions(result)
    return SimpleNamespace(chat=SimpleNamespace(completions=completions)), completions


def test_non_streaming_request_enables_configured_reasoning_effort() -> None:
    response = SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(content="Answer", reasoning_content="Thought"))]
    )
    client = LlmClient()
    client.chat_client, completions = fake_client(response)

    answer, thinking = client.create_chat_completion([{"role": "user", "content": "Question"}])

    assert (answer, thinking) == ("Answer", "Thought")
    assert completions.calls[0]["extra_body"] == {"reasoning_effort": "high"}


def test_streaming_request_forwards_reasoning_before_content() -> None:
    stream = [
        SimpleNamespace(choices=[SimpleNamespace(delta=SimpleNamespace(reasoning_content="Thought"))]),
        SimpleNamespace(choices=[SimpleNamespace(delta=SimpleNamespace(content="Answer"))]),
    ]
    client = LlmClient()
    client.chat_client, completions = fake_client(stream)

    events = list(client.stream_chat_completion([{"role": "user", "content": "Question"}]))

    assert events == [("reasoning", "Thought"), ("content", "Answer"), ("done", "")]
    assert completions.calls[0]["extra_body"] == {"reasoning_effort": "high"}
    assert completions.calls[0]["stream"] is True


def test_streaming_request_splits_qwen_thinking_tags_across_content_chunks() -> None:
    stream = [
        SimpleNamespace(choices=[SimpleNamespace(delta=SimpleNamespace(content="<th"))]),
        SimpleNamespace(choices=[SimpleNamespace(delta=SimpleNamespace(content="ink>Thought"))]),
        SimpleNamespace(choices=[SimpleNamespace(delta=SimpleNamespace(content="</think>Answer"))]),
    ]
    client = LlmClient()
    client.chat_client, _ = fake_client(stream)

    events = list(client.stream_chat_completion([{"role": "user", "content": "Question"}]))

    assert events == [("reasoning", "Thought"), ("content", "Answer"), ("done", "")]


def test_streaming_request_uses_selected_allowed_model() -> None:
    stream = [SimpleNamespace(choices=[SimpleNamespace(delta=SimpleNamespace(content="Answer"))])]
    client = LlmClient()
    client.chat_client, completions = fake_client(stream)

    list(client.stream_chat_completion([{"role": "user", "content": "Question"}], "DeepSeek-V4-Flash"))

    assert completions.calls[0]["model"] == "DeepSeek-V4-Flash"


def test_rejects_model_outside_allow_list() -> None:
    client = LlmClient()

    import pytest

    with pytest.raises(ValueError, match="Unsupported chat model"):
        client.resolve_chat_model("Qwen3.8-27B")


def test_title_request_uses_fast_model_without_reasoning() -> None:
    response = SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content="Короткий заголовок"))])
    client = LlmClient()
    client.chat_client, completions = fake_client(response)

    title = client.create_title("Расскажи про креветки")

    assert title == "Короткий заголовок"
    assert completions.calls[0]["model"] == "step-3.7-flash"
    assert "extra_body" not in completions.calls[0]
