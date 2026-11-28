"""``POST /v1/tutor/chat`` — the tutor's direct, streaming chat endpoint.

It talks to the model itself (no server agent, no tools) and streams
server-sent events:

``meta``    ``{"model", "provider": "gemini"|"local"}``
``delta``   ``{"text"}``
``notice``  ``{"code": "fallback_model"|"fallback_local", "message"}``
``done``    ``{"finish_reason": "stop"|"length"|"blocked", "usage"}``
``error``   ``{"code", "message", "retryable"}``

Every stream ends with exactly one ``done`` or ``error``. A different model is
only tried before the first ``delta``, and is announced with a ``notice``
followed by a new ``meta``. The persona comes from the server alone.
"""

from __future__ import annotations

import asyncio
import base64
import binascii
import json
import logging
import time
from collections.abc import AsyncIterator
from contextlib import aclosing
from dataclasses import dataclass, replace
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from openjarvis.core.config import DEFAULT_CONFIG_DIR
from openjarvis.core.events import EventType
from openjarvis.core.types import (
    TOKEN_COUNTING_VERSION,
    Message,
    Role,
    TelemetryRecord,
)
from openjarvis.engine import google_common
from openjarvis.server import cloud_router
from openjarvis.server.origin import require_trusted_origin
from openjarvis.server.routes import (
    _ensure_identity_prompt,
    _record_completed_exchange,
    _uses_direct_cloud_router,
)
from openjarvis.server.tutor_knowledge import select_notes, uploaded_excerpts

logger = logging.getLogger("openjarvis.server.tutor")

router = APIRouter(prefix="/v1/tutor", tags=["tutor"])

TUTOR_TEMPERATURE = 0.3
TUTOR_MAX_OUTPUT_TOKENS = 8192
LOCAL_FALLBACK_MODEL = "qwen2.5:3b"
# Longest wait for the next piece of a Gemini reply (thinking included).
GEMINI_IDLE_TIMEOUT_SECONDS = 120.0

_ZERO_USAGE = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}

_REASONS = {
    "no_key": "no Gemini API key is set up",
    "bad_key": "the Gemini API key was rejected",
    "quota": "the usage limit was reached",
    "busy": "it is busy",
    "network": "it could not be reached",
    "internal": "it returned an error",
}
# Another Gemini model cannot succeed after these.
_SKIP_TO_LOCAL = ("no_key", "bad_key", "network")


class TutorMessage(BaseModel):
    role: str
    content: str = ""
    images: Optional[List[str]] = None


class TutorChatRequest(BaseModel):
    model: str
    messages: List[TutorMessage]
    # Deliberately untyped: only a literal JSON ``true`` confirms.
    adultConfirmed: Any = False


@dataclass(frozen=True)
class _Candidate:
    model: str
    provider: str  # "gemini" | "local"


