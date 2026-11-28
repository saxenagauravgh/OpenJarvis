"""The few app settings the tutor may ask to change, with the user's consent.

The model can only *propose* a change from this list. The app shows it and
applies it after the user presses Apply. Nothing else (keys, the 18+ check,
files, commands) is reachable from here.
"""

from __future__ import annotations

from typing import Any, Mapping, Optional

TOOL_NAME = "change_app_setting"

CHOICES: dict[str, tuple[str, ...]] = {
    "theme": ("light", "dark", "system", "hud"),
    "font_size": ("small", "default", "large"),
    "model": (
        "gemini-2.5-flash",
        "gemini-3.5-flash-lite",
        "gemini-3.8-flash",
        "qwen2.5:3b",
    ),
}
SPEED_RANGE = (0.7, 1.4)

_LABELS = {
    "theme": "the theme",
    "font_size": "the text size",
    "voice_speed": "the speaking speed",
    "model": "the AI model",
}


def declaration() -> dict[str, Any]:
    """The Gemini function declaration for proposing a settings change."""
    return {
        "name": TOOL_NAME,
        "description": (
            "Propose a change to this app's own settings when the user asks for "
            "it. theme: light, dark, system or hud (the blue sci-fi look). "
            "font_size: small, default or large. voice_speed: a number from "
            "0.7 (slow) to 1.4 (fast), 1.0 is normal. model: "
            + ", ".join(CHOICES["model"])
            + ". The user must confirm before anything changes. Do not call it "
            "for questions about studying."
        ),
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "setting": {"type": "STRING", "enum": list(_LABELS)},
                "value": {"type": "STRING"},
            },
            "required": ["setting", "value"],
        },
    }


def validate(args: Mapping[str, Any]) -> Optional[dict[str, str]]:
    """``{"setting", "value"}`` for an allowed change, otherwise ``None``."""
    setting = str(args.get("setting", "")).strip().lower()
    value = str(args.get("value", "")).strip().lower()
    if setting in CHOICES:
        return (
            {"setting": setting, "value": value} if value in CHOICES[setting] else None
        )
    if setting == "voice_speed":
        try:
            speed = float(value)
        except ValueError:
            return None
        if not speed == speed:  # NaN
            return None
        low, high = SPEED_RANGE
        return {"setting": setting, "value": f"{min(max(speed, low), high):g}"}
    return None


def reply_for(action: Optional[dict[str, str]]) -> str:
    """What the tutor says alongside the proposal."""
    if action is None:
        return (
            "I can only change the theme, text size, speaking speed or AI model, "
            "using the options in this app."
        )
    return (
        f"I can change {_LABELS[action['setting']]} to {action['value']}. "
        "Press Apply to confirm."
    )


__all__ = ["CHOICES", "TOOL_NAME", "declaration", "reply_for", "validate"]
