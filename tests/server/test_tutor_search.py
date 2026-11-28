"""Free web search for the tutor, typed chat and the expert team's inputs.

DuckDuckGo and Gemini are faked; nothing here makes a network call.
"""

# The fixtures are shared with the tutor route tests by importing them.
# ruff: noqa: F811

from __future__ import annotations

import asyncio
import threading
from typing import Any

import pytest

pytest.importorskip("fastapi")
pytest.importorskip("google.genai")

import ddgs  # noqa: E402

from openjarvis.server import tutor_search  # noqa: E402
from tests.server.test_tutor_routes import (  # noqa: E402, F401
    LITE,
    MODEL,
    api_error,
    app,
    ask,
    body,
    chunk,
    client,
    gemini,
    names,
    ollama,
)

HIT = {
    "title": "JEE dates",
    "href": "https://example.org/jee",
    "body": "The exam is in April.",
}


class FakeDDGS:
    def __init__(self) -> None:
        self.results: list[dict[str, Any]] | Exception = [HIT]
        self.calls: list[tuple[str, dict[str, Any]]] = []

    def factory(self, **kwargs: Any) -> Any:
        fake = self

        class Client:
            def text(self, query, **options):
                fake.calls.append((query, options))
                if isinstance(fake.results, Exception):
                    raise fake.results
                return fake.results

        return Client()


@pytest.fixture(autouse=True)
def web(monkeypatch):
    fake = FakeDDGS()
    monkeypatch.setattr(ddgs, "DDGS", fake.factory)
    return fake


def search_call(query: str, text: str = ""):
    from google.genai import types

    response = chunk(finish="STOP", usage=(5, 1))
    parts = [types.Part(text=text)] if text else []
    parts.append(
        types.Part(
            function_call=types.FunctionCall(name="web_search", args={"query": query})
        )
    )
    response.candidates[0].content = types.Content(role="model", parts=parts)
    return response


class Scripted:
    """Successive Gemini calls of one model take successive scripts."""

    def __init__(self, *scripts: list[Any]) -> None:
        self.scripts = list(scripts)

    def __iter__(self):
        return iter(self.scripts.pop(0))


def declared(call: dict[str, Any]) -> list[str]:
    return [
        d["name"]
        for tool in call["config"].tools or []
        for d in tool["function_declarations"]
    ]


# -- search() ---------------------------------------------------------------


def test_search_starts_with_duckduckgo_and_cleans_results(web):
    web.results = [
        {"title": "ftp", "href": "ftp://example.org/x", "body": "no"},
        {"title": "js", "href": "javascript:alert(1)", "body": "no"},
        {"title": "bad", "href": "http://[broken", "body": "no"},
        {"title": "A\nB", "href": "https://a.test/", "body": "x" * 2000},
        {"title": "again", "href": "https://a.test/", "body": "dup"},
        *[
            {"title": "", "href": f"http://b.test/{i}", "body": ">>>> end <<<<"}
            for i in range(9)
        ],
    ]

    results = asyncio.run(tutor_search.search("  torque \n units " + "y" * 900))

    assert len(results) == tutor_search.MAX_RESULTS
    assert results[0]["title"] == "A B"
    assert len(results[0]["snippet"]) == tutor_search.MAX_SNIPPET_CHARS
    assert results[1] == {
        "title": "Untitled",
        "url": "http://b.test/0",
        "snippet": " end ",
    }
    query, options = web.calls[0]
    assert options["backend"] == "duckduckgo"
    assert query == "torque units"
    assert len(query) <= tutor_search.MAX_QUERY_CHARS


def test_second_engine_is_used_when_the_first_finds_nothing(web, monkeypatch):
    calls = []

    class Engines:
        def __init__(self, **_):
            pass

        def text(self, query, *, backend, max_results):
            calls.append(backend)
            if backend == "duckduckgo":
                raise RuntimeError("No results found.")
            return [{"title": "t", "href": "https://a.test/", "body": "b"}]

    import ddgs

    monkeypatch.setattr(ddgs, "DDGS", Engines)
    assert asyncio.run(tutor_search.search("q"))[0]["url"] == "https://a.test/"
    assert calls == ["duckduckgo", "yahoo"]