def _sse(event: str, data: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


def _error_event(info: google_common.ErrorInfo) -> str:
    return _sse(
        "error",
        {"code": info.code, "message": info.message, "retryable": info.retryable},
    )


def _meta_event(candidate: _Candidate) -> str:
    return _sse("meta", {"model": candidate.model, "provider": candidate.provider})


def _clean_images(images: list[str]) -> tuple[list[str], int]:
    """Split images into usable base64 strings and a count of unreadable ones."""
    usable: list[str] = []
    unreadable = 0
    for image in images:
        if image.startswith("data:") and "," in image:
            image = image.split(",", 1)[1]
        try:
            if not base64.b64decode(image, validate=True):
                raise ValueError("empty image")
        except (binascii.Error, ValueError):
            unreadable += 1
            continue
        usable.append(image)
    return usable, unreadable


def _conversation(turns: list[TutorMessage]) -> list[Message]:
    """User and assistant turns only; client system messages are dropped."""
    messages: list[Message] = []
    for turn in turns:
        if turn.role == "user":
            images, unreadable = _clean_images(turn.images or [])
            content = turn.content
            if unreadable:
                content += (
                    f"\n\n[{unreadable} attached image(s) could not be read. Tell "
                    "the learner and do not guess what they show.]"
                )
            if content.strip() or images:
                messages.append(
                    Message(role=Role.USER, content=content, images=images or None)
                )
        elif turn.role == "assistant" and turn.content.strip():
            messages.append(Message(role=Role.ASSISTANT, content=turn.content))
    return messages


def _with_reference_notes(messages: list[Message]) -> list[Message]:
    """Append the relevant subject and teaching notes to the system prompt."""
    questions = [m.text for m in messages if m.role == Role.USER and m.text]
    parts: list[str] = []
    try:
        parts.append(select_notes(questions))
    except Exception:
        logger.warning("Could not add tutor reference notes", exc_info=True)
    try:
        if questions:
            parts.append(
                uploaded_excerpts(questions[-1], DEFAULT_CONFIG_DIR / "knowledge.db")
            )
    except Exception:
        logger.warning("Could not search the uploaded documents", exc_info=True)
    notes = "\n\n".join(part for part in parts if part)
    if not notes:
        return messages
    if messages and messages[0].role == Role.SYSTEM:
        combined = f"{messages[0].text}\n\n{notes}"
        return [replace(messages[0], content=combined), *messages[1:]]
    return [Message(role=Role.SYSTEM, content=notes), *messages]


def _without_images(messages: list[Message]) -> list[Message]:
    """Tell a text-only model about the images it is not being shown."""
    result: list[Message] = []
    for message in messages:
        if message.images:
            note = (
                f"[The learner attached {len(message.images)} image(s). You cannot "
                "see images. Say so plainly, do not guess or invent what they show, "
                "and ask the learner to type out the question.]"
            )
            content = f"{message.text}\n\n{note}" if message.text else note
            message = replace(message, content=content, images=None)
        result.append(message)
    return result


def _candidates(model: str, engine: Any) -> tuple[list[_Candidate], bool]:
    """Models to try in order, and whether the requested one is unsupported."""
    local_fallback = _Candidate(LOCAL_FALLBACK_MODEL, "local")
    provider = cloud_router.get_provider(model)
    if provider != "google":
        # A local server may list IDs that look like cloud ones ("org/model").
        if provider is None or not _uses_direct_cloud_router(engine, model):
            return [_Candidate(model, "local")], False
        return [local_fallback], True
    chain = [_Candidate(model, "gemini")]
    if model != google_common.GOOGLE_FALLBACK_MODEL:
        chain.append(_Candidate(google_common.GOOGLE_FALLBACK_MODEL, "gemini"))
    chain.append(local_fallback)
    return chain, False


def _local_error(model: str, exc: BaseException) -> google_common.ErrorInfo:
    if getattr(getattr(exc, "response", None), "status_code", None) == 404:
        return google_common.ErrorInfo(
            "internal",
            f"The offline model {model} is not installed on this computer.",
            False,
        )
    info = google_common.classify_error(exc)
    if info.code == "network":
        return replace(
            info,
            message=(
                "Could not reach the offline model on this computer. Make sure "
                "Ollama is running, then try again."
            ),
        )
    # Ollama needs no API key, so key and quota errors do not apply to it.
    if info.code in ("no_key", "bad_key", "quota"):
        return google_common.error_info("internal")
    return info


async def _attempt(
    candidate: _Candidate, messages: list[Message], sees_images: bool
) -> AsyncIterator[Any]:
    """Events (``text`` / ``finish_reason`` / ``usage``) from one model."""
    if candidate.provider == "gemini":
        events = google_common.stream_text(
            candidate.model,
            messages,
            temperature=TUTOR_TEMPERATURE,
            max_tokens=TUTOR_MAX_OUTPUT_TOKENS,
            allow_fallback=False,
            idle_timeout=GEMINI_IDLE_TIMEOUT_SECONDS,
        )
    else:
        from openjarvis.engine.ollama import _default_num_ctx

        events = cloud_router.stream_local_events(
            candidate.model,
            messages if sees_images else _without_images(messages),
            TUTOR_TEMPERATURE,
            TUTOR_MAX_OUTPUT_TOKENS,
            num_ctx=_default_num_ctx(),
            include_images=sees_images,
        )
    async with aclosing(events):
        async for event in events:
            yield event


def _record(
    state: Any,
    *,
    candidate: _Candidate,
    query: str,
    answer: str,
    usage: dict[str, int],
    started_at: float,
    first_token_at: float,
) -> None:
    """Best-effort trace, telemetry and memory; never affects the reply."""
    ended_at = time.time()
    engine = "cloud" if candidate.provider == "gemini" else "ollama"
    try:
        from openjarvis.traces.collector import record_response_trace

        record_response_trace(
            getattr(state, "trace_store", None),
            query=query,
            result=answer,
            model=candidate.model,
            engine=engine,
            agent="tutor",
            started_at=started_at,
            ended_at=ended_at,
        )
    except Exception:  # noqa: BLE001
        logger.debug("Tutor trace failed", exc_info=True)

    bus = getattr(state, "bus", None)
    if bus is not None:
        try:
            from openjarvis.engine.cloud import estimate_cost

            latency = ended_at - started_at
            record = TelemetryRecord(
                timestamp=started_at,
                model_id=candidate.model,
                engine=engine,
                prompt_tokens=usage["prompt_tokens"],
                prompt_tokens_evaluated=usage["prompt_tokens"],
                completion_tokens=usage["completion_tokens"],
                total_tokens=usage["total_tokens"],
                latency_seconds=latency,
                ttft=max(0.0, first_token_at - started_at),
                throughput_tok_per_sec=(
                    usage["completion_tokens"] / latency if latency > 0 else 0.0
                ),
                cost_usd=(
                    estimate_cost(
                        candidate.model,
                        usage["prompt_tokens"],
                        usage["completion_tokens"],
                    )
                    if engine == "cloud"
                    else 0.0
                ),
                is_streaming=True,
                token_counting_version=TOKEN_COUNTING_VERSION,
            )
            bus.publish(EventType.TELEMETRY_RECORD, {"record": record})
        except Exception:  # noqa: BLE001
            logger.debug("Tutor telemetry failed", exc_info=True)

    _record_completed_exchange(
        getattr(state, "memory_service", None),
        query,
        answer,
        bus=bus,
        source="server.tutor",
    )


async def _tutor_events(
    model: str, messages: list[Message], query: str, state: Any
) -> AsyncIterator[str]:
    started_at = time.time()
    chain, unsupported = await asyncio.to_thread(
        _candidates, model, getattr(state, "engine", None)
    )
    has_images = any(message.images for message in messages)
    primary_error: Optional[google_common.ErrorInfo] = None
    index = 0
    # Why the next candidate differs from what was asked for, if it does.
    switch_reason: Optional[str] = (
        "The tutor works with Gemini and offline models only." if unsupported else None
    )

    while True:
        candidate = chain[index]
        sees_images = True
        if candidate.provider == "local":
            sees_images = not has_images or (
                await cloud_router.local_model_supports_images(candidate.model)
            )
        blind = has_images and not sees_images
        if switch_reason is not None or blind:
            if candidate.provider == "gemini":
                code = "fallback_model"
                notice = f"{switch_reason} Trying {candidate.model} instead."
            else:
                code = "fallback_local"
                notice = (
                    f"Answering with the offline model {candidate.model} on this "
                    "computer. It is less accurate, so check the working carefully."
                )
                if switch_reason is not None:
                    notice = f"{switch_reason} {notice}"
                if blind:
                    notice += (
                        " It cannot see your attached image(s), so please type out "
                        "the question."
                    )
            announcement = [
                _sse("notice", {"code": code, "message": notice}),
                _meta_event(candidate),
            ]
            # A switch is announced before its meta. A directly selected model
            # that merely cannot see images states its meta first.
            if switch_reason is None:
                announcement.reverse()
            for line in announcement:
                yield line
        else:
            yield _meta_event(candidate)

        answer: list[str] = []
        finish_reason = "stop"
        usage = dict(_ZERO_USAGE)
        first_token_at = 0.0
        try:
            async with aclosing(_attempt(candidate, messages, sees_images)) as events:
                async for event in events:
                    if event.text:
                        if not answer:
                            first_token_at = time.time()
                        answer.append(event.text)
                        yield _sse("delta", {"text": event.text})
                    if event.finish_reason:
                        finish_reason = event.finish_reason
                    if event.usage:
                        usage = event.usage
        except Exception as exc:
            google_common.log_failure(
                logger, f"Tutor reply from {candidate.model} failed", exc
            )
            info = (
                _local_error(candidate.model, exc)
                if candidate.provider == "local"
                else google_common.classify_error(exc)
            )
            if answer:
                yield _error_event(info)
                return
            next_index = index + 1
            if candidate.provider == "gemini" and info.code in _SKIP_TO_LOCAL:
                next_index = len(chain) - 1
            if next_index >= len(chain):
                if primary_error is not None:
                    # Report why the requested model failed; it is actionable.
                    info = replace(
                        primary_error,
                        message=(
                            f"{primary_error.message} The offline model on this "
                            "computer could not answer either."
                        ),
                    )
                yield _error_event(info)
                return
            if primary_error is None:
                primary_error = info
            switch_reason = (
                f"{candidate.model} could not answer because {_REASONS[info.code]}."
            )
            index = next_index
            continue

        if not answer and finish_reason != "blocked":
            logger.warning("Tutor reply from %s was empty", candidate.model)
            yield _error_event(
                google_common.ErrorInfo(
                    "internal",
                    "The model returned an empty reply. Please try again.",
                    True,
                )
            )
            return
        if answer:
            try:
                await asyncio.to_thread(
                    _record,
                    state,
                    candidate=candidate,
                    query=query,
                    answer="".join(answer),
                    usage=usage,
                    started_at=started_at,
                    first_token_at=first_token_at,
                )
            except Exception:  # noqa: BLE001 — bookkeeping never breaks a reply
                logger.debug("Tutor bookkeeping failed", exc_info=True)
        yield _sse("done", {"finish_reason": finish_reason, "usage": usage})
        return


async def _guarded(events: AsyncIterator[str]) -> AsyncIterator[str]:
    """Close the stream with an ``error`` event if anything unexpected fails."""
    try:
        async with aclosing(events):
            async for event in events:
                yield event
    except Exception as exc:
        google_common.log_failure(logger, "Tutor stream failed", exc)
        yield _error_event(google_common.error_info("internal"))


@router.post("/chat", dependencies=[Depends(require_trusted_origin)])
async def tutor_chat(body: TutorChatRequest, request: Request):
    """Stream a tutor reply as server-sent events."""
    if body.adultConfirmed is not True:
        raise HTTPException(
            status_code=403,
            detail={
                "code": "age_unconfirmed",
                "message": "Please confirm that you are 18 or older to use the tutor.",
            },
        )
    messages = _conversation(body.messages)
    if not any(message.role == Role.USER for message in messages):
        raise HTTPException(
            status_code=400,
            detail={"code": "empty_messages", "message": "Ask a question first."},
        )
    query = next(
        (m.text for m in reversed(messages) if m.role == Role.USER and m.text), ""
    )
    state = request.app.state
    model = body.model.strip() or getattr(state, "model", "") or LOCAL_FALLBACK_MODEL
    messages = _ensure_identity_prompt(messages, getattr(state, "config", None))
    messages = _with_reference_notes(messages)

    return StreamingResponse(
        _guarded(_tutor_events(model, messages, query, state)),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )


__all__ = ["router"]
