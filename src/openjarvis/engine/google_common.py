"""The single Gemini path shared by the cloud engine, router and tutor route.

Key lookup, client construction, message conversion, the busy-model fallback,
finish-reason mapping and user-safe error classification live here so every
caller behaves the same way. ``google-genai`` is imported lazily, so importing
this module never requires the SDK.
"""

from __future__ import annotations

import asyncio
import base64
import binascii
import json
import logging
import os
import re
import socket
import time
import traceback
from collections.abc import AsyncIterator, Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import httpx

from openjarvis.core.paths import get_config_dir
from openjarvis.core.types import Message
from openjarvis.engine._base import EngineConnectionError, EngineContextLengthError

logger = logging.getLogger(__name__)

# Gemini returns these when a model is overloaded or rate-limited. The SDK
# retries them with backoff; if the model is still busy we fall back once
# to a lighter model that is usually available.
GOOGLE_BUSY_CODES = (429, 500, 503, 504)
GOOGLE_FALLBACK_MODEL = "gemini-3.5-flash-lite"
GOOGLE_KEY_NAMES = ("GEMINI_API_KEY", "GOOGLE_API_KEY")
# ``Message.metadata`` key for extra Gemini parts (files) of a user message.
GEMINI_PARTS_KEY = "gemini_parts"
# Longest wait for a Files API upload, and again for its processing.
FILE_UPLOAD_TIMEOUT_SECONDS = 120.0
FILE_POLL_SECONDS = 1.0


# ---------------------------------------------------------------------------
# Keys and clients
# ---------------------------------------------------------------------------


def read_env_file(path: Path) -> Dict[str, str]:
    """Parse a ``KEY=value`` file, stripping enclosing quotes."""
    values: Dict[str, str] = {}
    if not path.exists():
        return values
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            value = value.strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
                value = value[1:-1]
            values[key.strip()] = value
    return values


def load_api_key() -> str:
    """The Gemini API key, read at call time; "" when none is configured.

    The process environment wins, then ``cloud-keys.env`` in the config dir.
    """
    for name in GOOGLE_KEY_NAMES:
        value = os.environ.get(name, "").strip()
        if value:
            return value
    try:
        stored = read_env_file(get_config_dir() / "cloud-keys.env")
    except (OSError, UnicodeError):
        logger.warning("Could not read cloud-keys.env")
        return ""
    for name in GOOGLE_KEY_NAMES:
        value = stored.get(name, "").strip()
        if value:
            return value
    return ""


def create_client(api_key: str) -> Any:
    """Build a ``google.genai`` client that retries busy responses."""
    from google import genai
    from google.genai import types as genai_types

    return genai.Client(
        api_key=api_key,
        http_options=genai_types.HttpOptions(
            retry_options=genai_types.HttpRetryOptions(
                attempts=3,
                initial_delay=1.0,
                max_delay=8.0,
                http_status_codes=list(GOOGLE_BUSY_CODES),
            )
        ),
    )


async def close_client(client: Any) -> None:
    """Best-effort release of a client's sync and async connections."""
    # Sync first: if the request was cancelled, the await below may not finish.
    try:
        client.close()
    except Exception:  # noqa: BLE001 — cleanup must never mask the result
        logger.debug("Gemini client did not close cleanly")
    try:
        await client.aio.aclose()
    except Exception:  # noqa: BLE001
        logger.debug("Gemini async client did not close cleanly")


# ---------------------------------------------------------------------------
# Files API
# ---------------------------------------------------------------------------


class FileProcessingError(RuntimeError):
    """Gemini accepted an upload but could not make it ready to use."""


@dataclass(frozen=True)
class UploadedFile:
    uri: str
    #: Unix time at which Gemini deletes the file, if it says.
    expires_at: Optional[float] = None


