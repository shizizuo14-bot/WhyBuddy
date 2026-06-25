"""Python worker adapter (SlideRule AgentLoop 110).

Normalizes Python-side execution results (tools, tests, control checks) into
v2 runtime events compatible with Node/Grok/Codex streams.

- Produces AGENT_FIX_RESULT, GATE_RESULT, ARTIFACT_INDEXED (source="python")
- stdout/stderr bounded + redacted via central helpers
- Never raises for execution results: failures become events with ok:false
- Pure; no side effects, no shell from input, no secrets returned raw
"""

from typing import Any, Dict, Optional

# Imports with fallback for test env
try:
    from .agent_loop_event_schema import validate_event_envelope
except Exception:  # pragma: no cover
    from agent_loop_event_schema import validate_event_envelope  # type: ignore

try:
    from .agent_loop_redaction import redact_sensitive
except Exception:  # pragma: no cover
    from agent_loop_redaction import redact_sensitive  # type: ignore


MAX_OUTPUT = 16384  # bounded per acceptance (stdout/stderr)


def _bound_redact(text: Any) -> str:
    if text is None:
        return ""
    s = str(text)
    if len(s) > MAX_OUTPUT:
        s = s[:MAX_OUTPUT] + "\n... [truncated]"
    return redact_sensitive(s)


def _make_event(
    *,
    run_id: str,
    seq: int,
    source: str = "python",
    phase: str,
    type: str,
    task: Optional[str] = None,
    status: Optional[str] = None,
    payload: Optional[Dict[str, Any]] = None,
    artifacts: Optional[list] = None,
) -> Dict[str, Any]:
    ev: Dict[str, Any] = {
        "version": "agentloop.event.v2",
        "runId": str(run_id),
        "seq": int(seq),
        "ts": "2026-06-25T12:00:00.000Z",
        "source": source,
        "phase": phase,
        "type": type,
        "task": task,
        "status": status,
        "payload": dict(payload or {}),
        "artifacts": list(artifacts or []),
        "redaction": {"applied": True, "source": "python-worker-adapter"},
    }
    try:
        validated = validate_event_envelope(ev)
        return validated.model_dump()
    except Exception:
        # degrade but still return shape (schema will be asserted in callers)
        ev["payload"] = ev.get("payload") or {}
        ev["payload"]["_validate_failed"] = True
        return ev


def normalize_python_execution_result(
    result: Dict[str, Any],
    *,
    run_id: str,
    seq: int = 0,
    task: Optional[str] = None,
) -> Dict[str, Any]:
    """Normalize python execution result dict into a v2 event.

    result may contain: ok, exitCode, stdout, stderr, summary, artifacts, kind/type hints.
    Chooses AGENT_FIX_RESULT / GATE_RESULT / ARTIFACT_INDEXED.

    stdout/stderr: bounded + redacted.
    Any processing failure -> event (not exception) with ok:false.
    """
    if result is None or not isinstance(result, dict):
        result = {"__invalid__": True}

    try:
        if result.get("__invalid__"):
            raise ValueError("invalid python execution result input")

        # decide type/phase from hints or content
        kind = (result.get("kind") or result.get("type") or "").lower()
        has_artifact = "artifact" in kind or "indexed" in kind or bool(result.get("artifactId")) or bool(result.get("id") and "artifact" in str(result.get("id", "")).lower())
        is_gate = "gate" in kind or "GATE" in str(result.get("event_type", "")) or result.get("kind") == "gate"

        if has_artifact:
            ev_type = "ARTIFACT_INDEXED"
            phase = "fix"
            payload = {
                "id": _bound_redact(result.get("artifactId") or result.get("id") or "py-artifact"),
                "kind": _bound_redact(result.get("artifactKind") or result.get("kind") or "log"),
                "path": _bound_redact(result.get("path")),
            }
        elif is_gate:
            ev_type = "GATE_RESULT"
            phase = "gate"
            ok = result.get("ok")
            if ok is None:
                ok = (result.get("exitCode") or 0) == 0
            payload = {
                "ok": bool(ok),
                "summary": _bound_redact(result.get("summary") or result.get("message")),
            }
        else:
            # default to agent fix result for tool/test/fix executions
            ev_type = "AGENT_FIX_RESULT"
            phase = "fix"
            ok = result.get("ok")
            if ok is None:
                ok = (result.get("exitCode") or 0) == 0
            payload = {
                "ok": bool(ok),
                "summary": _bound_redact(result.get("summary") or result.get("message")),
                "stdout": _bound_redact(result.get("stdout")),
                "stderr": _bound_redact(result.get("stderr")),
                "exitCode": result.get("exitCode"),
            }

        def _sanitize_artifacts(arts: Any) -> list:
            if not isinstance(arts, list):
                return []
            def _r(x: Any) -> Any:
                if isinstance(x, str):
                    return _bound_redact(x)
                if isinstance(x, dict):
                    return {k: _r(v) for k, v in x.items()}
                if isinstance(x, list):
                    return [_r(i) for i in x]
                return x
            return [_r(a) for a in arts]

        return _make_event(
            run_id=run_id,
            seq=seq,
            phase=phase,
            type=ev_type,
            task=task,
            payload=payload,
            artifacts=_sanitize_artifacts(result.get("artifacts")),
        )
    except Exception as exc:
        # failures as events, never uncaught
        err_payload = {
            "ok": False,
            "error": "normalize_error",
            "message": _bound_redact(str(exc)),
        }
        return _make_event(
            run_id=run_id,
            seq=seq,
            phase="fix",
            type="AGENT_FIX_RESULT",
            task=task,
            payload=err_payload,
        )


__all__ = ["normalize_python_execution_result"]
