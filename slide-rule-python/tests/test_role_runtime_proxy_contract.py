"""Contract tests for the Blueprint role runtime Python proxy boundary.

This slice is intentionally non-executing. Python accepts the minimum role
runtime invoke/progress/callback contract shape, but it must not run a real
agent, load a role registry, call tools, or echo prompt/sensitive data.
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.role_runtime import (  # noqa: E402
    ROLE_RUNTIME_PROXY_CONTRACT_VERSION,
    build_role_runtime_callback_contract,
    build_role_runtime_invoke_contract,
    build_role_runtime_progress_contract,
)


def _invoke_payload(**overrides):
    payload = {
        "action": "invoke",
        "input": {
            "jobId": "job-role-runtime",
            "roleId": "researcher",
            "stageId": "spec_tree",
            "goalDigest": "sha256:goal",
            "goalLength": 42,
            "systemPromptDigest": "sha256:prompt",
            "systemPromptLength": 128,
            "contextKeys": ["artifactIds", "stage"],
            "budget": {"maxIterations": 2, "maxTokens": 512},
            "outputSchemaProvided": True,
        },
        "callback": {
            "callbackUrlProvided": True,
            "callbackSecretProvided": True,
        },
        "nodeControl": {
            "registryOwner": "node",
            "toolExecutionOwner": "node",
            "realAgentExecution": "disabled",
        },
    }
    payload.update(overrides)
    return payload


def test_invoke_contract_accepts_minimum_shape_without_agent_or_tool_side_effects():
    result = build_role_runtime_invoke_contract(_invoke_payload())

    assert result["ok"] is True
    assert result["action"] == "invoke"
    assert result["contractVersion"] == ROLE_RUNTIME_PROXY_CONTRACT_VERSION
    assert result["jobId"] == "job-role-runtime"
    assert result["roleId"] == "researcher"
    assert result["stageId"] == "spec_tree"
    assert result["status"] == "completed"
    assert result["executionMode"] == "lite"
    assert result["runtime"] == {
        "owner": "python",
        "mode": "proxy_contract",
        "agentExecution": "none",
        "toolsExecuted": False,
        "promptEchoed": False,
    }
    assert result["output"] == {
        "kind": "blueprint.role_runtime.proxy_contract",
        "accepted": True,
    }
    assert result["trace"] == []
    assert result["iterations"] == 0
    assert result["totalTokens"] == 0


def test_progress_contract_reports_state_without_echoing_progress_text_or_trace():
    sensitive_marker = "role-runtime-private-marker"
    result = build_role_runtime_progress_contract(
        {
            "action": "progress",
            "jobId": "job-role-runtime",
            "phase": "observing",
            "iteration": 2,
            "tokensUsed": 144,
            "message": f"tool output contained {sensitive_marker}",
            "trace": [{"thought": f"raw {sensitive_marker}"}],
        }
    )

    encoded = json.dumps(result, sort_keys=True)
    assert result["ok"] is True
    assert result["action"] == "progress"
    assert result["event"] == {
        "jobId": "job-role-runtime",
        "phase": "observing",
        "iteration": 2,
        "tokensUsed": 144,
        "messageProvided": True,
    }
    assert "trace" not in result["event"]
    assert sensitive_marker not in encoded


def test_callback_contract_declares_callback_without_echoing_secret():
    callback_marker = "callback-marker-value"
    result = build_role_runtime_callback_contract(
        {
            "action": "callback",
            "jobId": "job-role-runtime",
            "callbackUrl": "http://node.test/api/blueprint/agent/progress",
            "callbackSecret": callback_marker,
        }
    )

    encoded = json.dumps(result, sort_keys=True)
    assert result["ok"] is True
    assert result["action"] == "callback"
    assert result["callback"] == {
        "jobId": "job-role-runtime",
        "delivery": "declared",
        "callbackUrlProvided": True,
        "callbackSecretProvided": True,
        "secretEchoed": False,
    }
    assert callback_marker not in encoded


def test_runtime_error_shape_is_stable_and_retryable():
    result = build_role_runtime_invoke_contract(
        _invoke_payload(simulateRuntimeError="role worker unavailable")
    )

    assert result == {
        "ok": False,
        "action": "invoke",
        "contractVersion": ROLE_RUNTIME_PROXY_CONTRACT_VERSION,
        "error": "runtime_error",
        "message": "role worker unavailable",
        "jobId": "job-role-runtime",
        "retryable": True,
    }


def test_schema_invalid_cannot_pretend_to_be_success():
    result = build_role_runtime_invoke_contract(
        _invoke_payload(input={"jobId": "job-role-runtime", "roleId": "researcher"})
    )

    assert result["ok"] is False
    assert result["error"] == "schema_invalid"
    assert result["contractVersion"] == ROLE_RUNTIME_PROXY_CONTRACT_VERSION
    assert result.get("status") != "completed"