async def upload_file(client: Any, source: Any, *, mime_type: str) -> UploadedFile:
    """Upload a path or binary stream and wait until Gemini can use it."""
    timeout = FILE_UPLOAD_TIMEOUT_SECONDS
    uploaded = await asyncio.wait_for(
        client.aio.files.upload(file=source, config={"mime_type": mime_type}),
        timeout,
    )
    deadline = time.monotonic() + timeout
    while True:
        state = getattr(uploaded, "state", None)
        state = getattr(state, "name", state)
        if state == "ACTIVE":
            break
        if state == "FAILED" or time.monotonic() >= deadline:
            raise FileProcessingError("Gemini could not process the file")
        await asyncio.sleep(FILE_POLL_SECONDS)
        uploaded = await asyncio.wait_for(
            client.aio.files.get(name=uploaded.name), timeout
        )
    if not uploaded.uri:
        raise FileProcessingError("Gemini returned no address for the file")
    expires = getattr(uploaded, "expiration_time", None)
    return UploadedFile(uploaded.uri, expires.timestamp() if expires else None)


# ---------------------------------------------------------------------------
# Request building
# ---------------------------------------------------------------------------


def sniff_image_mime(data: bytes) -> str:
    """Best-effort image MIME type from magic bytes (defaults to JPEG)."""
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return "image/jpeg"


def user_parts(message: Message) -> List[Dict[str, Any]]:
    """Gemini ``parts`` for a user message: files, text and inline images."""
    images = message.images or []
    parts: List[Dict[str, Any]] = list(message.metadata.get(GEMINI_PARTS_KEY) or [])
    if message.content or not (images or parts):
        parts.append({"text": message.content or ""})
    for image_b64 in images:
        try:
            data = base64.b64decode(image_b64, validate=True)
        except (binascii.Error, ValueError):
            logger.warning("Skipping invalid base64 image in message")
            continue
        parts.append(
            {"inline_data": {"mime_type": sniff_image_mime(data), "data": data}}
        )
    return parts or [{"text": ""}]


def build_contents(
    messages: Sequence[Message],
    thought_signatures: Optional[Mapping[str, bytes]] = None,
) -> Tuple[str, List[Dict[str, Any]]]:
    """Convert messages to ``(system_instruction, contents)``.

    All system messages are joined into one instruction. Saved Gemini thought
    signatures are replayed beside the function call they belong to.
    """
    signatures = thought_signatures or {}
    system_parts: List[str] = []
    contents: List[Dict[str, Any]] = []
    for message in messages:
        role = getattr(message.role, "value", str(message.role))
        if role == "system":
            if message.content:
                system_parts.append(message.content)
        elif role == "tool":
            # Gemini expects function responses as role="user" with
            # function_response parts; consecutive results share one message.
            response_part = {
                "function_response": {
                    "name": message.name or "unknown",
                    "response": {"result": message.content},
                }
            }
            if (
                contents
                and contents[-1]["role"] == "user"
                and contents[-1]["parts"]
                and "function_response" in contents[-1]["parts"][-1]
            ):
                contents[-1]["parts"].append(response_part)
            else:
                contents.append({"role": "user", "parts": [response_part]})
        elif role == "assistant" and message.tool_calls:
            parts: List[Dict[str, Any]] = []
            if message.content:
                parts.append({"text": message.content})
            for tool_call in message.tool_calls:
                args = tool_call.arguments
                if isinstance(args, str):
                    try:
                        args = json.loads(args)
                    except (json.JSONDecodeError, TypeError):
                        args = {"input": args}
                call_part: Dict[str, Any] = {
                    "function_call": {
                        "name": tool_call.name,
                        "args": args if isinstance(args, dict) else {},
                    }
                }
                signature = signatures.get(tool_call.id)
                if signature is not None:
                    call_part["thought_signature"] = signature
                parts.append(call_part)
            contents.append({"role": "model", "parts": parts})
        elif role == "assistant":
            contents.append(
                {"role": "model", "parts": [{"text": message.content or ""}]}
            )
        else:
            contents.append({"role": "user", "parts": user_parts(message)})
    return "\n\n".join(system_parts), contents


def build_config(
    *, temperature: float, max_output_tokens: int, system_instruction: str = ""
) -> Any:
    """A ``GenerateContentConfig`` with a real system instruction."""
    from google.genai import types as genai_types

    config = genai_types.GenerateContentConfig(
        temperature=temperature,
        max_output_tokens=max_output_tokens,
    )
    if system_instruction:
        config.system_instruction = system_instruction
    return config


# ---------------------------------------------------------------------------
# Responses
# ---------------------------------------------------------------------------

