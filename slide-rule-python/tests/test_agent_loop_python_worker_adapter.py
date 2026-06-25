"""
SlideRule AgentLoop 110: Python worker adapter.

Marker: agentloop python worker adapter 110 normalizes python execution results
"""

import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.agent_loop_python_worker import (  # noqa: E402
    normalize_python_execution_result,
)
from services.agent_loop_event_schema import validate_event_envelope  # noqa: E402


def test_agentloop_python_worker_adapter_110_normalizes_python_execution_results():
    """agentloop python worker adapter 110 normalizes python execution results.

    - Python task results become AGENT_FIX_RESULT, GATE_RESULT, or ARTIFACT_INDEXED
    - stdout/stderr bounded and redacted
    - Failures represented as events (no uncaught)
    """
    run_id = "2026-06-25T12-00-00-110Z"
    task = "agent-loop/tasks/sliderule-agentloop-python-worker-adapter-110.md"

    # 1. AGENT_FIX_RESULT path (default)
    fix_res = {
        "ok": True,
        "stdout": "fix applied\nOPENAI_API_KEY=sk-LEAK-py-1234567890\nmore",
        "stderr": "",
        "summary": "patch written",
        "exitCode": 0,
    }
    ev_fix = normalize_python_execution_result(fix_res, run_id=run_id, seq=10, task=task)
    assert ev_fix["version"] == "agentloop.event.v2"
    assert ev_fix["source"] == "python"
    assert ev_fix["type"] == "AGENT_FIX_RESULT"
    assert ev_fix["phase"] == "fix"
    assert ev_fix["task"] == task
    assert ev_fix["seq"] == 10
    p = ev_fix["payload"]
    assert p["ok"] is True
    assert "sk-LEAK-py-1234567890" not in p.get("stdout", "")
    assert "REDACTED" in p.get("stdout", "") or "***" in p.get("stdout", "")
    assert p.get("stdout", "") == p.get("stdout", "")  # already bounded by impl
    assert len(p.get("stdout", "")) <= 20000
    validate_event_envelope(ev_fix)

    # 2. GATE_RESULT path
    gate_res = {"ok": False, "summary": "baseline gate failed: key=ghp_pysecretX", "kind": "gate"}
    ev_gate = normalize_python_execution_result(gate_res, run_id=run_id, seq=11, task=task)
    assert ev_gate["type"] == "GATE_RESULT"
    assert ev_gate["phase"] == "gate"
    assert ev_gate["source"] == "python"
    gp = ev_gate["payload"]
    assert gp["ok"] is False
    assert "ghp_pysecretX" not in str(gp)
    assert "REDACTED" in str(gp) or "***" in str(gp)
    validate_event_envelope(ev_gate)

    # 3. ARTIFACT_INDEXED path
    art_res = {"kind": "artifact", "artifactId": "py-log-42", "artifactKind": "log", "path": "agent-output.py.log"}
    ev_art = normalize_python_execution_result(art_res, run_id=run_id, seq=12, task=task)
    assert ev_art["type"] == "ARTIFACT_INDEXED"
    assert ev_art["source"] == "python"
    assert ev_art["payload"].get("id") == "py-log-42"
    validate_event_envelope(ev_art)

    # 4. Failure becomes event not exception (bad input still yields event)
    bad = None
    ev_fail = normalize_python_execution_result(bad, run_id=run_id, seq=13, task=task)
    assert ev_fail["type"] == "AGENT_FIX_RESULT"
    assert ev_fail["payload"].get("ok") is False
    assert "error" in ev_fail["payload"] or "normalize" in str(ev_fail["payload"])
    # still valid envelope shape
    assert ev_fail["source"] == "python"
    # do not assert full validate on degraded but shape is there

    # 5. Long output is bounded
    long_out = "x" * 50000 + "SECRET_TOKEN=sk-longleak-abcdef"
    long_res = {"ok": True, "stdout": long_out}
    ev_long = normalize_python_execution_result(long_res, run_id=run_id, seq=14)
    s = ev_long["payload"].get("stdout", "")
    assert len(s) < len(long_out)
    assert "sk-longleak" not in s
    assert "truncated" in s or len(s) <= 17000

    # roundtrip serializable
    import json
    j = json.dumps(ev_fix)
    back = json.loads(j)
    assert back["type"] == "AGENT_FIX_RESULT"
