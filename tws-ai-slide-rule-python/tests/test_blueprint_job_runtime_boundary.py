"""Boundary tests for the minimal Blueprint job runtime envelope.

Node owns persistence, events, artifacts, diagnostics, and policy. Python owns
only the selected lifecycle envelope returned across the runtime boundary.
"""

from services.blueprint_job_runtime import run_blueprint_job_runtime_action


NOW = "2026-06-20T00:02:00.000Z"


def _job(status="running"):
    return {
        "id": "job-1",
        "request": {
            "projectId": "project-1",
            "targetText": "Build a job runtime boundary",
        },
        "status": status,
        "stage": "spec_tree",
        "version": "v1",
        "createdAt": "2026-06-20T00:00:00.000Z",
        "updatedAt": "2026-06-20T00:01:00.000Z",
        "artifacts": [{"id": "node-artifact", "type": "spec_tree"}],
        "events": [{"id": "node-event", "type": "job.stage"}],
    }


def test_start_envelope_moves_selected_job_to_running_without_store_ownership():
    result = run_blueprint_job_runtime_action(
        "start",
        {"job": _job("pending"), "now": NOW},
    )

    assert result["ok"] is True
    assert result["action"] == "start"
    assert result["runtime"]["owner"] == "python"
    assert result["runtime"]["persistenceOwner"] == "node"
    assert result["job"]["status"] == "running"
    assert result["job"]["artifacts"] == []
    assert result["job"]["events"] == []


def test_status_envelope_reports_running_without_claiming_events():
    result = run_blueprint_job_runtime_action(
        "status",
        {"jobId": "job-1", "job": _job("running"), "now": NOW},
    )

    assert result["ok"] is True
    assert result["action"] == "status"
    assert result["job"]["status"] == "running"
    assert "completedAt" not in result["job"]
    assert result["job"]["artifacts"] == []
    assert result["job"]["events"] == []


def test_complete_envelope_marks_completed_terminal_state():
    result = run_blueprint_job_runtime_action(
        "complete",
        {"jobId": "job-1", "job": _job("running"), "now": NOW},
    )

    assert result["ok"] is True
    assert result["action"] == "complete"
    assert result["job"]["status"] == "completed"
    assert result["job"]["completedAt"] == NOW
    assert "error" not in result["job"]


def test_fail_envelope_marks_failed_terminal_state_not_successful_completion():
    result = run_blueprint_job_runtime_action(
        "fail",
        {
            "jobId": "job-1",
            "job": _job("running"),
            "now": NOW,
            "error": {
                "code": "runtime_failed",
                "message": "worker failed",
                "stage": "spec_tree",
            },
        },
    )

    assert result["ok"] is True
    assert result["action"] == "fail"
    assert result["job"]["status"] == "failed"
    assert result["job"]["status"] != "completed"
    assert result["job"]["completedAt"] == NOW
    assert result["job"]["error"] == {
        "code": "runtime_failed",
        "message": "worker failed",
        "stage": "spec_tree",
    }


def test_cancel_envelope_marks_cancelled_terminal_state_not_completed():
    result = run_blueprint_job_runtime_action(
        "cancel",
        {
            "jobId": "job-1",
            "job": _job("running"),
            "now": NOW,
            "reason": "user_cancelled",
        },
    )

    assert result["ok"] is True
    assert result["action"] == "cancel"
    assert result["cancelRequested"] is True
    assert result["job"]["status"] == "cancelled"
    assert result["job"]["status"] != "completed"
    assert result["job"]["completedAt"] == NOW
    assert result["job"]["error"]["code"] == "cancelled"


def test_runtime_error_envelope_is_stable_and_does_not_look_completed():
    result = run_blueprint_job_runtime_action(
        "fail",
        {
            "jobId": "job-1",
            "job": _job("running"),
            "simulateRuntimeError": "worker unavailable",
        },
    )

    assert result == {
        "ok": False,
        "action": "fail",
        "contractVersion": "blueprint.job-runtime.proxy.v1",
        "error": "runtime_error",
        "message": "worker unavailable",
        "jobId": "job-1",
        "retryable": True,
    }
