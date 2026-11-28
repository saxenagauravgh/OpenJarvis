"""Upload / Paste router for ingesting documents into the knowledge store."""

from __future__ import annotations

import asyncio
import io
import logging
import uuid
from typing import List, NamedTuple, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from openjarvis.connectors.store import KnowledgeStore
from openjarvis.core.config import DEFAULT_CONFIG_DIR
from openjarvis.engine import google_common
from openjarvis.server import ocr
from openjarvis.server.origin import require_trusted_origin

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/v1/connectors/upload",
    tags=["upload"],
    dependencies=[Depends(require_trusted_origin)],
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}
_ALLOWED_EXTENSIONS = {".txt", ".md", ".csv", ".pdf", ".docx"} | _IMAGE_EXTENSIONS


def _chunk_text(text: str, max_chars: int = 1000) -> List[str]:
    """Split *text* into ~max_chars pieces at paragraph boundaries."""
    paragraphs = text.split("\n\n")
    chunks: List[str] = []
    current = ""
    for para in paragraphs:
        para = para.strip()
        if not para:
            continue
        if current and len(current) + len(para) + 2 > max_chars:
            chunks.append(current.strip())
            current = para
        else:
            current = f"{current}\n\n{para}" if current else para
    if current.strip():
        chunks.append(current.strip())
    # Guard against very large paragraphs that exceed max_chars
    final: List[str] = []
    for chunk in chunks:
        while len(chunk) > max_chars:
            # Find last space within limit
            split_at = chunk.rfind(" ", 0, max_chars)
            if split_at == -1:
                split_at = max_chars
            final.append(chunk[:split_at].strip())
            chunk = chunk[split_at:].strip()
        if chunk:
            final.append(chunk)
    return final


def _extract_pdf_pages(data: bytes) -> List[str]:
    """The text layer of each page of a PDF, using pdfplumber or PyPDF2."""
    # Try pdfplumber first
    try:
        import pdfplumber  # type: ignore[import-untyped]

        with pdfplumber.open(io.BytesIO(data)) as pdf:
            return [p.extract_text() or "" for p in pdf.pages]
    except ImportError:
        pass

    # Fall back to PyPDF2
    try:
        from PyPDF2 import PdfReader  # type: ignore[import-untyped]

        reader = PdfReader(io.BytesIO(data))
        return [p.extract_text() or "" for p in reader.pages]
    except ImportError:
        raise HTTPException(
            status_code=500,
            detail=(
                "PDF parsing requires pdfplumber or PyPDF2. "
                "Install one with: pip install pdfplumber"
            ),
        )


def _extract_text_from_docx(data: bytes) -> str:
    """Extract text from a .docx file using python-docx."""
    try:
        from docx import Document  # type: ignore[import-untyped]

        doc = Document(io.BytesIO(data))
        return "\n\n".join(p.text for p in doc.paragraphs if p.text.strip())
    except ImportError:
        raise HTTPException(
            status_code=500,
            detail=(
                "DOCX parsing requires python-docx. "
                "Install with: pip install python-docx"
            ),
        )


class _FileText(NamedTuple):
    text: str
    ocr_pages: int = 0
    #: Some pages that needed OCR could not be read.
    incomplete: bool = False


async def _read_pdf(data: bytes) -> _FileText:
    """A PDF's text, with OCR for the pages that have no real text layer."""
    pages = await asyncio.to_thread(_extract_pdf_pages, data)
    scanned = [i for i, text in enumerate(pages) if ocr.is_empty_page(text)]
    read, incomplete = 0, False
    if scanned:
        try:
            reading = await ocr.read_pages(
                data, ocr.PDF_MIME, scanned, allow_cloud=True
            )
        except Exception as exc:  # the pages with text are still worth keeping
            google_common.log_failure(logger, "Could not read scanned pages", exc)
            incomplete = True
        else:
            for section in reading.sections:
                for index in section.pages:
                    pages[index] = ""
                pages[section.pages[0]] = section.text
            read, incomplete = reading.pages_read, reading.truncated
    text = "\n\n".join(page for page in pages if page.strip())
    return _FileText(text, read, incomplete)