_BLOCKED_MARKERS = ("SAFETY", "BLOCK", "PROHIBITED", "SPII", "RECITATION")


def map_finish_reason(reason: Any) -> str:
    """Map a Gemini finish reason to ``"stop"``, ``"length"`` or ``"blocked"``."""
    name = reason if isinstance(reason, str) else getattr(reason, "name", "")
    if not isinstance(name, str):
        return "stop"
    name = name.upper()
    if "MAX_TOKENS" in name:
        return "length"
    if any(marker in name for marker in _BLOCKED_MARKERS):
        return "blocked"
    return "stop"


def chunk_finish_reason(response: Any) -> Optional[str]:
    """The mapped finish reason carried by a response or chunk, if any."""
    candidates = getattr(response, "candidates", None)
    if candidates:
        reason = getattr(candidates[0], "finish_reason", None)
        return map_finish_reason(reason) if reason else None
    feedback = getattr(response, "prompt_feedback", None)
    blocked = getattr(feedback, "block_reason", None)
    if isinstance(blocked, str) and blocked and not blocked.endswith("UNSPECIFIED"):
        return "blocked"
    return None


def chunk_text(response: Any) -> str:
    """Answer text of a response or chunk, leaving out thought summaries."""
    candidates = getattr(response, "candidates", None)
    if candidates:
        content = getattr(candidates[0], "content", None)
        parts = getattr(content, "parts", None)
        if parts:
            return "".join(
                part.text
                for part in parts
                if isinstance(getattr(part, "text", None), str)
                and getattr(part, "thought", None) is not True
            )
    try:
        text = response.text
    except (AttributeError, ValueError):
        return ""
    return text if isinstance(text, str) else ""


def usage_from(response: Any) -> Optional[Dict[str, int]]:
    """Token usage of a response or chunk in the OpenAI shape, if reported."""
    metadata = getattr(response, "usage_metadata", None)
    if metadata is None:
        return None
    prompt = getattr(metadata, "prompt_token_count", 0) or 0
    completion = getattr(metadata, "candidates_token_count", 0) or 0
    return {
        "prompt_tokens": prompt,
        "completion_tokens": completion,
        "total_tokens": prompt + completion,
    }


# ---------------------------------------------------------------------------
# Calling Gemini
# ---------------------------------------------------------------------------


def fallback_model(model: str, exc: BaseException) -> Optional[str]:
    """Model to retry with after *exc*, or None when there is no fallback."""
    if getattr(exc, "code", None) not in GOOGLE_BUSY_CODES:
        return None
    if model == GOOGLE_FALLBACK_MODEL:
        return None
    return GOOGLE_FALLBACK_MODEL


async def open_stream(
    client: Any,
    model: str,
    contents: Any,
    config: Any,
    *,
    allow_fallback: bool = True,
) -> AsyncIterator[Any]:
    """Iterate a Gemini stream on the async client.

    When *allow_fallback* is set and the model is busy, retry once with the
    lighter model. That only happens before the first chunk arrives, so a reply
    is never stitched together from two different models.
    """

    async def start(name: str) -> Tuple[Any, Any]:
        stream = await client.aio.models.generate_content_stream(
            model=name, contents=contents, config=config
        )
        iterator = stream.__aiter__()
        try:
            return await iterator.__anext__(), iterator
        except StopAsyncIteration:
            return None, None

    try:
        first, rest = await start(model)
    except Exception as exc:
        fallback = fallback_model(model, exc) if allow_fallback else None
        if fallback is None:
            raise
        logger.warning(
            "Gemini %s busy (HTTP %s); retrying with %s",
            model,
            getattr(exc, "code", "?"),
            fallback,
        )
        first, rest = await start(fallback)
    if first is None:
        return
    yield first
    async for chunk in rest:
        yield chunk


@dataclass(frozen=True)
class GeminiEvent:
    """A piece of answer text, or the final finish reason and usage."""

    text: str = ""
    finish_reason: Optional[str] = None
    usage: Optional[Dict[str, int]] = None
    #: A function the model asked to call: ``{"name": ..., "args": {...}}``.
    call: Optional[Dict[str, Any]] = None


