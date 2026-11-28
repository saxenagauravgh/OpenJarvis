"""The shared Gemini path: keys, requests, results and safe errors."""

from __future__ import annotations

from types import SimpleNamespace as NS
from unittest.mock import MagicMock

import httpx
import pytest

from openjarvis.core.types import Message, Role, ToolCall
from openjarvis.engine import google_common
from openjarvis.engine._base import EngineConnectionError, EngineContextLengthError
from openjarvis.engine.cloud import CloudEngine

SIGNATURE = b"\x12\xff\x00signature"


@pytest.fixture
def no_env_key(monkeypatch, tmp_path):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
    monkeypatch.setenv("OPENJARVIS_HOME", str(tmp_path))
    return tmp_path


def test_key_is_read_at_call_time_env_first_then_file(no_env_key, monkeypatch):
    assert google_common.load_api_key() == ""
    (no_env_key / "cloud-keys.env").write_text(
        'GOOGLE_API_KEY="from-file"\n', encoding="utf-8"
    )
    assert google_common.load_api_key() == "from-file"
    monkeypatch.setenv("GOOGLE_API_KEY", "from-google-env")
    assert google_common.load_api_key() == "from-google-env"
    monkeypatch.setenv("GEMINI_API_KEY", "from-gemini-env")
    assert google_common.load_api_key() == "from-gemini-env"


def test_client_is_built_with_busy_retries():
    pytest.importorskip("google.genai")
    client = google_common.create_client("fake-key")
    retry = client._api_client._http_options.retry_options
    assert retry.attempts == 3
    assert retry.http_status_codes == list(google_common.GOOGLE_BUSY_CODES)


@pytest.mark.parametrize(
    "reason,expected",
    [
        ("STOP", "stop"),
        ("MAX_TOKENS", "length"),
        ("FinishReason.MAX_TOKENS", "length"),
        ("SAFETY", "blocked"),
        ("PROHIBITED_CONTENT", "blocked"),
        ("RECITATION", "blocked"),
        ("OTHER", "stop"),
        (None, "stop"),
    ],
)
def test_finish_reason_mapping(reason, expected):
    assert google_common.map_finish_reason(reason) == expected


def test_blocked_prompt_has_a_blocked_finish_reason():
    resp = NS(candidates=None, prompt_feedback=NS(block_reason="SAFETY"))
    assert google_common.chunk_finish_reason(resp) == "blocked"


def test_thought_summaries_are_not_answer_text():
    parts = [NS(text="thinking", thought=True), NS(text="answer", thought=None)]
    resp = NS(candidates=[NS(content=NS(parts=parts))])
    assert google_common.chunk_text(resp) == "answer"


class _HTTP(Exception):
    def __init__(self, code, text="detail"):
        super().__init__(text)
        self.code = code


@pytest.mark.parametrize(
    "exc,code",
    [
        (google_common.MissingAPIKeyError("x"), "no_key"),
        (_HTTP(401), "bad_key"),
        (_HTTP(403), "bad_key"),
        (_HTTP(400, "API key not valid. API_KEY_INVALID"), "bad_key"),
        (_HTTP(400, "bad image"), "internal"),
        (_HTTP(429), "quota"),
        (_HTTP(503), "busy"),
        (httpx.ConnectError("x"), "network"),
        (TimeoutError(), "network"),
        (EngineConnectionError("unreachable"), "network"),
        (EngineConnectionError("ollama returned HTTP 404: nope"), "internal"),
        (EngineContextLengthError("long"), "internal"),
        (ValueError("x"), "internal"),
    ],
)
def test_error_classification(exc, code):
    assert google_common.classify_error(exc).code == code


def test_error_messages_never_include_exception_text():
    secret = "https://secret.invalid?key=AIzaSECRET0123456789"
    for status in (400, 401, 429, 500, 418):
        info = google_common.classify_error(_HTTP(status, secret))
        assert "secret" not in info.message.lower()
        assert "AIza" not in info.message


