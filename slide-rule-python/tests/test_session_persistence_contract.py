import json

from models.v5_state import V5SessionState
from services.persistence import (
    delete_session_record,
    load_all,
    load_session_record,
    list_session_records,
    save_session_record,
)


def make_state(session_id: str, goal_text: str = "persist contract") -> V5SessionState:
    return V5SessionState(
        sessionId=session_id,
        goal={"text": goal_text, "status": "needs_refinement"},
        artifacts=[],
        capabilityRuns=[],
        coverageGaps=[],
        conversation=[],
    )


def test_save_load_and_list_use_node_compatible_store_shape(tmp_path):
    store_file = tmp_path / "sessions.json"
    state = make_state("py-contract-001")

    saved = save_session_record(state, store_file=store_file)

    assert saved == {"ok": True, "sessionId": "py-contract-001"}
    raw = json.loads(store_file.read_text(encoding="utf-8"))
    assert isinstance(raw, list)
    assert raw[0][0] == "py-contract-001"
    assert raw[0][1]["sessionId"] == "py-contract-001"

    loaded = load_session_record("py-contract-001", store_file=store_file)
    assert loaded["ok"] is True
    assert loaded["session"].sessionId == "py-contract-001"

    listed = list_session_records(store_file=store_file)
    assert listed == {
        "ok": True,
        "sessions": [
            {
                "sessionId": "py-contract-001",
                "goal": "persist contract",
                "createdAt": None,
                "lastActive": None,
                "artifactCount": 0,
                "phase": None,
            }
        ],
    }

    deleted = delete_session_record("py-contract-001", store_file=store_file)
    assert deleted == {"ok": True, "sessionId": "py-contract-001"}
    assert load_session_record("py-contract-001", store_file=store_file) == {
        "ok": False,
        "error": "not_found",
        "sessionId": "py-contract-001",
    }
    assert json.loads(store_file.read_text(encoding="utf-8")) == []


def test_missing_session_returns_node_compatible_not_found_shape(tmp_path):
    store_file = tmp_path / "sessions.json"

    result = load_session_record("missing-session", store_file=store_file)

    assert result == {
        "ok": False,
        "error": "not_found",
        "sessionId": "missing-session",
    }


def test_session_state_accepts_untrusted_artifacts_from_frontend_runtime(tmp_path):
    store_file = tmp_path / "sessions-untrusted.json"
    state = V5SessionState(
        sessionId="py-untrusted-001",
        goal={"text": "persist untrusted artifact", "status": "needs_refinement"},
        artifacts=[
            {
                "id": "art-untrusted-001",
                "kind": "evidence",
                "provenance": "llm_fallback",
                "trustLevel": "untrusted",
                "passedGates": [],
                "content": "failed grounding should remain auditable",
            }
        ],
        capabilityRuns=[],
        coverageGaps=[],
        conversation=[],
    )

    saved = save_session_record(state, store_file=store_file)
    loaded = load_session_record("py-untrusted-001", store_file=store_file)

    assert saved == {"ok": True, "sessionId": "py-untrusted-001"}
    assert loaded["ok"] is True
    assert loaded["session"].artifacts[0].trustLevel == "untrusted"


def test_corrupt_store_returns_stable_error_shape_for_load_and_list(tmp_path):
    store_file = tmp_path / "sessions.json"
    store_file.write_text("{not-json", encoding="utf-8")

    loaded = load_session_record("py-corrupt", store_file=store_file)
    listed = list_session_records(store_file=store_file)

    assert loaded["ok"] is False
    assert loaded["error"] == "store_corrupt"
    assert loaded["reason"] == "invalid_json"
    assert loaded["sessionId"] == "py-corrupt"
    assert listed["ok"] is False
    assert listed["error"] == "store_corrupt"
    assert listed["reason"] == "invalid_json"


def test_load_all_accepts_legacy_python_mapping_shape(tmp_path):
    store_file = tmp_path / "legacy-python-sessions.json"
    state = make_state("py-legacy-001", goal_text="legacy mapping")
    store_file.write_text(
        json.dumps({"py-legacy-001": state.model_dump()}),
        encoding="utf-8",
    )

    sessions = load_all(store_file=store_file)

    assert list(sessions.keys()) == ["py-legacy-001"]
    assert sessions["py-legacy-001"].goal["text"] == "legacy mapping"
