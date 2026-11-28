"""Files that stay with a tutor conversation: storage, sniffing and text.

Each file is kept as ``<config dir>/attachments/<sha256>`` with a
``<sha256>.json`` sidecar (name, type, extracted text and the cached Gemini
upload). The type comes from the content alone. Files are capped in size, and
the least recently used are removed once the store grows past its total cap.
"""

from __future__ import annotations

import codecs
import hashlib
import io
import json
import logging
import os
import re
import tempfile
import threading
import time
import zipfile
from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path
from typing import Any, BinaryIO, Optional

from openjarvis.core.paths import get_config_dir

logger = logging.getLogger("openjarvis.server.attachments")

MAX_FILE_BYTES = 50 * 1024 * 1024
MAX_TOTAL_BYTES = 1024 * 1024 * 1024
# Most text kept from one document; the chat applies smaller caps of its own.
MAX_TEXT_CHARS = 100_000
MAX_IMAGE_PIXELS = 100_000_000
# Gemini's own limit.
MAX_PDF_PAGES = 1000
# Text is only needed offline, so reading it is bounded in pages and time.
MAX_PDF_TEXT_PAGES = 200
PDF_TEXT_SECONDS = 20.0
# A .docx is a zip: limit what it may expand to.
MAX_DOCX_ENTRIES = 3000
MAX_DOCX_UNZIPPED_BYTES = 100 * 1024 * 1024
MAX_DOCX_XML_BYTES = 30 * 1024 * 1024
_CHUNK = 1024 * 1024
_STALE_PARTIAL_SECONDS = 3600

DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
_ID = re.compile(r"[0-9a-f]{64}")
_lock = threading.Lock()

_W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
_M = "{http://schemas.openxmlformats.org/officeDocument/2006/math}"
_MC = "{http://schemas.openxmlformats.org/markup-compatibility/2006}"

_UNSUPPORTED = (
    "This type of file is not supported. Attach a PNG, JPEG, WEBP or GIF image, "
    "a PDF, a Word (.docx) document, or a text, Markdown or CSV file."
)


