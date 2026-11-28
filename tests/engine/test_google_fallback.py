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
    assert _google_fallback_model("gemini-2.5-flash", Busy(503)) == _GOOGLE_FALLBACK_MODEL
    assert _google_fallback_model("gemini-2.5-flash", Busy(429)) == _GOOGLE_FALLBACK_MODEL
    assert _google_fallback_model("gemini-2.5-flash", Busy(400)) is None
    assert _google_fallback_model(_GOOGLE_FALLBACK_MODEL, Busy(503)) is None


def _engine_with(stream_fn):
    eng = CloudEngine.__new__(CloudEngine)

    class Models:
        generate_content_stream = staticmethod(stream_fn)

    class Client:
        models = Models()

    eng._google_client = Client()
    return eng


def test_open_stream_falls_back_when_first_chunk_is_busy():
    calls = []

    def stream(*, model, contents, config):
        calls.append(model)

        def gen():
            if model != _GOOGLE_FALLBACK_MODEL:
                raise Busy(503)
            yield Chunk("hello")

        return gen()

    eng = _engine_with(stream)
    out = [c.text for c in eng._open_google_stream("gemini-2.5-flash", [], None)]
    assert out == ["hello"]
    assert calls == ["gemini-2.5-flash", _GOOGLE_FALLBACK_MODEL]


def test_open_stream_reraises_non_busy_errors():
    def stream(*, model, contents, config):
        def gen():
            raise Busy(400)
            yield  # pragma: no cover

        return gen()

    eng = _engine_with(stream)
    with pytest.raises(Busy):
        list(eng._open_google_stream("gemini-2.5-flash", [], None))


def test_module_exposes_busy_codes():
    assert 503 in cloud._GOOGLE_BUSY_CODES and 429 in cloud._GOOGLE_BUSY_CODES


def test_ran_out_of_tokens_detection():
    from types import SimpleNamespace as NS

    from openjarvis.engine.cloud import _google_ran_out_of_tokens

    empty = NS(candidates=[NS(finish_reason="FinishReason.MAX_TOKENS", content=NS(parts=None))])
    answered = NS(candidates=[NS(finish_reason="FinishReason.MAX_TOKENS", content=NS(parts=[1]))])
    stopped = NS(candidates=[NS(finish_reason="FinishReason.STOP", content=NS(parts=None))])
    assert _google_ran_out_of_tokens(empty) is True
    assert _google_ran_out_of_tokens(answered) is False
    assert _google_ran_out_of_tokens(stopped) is False
    assert _google_ran_out_of_tokens(NS(candidates=None)) is False
