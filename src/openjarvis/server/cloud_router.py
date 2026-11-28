"""Direct cloud API router — bypasses the engine system entirely.

Reads API keys from the process environment, with a legacy
~/.openjarvis/cloud-keys.env fallback for non-desktop/manual setups. Uses
httpx directly, except for Gemini, which goes through the shared SDK path in
``openjarvis.engine.google_common``.
"""

from __future__ import annotations

import json
import logging
import os
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any, Sequence

import httpx

from openjarvis.core.paths import get_config_dir
from openjarvis.core.types import Message

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Key / provider detection
# ---------------------------------------------------------------------------

_CLOUD_ENV_FILE = get_config_dir() / "cloud-keys.env"

_OPENAI_PREFIXES = ("gpt-", "o1-", "o3-", "o4-", "chatgpt-")
_ANTHROPIC_PREFIXES = ("claude-",)
_GOOGLE_PREFIXES = ("gemini-",)
_MINIMAX_PREFIXES = ("MiniMax-",)
# Atlas Cloud IDs are already "vendor/model", so they must be recognised by
# their routing prefix before the generic '"/" means OpenRouter' fallback
# below — otherwise "atlascloud/openai/gpt-4.1-mini" is sent to OpenRouter.
_ATLASCLOUD_PREFIX = "atlascloud/"

# HuggingFace orgs that host local-only quantised models — never route to cloud.
_LOCAL_HF_ORGS = (
    "mlx-community/",
    "bartowski/",
    "unsloth/",
    "lmstudio-community/",
)


def _load_keys() -> dict[str, str]:
    """Read available cloud keys every call so live updates are picked up."""
    from openjarvis.engine.google_common import read_env_file

    # File first, then fall back to process environment
    keys: dict[str, str] = read_env_file(_CLOUD_ENV_FILE)
    # Process env can override (e.g. during testing)
    for name in (
        "OPENAI_API_KEY",
        "ANTHROPIC_API_KEY",
        "GEMINI_API_KEY",
        "GOOGLE_API_KEY",
        "OPENROUTER_API_KEY",
        "MINIMAX_API_KEY",
        "ATLASCLOUD_API_KEY",
    ):
        val = os.environ.get(name)
        if val:
            keys[name] = val
    return keys


def _missing_key(name: str) -> ValueError:
    from openjarvis.engine.google_common import MissingAPIKeyError

    return MissingAPIKeyError(f"{name} not set — add it in the Cloud Models tab")


def get_provider(model: str) -> str | None:
    """Return the provider for a model name, or None if it's a local model."""
    # Bare GPT-OSS names and Ollama tags are local, despite the "gpt-" prefix.
    # Provider-qualified IDs (e.g. "openai/gpt-oss-20b") still route to cloud.
    if model == "gpt-oss" or model.startswith(("gpt-oss:", "gpt-oss-")):
        return None
    if any(model.startswith(p) for p in _OPENAI_PREFIXES):
        return "openai"
    if any(model.startswith(p) for p in _ANTHROPIC_PREFIXES):
        return "anthropic"
    if any(model.startswith(p) for p in _GOOGLE_PREFIXES):
        return "google"
    if any(model.startswith(p) for p in _MINIMAX_PREFIXES):
        return "minimax"
    if model.startswith(_ATLASCLOUD_PREFIX):
        return "atlascloud"
    if any(model.startswith(org) for org in _LOCAL_HF_ORGS):
        return None  # local model, never route to cloud
    if "/" in model:  # openrouter format: "meta-llama/llama-3-8b"
        return "openrouter"
    return None


def is_cloud_model(model: str) -> bool:
    """Return True if the model is served by a cloud provider."""
    return get_provider(model) is not None


def _openrouter_model_id(model: str) -> str:
    """Return the provider-facing ID for an OpenRouter model."""
    prefix = "openrouter/"
    candidate = model.removeprefix(prefix)
    # OpenRouter owns IDs such as "openrouter/auto" itself. Only remove the
    # LiteLLM routing prefix when the remainder is still a provider/model ID.
    if model.startswith(prefix) and "/" in candidate:
        return candidate
    return model


# ---------------------------------------------------------------------------
# Message conversion
# ---------------------------------------------------------------------------


def _to_openai_msgs(messages: Sequence[Message]) -> list[dict[str, Any]]:
    out = []
    for m in messages:
        role = m.role.value if hasattr(m.role, "value") else str(m.role)
        out.append({"role": role, "content": m.content or ""})
    return out


