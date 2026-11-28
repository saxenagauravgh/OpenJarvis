"""The tutor's direct, streaming chat endpoint and its file uploads.

``POST /v1/tutor/attachments`` stores a document or image; user turns of
``POST /v1/tutor/chat`` then name it by id in ``files``.


It talks to the model itself (no server agent) and streams server-sent events:

``meta``       ``{"model", "provider": "gemini"|"local"}``
``searching``  ``{"query"}``
``sources``    ``{"items": [{"title", "url"}]}``, numbered as they are cited
``team``       ``{"member": "physics"|"chemistry"|"maths"|"solver"|"checker",
               "label", "status": "working"|"done"|"failed"}``
``action``     ``{"setting", "value"}`` (a settings change to confirm)
``delta``      ``{"text"}``
``notice``     ``{"code": "fallback_model"|"fallback_local"|"attachment_missing"|
               "search_failed"|"team_unavailable", "message"}``
``done``       ``{"finish_reason": "stop"|"length"|"blocked", "usage"}``
``error``      ``{"code", "message", "retryable"}``

Every stream ends with exactly one ``done`` or ``error``. A different model is
only tried before the first ``delta``, and is announced with a ``notice``
followed by a new ``meta``. The persona comes from the server alone.

``webSearch`` is ``"auto"`` (default: a Gemini model may ask for one search,
after which it answers again), ``"always"`` (the latest typed question is
searched first) or ``"off"``. A reply that has web text in its instructions
declares no functions. ``team: true`` has experts draft the answer and a lead
checker write it; both need a Gemini model.
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
from functools import partial
from typing import Any, List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from starlette.datastructures import UploadFile

from openjarvis.core.config import DEFAULT_CONFIG_DIR
from openjarvis.core.events import EventType
from openjarvis.core.types import (
    TOKEN_COUNTING_VERSION,
    Message,
    Role,
    TelemetryRecord,
)
from openjarvis.engine import google_common
from openjarvis.server import (
    attachments,
    cloud_router,
    tutor_attachments,
    tutor_search,
    tutor_settings,
    tutor_team,
)
from openjarvis.server.origin import require_trusted_origin
from openjarvis.server.routes import (
    _ensure_identity_prompt,
    _record_completed_exchange,
    _uses_direct_cloud_router,
)
from openjarvis.server.tutor_knowledge import (
    add_to_system,
    select_notes,
    uploaded_excerpts,
)

logger = logging.getLogger("openjarvis.server.tutor")

router = APIRouter(prefix="/v1/tutor", tags=["tutor"])

TUTOR_TEMPERATURE = 0.3
TUTOR_MAX_OUTPUT_TOKENS = 8192
LOCAL_FALLBACK_MODEL = "qwen2.5:3b"
# Longest wait for the next piece of a Gemini reply (thinking included).
GEMINI_IDLE_TIMEOUT_SECONDS = 120.0

# Room for the multipart boundaries and fields around an uploaded file.
_FORM_OVERHEAD_BYTES = 64 * 1024
_UPLOAD_STATUS = {"too_large": 413, "unsupported": 415, "empty": 400, "unreadable": 422}

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

_SEARCH_FAILED = (
    "The web search did not work this time, so this answer does not use the web."
)
_SEARCH_EMPTY = (
    "The web search found nothing to use, so this answer does not use the web."
)
_NO_QUERY = "There was nothing to search the web for."
_TEAM_NEEDS_GEMINI = (
    "The expert team needs a Gemini model, so the tutor is answering on its own."
)
_TEAM_FAILED = (
    "The expert team could not answer this time, so the tutor is answering on its own."
)


class TutorMessage(BaseModel):
    role: str
    content: str = ""
    images: Optional[List[str]] = None
    #: Ids returned by ``POST /v1/tutor/attachments``.
    files: Optional[List[str]] = None


class TutorChatRequest(BaseModel):
    model: str
    messages: List[TutorMessage]
    # Deliberately untyped: only a literal JSON ``true`` confirms.
    adultConfirmed: Any = False
    webSearch: Literal["auto", "always", "off"] = "auto"
    team: bool = False


@dataclass(frozen=True)
class _Options:
    web_search: str = "off"  # "auto" | "always" | "off"
    team: bool = False
    #: What the learner typed, oldest first, without anything the server added.
    typed: tuple[str, ...] = ()


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


def _notice(code: str, message: str) -> str:
    return _sse("notice", {"code": code, "message": message})


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
            if content.strip() or images or turn.files:
                messages.append(
                    Message(
                        role=Role.USER,
                        content=content,
                        images=images or None,
                        metadata={"files": turn.files} if turn.files else {},
                    )
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
    return add_to_system(messages, notes) if notes else messages


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
    candidate: _Candidate,
    messages: list[Message],
    sees_images: bool,
    functions: list[dict[str, Any]],
) -> AsyncIterator[Any]:
    """Events (``text`` / ``finish_reason`` / ``usage``) from one model.

    A Gemini model may also ``call`` one of *functions*.
    """
    if candidate.provider == "gemini":
        attempt = _gemini_attempt(candidate.model, messages, functions)
        async with aclosing(attempt) as events:
            async for event in events:
                yield event
        return

    from openjarvis.engine.ollama import _default_num_ctx

    prepared = await asyncio.to_thread(tutor_attachments.for_local, messages)
    events = cloud_router.stream_local_events(
        candidate.model,
        prepared if sees_images else _without_images(prepared),
        TUTOR_TEMPERATURE,
        TUTOR_MAX_OUTPUT_TOKENS,
        num_ctx=_default_num_ctx(),
        include_images=sees_images,
    )
    async with aclosing(events):
        async for event in events:
            yield event


async def _gemini_attempt(
    model: str,
    messages: list[Message],
    functions: list[dict[str, Any]],
    *,
    allow_fallback: bool = False,
) -> AsyncIterator[Any]:
    """Stream from Gemini, uploading again once if a cached file was refused."""
    for retried in (False, True):
        prepared, reused = messages, []
        api_key = google_common.load_api_key()
        # Without a key, stream_text reports that; nothing is uploaded.
        if api_key:
            prepared, reused = await tutor_attachments.for_gemini(messages, api_key)
        events = google_common.stream_text(
            model,
            prepared,
            temperature=TUTOR_TEMPERATURE,
            max_tokens=TUTOR_MAX_OUTPUT_TOKENS,
            allow_fallback=allow_fallback,
            idle_timeout=GEMINI_IDLE_TIMEOUT_SECONDS,
            functions=functions,
        )
        started = False
        try:
            async with aclosing(events):
                async for event in events:
                    started = True
                    yield event
            return
        except Exception as exc:
            stale = reused and getattr(exc, "code", None) in (400, 403, 404)
            if retried or started or not stale:
                raise
            logger.warning("Gemini refused a cached file; uploading it again")
            await asyncio.to_thread(tutor_attachments.forget_uploads, reused)


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


async def _search(query: str) -> tuple[list[str], str, bool]:
    """Events to send, text for the instructions, and whether it holds web text."""
    try:
        if not query:
            return (
                [_notice("search_failed", _NO_QUERY)],
                tutor_search.UNAVAILABLE,
                False,
            )
        results = await tutor_search.search(query)
        problem = _SEARCH_EMPTY
    except Exception as exc:  # noqa: BLE001 — the tutor answers without it
        logger.warning("Tutor web search failed: %s", type(exc).__name__)
        results, problem = [], _SEARCH_FAILED
    if not results:
        return [_notice("search_failed", problem)], tutor_search.UNAVAILABLE, False
    shown = _sse("sources", {"items": tutor_search.sources(results)})
    return [shown], tutor_search.reference_block(results), True


def _continuation(said: str) -> str:
    """Keeps the second reply from repeating what was said before the search."""
    return (
        "## Your reply so far\n"
        "The learner has already been shown the text between the marks. Continue "
        "straight after it without repeating or restarting it.\n"
        f"<<<already shown>>>\n{said}\n<<<end of already shown>>>"
    )


async def _prepare_uploads(messages: list[Message]) -> None:
    """Upload large files once, before several experts ask for them at once."""
    if not any(m.metadata.get("attachments") for m in messages):
        return
    try:
        api_key = google_common.load_api_key()
        if api_key:
            await tutor_attachments.for_gemini(messages, api_key)
    except Exception as exc:  # each expert will meet and report the same problem
        google_common.log_failure(logger, "Could not prepare files for the team", exc)


async def _tutor_events(
    model: str,
    messages: list[Message],
    query: str,
    state: Any,
    options: _Options,
) -> AsyncIterator[str]:
    started_at = time.time()
    chain, unsupported = await asyncio.to_thread(
        _candidates, model, getattr(state, "engine", None)
    )
    messages = await asyncio.to_thread(tutor_attachments.resolve, messages)
    if tutor_attachments.has_missing(messages):
        yield _sse(
            "notice",
            {
                "code": "attachment_missing",
                "message": tutor_attachments.MISSING_MESSAGE,
            },
        )
    has_images = any(m.images for m in messages) or tutor_attachments.has_images(
        messages
    )
    primary_error: Optional[google_common.ErrorInfo] = None
    index = 0
    # Why the next candidate differs from what was asked for, if it does.
    switch_reason: Optional[str] = (
        "The tutor works with Gemini and offline models only." if unsupported else None
    )
    search_first = options.web_search == "always"
    may_search = options.web_search == "auto"
    # Set once web text is in the instructions, or the model's search is used up.
    no_functions = False
    team_wanted = options.team
    # While the checker is answering: the messages without the experts' drafts.
    unchecked: Optional[list[Message]] = None
    team_usage = dict(_ZERO_USAGE)

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
            announcement = [_notice(code, notice), _meta_event(candidate)]
            # A switch is announced before its meta. A directly selected model
            # that merely cannot see images states its meta first.
            if switch_reason is None:
                announcement.reverse()
            for line in announcement:
                yield line
        else:
            yield _meta_event(candidate)

        if search_first:
            search_first = False
            typed = options.typed[-1] if options.typed else ""
            typed_query = tutor_search.clean_query(typed)
            if typed_query:
                yield _sse("searching", {"query": typed_query})
            lines, reference, found = await _search(typed_query)
            for line in lines:
                yield line
            messages = add_to_system(messages, reference)
            no_functions = found

        if team_wanted:
            team_wanted = False
            if candidate.provider != "gemini":
                yield _notice("team_unavailable", _TEAM_NEEDS_GEMINI)
            else:
                await _prepare_uploads(messages)
                panel = tutor_team.Panel(
                    tutor_team.members_for(options.typed),
                    messages,
                    partial(
                        _gemini_attempt,
                        candidate.model,
                        functions=[],
                        allow_fallback=True,
                    ),
                )
                async with aclosing(panel.run()) as statuses:
                    async for status in statuses:
                        yield _sse("team", status)
                team_usage = panel.usage
                if panel.drafts:
                    unchecked = messages
                    messages = tutor_team.for_checker(messages, panel.drafts)
                else:
                    yield _notice("team_unavailable", _TEAM_FAILED)

        if unchecked is not None and candidate.provider != "gemini":
            # The offline model cannot hold the drafts; it answers by itself.
            messages, unchecked = unchecked, None
            yield _notice("team_unavailable", _TEAM_FAILED)
        checking = unchecked is not None
        if checking:
            yield _sse("team", tutor_team.status(tutor_team.CHECKER, "working"))

        answer: list[str] = []
        finish_reason = "stop"
        usage = dict(team_usage)
        first_token_at = 0.0
        try:
            while True:
                functions: list[dict[str, Any]] = []
                if candidate.provider == "gemini" and not (checking or no_functions):
                    functions.append(tutor_settings.declaration())
                    if may_search:
                        functions.append(tutor_search.declaration())
                declared = {f["name"] for f in functions}
                wanted: Optional[str] = None
                finish_reason = "stop"
                pass_usage = dict(_ZERO_USAGE)
                # Text from before a search is set apart from what follows it.
                gap = "\n\n" if answer else ""
                attempt = _attempt(candidate, messages, sees_images, functions)
                async with aclosing(attempt) as events:
                    async for event in events:
                        call = getattr(event, "call", None)
                        name = call["name"] if call else None
                        if name not in declared:
                            name = None
                        if name == tutor_settings.TOOL_NAME:
                            action = tutor_settings.validate(call["args"])
                            if action:
                                yield _sse("action", action)
                            spoken = tutor_settings.reply_for(action)
                            if answer:
                                spoken = f"\n\n{spoken}"
                            answer.append(spoken)
                            yield _sse("delta", {"text": spoken})
                        elif name == tutor_search.TOOL_NAME and wanted is None:
                            wanted = tutor_search.clean_query(call["args"].get("query"))
                        if event.text:
                            if checking and not answer:
                                yield _sse(
                                    "team",
                                    tutor_team.status(tutor_team.CHECKER, "done"),
                                )
                            if not answer:
                                first_token_at = time.time()
                            text, gap = gap + event.text, ""
                            answer.append(text)
                            yield _sse("delta", {"text": text})
                        if event.finish_reason:
                            finish_reason = event.finish_reason
                        if event.usage:
                            pass_usage = event.usage
                usage = {key: usage[key] + pass_usage.get(key, 0) for key in usage}
                if wanted is None or finish_reason == "blocked":
                    break
                may_search = False
                no_functions = True
                if wanted:
                    yield _sse("searching", {"query": wanted})
                lines, reference, _ = await _search(wanted)
                for line in lines:
                    yield line
                messages = add_to_system(messages, reference)
                if answer:
                    messages = add_to_system(messages, _continuation("".join(answer)))
        except Exception as exc:
            google_common.log_failure(
                logger, f"Tutor reply from {candidate.model} failed", exc
            )
            info = (
                _local_error(candidate.model, exc)
                if candidate.provider == "local"
                else google_common.classify_error(exc)
            )
            if checking and not answer:
                yield _sse("team", tutor_team.status(tutor_team.CHECKER, "failed"))
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

        if checking and not answer:
            yield _sse("team", tutor_team.status(tutor_team.CHECKER, "failed"))
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


def _upload_error(status: int, code: str, message: str) -> HTTPException:
    return HTTPException(status_code=status, detail={"code": code, "message": message})


def _refusal(error: attachments.AttachmentError) -> HTTPException:
    return _upload_error(_UPLOAD_STATUS[error.code], error.code, error.message)


class _BodyTooLarge(Exception):
    pass


def _capped_request(request: Request, limit: int) -> Request:
    """The same request, failing as soon as its body grows past *limit*."""
    received = 0

    async def receive() -> Any:
        nonlocal received
        message = await request.receive()
        received += len(message.get("body", b""))
        if received > limit:
            raise _BodyTooLarge
        return message

    return Request(request.scope, receive)


@router.post("/attachments", dependencies=[Depends(require_trusted_origin)])
async def upload_attachment(request: Request) -> dict[str, Any]:
    """Store a file (multipart ``file`` and ``adultConfirmed``) for the tutor."""
    # The form is read here, not by FastAPI, so that an untrusted or oversized
    # request is refused before its body is written to disk.
    limit = attachments.MAX_FILE_BYTES + _FORM_OVERHEAD_BYTES
    declared = request.headers.get("content-length", "")
    if declared.isdigit() and int(declared) > limit:
        raise _refusal(attachments.too_large())
    unreadable = _upload_error(
        422, "unreadable", "The upload could not be read. Please try again."
    )
    try:
        form = await _capped_request(request, limit).form(max_files=1, max_fields=4)
    except _BodyTooLarge:
        raise _refusal(attachments.too_large()) from None
    except Exception as exc:
        logger.warning("Could not read an upload: %s", type(exc).__name__)
        raise unreadable from None
    try:
        if form.get("adultConfirmed") != "true":
            raise _upload_error(
                403,
                "age_unconfirmed",
                "Please confirm that you are 18 or older to use the tutor.",
            )
        upload = form.get("file")
        if not isinstance(upload, UploadFile):
            raise _upload_error(400, "empty", "Choose a file to attach.")
        try:
            stored = await asyncio.to_thread(
                attachments.save, upload.file, upload.filename
            )
        except attachments.AttachmentError as exc:
            raise _refusal(exc) from None
        except Exception as exc:
            google_common.log_failure(logger, "Could not store an upload", exc)
            raise _upload_error(
                422,
                "unreadable",
                "The file could not be saved. Check the free space on this "
                "computer and try again.",
            ) from None
        return stored.public()
    finally:
        await form.close()


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
    options = _Options(
        web_search=body.webSearch,
        team=body.team,
        typed=tuple(
            turn.content.strip()
            for turn in body.messages
            if turn.role == "user" and turn.content.strip()
        ),
    )
    model = body.model.strip() or getattr(state, "model", "") or LOCAL_FALLBACK_MODEL
    messages = _ensure_identity_prompt(messages, getattr(state, "config", None))
    messages = _with_reference_notes(messages)

    return StreamingResponse(
        _guarded(_tutor_events(model, messages, query, state, options)),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )


__all__ = ["router"]
