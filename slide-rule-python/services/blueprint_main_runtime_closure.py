"""Blueprint main runtime closure (bounded Python-owned slice for 100 candidate).

Combines bounded decisions over main state, job lifecycle, event stream,
prompt preview, review/export and artifact memory.

Python returns a closure summary for Node to consume.
Python does NOT own:
- full route shell
- durable job store
- real event bus transport
- ledger
- full prompt package execution / LLM
- preview image gen
- diagnostics/ledger global

Only the decision envelope + metadata preservation for this closure slice.
"""

from __future__ import annotations

from typing import Any, Mapping

from services.blueprint_state_runtime import execute_blueprint_state_runtime
from services.blueprint_job_runtime import run_blueprint_job_runtime_action
from services.blueprint_job_event_stream import run_blueprint_job_event_stream_action
from services.blueprint_prompt_preview import (
    build_prompt_package_envelope,
    build_preview_safe_envelope,
)
from services.blueprint_review_export import build_blueprint_review_export_boundary
from services.blueprint_artifact_memory import BlueprintArtifactMemoryRuntimeStore


CONTRACT_VERSION = "blueprint.main-runtime-closure.v1"
PROVENANCE = "python-blueprint-main-runtime-closure"

CLOSURE_STATUSES = ("success", "partial", "degraded", "failed", "diagnostic-only")

NODE_BOUNDARIES = {
    "jobStoreOwner": "node",
    "eventBusOwner": "node",
    "ledgerOwner": "node",
    "previewOwner": "node",
    "promptPackageOwner": "node",
}


