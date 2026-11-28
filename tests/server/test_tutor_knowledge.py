"""Reference notes are selected per question and kept within the prompt budget."""

import pytest

from openjarvis.server import tutor_knowledge as tk

SUBJECTS = ("physics", "chemistry", "mathematics")


@pytest.fixture
def notes_dir(tmp_path):
    (tmp_path / "physics.md").write_text(
        "# Physics\n\n## Friction\nLevel: 11\n"
        "Keywords: friction, static friction, rough incline\nSTATIC-NOTE\n\n"
        "## Ray optics\nKeywords: lens, mirror, refraction\nOPTICS-NOTE\n",
        encoding="utf-8",
    )
    (tmp_path / "pedagogy.md").write_text(
        "# Pedagogy\n\n## Core method\nCORE-NOTE\n\n"
        "## Hint ladder\nKeywords: hint, stuck\nHINT-NOTE\n",
        encoding="utf-8",
    )
    return tmp_path


def test_matching_topic_and_method_are_selected(notes_dir):
    notes = tk.select_notes(
        ["I am stuck on a block on a rough incline with friction"], notes_dir
    )
    assert "CORE-NOTE" in notes and "STATIC-NOTE" in notes and "HINT-NOTE" in notes
    assert "OPTICS-NOTE" not in notes
    assert "Keywords:" not in notes


def test_follow_up_keeps_the_earlier_topic(notes_dir):
    notes = tk.select_notes(["Explain lenses", "now do step 3"], notes_dir)
    assert "OPTICS-NOTE" in notes


def test_unrelated_question_gets_only_the_core_method(notes_dir):
    notes = tk.select_notes(["hello there"], notes_dir)
    assert "CORE-NOTE" in notes
    assert "STATIC-NOTE" not in notes and "HINT-NOTE" not in notes


def test_missing_files_add_nothing(tmp_path):
    assert tk.select_notes(["friction"], tmp_path / "absent") == ""


@pytest.mark.parametrize("name", [*SUBJECTS, "pedagogy"])
def test_shipped_notes_are_well_formed(name):
    sections = [s for s in tk.load_sections() if s.subject == name]
    assert len(sections) >= 10
    for section in sections:
        assert section.body, section.title
        assert len(section.body) <= 2000, section.title
        if section.title != tk.CORE_TITLE:
            assert section.keywords, section.title


@pytest.mark.parametrize(
    ("question", "subject"),
    [
        ("A block slides on a rough surface. Find the friction force.", "physics"),
        ("How do I find the limiting reagent using the mole concept?", "chemistry"),
        ("Evaluate this definite integral and find the area.", "mathematics"),
    ],
)
def test_shipped_notes_match_typical_questions(question, subject):
    notes = tk.select_notes([question])
    assert f"### {subject.title()}:" in notes
    assert "### Pedagogy: Core method" in notes
    assert len(notes) <= tk.MAX_NOTES_CHARS + 600


def test_uploaded_material_is_found_only_when_relevant(tmp_path):
    from openjarvis.connectors.store import KnowledgeStore

    db = tmp_path / "knowledge.db"
    store = KnowledgeStore(db_path=db)
    store.store(
        "Lenz's law: the induced current opposes the change in magnetic flux.",
        source="upload",
        doc_type="pdf",
        doc_id="d1",
        title="Class 12 EMI notes",
    )
    store.store(
        "Private message about magnetic flux and induced current.",
        source="gmail",
        doc_type="email",
        doc_id="d2",
        title="Inbox",
    )
    store.close()

    found = tk.uploaded_excerpts("Why does induced current oppose the flux?", db)
    assert "Class 12 EMI notes" in found and "Lenz" in found
    assert "Private message" not in found  # only uploads are searched
    assert tk.uploaded_excerpts("Balance this redox equation", db) == ""
    assert tk.uploaded_excerpts("hi", db) == ""


def test_no_database_means_no_excerpts(tmp_path):
    missing = tmp_path / "knowledge.db"
    assert tk.uploaded_excerpts("induced current flux", missing) == ""
    assert not missing.exists()
