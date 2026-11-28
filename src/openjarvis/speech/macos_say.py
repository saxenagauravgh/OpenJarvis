"""macOS speech synthesis through the built-in ``say`` command.

The desktop webview offers only some of the installed voices to web pages, so
voices such as Rishi are synthesized here and played as ordinary audio.
"""

from __future__ import annotations

import io
import platform
import re
import shutil
import subprocess
import tempfile
import wave
from pathlib import Path
from typing import List

from openjarvis.core.registry import TTSRegistry
from openjarvis.speech.tts import TTSBackend, TTSResult

DEFAULT_VOICE = "Rishi"
# English voices cannot read Devanagari; sentences in it go to this voice.
HINDI_VOICE = "Lekha"
_DEVANAGARI = re.compile(r"[\u0900-\u097F]")
_SAMPLE_RATE = 22050
_BASE_WORDS_PER_MINUTE = 175
# Voice names as ``say -v '?'`` prints them, e.g. "Rishi (Enhanced)".
_VOICE_NAME = re.compile(r"[A-Za-z][A-Za-z .()'-]{0,60}")


def installed_voices() -> List[str]:
    """Names of the voices this Mac can speak with."""
    listing = subprocess.run(
        ["say", "-v", "?"], capture_output=True, text=True, timeout=15, check=True
    ).stdout
    voices = []
    for line in listing.splitlines():
        match = re.match(r"(.+?)\s+[a-z]{2}[_-]\w+\s+#", line)
        if match:
            voices.append(match.group(1).strip())
    return voices


def split_by_script(text: str) -> List[tuple[bool, str]]:
    """Runs of whole sentences as ``(is_devanagari, text)``, in order."""
    runs: List[tuple[bool, str]] = []
    for sentence in re.split(r"(?<=[.!?\u0964:])\s+|\n+", text):
        if not sentence.strip():
            continue
        devanagari = len(_DEVANAGARI.findall(sentence))
        latin = len(re.findall(r"[A-Za-z]", sentence))
        # A Hindi sentence often holds English terms; it still needs Hindi.
        hindi = devanagari > 0 and devanagari * 3 >= latin
        if runs and runs[-1][0] == hindi:
            runs[-1] = (hindi, f"{runs[-1][1]} {sentence}")
        else:
            runs.append((hindi, sentence))
    return runs or [(False, text)]


def _say(text: str, voice: str, rate: int, folder: Path, index: int) -> bytes:
    """Speak *text* with *voice* and return the raw PCM frames."""
    source = folder / f"text{index}.txt"
    target = folder / f"speech{index}.wav"
    source.write_text(text, encoding="utf-8")
    # Text goes through a file so it can never be read as an option.
    subprocess.run(
        [
            "say",
            "-v",
            voice,
            "-r",
            str(rate),
            "-o",
            str(target),
            f"--data-format=LEI16@{_SAMPLE_RATE}",
            "-f",
            str(source),
        ],
        capture_output=True,
        timeout=120,
        check=True,
    )
    with wave.open(str(target), "rb") as wav:
        return wav.readframes(wav.getnframes())


def _best_voice(requested: str, available: List[str]) -> str:
    """Prefer an Enhanced or Premium download of the requested voice."""
    name = requested if _VOICE_NAME.fullmatch(requested or "") else DEFAULT_VOICE
    for quality in ("Premium", "Enhanced"):
        if f"{name} ({quality})" in available:
            return f"{name} ({quality})"
    if name in available:
        return name
    return DEFAULT_VOICE


@TTSRegistry.register("macos_say")
class MacOSSayBackend(TTSBackend):
    """Offline speech with the voices installed on this Mac. Output is WAV."""

    backend_id = "macos_say"

    def synthesize(
        self,
        text: str,
        *,
        voice_id: str = DEFAULT_VOICE,
        speed: float = 1.0,
        output_format: str = "wav",
    ) -> TTSResult:
        available = installed_voices()
        voice = _best_voice(voice_id, available)
        has_hindi = any(v.startswith(HINDI_VOICE) for v in available)
        hindi = _best_voice(HINDI_VOICE, available) if has_hindi else voice
        rate = round(_BASE_WORDS_PER_MINUTE * min(max(speed, 0.5), 2.0))
        with tempfile.TemporaryDirectory() as folder:
            pcm = b"".join(
                _say(part, hindi if is_hindi else voice, rate, Path(folder), i)
                for i, (is_hindi, part) in enumerate(split_by_script(text))
            )
        buffer = io.BytesIO()
        with wave.open(buffer, "wb") as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(_SAMPLE_RATE)
            wav.writeframes(pcm)
        return TTSResult(
            audio=buffer.getvalue(),
            format="wav",
            voice_id=voice,
            sample_rate=_SAMPLE_RATE,
            duration_seconds=len(pcm) / (2 * _SAMPLE_RATE),
            metadata={"backend": "macos_say"},
        )

    def available_voices(self) -> List[str]:
        return installed_voices() if self.health() else []

    def health(self) -> bool:
        return platform.system() == "Darwin" and shutil.which("say") is not None