def _to_anthropic_msgs(
    messages: Sequence[Message],
) -> tuple[str, list[dict[str, Any]]]:
    """Return (system_text, chat_messages) in Anthropic format."""
    system_text = ""
    chat: list[dict[str, Any]] = []
    for m in messages:
        role = m.role.value if hasattr(m.role, "value") else str(m.role)
        if role == "system":
            system_text = m.content or ""
        else:
            # Anthropic only allows "user" and "assistant"
            ar = "user" if role != "assistant" else "assistant"
            chat.append({"role": ar, "content": m.content or ""})
    return system_text, chat


# ---------------------------------------------------------------------------
# Streaming generators
# ---------------------------------------------------------------------------


async def _stream_openai(
    model: str,
    messages: Sequence[Message],
    temperature: float,
    max_tokens: int,
    base_url: str = "https://api.openai.com/v1",
    api_key_name: str = "OPENAI_API_KEY",
) -> AsyncIterator[str]:
    keys = _load_keys()
    api_key = keys.get(api_key_name, "")
    if not api_key:
        raise _missing_key(api_key_name)

    payload = {
        "model": model,
        "messages": _to_openai_msgs(messages),
        "temperature": temperature,
        "max_tokens": max_tokens,
        "stream": True,
    }

    async with httpx.AsyncClient(timeout=180) as client:
        async with client.stream(
            "POST",
            f"{base_url}/chat/completions",
            json=payload,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
        ) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if not line.startswith("data: "):
                    continue
                data = line[6:].strip()
                if data == "[DONE]":
                    break
                try:
                    chunk = json.loads(data)
                    delta = chunk["choices"][0]["delta"].get("content") or ""
                    if delta:
                        yield delta
                except Exception:
                    pass


async def _stream_anthropic(
    model: str,
    messages: Sequence[Message],
    temperature: float,
    max_tokens: int,
) -> AsyncIterator[str]:
    keys = _load_keys()
    api_key = keys.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        raise _missing_key("ANTHROPIC_API_KEY")

    system_text, chat_msgs = _to_anthropic_msgs(messages)
    payload: dict[str, Any] = {
        "model": model,
        "messages": chat_msgs,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "stream": True,
    }
    if system_text:
        payload["system"] = system_text

    async with httpx.AsyncClient(timeout=180) as client:
        async with client.stream(
            "POST",
            "https://api.anthropic.com/v1/messages",
            json=payload,
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "Content-Type": "application/json",
            },
        ) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if not line.startswith("data: "):
                    continue
                data = line[6:].strip()
                try:
                    event = json.loads(data)
                    if event.get("type") == "content_block_delta":
                        text = event.get("delta", {}).get("text", "")
                        if text:
                            yield text
                except Exception:
                    pass


async def _stream_google(
    model: str,
    messages: Sequence[Message],
    temperature: float,
    max_tokens: int,
) -> AsyncIterator[str]:
    from openjarvis.engine import google_common

    async for event in google_common.stream_text(
        model,
        messages,
        temperature=temperature,
        max_tokens=max_tokens,
        idle_timeout=180,
    ):
        if event.text:
            yield event.text


# ---------------------------------------------------------------------------
# Local (Ollama) direct streaming — bypasses engine routing entirely
# ---------------------------------------------------------------------------


def _ollama_host() -> str:
    return os.environ.get("OLLAMA_HOST", "http://localhost:11434").rstrip("/")


@dataclass(frozen=True)
class LocalEvent:
    """A token from Ollama, or the final finish reason and usage."""

    text: str = ""
    finish_reason: str | None = None
    usage: dict[str, int] | None = None


