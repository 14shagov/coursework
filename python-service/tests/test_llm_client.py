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
