"""The macOS ``say`` backend speaks with Rishi, preferring a better download."""

import subprocess
from pathlib import Path

from openjarvis.speech import macos_say
from openjarvis.speech._tts_discovery import default_voice_for

LISTING = (
    "Daniel              en_GB    # Hello! My name is Daniel.\n"
    "Eddy (English (UK)) en_GB    # Hello! My name is Eddy.\n"
    "Rishi               en_IN    # Hello! My name is Rishi.\n"
)


def _fake_say(calls, listing=LISTING):
    def run(args, **kwargs):
        if args[:3] == ["say", "-v", "?"]:
            return subprocess.CompletedProcess(args, 0, stdout=listing)
        calls.append(args)
        import wave

        with wave.open(args[args.index("-o") + 1], "wb") as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(22050)
            wav.writeframes(b"\x00\x00" * 2205)
        calls.append(Path(args[args.index("-f") + 1]).read_text())
        return subprocess.CompletedProcess(args, 0)

    return run


def test_speaks_with_rishi_and_passes_text_in_a_file(monkeypatch):
    calls = []
    monkeypatch.setattr(macos_say.subprocess, "run", _fake_say(calls))
    result = macos_say.MacOSSayBackend().synthesize("-v Daniel hello")
    command, spoken = calls
    assert command[command.index("-v") + 1] == "Rishi"
    assert spoken == "-v Daniel hello" and "-v Daniel hello" not in command
    assert result.format == "wav" and result.audio.startswith(b"RIFF")
    assert round(result.duration_seconds, 1) == 0.1
    assert default_voice_for("macos_say") == "Rishi"


def test_prefers_an_enhanced_download_and_rejects_odd_names():
    available = ["Rishi", "Rishi (Enhanced)", "Daniel"]
    assert macos_say._best_voice("Rishi", available) == "Rishi (Enhanced)"
    assert macos_say._best_voice("Daniel", available) == "Daniel"
    assert macos_say._best_voice("--output", ["Rishi"]) == "Rishi"
    assert macos_say._best_voice("Nobody", ["Rishi"]) == "Rishi"


def test_reads_voice_names(monkeypatch):
    monkeypatch.setattr(macos_say.subprocess, "run", _fake_say([]))
    assert macos_say.installed_voices() == ["Daniel", "Eddy (English (UK))", "Rishi"]


def test_splits_hindi_and_english_sentences():
    runs = macos_say.split_by_script(
        "Newton's first law. यह जड़त्व का नियम है। बल लगाने पर ही velocity बदलती है। Okay?"
    )
    assert [hindi for hindi, _ in runs] == [False, True, False]
    assert "velocity" in runs[1][1]


def test_hindi_sentences_use_the_hindi_voice(monkeypatch):
    calls = []
    listing = LISTING + "Lekha               hi_IN    # नमस्ते\n"
    monkeypatch.setattr(macos_say.subprocess, "run", _fake_say(calls, listing))
    result = macos_say.MacOSSayBackend().synthesize("Hello. नमस्ते।")
    voices = [c[c.index("-v") + 1] for c in calls if isinstance(c, list)]
    assert voices == ["Rishi", "Lekha"]
    assert round(result.duration_seconds, 1) == 0.2