def chunk_calls(response: Any) -> List[Dict[str, Any]]:
    """Function calls contained in a response chunk."""
    candidates = getattr(response, "candidates", None)
    content = getattr(candidates[0], "content", None) if candidates else None
    calls = []
    for part in getattr(content, "parts", None) or []:
        call = getattr(part, "function_call", None)
        name = getattr(call, "name", None)
        if isinstance(name, str) and name:
            args = getattr(call, "args", None)
            calls.append(
                {"name": name, "args": dict(args) if isinstance(args, dict) else {}}
            )
    return calls


async def stream_text(
    model: str,
    messages: Sequence[Message],
    *,
    temperature: float,
    max_tokens: int,
    allow_fallback: bool = True,
    idle_timeout: Optional[float] = None,
    functions: Optional[List[Dict[str, Any]]] = None,
) -> AsyncIterator[GeminiEvent]:
    """Stream a text answer with a fresh client and the key current right now.

    Yields text events, then exactly one event carrying ``finish_reason``.
    Raises on failure; use :func:`classify_error` for a user-safe description.
    *idle_timeout* bounds the wait for each chunk.
    """
    api_key = load_api_key()
    if not api_key:
        raise MissingAPIKeyError(
            "GEMINI_API_KEY not set — add it in the Cloud Models tab"
        )
    system_instruction, contents = build_contents(messages)
    config = build_config(
        temperature=temperature,
        max_output_tokens=max_tokens,
        system_instruction=system_instruction,
    )
    if functions:
        config.tools = [{"function_declarations": functions}]
    client = create_client(api_key)
    chunks = open_stream(client, model, contents, config, allow_fallback=allow_fallback)
    finish_reason: Optional[str] = None
    usage: Optional[Dict[str, int]] = None
    try:
        while True:
            try:
                chunk = await asyncio.wait_for(chunks.__anext__(), idle_timeout)
            except StopAsyncIteration:
                break
            usage = usage_from(chunk) or usage
            finish_reason = chunk_finish_reason(chunk) or finish_reason
            text = chunk_text(chunk)
            if text:
                yield GeminiEvent(text=text)
            if functions:
                for call in chunk_calls(chunk):
                    yield GeminiEvent(call=call)
        yield GeminiEvent(finish_reason=finish_reason or "stop", usage=usage)
    finally:
        await chunks.aclose()
        await close_client(client)


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------


class MissingAPIKeyError(EngineConnectionError, ValueError):
    """No API key is configured for the requested provider."""


@dataclass(frozen=True)
class ErrorInfo:
    """A failure described in words that are safe to show to the user."""

    code: str  # no_key | bad_key | quota | busy | network | internal
    message: str
    retryable: bool


_ERRORS: Dict[str, ErrorInfo] = {
    info.code: info
    for info in (
        ErrorInfo(
            "no_key",
            "No API key is set up for this model. Add it in the Cloud Models "
            "tab, then try again.",
            False,
        ),
        ErrorInfo(
            "bad_key",
            "The API key was rejected. Check the key in the Cloud Models tab, "
            "then try again.",
            False,
        ),
        ErrorInfo(
            "quota",
            "The usage limit for this model has been reached. Wait a little and "
            "try again, or check your plan.",
            True,
        ),
        ErrorInfo(
            "busy",
            "The model is busy right now. Please try again in a moment.",
            True,
        ),
        ErrorInfo(
            "network",
            "Could not reach the model. Check your internet connection (or that "
            "the local model app is running) and try again.",
            True,
        ),
        ErrorInfo(
            "internal",
            "Something went wrong while generating the answer. Please try again.",
            True,
        ),
    )
}

_REJECTED = ErrorInfo(
    "internal",
    "The model could not process this request. Try rephrasing it, removing "
    "attachments or choosing another model.",
    False,
)
_TOO_LONG = ErrorInfo(
    "internal",
    "The conversation is too long for the model's context window. Start a new "
    "chat or shorten the conversation, then try again.",
    False,
)


def error_info(code: str) -> ErrorInfo:
    """The standard description for an error *code*."""
    return _ERRORS.get(code, _ERRORS["internal"])


