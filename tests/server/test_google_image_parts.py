"""Images on user messages reach Gemini in both the SDK and REST paths."""

import base64

from openjarvis.core.types import Message, Role
from openjarvis.engine.cloud import _google_user_parts, _sniff_image_mime
from openjarvis.server.cloud_router import _to_google_contents

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


def test_rest_contents_include_inline_image():
    contents = _to_google_contents([Message(role=Role.USER, content="q", images=[PNG])])
    parts = contents[0]["parts"]
    assert parts[0] == {"text": "q"}
    assert parts[1] == {"inlineData": {"mimeType": "image/png", "data": PNG}}
