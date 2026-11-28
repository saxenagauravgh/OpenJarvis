"""Untrusted browser origins cannot reach the tutor or upload routes."""

from __future__ import annotations

import pytest

pytest.importorskip("fastapi")

from fastapi import FastAPI, WebSocket  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from starlette.websockets import WebSocketDisconnect  # noqa: E402

from openjarvis.core.config import JarvisConfig  # noqa: E402
from openjarvis.server import upload_router  # noqa: E402
from openjarvis.server.app import create_app  # noqa: E402
from openjarvis.server.origin import (  # noqa: E402
    DEFAULT_ALLOWED_ORIGINS,
    connection_origin_allowed,
    origin_allowed,
)


@pytest.mark.parametrize(
    "origin,host",
    [
        (None, "localhost:8000"),
        ("tauri://localhost", "127.0.0.1:8000"),
        ("http://tauri.localhost", "127.0.0.1:8000"),
        ("http://localhost:5173", "localhost:8000"),
        ("http://localhost:8000", "localhost:8000"),
        ("http://127.0.0.1:8000", "127.0.0.1:8000"),
        ("http://[::1]:8000", "[::1]:8000"),
    ],
)
def test_trusted_origins(origin, host):
    assert origin_allowed(origin, host, DEFAULT_ALLOWED_ORIGINS)


@pytest.mark.parametrize(
    "origin,host",
    [
        ("https://evil.example", "localhost:8000"),
        ("null", "localhost:8000"),
        ("", "localhost:8000"),
        # Another local web server is not this one.
        ("http://localhost:9999", "localhost:8000"),
        # DNS rebinding: the attacker's name resolves to this machine.
        ("http://evil.example:8000", "evil.example:8000"),
        ("http://localhost.evil.example", "localhost.evil.example"),
        ("http://192.168.1.5:8000", "192.168.1.5:8000"),
    ],
)
def test_untrusted_origins(origin, host):
    assert not origin_allowed(origin, host, DEFAULT_ALLOWED_ORIGINS)


def test_wildcard_never_trusts_everything():
    assert not origin_allowed("https://evil.example", "localhost:8000", ["*"])


@pytest.fixture
def client(tmp_path, monkeypatch):
    from unittest.mock import MagicMock

    stored = []

    class Store:
        def store(self, chunk, **kwargs):
            stored.append(chunk)

    monkeypatch.setattr(upload_router, "_get_store", Store)
    cfg = JarvisConfig()
    cfg.analytics.enabled = False
    cfg.traces.enabled = False
    cfg.security.enabled = False
    app = create_app(
        MagicMock(), "m", config=cfg, cors_origins=["https://my.frontend.test"]
    )
    test_client = TestClient(app, base_url="http://localhost:8000")
    test_client.stored = stored
    return test_client


TUTOR = {
    "model": "gemini-2.5-flash",
    "messages": [{"role": "user", "content": "q"}],
    "adultConfirmed": False,
}


def _requests(client, headers):
    yield client.post("/v1/tutor/chat", json=TUTOR, headers=headers)
    yield client.post(
        "/v1/connectors/upload/ingest", json={"content": "note"}, headers=headers
    )
    yield client.post(
        "/v1/connectors/upload/ingest/files",
        files={"files": ("a.txt", b"note", "text/plain")},
        headers=headers,
    )


def test_untrusted_origin_is_rejected_before_any_work(client):
    for response in _requests(client, {"Origin": "https://evil.example"}):
        assert response.status_code == 403
        assert response.json()["detail"]["code"] == "untrusted_origin"
    assert client.stored == []


@pytest.mark.parametrize(
    "headers",
    [{}, {"Origin": "https://my.frontend.test"}, {"Origin": "http://localhost:8000"}],
)
def test_configured_same_origin_and_native_requests_pass(client, headers):
    tutor, paste, files = _requests(client, headers)

    # The tutor request gets as far as the age check.
    assert tutor.json()["detail"]["code"] == "age_unconfirmed"
    assert paste.status_code == 200
    assert files.status_code == 200
    assert client.stored == ["note", "note"]


def test_websocket_handshakes_can_reuse_the_check():
    app = FastAPI()
    app.state.cors_origins = ["tauri://localhost"]

    @app.websocket("/ws")
    async def endpoint(websocket: WebSocket):
        if not connection_origin_allowed(websocket):
            await websocket.close(code=1008)
            return
        await websocket.accept()
        await websocket.send_text("ok")
        await websocket.close()

    client = TestClient(app)
    with client.websocket_connect("/ws", headers={"origin": "tauri://localhost"}) as ws:
        assert ws.receive_text() == "ok"
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect(
            "/ws", headers={"origin": "https://evil.example"}
        ):
            pass
