"""Read-only Blueprint main state projection helpers."""

from __future__ import annotations

from typing import Any, Dict, Iterable, List, Mapping, Optional

from models.blueprint_state import (
    BlueprintMainStateArtifact,
    BlueprintMainStateError,
    BlueprintMainStateProjection,
)

VALID_NODE_STATUSES = {"pending", "running", "waiting", "reviewing", "completed", "failed"}


def project_blueprint_main_state(job: Mapping[str, Any]) -> BlueprintMainStateProjection:
    """Project a Node-owned Blueprint job into the Python main-state contract."""

    if not isinstance(job, Mapping):
        raise ValueError("job must be an object")

    job_id = _required_string(job, "id")
    stage = _required_string(job, "stage")
    node_status = _required_string(job, "status")
    if node_status not in VALID_NODE_STATUSES:
        raise ValueError(f"unsupported Blueprint job status: {node_status}")

    artifacts = _project_artifacts(job.get("artifacts"), set(_string_list(job.get("staleArtifactIds"))))
    artifact_stale_ids = {artifact.id for artifact in artifacts if artifact.stale}
    stale_artifact_ids = sorted(set(_string_list(job.get("staleArtifactIds"))) | artifact_stale_ids)
    stale = bool(job.get("stale")) or bool(stale_artifact_ids)
    status = _project_status(node_status, stale)
    errors = _project_errors(job, stage, node_status)

    return BlueprintMainStateProjection(
        jobId=job_id,
        projectId=_optional_string(job.get("projectId")),
        sourceId=_optional_string(job.get("sourceId")),
        version=_optional_string(job.get("version")),
        stage=stage,
        status=status,
        nodeStatus=node_status,
        createdAt=_optional_string(job.get("createdAt")),
        updatedAt=_required_string(job, "updatedAt"),
        completedAt=_optional_string(job.get("completedAt")),
        artifacts=artifacts,
        stale=stale,
        staleArtifactIds=stale_artifact_ids,
        error=errors[0] if errors else None,
        errors=errors,
    )


def _project_status(node_status: str, stale: bool) -> str:
    if node_status == "failed":
        return "failed"
    if node_status == "pending":
        return "pending"
    if node_status == "completed":
        return "stale" if stale else "done"
    return "running"


def _project_artifacts(raw_artifacts: Any, stale_ids: set[str]) -> List[BlueprintMainStateArtifact]:
    if raw_artifacts is None:
        return []
    if not isinstance(raw_artifacts, list):
        raise ValueError("artifacts must be a list")

    artifacts: List[BlueprintMainStateArtifact] = []
    for raw in raw_artifacts:
        if not isinstance(raw, Mapping):
            raise ValueError("artifact entries must be objects")
        artifact_id = _required_string(raw, "id")
        stale = bool(raw.get("stale")) or artifact_id in stale_ids or bool(raw.get("staleSince"))
        artifacts.append(
            BlueprintMainStateArtifact(
                id=artifact_id,
                type=_required_string(raw, "type"),
                title=_required_string(raw, "title"),
                summary=_required_string(raw, "summary"),
                createdAt=_required_string(raw, "createdAt"),
                payload=raw.get("payload"),
                stale=stale,
                staleSince=_optional_string(raw.get("staleSince")),
                invalidatedBy=raw.get("invalidatedBy"),
            )
        )
    return artifacts


def _project_errors(
    job: Mapping[str, Any],
    stage: str,
    node_status: str,
) -> List[BlueprintMainStateError]:
    errors: List[BlueprintMainStateError] = []

    raw_errors = job.get("errors")
    if isinstance(raw_errors, list):
        for raw_error in raw_errors:
            error = _project_error(raw_error, stage)
            if error is not None:
                errors.append(error)

    single_error = _project_error(job.get("error"), stage)
    if single_error is not None:
        errors.insert(0, single_error)

    if node_status == "failed" and not errors:
        errors.append(
            BlueprintMainStateError(
                code="blueprint_job_failed",
                message="Blueprint job failed without error details.",
                stage=stage,
            )
        )

    return errors


def _project_error(raw_error: Any, fallback_stage: str) -> Optional[BlueprintMainStateError]:
    if raw_error is None:
        return None
    if isinstance(raw_error, str):
        return BlueprintMainStateError(
            code="blueprint_job_failed",
            message=raw_error,
            stage=fallback_stage,
        )
    if not isinstance(raw_error, Mapping):
        raise ValueError("error entries must be objects or strings")
    return BlueprintMainStateError(
        code=_optional_string(raw_error.get("code")) or "blueprint_job_failed",
        message=_optional_string(raw_error.get("message")) or "Blueprint job failed.",
        stage=_optional_string(raw_error.get("stage")) or fallback_stage,
        retryable=raw_error.get("retryable") if isinstance(raw_error.get("retryable"), bool) else None,
    )


def _required_string(payload: Mapping[str, Any], key: str) -> str:
    value = payload.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{key} must be a non-empty string")
    return value


def _optional_string(value: Any) -> Optional[str]:
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError("expected a string")
    return value if value.strip() else None


def _string_list(value: Any) -> Iterable[str]:
    if value is None:
        return []
    if not isinstance(value, list):
        raise ValueError("expected a list of strings")
    if not all(isinstance(item, str) and item.strip() for item in value):
        raise ValueError("expected a list of non-empty strings")
    return value
