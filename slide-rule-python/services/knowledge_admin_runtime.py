"""Deterministic Python runtime bridge for knowledge admin.

This module supports the minimal management surface Node can delegate:
list/get/upsert/delete. It is deliberately storage-injected. The default bridge
is contract-only and does not connect to production knowledge storage, vector
indexes, ingestion, or embedding rebuilds.
"""

from __future__ import annotations

from copy import deepcopy
from typing import Any, Protocol


KNOWLEDGE_ADMIN_RUNTIME_CONTRACT_VERSION = "knowledge-admin.runtime.v1"
KNOWLEDGE_ADMIN_RUNTIME_PROVENANCE = "python-knowledge-admin-runtime"
KNOWLEDGE_ADMIN_PERMISSION = "knowledge.admin"
KNOWLEDGE_ADMIN_RUNTIME_OPERATIONS = {"list", "get", "upsert", "delete"}


class KnowledgeAdminRuntimeStorage(Protocol):
    storage_name: str
    storage_owner: str
    external_storage: bool
    migrated_storage: bool

    def list_items(self, project_id: str) -> list[dict[str, Any]]:
        ...

    def get_item(self, project_id: str, item_id: str) -> dict[str, Any] | None:
        ...

    def upsert_item(self, project_id: str, item: dict[str, Any]) -> dict[str, Any]:
        ...

    def delete_item(self, project_id: str, item_id: str) -> bool:
        ...


class ContractOnlyKnowledgeAdminRuntimeStorage:
    """No-op default storage used by gates and local runtime wiring."""

    storage_name = "runtime-contract-only"
    storage_owner = "none"
    external_storage = False
    migrated_storage = False

    def list_items(self, project_id: str) -> list[dict[str, Any]]:
        return []

    def get_item(self, project_id: str, item_id: str) -> dict[str, Any] | None:
        return None

    def upsert_item(self, project_id: str, item: dict[str, Any]) -> dict[str, Any]:
        return deepcopy(item)

    def delete_item(self, project_id: str, item_id: str) -> bool:
        return False


class InMemoryKnowledgeAdminRuntimeStorage:
    """In-memory test adapter proving the bridge can mutate injected storage."""

    storage_name = "memory"
    storage_owner = "injected"
    external_storage = False
    migrated_storage = True

    def __init__(self) -> None:
        self._items_by_project: dict[str, dict[str, dict[str, Any]]] = {}

    def list_items(self, project_id: str) -> list[dict[str, Any]]:
        items = self._items_by_project.get(project_id, {})
        return [deepcopy(item) for item in items.values()]

    def get_item(self, project_id: str, item_id: str) -> dict[str, Any] | None:
        item = self._items_by_project.get(project_id, {}).get(item_id)
        return deepcopy(item) if item is not None else None

    def upsert_item(self, project_id: str, item: dict[str, Any]) -> dict[str, Any]:
        item_id = _read_item_id(item)
        clean = _clean_runtime_item(item, project_id=project_id)
        self._items_by_project.setdefault(project_id, {})[item_id] = clean
        return deepcopy(clean)

    def delete_item(self, project_id: str, item_id: str) -> bool:
        items = self._items_by_project.get(project_id, {})
        return items.pop(item_id, None) is not None


