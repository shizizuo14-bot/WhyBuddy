"""Runtime bridge tests for the Python-side A2A invoke/list/cancel slice."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.a2a_runtime import (  # noqa: E402
    A2A_ERROR_CANCELLED,
    A2A_RUNTIME_CONTRACT_VERSION,
    cancel_a2a_runtime_bridge,
    invoke_a2a_runtime_bridge,
    list_a2a_runtime_agents,
)


def _params() -> dict:
    return {
        "targetAgent": "bridge-agent",
        "task": "Bridge the A2A invoke result",
        "context": "Runtime bridge test.",
        "capabilities": ["summarize"],
        "streamMode": False,
    }


def _envelope(method: str = "a2a.invoke") -> dict:
    return {
        "jsonrpc": "2.0",
        "method": method,
        "id": "a2a-bridge-1",
        "params": _params(),
        "auth": "bridge-token",
    }


def _agent() -> dict:
    return {
        "id": "bridge-agent",
        "name": "Bridge Agent",
        "capabilities": ["summarize"],
        "description": "Deterministic A2A bridge fixture, not a real agent.",
    }


def test_invoke_bridge_returns_completed_session_without_external_agent():
    result = invoke_a2a_runtime_bridge(
        envelope=_envelope(),
        output="Bridge response.",
        framework_type="custom",
        metadata={"source": "bridge-test"},
        started_at=1710000000000,
        completed_at=1710000000001,
    ).model_dump(exclude_none=True)

    assert result["contractVersion"] == A2A_RUNTIME_CONTRACT_VERSION
    assert result["runtime"] == "python-contract"
    assert result["operation"] == "invoke"
    assert result["ok"] is True
    assert result["status"] == "completed"
    assert result["response"]["result"]["output"] == "Bridge response."
    assert result["response"]["result"]["metadata"] == {"source": "bridge-test"}
    assert result["session"]["status"] == "completed"
    assert result["session"]["requestEnvelope"] == result["envelope"]
    assert result["session"]["response"] == result["response"]


def test_invoke_bridge_preserves_failure_as_failed_not_completed():
    result = invoke_a2a_runtime_bridge(
        envelope=_envelope(),
        framework_type="custom",
        error={
            "code": -32006,
            "message": "Python A2A bridge failed.",
            "data": {"retryable": False},
        },
    ).model_dump(exclude_none=True)

    assert result["ok"] is False
    assert result["status"] == "failed"
    assert "result" not in result["response"]
    assert result["response"]["error"]["message"] == "Python A2A bridge failed."
    assert result["session"]["status"] == "failed"


def test_list_agents_bridge_returns_completed_agent_inventory():
    result = list_a2a_runtime_agents([_agent()]).model_dump(exclude_none=True)

    assert result == {
        "contractVersion": A2A_RUNTIME_CONTRACT_VERSION,
        "runtime": "python-contract",
        "operation": "list_agents",
        "ok": True,
        "status": "completed",
        "agents": [_agent()],
    }


def test_cancel_bridge_returns_cancelled_error_not_completed():
    result = cancel_a2a_runtime_bridge(
        envelope=_envelope("a2a.cancel"),
        session_id="a2a-bridge-1",
        framework_type="custom",
    ).model_dump(exclude_none=True)

    assert result["ok"] is False
    assert result["status"] == "cancelled"
    assert result["error"]["code"] == A2A_ERROR_CANCELLED
    assert result["response"]["error"] == result["error"]
    assert result["session"]["status"] == "cancelled"
    assert "result" not in result["response"]
