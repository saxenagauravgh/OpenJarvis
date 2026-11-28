"""``WebSocket /v1/voice/live``: handshake, relay, tools and reconnection.

Gemini Live is replaced by a fake session; nothing here makes a network call.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from collections.abc import Callable
from typing import Any

import pytest

pytest.importorskip("fastapi")
pytest.importorskip("google.genai")

from fastapi.testclient import TestClient  # noqa: E402
from google.genai import errors as genai_errors  # noqa: E402
from google.genai import types  # noqa: E402
from starlette.websockets import WebSocketDisconnect  # noqa: E402

from openjarvis.core.config import JarvisConfig  # noqa: E402
from openjarvis.core.events import EventBus  # noqa: E402
from openjarvis.server import live_session  # noqa: E402
from openjarvis.server.app import create_app  # noqa: E402
from openjarvis.server.live_session import LiveBridge, Turn  # noqa: E402

URL = "/v1/voice/live"
FAKE_KEY = "AIzaFAKE-test-key-0123456789"
SECRET_DETAIL = "internal-detail-googleapis"
PERSONA = "PERSONA-MARKER: you are the adult JEE tutor."
PCM = b"\x01\x00" * 320


# -- the fake Gemini --------------------------------------------------------


class FakeSession:
    def __init__(self) -> None:
        self.loop = asyncio.get_running_loop()
        self.incoming: asyncio.Queue = asyncio.Queue()
        self.audio: list[bytes] = []
        self.mime_types: set[str] = set()
        self.texts: list[str] = []
        self.responses: list[types.FunctionResponse] = []
        self.closed = False

    def push(self, *items: Any) -> None:
        """Deliver server messages (or an exception); callable from any thread."""
        for item in items:
            self.loop.call_soon_threadsafe(self.incoming.put_nowait, item)

    async def send_realtime_input(self, *, audio=None, text=None) -> None:
        if audio is not None:
            self.audio.append(audio.data)
            self.mime_types.add(audio.mime_type)
        else:
            self.texts.append(text)

    async def send_tool_response(self, *, function_responses) -> None:
        self.responses.append(function_responses)

    async def receive(self):
        while True:
            item = await self.incoming.get()
            if isinstance(item, BaseException):
                raise item
            yield item
            if item.server_content and item.server_content.turn_complete:
                return


class FakeLive:
    """The injected connect function; *failures* are raised by early attempts."""

    def __init__(self) -> None:
        self.configs: list[types.LiveConnectConfig] = []
        self.sessions: list[FakeSession] = []
        self.failures: list[BaseException | None] = []

    def __call__(self, config):
        fake = self

        class Context:
            session: FakeSession | None = None

            async def __aenter__(self):
                fake.configs.append(config)
                failure = fake.failures.pop(0) if fake.failures else None
                if failure is not None:
                    raise failure
                self.session = FakeSession()
                fake.sessions.append(self.session)
                return self.session

            async def __aexit__(self, *exc_info):
                self.session.closed = True

        return Context()

    @property
    def handles(self) -> list[str | None]:
        return [c.session_resumption.handle for c in self.configs]


def server(**fields: Any) -> types.LiveServerMessage:
    return types.LiveServerMessage(server_content=types.LiveServerContent(**fields))


def audio(data: bytes) -> types.Content:
    return types.Content(
        role="model",
        parts=[types.Part(inline_data=types.Blob(data=data, mime_type="audio/pcm"))],
    )


def heard(text: str) -> types.LiveServerMessage:
    return server(input_transcription=types.Transcription(text=text))


def said(text: str) -> types.LiveServerMessage:
    return server(output_transcription=types.Transcription(text=text))


def done() -> types.LiveServerMessage:
    return server(turn_complete=True)


def tool(name: str, args: dict, call_id: str = "c1") -> types.LiveServerMessage:
    return types.LiveServerMessage(
        tool_call=types.LiveServerToolCall(
            function_calls=[types.FunctionCall(id=call_id, name=name, args=args)]
        )
    )


def handle(value: str, resumable: bool = True) -> types.LiveServerMessage:
    return types.LiveServerMessage(
        session_resumption_update=types.LiveServerSessionResumptionUpdate(
            new_handle=value, resumable=resumable
        )
    )


def go_away(time_left: str = "30s") -> types.LiveServerMessage:
    return types.LiveServerMessage(go_away=types.LiveServerGoAway(time_left=time_left))


def closed_error(code: int = 1006, reason: str = "") -> genai_errors.APIError:
    return genai_errors.APIError(code, f"{reason} {SECRET_DETAIL} {FAKE_KEY}")


# -- helpers ----------------------------------------------------------------


@pytest.fixture(autouse=True)
def _environment(tmp_path, monkeypatch):
    (tmp_path / "home").mkdir()
    monkeypatch.setenv("OPENJARVIS_HOME", str(tmp_path / "home"))
    monkeypatch.setenv("GEMINI_API_KEY", FAKE_KEY)
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
    monkeypatch.setattr(live_session, "RETRY_DELAYS_SECONDS", (0.01, 0.01, 0.01))


def make_app(tmp_path, **kwargs: Any):
    from unittest.mock import MagicMock

    config = JarvisConfig()
    config.analytics.enabled = False
    config.security.enabled = False
    config.traces.enabled = False
    config.agent.default_system_prompt = PERSONA
    engine = MagicMock()
    engine.engine_id = "mock"
    return create_app(
        engine, "gemini-2.5-flash", bus=EventBus(), config=config, **kwargs
    )


@pytest.fixture
def gemini():
    return FakeLive()


@pytest.fixture
def app(tmp_path, gemini):
    application = make_app(tmp_path)
    application.state.live_connect = gemini
    return application


@pytest.fixture
def client(app):
    # One event loop for every connection, as under uvicorn.
    with TestClient(app) as test_client:
        yield test_client


def start(**overrides: Any) -> dict[str, Any]:
    frame: dict[str, Any] = {
        "type": "start",
        "v": 1,
        "adultConfirmed": True,
        "history": [],
    }
    frame.update(overrides)
    return frame


def event(ws) -> dict[str, Any]:
    message = ws.receive()
    assert message.get("text") is not None, message
    assert FAKE_KEY not in message["text"]
    assert SECRET_DETAIL not in message["text"]
    return json.loads(message["text"])


def state(name: str, reason: str = "") -> dict[str, Any]:
    return live_session.state_event(name, reason)


def ready(ws, **overrides: Any) -> None:
    ws.send_json(start(**overrides))
    assert event(ws) == state("connecting")
    assert event(ws) == state("ready")


def wait_until(condition: Callable[[], Any]) -> None:
    deadline = time.monotonic() + 5
    while not condition():
        assert time.monotonic() < deadline, "condition never became true"
        time.sleep(0.005)


def close_code(ws) -> int:
    message = ws.receive()
    assert message["type"] == "websocket.close", message
    return message["code"]


# -- handshake --------------------------------------------------------------


def test_untrusted_origin_is_rejected_before_accept(client, gemini):
    with pytest.raises(WebSocketDisconnect) as refused:
        with client.websocket_connect(URL, headers={"origin": "https://evil.test"}):
            pass
    assert refused.value.code == 1008
    assert not gemini.configs


def test_trusted_origin_is_accepted(client):
    with client.websocket_connect(URL, headers={"origin": "tauri://localhost"}) as ws:
        ready(ws)


def test_api_key_is_required_when_configured(tmp_path, gemini):
    app = make_app(tmp_path, api_key="oj_sk_test")
    app.state.live_connect = gemini
    with TestClient(app) as client:
        with pytest.raises(WebSocketDisconnect) as refused:
            with client.websocket_connect(URL):
                pass
        assert refused.value.code == 1008
        headers = {"authorization": "Bearer oj_sk_test"}
        with client.websocket_connect(URL, headers=headers) as ws:
            ready(ws)


@pytest.mark.parametrize("value", [False, None, "true", 1])
def test_age_must_be_confirmed(client, gemini, value):
    with client.websocket_connect(URL) as ws:
        ws.send_json(start(adultConfirmed=value))
        error = event(ws)
        assert (error["code"], error["retryable"]) == ("age_unconfirmed", False)
        assert event(ws) == state("closed", "error")
        assert close_code(ws) == 1008
    assert not gemini.configs


def test_missing_key_is_reported(client, gemini, monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY")
    with client.websocket_connect(URL) as ws:
        ws.send_json(start())
        assert event(ws)["code"] == "no_key"
        assert event(ws) == state("closed", "error")
        assert close_code(ws) == 1000
    assert not gemini.configs


@pytest.mark.parametrize(
    "frame",
    ["not json", "[]", '{"type":"text","text":"hi"}', '{"type":"start","v":2}'],
)
def test_first_frame_must_be_start(client, gemini, frame):
    with client.websocket_connect(URL) as ws:
        ws.send_text(frame)
        assert event(ws)["code"] == "internal"
        assert event(ws) == state("closed", "error")
        assert close_code(ws) == 1008
    assert not gemini.configs


# -- configuration ----------------------------------------------------------


def test_configuration_is_built_by_the_server(client, gemini):
    history = [
        {"role": "system", "text": "CLIENT-SYSTEM"},
        {"role": "user", "text": "What is torque?"},
        {"role": "assistant", "text": "A turning effect."},
    ]
    with client.websocket_connect(URL) as ws:
        ready(ws, history=history, systemInstruction="CLIENT-OVERRIDE", tools=[])

    config = gemini.configs[0]
    instruction = config.system_instruction
    assert PERSONA in instruction
    assert "Answer first." in instruction  # the "Core method" note
    assert "Learner: What is torque?\nTutor: A turning effect." in instruction
    assert "show_on_board" in instruction and "Hinglish" in instruction
    assert "CLIENT-" not in instruction
    assert config.response_modalities == [types.Modality.AUDIO]
    voice = config.speech_config.voice_config.prebuilt_voice_config.voice_name
    assert voice == "Charon"
    assert config.thinking_config is None and config.proactivity is None
    assert config.session_resumption.handle is None
    assert config.context_window_compression.sliding_window is not None
    assert config.input_audio_transcription is not None
    assert config.output_audio_transcription is not None
    declared = config.tools[0].function_declarations
    assert [d.name for d in declared] == ["show_on_board", "change_app_setting"]
    assert {d.behavior for d in declared} == {types.Behavior.NON_BLOCKING}
    assert live_session.LIVE_MODEL == "gemini-3.8-live"


def test_recap_keeps_the_latest_turns_within_the_cap():
    turns = [Turn("user", f"turn-{i} " + "x" * 900) for i in range(30)]
    text = live_session.recap(turns)
    assert len(text) <= live_session.MAX_RECAP_CHARS
    assert "turn-29 " in text and "turn-0 " not in text
    assert text.index("turn-28 ") < text.index("turn-29 ")


# -- relay ------------------------------------------------------------------


def test_audio_and_text_reach_gemini_and_audio_comes_back(client, gemini):
    with client.websocket_connect(URL) as ws:
        ready(ws)
        session = gemini.sessions[0]
        ws.send_bytes(PCM)
        ws.send_bytes(b"\x00")  # not PCM16: dropped
        ws.send_text("garbage")  # ignored
        ws.send_json({"type": "text", "text": "  " + "q" * 5000})
        wait_until(lambda: session.audio and session.texts)
        assert session.audio == [PCM]
        assert session.mime_types == {"audio/pcm;rate=16000"}
        assert session.texts == ["q" * live_session.MAX_TEXT_CHARS]

        two_parts = types.Content(
            role="model", parts=[*audio(b"ab").parts, *audio(b"cd").parts]
        )
        session.push(server(model_turn=two_parts))
        assert ws.receive_bytes() == b"ab"
        assert ws.receive_bytes() == b"cd"


def test_every_field_and_several_turns(client, gemini):
    with client.websocket_connect(URL) as ws:
        ready(ws)
        session = gemini.sessions[0]
        session.push(
            server(
                input_transcription=types.Transcription(text="Namaste"),
                output_transcription=types.Transcription(text="Hello"),
                model_turn=audio(b"aa"),
                turn_complete=True,
            )
        )
        assert event(ws) == {
            "type": "transcript",
            "turnId": 1,
            "role": "user",
            "delta": "Namaste",
        }
        assert ws.receive_bytes() == b"aa"
        assert event(ws)["delta"] == "Hello"
        assert event(ws) == {"type": "turn_complete", "turnId": 1}

        # ``receive`` ended with the turn; the bridge must call it again.
        for turn in (2, 3):
            session.push(said("again"), done())
            assert event(ws)["turnId"] == turn
            assert event(ws) == {"type": "turn_complete", "turnId": turn}
        assert len(gemini.sessions) == 1


# -- tools ------------------------------------------------------------------


def test_board_is_shown_and_scheduled_by_whether_audio_started(client, gemini):
    args = {"title": "Newton", "markdown": "$F = ma$"}
    with client.websocket_connect(URL) as ws:
        ready(ws)
        session = gemini.sessions[0]
        session.push(tool("show_on_board", args, "first"))
        assert event(ws) == {"type": "board", "turnId": 1, **args}
        session.push(server(model_turn=audio(b"aa")))
        assert ws.receive_bytes() == b"aa"
        session.push(tool("show_on_board", args, "second"), done())
        assert event(ws)["type"] == "board"
        assert event(ws)["type"] == "turn_complete"
        # A new turn has produced no audio yet.
        session.push(tool("show_on_board", args, "third"))
        assert event(ws)["turnId"] == 2
        wait_until(lambda: len(session.responses) == 3)

    assert [r.id for r in session.responses] == ["first", "second", "third"]
    assert [r.scheduling for r in session.responses] == [
        types.FunctionResponseScheduling.WHEN_IDLE,
        types.FunctionResponseScheduling.SILENT,
        types.FunctionResponseScheduling.WHEN_IDLE,
    ]
    assert session.responses[0].name == "show_on_board"


def test_board_is_capped_and_empty_or_unknown_calls_show_nothing(client, gemini):
    with client.websocket_connect(URL) as ws:
        ready(ws)
        session = gemini.sessions[0]
        session.push(tool("show_on_board", {"title": "t"}, "empty"))
        session.push(tool("run_command", {"x": 1}, "unknown"))
        session.push(
            tool("show_on_board", {"title": "t" * 500, "markdown": "m" * 20000})
        )
        board = event(ws)
        wait_until(lambda: len(session.responses) == 3)

    assert len(board["title"]) == live_session.MAX_BOARD_TITLE_CHARS
    assert len(board["markdown"]) == live_session.MAX_BOARD_CHARS
    assert "error" in session.responses[0].response
    assert "error" in session.responses[1].response


def test_settings_change_is_only_a_validated_proposal(client, gemini):
    with client.websocket_connect(URL) as ws:
        ready(ws)
        session = gemini.sessions[0]
        session.push(
            tool("change_app_setting", {"setting": "api_key", "value": "x"}),
            tool("change_app_setting", {"setting": "voice_speed", "value": "9"}),
        )
        assert event(ws) == {
            "type": "action",
            "turnId": 1,
            "setting": "voice_speed",
            "value": "1.4",
        }
        wait_until(lambda: len(session.responses) == 2)
    assert "Press Apply" in session.responses[1].response["result"]


# -- interruption -----------------------------------------------------------


class SlowClient:
    """A WebSocket whose audio sends block until released."""

    def __init__(self) -> None:
        self.sent: list[Any] = []
        self.incoming: asyncio.Queue = asyncio.Queue()
        self.gate = asyncio.Event()
        self.sending = asyncio.Event()

    async def receive(self):
        return await self.incoming.get()

    async def send_bytes(self, data):
        self.sending.set()
        await self.gate.wait()
        self.sent.append(data)

    async def send_json(self, data):
        self.sent.append(data)

    async def close(self, code=1000):
        pass


async def _until(condition: Callable[[], Any]) -> None:
    async def poll():
        while not condition():
            await asyncio.sleep(0.002)

    await asyncio.wait_for(poll(), 5)


def test_interruption_purges_queued_audio_before_the_event():
    async def scenario():
        client, gemini = SlowClient(), FakeLive()
        bridge = LiveBridge(client, gemini)
        running = asyncio.create_task(bridge.run())
        await _until(lambda: gemini.sessions)
        session = gemini.sessions[0]
        session.push(server(model_turn=audio(b"11")))
        await asyncio.wait_for(client.sending.wait(), 5)
        session.push(
            server(model_turn=audio(b"22")),
            said("partly"),
            server(model_turn=audio(b"33"), interrupted=True),
            done(),
            server(model_turn=audio(b"44")),
        )
        await _until(lambda: session.incoming.empty() and bridge._turn_id == 2)
        await asyncio.sleep(0.02)
        client.gate.set()
        await _until(lambda: b"44" in client.sent)
        bridge.stop("stopped")
        await asyncio.wait_for(running, 5)
        return client.sent, session

    sent, session = asyncio.run(scenario())

    after_ready = sent[sent.index(b"11") :]
    assert [i for i in after_ready if isinstance(i, bytes)] == [b"11", b"44"]
    kinds = [i["type"] for i in after_ready if isinstance(i, dict)]
    assert kinds == ["transcript", "interrupted", "turn_complete", "state"]
    assert session.closed


def test_microphone_buffer_keeps_only_the_latest_two_seconds():
    bridge = LiveBridge(None, None)
    frames = [bytes([i]) * 16000 for i in range(10)]
    for frame in frames:
        bridge._queue_audio(frame)
    assert list(bridge._inputs) == frames[-4:]


# -- reconnection -----------------------------------------------------------


def test_go_away_reconnects_after_the_turn_with_the_handle(client, gemini):
    with client.websocket_connect(URL) as ws:
        ready(ws)
        first = gemini.sessions[0]
        first.push(
            handle("h-1"),
            handle("ignored", resumable=False),
            said("Still "),
            go_away(),
            said("talking."),
        )
        assert event(ws)["delta"] == "Still "
        assert event(ws)["delta"] == "talking."
        assert len(gemini.configs) == 1  # not in the middle of a turn
        first.push(done())
        assert event(ws)["type"] == "turn_complete"
        assert event(ws) == state("reconnecting", "go_away")
        assert event(ws) == state("ready")
        assert first.closed
        assert gemini.handles == [None, "h-1"]
        gemini.sessions[1].push(said("Back."))
        assert event(ws)["turnId"] == 2


def test_go_away_does_not_wait_past_its_deadline(client, gemini):
    with client.websocket_connect(URL) as ws:
        ready(ws)
        gemini.sessions[0].push(handle("h-1"), said("Long"), go_away("1s"))
        assert event(ws)["delta"] == "Long"
        assert event(ws) == {"type": "turn_complete", "turnId": 1}
        assert event(ws) == state("reconnecting", "go_away")
        assert event(ws) == state("ready")


def test_dropped_connection_resumes_and_keeps_microphone_audio(client, gemini):
    with client.websocket_connect(URL) as ws:
        ready(ws)
        gemini.failures = [OSError("offline")]
        gemini.sessions[0].push(handle("h-1"), closed_error())
        assert event(ws) == state("reconnecting", "connection_lost")
        ws.send_bytes(PCM)
        assert event(ws) == state("ready")
        # One network failure does not discard the handle.
        assert gemini.handles == [None, "h-1", "h-1"]
        wait_until(lambda: any(PCM in session.audio for session in gemini.sessions))


def test_failed_handle_starts_afresh_with_a_recap(client, gemini):
    with client.websocket_connect(URL) as ws:
        ready(ws)
        first = gemini.sessions[0]
        first.push(handle("h-1"), heard("Explain inertia"), said("Sure."), done())
        for _ in range(3):
            event(ws)
        gemini.failures = [closed_error(1008, "session not found")]
        first.push(closed_error())
        assert event(ws) == state("reconnecting", "connection_lost")
        assert event(ws) == state("ready")

    assert gemini.handles == [None, "h-1", None]
    instruction = gemini.configs[-1].system_instruction
    assert "Learner: Explain inertia\nTutor: Sure." in instruction
    assert "Explain inertia" not in gemini.configs[0].system_instruction


@pytest.mark.parametrize(
    ("failure", "code", "attempts"),
    [
        (closed_error(1007, "API key not valid."), "bad_key", 1),
        (closed_error(1011, "You exceeded your current quota"), "quota", 1),
        (OSError(SECRET_DETAIL), "network", 4),
        (RuntimeError(SECRET_DETAIL), "internal", 4),
    ],
)
def test_connection_failures_end_with_a_safe_error(
    client, gemini, caplog, failure, code, attempts
):
    gemini.failures = [failure] * 5
    with caplog.at_level(logging.DEBUG, logger="openjarvis.server.voice"):
        with client.websocket_connect(URL) as ws:
            ws.send_json(start())
            events = [event(ws)]
            while events[-1] != state("closed", "error"):
                events.append(event(ws))
            assert close_code(ws) == 1000
    assert events[-2]["code"] == code
    assert len(gemini.configs) == attempts
    assert FAKE_KEY not in caplog.text


def test_a_connection_that_keeps_dropping_gives_up(client, gemini):
    with client.websocket_connect(URL) as ws:
        ready(ws)
        for attempt in range(4):
            wait_until(lambda: len(gemini.sessions) > attempt)
            gemini.sessions[attempt].push(closed_error())
        events = [event(ws)]
        while events[-1] != state("closed", "error"):
            events.append(event(ws))
    assert events[-2]["code"] == "network"
    assert len(gemini.sessions) == 4


def test_close_codes_are_classified():
    from websockets.exceptions import ConnectionClosedError
    from websockets.frames import Close

    def code(exc):
        return live_session.classify(exc).code

    assert code(ConnectionClosedError(None, None)) == "network"
    assert code(ConnectionClosedError(Close(1011, "quota"), None)) == "quota"
    assert code(closed_error(1013)) == "busy"
    assert code(closed_error(429)) == "quota"
    assert code(TimeoutError()) == "network"


# -- ending -----------------------------------------------------------------


def test_stop_closes_both_sides(client, app, gemini):
    with client.websocket_connect(URL) as ws:
        ready(ws)
        ws.send_json({"type": "stop"})
        assert event(ws) == state("closed", "stopped")
        assert close_code(ws) == 1000
        assert gemini.sessions[0].closed
        wait_until(lambda: app.state.live_bridge is None)


def test_disconnect_cleans_up(client, app, gemini):
    with client.websocket_connect(URL) as ws:
        ready(ws)
        bridge = app.state.live_bridge
    wait_until(lambda: bridge.closed.is_set())
    assert gemini.sessions[0].closed
    assert app.state.live_bridge is None


def test_disconnect_leaves_no_tasks_behind():
    async def scenario():
        client, gemini = SlowClient(), FakeLive()
        before = asyncio.all_tasks()
        running = asyncio.create_task(LiveBridge(client, gemini).run())
        await _until(lambda: gemini.sessions)
        client.incoming.put_nowait({"type": "websocket.disconnect"})
        await asyncio.wait_for(running, 5)
        return asyncio.all_tasks() - before - {running}, gemini.sessions[0]

    leftover, session = asyncio.run(scenario())
    assert not leftover
    assert session.closed


def test_a_new_session_replaces_the_old_one(client, app, gemini):
    with client.websocket_connect(URL) as first:
        ready(first)
        with client.websocket_connect(URL) as second:
            second.send_json(start())
            assert event(first) == state("closed", "replaced")
            assert close_code(first) == 1000
            assert event(second) == state("connecting")
            assert event(second) == state("ready")
            assert gemini.sessions[0].closed
            assert not gemini.sessions[1].closed
            assert app.state.live_bridge is not None


def test_idle_session_is_stopped(client, gemini, monkeypatch):
    monkeypatch.setattr(live_session, "IDLE_TIMEOUT_SECONDS", 0.2)
    with client.websocket_connect(URL) as ws:
        ready(ws)
        ws.send_bytes(PCM)  # microphone frames alone are not speech
        assert event(ws) == state("closed", "idle")
        assert close_code(ws) == 1000
    assert gemini.sessions[0].closed


@pytest.mark.parametrize(
    "send",
    [
        lambda ws: ws.send_bytes(b"\x00" * (live_session.MAX_AUDIO_FRAME_BYTES + 2)),
        lambda ws: ws.send_text("x" * (live_session.MAX_CONTROL_CHARS + 1)),
    ],
)
def test_oversized_frames_close_the_session(client, gemini, send):
    with client.websocket_connect(URL) as ws:
        ready(ws)
        send(ws)
        assert event(ws)["code"] == "internal"
        assert event(ws) == state("closed", "error")
        assert close_code(ws) == 1009
    assert gemini.sessions[0].closed
    assert not gemini.sessions[0].audio


def test_real_sdk_accepts_the_configuration(monkeypatch):
    """The default connect function, with only the network socket faked."""
    from contextlib import asynccontextmanager

    from google.genai import live as genai_live

    wire: list[dict] = []

    class Socket:
        async def send(self, data):
            wire.append(json.loads(data))

        async def recv(self, decode=True):
            return b'{"setupComplete": {}}'

    @asynccontextmanager
    async def connect(uri, **kwargs):
        yield Socket()

    monkeypatch.setattr(genai_live, "ws_connect", connect)
    transport_log = logging.getLogger("websockets.client")
    previous = transport_log.level
    transport_log.setLevel(logging.DEBUG)

    async def scenario():
        config = live_session.live_config("instruction", "h-1")
        async with live_session.gemini_connect(config):
            pass

    try:
        asyncio.run(scenario())
        assert transport_log.level == logging.INFO
    finally:
        transport_log.setLevel(previous)

    setup = wire[0]["setup"]
    assert setup["model"] == "models/gemini-3.8-live"
    assert "Charon" in json.dumps(setup)
    assert "NON_BLOCKING" in json.dumps(setup["tools"])
    assert "h-1" in json.dumps(setup)
    assert "thinking" not in json.dumps(setup).lower()
