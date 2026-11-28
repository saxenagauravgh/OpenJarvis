"""``/v1/chat/completions`` never leaks exception text or Gemini signatures."""

from __future__ import annotations

import json
from unittest.mock import MagicMock

import pytest

pytest.importorskip("fastapi")

from fastapi.testclient import TestClient  # noqa: E402

from openjarvis.core.config import JarvisConfig  # noqa: E402
from openjarvis.engine._stubs import StreamChunk  # noqa: E402
from openjarvis.server.app import create_app  # noqa: E402

KEY = "AIzaFAKE-route-key-0123456789"
DETAIL = f"upstream-secret https://example.invalid/v1?key={KEY}"


def _app(engine, agent=None):
    cfg = JarvisConfig()
    cfg.analytics.enabled = False
    cfg.traces.enabled = False
    cfg.security.enabled = False
    return TestClient(create_app(engine, "test-model", agent=agent, config=cfg))


def _engine():
    engine = MagicMock()
    engine.engine_id = "mock"
    engine.list_models.return_value = ["test-model"]
    return engine


def _post(client, **extra):
    return client.post(
        "/v1/chat/completions",
        json={
            "model": "test-model",
            "messages": [{"role": "user", "content": "Hello"}],
            "stream": True,
            **extra,
        },
    )


TOOLS = [{"type": "function", "function": {"name": "f", "parameters": {}}}]


def _assert_safe(response):
    assert response.status_code == 200
    assert "upstream-secret" not in response.text
    assert KEY not in response.text
    assert "example.invalid" not in response.text
    assert "[DONE]" in response.text


def test_direct_stream_error_is_friendly_and_log_has_no_key(monkeypatch, caplog):
    monkeypatch.setenv("GEMINI_API_KEY", KEY)
    engine = _engine()

    async def stream(messages, **kwargs):
        raise ConnectionError(DETAIL)
        yield  # pragma: no cover

    engine.stream = stream

    response = _post(_app(engine))

    _assert_safe(response)
    assert "Could not reach the model" in response.text
    assert "upstream-secret" in caplog.text
    assert KEY not in caplog.text


def test_tool_stream_error_is_friendly():
    engine = _engine()

    async def stream_full(messages, **kwargs):
        raise RuntimeError(DETAIL)
        yield  # pragma: no cover

    engine.stream_full = stream_full

    response = _post(_app(engine), tools=TOOLS)

    _assert_safe(response)
    assert "Something went wrong" in response.text


def test_agent_stream_error_is_friendly():
    agent = MagicMock()
    agent.agent_id = "mock"
    agent._tools = ["t"]
    agent.run.side_effect = RuntimeError(DETAIL)

    response = _post(_app(_engine(), agent=agent))

    _assert_safe(response)
    assert "Sorry, an error occurred" in response.text


def test_image_request_without_a_key_says_how_to_fix_it(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)

    response = _post(_app(_engine()), model="gemini-2.5-flash")

    assert response.status_code == 200
    assert "Cloud Models tab" in response.text


def test_streamed_tool_call_deltas_never_carry_bytes():
    engine = _engine()

    async def stream_full(messages, **kwargs):
        yield StreamChunk(
            tool_calls=[
                {
                    "index": 0,
                    "id": "google_abc",
                    "type": "function",
                    "function": {"name": "f", "arguments": "{}"},
                    # Not valid UTF-8, like a real Gemini signature.
                    "thought_signature": b"\x12\xff\x00sig",
                }
            ]
        )
        yield StreamChunk(finish_reason="tool_calls")

    engine.stream_full = stream_full

    response = _post(_app(engine), tools=TOOLS)

    assert response.status_code == 200
    assert "thought_signature" not in response.text
    chunks = [
        json.loads(line[6:])
        for line in response.text.splitlines()
        if line.startswith("data: {")
    ]
    calls = [
        call
        for chunk in chunks
        for call in chunk["choices"][0]["delta"].get("tool_calls") or []
    ]
    assert calls[0]["id"] == "google_abc"
    assert chunks[-1]["choices"][0]["finish_reason"] == "tool_calls"
