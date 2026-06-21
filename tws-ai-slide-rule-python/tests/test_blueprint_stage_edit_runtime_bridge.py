"""Runtime bridge tests for the Python-side Blueprint stage-edit slice.

Python owns only the selected stage-edit decision envelope. Node continues to
own persistence, invalidation commits, job storage, and the full Blueprint state
machine.
"""

import os
import sys
from copy import deepcopy

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.blueprint_stage_edit import (  # noqa: E402
    BLUEPRINT_STAGE_EDIT_RUNTIME_CONTRACT_VERSION,
    execute_blueprint_stage_edit_runtime,
)


FIXED_NOW = "2026-06-20T00:00:00.000Z"


def _intake() -> dict:
    return {
        "id": "intake-1",
        "targetText": "Original target",
        "githubUrls": ["https://github.com/example/original"],
        "createdAt": "2026-06-19T00:00:00.000Z",
        "updatedAt": "2026-06-19T00:00:00.000Z",
    }


def _artifact(artifact_id: str, artifact_type: str, **overrides: object) -> dict:
    artifact = {
        "id": artifact_id,
        "type": artifact_type,
        "title": artifact_id,
        "summary": artifact_id,
        "createdAt": "2026-06-19T00:00:00.000Z",
    }
    artifact.update(overrides)
    return artifact


def _job(**overrides: object) -> dict:
    job = {
        "id": "job-1",
        "request": {
            "intakeId": "intake-1",
            "targetText": "Original target",
            "githubUrls": ["https://github.com/example/original"],
        },
        "status": "completed",
        "stage": "engineering_landing",
        "version": "v1",
        "createdAt": "2026-06-19T00:00:00.000Z",
        "updatedAt": "2026-06-19T00:00:00.000Z",
        "artifacts": [
            _artifact("artifact-input", "intake", payload=_intake()),
            _artifact("artifact-route", "route_set"),
            _artifact("artifact-spec", "requirements"),
        ],
        "events": [{"id": "node-owned-event"}],
        "stageState": {"must": "stay-node-owned"},
        "nextAction": {"type": "none"},
        "checksLedger": [{"must": "stay-node-owned"}],
    }
    job.update(overrides)
    return job


def _payload(operation: str, **overrides: object) -> dict:
    payload = {
        "operation": operation,
        "selectedStage": "input",
        "intakeId": "intake-1",
        "intake": _intake(),
        "patch": {"targetText": "Updated target"},
        "jobs": [_job()],
        "now": FIXED_NOW,
        "nodeControl": {
            "stateAuthority": "node",
            "persistenceOwner": "node",
            "invalidationOwner": "node",
            "jobStoreOwner": "node",
        },
    }
    payload.update(overrides)
    return payload


def test_validate_operation_returns_parsed_patch_without_state_projection():
    result = execute_blueprint_stage_edit_runtime(
        _payload(
            "validate",
            patch={
                "targetText": "Updated target",
                "githubUrls": ["https://github.com/example/updated"],
                "reason": "correct upstream input",
            },
        )
    )

    assert result == {
        "ok": True,
        "operation": "validate",
        "contractVersion": BLUEPRINT_STAGE_EDIT_RUNTIME_CONTRACT_VERSION,
        "runtime": {
            "owner": "python",
            "mode": "runtime_bridge",
            "selectedStage": "input",
            "stateAuthority": "node",
            "persistenceOwner": "node",
            "invalidationOwner": "node",
            "jobStoreOwner": "node",
            "stateMutation": "none",
        },
        "validation": {
            "accepted": True,
            "patch": {
                "targetText": "Updated target",
                "githubUrls": ["https://github.com/example/updated"],
                "reason": "correct upstream input",
            },
        },
        "apply": {
            "accepted": False,
            "reason": "node_state_owner",
            "message": "Blueprint stage edits are evaluated by Python but applied by Node.",
        },
        "provenance": "python-blueprint-stage-edit-runtime",
    }