def execute_blueprint_main_runtime_closure(payload: dict[str, Any]) -> dict[str, Any]:
    """Execute bounded main runtime closure and return consumable summary."""
    if not isinstance(payload, dict):
        return _error_envelope(
            "validation_error",
            "payload_not_object",
            "Blueprint main runtime closure payload must be an object.",
            400,
        )

    job = payload.get("job")
    if "job" in payload and not isinstance(job, Mapping):
        return _error_envelope(
            "validation_error",
            "job_snapshot_not_object",
            "Blueprint main runtime closure job snapshot must be an object when provided.",
            400,
        )

    job_id = _clean_str(payload.get("jobId") or (job.get("id") if isinstance(job, Mapping) else None)) or "unknown"
    project_id = _clean_str((job.get("projectId") if isinstance(job, Mapping) else None) or payload.get("projectId"))
    stage_id = _clean_str((job.get("stage") if isinstance(job, Mapping) else None) or payload.get("stageId") or "input")
    actor = payload.get("actor") if isinstance(payload.get("actor"), dict) else None
    causation = payload.get("causation") or payload.get("trace") or payload.get("causedBy")
    if not isinstance(causation, dict):
        causation = None
    now = _clean_str(payload.get("now"))

    simulate = payload.get("simulate") if isinstance(payload.get("simulate"), dict) else {}
    diagnostics = payload.get("diagnostics") if isinstance(payload.get("diagnostics"), dict) else {}

    # Decide closure status - never hide boundaries
    if payload.get("diagnosticOnly") is True or simulate.get("diagnosticOnly") is True:
        status = "diagnostic-only"
    elif simulate.get("forceFailed") is True or simulate.get("failed") is True or payload.get("forceFailed"):
        status = "failed"
    elif simulate.get("degraded") is True or len(payload.get("warnings") or []) > 0:
        status = "degraded"
    elif simulate.get("partial") is True:
        status = "partial"
    else:
        status = "success"

    # Run bounded sub-runtimes (they preserve their contracts)
    state_result: dict[str, Any] = {}
    if job:
        try:
            state_result = execute_blueprint_state_runtime({
                "operation": "read",
                "jobId": job_id,
                "job": dict(job),
                "now": now,
                "nodeControl": NODE_BOUNDARIES,
            })
        except Exception as ex:  # pragma: no cover - defensive
            state_result = {"ok": False, "error": "sub_runtime", "message": str(ex)}

    job_result: dict[str, Any] = {}
    if job:
        try:
            job_result = run_blueprint_job_runtime_action("status", {"job": dict(job), "jobId": job_id, "now": now})
        except Exception as ex:
            job_result = {"ok": False, "error": "sub_runtime", "message": str(ex)}

    event_result: dict[str, Any] = {}
    if job:
        try:
            event_result = run_blueprint_job_event_stream_action("status", {"job": dict(job), "jobId": job_id, "now": now})
        except Exception as ex:
            event_result = {"ok": False, "error": "sub_runtime", "message": str(ex)}

    prompt_result: dict[str, Any] = {"status": "skipped"}
    if job and isinstance(job.get("promptPackage"), dict):
        try:
            prompt_result = build_prompt_package_envelope(job["promptPackage"])
        except Exception as ex:
            prompt_result = {"status": "error", "error": str(ex)}

    preview_result: dict[str, Any] = {}
    try:
        preview_result = build_preview_safe_envelope("plan", {"plan": {"steps": ["closure"]}})
    except Exception as ex:
        preview_result = {"status": "error", "error": str(ex)}

    review_result: dict[str, Any] = {}
    if job:
        try:
            review_result = build_blueprint_review_export_boundary({
                "jobId": job_id,
                "artifacts": job.get("artifacts", []),
                "reviewItems": job.get("reviewItems", []),
                "now": now,
                "trace": payload.get("trace"),
                "actor": actor,
            })
        except Exception as ex:
            review_result = {"status": "failed", "error": {"code": "sub", "message": str(ex)}}

    artifact_result: dict[str, Any] = {}
    try:
        store = BlueprintArtifactMemoryRuntimeStore()
        artifact_result = store.execute({
            "action": "list",
            "resource": "all",
            "jobId": job_id,
            "projectId": project_id,
        })
    except Exception as ex:
        artifact_result = {"error": str(ex)}

    # Build closure summary preserving required metadata
    closure_summary: dict[str, Any] = {
        "jobId": job_id,
        "projectId": project_id,
        "stageId": stage_id,
        "status": status,
        "components": {
            "mainState": bool(state_result.get("ok") if isinstance(state_result, dict) else False),
            "jobLifecycle": bool(job_result.get("ok") if isinstance(job_result, dict) else False),
            "eventStream": bool(event_result.get("ok") if isinstance(event_result, dict) else False),
            "promptPreview": (prompt_result.get("status") == "success") if isinstance(prompt_result, dict) else False,
            "reviewExport": (review_result.get("status") in ("exported", "degraded")) if isinstance(review_result, dict) else False,
            "artifactMemory": "items" in (artifact_result or {}) or bool(artifact_result),
        },
        "metadata": {
            "actor": actor,
            "causation": causation,
            "diagnostic": diagnostics,
        },
    }

    result: dict[str, Any] = {
        "status": status,
        "contractVersion": CONTRACT_VERSION,
        "provenance": PROVENANCE,
        "runtime": {
            "owner": "python",
            "mode": "bounded_closure",
            **NODE_BOUNDARIES,
        },
        "jobId": job_id,
        "projectId": project_id,
        "stageId": stage_id,
        "closureSummary": closure_summary,
        "diagnostics": {
            "componentsCovered": [
                "mainState",
                "jobLifecycle",
                "eventStream",
                "promptPreview",
                "reviewExport",
                "artifactMemory",
            ],
            "nodePersistencePreserved": True,
            "nodeEventBusPreserved": True,
            "nodeLedgerPreserved": True,
        },
        "subEnvelopes": {
            "state": state_result,
            "job": job_result,
            "event": event_result,
            "prompt": prompt_result,
            "preview": preview_result,
            "review": review_result,
            "artifact": artifact_result,
        },
    }

    # diagnostic-only must not look like production success takeover
    if status == "diagnostic-only":
        result["diagnosticOnly"] = True
        result["productionTakeover"] = False

    return result


def _clean_str(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        v = value.strip()
        return v or None
    return str(value) if value else None


def _error_envelope(error: str, reason: str, message: str, status_code: int) -> dict[str, Any]:
    return {
        "status": "failed",
        "ok": False,
        "error": error,
        "reason": reason,
        "message": message,
        "statusCode": status_code,
        "contractVersion": CONTRACT_VERSION,
        "provenance": PROVENANCE,
    }


__all__ = [
    "CONTRACT_VERSION",
    "PROVENANCE",
    "CLOSURE_STATUSES",
    "execute_blueprint_main_runtime_closure",
]