async def _read_file(data: bytes, ext: str) -> _FileText:
    if ext == ".pdf":
        return await _read_pdf(data)
    if ext == ".docx":
        return _FileText(await asyncio.to_thread(_extract_text_from_docx, data))
    if ext in _IMAGE_EXTENSIONS:
        mime = google_common.sniff_image_mime(data)
        reading = await ocr.read_pages(data, mime, allow_cloud=True)
        found = reading.result()
        return _FileText(found.text, reading.pages_read, found.truncated)
    try:
        return _FileText(data.decode("utf-8"))
    except UnicodeDecodeError:
        return _FileText(data.decode("latin-1"))


def _nothing_read(filename: str, needed_ocr: bool) -> str:
    message = f'No text could be read from "{filename}", so nothing was added from it.'
    if needed_ocr and ocr.tesseract_path() is None:
        message += (
            " To read scans and pictures offline, install Tesseract "
            "(brew install tesseract tesseract-lang)."
        )
    return message


def _get_store() -> KnowledgeStore:
    """Return a KnowledgeStore pointing at the default knowledge DB."""
    db_path = DEFAULT_CONFIG_DIR / "knowledge.db"
    return KnowledgeStore(db_path=db_path)


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class PasteRequest(BaseModel):
    title: str = ""
    content: str


class IngestResponse(BaseModel):
    chunks_added: int
    source: str = "upload"
    #: Pages (a picture counts as one) whose text was read by OCR.
    ocr_pages: int = 0
    #: What could not be read, in words for the user.
    warning: Optional[str] = None


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.post("/ingest", response_model=IngestResponse)
async def ingest_paste(body: PasteRequest) -> IngestResponse:
    """Ingest pasted text into the knowledge store."""
    text = body.content.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Content is empty")

    store = _get_store()
    doc_id = str(uuid.uuid4())
    chunks = _chunk_text(text)

    for idx, chunk in enumerate(chunks):
        store.store(
            chunk,
            source="upload",
            doc_type="paste",
            doc_id=doc_id,
            title=body.title or "Pasted text",
            chunk_index=idx,
        )

    logger.info("Ingested %d chunks from pasted text (doc_id=%s)", len(chunks), doc_id)
    return IngestResponse(chunks_added=len(chunks))


@router.post("/ingest/files", response_model=IngestResponse)
async def ingest_files(
    files: List[UploadFile] = File(...),
    title: Optional[str] = Form(None),
) -> IngestResponse:
    """Ingest uploaded files into the knowledge store."""
    # Every type is checked first, so a refusal never leaves half an upload.
    named = []
    for upload in files:
        filename = upload.filename or "untitled"
        ext = ""
        if "." in filename:
            ext = "." + filename.rsplit(".", 1)[-1].lower()

        if ext not in _ALLOWED_EXTENSIONS:
            allowed = ", ".join(sorted(_ALLOWED_EXTENSIONS))
            raise HTTPException(
                status_code=400,
                detail=(f"Unsupported file type: {ext}. Allowed: {allowed}"),
            )
        named.append((upload, filename, ext))

    store = _get_store()
    total_chunks = 0
    ocr_pages = 0
    warnings: List[str] = []

    for upload, filename, ext in named:
        needs_ocr = ext == ".pdf" or ext in _IMAGE_EXTENSIONS
        try:
            found = await _read_file(await upload.read(), ext)
            text = found.text.strip()
            if not text:
                warnings.append(_nothing_read(filename, needs_ocr))
                continue

            doc_id = str(uuid.uuid4())
            doc_title = title or filename
            chunks = _chunk_text(text)

            for idx, chunk in enumerate(chunks):
                store.store(
                    chunk,
                    source="upload",
                    doc_type=ext.lstrip("."),
                    doc_id=doc_id,
                    title=doc_title,
                    chunk_index=idx,
                )
        except HTTPException:
            raise
        except Exception as exc:  # one bad file must not lose the others
            google_common.log_failure(logger, "Could not ingest a file", exc)
            warnings.append(
                f'"{filename}" could not be read or saved. It may be damaged or '
                "password-protected."
            )
            continue

        total_chunks += len(chunks)
        ocr_pages += found.ocr_pages
        if found.incomplete:
            warnings.append(
                f'Only part of "{filename}" was added: some scanned pages could '
                f"not be read (at most {ocr.MAX_PAGES} are read per file)."
            )
        logger.info(
            "Ingested %d chunks from file %s (doc_id=%s)",
            len(chunks),
            filename,
            doc_id,
        )

    return IngestResponse(
        chunks_added=total_chunks,
        ocr_pages=ocr_pages,
        warning=" ".join(warnings) or None,
    )