def _status_code(exc: BaseException) -> Optional[int]:
    for value in (
        getattr(exc, "code", None),
        getattr(exc, "status_code", None),
        getattr(getattr(exc, "response", None), "status_code", None),
    ):
        if isinstance(value, int) and 100 <= value <= 599:
            return value
    if isinstance(exc, EngineConnectionError):
        found = re.search(r"returned HTTP (\d{3})", str(exc))
        if found:
            return int(found.group(1))
    return None


def _is_network_error(exc: BaseException) -> bool:
    if isinstance(
        exc, (httpx.TransportError, ConnectionError, TimeoutError, socket.gaierror)
    ):
        return True
    # SDK transport errors (aiohttp, openai, anthropic) without importing them.
    return any(
        cls.__name__
        in ("ClientConnectionError", "ClientPayloadError", "APIConnectionError")
        for cls in type(exc).__mro__
    )


def classify_error(exc: BaseException) -> ErrorInfo:
    """Describe *exc* without any exception text, URL or key."""
    if isinstance(exc, MissingAPIKeyError):
        return _ERRORS["no_key"]
    if isinstance(exc, EngineContextLengthError):
        return _TOO_LONG
    status = _status_code(exc)
    if status is not None and status >= 400:
        if status in (401, 403):
            return _ERRORS["bad_key"]
        if status == 400:
            detail = str(exc).lower()
            if "api_key_invalid" in detail or "api key" in detail:
                return _ERRORS["bad_key"]
            return _REJECTED
        if status == 408:
            return _ERRORS["network"]
        if status == 429:
            return _ERRORS["quota"]
        if status in (500, 502, 503, 504, 529):
            return _ERRORS["busy"]
        if status < 500:
            return _REJECTED
        return _ERRORS["internal"]
    if _is_network_error(exc):
        return _ERRORS["network"]
    if isinstance(exc, EngineConnectionError):
        return _ERRORS["network"]
    return _ERRORS["internal"]


_SECRET_PATTERNS = (
    (re.compile(r"AIza[0-9A-Za-z_\-]{10,}"), "[redacted]"),
    (re.compile(r"\bsk-[0-9A-Za-z_\-]{8,}"), "[redacted]"),
    (
        re.compile(r"([?&](?:key|api_key|access_token)=)[^&\s'\"]+", re.I),
        r"\1[redacted]",
    ),
    (re.compile(r"(Bearer\s+)[0-9A-Za-z._\-]+", re.I), r"\1[redacted]"),
    (
        re.compile(
            r"((?:x-goog-api-key|x-api-key)['\"]?\s*[:=]\s*['\"]?)[^\s'\",}]+", re.I
        ),
        r"\1[redacted]",
    ),
)


def redact(text: str) -> str:
    """Remove API keys from *text* before it is logged."""
    secrets = {
        value
        for name, value in os.environ.items()
        if name.endswith("_API_KEY") and len(value) >= 6
    }
    stored_key = load_api_key()
    if len(stored_key) >= 6:
        secrets.add(stored_key)
    for secret in sorted(secrets, key=len, reverse=True):
        text = text.replace(secret, "[redacted]")
    for pattern, replacement in _SECRET_PATTERNS:
        text = pattern.sub(replacement, text)
    return text


def log_failure(log: logging.Logger, label: str, exc: BaseException) -> None:
    """Log the real error and traceback server-side, with keys removed."""
    detail = "".join(traceback.format_exception(type(exc), exc, exc.__traceback__))
    log.error("%s: %s", label, redact(detail))


__all__ = [
    "GEMINI_PARTS_KEY",
    "GOOGLE_BUSY_CODES",
    "GOOGLE_FALLBACK_MODEL",
    "ErrorInfo",
    "FileProcessingError",
    "GeminiEvent",
    "MissingAPIKeyError",
    "UploadedFile",
    "build_config",
    "build_contents",
    "chunk_finish_reason",
    "chunk_text",
    "classify_error",
    "close_client",
    "create_client",
    "error_info",
    "fallback_model",
    "load_api_key",
    "log_failure",
    "map_finish_reason",
    "open_stream",
    "read_env_file",
    "redact",
    "sniff_image_mime",
    "stream_text",
    "upload_file",
    "usage_from",
    "user_parts",
]
