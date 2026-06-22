"""Bounded Python runtime store for Blueprint artifact memory.

This slice owns only an in-memory artifact-memory runtime store. It deliberately
does not migrate the full Blueprint route shell or connect to external storage.
"""

from __future__ import annotations

from copy import deepcopy
from typing import Any


ARTIFACT_MEMORY_RUNTIME_CONTRACT_VERSION = "blueprint.artifact-memory.runtime.v1"
ARTIFACT_MEMORY_RUNTIME_SOURCE = "python-artifact-memory-runtime"
ARTIFACT_MEMORY_RESOURCES = {"all", "ledger", "events", "replays", "feedback"}
ARTIFACT_MEMORY_ACTIONS = {"list", "read", "write", "delete"}


class BlueprintArtifactMemoryRuntimeStore:
    """Small process-local runtime store keyed by project/session/job scope."""

    def __init__(self, max_items_per_scope: int = 256):
        self.max_items_per_scope = max_items_per_scope
        self._scopes: dict[
            tuple[str, str, str],
            dict[str, dict[str, dict[str, Any]]],
        ] = {}

    def execute(self, payload: dict[str, Any]) -> dict[str, Any]:
        try:
            return self._execute(payload)
        except Exception as error:  # pragma: no cover - defensive envelope hardening
            return self._error(
                payload,
                "runtime_error",
                "artifact_memory_runtime_exception",
                str(error),
                500,
            )

    def _execute(self, payload: dict[str, Any]) -> dict[str, Any]:
        action = _clean_text(payload.get("action"), "list")
        if action not in ARTIFACT_MEMORY_ACTIONS:
            return self._error(
                payload,
                "invalid_action",
                "unsupported_artifact_memory_action",
                "Artifact memory runtime action must be list, read, write, or delete.",
                400,
                extra={"allowedActions": sorted(ARTIFACT_MEMORY_ACTIONS)},
            )

        resource = _clean_text(payload.get("resource"), "all")
        if resource not in ARTIFACT_MEMORY_RESOURCES:
            return self._error(
                payload,
                "invalid_resource",
                "unsupported_artifact_memory_resource",
                "Artifact memory runtime resource must be all, ledger, events, replays, or feedback.",
                400,
                extra={"allowedResources": sorted(ARTIFACT_MEMORY_RESOURCES)},
            )
        if action in {"write", "delete"} and resource == "all":
            return self._error(
                payload,
                "invalid_resource",
                "write_delete_requires_specific_resource",
                "Artifact memory write/delete requires a specific resource.",
                400,
                extra={"allowedResources": ["ledger", "events", "replays", "feedback"]},
            )

        scope_result = self._scope(payload)
        if scope_result.get("ok") is False:
            return scope_result
        scope = scope_result["scope"]

        if payload.get("stale") is True:
            return self._error(
                payload,
                "stale_scope",
                "artifact_memory_scope_stale",
                "Artifact memory scope is stale and must be refreshed before mutation.",
                409,
                scope=scope,
            )

        if action == "list":
            return self._list(payload, scope, resource)
        if action == "read":
            return self._read(payload, scope, resource)
        if action == "write":
            return self._write(payload, scope, resource)
        return self._delete(payload, scope, resource)

    def _scope(self, payload: dict[str, Any]) -> dict[str, Any]:
        project_id = _clean_text(payload.get("projectId"), "default-project")
        session_id = _clean_text(payload.get("sessionId"), "default-session")
        job_id = _clean_text(payload.get("jobId"), "")
        if not job_id:
            return self._error(
                payload,
                "jobId_required",
                "missing_job_id",
                "Artifact memory runtime requires jobId.",
                400,
            )
        return {
            "ok": True,
            "scope": {
                "projectId": project_id,
                "sessionId": session_id,
                "jobId": job_id,
            },
        }

    def _bucket(self, scope: dict[str, str]) -> dict[str, dict[str, dict[str, Any]]]:
        key = (scope["projectId"], scope["sessionId"], scope["jobId"])
        return self._scopes.setdefault(
            key,
            {
                "ledger": {},
                "events": {},
                "replays": {},
                "feedback": {},
            },
        )

    def _list(
        self,
        payload: dict[str, Any],
        scope: dict[str, str],
        resource: str,
    ) -> dict[str, Any]:
        return self._success(payload, scope, resource)

    def _read(
        self,
        payload: dict[str, Any],
        scope: dict[str, str],
        resource: str,
    ) -> dict[str, Any]:
        item_id = _clean_text(payload.get("itemId"), "")
        if not item_id:
            return self._error(
                payload,
                "itemId_required",
                "missing_item_id",
                "Artifact memory read requires itemId.",
                400,
                scope=scope,
            )

        item = self._find(scope, resource, item_id)
        if item is None:
            return self._not_found(payload, scope, resource, item_id)

        result = self._success(payload, scope, resource)
        result["item"] = item
        result["found"] = True
        return result

    def _write(
        self,
        payload: dict[str, Any],
        scope: dict[str, str],
        resource: str,
    ) -> dict[str, Any]:
        item = payload.get("item")
        if not isinstance(item, dict):
            return self._error(
                payload,
                "item_required",
                "missing_item",
                "Artifact memory write requires item.",
                400,
                scope=scope,
            )
        item_id = _clean_text(item.get("id") or payload.get("itemId"), "")
        if not item_id:
            return self._error(
                payload,
                "item_id_required",
                "missing_item_id",
                "Artifact memory item id is required.",
                400,
                scope=scope,
            )

        bucket = self._bucket(scope)
        if (
            item_id not in bucket[resource]
            and _scope_count(bucket) >= self.max_items_per_scope
        ):
            return self._error(
                payload,
                "store_limit_exceeded",
                "artifact_memory_store_limit_exceeded",
                "Artifact memory runtime scope exceeded its item limit.",
                507,
                scope=scope,
            )

        stored = deepcopy(item)
        stored["id"] = item_id
        stored.setdefault("jobId", scope["jobId"])
        bucket[resource][item_id] = stored

        result = self._success(payload, scope, resource)
        result["item"] = deepcopy(stored)
        result["written"] = True
        return result

    def _delete(
        self,
        payload: dict[str, Any],
        scope: dict[str, str],
        resource: str,
    ) -> dict[str, Any]:
        item_id = _clean_text(payload.get("itemId"), "")
        if not item_id:
            return self._error(
                payload,
                "itemId_required",
                "missing_item_id",
                "Artifact memory delete requires itemId.",
                400,
                scope=scope,
            )

        bucket = self._bucket(scope)
        if item_id not in bucket[resource]:
            return self._not_found(payload, scope, resource, item_id)

        del bucket[resource][item_id]
        result = self._success(payload, scope, resource)
        result["deleted"] = True
        result["deletedId"] = item_id
        return result

    def _find(
        self,
        scope: dict[str, str],
        resource: str,
        item_id: str,
    ) -> dict[str, Any] | None:
        bucket = self._bucket(scope)
        if resource == "all":
            for resource_name in ("ledger", "events", "replays", "feedback"):
                item = bucket[resource_name].get(item_id)
                if item is not None:
                    return deepcopy(item)
            return None
        item = bucket[resource].get(item_id)
        return deepcopy(item) if item is not None else None

    def _success(
        self,
        payload: dict[str, Any],
        scope: dict[str, str],
        resource: str,
    ) -> dict[str, Any]:
        bucket = self._bucket(scope)
        snapshot = _snapshot(bucket)
        return {
            "ok": True,
            "status": "completed",
            "statusCode": 200,
            "action": _clean_text(payload.get("action"), "list"),
            "resource": resource,
            "contractVersion": ARTIFACT_MEMORY_RUNTIME_CONTRACT_VERSION,
            "runtime": _runtime_boundary(scope),
            "source": ARTIFACT_MEMORY_RUNTIME_SOURCE,
            "persistenceOwner": "python",
            **scope,
            **snapshot,
            "counts": _counts(snapshot),
        }

    def _not_found(
        self,
        payload: dict[str, Any],
        scope: dict[str, str],
        resource: str,
        item_id: str,
    ) -> dict[str, Any]:
        result = self._error(
            payload,
            "not_found",
            "artifact_memory_item_not_found",
            f"Artifact memory item {item_id} was not found.",
            404,
            scope=scope,
        )
        result["status"] = "not_found"
        result["resource"] = resource
        result["itemId"] = item_id
        result["found"] = False
        return result

    def _error(
        self,
        payload: dict[str, Any],
        error: str,
        reason: str,
        message: str,
        status_code: int,
        *,
        scope: dict[str, str] | None = None,
        extra: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        action = _clean_text(payload.get("action"), "list")
        resource = _clean_text(payload.get("resource"), "all")
        resolved_scope = scope or {
            "projectId": _clean_text(payload.get("projectId"), "default-project"),
            "sessionId": _clean_text(payload.get("sessionId"), "default-session"),
            "jobId": _clean_text(payload.get("jobId"), ""),
        }
        result: dict[str, Any] = {
            "ok": False,
            "status": "failed",
            "statusCode": status_code,
            "action": action,
            "resource": resource,
            "contractVersion": ARTIFACT_MEMORY_RUNTIME_CONTRACT_VERSION,
            "runtime": _runtime_boundary(resolved_scope),
            "source": ARTIFACT_MEMORY_RUNTIME_SOURCE,
            "persistenceOwner": "python",
            **resolved_scope,
            "error": error,
            "reason": reason,
            "message": message,
        }
        if extra:
            result.update(extra)
        return result


def _runtime_boundary(scope: dict[str, str]) -> dict[str, Any]:
    return {
        "owner": "python",
        "mode": "runtime_store",
        "storage": "memory",
        "externalStorage": False,
        "projectId": scope.get("projectId", ""),
        "sessionId": scope.get("sessionId", ""),
        "jobId": scope.get("jobId", ""),
        "bounded": True,
    }


def _snapshot(
    bucket: dict[str, dict[str, dict[str, Any]]],
) -> dict[str, list[dict[str, Any]]]:
    return {
        "ledger": [deepcopy(item) for item in bucket["ledger"].values()],
        "events": [deepcopy(item) for item in bucket["events"].values()],
        "replays": [deepcopy(item) for item in bucket["replays"].values()],
        "feedback": [deepcopy(item) for item in bucket["feedback"].values()],
    }


def _counts(snapshot: dict[str, list[dict[str, Any]]]) -> dict[str, int]:
    return {
        "ledger": len(snapshot["ledger"]),
        "events": len(snapshot["events"]),
        "replays": len(snapshot["replays"]),
        "feedback": len(snapshot["feedback"]),
    }


def _scope_count(bucket: dict[str, dict[str, dict[str, Any]]]) -> int:
    return sum(len(items) for items in bucket.values())


def _clean_text(value: Any, fallback: str) -> str:
    text = str(value or "").strip()
    return text or fallback
