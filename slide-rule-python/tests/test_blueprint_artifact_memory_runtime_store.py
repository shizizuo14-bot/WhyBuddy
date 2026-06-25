"""Runtime-store tests for Blueprint artifact memory.

This is a bounded in-memory runtime slice. It does not migrate the full
Blueprint API or connect to external persistence.
"""

from services.blueprint_artifact_memory import BlueprintArtifactMemoryRuntimeStore


def _ledger_entry(entry_id="entry-1", job_id="job-1"):
    return {
        "id": entry_id,
        "jobId": job_id,
        "artifactId": f"artifact-{entry_id}",
        "artifactType": "requirements",
        "stage": "spec_docs",
        "title": "Requirements",
        "summary": "Requirement artifact",
        "createdAt": "2026-06-20T00:00:00.000Z",
        "sourceIds": {
            "routeIds": ["route-1"],
            "specTreeNodeIds": ["node-1"],
            "specDocumentIds": ["doc-1"],
            "effectPreviewIds": [],
            "promptPackageIds": [],
            "capabilityIds": [],
            "roleIds": [],
            "crewIds": [],
        },
        "version": 1,
        "tags": ["requirements"],
        "payloadSummary": {"status": "draft"},
    }


def _payload(action, **overrides):
    payload = {
        "action": action,
        "resource": "ledger",
        "projectId": "project-1",
        "sessionId": "session-1",
        "jobId": "job-1",
    }
    payload.update(overrides)
    return payload


def test_write_read_list_delete_round_trip_in_project_session_scope():
    store = BlueprintArtifactMemoryRuntimeStore(max_items_per_scope=8)
    entry = _ledger_entry()

    written = store.execute(_payload("write", item=entry))
    assert written["ok"] is True
    assert written["status"] == "completed"
    assert written["source"] == "python-artifact-memory-runtime"
    assert written["persistenceOwner"] == "python"
    assert written["item"]["id"] == "entry-1"
    assert written["counts"]["ledger"] == 1

    listed = store.execute(_payload("list"))
    assert listed["ok"] is True
    assert [item["id"] for item in listed["ledger"]] == ["entry-1"]
    assert listed["counts"]["ledger"] == 1

    read = store.execute(_payload("read", itemId="entry-1"))
    assert read["ok"] is True
    assert read["found"] is True
    assert read["item"] == entry

    deleted = store.execute(_payload("delete", itemId="entry-1"))
    assert deleted["ok"] is True
    assert deleted["deleted"] is True
    assert deleted["deletedId"] == "entry-1"
    assert deleted["counts"]["ledger"] == 0

    missing = store.execute(_payload("read", itemId="entry-1"))
    assert missing["ok"] is False
    assert missing["status"] == "not_found"
    assert missing["found"] is False
    assert missing["error"] == "not_found"
    assert missing["statusCode"] == 404


def test_runtime_store_isolates_project_session_and_job_scope():
    store = BlueprintArtifactMemoryRuntimeStore()
    entry = _ledger_entry("entry-shared", "job-1")

    store.execute(_payload("write", item=entry))

    same_project_other_session = store.execute(
        _payload("list", sessionId="session-2")
    )
    other_project_same_session = store.execute(
        _payload("list", projectId="project-2")
    )
    same_scope_other_job = store.execute(
        _payload("list", jobId="job-2")
    )

    assert same_project_other_session["ok"] is True
    assert other_project_same_session["ok"] is True
    assert same_scope_other_job["ok"] is True
    assert same_project_other_session["ledger"] == []
    assert other_project_same_session["ledger"] == []
    assert same_scope_other_job["ledger"] == []


def test_missing_not_found_and_stale_envelopes_are_not_success():
    store = BlueprintArtifactMemoryRuntimeStore()

    missing_item_id = store.execute(_payload("read"))
    assert missing_item_id["ok"] is False
    assert missing_item_id["status"] == "failed"
    assert missing_item_id["error"] == "itemId_required"
    assert missing_item_id["statusCode"] == 400

    not_found = store.execute(_payload("read", itemId="missing"))
    assert not_found["ok"] is False
    assert not_found["status"] == "not_found"
    assert not_found["error"] == "not_found"
    assert not_found["found"] is False
    assert not_found["statusCode"] == 404

    stale = store.execute(_payload("write", stale=True, item=_ledger_entry()))
    assert stale["ok"] is False
    assert stale["status"] == "failed"
    assert stale["error"] == "stale_scope"
    assert stale["statusCode"] == 409


def test_invalid_resource_and_bound_errors_are_failed_envelopes():
    store = BlueprintArtifactMemoryRuntimeStore(max_items_per_scope=1)

    invalid = store.execute(_payload("list", resource="database"))
    assert invalid["ok"] is False
    assert invalid["status"] == "failed"
    assert invalid["error"] == "invalid_resource"
    assert invalid["statusCode"] == 400

    first = store.execute(_payload("write", item=_ledger_entry("entry-1")))
    second = store.execute(_payload("write", item=_ledger_entry("entry-2")))

    assert first["ok"] is True
    assert second["ok"] is False
    assert second["status"] == "failed"
    assert second["error"] == "store_limit_exceeded"
    assert second["statusCode"] == 507
