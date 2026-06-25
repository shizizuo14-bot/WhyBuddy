"""Runtime bridge tests for the Python-side task executor slice.

The bridge is deliberately deterministic. It projects task executor envelopes
for Node to consume, but it does not start a real executor worker, queue, or
external runtime.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.task_executor_runtime import (  # noqa: E402
    TASK_EXECUTOR_RUNTIME_CONTRACT_VERSION,
    cancel_task_executor_runtime,
    project_task_executor_runtime,
    read_task_executor_runtime,
    start_task_executor_runtime,
)


def _plan() -> dict:
    return {
        "version": "2026-03-28",
        "missionId": "mission-python-runtime",
        "summary": "Run task executor runtime bridge",
        "objective": "Validate start/status/cancel/read/error envelopes",
        "requestedBy": "brain",
        "mode": "managed",
        "steps": [
            {
                "key": "task.execute",
                "label": "Execute task",
                "description": "Run a deterministic runtime bridge slice",
            },
        ],
        "jobs": [
            {
                "id": "job-python-runtime",
                "key": "task.execute",
                "label": "Execute task",
                "description": "Run a deterministic runtime bridge slice",
                "kind": "execute",
            },
        ],
    }


def _request() -> dict:
    return {
        "version": "2026-03-28",
        "requestId": "request-python-runtime",
        "missionId": "mission-python-runtime",
        "jobId": "job-python-runtime",
        "executor": "lobster",
        "createdAt": "2026-06-20T00:00:00.000Z",
        "plan": _plan(),
        "callback": {
            "eventsUrl": "http://node.test/api/executor/events",
            "timeoutMs": 10000,
            "auth": {
                "scheme": "hmac-sha256",
                "executorHeader": "x-cube-executor-id",
                "timestampHeader": "x-cube-executor-timestamp",
                "signatureHeader": "x-cube-executor-signature",
                "signedPayload": "timestamp.rawBody",
            },
        },
    }


def _runtime_job(status: str = "running") -> dict:
    return {
        "request": _request(),
        "status": status,
        "progress": 45 if status == "running" else 100,
        "message": f"Job {status}",
        "receivedAt": "2026-06-20T00:00:00.000Z",
        "updatedAt": "2026-06-20T00:00:03.000Z",
        "finishedAt": (
            "2026-06-20T00:00:05.000Z"
            if status in {"completed", "failed", "cancelled"}
            else None
        ),
        "error": (
            {
                "code": "TASK_EXECUTOR_FAILED",
                "message": "Task executor failed",
            }
            if status == "failed"
            else None
        ),
        "artifacts": [],
    }


def test_start_bridge_returns_acceptance_envelope_without_worker_side_effects():
    result = start_task_executor_runtime(
        request=_request(),
        received_at="2026-06-20T00:00:01.000Z",
    )

    assert result == {
        "ok": True,
        "accepted": True,
        "requestId": "request-python-runtime",
        "missionId": "mission-python-runtime",
        "jobId": "job-python-runtime",
        "receivedAt": "2026-06-20T00:00:01.000Z",
        "runtime": {
            "contractVersion": TASK_EXECUTOR_RUNTIME_CONTRACT_VERSION,
            "owner": "python",
            "worker": "not_started",
            "persistenceOwner": "node",
        },
    }
    assert "containerId" not in result
    assert "pid" not in result
    assert "completed" not in result


def test_status_bridge_preserves_completed_failed_and_cancelled_statuses():
    for status in ["completed", "failed", "cancelled"]:
        result = project_task_executor_runtime({
            "action": "status",
            "job": _runtime_job(status),
        })

        assert result["ok"] is True
        assert result["job"]["status"] == status
        assert result["job"]["progress"] == 100
        assert result["job"]["events"][-1]["status"] == status
        assert result["job"]["events"][-1]["type"] == f"job.{status}"
        if status == "failed":
            assert result["job"]["errorCode"] == "TASK_EXECUTOR_FAILED"
            assert result["job"]["errorMessage"] == "Task executor failed"
        else:
            assert "errorCode" not in result["job"]


def test_cancel_bridge_returns_cancelled_ack_not_completed_success():
    result = cancel_task_executor_runtime(
        job=_runtime_job("running"),
        reason="operator cancel",
        cancelled_at="2026-06-20T00:00:04.000Z",
    )

    assert result["ok"] is True
    assert result["accepted"] is True
    assert result["cancelRequested"] is True
    assert result["alreadyFinal"] is False
    assert result["status"] == "cancelled"
    assert result["status"] != "completed"
    assert result["message"] == "Cancellation requested"


def test_read_bridge_returns_job_detail_without_artifact_or_worker_claims():
    result = read_task_executor_runtime(_runtime_job("running"))

    assert result["ok"] is True
    assert result["job"]["jobId"] == "job-python-runtime"
    assert result["job"]["status"] == "running"
    assert result["job"]["callbackMode"] == "pending"
    assert result["job"]["artifacts"] == []
    assert result["job"]["artifactCount"] == 0
    assert result["job"]["dataDirectory"].endswith(
        "mission-python-runtime/job-python-runtime"
    )
    assert result["job"]["events"][-1]["type"] == "job.progress"
    assert "containerId" not in result["job"]
    assert "pid" not in result["job"]


def test_timeout_runtime_error_and_validation_error_are_not_success_payloads():
    payloads = [
        project_task_executor_runtime({
            "action": "status",
            "error": {
                "code": "TASK_EXECUTOR_TIMEOUT",
                "message": "Task executor request timed out",
            },
        }),
        project_task_executor_runtime({
            "action": "read",
            "error": {
                "code": "TASK_EXECUTOR_ERROR",
                "message": "Task executor runtime failed",
            },
        }),
        project_task_executor_runtime({"action": "status", "job": None}),
    ]

    for result in payloads:
        assert result["ok"] is False
        assert "accepted" not in result
        assert "job" not in result
        assert result["code"] in {
            "TASK_EXECUTOR_TIMEOUT",
            "TASK_EXECUTOR_ERROR",
            "TASK_EXECUTOR_VALIDATION_ERROR",
        }
        assert "completed" not in result["error"].lower()

