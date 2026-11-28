"""Limit speech recognition to the languages set in ``speech.language``."""

from __future__ import annotations

from typing import Any

# Languages the recogniser often picks for spoken Hindi.
_HEARD_AS_HINDI = frozenset({"ur", "pa", "mr", "ne", "sa", "bn", "gu", "sd"})


def allowed_languages(setting: str) -> list[str]:
    """``"en,hi"`` -> ``["en", "hi"]``; empty means any language."""
    return [code.strip().lower() for code in (setting or "").split(",") if code.strip()]


def transcribe_in(
    backend: Any, audio: bytes, *, format: str, allowed: list[str]
) -> Any:
    """Transcribe, keeping the result within *allowed* languages.

    With one allowed language it is forced. With several, the language is
    detected, and audio detected as anything else is transcribed again.
    """
    forced = allowed[0] if len(allowed) == 1 else None
    result = backend.transcribe(audio, format=format, language=forced)
    heard = (result.language or "").lower()
    if len(allowed) < 2 or not heard or heard in allowed:
        return result
    if "hi" in allowed and heard in _HEARD_AS_HINDI:
        retry = "hi"
    else:
        retry = allowed[0]
    return backend.transcribe(audio, format=format, language=retry)
