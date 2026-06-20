"""Contract tests for the Python Blueprint main state projection.

This slice is intentionally read-only. Python can describe the minimum main
state shape that Node can consume, but Node still owns the full Blueprint and
Autopilot state machines.
"""

import os
import sys
from copy import deepcopy

import pytest
from pydantic import ValidationError

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.blueprint_state import (  # noqa: E402
    BLUEPRINT_MAIN_STATE_CONTRACT_VERSION,
    BlueprintMainStateArtifact,
    BlueprintMainStateError,
    BlueprintMainStateProjection,
)
from services.blueprint_state import project_blueprint_main_state  # noqa: E402


VALID_PROJECTION_STATUSES = {"pending", "running", "done", "failed", "stale"}
VALID_NODE_STATUSES = {"pending", "running", "waiting", "reviewing", "completed", "failed"}


def _job(status: str = "running") -> dict:
    return {
        "id": "job-blueprint-main-state",
        "status": status,
        "stage": "spec_tree",
        "version": "2026-06-20.contract",
        "createdAt": "2026-06-20T00:00:00.000Z",
        "updatedAt": "2026-06-20T00:00:01.000Z",
        "artifacts": [
            {
                "id": "artifact-route-set",
                "type": "route_set",
                "title": "Route set",
                "summary": "Candidate Blueprint routes.",
                "createdAt": "2026-06-20T00:00:00.000Z",
            },
            {
                "id": "artifact-spec-tree",
                "type": "spec_tree",
                "title": "SPEC tree",
                "summary": "Generated tree awaiting review.",
                "createdAt": "2026-06-20T00:00:01.000Z",
                "staleSince": "2026-06-20T00:00:02.000Z",
                "invalidatedBy": {
                    "stage": "route_generation",
                    "artifactId": "artifact-route-set",
                    "artifactType": "route_set",
                    "reason": "upstream_route_selection_changed",
                    "triggeredAt": "2026-06-20T00:00:02.000Z",
                },
            },
        ],
        "error": None,
        "staleArtifactIds": ["artifact-spec-tree"],
    }


def test_projection_preserves_minimum_job_stage_status_artifacts_and_stale_shape():
    projection = project_blueprint_main_state(_job()).model_dump(exclude_none=True)

    assert projection["contractVersion"] == BLUEPRINT_MAIN_STATE_CONTRACT_VERSION
    assert projection["kind"] == "blueprint.main.state_projection"
    assert projection["stateAuthority"] == "node"
    assert projection["stateMutation"] == "none"
    assert projection["jobId"] == "job-blueprint-main-state"
    assert projection["stage"] == "spec_tree"
    assert projection["status"] == "running"
    assert projection["nodeStatus"] == "running"
    assert projection["stale"] is True
    assert projection["staleArtifactIds"] == ["artifact-spec-tree"]
    assert [artifact["id"] for artifact in projection["artifacts"]] == [
        "artifact-route-set",
        "artifact-spec-tree",
    ]
    assert projection["artifacts"][1]["stale"] is True
    assert projection["artifacts"][1]["staleSince"] == "2026-06-20T00:00:02.000Z"

    forbidden_keys = {"request", "events", "nextAction", "stageState", "checksLedger"}
    assert forbidden_keys.isdisjoint(projection.keys())


@pytest.mark.parametrize(
    ("node_status", "projection_status"),
    [
        ("pending", "pending"),
        ("running", "running"),
        ("waiting", "running"),
        ("reviewing", "running"),
        ("completed", "done"),
        ("failed", "failed"),
    ],
)
def test_projection_maps_node_statuses_without_expanding_runtime_ownership(
    node_status: str,
    projection_status: str,
):
    job = _job(status=node_status)
    job["artifacts"][1].pop("staleSince")
    job["artifacts"][1].pop("invalidatedBy")
    job["staleArtifactIds"] = []

    projection = project_blueprint_main_state(job)

    assert projection.status == projection_status
    assert projection.nodeStatus == node_status
    assert projection.status in VALID_PROJECTION_STATUSES
    assert projection.nodeStatus in VALID_NODE_STATUSES


def test_stale_projection_does_not_mask_underlying_failed_status():
    job = _job(status="failed")
    job["error"] = {
        "code": "spec_tree_generation_failed",
        "message": "SPEC tree generation failed validation.",
        "stage": "spec_tree",
    }
    job["staleArtifactIds"] = ["artifact-spec-tree"]

    projection = project_blueprint_main_state(job).model_dump(exclude_none=True)

    assert projection["status"] == "failed"
    assert projection["nodeStatus"] == "failed"
    assert projection["stale"] is True
    assert projection["error"]["code"] == "spec_tree_generation_failed"
    assert projection["error"]["stage"] == "spec_tree"
    assert projection["status"] != "done"


def test_explicit_stale_status_requires_stale_marker_without_becoming_success():
    projection = BlueprintMainStateProjection(
        jobId="job-stale",
        stage="spec_docs",
        status="stale",
        nodeStatus="completed",
        updatedAt="2026-06-20T00:00:00.000Z",
        stale=True,
        staleArtifactIds=["artifact-spec-docs"],
        artifacts=[
            BlueprintMainStateArtifact(
                id="artifact-spec-docs",
                type="spec_document_version",
                title="SPEC docs",
                summary="Generated docs.",
                createdAt="2026-06-20T00:00:00.000Z",
                stale=True,
                staleSince="2026-06-20T00:00:01.000Z",
            )
        ],
    )

    assert projection.status == "stale"
    assert projection.status != "done"
    assert projection.stale is True


def test_error_status_cannot_pretend_to_be_done():
    payload = {
        "jobId": "job-error",
        "stage": "spec_tree",
        "status": "done",
        "nodeStatus": "failed",
        "updatedAt": "2026-06-20T00:00:00.000Z",
        "stale": False,
        "error": {
            "code": "failed",
            "message": "Node job failed.",
            "stage": "spec_tree",
        },
    }

    with pytest.raises(ValidationError):
        BlueprintMainStateProjection(**payload)


def test_failed_projection_requires_error_details():
    payload = {
        "jobId": "job-error",
        "stage": "spec_tree",
        "status": "failed",
        "nodeStatus": "failed",
        "updatedAt": "2026-06-20T00:00:00.000Z",
        "stale": False,
    }

    with pytest.raises(ValidationError):
        BlueprintMainStateProjection(**payload)


def test_unknown_status_is_rejected():
    payload = deepcopy(_job(status="blocked"))

    with pytest.raises(ValueError):
        project_blueprint_main_state(payload)


def test_error_model_requires_non_empty_code_message_and_stage():
    with pytest.raises(ValidationError):
        BlueprintMainStateError(code="", message="", stage="")
