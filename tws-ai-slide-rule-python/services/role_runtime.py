"""Minimal Blueprint role runtime proxy contract.

Python owns only the contract shape in this slice. The real role registry,
agent loop, prompt handling, callback delivery, and tool execution remain
Node-owned.
"""

from __future__ import annotations

from typing import Any


ROLE_RUNTIME_PROXY_CONTRACT_VERSION = "blueprint.role-runtime.proxy.v1"


def _is_record(value: Any) -> bool:
    return isinstance(value, dict)


def _non_empty_string(value: Any) -> bool:
    return isinstance(value, str) and len(value) > 0


def _safe_int(value: Any, default: int = 0) -> int:
    if isinstance(value, bool):
        return default
    if isinstance(value, int):
        return max(0, value)
    return default


def _action(payload: dict[str, Any], fallback: str) -> str:
    value = payload.get("action")
    return value if isinstance(value, str) and value else fallback


def _job_id_from_payload(payload: dict[str, Any]) -> str | None:
    candidate = payload.get("jobId")
    if isinstance(candidate, str) and candidate:
        return candidate
    input_payload = payload.get("input")
    if isinstance(input_payload, dict):
        input_job_id = input_payload.get("jobId")
        if isinstance(input_job_id, str) and input_job_id:
            return input_job_id
    return None


def _schema_invalid(
    action: str,
    message: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    result: dict[str, Any] = {
        "ok": False,
        "action": action,
        "contractVersion": ROLE_RUNTIME_PROXY_CONTRACT_VERSION,
        "error": "schema_invalid",
        "message": message,
    }
    job_id = _job_id_from_payload(payload)
    if job_id:
        result["jobId"] = job_id
    return result


def _runtime_error(action: str, message: str, payload: dict[str, Any]) -> dict[str, Any]:
    result: dict[str, Any] = {
        "ok": False,
        "action": action,
        "contractVersion": ROLE_RUNTIME_PROXY_CONTRACT_VERSION,
        "error": "runtime_error",
        "message": message,
        "retryable": True,
    }
    job_id = _job_id_from_payload(payload)
    if job_id:
        result["jobId"] = job_id
    return result


def _validate_invoke_input(value: Any) -> dict[str, Any] | str:
    if not _is_record(value):
        return "input must be an object."
    for key in ("jobId", "roleId", "stageId"):
        if not _non_empty_string(value.get(key)):
            return f"input.{key} must be a non-empty string."
    if not isinstance(value.get("goalLength"), int) or value["goalLength"] < 0:
        return "input.goalLength must be a non-negative integer."
    if (
        not isinstance(value.get("systemPromptLength"), int)
        or value["systemPromptLength"] < 0
    ):
        return "input.systemPromptLength must be a non-negative integer."
    if not _non_empty_string(value.get("goalDigest")):
        return "input.goalDigest must be a non-empty string."
    if not _non_empty_string(value.get("systemPromptDigest")):
        return "input.systemPromptDigest must be a non-empty string."
    context_keys = value.get("contextKeys")
    if not isinstance(context_keys, list) or not all(
        isinstance(item, str) for item in context_keys
    ):
        return "input.contextKeys must be an array of strings."
    budget = value.get("budget")
    if not _is_record(budget):
        return "input.budget must be an object."
    return value


def build_role_runtime_invoke_contract(payload: dict[str, Any]) -> dict[str, Any]:
    """Return a stable non-executing invoke contract result."""

    action = _action(payload, "invoke")
    if action != "invoke":
        return _schema_invalid(action, "action must be invoke.", payload)

    simulated_error = payload.get("simulateRuntimeError")
    if isinstance(simulated_error, str) and simulated_error:
        return _runtime_error("invoke", simulated_error, payload)

    validated = _validate_invoke_input(payload.get("input"))
    if isinstance(validated, str):
        return _schema_invalid("invoke", validated, payload)

    return {
        "ok": True,
        "action": "invoke",
        "contractVersion": ROLE_RUNTIME_PROXY_CONTRACT_VERSION,
        "runtime": {
            "owner": "python",
            "mode": "proxy_contract",
            "agentExecution": "none",
            "toolsExecuted": False,
            "promptEchoed": False,
        },
        "jobId": validated["jobId"],
        "roleId": validated["roleId"],
        "stageId": validated["stageId"],
        "status": "completed",
        "output": {
            "kind": "blueprint.role_runtime.proxy_contract",
            "accepted": True,
        },
        "executionMode": "lite",
        "iterations": 0,
        "totalTokens": 0,
        "durationMs": 0,
        "trace": [],
    }


def build_role_runtime_progress_contract(payload: dict[str, Any]) -> dict[str, Any]:
    """Return progress metadata without echoing raw messages or trace."""

    action = _action(payload, "progress")
    if action != "progress":
        return _schema_invalid(action, "action must be progress.", payload)
    if not _non_empty_string(payload.get("jobId")):
        return _schema_invalid("progress", "jobId must be a non-empty string.", payload)
    if not _non_empty_string(payload.get("phase")):
        return _schema_invalid("progress", "phase must be a non-empty string.", payload)

    return {
        "ok": True,
        "action": "progress",
        "contractVersion": ROLE_RUNTIME_PROXY_CONTRACT_VERSION,
        "event": {
            "jobId": payload["jobId"],
            "phase": payload["phase"],
            "iteration": _safe_int(payload.get("iteration")),
            "tokensUsed": _safe_int(payload.get("tokensUsed")),
            "messageProvided": isinstance(payload.get("message"), str)
            and len(payload["message"]) > 0,
        },
    }


def build_role_runtime_callback_contract(payload: dict[str, Any]) -> dict[str, Any]:
    """Return callback availability metadata without echoing callback secrets."""

    action = _action(payload, "callback")
    if action != "callback":
        return _schema_invalid(action, "action must be callback.", payload)
    if not _non_empty_string(payload.get("jobId")):
        return _schema_invalid("callback", "jobId must be a non-empty string.", payload)

    return {
        "ok": True,
        "action": "callback",
        "contractVersion": ROLE_RUNTIME_PROXY_CONTRACT_VERSION,
        "callback": {
            "jobId": payload["jobId"],
            "delivery": "declared",
            "callbackUrlProvided": _non_empty_string(payload.get("callbackUrl")),
            "callbackSecretProvided": _non_empty_string(payload.get("callbackSecret")),
            "secretEchoed": False,
        },
    }
