"""Images on user messages reach Gemini through the shared request builder."""

import base64

from openjarvis.core.types import Message, Role
from openjarvis.engine.cloud import _google_user_parts, _sniff_image_mime
from openjarvis.engine.google_common import build_contents

PNG = base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"\x00" * 16).decode()


def test_sniff_image_mime():
    assert _sniff_image_mime(base64.b64decode(PNG)) == "image/png"
    assert _sniff_image_mime(b"\xff\xd8\xff\xe0") == "image/jpeg"


def test_sdk_parts_include_inline_image():
    parts = _google_user_parts(Message(role=Role.USER, content="q", images=[PNG]))
    assert parts[0] == {"text": "q"}
    assert parts[1]["inline_data"]["mime_type"] == "image/png"
    assert parts[1]["inline_data"]["data"] == base64.b64decode(PNG)


def test_sdk_parts_text_only_unchanged():
    assert _google_user_parts(Message(role=Role.USER, content="q")) == [{"text": "q"}]


def test_shared_contents_include_inline_image():
    system, contents = build_contents(
        [Message(role=Role.USER, content="q", images=[PNG])]
    )
    assert system == ""
    parts = contents[0]["parts"]
    assert parts[0] == {"text": "q"}
    assert parts[1] == {
        "inline_data": {"mime_type": "image/png", "data": base64.b64decode(PNG)}
    }


def test_system_messages_become_one_instruction_not_chat_turns():
    system, contents = build_contents(
        [
            Message(role=Role.SYSTEM, content="persona"),
            Message(role=Role.SYSTEM, content="memory"),
            Message(role=Role.USER, content="q"),
        ]
    )
    assert system == "persona\n\nmemory"
    assert contents == [{"role": "user", "parts": [{"text": "q"}]}]
