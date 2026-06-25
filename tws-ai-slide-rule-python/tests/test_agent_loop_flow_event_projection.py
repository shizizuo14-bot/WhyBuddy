"""agentloop flow event projection 110 renders stable nodes and edges from events

Pure reducer projection tests for SlideRule AgentLoop 110.
No live SSE, no fs, no external viz.
"""

from services.agent_loop_state_reducer import reduce_run_events


def test_agentloop_flow_event_projection_110_renders_stable_nodes_and_edges_from_events():
    # events with phases and seq for stable derived node ids
    events = [
        {"type": "RUN_STARTED", "phase": "start", "seq": 1, "runId": "run-110", "task": "test-flow"},
        {"type": "AGENT_FIX_STARTED", "phase": "fix", "seq": 2},
        {"type": "REVIEW_RESULT", "phase": "review", "seq": 3, "payload": {"verdict": "needs_work"}},
        # retry loop: review -> fix retry
        {"type": "AGENT_FIX_STARTED", "phase": "fix", "seq": 4},
        {"type": "GATE_RESULT", "phase": "gate", "seq": 5, "payload": {"ok": True, "summary": "passed"}},
        {"type": "RUN_FINALIZED", "phase": "finalize", "seq": 6, "payload": {"status": "DONE"}},
    ]

    snap = reduce_run_events(events)

    assert snap["runId"] == "run-110"
    nodes = snap["flowNodes"]
    edges = snap["flowEdges"]

    # first semantic nodes keep legacy ids, repeated phases get stable seq ids
    assert len(nodes) == 6
    assert nodes[0]["id"] == "queue"
    assert nodes[1]["id"] == "fix"
    assert nodes[2]["id"] == "review"
    assert nodes[3]["id"] == "fix-4"  # retry stable id via seq
    assert nodes[4]["id"] == "gate"
    assert nodes[5]["id"] == "finalize"

    # labels/types present
    assert nodes[0]["label"] == "Queue"
    assert nodes[2]["type"] == "review"

    # stable edges derived from order, include retry/review loop edges
    assert len(edges) == 5
    assert edges[0]["id"] == "e-queue-fix"
    assert edges[0]["source"] == "queue"
    assert edges[0]["target"] == "fix"
    assert edges[2]["id"] == "e-review-fix-4"  # stable loop edge
    assert edges[4]["id"] == "e-gate-finalize"

    # same input yields identical stable projection (deterministic)
    snap2 = reduce_run_events(events)
    assert snap2["flowNodes"] == nodes
    assert snap2["flowEdges"] == edges


def test_agentloop_flow_event_projection_110_empty_events_renders_empty_state():
    snap = reduce_run_events([])
    assert snap["flowNodes"] == []
    assert snap["flowEdges"] == []
    assert snap["status"] == "PENDING"
    assert not snap["finalized"]


def test_agentloop_flow_event_projection_110_legacy_events_no_crash_empty_flow():
    # legacy or malformed events must not crash, produce empty flow
    legacy = [
        {"foo": "bar", "old": True},
        {"type": None, "phase": None},
        "not-a-dict",
        None,
    ]
    snap = reduce_run_events(legacy)
    assert isinstance(snap["flowNodes"], list)
    assert snap["flowNodes"] == []
    assert snap["flowEdges"] == []


def test_agentloop_flow_event_projection_110_handles_non_list():
    snap = reduce_run_events(None)
    assert snap["flowNodes"] == []
    assert snap["flowEdges"] == []
