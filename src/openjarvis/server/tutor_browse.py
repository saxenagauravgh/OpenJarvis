"""Open web pages for the tutor: links the learner pastes, and deep search.

Only public http(s) addresses are fetched: every address, including each
redirect, passes the SSRF check, downloads are capped, and the text is given to
the model as untrusted reference material.
"""

from __future__ import annotations

import asyncio
import io
import logging
import re
from html.parser import HTMLParser
from typing import Optional
from urllib.parse import urljoin, urlsplit

import httpx

from openjarvis.security.ssrf import check_ssrf

logger = logging.getLogger("openjarvis.server.tutor")

MAX_LINKS = 3
MAX_PAGE_BYTES = 3 * 1024 * 1024
MAX_PAGE_CHARS = 6000
MAX_REDIRECTS = 4
FETCH_TIMEOUT_SECONDS = 12.0
_PDF_PAGES = 15
_LINK = re.compile(r"https?://[^\s<>\"'`)\]}]+", re.IGNORECASE)
_HEADERS = {
    "User-Agent": "OpenJarvis-Tutor/1.0",
    "Accept": "text/html,text/plain,application/pdf;q=0.9",
}


def find_urls(text: str) -> list[str]:
    """Up to ``MAX_LINKS`` web addresses written in *text*."""
    found: list[str] = []
    for match in _LINK.findall(text or ""):
        url = match.rstrip(".,;:!?।")
        if url not in found:
            found.append(url)
    return found[:MAX_LINKS]


class _Text(HTMLParser):
    """Visible text and title, leaving out scripts, styles and navigation."""

    _SKIP = {"script", "style", "noscript", "svg", "nav", "header", "footer", "form"}
    _BREAK = {"p", "br", "div", "li", "tr", "h1", "h2", "h3", "h4", "section"}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.title = ""
        self._skipping: list[str] = []
        self._in_title = False

    def handle_starttag(self, tag, attrs):
        if tag in self._SKIP:
            self._skipping.append(tag)
        elif tag == "title":
            self._in_title = True
        elif tag in self._BREAK:
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in self._skipping:
            while self._skipping.pop() != tag:
                pass
        elif tag == "title":
            self._in_title = False

    def handle_data(self, data):
        if self._in_title:
            self.title += data
        elif not self._skipping:
            self.parts.append(data)


def _tidy(text: str) -> str:
    lines = (" ".join(line.split()) for line in text.splitlines())
    joined = "\n".join(line for line in lines if line)
    return re.sub(r"<{3,}|>{3,}", "", joined)[:MAX_PAGE_CHARS]


def extract(body: bytes, content_type: str, encoding: str) -> tuple[str, str]:
    """``(title, text)`` of a downloaded page; empty text if unreadable."""
    kind = content_type.split(";")[0].strip().lower()
    if kind == "application/pdf" or body.startswith(b"%PDF-"):
        import pdfplumber

        with pdfplumber.open(io.BytesIO(body)) as pdf:
            pages = [page.extract_text() or "" for page in pdf.pages[:_PDF_PAGES]]
        return "", _tidy("\n".join(pages))
    if kind and not (kind.startswith("text/") or kind == "application/xhtml+xml"):
        return "", ""
    try:
        text = body.decode(encoding or "utf-8", "replace")
    except LookupError:
        text = body.decode("utf-8", "replace")
    if kind == "text/plain":
        return "", _tidy(text)
    parser = _Text()
    parser.feed(text)
    return " ".join(parser.title.split())[:200], _tidy("".join(parser.parts))


async def _download(client: httpx.AsyncClient, url: str) -> Optional[tuple]:
    for _ in range(MAX_REDIRECTS + 1):
        parts = urlsplit(url)
        if parts.scheme not in ("http", "https") or parts.username or parts.password:
            return None
        if await asyncio.to_thread(check_ssrf, url):
            return None
        async with client.stream("GET", url) as response:
            if response.is_redirect:
                url = urljoin(url, response.headers.get("location", ""))
                continue
            if response.status_code != 200:
                return None
            body = bytearray()
            async for chunk in response.aiter_bytes():
                body += chunk
                if len(body) > MAX_PAGE_BYTES:
                    return None
            return (
                url,
                bytes(body),
                response.headers.get("content-type", ""),
                response.charset_encoding or "utf-8",
            )
    return None


async def fetch_page(url: str) -> Optional[dict[str, str]]:
    """``{"title", "url", "snippet"}`` with the page text, or ``None``."""
    try:
        async with asyncio.timeout(FETCH_TIMEOUT_SECONDS):
            async with httpx.AsyncClient(
                follow_redirects=False,
                headers=_HEADERS,
                timeout=FETCH_TIMEOUT_SECONDS,
                trust_env=False,
            ) as client:
                got = await _download(client, url)
            if got is None:
                return None
            final, body, content_type, encoding = got
            title, text = await asyncio.to_thread(extract, body, content_type, encoding)
    except Exception as exc:  # noqa: BLE001 — one bad page never breaks a reply
        logger.warning("Could not read a web page: %s", type(exc).__name__)
        return None
    if not text:
        return None
    host = urlsplit(final).hostname or "web page"
    return {"title": title or host, "url": final, "snippet": text}


async def read_pages(urls: list[str]) -> list[dict[str, str]]:
    """The readable pages among *urls*, in order."""
    pages = await asyncio.gather(*(fetch_page(url) for url in urls))
    return [page for page in pages if page]


__all__ = ["MAX_LINKS", "extract", "fetch_page", "find_urls", "read_pages"]