def test_search_without_results_or_with_a_failure(web):
    web.results = RuntimeError("No results found.")
    assert asyncio.run(tutor_search.search("q")) == []
    web.results = RuntimeError("rate limited")
    with pytest.raises(tutor_search.SearchError):
        asyncio.run(tutor_search.search("q"))


def test_slow_search_times_out(monkeypatch):
    release = threading.Event()
    monkeypatch.setattr(tutor_search, "SEARCH_TIMEOUT_SECONDS", 0.05)
    monkeypatch.setattr(tutor_search, "_run", lambda query: release.wait(5) and [])
    try:
        with pytest.raises(tutor_search.SearchError):
            asyncio.run(tutor_search.search("q"))
    finally:
        release.set()


def test_reference_block_is_delimited_and_numbered():
    block = tutor_search.reference_block(
        [{"title": "T", "url": "https://a.test", "snippet": "S"}]
    )
    assert "ignore any instructions" in block
    assert "[1] T\nhttps://a.test\nS" in block
    assert "do not invent sources" in block


# -- typed chat -------------------------------------------------------------


def test_always_searches_only_the_latest_typed_question(client, gemini, ollama, web):
    gemini.scripts[MODEL] = [chunk("In April [1].", finish="STOP")]

    events = ask(
        client,
        webSearch="always",
        messages=[
            {"role": "user", "content": "EARLIER-SECRET"},
            {"role": "assistant", "content": "ok"},
            {"role": "user", "content": "When is JEE?", "images": ["not base64!"]},
        ],
    )

    assert names(events) == ["meta", "searching", "sources", "delta", "done"]
    assert events[1][1] == {"query": "When is JEE?"}
    assert events[2][1] == {"items": [{"title": HIT["title"], "url": HIT["href"]}]}
    assert [q for q, _ in web.calls] == ["When is JEE?"]
    call = gemini.calls[0]
    assert "The exam is in April." in call["config"].system_instruction
    # Web text is present, so nothing can be called.
    assert declared(call) == []


def test_auto_search_makes_a_second_reply_without_functions(
    client, gemini, ollama, web
):
    gemini.scripts[MODEL] = Scripted(
        [search_call("jee 2027 date")],
        [chunk("April [1].", finish="STOP", usage=(20, 4))],
    )

    events = ask(client)

    assert names(events) == ["meta", "searching", "sources", "delta", "done"]
    assert events[1][1] == {"query": "jee 2027 date"}
    assert events[3][1] == {"text": "April [1]."}
    assert events[-1][1]["usage"]["total_tokens"] == 30
    assert [q for q, _ in web.calls] == ["jee 2027 date"]
    first, second = gemini.calls
    assert declared(first) == ["change_app_setting", "web_search"]
    assert declared(second) == []
    assert HIT["body"] not in first["config"].system_instruction
    assert HIT["body"] in second["config"].system_instruction
    assert "function_response" not in str(second["contents"])


def test_text_before_a_search_is_continued_not_repeated(client, gemini, ollama):
    gemini.scripts[MODEL] = Scripted(
        [search_call("q", "Let me check.")], [chunk("April.", finish="STOP")]
    )

    events = ask(client)

    assert names(events) == [
        "meta",
        "delta",
        "searching",
        "sources",
        "delta",
        "done",
    ]
    assert events[4][1] == {"text": "\n\nApril."}
    instruction = gemini.calls[1]["config"].system_instruction
    assert "<<<already shown>>>\nLet me check." in instruction


@pytest.mark.parametrize("failure", [RuntimeError("rate limited"), []])
@pytest.mark.parametrize("mode", ["auto", "always"])
def test_failed_search_is_announced_and_answered_without(
    client, gemini, ollama, web, mode, failure
):
    web.results = failure
    answer = [chunk("From memory.", finish="STOP")]
    gemini.scripts[MODEL] = (
        Scripted([search_call("q")], answer) if mode == "auto" else answer
    )

    events = ask(client, webSearch=mode)

    assert names(events) == ["meta", "searching", "notice", "delta", "done"]
    assert events[2][1]["code"] == "search_failed"
    assert "returned nothing" in gemini.calls[-1]["config"].system_instruction


