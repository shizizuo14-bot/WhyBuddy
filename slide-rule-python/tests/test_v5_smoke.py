"""
V5 smoke / contract tests using FastAPI TestClient.

Run after `pip install -r requirements.txt`:
  python -m pytest tests/test_v5_smoke.py -q --tb=line

These test the migrated /api/sliderule surface (sessions, orchestrate, execute).
They use the permission-system goal from the fixtures to exercise RAG evidence paths.
"""

from fastapi.testclient import TestClient
import pytest

try:
    from app import app
except Exception as e:
    pytest.skip(f"app import failed (install requirements.txt first): {e}", allow_module_level=True)

client = TestClient(app)

INTERNAL_KEY = "dev-slide-rule-internal"

def test_health():
    r = client.get("/health")
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "ok"
    assert "slide-rule" in data.get("backend", "").lower() or "python" in data.get("backend", "").lower()
    # Provenance signal (standardized across foundation smokes)
    assert data.get("source") == "python" or "python" in str(data.get("provenance", "")).lower()


def test_sliderule_api_health_alias():
    r = client.get("/api/sliderule/health")
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "ok"
    assert "slide-rule" in data.get("backend", "").lower() or "python" in data.get("backend", "").lower()
    assert data.get("source") == "python" or "python" in str(data.get("provenance", "")).lower()


def test_orchestrate_plan_accepts_frontend_session_wrapper(monkeypatch):
    from services.slide_rule_orchestrator import OrchestratePlanResult

    def fake_orchestrate_plan(state, turn_id, user_text):
        assert state.sessionId == "wrapped-session"
        assert state.goal["text"] == "Build RBAC"
        assert state.graph["nodes"][0]["id"] == "n1"
        return OrchestratePlanResult(
            selected=[],
            rationale="wrapped state accepted",
            source="python-rag",
            converged=False,
        )

    monkeypatch.setattr("routes.sliderule_full.orchestrate_plan", fake_orchestrate_plan)

    r = client.post(
        "/api/sliderule/orchestrate-plan",
        json={
            "state": {
                "state": {
                    "sessionId": "wrapped-session",
                    "goal": {"text": "", "status": "needs_refinement"},
                    "artifacts": [],
                    "capabilityRuns": [],
                    "coverageGaps": [],
                    "coverageContract": None,
                    "coverageGate": None,
                    "graph": {"nodes": [], "edges": []},
                    "staleArtifactIds": [],
                    "conversation": [],
                },
                "provenance": "python-fullpath",
                "backend": "python",
                "goal": {"text": "Build RBAC", "status": "needs_refinement"},
                "graph": {"nodes": [{"id": "n1"}], "edges": []},
                "conversation": [{"role": "user", "text": "Build RBAC"}],
            },
            "turnId": "turn-wrapper",
            "userText": "Build RBAC",
        },
    )
    assert r.status_code == 200
    data = r.json()
    assert data["source"] == "python-rag"
    assert data["backend"] == "python"
    # Hardened standardized provenance contract asserts (task 07)
    assert data.get("provenance") == "python-rag"
    assert data.get("backend") == "python"

def test_sessions_crud():
    payload = {"goal": {"text": "分析权限系统的风险并给出最终报告"}, "sessionId": "smoke-001"}
    r = client.post("/api/sliderule/sessions", json=payload, headers={"X-Internal-Key": INTERNAL_KEY})
    assert r.status_code == 200
    data = r.json()
    assert "sessionId" in data or data.get("ok") is True
    # Standardized provenance for session ops (used by smokes/contract)
    assert data.get("provenance") == "python-fullpath"
    assert data.get("backend") == "python"

    sid = data.get("sessionId") or "smoke-001"
    r = client.get(f"/api/sliderule/sessions/{sid}", headers={"X-Internal-Key": INTERNAL_KEY})
    assert r.status_code == 200
    sess = r.json()
    assert "state" in sess or "goal" in sess
    assert sess.get("provenance") == "python-fullpath"
    assert sess.get("backend") == "python"

    r = client.delete(f"/api/sliderule/sessions/{sid}", headers={"X-Internal-Key": INTERNAL_KEY})
    assert r.status_code == 200
    deleted = r.json()
    assert deleted.get("ok") is True
    assert deleted.get("sessionId") == sid
    assert deleted.get("provenance") == "python-fullpath"
    assert deleted.get("backend") == "python"

    r = client.get(f"/api/sliderule/sessions/{sid}", headers={"X-Internal-Key": INTERNAL_KEY})
    assert r.status_code == 404


