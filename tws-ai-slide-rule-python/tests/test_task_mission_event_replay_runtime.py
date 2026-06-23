"""Python runtime tests for minimal mission event replay / projection / cancel / error boundary.

Covers append/replay/projection/cancel/error envelopes, invalid transitions,
and retention of project/resource/auth metadata. Node owns the store.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.mission_event_replay import (  # noqa: E402
    MISSION_EVENT_REPLAY_RUNTIME_CONTRACT_VERSION,
    project_mission_event_replay_runtime,
)


def _mission(status: str = "running") -> dict:
    return {
        "id": "mission-replay-97",
        "kind": "nl-command",
        "title": "Mission event replay boundary",
        "status": status,
        "progress": 42 if status == "running" else (100 if status == "done" else 0),
        "currentStageKey": "execute",
        "createdAt": 1_782_000_000_000,
        "updatedAt": 1_782_000_050_000,
        "projection": {
            "projectId": "proj-mission-97",
            "replayId": "replay-97",
        },
    }


def test_replay_projects_events_and_preserves_project_resource_metadata():
    result = project_mission_event_replay_runtime(
        {
            "action": "replay",
            "task": _mission("running"),
            "events": [
                {"type": "created", "message": "created", "time": 1_782_000_000_000, "source": "mission-core"},
                {"type": "progress", "message": "exec", "progress": 42, "stageKey": "execute", "time": 1_782_000_050_000, "source": "executor"},
            ],
            "limit": 5,
            "metadata": {
                "project": {"projectId": "proj-mission-97", "validatedBy": "node"},
                "resource": {"resourceType": "mission", "resourceId": "mission-replay-97", "owner": "node"},
                "auth": {"owner": "node", "required": True, "checked": True},
            },
        }
    )

    assert result["ok"] is True
    assert result["action"] == "replay"
    assert result["contractVersion"] == MISSION_EVENT_REPLAY_RUNTIME_CONTRACT_VERSION
    assert result["runtime"]["owner"] == "python"
    assert result["runtime"]["missionStoreOwner"] == "node"
    assert result["metadata"]["project"]["projectId"] == "proj-mission-97"
    assert result["metadata"]["resource"]["resourceId"] == "mission-replay-97"
    assert result["replay"]["missionId"] == "mission-replay-97"
    assert result["replay"]["eventCount"] == 2
    assert result["replay"]["owner"] == "node"
    assert result["replay"]["projection"]["projectId"] == "proj-mission-97"
    assert "task" in result


def test_append_projects_updated_replay_envelope():
    result = project_mission_event_replay_runtime(
        {
            "action": "append",
            "task": _mission("running"),
            "events": [
                {"type": "progress", "message": "appended", "progress": 55, "time": 1_782_000_060_000},
            ],
            "metadata": {
                "project": {"projectId": "proj-mission-97"},
                "resource": {"resourceType": "mission", "resourceId": "mission-replay-97"},
            },
        }
    )

    assert result["ok"] is True
    assert result["action"] == "append"
    assert result["replay"]["eventCount"] == 1
    assert result["replay"]["projection"]["projectId"] == "proj-mission-97"


def test_project_action_returns_projection_with_auth():
    result = project_mission_event_replay_runtime(
        {
            "action": "project",
            "task": _mission("running"),
            "metadata": {
                "project": {"projectId": "proj-mission-97"},
                "auth": {"checked": True},
            },
        }
    )

    assert result["ok"] is True
    assert result["action"] == "project"
    assert result["metadata"]["project"]["projectId"] == "proj-mission-97"
    assert result["replay"]["missionId"] == "mission-replay-97"


def test_cancel_envelope_does_not_coerce_to_completed():
    result = project_mission_event_replay_runtime(
        {
            "action": "cancel",
            "task": _mission("running"),
            "reason": "user requested cancel",
            "now": "2026-06-23T00:00:10.000Z",
        }
    )

    assert result["ok"] is True
    assert result["action"] == "cancel"
    assert result["task"]["status"] == "cancelled"
    assert result["task"]["nodeStatus"] == "cancelled"
    assert result["task"]["cancelRequested"] is True
    assert result["task"]["status"] != "completed"
    assert result["cancel"]["reason"] == "user requested cancel"


def test_cancel_on_terminal_is_invalid_transition():
    result = project_mission_event_replay_runtime(
        {
            "action": "cancel",
            "task": _mission("done"),
            "reason": "cancel after done",
        }
    )

    assert result["ok"] is False
    assert result["action"] == "cancel"
    assert result["error"] == "invalid_transition"
    assert result["code"] == "MISSION_EVENT_REPLAY_INVALID_TRANSITION"
    assert "task" not in result


def test_error_envelope_is_not_success():
    result = project_mission_event_replay_runtime(
        {
            "action": "error",
            "task": _mission("running"),
            "error": {"code": "REPLAY_FAILED", "message": "Projection failed"},
        }
    )

    assert result["ok"] is False
    assert result["code"] == "REPLAY_FAILED"
    assert result["message"] == "Projection failed"
    assert result["runtime"]["owner"] == "python"


def test_failed_status_remains_failed_not_running_or_completed():
    failed_task = {
        **_mission("failed"),
        "error": {"code": "EXEC_FAILED", "message": "boom"},
        "progress": 67,
    }
    result = project_mission_event_replay_runtime({"action": "replay", "task": failed_task})

    assert result["ok"] is True
    assert result["task"]["status"] == "failed"
    assert result["task"]["nodeStatus"] == "failed"
    assert result["task"]["status"] != "running"
    assert result["task"]["status"] != "completed"
    assert result["task"]["error"]["code"] == "EXEC_FAILED"


def test_invalid_action_is_validation_error():
    result = project_mission_event_replay_runtime({"action": "unknown", "task": _mission()})

    assert result["ok"] is False
    assert result["error"] == "validation_error"
    assert "Unsupported" in result["message"]
