"""Direct Ollama streaming reports ``done``/``length`` and failures."""

from __future__ import annotations

import json

import httpx
import pytest

from openjarvis.core.types import Message, Role
from openjarvis.server import cloud_router

respx = pytest.importorskip("respx")

MESSAGES = [Message(role=Role.USER, content="hi", images=["aGk="])]


def _lines(*items) -> httpx.Response:
    return httpx.Response(200, text="\n".join(json.dumps(i) for i in items))


@pytest.fixture(autouse=True)
def _host(monkeypatch):
    monkeypatch.setenv("OLLAMA_HOST", "http://ollama.test")


async def _collect(**kwargs):
    return [
        event
        async for event in cloud_router.stream_local_events("m", MESSAGES, **kwargs)
    ]


@pytest.mark.asyncio
async def test_length_and_usage_come_from_the_final_line():
    with respx.mock:
        route = respx.post("http://ollama.test/api/chat").mock(
            return_value=_lines(
                {"message": {"content": "a"}, "done": False},
                {
                    "message": {"content": ""},
                    "done": True,
                    "done_reason": "length",
                    "prompt_eval_count": 3,
                    "eval_count": 5,
                },
            )
        )
        events = await _collect(num_ctx=4096, include_images=True)

    assert events[0].text == "a"
    assert events[-1].finish_reason == "length"
    assert events[-1].usage["total_tokens"] == 8
    sent = json.loads(route.calls[0].request.content)
    assert sent["options"]["num_ctx"] == 4096
    assert sent["messages"][0]["images"] == ["aGk="]


@pytest.mark.asyncio
async def test_images_are_left_out_by_default():
    with respx.mock:
        route = respx.post("http://ollama.test/api/chat").mock(
            return_value=_lines({"message": {"content": "a"}, "done": True})
        )
        events = await _collect()

    assert events[-1].finish_reason == "stop"
    assert "images" not in json.loads(route.calls[0].request.content)["messages"][0]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "lines,error",
    [
        ([{"error": "model crashed"}], RuntimeError),
        ([{"message": {"content": "a"}, "done": False}], ConnectionError),
    ],
)
async def test_errors_and_truncated_streams_raise(lines, error):
    with respx.mock:
        respx.post("http://ollama.test/api/chat").mock(return_value=_lines(*lines))
        with pytest.raises(error):
            await _collect()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "response,expected",
    [
        (httpx.Response(200, json={"capabilities": ["completion", "vision"]}), True),
        (httpx.Response(200, json={"capabilities": ["completion"]}), False),
        (httpx.Response(404, json={"error": "missing"}), False),
    ],
)
async def test_vision_support_is_read_from_ollama(response, expected):
    with respx.mock:
        respx.post("http://ollama.test/api/show").mock(return_value=response)
        assert await cloud_router.local_model_supports_images("m") is expected
