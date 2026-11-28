"""Reading scans and pictures: Tesseract, Gemini and the fallback between them."""

from __future__ import annotations

import io
import os
import subprocess
import time

import pytest

pytest.importorskip("PIL")
pytest.importorskip("pypdfium2")

import pypdfium2 as pdfium  # noqa: E402
from PIL import Image, ImageDraw, ImageFont  # noqa: E402

from openjarvis.engine import google_common  # noqa: E402
from openjarvis.server import ocr  # noqa: E402

PDF = ocr.PDF_MIME


@pytest.fixture(autouse=True)
def isolated(tmp_path, monkeypatch):
    monkeypatch.setenv("OPENJARVIS_HOME", str(tmp_path / "home"))
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
    ocr.clear_cache()
    yield
    ocr.clear_cache()


def png(size=(40, 20), colour="white", mode="RGB") -> bytes:
    out = io.BytesIO()
    Image.new(mode, size, colour).save(out, format="PNG")
    return out.getvalue()


def scanned_pdf(count: int, size=(100, 140)) -> bytes:
    """A PDF of pictures: pages with no text layer."""
    pages = [Image.new("L", size, 255 - number) for number in range(count)]
    out = io.BytesIO()
    pages[0].save(out, format="PDF", save_all=True, append_images=pages[1:])
    return out.getvalue()


def page_count(data: bytes) -> int:
    document = pdfium.PdfDocument(data)
    try:
        return len(document)
    finally:
        document.close()


class FakeTesseract:
    """Stands in for the program: answers with the next text, then repeats it."""

    def __init__(self, monkeypatch) -> None:
        self.commands: list[list[str]] = []
        self.inputs: list[bytes] = []
        self.timeouts: list[float] = []
        self.texts = ["local text"]
        self.errors: dict[int, BaseException | int] = {}
        self.delay = 0.0
        monkeypatch.setattr(ocr, "tesseract_path", lambda: "/fake/tesseract")
        monkeypatch.setattr(ocr.subprocess, "run", self.run)

    def run(self, command, *, input, capture_output, timeout, check):
        number = len(self.commands)
        self.commands.append(command)
        self.inputs.append(input)
        self.timeouts.append(timeout)
        time.sleep(self.delay)
        error = self.errors.get(number)
        if isinstance(error, BaseException):
            raise error
        text = self.texts[min(number, len(self.texts) - 1)]
        return subprocess.CompletedProcess(
            command, error or 0, f"{text}\n\f".encode(), b""
        )


class FakeTranscriber:
    """Stands in for ``google_common.stream_text``."""

    def __init__(self, monkeypatch) -> None:
        self.calls: list[tuple[str, list, dict]] = []
        #: Per call: text, (text, finish reason) or an exception.
        self.replies: list = ["cloud text"]
        monkeypatch.setenv("GEMINI_API_KEY", "test-key")
        monkeypatch.setattr(google_common, "stream_text", self.stream)

    async def stream(self, model, messages, **options):
        self.calls.append((model, messages, options))
        reply = self.replies[min(len(self.calls), len(self.replies)) - 1]
        if isinstance(reply, BaseException):
            raise reply
        text, finish = reply if isinstance(reply, tuple) else (reply, "stop")
        yield google_common.GeminiEvent(text=text)
        yield google_common.GeminiEvent(finish_reason=finish)

    def blob(self, call: int) -> tuple[str, bytes]:
        part = self.calls[call][1][-1].metadata[google_common.GEMINI_PARTS_KEY][0]
        return part["inline_data"]["mime_type"], part["inline_data"]["data"]


@pytest.fixture
def tesseract(monkeypatch):
    return FakeTesseract(monkeypatch)


@pytest.fixture
def gemini(monkeypatch):
    return FakeTranscriber(monkeypatch)


class Busy(Exception):
    code = 503


# ---------------------------------------------------------------------------
# Tesseract
# ---------------------------------------------------------------------------


def test_pdf_pages_are_rendered_and_piped_to_tesseract(tesseract):
    tesseract.texts = ["one", "two"]

    result = ocr.local_ocr(scanned_pdf(2), PDF)

    assert result == ("one\n\ntwo", "tesseract", False)
    command = tesseract.commands[0]
    assert command[:5] == ["/fake/tesseract", "stdin", "stdout", "-l", "eng+hin"]
    assert command[5:] == ["--dpi", "200"]
    assert 0 < tesseract.timeouts[0] <= ocr.PAGE_TIMEOUT_SECONDS
    with Image.open(io.BytesIO(tesseract.inputs[0])) as page:
        # 100 x 140 points at 200 dots per inch.
        assert page.format == "PNG" and page.size == (278, 389)


