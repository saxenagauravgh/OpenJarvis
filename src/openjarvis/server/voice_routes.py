"""``WebSocket /v1/voice/live``: a spoken conversation with the tutor.

Client to server: first a JSON text frame ``{"type": "start", "v": 1,
"adultConfirmed": true, "history": [{"role": "user"|"assistant", "text"}]}``,
then binary frames of 16 kHz mono PCM16LE, ``{"type": "text", "text"}`` and
``{"type": "stop"}``.

Server to client: binary frames of 24 kHz mono PCM16LE and these JSON events:

``state``          ``{"state": "connecting"|"ready"|"reconnecting"|"closed",
                   "reason"?}``
``transcript``     ``{"turnId", "role", "delta"}``
``board``          ``{"turnId", "title", "markdown"}``
``action``         ``{"turnId", "setting", "value"}`` (a proposal to confirm)
``interrupted``    ``{"turnId"}``
``turn_complete``  ``{"turnId"}``
``error``          ``{"code", "message", "retryable"}``

``reason`` is ``go_away`` or ``connection_lost`` when reconnecting, and
``stopped``, ``idle``, ``replaced``, ``error`` or ``closed`` when closed.

The system instruction comes from the server alone. One conversation is active
at a time: starting another closes the one before it.
"""

from __future__ import annotations

import asyncio
import json
import logging
from contextlib import suppress
from typing import Any, Optional

from fastapi import APIRouter, WebSocket

from openjarvis.engine import google_common
from openjarvis.server import live_session
from openjarvis.server.auth_middleware import authenticate_websocket
from openjarvis.server.origin import connection_origin_allowed
from openjarvis.server.routes import _ensure_identity_prompt

logger = logging.getLogger("openjarvis.server.voice")

router = APIRouter(prefix="/v1/voice", tags=["voice"])

PROTOCOL_VERSION = 1
START_TIMEOUT_SECONDS = 10.0
MAX_START_CHARS = 4_000_000
MAX_HISTORY_ITEMS = 100

_AGE_UNCONFIRMED = google_common.ErrorInfo(
    "age_unconfirmed",
    "Please confirm that you are 18 or older to use the tutor.",
    False,
)
_BAD_START = google_common.ErrorInfo(
    "internal",
    "The voice conversation could not be started. Update the app and try again.",
    False,
)


def _parse_start(message: dict[str, Any]) -> Optional[dict[str, Any]]:
    text = message.get("text")
    if text is None or len(text) > MAX_START_CHARS:
        return None
    try:
        frame = json.loads(text)
    except (ValueError, RecursionError):
        return None
    if not isinstance(frame, dict) or frame.get("type") != "start":
        return None
    version = frame.get("v")
    if type(version) is not int or version != PROTOCOL_VERSION:
        return None
    return frame


def _history(items: Any) -> list[live_session.Turn]:
    """Well-formed user and assistant turns; everything else is dropped."""
    if not isinstance(items, list):
        return []
    turns = []
    for item in items[-MAX_HISTORY_ITEMS:]:
        if not isinstance(item, dict):
            continue
        role, text = item.get("role"), item.get("text")
        if role in ("user", "assistant") and isinstance(text, str) and text.strip():
            turns.append(live_session.Turn(role, text[: live_session.MAX_RECAP_CHARS]))
    return turns


def _persona(config: Any) -> str:
    """The same server persona that tutor chat uses."""
    messages = _ensure_identity_prompt([], config)
    return messages[0].text if messages else ""


async def _refuse(
    websocket: WebSocket, info: google_common.ErrorInfo, close_code: int
) -> None:
    with suppress(Exception):  # the client may already have gone
        await websocket.send_json(live_session.error_event(info))
        await websocket.send_json(live_session.state_event("closed", "error"))
        await websocket.close(code=close_code)


@router.websocket("/live")
async def live_voice(websocket: WebSocket) -> None:
    state = websocket.app.state
    authorized, subprotocol = False, None
    if connection_origin_allowed(websocket):
        authorized, subprotocol = authenticate_websocket(
            websocket, getattr(state, "api_key", "")
        )
    if not authorized:
        # Closing before accept rejects the HTTP upgrade request.
        await websocket.close(code=1008)
        return
    await websocket.accept(subprotocol=subprotocol)

    try:
        message = await asyncio.wait_for(websocket.receive(), START_TIMEOUT_SECONDS)
    except TimeoutError:
        await _refuse(websocket, _BAD_START, 1008)
        return
    if message.get("type") == "websocket.disconnect":
        return
    start = _parse_start(message)
    if start is None:
        await _refuse(websocket, _BAD_START, 1008)
        return
    # Only a literal JSON ``true`` confirms.
    if start.get("adultConfirmed") is not True:
        await _refuse(websocket, _AGE_UNCONFIRMED, 1008)
        return

    try:
        if not await asyncio.to_thread(google_common.load_api_key):
            await _refuse(websocket, google_common.error_info("no_key"), 1000)
            return
        persona = await asyncio.to_thread(_persona, getattr(state, "config", None))
        bridge = live_session.LiveBridge(
            websocket,
            getattr(state, "live_connect", None) or live_session.gemini_connect,
            persona=persona,
            history=_history(start.get("history")),
        )
    except Exception as exc:
        google_common.log_failure(logger, "Could not start a voice session", exc)
        await _refuse(websocket, google_common.error_info("internal"), 1011)
        return

    previous = getattr(state, "live_bridge", None)
    state.live_bridge = bridge
    try:
        if previous is not None:
            previous.stop("replaced")
            with suppress(TimeoutError):
                await asyncio.wait_for(
                    previous.closed.wait(), live_session.CLOSE_TIMEOUT_SECONDS
                )
        await bridge.run()
    finally:
        if getattr(state, "live_bridge", None) is bridge:
            state.live_bridge = None


__all__ = ["router"]
