"""Gemini TTS backend — expressive cloud speech using the Gemini API key."""

from __future__ import annotations

import io
import logging
import re
import wave
from typing import Any, List

from openjarvis.core.registry import TTSRegistry
from openjarvis.engine import google_common
from openjarvis.speech.tts import TTSBackend, TTSResult

logger = logging.getLogger(__name__)

# Tried in order; the second is used when the first is busy or out of quota.
_MODELS = ("gemini-3.1-flash-tts-preview", "gemini-2.5-flash-preview-tts")
DEFAULT_VOICE = "Sulafat"
_SAMPLE_RATE = 24000

_STYLE = (
    "Read the following aloud as a warm, upbeat and encouraging teacher: "
    "natural conversational rhythm, real expression, short pauses between "
    "steps, clear Indian English. Speak only the text.\n\n"
)


def _pcm_to_wav(pcm: bytes, sample_rate: int) -> bytes:
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        wav.writeframes(pcm)
    return buffer.getvalue()


def _audio_from(response: Any) -> tuple[bytes, int]:
    """PCM bytes and sample rate from a generate_content audio response."""
    pcm = b""
    rate = _SAMPLE_RATE
    for candidate in getattr(response, "candidates", None) or []:
        content = getattr(candidate, "content", None)
        for part in getattr(content, "parts", None) or []:
            blob = getattr(part, "inline_data", None)
            data = getattr(blob, "data", None)
            if data:
                pcm += data
                match = re.search(r"rate=(\d+)", getattr(blob, "mime_type", "") or "")
                if match:
                    rate = int(match.group(1))
        break
    return pcm, rate


@TTSRegistry.register("gemini_tts")
class GeminiTTSBackend(TTSBackend):
    """Gemini speech synthesis. Output is always WAV."""

    backend_id = "gemini_tts"

    def __init__(self, *, api_key: str = "") -> None:
        self._api_key = api_key

    def _key(self) -> str:
        return self._api_key or google_common.load_api_key()

    def synthesize(
        self,
        text: str,
        *,
        voice_id: str = DEFAULT_VOICE,
        speed: float = 1.0,
        output_format: str = "wav",
    ) -> TTSResult:
        key = self._key()
        if not key:
            raise RuntimeError("GEMINI_API_KEY not set")
        voice = voice_id if voice_id in self.available_voices() else DEFAULT_VOICE

        from google.genai import types

        client = google_common.create_client(key)
        config = types.GenerateContentConfig(
            response_modalities=["AUDIO"],
            speech_config=types.SpeechConfig(
                voice_config=types.VoiceConfig(
                    prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=voice)
                )
            ),
        )
        failure: Exception = RuntimeError("Gemini returned no audio")
        for model in _MODELS:
            try:
                response = client.models.generate_content(
                    model=model, contents=_STYLE + text, config=config
                )
            except Exception as exc:
                google_common.log_failure(logger, f"Gemini TTS {model}", exc)
                failure = exc
                continue
            pcm, rate = _audio_from(response)
            if pcm:
                return TTSResult(
                    audio=_pcm_to_wav(pcm, rate),
                    format="wav",
                    voice_id=voice,
                    sample_rate=rate,
                    duration_seconds=len(pcm) / (2 * rate),
                    metadata={"backend": "gemini_tts", "model": model},
                )
        raise failure

    def available_voices(self) -> List[str]:
        return ["Sulafat", "Kore", "Puck", "Charon", "Aoede", "Achird", "Leda"]

    def health(self) -> bool:
        return bool(self._key())
