"""Pasted links and deep search read only public pages, as plain text."""

import asyncio

import httpx
import pytest

from openjarvis.server import tutor_browse as browse

PAGE = (
    b"<html><head><title> Torque </title><script>evil()</script></head>"
    b"<body><nav>menu</nav><h1>Torque</h1><p>It is r &times; F.</p></body></html>"
)


def test_finds_a_few_distinct_links():
    text = "See https://a.test/x, https://a.test/x and http://b.test/y). ftp://no"
    assert browse.find_urls(text) == ["https://a.test/x", "http://b.test/y"]
    many = " ".join(f"https://h{i}.test" for i in range(9))
    assert len(browse.find_urls(many)) == browse.MAX_LINKS


def test_extracts_visible_text_only():
    title, text = browse.extract(PAGE, "text/html; charset=utf-8", "utf-8")
    assert title == "Torque"
    assert "It is r × F." in text
    assert "evil" not in text and "menu" not in text
    assert browse.extract(b"\x00", "image/png", "utf-8") == ("", "")


def _use(monkeypatch, handler):
    real = httpx.AsyncClient

    def client(**options):
        return real(transport=httpx.MockTransport(handler), **options)

    monkeypatch.setattr(browse.httpx, "AsyncClient", client)
    monkeypatch.setattr(
        browse, "check_ssrf", lambda url: "private" if "10.0.0" in url else None
    )


def test_reads_a_page_through_a_redirect(monkeypatch):
    def handler(request):
        if request.url.path == "/old":
            return httpx.Response(302, headers={"location": "/new"})
        return httpx.Response(200, headers={"content-type": "text/html"}, content=PAGE)

    _use(monkeypatch, handler)
    page = asyncio.run(browse.fetch_page("https://site.test/old"))
    assert page["url"] == "https://site.test/new" and page["title"] == "Torque"


@pytest.mark.parametrize(
    "url",
    ["http://10.0.0.5/admin", "https://user:pw@site.test/", "file:///etc/passwd"],
)
def test_refuses_private_or_unsafe_addresses(monkeypatch, url):
    asked = []
    _use(monkeypatch, lambda request: asked.append(request) or httpx.Response(200))
    assert asyncio.run(browse.fetch_page(url)) is None
    assert asked == []


def test_redirect_into_the_private_network_is_refused(monkeypatch):
    asked = []

    def handler(request):
        asked.append(str(request.url))
        return httpx.Response(302, headers={"location": "http://10.0.0.5/secret"})

    _use(monkeypatch, handler)
    assert asyncio.run(browse.fetch_page("https://site.test/")) is None
    assert asked == ["https://site.test/"]


def test_oversized_pages_are_dropped(monkeypatch):
    big = b"x" * (browse.MAX_PAGE_BYTES + 1)
    _use(
        monkeypatch,
        lambda r: httpx.Response(
            200, headers={"content-type": "text/plain"}, content=big
        ),
    )
    assert asyncio.run(browse.fetch_page("https://site.test/")) is None