def test_redact_removes_keys(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "plain-secret-value")
    text = (
        "GET https://x?key=abc123 Authorization: Bearer tok.en "
        "x-goog-api-key: zzz AIzaSyD0123456789abcdef plain-secret-value"
    )
    cleaned = google_common.redact(text)
    for secret in (
        "abc123",
        "tok.en",
        "zzz",
        "AIzaSyD0123456789abcdef",
        "plain-secret-value",
    ):
        assert secret not in cleaned


def _engine(*responses) -> CloudEngine:
    engine = CloudEngine.__new__(CloudEngine)
    engine._google_client = MagicMock()
    engine._google_client.models.generate_content.side_effect = list(responses)
    engine._thought_sigs = {}
    return engine


def _response(*parts, finish="STOP"):
    return NS(
        candidates=[NS(content=NS(parts=list(parts)), finish_reason=finish)],
        usage_metadata=NS(prompt_token_count=1, candidates_token_count=2),
        text=None,
    )


def _call(name="calculator"):
    return NS(
        function_call=NS(name=name, args={"x": 1}),
        text=None,
        thought_signature=SIGNATURE,
    )


def test_generate_keeps_signatures_inside_the_engine_with_unique_ids():
    pytest.importorskip("google.genai")
    engine = _engine(_response(_call(), _call()), _response(_call()))
    messages = [Message(role=Role.USER, content="go")]

    first = engine.generate(messages, model="gemini-2.5-flash")
    second = engine.generate(messages, model="gemini-2.5-flash")

    calls = first["tool_calls"] + second["tool_calls"]
    assert len({c["id"] for c in calls}) == 3
    assert all(set(c) == {"id", "name", "arguments"} for c in calls)
    assert all(engine._thought_sigs[c["id"]] == SIGNATURE for c in calls)


def test_generate_replays_signature_and_sends_a_system_instruction():
    pytest.importorskip("google.genai")
    engine = _engine(_response(NS(text="done", function_call=None)))
    engine._thought_sigs = {"google_1": SIGNATURE}

    engine.generate(
        [
            Message(role=Role.SYSTEM, content="persona"),
            Message(role=Role.SYSTEM, content="memory"),
            Message(role=Role.USER, content="go"),
            Message(
                role=Role.ASSISTANT,
                content="",
                tool_calls=[ToolCall(id="google_1", name="f", arguments="{}")],
            ),
            Message(role=Role.TOOL, content="2", name="f", tool_call_id="google_1"),
        ],
        model="gemini-2.5-flash",
    )

    kwargs = engine._google_client.models.generate_content.call_args.kwargs
    assert kwargs["config"].system_instruction == "persona\n\nmemory"
    assert kwargs["contents"][1]["parts"][0]["thought_signature"] == SIGNATURE


@pytest.mark.parametrize(
    "finish,expected", [("MAX_TOKENS", "length"), ("STOP", "stop")]
)
def test_generate_reports_the_finish_reason(finish, expected):
    pytest.importorskip("google.genai")
    engine = _engine(_response(NS(text="a", function_call=None), finish=finish))
    result = engine.generate(
        [Message(role=Role.USER, content="go")], model="gemini-2.5-flash"
    )
    assert result["finish_reason"] == expected


def test_signature_cache_is_bounded(monkeypatch):
    from openjarvis.engine import cloud

    monkeypatch.setattr(cloud, "_MAX_THOUGHT_SIGNATURES", 2)
    engine = _engine()
    for index in range(4):
        engine._remember_thought_signature(str(index), b"s")
    assert list(engine._thought_sigs) == ["2", "3"]


def test_engine_replaces_its_client_when_the_event_loop_changes(monkeypatch):
    import asyncio

    built = []

    def create(key):
        built.append(key)
        return NS(name="replacement")

    monkeypatch.setattr(google_common, "create_client", create)
    engine = _engine()
    engine._google_api_key = "fake-key"
    original = engine._google_client

    async def get():
        return engine._google_async_client(), engine._google_async_client()

    assert asyncio.run(get()) == (original, original)
    first, again = asyncio.run(get())
    assert first is again and first.name == "replacement"
    assert built == ["fake-key"]