def test_sessions_list_python_owned():
    """Prove Python owns list sessions (for Node thin proxy contract)."""
    # ensure at least one
    client.post("/api/sliderule/sessions", json={"goal": {"text": "list-test"}, "sessionId": "smoke-list-1"}, headers={"X-Internal-Key": INTERNAL_KEY})
    r = client.get("/api/sliderule/sessions", headers={"X-Internal-Key": INTERNAL_KEY})
    assert r.status_code == 200
    data = r.json()
    assert "sessions" in data
    assert isinstance(data["sessions"], list)
    # Python provenance not required on list but backend signal via shape
    assert any(s.get("sessionId") == "smoke-list-1" for s in data["sessions"])

def test_orchestrate_and_execute_report_with_native_llm(monkeypatch):
    from sliderule_llm.client import LlmResult

    def fake_call_llm_json_with_shape(messages, **kwargs):
        content = (
            "结论：pet office feasibility conclusion grounded in goal\n"
            "支撑证据：desk-upgrade experiments support pacing\n"
            "反证/挑战：speed-first rollout risks balance issues\n"
            "风险：retention grind if upgrades feel cosmetic\n"
            "分歧：onboarding depth still unresolved\n"
            "收敛决策：prototype one desk-upgrade loop first\n"
            "未解缺口：retention benchmark missing\n"
            "下一步工程化分支：ship MVP desk loop and measure retention\n"
            "provenance / upstream refs：smoke-native-llm"
        )
        return (
            {
                "title": "Feasibility report",
                "summary": "Pet office feasibility summary",
                "content": content,
            },
            LlmResult(
                content="{}",
                usage={"total_tokens": 90},
                finish_reason="stop",
                model="fake-smoke-report",
                latency_ms=1,
            ),
        )

    monkeypatch.setattr(
        "sliderule_llm.capabilities.call_llm_json_with_shape",
        fake_call_llm_json_with_shape,
    )
    state = {
        "sessionId": "smoke-002",
        "goal": {"text": "分析权限系统的风险并给出最终报告"},
        "artifacts": [],
        "capabilityRuns": [],
        "coverageGaps": [],
        "coverageContract": None,
    }
    plan_resp = client.post(
        "/api/sliderule/orchestrate-plan",
        json={"state": state, "turnId": "smoke-t1", "userText": "开始推演"},
        headers={"X-Internal-Key": INTERNAL_KEY},
    )
    assert plan_resp.status_code == 200
    plan = plan_resp.json()
    selected = [s.get("capabilityId") for s in plan.get("selected", [])]
    # With RAG, should prefer evidence/tool/report for this goal
    assert any(c in selected for c in ["evidence.search", "mcp.call", "skill.invoke", "report.write", "risk.analyze"])

    # Execute report.write — native JSON LLM path (not RAG canned stub)
    exec_payload = {
        "capabilityId": "report.write",
        "state": plan.get("state", state),
        "inputArtifactIds": [],
        "roleId": "综合",
        "turnId": "smoke-t1",
    }
    exec_resp = client.post(
        "/api/sliderule/execute-capability",
        json=exec_payload,
        headers={"X-Internal-Key": INTERNAL_KEY},
    )
    assert exec_resp.status_code == 200
    data = exec_resp.json()
    assert data.get("provenance") == "python-llm"
    assert data.get("backend") == "python"
    # Hardened: standardized Python provenance fields (from routes/sliderule_full constants + llm native)
    # browser smokes rely on these exact signals; contract test now asserts them explicitly.
    assert data.get("provenance") in ("python-llm", "python-rag", "python-fullpath")
    content = data.get("content", "")
    assert len(content) > 150
    assert "支撑证据" in content
    assert "收敛决策" in content
    assert "provenance" in content.lower()


