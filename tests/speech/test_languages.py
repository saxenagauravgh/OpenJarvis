"""Speech recognition stays within the configured languages."""

from types import SimpleNamespace as NS

from openjarvis.speech._languages import allowed_languages, transcribe_in


def _backend(detected):
    calls = []

    def transcribe(audio, *, format, language=None):
        calls.append(language)
        return NS(text="t", language=language or detected)

    return NS(transcribe=transcribe), calls


def test_parses_the_setting():
    assert allowed_languages(" en, HI ") == ["en", "hi"]
    assert allowed_languages("") == []


def test_allowed_or_unrestricted_languages_run_once():
    for allowed in (["en", "hi"], []):
        backend, calls = _backend("hi")
        assert transcribe_in(backend, b"a", format="wav", allowed=allowed).language
        assert calls == [None]


def test_other_languages_are_transcribed_again():
    backend, calls = _backend("ur")
    assert (
        transcribe_in(backend, b"a", format="wav", allowed=["en", "hi"]).language
        == "hi"
    )
    assert calls == [None, "hi"]
    backend, calls = _backend("fr")
    assert (
        transcribe_in(backend, b"a", format="wav", allowed=["en", "hi"]).language
        == "en"
    )


def test_a_single_language_is_forced():
    backend, calls = _backend("fr")
    transcribe_in(backend, b"a", format="wav", allowed=["en"])
    assert calls == ["en"]