def execute_knowledge_admin_runtime(
    payload: dict[str, Any],
    *,
    storage: KnowledgeAdminRuntimeStorage | None = None,
) -> dict[str, Any]:
    """Project a knowledge admin runtime action into a stable envelope."""

    if not isinstance(payload, dict):
        return _status_error(
            "",
            "validation_error",
            "payload_not_object",
            "knowledge admin runtime payload must be an object",
            400,
        )

    operation = _clean_string(payload.get("operation"))
    if operation not in KNOWLEDGE_ADMIN_RUNTIME_OPERATIONS:
        return _status_error(
            operation,
            "invalid_operation",
            "unsupported_operation",
            "operation must be list, get, upsert, or delete",
            400,
        )

    if not _has_knowledge_admin_permission(payload):
        return _status_error(
            operation,
            "permission_denied",
            "missing_knowledge_admin_permission",
            "knowledge admin permission denied",
            403,
            permission_failure=True,
        )

    project_id = _clean_string(payload.get("projectId"))
    if not project_id:
        return _status_error(
            operation,
            "validation_error",
            "missing_project_id",
            "knowledge admin projectId is required",
            400,
        )

    store = storage or ContractOnlyKnowledgeAdminRuntimeStorage()
    base = _success_base(operation, project_id, store)

    if operation == "list":
        return {
            **base,
            "items": store.list_items(project_id),
        }

    if operation == "get":
        item_id = _read_target_item_id(payload)
        if not item_id:
            return _status_error(
                operation,
                "validation_error",
                "missing_item_id",
                "knowledge admin item id is required",
                400,
            )
        item = store.get_item(project_id, item_id)
        if item is None:
            return _status_error(
                operation,
                "not_found",
                "knowledge_item_not_found",
                f"knowledge item {item_id} was not found",
                404,
            )
        return {
            **base,
            "found": True,
            "item": item,
        }

    if operation == "upsert":
        item = payload.get("item")
        if not isinstance(item, dict):
            return _status_error(
                operation,
                "validation_error",
                "missing_item",
                "knowledge admin item is required",
                400,
            )
        item_id = _read_item_id(item)
        if not item_id:
            return _status_error(
                operation,
                "validation_error",
                "missing_item_id",
                "knowledge admin item id is required",
                400,
            )
        stored_item = store.upsert_item(project_id, item)
        return {
            **base,
            "item": stored_item,
            "stored": store.migrated_storage,
        }

    item_id = _read_target_item_id(payload)
    if not item_id:
        return _status_error(
            operation,
            "validation_error",
            "missing_item_id",
            "knowledge admin item id is required",
            400,
        )
    return {
        **base,
        "deletedId": item_id,
        "deleted": store.delete_item(project_id, item_id),
    }


def _success_base(
    operation: str,
    project_id: str,
    storage: KnowledgeAdminRuntimeStorage,
) -> dict[str, Any]:
    return {
        "ok": True,
        "operation": operation,
        "contractVersion": KNOWLEDGE_ADMIN_RUNTIME_CONTRACT_VERSION,
        "runtime": {
            "owner": "python",
            "mode": "runtime_bridge",
            "storageOwner": storage.storage_owner,
            "externalStorage": storage.external_storage,
            "ingestion": "not_started",
            "embedding": "not_started",
        },
        "projectId": project_id,
        "storage": storage.storage_name,
        "migratedStorage": storage.migrated_storage,
        "provenance": KNOWLEDGE_ADMIN_RUNTIME_PROVENANCE,
    }


def _status_error(
    operation: str,
    error: str,
    reason: str,
    message: str,
    status_code: int,
    *,
    permission_failure: bool = False,
) -> dict[str, Any]:
    return {
        "ok": False,
        "operation": operation,
        "error": error,
        "reason": reason,
        "message": message,
        "permissionFailure": permission_failure,
        "statusCode": status_code,
        "provenance": KNOWLEDGE_ADMIN_RUNTIME_PROVENANCE,
    }


def _has_knowledge_admin_permission(payload: dict[str, Any]) -> bool:
    actor = payload.get("actor")
    if not isinstance(actor, dict):
        return False
    permissions = actor.get("permissions")
    return isinstance(permissions, list) and KNOWLEDGE_ADMIN_PERMISSION in permissions


def _clean_runtime_item(
    item: dict[str, Any],
    *,
    project_id: str,
) -> dict[str, Any]:
    clean: dict[str, Any] = {}
    for key in ("id", "title", "content", "metadata"):
        if key in item:
            clean[key] = deepcopy(item[key])
    clean["projectId"] = _clean_string(item.get("projectId"), project_id)
    return clean


def _read_item_id(item: dict[str, Any]) -> str:
    return _clean_string(item.get("id"))


def _read_target_item_id(payload: dict[str, Any]) -> str:
    return _clean_string(payload.get("itemId"), _clean_string(payload.get("id")))


def _clean_string(value: Any, fallback: str = "") -> str:
    text = str(value or "").strip()
    return text or fallback
