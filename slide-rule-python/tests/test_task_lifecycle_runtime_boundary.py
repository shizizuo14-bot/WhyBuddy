"""Boundary tests for the minimal Python task lifecycle runtime slice.

This slice is intentionally smaller than the task route. Node owns mission
storage, project/resource auth, route-level validation, executor callbacks, and
event storage. Python only projects lifecycle envelopes for Node to map.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.task_lifecycle_runtime import (  # noqa: E402
    TASK_LIFECYCLE_RUNTIME_CONTRACT_VERSION,
    project_task_lifecycle_runtime,
)


def _mission(status: str = "queued") -> dict:
    return {
        "id": "mission-python-lifecycle",
        "kind": "nl-command",
        "title": "Run task lifecycle boundary",
        "status": status,
        "progress": 0 if status == "queued" else 45,
        "currentStageKey": "receive" if status == "queued" else "execute",
        "createdAt": 1_782_000_000_000,
        "updatedAt": 1_782_000_000_000,
        "projection": {
            "projectId": "project-node-owned",
            "workflowId": "workflow-node-owned",
            "replayId": "replay-node-owned",
        },
        "executor": {
            "name": "lobster",
            "jobId": "job-python-lifecycle",
            "status": "running",
            "baseUrl": "http://python-runtime.test",
        },
    }


def test_create_projects_started_envelope_with_node_owned_metadata():
    result = project_task_lifecycle_runtime(
        {
            "action": "create",
            "task": _mission("queued"),
            "now": "2026-06-22T00:00:00.000Z",
            "metadata": {
                "project": {
                    "projectId": "project-node-owned",
                    "validatedBy": "node",
                },
                "resource": {
                    "resourceType": "mission",
                    "resourceId": "mission-python-lifecycle",
                    "owner": "node",
                },
                "auth": {
                    "owner": "node",
                    "required": True,
                    "checked": True,
                },
            },
        }
    )

    assert result["ok"] is True
    assert result["action"] == "create"
    assert result["contractVersion"] == TASK_LIFECYCLE_RUNTIME_CONTRACT_VERSION
    assert result["runtime"] == {
        "owner": "python",
        "mode": "runtime_boundary",
        "persistenceOwner": "node",
        "missionStoreOwner": "node",
        "routeOwner": "node",
        "authOwner": "node",
        "eventStoreOwner": "node",
    }
    assert result["metadata"] == {
        "project": {
            "projectId": "project-node-owned",
            "validatedBy": "node",
        },
        "resource": {
            "resourceType": "mission",
            "resourceId": "mission-python-lifecycle",
            "owner": "node",
        },
        "auth": {
            "owner": "node",
            "required": True,
            "checked": True,
        },
    }
    assert result["task"] == {
        "id": "mission-python-lifecycle",
        "status": "started",
        "nodeStatus": "running",
        "progress": 4,
        "stageKey": "receive",
        "message": "Task lifecycle started.",
        "updatedAt": "2026-06-22T00:00:00.000Z",
        "executorJobId": "job-python-lifecycle",
    }
    assert "projection" not in result["task"]
    assert "events" not in result["task"]


def test_status_projects_running_and_completed_without_success_coercion():
    running = project_task_lifecycle_runtime(
        {"action": "status", "task": _mission("running")}
    )
    completed = project_task_lifecycle_runtime(
        {
            "action": "status",
            "task": {
                **_mission("done"),
                "progress": 100,
                "currentStageKey": "finalize",
                "summary": "Task finished.",
            },
        }
    )

    assert running["ok"] is True
    assert running["task"]["status"] == "running"
    assert running["task"]["nodeStatus"] == "running"
    assert running["task"]["message"] == "Task is running."

    assert completed["ok"] is True
    assert completed["task"]["status"] == "completed"
    assert completed["task"]["nodeStatus"] == "done"
    assert completed["task"]["progress"] == 100
    assert completed["task"]["summary"] == "Task finished."


def test_failed_and_cancelled_remain_terminal_errors_not_success():
    failed = project_task_lifecycle_runtime(
        {
            "action": "status",
            "task": {
                **_mission("failed"),
                "progress": 64,
                "error": {
                    "code": "EXECUTOR_FAILED",
                    "message": "Executor failed.",
                },
            },
        }
    )
    cancelled = project_task_lifecycle_runtime(
        {
            "action": "cancel",
            "task": {
                **_mission("running"),
                "progress": 48,
            },
            "reason": "operator cancelled",
            "now": "2026-06-22T00:01:00.000Z",
        }
    )

    assert failed["ok"] is True
    assert failed["task"]["status"] == "failed"
    assert failed["task"]["nodeStatus"] == "failed"
    assert failed["task"]["error"] == {
        "code": "EXECUTOR_FAILED",
        "message": "Executor failed.",
    }
    assert failed["task"]["status"] != "completed"

    assert cancelled["ok"] is True
    assert cancelled["task"]["status"] == "cancelled"
    assert cancelled["task"]["nodeStatus"] == "cancelled"
    assert cancelled["task"]["cancelRequested"] is True
    assert cancelled["task"]["message"] == "operator cancelled"
    assert cancelled["task"]["updatedAt"] == "2026-06-22T00:01:00.000Z"
    assert cancelled["task"]["status"] != "completed"


def test_error_envelope_is_not_a_successful_task():
    result = project_task_lifecycle_runtime(
        {
            "action": "error",
            "task": _mission("running"),
            "error": {
                "code": "TASK_LIFECYCLE_RUNTIME_ERROR",
                "message": "Python lifecycle runtime failed.",
            },
        }
    )

    assert result == {
        "ok": False,
        "action": "error",
        "contractVersion": TASK_LIFECYCLE_RUNTIME_CONTRACT_VERSION,
        "error": "runtime_error",
        "code": "TASK_LIFECYCLE_RUNTIME_ERROR",
        "message": "Python lifecycle runtime failed.",
        "retryable": True,
        "runtime": {
            "owner": "python",
            "mode": "runtime_boundary",
            "persistenceOwner": "node",
            "missionStoreOwner": "node",
            "routeOwner": "node",
            "authOwner": "node",
            "eventStoreOwner": "node",
        },
    }


def test_event_replay_projects_replay_envelope_without_owning_event_storage():
    result = project_task_lifecycle_runtime(
        {
            "action": "replay",
            "task": {
                **_mission("running"),
                "progress": 57,
                "currentStageKey": "execute",
            },
            "events": [
                {
                    "type": "created",
                    "message": "Mission created",
                    "time": 1_782_000_000_000,
                    "source": "mission-core",
                },
                {
                    "type": "progress",
                    "message": "Executor running",
                    "progress": 57,
                    "stageKey": "execute",
                    "time": 1_782_000_010_000,
                    "source": "executor",
                },
            ],
            "limit": 10,
            "metadata": {
                "project": {
                    "projectId": "project-node-owned",
                    "validatedBy": "node",
                },
                "resource": {
                    "resourceType": "mission",
                    "resourceId": "mission-python-lifecycle",
                    "owner": "node",
                },
            },
        }
    )

    assert result["ok"] is True
    assert result["action"] == "replay"
    assert result["task"]["status"] == "running"
    assert result["replay"] == {
        "missionId": "mission-python-lifecycle",
        "eventCount": 2,
        "limit": 10,
        "owner": "node",
        "events": [
            {
                "type": "created",
                "message": "Mission created",
                "time": 1_782_000_000_000,
                "source": "mission-core",
            },
            {
                "type": "progress",
                "message": "Executor running",
                "progress": 57,
                "stageKey": "execute",
                "time": 1_782_000_010_000,
                "source": "executor",
            },
        ],
    }
    assert result["metadata"]["project"]["projectId"] == "project-node-owned"


def test_invalid_transition_is_rejected_without_completed_coercion():
    result = project_task_lifecycle_runtime(
        {
            "action": "cancel",
            "task": {
                **_mission("done"),
                "progress": 100,
                "summary": "Already completed.",
            },
            "reason": "cancel after completion",
        }
    )

    assert result["ok"] is False
    assert result["action"] == "cancel"
    assert result["error"] == "invalid_transition"
    assert result["code"] == "TASK_LIFECYCLE_INVALID_TRANSITION"
    assert result["retryable"] is False
    assert "task" not in result
