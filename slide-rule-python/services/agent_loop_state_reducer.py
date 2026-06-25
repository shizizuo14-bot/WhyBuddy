"""AgentLoop v2 deterministic state reducer (SlideRule AgentLoop 110).

Pure reducer: list of normalized v2 events -> deterministic runtime snapshot.
No filesystem access. No raw log text parsing for status decisions.
RUN_FINALIZED is the sole driver for final done state.
REVIEW_RESULT and GATE_RESULT are authoritative for their domains.
Flow nodes/edges use stable ids derived from event order.
"""

from typing import Any, Dict, List, Optional


def reduce_run_events(events: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Pure reducer over v2 events.

    Always returns the same snapshot for the same input event list (order preserved).
    """
    if not isinstance(events, list):
        events = []

    snap: Dict[str, Any] = {
        "runId": None,
        "task": None,
        "status": "PENDING",
        "phase": None,
        "activeAgent": None,
        "currentIteration": 0,
        "gate": None,
        "reviewVerdict": None,
        "artifacts": [],
        "flowNodes": [],
        "flowEdges": [],
        "timeline": [],
        "finalized": False,
    }

    flow_order: List[str] = []
    seen_node_ids: set = set()

    def _flow_node_id(base: str, event: Dict[str, Any]) -> str:
        if base not in seen_node_ids:
            return base
        ev_seq = event.get("seq")
        if ev_seq is not None:
            return f"{base}-{ev_seq}"
        return f"{base}-{len(flow_order)}"

    def _append_flow_node(base: str, node_type: str, label: str, event: Dict[str, Any]) -> None:
        nid = _flow_node_id(base, event)
        if nid in seen_node_ids:
            return
        snap["flowNodes"].append({"id": nid, "type": node_type, "label": label})
        seen_node_ids.add(nid)
        flow_order.append(nid)

    for e in events:
        if not isinstance(e, dict):
            continue

        if snap["runId"] is None:
            rid = e.get("runId")
            if isinstance(rid, str):
                snap["runId"] = rid

        if snap["task"] is None:
            t = e.get("task")
            if isinstance(t, str):
                snap["task"] = t

        typ: str = e.get("type") or ""
        phase: Optional[str] = e.get("phase")
        payload: Dict[str, Any] = e.get("payload") or {}
        src: Optional[str] = e.get("source")

        if typ == "RUN_STARTED":
            snap["status"] = payload.get("status") or "RUNNING"
            if phase:
                snap["phase"] = phase
            if not snap["activeAgent"] and src:
                snap["activeAgent"] = src
            _append_flow_node("queue", "start", "Queue", e)

        elif typ in ("GATE_RESULT", "BASELINE_GATE_RESULT", "POST_FIX_GATE_RESULT"):
            snap["gate"] = {
                "ok": bool(payload.get("ok")) if "ok" in payload else None,
                "summary": payload.get("summary") or payload.get("message") or payload.get("status"),
            }
            if phase:
                snap["phase"] = phase
            _append_flow_node("gate", "gate", "Gate check", e)

        elif typ == "REVIEW_RESULT":
            # REVIEW_RESULT controls review verdict exclusively
            verdict = payload.get("verdict")
            if verdict is None:
                verdict = payload.get("result") or payload.get("status") or payload
            snap["reviewVerdict"] = verdict
            if phase:
                snap["phase"] = phase
            _append_flow_node("review", "review", "Review", e)

        elif typ == "RUN_FINALIZED":
            # RUN_FINALIZED is required for final done state
            snap["finalized"] = True
            snap["status"] = payload.get("status") or "DONE"
            if phase:
                snap["phase"] = phase
            _append_flow_node("finalize", "finalize", "Finalized", e)

        elif typ == "RUN_FAILED":
            snap["status"] = "FAILED"
            snap["finalized"] = True
            if phase:
                snap["phase"] = phase
            _append_flow_node("finalize", "finalize", "Finalized", e)

        elif typ in ("AGENT_FIX_STARTED", "AGENT_FIX_RESULT"):
            if phase:
                snap["phase"] = phase
            _append_flow_node("fix", "fix", "Agent fix", e)

        elif typ == "AGENT_LOG":
            # timeline records references, does not parse msg for status
            entry = {
                "seq": e.get("seq"),
                "ts": e.get("ts"),
                "source": src,
                "phase": phase,
            }
            snap["timeline"].append(entry)
            if not snap["activeAgent"] and src:
                snap["activeAgent"] = src

        # accumulate artifacts (dedup by identity in list)
        for art in (e.get("artifacts") or []):
            if art not in snap["artifacts"]:
                snap["artifacts"].append(art)

    # derive stable edges from encounter order
    snap["flowEdges"] = []
    for i in range(len(flow_order) - 1):
        sid = flow_order[i]
        tid = flow_order[i + 1]
        eid = f"e-{sid}-{tid}"
        snap["flowEdges"].append({"id": eid, "source": sid, "target": tid})

    return snap