class AttachmentError(Exception):
    """Why a file was refused, in words that are safe to show the user."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code  # too_large | unsupported | empty | unreadable
        self.message = message


@dataclass(frozen=True)
class Attachment:
    id: str
    name: str
    mime: str
    size: int
    kind: str  # "image" | "pdf" | "text"
    path: Path
    warning: Optional[str] = None
    #: Extracted text of a document or PDF; ``None`` or "" when there is none.
    text: Optional[str] = None
    truncated: bool = False
    pages: Optional[int] = None
    #: The cached Gemini Files API upload, if any.
    gemini: Optional[dict[str, Any]] = None

    def public(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "mime": self.mime,
            "size": self.size,
            "kind": self.kind,
            "warning": self.warning,
        }


@dataclass(frozen=True)
class _Inspection:
    kind: str
    mime: str
    warning: Optional[str] = None
    text: Optional[str] = None
    truncated: bool = False
    pages: Optional[int] = None


# ---------------------------------------------------------------------------
# Store
# ---------------------------------------------------------------------------


def storage_dir() -> Path:
    return get_config_dir() / "attachments"


def _ensure_dir() -> Path:
    root = storage_dir()
    root.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(root, 0o700)
    return root


def clean_name(name: Optional[str]) -> str:
    """A display name without directories, quotes or control characters."""
    base = re.split(r"[\\/]", name or "")[-1]
    base = "".join(c for c in base if c.isprintable() and c not in '"<>`')
    base = " ".join(base.split())
    if len(base) > 120:
        stem, dot, ext = base.rpartition(".")
        base = f"{stem[: 119 - len(ext)]}.{ext}" if dot and len(ext) < 10 else base
    return base[:120] or "file"


def _write_sidecar(root: Path, file_id: str, data: dict[str, Any]) -> None:
    fd, tmp = tempfile.mkstemp(dir=root, prefix="sidecar-", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(data, handle)
        os.replace(tmp, root / f"{file_id}.json")
    finally:
        Path(tmp).unlink(missing_ok=True)


def _read_sidecar(root: Path, file_id: str) -> Optional[dict[str, Any]]:
    try:
        data = json.loads((root / f"{file_id}.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return data if isinstance(data, dict) else None


def _from_sidecar(root: Path, file_id: str, data: dict[str, Any]) -> Attachment:
    return Attachment(
        id=file_id,
        name=clean_name(data.get("name")),
        mime=str(data["mime"]),
        size=int(data["size"]),
        kind=str(data["kind"]),
        path=root / file_id,
        warning=data.get("warning"),
        text=data.get("text"),
        truncated=bool(data.get("truncated")),
        pages=data.get("pages"),
        gemini=data.get("gemini"),
    )


def load(file_id: str) -> Optional[Attachment]:
    """The stored file with this id, marked as just used; ``None`` if unknown."""
    if not isinstance(file_id, str) or not _ID.fullmatch(file_id):
        return None
    root = storage_dir()
    with _lock:
        data = _read_sidecar(root, file_id)
        if data is None:
            return None
        try:
            os.utime(root / file_id)
            return _from_sidecar(root, file_id, data)
        except (OSError, KeyError, TypeError, ValueError):
            return None


def set_gemini_upload(file_id: str, upload: Optional[dict[str, Any]]) -> None:
    """Remember (or forget) the Gemini upload of a stored file."""
    if not _ID.fullmatch(file_id):
        return
    root = storage_dir()
    with _lock:
        data = _read_sidecar(root, file_id)
        if data is None:
            return
        data["gemini"] = upload
        try:
            _write_sidecar(root, file_id, data)
        except OSError:
            logger.warning("Could not update an attachment record")


def save(stream: BinaryIO, name: Optional[str]) -> Attachment:
    """Check and store an uploaded file. Raises :class:`AttachmentError`."""
    root = _ensure_dir()
    # mkstemp creates the file readable by this user only (0600).
    fd, tmp_name = tempfile.mkstemp(dir=root, prefix="incoming-", suffix=".tmp")
    tmp = Path(tmp_name)
    try:
        digest = hashlib.sha256()
        size = 0
        with os.fdopen(fd, "wb") as out:
            while chunk := stream.read(_CHUNK):
                size += len(chunk)
                if size > MAX_FILE_BYTES:
                    raise too_large()
                digest.update(chunk)
                out.write(chunk)
        if not size:
            raise AttachmentError("empty", "This file is empty.")
        found = _inspect(tmp)
        file_id = digest.hexdigest()
        with _lock:
            previous = _read_sidecar(root, file_id) or {}
            data = {
                "name": clean_name(name),
                "mime": found.mime,
                "size": size,
                "kind": found.kind,
                "warning": found.warning,
                "text": found.text,
                "truncated": found.truncated,
                "pages": found.pages,
                "gemini": previous.get("gemini"),
            }
            os.replace(tmp, root / file_id)
            os.utime(root / file_id)
            _write_sidecar(root, file_id, data)
            _evict(root, keep=file_id)
        return _from_sidecar(root, file_id, data)
    finally:
        tmp.unlink(missing_ok=True)


def too_large() -> AttachmentError:
    return AttachmentError(
        "too_large",
        f"This file is too large. The limit is {MAX_FILE_BYTES // (1024 * 1024)} MB.",
    )


def _evict(root: Path, *, keep: str) -> None:
    """Remove the least recently used files until the store fits its cap."""
    entries: list[tuple[float, int, str]] = []
    total = 0
    now = time.time()
    for path in list(root.iterdir()):
        try:
            if path.suffix == ".tmp":
                if now - path.stat().st_mtime > _STALE_PARTIAL_SECONDS:
                    path.unlink()
            elif path.suffix == ".json" and _ID.fullmatch(path.stem):
                if not (root / path.stem).exists():
                    path.unlink()
            elif _ID.fullmatch(path.name):
                stat = path.stat()
                size = stat.st_size
                sidecar = root / f"{path.name}.json"
                if sidecar.exists():
                    size += sidecar.stat().st_size
                total += size
                entries.append((stat.st_mtime, size, path.name))
        except OSError:
            logger.debug("Could not inspect an attachment")
    for _, size, file_id in sorted(entries):
        if total <= MAX_TOTAL_BYTES:
            return
        if file_id == keep:
            continue
        try:
            (root / file_id).unlink(missing_ok=True)
            (root / f"{file_id}.json").unlink(missing_ok=True)
        except OSError:
            logger.warning("Could not remove an old attachment")
            continue
        total -= size


# ---------------------------------------------------------------------------
# Type sniffing and inspection
# ---------------------------------------------------------------------------


def _inspect(path: Path) -> _Inspection:
    """Identify a file from its content and read what the tutor will need."""
    with path.open("rb") as handle:
        head = handle.read(4096)
    image = _image_mime(head)
    if image:
        return _inspect_image(path, image)
    if head.lstrip(b"\xef\xbb\xbf \t\r\n").startswith(b"%PDF-"):
        return _inspect_pdf(path)
    if head.startswith((b"PK\x03\x04", b"PK\x05\x06")):
        return _inspect_docx(path)
    return _inspect_text(path)


def _image_mime(head: bytes) -> Optional[str]:
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if head.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if head[:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif"
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "image/webp"
    return None


def _inspect_image(path: Path, mime: str) -> _Inspection:
    try:
        from PIL import Image
    except ImportError:
        return _Inspection("image", mime)
    damaged = AttachmentError(
        "unreadable", "This image could not be opened. It may be damaged."
    )
    try:
        with Image.open(path) as image:
            if image.width * image.height > MAX_IMAGE_PIXELS:
                raise AttachmentError(
                    "too_large", "This picture has too many pixels. Resize it first."
                )
            animated = bool(getattr(image, "is_animated", False))
            # A full decode: a damaged image would fail every later reply.
            image.load()
    except AttachmentError:
        raise
    except Exception as exc:  # PIL raises many types for bad input
        raise damaged from exc
    warning = "Only the first frame of this animation is read." if animated else None
    return _Inspection("image", mime, warning=warning)


def _inspect_pdf(path: Path) -> _Inspection:
    no_text = (
        "No text could be read from this PDF (it may be scanned). The online "
        "tutor can still read it, but the offline model cannot."
    )
    try:
        import pdfplumber
    except ImportError:
        return _Inspection(
            "pdf",
            "application/pdf",
            warning="The offline model cannot read PDFs on this computer.",
        )
    parts: list[str] = []
    used = 0
    truncated = False
    try:
        with pdfplumber.open(path) as pdf:
            pages = len(pdf.pages)
            if pages > MAX_PDF_PAGES:
                raise AttachmentError(
                    "too_large",
                    f"This PDF has more than {MAX_PDF_PAGES} pages. Attach only "
                    "the pages you need.",
                )
            if not pages:
                raise AttachmentError("empty", "This PDF has no pages.")
            deadline = time.monotonic() + PDF_TEXT_SECONDS
            for number, page in enumerate(pdf.pages):
                if (
                    number >= MAX_PDF_TEXT_PAGES
                    or used >= MAX_TEXT_CHARS
                    or time.monotonic() > deadline
                ):
                    truncated = True
                    break
                try:
                    text = (page.extract_text() or "").strip()
                except Exception:  # noqa: BLE001 — one bad page is not fatal
                    text = ""
                    logger.debug("Could not read the text of a PDF page")
                finally:
                    getattr(page, "close", lambda: None)()  # frees page memory
                if text:
                    parts.append(text)
                    used += len(text) + 2
    except AttachmentError:
        raise
    except Exception as exc:
        raise AttachmentError(
            "unreadable",
            "This PDF could not be opened. It may be damaged or password-protected.",
        ) from exc
    full = "\n\n".join(parts)
    return _Inspection(
        "pdf",
        "application/pdf",
        warning=None if full else no_text,
        text=full[:MAX_TEXT_CHARS],
        truncated=truncated or len(full) > MAX_TEXT_CHARS,
        pages=pages,
    )


def _inspect_text(path: Path) -> _Inspection:
    with path.open("rb") as handle:
        start = handle.read(2)
    if start in (codecs.BOM_UTF16_LE, codecs.BOM_UTF16_BE):
        encoding = "utf-16"
    else:
        encoding = "utf-8-sig"
        decoder = codecs.getincrementaldecoder("utf-8")()
        controls = size = 0
        with path.open("rb") as handle:
            while chunk := handle.read(_CHUNK):
                if b"\x00" in chunk:
                    raise AttachmentError("unsupported", _UNSUPPORTED)
                size += len(chunk)
                # Bytes left after deleting everything that is not a control code.
                controls += len(chunk.translate(None, _NOT_CONTROL))
                if encoding == "utf-8-sig":
                    try:
                        decoder.decode(chunk)
                    except UnicodeDecodeError:
                        encoding = "cp1252"
        if controls > max(2, size // 1000):
            raise AttachmentError("unsupported", _UNSUPPORTED)
        if encoding == "utf-8-sig":
            try:
                decoder.decode(b"", final=True)
            except UnicodeDecodeError:
                encoding = "cp1252"
    try:
        with path.open("r", encoding=encoding, errors="replace") as handle:
            text = handle.read(MAX_TEXT_CHARS + 1)
    except UnicodeError as exc:
        raise AttachmentError("unreadable", "This file could not be read.") from exc
    if "\x00" in text:
        raise AttachmentError("unsupported", _UNSUPPORTED)
    return _document("text/plain", text)


_NOT_CONTROL = bytes(
    value for value in range(256) if value >= 32 or value in (9, 10, 12, 13, 27)
)


def _document(mime: str, text: str, warnings: tuple[str, ...] = ()) -> _Inspection:
    if not text.strip():
        raise AttachmentError("empty", "No text could be read from this file.")
    truncated = len(text) > MAX_TEXT_CHARS
    if truncated:
        warnings += ("This document is long, so only its first part will be read.",)
    return _Inspection(
        "text",
        mime,
        warning=" ".join(warnings) or None,
        text=text[:MAX_TEXT_CHARS],
        truncated=truncated,
    )


# ---------------------------------------------------------------------------
# Word documents
# ---------------------------------------------------------------------------


def _unpack_docx(path: Path) -> io.BytesIO:
    """A copy of the XML in a .docx, with every size checked while unzipping.

    Sizes declared in a zip can lie, so each member is read in small pieces and
    the document library only ever sees this verified copy.
    """
    bomb = AttachmentError("too_large", "This document is too large once unpacked.")
    clean = io.BytesIO()
    with zipfile.ZipFile(path) as source:
        members = source.infolist()
        names = {member.filename for member in members}
        if not {"[Content_Types].xml", "word/document.xml"} <= names:
            raise AttachmentError("unsupported", _UNSUPPORTED)
        if len(members) > MAX_DOCX_ENTRIES or (
            sum(member.file_size for member in members) > MAX_DOCX_UNZIPPED_BYTES
        ):
            raise bomb
        total = 0
        written: set[str] = set()
        with zipfile.ZipFile(clean, "w", zipfile.ZIP_STORED) as target:
            for member in members:
                # Other methods cannot be unpacked in bounded pieces.
                if member.compress_type not in (
                    zipfile.ZIP_STORED,
                    zipfile.ZIP_DEFLATED,
                ):
                    raise AttachmentError(
                        "unreadable", "This document could not be opened."
                    )
                if member.filename in written:
                    continue
                written.add(member.filename)
                keep = member.filename.lower().endswith((".xml", ".rels"))
                data = bytearray()
                with source.open(member) as handle:
                    while chunk := handle.read(64 * 1024):
                        total += len(chunk)
                        if total > MAX_DOCX_UNZIPPED_BYTES:
                            raise bomb
                        if keep:
                            data += chunk
                            if len(data) > MAX_DOCX_XML_BYTES:
                                raise bomb
                # Pictures and other media are never read, so they stay empty.
                target.writestr(member.filename, bytes(data))
    clean.seek(0)
    return clean


def _nearest(element: Any, tag: str) -> Iterator[Any]:
    """Descendants with *tag*, not looking inside the ones found."""
    for child in element:
        if child.tag == tag:
            yield child
        else:
            yield from _nearest(child, tag)


def _equation(element: Any) -> str:
    characters = "".join(node.text or "" for node in element.iter(f"{_M}t"))
    return f"[equation: {characters}]" if characters else ""


def _paragraph(element: Any, out: list[str]) -> None:
    for child in element:
        tag = child.tag
        if tag in (f"{_W}pPr", f"{_W}rPr", f"{_MC}Fallback"):
            continue
        if tag == f"{_M}oMath":
            out.append(_equation(child))
        elif tag in (f"{_W}t", f"{_M}t"):
            out.append(child.text or "")
        elif tag == f"{_W}tab":
            out.append("\t")
        elif tag in (f"{_W}br", f"{_W}cr"):
            out.append("\n")
        else:
            if tag == f"{_W}p":  # a paragraph inside a text box
                out.append("\n")
            _paragraph(child, out)


def _blocks(element: Any) -> Iterator[str]:
    """Paragraphs, tables and equations in reading order."""
    for child in element:
        tag = child.tag
        if tag == f"{_W}p":
            parts: list[str] = []
            _paragraph(child, parts)
            yield "".join(parts)
        elif tag == f"{_W}tbl":
            for row in _nearest(child, f"{_W}tr"):
                cells = (
                    " ".join(block for block in _blocks(cell) if block.strip())
                    for cell in _nearest(row, f"{_W}tc")
                )
                yield f"| {' | '.join(cells)} |"
        elif tag in (f"{_M}oMath", f"{_M}oMathPara"):
            yield _equation(child)
        else:  # content controls and similar wrappers
            yield from _blocks(child)


def _inspect_docx(path: Path) -> _Inspection:
    damaged = AttachmentError(
        "unreadable", "This document could not be opened. It may be damaged."
    )
    try:
        unpacked = _unpack_docx(path)
        try:
            from docx import Document
        except ImportError as exc:
            raise AttachmentError(
                "unsupported",
                "Word documents cannot be read on this computer. Save it as a PDF "
                "and attach that instead.",
            ) from exc
        body = Document(unpacked).element.body
        blocks: list[str] = []
        used = 0
        for block in _blocks(body):
            if block.strip():
                blocks.append(block)
                used += len(block) + 1
                if used > MAX_TEXT_CHARS:
                    break
        warnings: tuple[str, ...] = ()
        if any(True for _ in body.iter(f"{_M}oMath", f"{_W}object")):
            warnings += (
                "Equations may be lost or flattened (fractions, powers and roots). "
                "Attach a PDF to keep them exact.",
            )
        if any(True for _ in body.iter(f"{_W}drawing", f"{_W}pict")):
            warnings += ("Pictures and drawings in this document are not read.",)
    except AttachmentError:
        raise
    except Exception as exc:  # zipfile, lxml and python-docx errors
        raise damaged from exc
    return _document(DOCX_MIME, "\n".join(blocks), warnings)


__all__ = [
    "Attachment",
    "AttachmentError",
    "MAX_FILE_BYTES",
    "MAX_TOTAL_BYTES",
    "clean_name",
    "load",
    "save",
    "set_gemini_upload",
    "storage_dir",
    "too_large",
]
