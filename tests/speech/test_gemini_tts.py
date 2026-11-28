"""Gemini TTS returns WAV audio and falls back to its second model."""

import io
import wave
from types import SimpleNamespace as NS

import pytest

from openjarvis.speech import gemini_tts
from openjarvis.speech._tts_discovery import TTS_BACKEND_ORDER, default_voice_for

pytest.importorskip("google.genai")


def _response(pcm=b"\x01\x00" * 240):
    blob = NS(data=pcm, mime_type="audio/L16;codec=pcm;rate=24000")
    return NS(candidates=[NS(content=NS(parts=[NS(inline_data=blob)]))])


def _use(monkeypatch, generate):
    client = NS(models=NS(generate_content=generate))
    monkeypatch.setattr(gemini_tts.google_common, "create_client", lambda key: client)


def test_registered_with_a_default_voice():
    assert "gemini_tts" in TTS_BACKEND_ORDER
    assert default_voice_for("gemini_tts") == gemini_tts.DEFAULT_VOICE


def test_returns_wav_and_uses_second_model_when_first_fails(monkeypatch):
    calls = []

    def generate(*, model, contents, config):
        calls.append(model)
        if len(calls) == 1:
            raise RuntimeError("busy")
        assert contents.endswith("Hello")
        return _response()

    _use(monkeypatch, generate)
    result = gemini_tts.GeminiTTSBackend(api_key="k").synthesize(
        "Hello", voice_id="not-a-voice"
    )
    assert calls == list(gemini_tts._MODELS)
    assert result.voice_id == gemini_tts.DEFAULT_VOICE
    with wave.open(io.BytesIO(result.audio)) as wav:
        assert (wav.getframerate(), wav.getnchannels(), wav.getnframes()) == (
            24000,
            1,
            240,
        )


def test_no_audio_is_an_error(monkeypatch):
    _use(monkeypatch, lambda **_: NS(candidates=[]))
    with pytest.raises(RuntimeError):
        gemini_tts.GeminiTTSBackend(api_key="k").synthesize("Hi")