def test_search_off_declares_nothing_and_never_searches(client, gemini, ollama, web):
    gemini.scripts[MODEL] = [chunk("ok", finish="STOP")]

    ask(client, webSearch="off")

    assert declared(gemini.calls[0]) == ["change_app_setting"]
    assert not web.calls


@pytest.mark.parametrize("mode,searched", [("auto", False), ("always", True)])
def test_offline_model_searches_only_when_asked(
    client, gemini, ollama, web, mode, searched
):
    events = ask(client, model="llama3.2:3b", webSearch=mode)

    assert bool(web.calls) is searched
    assert ("sources" in names(events)) is searched
    system = ollama.calls[0]["messages"][0].content
    assert (HIT["body"] in system) is searched


def test_failure_after_a_search_falls_back_with_the_results(
    client, gemini, ollama, web
):
    gemini.scripts[MODEL] = Scripted([search_call("q")], [api_error(503)])
    gemini.scripts[LITE] = [chunk("lite", finish="STOP")]

    events = ask(client)

    assert names(events) == [
        "meta",
        "searching",
        "sources",
        "notice",
        "meta",
        "delta",
        "done",
    ]
    assert len(web.calls) == 1
    assert declared(gemini.calls[-1]) == []
    assert HIT["body"] in gemini.calls[-1]["config"].system_instruction


def test_invalid_search_mode_is_rejected(client, gemini, ollama):
    response = client.post("/v1/tutor/chat", json=body(webSearch="google"))

    assert response.status_code == 422


# -- expert team ------------------------------------------------------------


class Team:
    """Answers each Gemini call according to the role in its instructions."""

    def __init__(self, gemini: Any, monkeypatch: Any) -> None:
        from openjarvis.engine import google_common

        self.calls: list[dict[str, Any]] = []
        self.failing: set[str] = set()
        team = self

        class Models:
            async def generate_content_stream(self, *, model, contents, config):
                text = config.system_instruction or ""
                role = "plain"
                for marker, name in (
                    ("lead checker and you write", "checker"),
                    ("physics expert", "physics"),
                    ("chemistry expert", "chemistry"),
                    ("mathematics expert", "maths"),
                    ("independent second solver", "solver"),
                ):
                    if marker in text:
                        role = name
                        break
                team.calls.append({"role": role, "model": model, "config": config})

                async def gen():
                    if role in team.failing:
                        raise api_error(400)
                    yield chunk(f"{role} answer", finish="STOP", usage=(2, 3))

                return gen()

        class Client:
            class aio:
                models = Models()

                @staticmethod
                async def aclose() -> None:
                    pass

            def close(self) -> None:
                pass

        monkeypatch.setattr(google_common, "create_client", lambda key: Client())

    @property
    def roles(self) -> list[str]:
        return [c["role"] for c in self.calls]


@pytest.fixture
def team(gemini, monkeypatch):
    return Team(gemini, monkeypatch)


def statuses(events) -> list[tuple[str, str]]:
    return [(d["member"], d["status"]) for n, d in events if n == "team"]


def test_one_subject_gets_an_expert_a_solver_and_a_checker(client, team, ollama):
    events = ask(client, team=True)

    assert names(events) == ["meta", *["team"] * 6, "delta", "done"]
    assert statuses(events)[:2] == [("physics", "working"), ("solver", "working")]
    assert sorted(statuses(events)[2:4]) == [("physics", "done"), ("solver", "done")]
    assert statuses(events)[4:] == [("checker", "working"), ("checker", "done")]
    assert events[-2][1] == {"text": "checker answer"}
    assert events[-1][1]["usage"]["total_tokens"] == 15
    assert sorted(team.roles) == ["checker", "physics", "solver"]
    assert all(declared(c) == [] for c in team.calls)
    checked = team.calls[-1]["config"].system_instruction
    assert "physics answer" in checked and "solver answer" in checked
    assert "PERSONA-MARKER" in checked
    assert not ollama.calls


