"""The tutor may only propose whitelisted settings changes."""

from types import SimpleNamespace as NS

import pytest

from openjarvis.engine.google_common import chunk_calls
from openjarvis.server import tutor_settings as ts


@pytest.mark.parametrize(
    ("args", "expected"),
    [
        (
            {"setting": "theme", "value": "Light"},
            {"setting": "theme", "value": "light"},
        ),
        (
            {"setting": "voice_speed", "value": "3"},
            {"setting": "voice_speed", "value": "1.4"},
        ),
        ({"setting": "voice_speed", "value": "nan"}, None),
        ({"setting": "voice_speed", "value": "fast"}, None),
        ({"setting": "theme", "value": "pink"}, None),
        ({"setting": "api_key", "value": "x"}, None),
        ({"setting": "model", "value": "gpt-4o"}, None),
        ({}, None),
    ],
)
def test_only_allowed_changes_pass(args, expected):
    assert ts.validate(args) == expected


def test_reply_asks_for_confirmation():
    assert "Press Apply" in ts.reply_for({"setting": "theme", "value": "light"})
    assert "only change" in ts.reply_for(None)


def test_function_calls_are_read_from_a_chunk():
    call = NS(name=ts.TOOL_NAME, args={"setting": "theme", "value": "dark"})
    parts = [NS(function_call=call), NS(function_call=None, text="hi")]
    chunk = NS(candidates=[NS(content=NS(parts=parts))])
    assert chunk_calls(chunk) == [{"name": ts.TOOL_NAME, "args": dict(call.args)}]
    assert chunk_calls(NS(candidates=None)) == []
