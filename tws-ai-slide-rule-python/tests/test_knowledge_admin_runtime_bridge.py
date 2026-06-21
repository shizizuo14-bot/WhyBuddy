"""Runtime bridge tests for the Python-side knowledge admin slice.

The runtime bridge supports the minimal admin surface for Node to delegate:
list/get/upsert/delete. Storage is injected for tests; the default bridge never
connects to production knowledge storage or external vector indexes.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.knowledge_admin_runtime import (  # noqa: E402
    KNOWLEDGE_ADMIN_RUNTIME_CONTRACT_VERSION,
    InMemoryKnowledgeAdminRuntimeStorage,
    execute_knowledge_admin_runtime,
)


ADMIN_ACTOR = {
    "id": "admin-1",
    "permissions": ["knowledge.admin"],
}


def _payload(operation: str, **overrides: object) -> dict:
    payload = {
        "operation": operation,
        "projectId": "project-runtime",
        "actor": ADMIN_ACTOR,
    }
    payload.update(overrides)
    return payload


def test_runtime_list_get_upsert_delete_use_injected_storage_only():
    storage = InMemoryKnowledgeAdminRuntimeStorage()

    upsert = execute_knowledge_admin_runtime(
        _payload(
            "upsert",
            item={
                "id": "kb-runtime-1",
                "title": "Runtime bridge",
                "content": "Python runtime bridge item",
                "metadata": {"source": "test"},
            },
        ),
        storage=storage,
    )
    listed = execute_knowledge_admin_runtime(_payload("list"), storage=storage)
    got = execute_knowledge_admin_runtime(
        _payload("get", itemId="kb-runtime-1"),
        storage=storage,
    )
    deleted = execute_knowledge_admin_runtime(
        _payload("delete", itemId="kb-runtime-1"),
        storage=storage,
    )
    listed_after_delete = execute_knowledge_admin_runtime(
        _payload("list"),
        storage=storage,
    )

    assert upsert["ok"] is True
    assert upsert["operation"] == "upsert"
    assert upsert["stored"] is True
    assert upsert["item"]["id"] == "kb-runtime-1"
    assert upsert["contractVersion"] == KNOWLEDGE_ADMIN_RUNTIME_CONTRACT_VERSION
    assert upsert["runtime"] == {
        "owner": "python",
        "mode": "runtime_bridge",
        "storageOwner": "injected",
        "externalStorage": False,
        "ingestion": "not_started",
        "embedding": "not_started",
    }

    assert listed["ok"] is True
    assert listed["operation"] == "list"
    assert listed["items"] == [upsert["item"]]
    assert listed["storage"] == "memory"
    assert listed["migratedStorage"] is True

    assert got["ok"] is True
    assert got["operation"] == "get"
    assert got["item"] == upsert["item"]
    assert got["found"] is True

    assert deleted["ok"] is True
    assert deleted["operation"] == "delete"
    assert deleted["deleted"] is True
    assert deleted["deletedId"] == "kb-runtime-1"
    assert listed_after_delete["items"] == []


def test_runtime_get_missing_item_returns_not_found_error_not_success():
    result = execute_knowledge_admin_runtime(
        _payload("get", itemId="missing"),
        storage=InMemoryKnowledgeAdminRuntimeStorage(),
    )

    assert result["ok"] is False
    assert result["operation"] == "get"
    assert result["error"] == "not_found"
    assert result["reason"] == "knowledge_item_not_found"
    assert result["statusCode"] == 404
    assert result["permissionFailure"] is False
    assert "item" not in result


def test_runtime_validation_and_permission_errors_are_not_success_payloads():
    storage = InMemoryKnowledgeAdminRuntimeStorage()
    denied = execute_knowledge_admin_runtime(
        {
            "operation": "upsert",
            "projectId": "project-runtime",
            "actor": {"id": "viewer-1", "permissions": ["knowledge.read"]},
            "item": {"id": "kb-runtime-1", "title": "Denied"},
        },
        storage=storage,
    )
    missing_item = execute_knowledge_admin_runtime(
        _payload("upsert", item={"title": "Missing id"}),
        storage=storage,
    )
    invalid_operation = execute_knowledge_admin_runtime(
        _payload("publish"),
        storage=storage,
    )

    assert denied["ok"] is False
    assert denied["error"] == "permission_denied"
    assert denied["statusCode"] == 403
    assert denied["permissionFailure"] is True
    assert "stored" not in denied

    assert missing_item["ok"] is False
    assert missing_item["error"] == "validation_error"
    assert missing_item["reason"] == "missing_item_id"
    assert missing_item["statusCode"] == 400
    assert "stored" not in missing_item

    assert invalid_operation["ok"] is False
    assert invalid_operation["error"] == "invalid_operation"
    assert invalid_operation["statusCode"] == 400
    assert "items" not in invalid_operation


def test_default_runtime_bridge_remains_contract_only_without_real_storage():
    upsert = execute_knowledge_admin_runtime(
        _payload(
            "upsert",
            item={
                "id": "kb-runtime-1",
                "title": "Default contract",
                "content": "This must not persist.",
            },
        )
    )
    listed = execute_knowledge_admin_runtime(_payload("list"))

    assert upsert["ok"] is True
    assert upsert["stored"] is False
    assert upsert["storage"] == "runtime-contract-only"
    assert upsert["migratedStorage"] is False
    assert upsert["runtime"]["storageOwner"] == "none"
    assert listed["ok"] is True
    assert listed["items"] == []
    assert listed["storage"] == "runtime-contract-only"
