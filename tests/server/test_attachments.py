"""Tutor attachment storage: sniffing, extraction, caps and eviction."""

from __future__ import annotations

import io
import os
import stat
import zipfile

import pytest

from openjarvis.server import attachments


@pytest.fixture(autouse=True)
def home(tmp_path, monkeypatch):
    monkeypatch.setenv("OPENJARVIS_HOME", str(tmp_path / "home"))
    return tmp_path / "home"


def save(data: bytes, name: str = "file.bin") -> attachments.Attachment:
    return attachments.save(io.BytesIO(data), name)


def refused(data: bytes, name: str = "file.bin") -> str:
    with pytest.raises(attachments.AttachmentError) as caught:
        save(data, name)
    assert not list(attachments.storage_dir().glob("*.tmp"))
    return caught.value.code


def picture(fmt: str, colour: int = 0, **options) -> bytes:
    Image = pytest.importorskip("PIL.Image")
    out = io.BytesIO()
    Image.new("RGB", (8, 8), (colour, 0, 0)).save(out, format=fmt, **options)
    return out.getvalue()


def pdf(text: str = "") -> bytes:
    """A one-page PDF, with *text* on it when given."""
    stream = f"BT /F1 12 Tf 72 720 Td ({text}) Tj ET" if text else ""
    objects = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R "
        "/Resources << /Font << /F1 5 0 R >> >> >>",
        f"<< /Length {len(stream)} >>\nstream\n{stream}\nendstream",
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    body = "%PDF-1.4\n"
    offsets = []
    for number, content in enumerate(objects, 1):
        offsets.append(len(body))
        body += f"{number} 0 obj\n{content}\nendobj\n"
    start = len(body)
    body += f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n"
    body += "".join(f"{offset:010d} 00000 n \n" for offset in offsets)
    body += f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\n"
    body += f"startxref\n{start}\n%%EOF\n"
    return body.encode("latin-1")


def docx_bytes(equation: bool = True) -> bytes:
    docx = pytest.importorskip("docx")
    from docx.oxml import parse_xml

    document = docx.Document()
    document.add_paragraph("Rotational motion")
    table = document.add_table(rows=2, cols=2)
    for row, values in enumerate((("Quantity", "Unit"), ("Torque", "N m"))):
        for column, value in enumerate(values):
            table.cell(row, column).text = value
    if equation:
        paragraph = document.add_paragraph("Torque: ")
        paragraph._p.append(
            parse_xml(
                '<m:oMath xmlns:m="http://schemas.openxmlformats.org/'
                'officeDocument/2006/math"><m:r><m:t>τ=r×F</m:t></m:r></m:oMath>'
            )
        )
    document.add_paragraph("The end.")
    out = io.BytesIO()
    document.save(out)
    return out.getvalue()


@pytest.mark.parametrize(
    ("fmt", "mime"),
    [
        ("PNG", "image/png"),
        ("JPEG", "image/jpeg"),
        ("WEBP", "image/webp"),
        ("GIF", "image/gif"),
    ],
)
def test_images_are_typed_by_content_not_name(fmt, mime):
    stored = save(picture(fmt), "notes.txt")

    assert (stored.kind, stored.mime, stored.name) == ("image", mime, "notes.txt")
    assert stored.warning is None


@pytest.mark.parametrize(
    "data",
    [
        "Plain notes\nवेग = दूरी / समय\n".encode(),
        "a,b\n1,2\n".encode("utf-16"),
        "caf\xe9 costs \xa35\n".encode("cp1252"),
    ],
)
def test_text_files_are_recognised_whatever_their_name(data):
    stored = save(data, "photo.png")

    assert (stored.kind, stored.mime) == ("text", "text/plain")
    assert stored.text.strip()


@pytest.mark.parametrize(
    ("data", "code"),
    [
        (b"", "empty"),
        (b"  \n\t\n", "empty"),
        (b"\x7fELF\x02\x01\x01" + bytes(64), "unsupported"),
        (bytes(range(1, 32)) * 20, "unsupported"),
        (b"\x89PNG\r\n\x1a\n" + b"junk" * 8, "unreadable"),
        (b"%PDF-1.7\nnot really a pdf", "unreadable"),
        (b"PK\x03\x04 truncated zip", "unreadable"),
    ],
)
def test_bad_files_are_refused(data, code):
    if code == "unreadable":
        pytest.importorskip("PIL")
        pytest.importorskip("pdfplumber")
    assert refused(data) == code


def test_other_zip_files_are_unsupported():
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w") as archive:
        archive.writestr("xl/workbook.xml", "<x/>")

    assert refused(out.getvalue(), "sheet.docx") == "unsupported"


def test_pdf_text_is_kept_for_the_offline_model():
    pytest.importorskip("pdfplumber")
    stored = save(pdf("Kinetic energy"), "a.pdf")

    assert (stored.kind, stored.mime, stored.pages) == ("pdf", "application/pdf", 1)
    assert "Kinetic energy" in stored.text
    assert stored.warning is None