def test_preview_operation_returns_accepted_non_mutating_envelope():
    intake = _intake()
    job = _job()
    original_intake = deepcopy(intake)
    original_job = deepcopy(job)

    result = execute_blueprint_stage_edit_runtime(
        _payload("preview", intake=intake, jobs=[job])
    )

    assert intake == original_intake
    assert job == original_job
    assert result["ok"] is True
    assert result["operation"] == "preview"
    assert result["decision"]["ok"] is True
    assert result["decision"]["outcome"] == "accepted"
    assert result["decision"]["preview"]["stateMutation"] == "none"
    assert result["decision"]["staleEdit"] == {
        "fromStage": "input",
        "newlyStaleArtifactIds": ["artifact-route", "artifact-spec"],
        "newlyStaleArtifactCount": 2,
        "staleArtifactIdsSnapshot": ["artifact-route", "artifact-spec"],
    }
    assert result["apply"]["accepted"] is False
    assert result["apply"]["reason"] == "node_state_owner"
    assert result["runtime"]["invalidationOwner"] == "node"


def test_apply_operation_returns_node_owned_audit_for_accepted_decision():
    result = execute_blueprint_stage_edit_runtime(_payload("apply"))

    assert result["ok"] is True
    assert result["operation"] == "apply"
    assert result["decision"]["outcome"] == "accepted"
    assert result["apply"] == {
        "accepted": False,
        "reason": "node_state_owner",
        "message": "Blueprint stage edits are evaluated by Python but applied by Node.",
        "requestedPatch": {"targetText": "Updated target"},
    }


def test_rejected_conflict_and_noop_outcomes_stay_stable():
    rejected = execute_blueprint_stage_edit_runtime(
        _payload("preview", patch={"targetText": 42})
    )
    conflict = execute_blueprint_stage_edit_runtime(
        _payload("preview", jobs=[_job(stage="spec_tree", status="running")])
    )
    noop = execute_blueprint_stage_edit_runtime(
        _payload(
            "preview",
            patch={
                "targetText": "Original target",
                "githubUrls": ["https://github.com/example/original"],
            },
            jobs=[_job(stage="spec_tree", status="running")],
        )
    )

    assert rejected["ok"] is False
    assert rejected["decision"]["outcome"] == "rejected"
    assert rejected["statusCode"] == 400

    assert conflict["ok"] is False
    assert conflict["decision"]["outcome"] == "conflict"
    assert conflict["statusCode"] == 409
    assert conflict["decision"]["error"] == "downstream_running"

    assert noop["ok"] is True
    assert noop["decision"]["outcome"] == "noop"
    assert noop["statusCode"] == 200
    assert "staleEdit" not in noop["decision"]


def test_stale_selected_stage_is_not_reported_as_success():
    result = execute_blueprint_stage_edit_runtime(
        _payload(
            "preview",
            selectedStageState={
                "stage": "input",
                "stale": True,
                "staleSince": "2026-06-19T23:00:00.000Z",
            },
        )
    )

    assert result["ok"] is False
    assert result["operation"] == "preview"
    assert result["statusCode"] == 409
    assert result["error"] == "selected_stage_stale"
    assert result["decision"]["ok"] is False
    assert result["decision"]["outcome"] == "stale"
    assert result["apply"]["accepted"] is False


def test_runtime_errors_are_stable_and_do_not_include_success_decision():
    bad_operation = execute_blueprint_stage_edit_runtime(_payload("delete"))
    bad_owner = execute_blueprint_stage_edit_runtime(
        _payload(
            "preview",
            nodeControl={
                "stateAuthority": "python",
                "persistenceOwner": "node",
                "invalidationOwner": "node",
                "jobStoreOwner": "node",
            },
        )
    )

    assert bad_operation["ok"] is False
    assert bad_operation["operation"] == "unknown"
    assert bad_operation["error"] == "invalid_operation"
    assert bad_operation["statusCode"] == 400
    assert "decision" not in bad_operation

    assert bad_owner["ok"] is False
    assert bad_owner["operation"] == "preview"
    assert bad_owner["error"] == "boundary_violation"
    assert bad_owner["reason"] == "node_control_owner_mismatch"
    assert bad_owner["statusCode"] == 400
    assert "decision" not in bad_owner