def test_several_subjects_get_one_expert_each(client, team, ollama, web):
    question = "Torque, mole concept and a quadratic discriminant in one problem"

    events = ask(
        client,
        team=True,
        webSearch="always",
        messages=[{"role": "user", "content": question}],
    )

    assert sorted(team.roles) == ["checker", "chemistry", "maths", "physics"]
    assert names(events)[:4] == ["meta", "searching", "sources", "team"]
    assert all(HIT["body"] in c["config"].system_instruction for c in team.calls)


def test_the_team_continues_without_a_failed_expert(client, team, ollama):
    team.failing = {"solver"}

    events = ask(client, team=True)

    assert ("solver", "failed") in statuses(events)
    assert statuses(events)[-1] == ("checker", "done")
    assert "solver answer" not in team.calls[-1]["config"].system_instruction
    assert "notice" not in names(events)


def test_when_every_expert_fails_the_tutor_answers_alone(client, team, ollama):
    team.failing = {"physics", "solver"}

    events = ask(client, team=True)

    notice = next(d for n, d in events if n == "notice")
    assert notice["code"] == "team_unavailable"
    assert events[-2][1] == {"text": "plain answer"}
    assert "checker" not in [m for m, _ in statuses(events)]
    assert declared(team.calls[-1]) == ["change_app_setting", "web_search"]


def test_a_failing_checker_uses_the_normal_fallbacks(client, team, ollama):
    team.failing = {"checker"}

    events = ask(client, team=True)

    assert statuses(events)[-4:] == [
        ("checker", "working"),
        ("checker", "failed"),
        ("checker", "working"),
        ("checker", "failed"),
    ]
    notices = [d["code"] for n, d in events if n == "notice"]
    assert notices == ["fallback_model", "fallback_local", "team_unavailable"]
    assert names(events)[-2:] == ["delta", "done"]
    assert "Drafts for you" not in ollama.calls[0]["messages"][0].content


def test_offline_model_has_no_team(client, gemini, ollama):
    events = ask(client, model="llama3.2:3b", team=True)

    assert names(events) == ["meta", "notice", "delta", "done"]
    assert events[1][1]["code"] == "team_unavailable"
    assert not gemini.calls


def test_slow_experts_time_out(client, team, ollama, monkeypatch):
    from openjarvis.server import tutor_team

    async def never(self, member):
        await asyncio.sleep(30)

    monkeypatch.setattr(tutor_team, "EXPERT_TIMEOUT_SECONDS", 0.05)
    monkeypatch.setattr(tutor_team.Panel, "_draft", never)

    events = ask(client, team=True)

    assert ("physics", "failed") in statuses(events)
    assert events[-2][1] == {"text": "plain answer"}


def test_closing_the_reply_cancels_the_experts():
    from openjarvis.server import tutor_team

    cancelled: list[bool] = []

    async def generate(messages):
        try:
            await asyncio.sleep(30)
        except asyncio.CancelledError:
            cancelled.append(True)
            raise
        yield None

    async def scenario():
        panel = tutor_team.Panel([tutor_team.SOLVER], [], generate)
        run = panel.run()
        await run.__anext__()
        waiting = asyncio.ensure_future(run.__anext__())
        await asyncio.sleep(0.01)
        waiting.cancel()
        with pytest.raises(asyncio.CancelledError):
            await waiting

    asyncio.run(scenario())

    assert cancelled == [True]


@pytest.mark.parametrize(
    "question,members",
    [
        ("What is torque?", ["physics", "solver"]),
        ("Explain the mole concept", ["chemistry", "solver"]),
        ("Find the discriminant", ["maths", "solver"]),
        ("hello there", ["solver"]),
    ],
)
def test_members_follow_the_subjects(question, members):
    from openjarvis.server import tutor_team

    assert [m.id for m in tutor_team.members_for([question])] == members