async def stream_local_events(
    model: str,
    messages: Sequence[Message],
    temperature: float = 0.7,
    max_tokens: int = 1024,
    *,
    num_ctx: int | None = None,
    include_images: bool = False,
) -> AsyncIterator[LocalEvent]:
    """Stream from Ollama, ending with a finish reason (``stop`` or ``length``).

    Raises when Ollama reports an error or the stream ends before it is done.
    """
    chat = _to_openai_msgs(messages)
    if include_images:
        for entry, message in zip(chat, messages):
            if message.images:
                entry["images"] = list(message.images)
    options: dict[str, Any] = {
        "temperature": temperature,
        "num_predict": max_tokens,
    }
    if num_ctx is not None:
        options["num_ctx"] = num_ctx
    payload = {
        "model": model,
        "messages": chat,
        "stream": True,
        # Disable extended thinking (Qwen3.5 etc.) — when enabled all tokens
        # go into the 'thinking' field and 'content' stays empty.
        "think": False,
        "options": options,
    }
    host = _ollama_host()
    async with httpx.AsyncClient(timeout=300) as client:
        async with client.stream("POST", f"{host}/api/chat", json=payload) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if not line:
                    continue
                try:
                    data = json.loads(line)
                    token = data.get("message", {}).get("content", "")
                except (ValueError, AttributeError):
                    continue
                if data.get("error"):
                    raise RuntimeError(f"Ollama error: {data['error']}")
                if token:
                    yield LocalEvent(text=token)
                if data.get("done"):
                    prompt = data.get("prompt_eval_count") or 0
                    completion = data.get("eval_count") or 0
                    yield LocalEvent(
                        finish_reason=(
                            "length" if data.get("done_reason") == "length" else "stop"
                        ),
                        usage={
                            "prompt_tokens": prompt,
                            "completion_tokens": completion,
                            "total_tokens": prompt + completion,
                        },
                    )
                    return
    raise ConnectionError("Ollama stream ended before the reply was complete")


async def stream_local(
    model: str,
    messages: Sequence[Message],
    temperature: float = 0.7,
    max_tokens: int = 1024,
) -> AsyncIterator[str]:
    """Stream tokens directly from Ollama, bypassing the engine system."""
    async for event in stream_local_events(model, messages, temperature, max_tokens):
        if event.text:
            yield event.text


async def local_model_supports_images(model: str) -> bool:
    """Whether Ollama reports that *model* can see images (False if unknown)."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                f"{_ollama_host()}/api/show", json={"model": model}
            )
            resp.raise_for_status()
            return "vision" in (resp.json().get("capabilities") or [])
    except Exception:
        logger.debug("Could not read capabilities of local model %s", model)
        return False


async def list_local_models() -> list[str]:
    """Return Ollama model names directly from the Ollama API."""
    host = _ollama_host()
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(f"{host}/api/tags")
            resp.raise_for_status()
            data = resp.json()
            return [m["name"] for m in data.get("models", [])]
    except Exception:
        return []


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------


async def stream_cloud(
    model: str,
    messages: Sequence[Message],
    temperature: float = 0.7,
    max_tokens: int = 1024,
) -> AsyncIterator[str]:
    """Stream tokens from a cloud provider for the given model."""
    provider = get_provider(model)

    if provider == "openai":
        async for token in _stream_openai(model, messages, temperature, max_tokens):
            yield token

    elif provider == "anthropic":
        async for token in _stream_anthropic(model, messages, temperature, max_tokens):
            yield token

    elif provider == "google":
        async for token in _stream_google(model, messages, temperature, max_tokens):
            yield token

    elif provider == "openrouter":
        keys = _load_keys()
        api_key = keys.get("OPENROUTER_API_KEY", "")
        if not api_key:
            raise _missing_key("OPENROUTER_API_KEY")
        async for token in _stream_openai(
            _openrouter_model_id(model),
            messages,
            temperature,
            max_tokens,
            base_url="https://openrouter.ai/api/v1",
            api_key_name="OPENROUTER_API_KEY",
        ):
            yield token

    elif provider == "atlascloud":
        keys = _load_keys()
        api_key = keys.get("ATLASCLOUD_API_KEY", "")
        if not api_key:
            raise _missing_key("ATLASCLOUD_API_KEY")
        async for token in _stream_openai(
            model.removeprefix(_ATLASCLOUD_PREFIX),
            messages,
            temperature,
            max_tokens,
            base_url="https://api.atlascloud.ai/v1",
            api_key_name="ATLASCLOUD_API_KEY",
        ):
            yield token

    elif provider == "minimax":
        keys = _load_keys()
        api_key = keys.get("MINIMAX_API_KEY", "")
        if not api_key:
            raise _missing_key("MINIMAX_API_KEY")
        async for token in _stream_openai(
            model,
            messages,
            temperature,
            max_tokens,
            base_url="https://api.minimax.io/v1",
            api_key_name="MINIMAX_API_KEY",
        ):
            yield token

    else:
        raise ValueError(f"Unknown cloud provider for model: {model!r}")
