"""AgentLoop normalized event snapshots and SSE stream framing (SlideRule 108).

Python-owned deterministic formatting for dashboard-driven refresh.
Uses finite generators for testability; no live worker or long sleeps required.
Does not write Node events.
"""

import json
import time
from typing import Any, Dict, Generator, Iterable, List, Optional

from .agent_loop_event_store import read_events
from .agent_loop_state_reducer import reduce_run_events


def build_event_snapshot(
    state: Dict[str, Any],
    *,
    phase: Optional[str] = None,
    updated_at: Optional[str] = None,
    active_agent: Optional[str] = None,
    gate_summary: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Return normalized snapshot including required fields.

    Keys: status, phase, updatedAt, activeAgent, latestGateSummary (present only if provided or in state).
    """
    if not isinstance(state, dict):
        state = {}

    # derive latest gate summary when present in state (iterations last gate or top level)
    derived_gate = gate_summary
    if derived_gate is None:
        iters = state.get("iterations") or []
        if isinstance(iters, list) and iters:
            last = iters[-1]
            if isinstance(last, dict):
                derived_gate = last.get("gate") or last.get("gateSummary") or last.get("gateSnapshot")
        if derived_gate is None:
            derived_gate = state.get("gate") or state.get("latestGateSummary") or state.get("baselineGate")

    snap: Dict[str, Any] = {
        "status": state.get("status"),
        "phase": phase if phase is not None else state.get("phase") or state.get("currentPhase"),
        "updatedAt": updated_at if updated_at is not None else state.get("updatedAt") or state.get("lastUpdated") or state.get("runTimeUtc"),
        "activeAgent": active_agent if active_agent is not None else state.get("activeAgent") or ((state.get("activeAgentLog") or {}) if isinstance(state.get("activeAgentLog"), dict) else {}).get("agent"),
        "latestGateSummary": derived_gate,
    }
    # omit key or set null if absent? include always, value may be None when not present
    return snap


def format_sse_frame(event_name: str, data: Dict[str, Any]) -> str:
    """Produce one SSE frame using event: and data: lines with compact JSON."""
    payload = json.dumps(data, separators=(",", ":"))
    return f"event: {event_name}\ndata: {payload}\n\n"


def iter_agent_loop_sse_frames(
    states: Iterable[Dict[str, Any]],
    event_name: str = "state",
) -> Generator[str, None, None]:
    """Yield SSE frames for an iterable of (raw or snapshot) states.

    Designed to be consumed as finite generator in tests (no infinite loop).
    """
    for st in states:
        if isinstance(st, dict) and "status" in st and "phase" in st:
            # treat as already snapshot
            snap = st
        else:
            snap = build_event_snapshot(st if isinstance(st, dict) else {})
        yield format_sse_frame(event_name, snap)


def iter_agent_loop_v2_sse_frames(
    events: Iterable[Dict[str, Any]],
) -> Generator[str, None, None]:
    """Yield SSE frames replaying each normalized v2 event (as 'event') then a final 'snapshot' from reducer.

    Stable event names, compact JSON via format_sse_frame. Finite generator only.
    """
    evs: List[Dict[str, Any]] = list(events) if events is not None else []
    for e in evs:
        if isinstance(e, dict):
            yield format_sse_frame("event", e)
    snap = reduce_run_events(evs)
    yield format_sse_frame("snapshot", snap)


def _is_terminal_event(event: Dict[str, Any]) -> bool:
    text = str(event.get("type") or "").upper()
    status = str(event.get("status") or ((event.get("payload") or {}) if isinstance(event.get("payload"), dict) else {}).get("status") or "").upper()
    return text in {"RUN_FINALIZED", "RUN_FAILED", "QUEUE_FINISHED"} or status in {"DONE", "FAILED", "EXITED", "COMPLETED"}


def iter_agent_loop_live_v2_sse_frames(
    run_id: str,
    *,
    read_events_fn=read_events,
    poll_interval_seconds: float = 1.0,
    max_idle_polls: Optional[int] = None,
) -> Generator[str, None, None]:
    """Tail v2 event JSONL and yield SSE frames as new events appear."""
    last_seq = -1
    seen_events: List[Dict[str, Any]] = []
    idle_polls = 0
    while True:
        events = read_events_fn(run_id, limit=1000) or []
        new_events = [
            event for event in events
            if isinstance(event, dict) and isinstance(event.get("seq"), int) and int(event.get("seq")) > last_seq
        ]

        if new_events:
            idle_polls = 0
            for event in sorted(new_events, key=lambda item: int(item.get("seq") or 0)):
                last_seq = max(last_seq, int(event.get("seq") or 0))
                seen_events.append(event)
                yield format_sse_frame("event", event)
                if _is_terminal_event(event):
                    yield format_sse_frame("snapshot", reduce_run_events(seen_events))
                    return
        else:
            idle_polls += 1
            if max_idle_polls is not None and idle_polls >= max_idle_polls:
                return

        if poll_interval_seconds > 0:
            time.sleep(poll_interval_seconds)
