"""Python runtime tests for Blueprint job lifecycle event stream.

Covers created/running/completed/failed/cancelled/error envelopes.
Ensures failed/cancelled/error are never masqueraded as completed.
Preserves jobId, stageId, projectId, actor, causation metadata.
"""

from services.blueprint_job_event_stream import (
    CONTRACT_VERSION,
    create_job_event_envelope,
    normalize_python_job_event,
    run_blueprint_job_event_stream_action,
)


NOW = "2026-06-23T10:00:00.000Z"


def test_create_event_envelope_for_created_state():
    evt = create_job_event_envelope(
        "job-1",
        "created",
        stage_id="input",
        project_id="proj-1",
        actor={"id": "user-1"},
        causation={"traceId": "t-1"},
        occurred_at=NOW,
    )
    assert evt["jobId"] == "job-1"
    assert evt["status"] == "created"
    assert evt["stageId"] == "input"
    assert evt["projectId"] == "proj-1"
    assert evt["actor"]["id"] == "user-1"
    assert evt["causation"]["traceId"] == "t-1"
    assert evt["type"] == "job.created"
    assert "error" not in evt


def test_running_event_envelope():
    result = run_blueprint_job_event_stream_action(
        "start",
        {"jobId": "job-2", "stageId": "spec_tree", "projectId": "p-2", "now": NOW},
    )
    assert result["ok"] is True
    assert result["contractVersion"] == CONTRACT_VERSION
    assert result["runtime"]["owner"] == "python"
    event = result["event"]
    assert event["jobId"] == "job-2"
    assert event["status"] == "running"
    assert event["stageId"] == "spec_tree"


def test_completed_event_envelope():
    result = run_blueprint_job_event_stream_action(
        "complete",
        {"job": {"id": "job-3", "status": "running"}, "now": NOW},
    )
    assert result["ok"] is True
    event = result["event"]
    assert event["status"] == "completed"
    assert event["type"] == "job.completed"
    assert "error" not in event or event.get("status") != "completed"  # no leak


def test_failed_event_envelope_never_completed():
    result = run_blueprint_job_event_stream_action(
        "fail",
        {
            "jobId": "job-fail",
            "stageId": "spec_tree",
            "error": {"code": "runtime_failed", "message": "boom", "stage": "spec_tree"},
            "now": NOW,
        },
    )
    assert result["ok"] is True
    event = result["event"]
    assert event["status"] == "failed"
    assert event["status"] != "completed"
    assert event["error"]["code"] == "runtime_failed"
    assert event["stageId"] == "spec_tree"


def test_cancelled_event_envelope_never_completed():
    result = run_blueprint_job_event_stream_action(
        "cancel",
        {"jobId": "job-cancel", "reason": "user request", "now": NOW},
    )
    assert result["ok"] is True
    event = result["event"]
    assert event["status"] == "cancelled"
    assert event["status"] != "completed"
    assert event["error"]["code"] == "cancelled"


def test_error_event_envelope():
    result = normalize_python_job_event(
        {"jobId": "job-err", "simulateError": True, "stageId": "build"},
    )
    event = result["event"]
    assert event["status"] == "error"
    assert event["status"] != "completed"
    assert "error" in event


def test_normalize_preserves_metadata():
    payload = {
        "jobId": "job-meta",
        "status": "running",
        "stageId": "validate",
        "projectId": "proj-x",
        "actor": {"id": "actor-7", "type": "system"},
        "causation": {"parentId": "caus-1"},
        "now": NOW,
    }
    result = normalize_python_job_event(payload)
    event = result["event"]
    assert event["jobId"] == "job-meta"
    assert event["stageId"] == "validate"
    assert event["projectId"] == "proj-x"
    assert event["actor"]["id"] == "actor-7"
    assert event["causation"]["parentId"] == "caus-1"