def test_transparent_pictures_are_put_on_white(tesseract):
    ocr.local_ocr(png(colour=(0, 0, 0, 0), mode="RGBA"), "image/png")

    assert "--dpi" not in tesseract.commands[0]
    with Image.open(io.BytesIO(tesseract.inputs[0])) as image:
        assert image.getpixel((0, 0)) == 255


@pytest.mark.parametrize(
    ("data", "mime"),
    [(scanned_pdf(1, (3000, 3000)), PDF), (png((900, 600)), "image/png")],
)
def test_bitmaps_are_capped(tesseract, monkeypatch, data, mime):
    monkeypatch.setattr(ocr, "MAX_BITMAP_PIXELS", 10_000)

    ocr.local_ocr(data, mime)

    with Image.open(io.BytesIO(tesseract.inputs[0])) as image:
        assert image.width * image.height <= 10_500


def test_huge_pictures_are_refused(tesseract, monkeypatch):
    monkeypatch.setattr(ocr, "MAX_IMAGE_PIXELS", 100)

    with pytest.raises(ocr.OcrError):
        ocr.local_ocr(png(), "image/png")
    assert tesseract.commands == []


def test_page_cap(tesseract, monkeypatch):
    monkeypatch.setattr(ocr, "MAX_PAGES", 2)

    result = ocr.local_ocr(scanned_pdf(3), PDF)

    assert len(tesseract.commands) == 2 and result.truncated


@pytest.mark.parametrize(
    "error", [1, subprocess.TimeoutExpired("tesseract", 1), OSError("gone")]
)
def test_one_failed_page_keeps_the_others(tesseract, error):
    tesseract.errors = {0: error}

    result = ocr.local_ocr(scanned_pdf(2), PDF)

    assert result == ("local text", "tesseract", True)


def test_blank_page_is_not_a_failure(tesseract):
    tesseract.texts = [""]

    assert ocr.local_ocr(png(), "image/png") == ("", "none", False)


@pytest.mark.parametrize("data", [b"%PDF-1.7 broken", scanned_pdf(1)])
def test_unreadable_files_raise(tesseract, data):
    tesseract.errors = {0: 1}

    with pytest.raises(ocr.OcrError):
        ocr.local_ocr(data, PDF)


def test_missing_tesseract_raises(monkeypatch):
    monkeypatch.setattr(ocr, "tesseract_path", lambda: None)

    with pytest.raises(ocr.OcrError, match="not installed"):
        ocr.local_ocr(png(), "image/png")


def test_pages_are_cached_by_content(tesseract):
    data = scanned_pdf(2)

    first = ocr.local_ocr(data, PDF)

    assert ocr.local_ocr(bytes(data), PDF) == first
    assert len(tesseract.commands) == 2


def test_tesseract_is_found_outside_the_path(tmp_path, monkeypatch):
    program = tmp_path / "tesseract"
    program.write_text("#!/bin/sh\n")
    program.chmod(0o755)
    monkeypatch.setattr(ocr.shutil, "which", lambda name: None)
    monkeypatch.setattr(ocr, "_EXTRA_DIRS", (str(tmp_path),))

    assert ocr.tesseract_path() == os.path.join(str(tmp_path), "tesseract")


@pytest.mark.skipif(ocr.tesseract_path() is None, reason="Tesseract not installed")
@pytest.mark.parametrize("mime", ["image/png", PDF])
def test_real_tesseract_reads_a_picture(mime):
    image = Image.new("L", (900, 200), 255)
    font = ImageFont.load_default(size=72)
    ImageDraw.Draw(image).text((40, 50), "KINETIC ENERGY", fill=0, font=font)
    out = io.BytesIO()
    image.save(out, format="PDF" if mime == PDF else "PNG")

    result = ocr.local_ocr(out.getvalue(), mime)

    assert "KINETIC ENERGY" in result.text.upper()
    assert result.method == "tesseract"


# ---------------------------------------------------------------------------
# Gemini and the fallback
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_gemini_reads_a_pdf_in_page_batches(gemini):
    gemini.replies = ["first", "second"]

    result = await ocr.gemini_ocr(scanned_pdf(7), PDF)

    assert result == ("first\n\nsecond", "gemini", False)
    assert [page_count(gemini.blob(n)[1]) for n in (0, 1)] == [5, 2]
    prompt = gemini.calls[0][1][0].content
    for wanted in ("reading order", "LaTeX", "\\ce{", "Devanagari", "never instr"):
        assert wanted in prompt


