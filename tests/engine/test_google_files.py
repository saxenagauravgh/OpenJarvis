"""Gemini file parts and Files API uploads (faked; no network)."""

from __future__ import annotations

import asyncio
import datetime as dt
import types

import pytest

from openjarvis.core.types import Message, Role
from openjarvis.engine import google_common

EXPIRES = dt.datetime(2030, 1, 1, tzinfo=dt.timezone.utc)


def remote(state: str, uri: str | None = "https://files.example/1"):
    return types.SimpleNamespace(
        name="files/1",
        uri=uri,
        state=types.SimpleNamespace(name=state),
        expiration_time=EXPIRES,
    )


def client(*files):
    queue = list(files)
    calls = []

    async def step(**kwargs):
        calls.append(kwargs)
        return queue.pop(0) if len(queue) > 1 else queue[0]

    api = types.SimpleNamespace(upload=step, get=step)
    return types.SimpleNamespace(aio=types.SimpleNamespace(files=api)), calls


def upload(fake):
    return asyncio.run(
        google_common.upload_file(fake, "/tmp/x", mime_type="application/pdf")
    )


@pytest.fixture(autouse=True)
def fast(monkeypatch):
    monkeypatch.setattr(google_common, "FILE_POLL_SECONDS", 0)


def test_upload_waits_until_the_file_is_active():
    fake, calls = client(remote("PROCESSING"), remote("PROCESSING"), remote("ACTIVE"))

    result = upload(fake)

    assert result.uri == "https://files.example/1"
    assert result.expires_at == EXPIRES.timestamp()
    assert calls[0]["config"] == {"mime_type": "application/pdf"}
    assert calls[1:] == [{"name": "files/1"}] * 2


@pytest.mark.parametrize("final", [remote("FAILED"), remote("ACTIVE", uri=None)])
def test_unusable_uploads_raise(final):
    with pytest.raises(google_common.FileProcessingError):
        upload(client(final)[0])


def test_processing_has_a_deadline(monkeypatch):
    monkeypatch.setattr(google_common, "FILE_UPLOAD_TIMEOUT_SECONDS", 0.01)

    with pytest.raises(google_common.FileProcessingError):
        upload(client(remote("PROCESSING"))[0])


def test_file_parts_precede_the_text():
    parts = [{"file_data": {"file_uri": "u", "mime_type": "application/pdf"}}]
    message = Message(
        role=Role.USER,
        content="question",
        metadata={google_common.GEMINI_PARTS_KEY: parts},
    )

    assert google_common.user_parts(message) == [*parts, {"text": "question"}]
    message.content = ""
    assert google_common.user_parts(message) == parts
    assert message.metadata[google_common.GEMINI_PARTS_KEY] == parts