def test_sliderule_route_inventory_105_python_source_of_truth(monkeypatch):
    """Task 09 inventory verification: assert Python FastAPI is source for /api/sliderule core surfaces.
    Exercises key routes added/hardened for no-Node cutover. Proves provenance contract.
    """
    # Health sub
    r = client.get("/api/sliderule/health")
    assert r.status_code == 200
    data = r.json()
    assert data.get("source") == "python"
    assert "slide-rule-python" in data.get("backend", "") or data.get("backend") == "python"

    # Sessions (Python owns)
    payload = {"goal": {"text": "Inventory /api/sliderule routes"}, "sessionId": "inv-105"}
    r = client.post("/api/sliderule/sessions", json=payload, headers={"X-Internal-Key": INTERNAL_KEY})
    assert r.status_code == 200
    data = r.json()
    assert data.get("provenance") == "python-fullpath"
    assert data.get("backend") == "python"

    # orchestrate-plan
    plan_payload = {"state": {"sessionId": "inv-105", "goal": {"text": "inv", "status": "needs_refinement"}, "artifacts": [], "capabilityRuns": [], "graph": {"nodes": [], "edges": []}, "coverageGaps": [], "coverageContract": None}, "turnId": "inv-t", "userText": "inv"}
    r = client.post("/api/sliderule/orchestrate-plan", json=plan_payload, headers={"X-Internal-Key": INTERNAL_KEY})
    assert r.status_code == 200
    data = r.json()
    assert data.get("backend") == "python"
    assert "provenance" in data

    # execute-capability using monkey to avoid real LLM (structure.decompose etc are native and 502 w/o keys)
    def fake_is_native(cap): return False
    monkeypatch.setattr("routes.sliderule_full.is_python_native_capability", fake_is_native)
    monkeypatch.setattr("sliderule_llm.capabilities.is_python_native_capability", fake_is_native)
    def fake_mapped(cap, state, ins, role, turn):
        return {"title": "stub", "summary": "inv stub", "content": "stub for inventory", "provenance": "python-rag"}
    monkeypatch.setattr("routes.sliderule_full.execute_mapped_capability", fake_mapped)
    monkeypatch.setattr("services.capability_maps.execute_mapped_capability", fake_mapped)
    exec_payload = {"capabilityId": "structure.decompose", "state": {"sessionId": "inv-105", "goal": {"text": "inv"}, "artifacts": [], "capabilityRuns": []}, "inputArtifactIds": [], "roleId": "agent", "turnId": "inv-t"}
    r = client.post("/api/sliderule/execute-capability", json=exec_payload, headers={"X-Internal-Key": INTERNAL_KEY})
    assert r.status_code == 200
    data = r.json()
    assert data.get("backend") == "python"
    assert data.get("provenance") in ("python-rag", "python-llm", "python-fullpath")

    # coverage and drive-turn (Python owned)
    cov_payload = {"state": {"sessionId": "inv-105", "goal": {"text": "inv"}, "artifacts": [], "capabilityRuns": [], "coverageGaps": [], "coverageContract": None}}
    r = client.post("/api/sliderule/coverage", json=cov_payload, headers={"X-Internal-Key": INTERNAL_KEY})
    assert r.status_code == 200
    assert isinstance(r.json(), dict)

    # drive-turn
    drive_payload = {"state": {"sessionId": "inv-105", "goal": {"text": "inv"}, "artifacts": [], "capabilityRuns": []}, "turnId": "inv-t", "userText": ""}
    r = client.post("/api/sliderule/drive-turn", json=drive_payload, headers={"X-Internal-Key": INTERNAL_KEY})
    assert r.status_code == 200
    data = r.json()
    assert data.get("backend") == "python"