@pytest.mark.asyncio
async def test_gemini_sends_a_picture_as_it_is(gemini):
    data = png()

    await ocr.gemini_ocr(data, "image/png")

    assert gemini.blob(0) == ("image/png", data)


@pytest.mark.asyncio
async def test_too_big_requests_are_split_then_shrunk(gemini, monkeypatch):
    monkeypatch.setattr(ocr, "GEMINI_INLINE_BYTES", 10)

    result = await ocr.gemini_ocr(scanned_pdf(2), PDF)

    assert [gemini.blob(n)[0] for n in (0, 1)] == ["image/jpeg"] * 2
    assert result.text == "cloud text\n\ncloud text"


@pytest.mark.asyncio
async def test_cut_off_transcription_is_marked_and_not_cached(gemini):
    gemini.replies = [("part", "length")]
    data = png()

    for _ in range(2):
        assert await ocr.gemini_ocr(data, "image/png") == ("part", "gemini", True)
    assert len(gemini.calls) == 2


@pytest.mark.asyncio
async def test_no_text_reply_is_an_empty_reading(gemini, tesseract):
    gemini.replies = ["[NO TEXT]"]

    result = await ocr.read_text(png(), "image/png", allow_cloud=True)

    assert result == ("", "none", False)
    assert tesseract.commands == []


@pytest.mark.asyncio
async def test_gemini_ocr_raises_without_a_key(tesseract):
    with pytest.raises(google_common.MissingAPIKeyError):
        await ocr.gemini_ocr(png(), "image/png")
    assert tesseract.commands == []


@pytest.mark.asyncio
@pytest.mark.parametrize("reply", [("", "blocked"), "", Busy()])
async def test_falls_back_to_tesseract(gemini, tesseract, reply):
    gemini.replies = [reply]

    result = await ocr.read_text(png(), "image/png", allow_cloud=True)

    assert result == ("local text", "tesseract", False)


@pytest.mark.asyncio
async def test_one_refused_batch_alone_is_read_locally(gemini, tesseract):
    gemini.replies = [("", "blocked"), "second"]
    tesseract.texts = [f"local {n}" for n in range(5)]

    result = await ocr.read_text(scanned_pdf(6), PDF, allow_cloud=True)

    assert result.method == "mixed" and not result.truncated
    assert result.text.split("\n\n") == [*tesseract.texts, "second"]


@pytest.mark.asyncio
@pytest.mark.parametrize("error", [Busy(), ConnectionError()])
async def test_an_unreachable_gemini_is_not_asked_again(gemini, tesseract, error):
    gemini.replies = [error]

    result = await ocr.read_text(scanned_pdf(7), PDF, allow_cloud=True)

    assert len(gemini.calls) == 1 and len(tesseract.commands) == 7
    assert result.method == "tesseract"


@pytest.mark.asyncio
async def test_cloud_is_never_used_when_not_allowed(gemini, tesseract):
    result = await ocr.read_text(png(), "image/png", allow_cloud=False)

    assert result.method == "tesseract" and gemini.calls == []


@pytest.mark.asyncio
async def test_without_a_key_only_tesseract_runs(monkeypatch, tesseract):
    monkeypatch.setattr(google_common, "stream_text", None)  # must not be called

    result = await ocr.read_text(png(), "image/png", allow_cloud=True)

    assert result.method == "tesseract"


@pytest.mark.asyncio
async def test_offline_reading_never_returns_cached_cloud_text(gemini, tesseract):
    data = png()
    assert (await ocr.read_text(data, "image/png", True)).text == "cloud text"
    assert (await ocr.read_text(data, "image/png", True)).text == "cloud text"
    assert len(gemini.calls) == 1

    assert ocr.local_ocr(data, "image/png").text == "local text"
    assert (await ocr.read_text(data, "image/png", False)).text == "local text"


@pytest.mark.asyncio
async def test_nothing_can_read_it(monkeypatch):
    monkeypatch.setattr(ocr, "tesseract_path", lambda: None)

    assert await ocr.read_text(png(), "image/png", True) == ("", "none", True)
    assert await ocr.read_text(b"%PDF broken", PDF, True) == ("", "none", False)


# ---------------------------------------------------------------------------
# Study Material uploads
# ---------------------------------------------------------------------------


