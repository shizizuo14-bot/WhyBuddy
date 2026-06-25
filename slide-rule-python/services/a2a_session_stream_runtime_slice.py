"""A2A session-stream runtime slice (103).

Minimal Python-owned runtime slice for A2A session / stream / cancel state projection.
This slice owns in-memory session state management and stream chunk accumulation
for the python runtime decision boundary.

IMPORTANT:
- This does NOT implement or own production transport.
- Real streaming transport, registry write, external agent execution remain node-retained
  or external-agent-required (see a2a_production_transport_ownership_closure).
- Not a replacement for a2a.invoke/stream contract or readiness; those remain separate.
- Provides testable python slice for session/stream/cancel paths when Node bridge
  elects to delegate slice (otherwise clear fallback to node/external).
"""

from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

CONTRACT_VERSION = "a2a.session-stream-runtime-slice.v1"
PROVENANCE = "python-a2a-session-stream-runtime-slice-103"

A2ASessionStatus = Literal["pending", "running", "completed", "failed", "cancelled"]


def _now_ms() -> int:
    # deterministic for tests; in real would use time
    return 1710000000000


def _make_error(code: int, message: str) -> Dict[str, Any]:
    return {"code": code, "message": message}


def _make_response(session_id: str, result: Optional[Dict[str, Any]] = None, error: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    if result is not None:
        return {"jsonrpc": "2.0", "id": session_id, "result": result}
    return {"jsonrpc": "2.0", "id": session_id, "error": error}


def _make_session(
    session_id: str,
    envelope: Dict[str, Any],
    status: A2ASessionStatus,
    framework_type: str = "custom",
    started_at: Optional[int] = None,
    completed_at: Optional[int] = None,
    response: Optional[Dict[str, Any]] = None,
    stream_chunks: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    return {
        "sessionId": session_id,
        "requestEnvelope": envelope,
        "status": status,
        "frameworkType": framework_type,
        "startedAt": started_at or _now_ms(),
        "completedAt": completed_at,
        "response": response,
        "streamChunks": stream_chunks or [],
    }


def create_a2a_session_slice(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Create and return a python-owned session slice (no transport side effect)."""
    if not isinstance(payload, dict):
        return {
            "ok": False,
            "status": "failed",
            "error": _make_error(-32602, "invalid payload"),
            "contractVersion": CONTRACT_VERSION,
            "provenance": PROVENANCE,
            "runtime": {"owner": "python", "mode": "session_stream_slice"},
        }
    envelope = payload.get("envelope") or {"id": "slice-sess-1", "method": "a2a.invoke", "params": {}}
    session_id = str(envelope.get("id") or payload.get("sessionId") or "slice-sess-1")
    framework = payload.get("frameworkType", "custom")
    session = _make_session(session_id, envelope, "pending", framework)
    return {
        "ok": True,
        "status": "pending",
        "session": session,
        "contractVersion": CONTRACT_VERSION,
        "provenance": PROVENANCE,
        "runtime": {"owner": "python", "mode": "session_stream_slice"},
    }


def append_stream_chunk_slice(session_id: str, chunk: Dict[str, Any], session_state: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Append a stream chunk to the python-owned session slice.

    Returns updated session slice state. Does not perform real wire transport.
    """
    if not session_id or not isinstance(chunk, dict):
        return {
            "ok": False,
            "status": "failed",
            "error": _make_error(-32602, "invalid stream chunk"),
            "contractVersion": CONTRACT_VERSION,
            "provenance": PROVENANCE,
            "runtime": {"owner": "python", "mode": "session_stream_slice"},
        }
    chunks: List[Dict[str, Any]] = []
    if session_state and isinstance(session_state.get("streamChunks"), list):
        chunks = list(session_state["streamChunks"])
    chunks.append(chunk)
    done = bool(chunk.get("done"))
    status: A2ASessionStatus = "completed" if done else "running"
    completed_at = _now_ms() if done else None
    session = _make_session(
        session_id,
        session_state.get("requestEnvelope", {}) if session_state else {"id": session_id},
        status,
        completed_at=completed_at,
        stream_chunks=chunks,
    )
    return {
        "ok": True,
        "status": status,
        "session": session,
        "streamChunk": chunk,
        "contractVersion": CONTRACT_VERSION,
        "provenance": PROVENANCE,
        "runtime": {"owner": "python", "mode": "session_stream_slice"},
    }


def cancel_a2a_session_slice(session_id: str, envelope: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Cancel a session in the python slice. Never reports as completed success."""
    if not session_id:
        session_id = "slice-cancel-1"
    env = envelope or {"id": session_id, "method": "a2a.cancel", "params": {}}
    error = _make_error(-32005, "A2A session cancelled.")
    response = _make_response(session_id, error=error)
    session = _make_session(
        session_id,
        env,
        "cancelled",
        response=response,
    )
    return {
        "ok": False,
        "status": "cancelled",
        "session": session,
        "error": error,
        "response": response,
        "contractVersion": CONTRACT_VERSION,
        "provenance": PROVENANCE,
        "runtime": {"owner": "python", "mode": "session_stream_slice"},
    }


def get_a2a_session_slice(session_id: str, session_state: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Retrieve current python slice session state."""
    if session_state:
        return {
            "ok": True,
            "status": session_state.get("status", "running"),
            "session": session_state,
            "contractVersion": CONTRACT_VERSION,
            "provenance": PROVENANCE,
            "runtime": {"owner": "python", "mode": "session_stream_slice"},
        }
    return {
        "ok": False,
        "status": "failed",
        "error": _make_error(-32602, "session not found in slice"),
        "contractVersion": CONTRACT_VERSION,
        "provenance": PROVENANCE,
        "runtime": {"owner": "python", "mode": "session_stream_slice"},
    }


# aliases for bridge
create_session = create_a2a_session_slice
append_stream = append_stream_chunk_slice
cancel_session = cancel_a2a_session_slice
get_session = get_a2a_session_slice
