"""Reject browser requests that come from an untrusted web origin.

CORS only stops a page from *reading* a response. A "simple" cross-site request
(a form post, a multipart upload) is still delivered and acted on, so routes
with side effects check the ``Origin`` header themselves.

A request without ``Origin`` is allowed: curl and native clients send none,
while browsers always send it on cross-origin and state-changing requests.
"""

from __future__ import annotations

import ipaddress
from collections.abc import Iterable
from urllib.parse import urlsplit

from fastapi import HTTPException, Request
from starlette.requests import HTTPConnection

DEFAULT_ALLOWED_ORIGINS: tuple[str, ...] = (
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
    # Tauri 2 production webview origins:
    #   macOS / Linux / iOS  -> tauri://localhost
    #   Windows / Android    -> http://tauri.localhost (default),
    #                           https://tauri.localhost when
    #                           windows.useHttpsScheme is enabled
    "tauri://localhost",
    "http://tauri.localhost",
    "https://tauri.localhost",
)


def _normalize(origin: str) -> str:
    return origin.strip().rstrip("/").lower()


def _is_loopback_host(host: str) -> bool:
    if host == "localhost":
        return True
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return False


def _is_same_loopback_origin(origin: str, host_header: str) -> bool:
    """Whether *origin* is the server's own page, served on a loopback address.

    Limited to loopback because matching ``Host`` alone would trust any domain
    that has been re-pointed at this machine (DNS rebinding).
    """
    try:
        parts = urlsplit(origin)
        hostname = parts.hostname or ""
    except ValueError:
        return False
    return (
        parts.scheme in ("http", "https")
        and parts.netloc == _normalize(host_header)
        and _is_loopback_host(hostname)
    )


def origin_allowed(
    origin: str | None, host_header: str, allowed: Iterable[str]
) -> bool:
    """Whether a request with this ``Origin`` and ``Host`` may proceed."""
    if origin is None:
        return True
    normalized = _normalize(origin)
    if normalized in {_normalize(item) for item in allowed if item != "*"}:
        return True
    return _is_same_loopback_origin(normalized, host_header)


def connection_origin_allowed(connection: HTTPConnection) -> bool:
    """Origin check for a ``Request`` or a ``WebSocket`` handshake.

    Uses the app's resolved CORS allow list (``app.state.cors_origins``, set by
    ``create_app``). WebSocket handlers should call this before ``accept()``
    and close with code 1008 when it returns ``False``.
    """
    app = connection.scope.get("app")
    allowed = getattr(getattr(app, "state", None), "cors_origins", None)
    if allowed is None:
        allowed = DEFAULT_ALLOWED_ORIGINS
    return origin_allowed(
        connection.headers.get("origin"),
        connection.headers.get("host", ""),
        allowed,
    )


async def require_trusted_origin(request: Request) -> None:
    """FastAPI dependency: respond 403 to requests from untrusted origins."""
    if not connection_origin_allowed(request):
        raise HTTPException(
            status_code=403,
            detail={
                "code": "untrusted_origin",
                "message": "Requests from this website are not allowed.",
            },
        )


__all__ = [
    "DEFAULT_ALLOWED_ORIGINS",
    "connection_origin_allowed",
    "origin_allowed",
    "require_trusted_origin",
]