def test_pdf_without_text_is_accepted_with_a_warning():
    pytest.importorskip("pdfplumber")
    stored = save(pdf(), "scan.pdf")

    assert stored.kind == "pdf" and not stored.text
    assert "offline model cannot" in stored.warning


def test_docx_reads_paragraphs_tables_and_equations():
    stored = save(docx_bytes(), "unit.docx")

    assert (stored.kind, stored.mime) == ("text", attachments.DOCX_MIME)
    assert stored.text.splitlines() == [
        "Rotational motion",
        "| Quantity | Unit |",
        "| Torque | N m |",
        "Torque: [equation: τ=r×F]",
        "The end.",
    ]
    assert "Equations may be lost" in stored.warning


def test_docx_without_equations_has_no_warning():
    assert save(docx_bytes(equation=False), "unit.docx").warning is None


def test_docx_that_expands_too_far_is_refused(monkeypatch):
    data = io.BytesIO(docx_bytes())
    with zipfile.ZipFile(data, "a", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("word/media/huge.bin", bytes(3 * 1024 * 1024))
    monkeypatch.setattr(attachments, "MAX_DOCX_UNZIPPED_BYTES", 2 * 1024 * 1024)

    assert len(data.getvalue()) < 200_000
    assert refused(data.getvalue(), "bomb.docx") == "too_large"


def test_docx_that_lies_about_its_size_is_refused():
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", "<Types/>")
        archive.writestr("word/document.xml", b"A" * 1_000_000)
    data = bytearray(out.getvalue())
    # Shrink the declared size in both headers.
    real = (1_000_000).to_bytes(4, "little")
    assert data.count(real) == 2
    data = bytes(data).replace(real, (10).to_bytes(4, "little"))

    assert refused(data, "liar.docx") == "unreadable"


def test_long_text_is_cut_and_says_so(monkeypatch):
    monkeypatch.setattr(attachments, "MAX_TEXT_CHARS", 10)
    stored = save(b"abcdefghij and more", "long.txt")

    assert stored.text == "abcdefghij" and stored.truncated
    assert "only its first part" in stored.warning


def test_file_size_cap(monkeypatch):
    monkeypatch.setattr(attachments, "MAX_FILE_BYTES", 100)

    assert save(b"x" * 100).size == 100
    assert refused(b"x" * 101) == "too_large"


def test_least_recently_used_files_are_evicted(monkeypatch):
    first = save(b"a" * 1000)
    second = save(b"b" * 1000)
    os.utime(first.path, (1000, 1000))
    os.utime(second.path, (2000, 2000))
    attachments.load(first.id)  # using it makes the second one the oldest
    used = sum(p.stat().st_size for p in attachments.storage_dir().iterdir())
    monkeypatch.setattr(attachments, "MAX_TOTAL_BYTES", used + 200)

    third = save(b"c" * 1000)

    assert attachments.load(second.id) is None
    assert attachments.load(first.id) and attachments.load(third.id)
    assert sorted(p.name for p in attachments.storage_dir().iterdir()) == sorted(
        [first.id, f"{first.id}.json", third.id, f"{third.id}.json"]
    )


def test_newest_file_survives_even_a_tiny_cap(monkeypatch):
    monkeypatch.setattr(attachments, "MAX_TOTAL_BYTES", 1)

    assert attachments.load(save(b"only one").id)


def test_files_are_private_and_named_by_their_hash(home):
    stored = save(b"secret notes", "../../etc/pass\nwd.txt")

    assert stored.path.parent == home.resolve() / "attachments"
    assert stored.name == "passwd.txt"
    assert len(stored.id) == 64 and int(stored.id, 16) >= 0
    assert stat.S_IMODE(stored.path.parent.stat().st_mode) == 0o700
    for path in stored.path.parent.iterdir():
        assert stat.S_IMODE(path.stat().st_mode) == 0o600


def test_same_content_is_stored_once_and_keeps_the_gemini_upload():
    first = save(b"same", "a.txt")
    attachments.set_gemini_upload(first.id, {"uri": "u"})

    second = save(b"same", "b.txt")

    assert second.id == first.id
    assert attachments.load(first.id).name == "b.txt"
    assert attachments.load(first.id).gemini == {"uri": "u"}


@pytest.mark.parametrize(
    "bad",
    ["", "..", "../" * 4 + "etc/passwd", "a" * 63, "A" * 64, "g" * 64, "a" * 64 + "\n"],
)
def test_only_hex_ids_are_looked_up(bad, home):
    save(b"notes")
    (home / "secret").write_text("x")
    (home / "secret.json").write_text('{"mime":"a","size":1,"kind":"text"}')

    assert attachments.load(bad) is None
    assert attachments.load("../secret") is None
    attachments.set_gemini_upload("../secret", {"uri": "u"})
    assert "uri" not in (home / "secret.json").read_text()
