"""Gemini thought signatures (bytes) never break trace saving."""

from __future__ import annotations

import base64
import sqlite3
from types import SimpleNamespace as NS
from unittest.mock import MagicMock

import pytest

from openjarvis.agents.orchestrator import OrchestratorAgent
from openjarvis.core.events import EventBus
from openjarvis.core.types import StepType, ToolResult, Trace, TraceStep
from openjarvis.telemetry.instrumented_engine import InstrumentedEngine
from openjarvis.tools._stubs import BaseTool, ToolSpec
from openjarvis.traces.collector import TraceCollector
from openjarvis.traces.store import TraceStore

SIGNATURE = b"\x12\xff\x00signature"


@pytest.fixture
def store(tmp_path):
    trace_store = TraceStore(tmp_path / "traces.db")
    yield trace_store
    trace_store.close()


def _trace(**kwargs) -> Trace:
    return Trace(query="q", agent="a", model="m", result="r", **kwargs)


def test_bytes_are_saved_as_base64(store):
    trace = _trace(
        metadata={"sig": SIGNATURE},
        messages=[{"sig": bytearray(SIGNATURE)}],
        steps=[
            TraceStep(
                step_type=StepType.GENERATE,
                timestamp=1.0,
                output={"tool_calls": [{"thought_signature": SIGNATURE}]},
            )
        ],
    )

    store.save(trace)

    saved = store.get(trace.trace_id)
    encoded = base64.b64encode(SIGNATURE).decode()
    assert saved.metadata["sig"] == encoded
    assert saved.messages[0]["sig"] == encoded
    assert saved.steps[0].output["tool_calls"][0]["thought_signature"] == encoded


def test_failed_save_is_rolled_back(store):
    bad = _trace(
        steps=[
            TraceStep(step_type=StepType.RESPOND, timestamp=1.0, output={"x": object()})
        ]
    )

    with pytest.raises(TypeError):
        store.save(bad)

    assert not store._conn.in_transaction
    store.save(_trace())
    assert store.count() == 1
    assert store.get(bad.trace_id) is None
    assert len(store.search("q")) == 1
    other = sqlite3.connect(store._db_path)
    try:
        assert other.execute("SELECT COUNT(*) FROM trace_steps").fetchone()[0] == 0
    finally:
        other.close()


class _Echo(BaseTool):
    tool_id = "echo"

    @property
    def spec(self) -> ToolSpec:
        return ToolSpec(
            name="echo",
            description="echo",
            parameters={"type": "object", "properties": {}},
        )

    def execute(self, **params) -> ToolResult:
        return ToolResult(tool_name="echo", content="echoed", success=True)


def test_orchestrator_run_with_gemini_signature_saves_a_trace(store):
    pytest.importorskip("google.genai")
    from openjarvis.engine.cloud import CloudEngine

    def response(*parts):
        return NS(
            candidates=[NS(content=NS(parts=list(parts)), finish_reason="STOP")],
            usage_metadata=NS(prompt_token_count=3, candidates_token_count=2),
            text=None,
        )

    call = NS(
        function_call=NS(name="echo", args={}),
        text=None,
        thought_signature=SIGNATURE,
    )
    cloud = CloudEngine.__new__(CloudEngine)
    cloud._thought_sigs = {}
    cloud._google_client = MagicMock()
    cloud._google_client.models.generate_content.side_effect = [
        response(call),
        response(NS(text="finished", function_call=None)),
    ]
    bus = EventBus()
    agent = OrchestratorAgent(
        InstrumentedEngine(cloud, bus),
        "gemini-3-flash-preview",
        tools=[_Echo()],
        bus=bus,
    )
    collector = TraceCollector(agent, store=store, bus=bus)

    result = collector.run("use the tool")

    assert result.content == "finished"
    saved = store.get(collector.last_trace.trace_id)
    generated = [s for s in saved.steps if s.step_type == StepType.GENERATE]
    assert "thought_signature" not in generated[0].output["tool_calls"][0]
    # The second request replayed the signature beside the function call.
    contents = cloud._google_client.models.generate_content.call_args.kwargs["contents"]
    replayed = [
        part
        for content in contents
        for part in content["parts"]
        if "function_call" in part
    ]
    assert replayed[0]["thought_signature"] == SIGNATURE
