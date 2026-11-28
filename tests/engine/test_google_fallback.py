"""Gemini busy errors fall back to a lighter model before any text streams."""

import pytest

from openjarvis.engine import cloud
from openjarvis.engine.cloud import (
    _GOOGLE_FALLBACK_MODEL,
    CloudEngine,
    _google_fallback_model,
)


class Busy(Exception):
    def __init__(self, code):
        super().__init__(f"{code} busy")
        self.code = code


class Chunk:
    def __init__(self, text):
        self.text = text


def test_fallback_model_only_for_busy_codes():
    assert (
        _google_fallback_model("gemini-2.5-flash", Busy(503)) == _GOOGLE_FALLBACK_MODEL
    )
    assert (
        _google_fallback_model("gemini-2.5-flash", Busy(429)) == _GOOGLE_FALLBACK_MODEL
    )
    assert _google_fallback_model("gemini-2.5-flash", Busy(400)) is None
    assert _google_fallback_model(_GOOGLE_FALLBACK_MODEL, Busy(503)) is None


def _engine_with(stream_fn):
    """An engine whose async Gemini client streams what *stream_fn* yields."""
    eng = CloudEngine.__new__(CloudEngine)

    class Models:
        @staticmethod
        async def generate_content_stream(*, model, contents, config):
            return stream_fn(model=model, contents=contents, config=config)

    class Aio:
        models = Models()

    class Client:
        aio = Aio()

    eng._google_client = Client()
    return eng


async def _texts(eng):
    return [c.text async for c in eng._open_google_stream("gemini-2.5-flash", [], None)]


@pytest.mark.asyncio
async def test_open_stream_falls_back_when_first_chunk_is_busy():
    calls = []

    def stream(*, model, contents, config):
        calls.append(model)

        async def gen():
            if model != _GOOGLE_FALLBACK_MODEL:
                raise Busy(503)
            yield Chunk("hello")

        return gen()

    assert await _texts(_engine_with(stream)) == ["hello"]
    assert calls == ["gemini-2.5-flash", _GOOGLE_FALLBACK_MODEL]


@pytest.mark.asyncio
async def test_open_stream_does_not_fall_back_after_the_first_chunk():
    calls = []

    def stream(*, model, contents, config):
        calls.append(model)

        async def gen():
            yield Chunk("partial")
            raise Busy(503)

        return gen()

    eng = _engine_with(stream)
    seen = []
    with pytest.raises(Busy):
        async for chunk in eng._open_google_stream("gemini-2.5-flash", [], None):
            seen.append(chunk.text)
    assert seen == ["partial"]
    assert calls == ["gemini-2.5-flash"]


@pytest.mark.asyncio
async def test_open_stream_reraises_non_busy_errors():
    def stream(*, model, contents, config):
        async def gen():
            raise Busy(400)
            yield  # pragma: no cover

        return gen()

    with pytest.raises(Busy):
        await _texts(_engine_with(stream))


def test_module_exposes_busy_codes():
    assert 503 in cloud._GOOGLE_BUSY_CODES and 429 in cloud._GOOGLE_BUSY_CODES


def test_ran_out_of_tokens_detection():
    from types import SimpleNamespace as NS

    from openjarvis.engine.cloud import _google_ran_out_of_tokens

    empty = NS(
        candidates=[NS(finish_reason="FinishReason.MAX_TOKENS", content=NS(parts=None))]
    )
    answered = NS(
        candidates=[NS(finish_reason="FinishReason.MAX_TOKENS", content=NS(parts=[1]))]
    )
    stopped = NS(
        candidates=[NS(finish_reason="FinishReason.STOP", content=NS(parts=None))]
    )
    assert _google_ran_out_of_tokens(empty) is True
    assert _google_ran_out_of_tokens(answered) is False
    assert _google_ran_out_of_tokens(stopped) is False
    assert _google_ran_out_of_tokens(NS(candidates=None)) is False