@pytest.fixture
def uploads(monkeypatch):
    pytest.importorskip("fastapi")
    pytest.importorskip("multipart")
    pytest.importorskip("pdfplumber")
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from openjarvis.server import upload_router

    stored: list[tuple[str, dict]] = []

    class Store:
        def store(self, chunk, **kwargs):
            stored.append((chunk, kwargs))

    monkeypatch.setattr(upload_router, "_get_store", Store)
    app = FastAPI()
    app.include_router(upload_router.router)
    client = TestClient(app)

    def send(*files: tuple[str, bytes]):
        return client.post(
            "/v1/connectors/upload/ingest/files",
            files=[("files", (name, data)) for name, data in files],
        )

    send.stored = stored
    return send


TYPED = "This page already has a real text layer to keep."


def mixed_pdf() -> bytes:
    """Scanned, typed, scanned."""
    from tests.server.test_attachments import pdf

    scans = pdfium.PdfDocument(scanned_pdf(2))
    typed = pdfium.PdfDocument(pdf(TYPED))
    target = pdfium.PdfDocument.new()
    target.import_pages(scans, [0])
    target.import_pages(typed)
    target.import_pages(scans, [1])
    out = io.BytesIO()
    target.save(out)
    return out.getvalue()


@pytest.mark.parametrize("name", ["a.png", "b.JPG", "c.jpeg", "d.webp"])
def test_pictures_can_be_uploaded(uploads, tesseract, name):
    response = uploads((name, png()))

    assert response.json() == {
        "chunks_added": 1,
        "source": "upload",
        "ocr_pages": 1,
        "warning": None,
    }
    assert uploads.stored[0][0] == "local text"


def test_only_scanned_pages_of_a_mixed_pdf_are_ocred(uploads, tesseract):
    tesseract.texts = ["scan before", "scan after"]

    body = uploads(("mixed.pdf", mixed_pdf())).json()

    assert body["ocr_pages"] == 2 and body["warning"] is None
    assert len(tesseract.commands) == 2
    text = uploads.stored[0][0]
    assert text.split("\n\n") == ["scan before", TYPED, "scan after"]


def test_uploads_use_gemini_when_online(uploads, gemini, tesseract):
    body = uploads(("scan.pdf", scanned_pdf(2))).json()

    assert body["ocr_pages"] == 2 and tesseract.commands == []
    assert uploads.stored[0][0] == "cloud text"


def test_text_pdf_needs_no_ocr(uploads, gemini, tesseract):
    from tests.server.test_attachments import pdf

    body = uploads(("typed.pdf", pdf(TYPED))).json()

    assert body["ocr_pages"] == 0 and not gemini.calls and not tesseract.commands


@pytest.mark.parametrize(
    ("name", "data"),
    [("scan.pdf", scanned_pdf(1)), ("photo.png", png()), ("empty.txt", b"  ")],
)
def test_nothing_read_is_never_silent(uploads, monkeypatch, name, data):
    monkeypatch.setattr(ocr, "tesseract_path", lambda: None)

    response = uploads((name, data))

    body = response.json()
    assert response.status_code == 200 and body["chunks_added"] == 0
    assert f'No text could be read from "{name}"' in body["warning"]
    assert ("install Tesseract" in body["warning"]) == (name != "empty.txt")


def test_unread_pages_are_reported(uploads, monkeypatch):
    monkeypatch.setattr(ocr, "tesseract_path", lambda: None)

    body = uploads(("mixed.pdf", mixed_pdf())).json()

    assert body["chunks_added"] == 1
    assert 'Only part of "mixed.pdf" was added' in body["warning"]


def test_a_bad_file_keeps_the_others(uploads, tesseract):
    response = uploads(
        ("first.txt", b"first"),
        ("broken.pdf", b"not a pdf"),
        ("broken.png", b"not a picture"),
        ("last.txt", b"last"),
    )

    body = response.json()
    assert response.status_code == 200 and body["chunks_added"] == 2
    assert [chunk for chunk, _ in uploads.stored] == ["first", "last"]
    assert '"broken.pdf"' in body["warning"] and '"broken.png"' in body["warning"]


def test_ocr_crashing_keeps_the_typed_pages(uploads, monkeypatch):
    async def crash(*args, **kwargs):
        raise RuntimeError("boom")

    monkeypatch.setattr(ocr, "read_pages", crash)

    body = uploads(("mixed.pdf", mixed_pdf())).json()

    assert body["chunks_added"] == 1 and "Only part" in body["warning"]
    assert uploads.stored[0][0] == TYPED


def test_unsupported_type_is_refused_before_anything_is_stored(uploads):
    response = uploads(("a.txt", b"note"), ("b.exe", b"x"))

    assert response.status_code == 400 and uploads.stored == []