def test_python_owned_execute_and_orchestrate_for_node_retirement(monkeypatch):
    """Focused pytest for NodeRetirement task: directly proves Python owns orchestrate-plan + execute-capability behavior.
    Node default must be thin proxy only (no legacy Node execute paths); Python provides the impl and provenance.
    Acceptance: tests prove Python behavior directly.
    """
    from services.slide_rule_orchestrator import OrchestratePlanResult

    def fake_orchestrate(state, turn_id, user_text):
        return OrchestratePlanResult(
            selected=[{"capabilityId": "evidence.search", "roleId": "agent"}],
            rationale="retirement-slice plan",
            source="python-rag",
            converged=False,
        )

    monkeypatch.setattr("routes.sliderule_full.orchestrate_plan", fake_orchestrate)
    monkeypatch.setattr("services.slide_rule_orchestrator.orchestrate_plan", fake_orchestrate)

    r = client.post(
        "/api/sliderule/orchestrate-plan",
        json={"state": {"sessionId": "retire-1", "goal": {"text": "retire legacy Node exec"}, "artifacts": [], "capabilityRuns": []}, "turnId": "ret-t", "userText": "retire"},
        headers={"X-Internal-Key": INTERNAL_KEY},
    )
    assert r.status_code == 200, r.text
    data = r.json()
    # Python owned: explicit backend + provenance, selected from Python impl (not Node legacy)
    assert data.get("backend") == "python"
    assert data.get("provenance") in ("python-rag", "python-fullpath")
    assert isinstance(data.get("selected"), list) and len(data["selected"]) > 0

    # execute-capability: mapped path owned by Python (fake mapped returns python provenance)
    def fake_is_native(cap): return False
    monkeypatch.setattr("routes.sliderule_full.is_python_native_capability", fake_is_native)
    monkeypatch.setattr("sliderule_llm.capabilities.is_python_native_capability", fake_is_native)
    def fake_mapped(cap, state, ins, role, turn):
        return {"title": "retire-exec", "summary": "py", "content": "Python owns V5 exec post retirement", "provenance": "python-rag"}
    monkeypatch.setattr("routes.sliderule_full.execute_mapped_capability", fake_mapped)
    monkeypatch.setattr("services.capability_maps.execute_mapped_capability", fake_mapped)
    r2 = client.post(
        "/api/sliderule/execute-capability",
        json={"capabilityId": "evidence.search", "state": {"sessionId": "retire-1", "goal": {"text": "ret"}}, "inputArtifactIds": [], "roleId": "agent", "turnId": "ret-t"},
        headers={"X-Internal-Key": INTERNAL_KEY},
    )
    assert r2.status_code == 200, r2.text
    d2 = r2.json()
    assert d2.get("backend") == "python"
    assert d2.get("provenance") == "python-rag"
    assert "Python owns V5 exec" in d2.get("content", "")


def test_dev_python_api_mode_default_classification():
    """Focused pytest for dev-all-python-api-mode-105 task.
    Proves Python-owned behavior is the baseline for dev startup (Vite + Python API).
    Node is thin compat proxy only under default (SLIDERULE_V5_BACKEND=python).
    This test directly exercises the Python endpoints that Vite proxies to by default in dev.
    """
    # health proves Python is up as target for Vite dev proxy
    r = client.get("/health")
    assert r.status_code == 200
    data = r.json()
    assert data.get("backend") == "python" or "python" in str(data.get("backend", "")).lower()

    # orchestrate under python default (core to dev python api mode)
    plan_payload = {
        "state": {"sessionId": "dev-mode-105", "goal": {"text": "dev python api mode"}, "artifacts": [], "capabilityRuns": [], "graph": {"nodes": [], "edges": []}, "coverageGaps": [], "coverageContract": None},
        "turnId": "dev-t-105",
        "userText": "start"
    }
    r = client.post("/api/sliderule/orchestrate-plan", json=plan_payload, headers={"X-Internal-Key": INTERNAL_KEY})
    assert r.status_code == 200
    data = r.json()
    assert data.get("backend") == "python"
    assert data.get("provenance") in ("python-rag", "python-fullpath")
    # selected list from python impl
    assert "selected" in data

    # execute proves Python owns for dev path
    exec_p = {"capabilityId": "structure.decompose", "state": {"sessionId": "dev-mode-105", "goal": {"text": "dev"}, "artifacts": [], "capabilityRuns": []}, "inputArtifactIds": [], "roleId": "agent", "turnId": "dev-t-105"}
    # use monkey to keep deterministic
    def fake_is_native(_c): return False
    import routes.sliderule_full as rf
    import services.capability_maps as cm
    orig_native = rf.is_python_native_capability
    orig_m = cm.execute_mapped_capability
    try:
        rf.is_python_native_capability = fake_is_native
        cm.execute_mapped_capability = lambda c, st, ins, ro, tu: {"title": "dev-py", "summary": "py", "content": "Python dev api mode owns", "provenance": "python-rag"}
        r2 = client.post("/api/sliderule/execute-capability", json=exec_p, headers={"X-Internal-Key": INTERNAL_KEY})
        assert r2.status_code == 200
        d = r2.json()
        assert d.get("backend") == "python"
        assert d.get("provenance") == "python-rag"
    finally:
        rf.is_python_native_capability = orig_native
        cm.execute_mapped_capability = orig_m
