"""Test for A2A session-stream runtime slice 103.

Python-owned minimal session / stream / cancel slice.
- Covers create session, append stream chunks, cancel.
- Explicitly asserts this is slice only, no production transport takeover.
- consumption by bridge with fallback is tested on Node side.
- Does not replace invoke contract or readiness cutover.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.a2a_session_stream_runtime_slice import (  # noqa: E402
    CONTRACT_VERSION,
    PROVENANCE,
    create_a2a_session_slice,
    append_stream_chunk_slice,
    cancel_a2a_session_slice,
    get_a2a_session_slice,
)
from services.a2a_production_transport_ownership_closure import (
    decide_a2a_production_transport_ownership_closure,
)


def _envelope(session_id: str = "slice-103-1", method: str = "a2a.stream") -> dict:
    return {
        "jsonrpc": "2.0",
        "method": method,
        "id": session_id,
        "params": {
            "targetAgent": "slice-agent",
            "task": "test slice",
            "context": "slice test context",
            "capabilities": [],
            "streamMode": True,
        },
        "auth": "slice-token",
    }


def test_session_stream_slice_creates_python_owned_pending_session():
    result = create_a2a_session_slice({"envelope": _envelope("sess-1")})
    assert result["ok"] is True
    assert result["contractVersion"] == CONTRACT_VERSION
    assert result["provenance"] == PROVENANCE
    assert result["runtime"]["owner"] == "python"
    assert result["runtime"]["mode"] == "session_stream_slice"
    assert result["status"] == "pending"
    assert result["session"]["sessionId"] == "sess-1"
    assert result["session"]["status"] == "pending"


def test_session_stream_slice_appends_chunk_and_completes():
    sess = create_a2a_session_slice({"envelope": _envelope("sess-stream")})["session"]
    chunk = {"jsonrpc": "2.0", "id": "sess-stream", "chunk": "hello partial", "done": False}
    running = append_stream_chunk_slice("sess-stream", chunk, sess)
    assert running["ok"] is True
    assert running["status"] == "running"
    assert running["streamChunk"]["done"] is False
    assert len(running["session"]["streamChunks"]) == 1

    done_chunk = {"jsonrpc": "2.0", "id": "sess-stream", "chunk": "final", "done": True}
    completed = append_stream_chunk_slice("sess-stream", done_chunk, running["session"])
    assert completed["status"] == "completed"
    assert completed["session"]["status"] == "completed"
    assert completed["session"]["completedAt"] is not None


def test_session_stream_slice_cancel_path_is_not_completed():
    res = cancel_a2a_session_slice("sess-cancel", _envelope("sess-cancel", "a2a.cancel"))
    assert res["ok"] is False
    assert res["status"] == "cancelled"
    assert res["session"]["status"] == "cancelled"
    assert res["error"]["code"] == -32005
    # never treated as success complete
    assert "result" not in res.get("response", {})


def test_session_stream_slice_get_and_ownership_closure_no_takeover():
    created = create_a2a_session_slice({"envelope": _envelope("get-sess")})
    got = get_a2a_session_slice("get-sess", created.get("session"))
    assert got["ok"] is True
    assert got["runtime"]["owner"] == "python"

    own = decide_a2a_production_transport_ownership_closure({"area": "stream"})
    assert own.get("productionTakeover") is False
    assert own["ownership"]["realStreamTransport"] == "node-retained"
    assert own["ownership"]["sessionStreamSliceDecision"] == "python-owned"
    assert own.get("note") and "retained" in own["note"]
