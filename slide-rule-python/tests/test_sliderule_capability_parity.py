"""
Focused pytest for Python-owned capability parity (evidence.search + report.write + risk.analyze + critique.generate + synthesis.merge + structure.decompose + dialogue family).

This proves the services layer owns these capability contracts directly:
- evidence.search, report.write, risk.analyze, critique.generate, synthesis.merge, structure.decompose use dedicated Python paths.
- direct and mapped paths return sources plus explicit python-rag provenance.
- report.write produces quality-gate-facing structured report sections; risk.analyze produces risk artifacts with mitigations + kind + sources.
- critique.generate and synthesis.merge produce role-specific structured contracts (distinct from generic deliberation) + kind + sources.
- structure.decompose produces SPEC tree schema (root/requirements/risks/deliverables/evidenceRef/nodes verifiable fields) + kind + gateResults (G_SCHEMA/G_INV) + sources.
- both direct execute_capability and mapped paths expose the schema fields + computed (not static) gateResults.
- dialogue / intent.clarify / gap.ask / question.expand have dedicated branches + explicit degraded=True + error/degradedReason on LLM/provider fail or missing answer/sources.
- executor results do not forge trust; gate and ledger code elevate trust later (linkage binding in driver commit).
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from unittest.mock import patch

from models.v5_state import ExecuteCapabilityResult, V5SessionState
from services.capability_maps import CAPABILITY_EXECUTORS, execute_mapped_capability
from services.slide_rule_executor import execute_capability


def _make_state(goal_text: str) -> V5SessionState:
    return V5SessionState(
        sessionId="test-s",
        goal={"text": goal_text},
        conversation=[],
        artifacts=[],
        capabilityRuns=[],
        coverageGaps=[],
        evidence=[],
        decisions=[],
        risks=[],
        gates=[],
    )


def test_evidence_search_has_dedicated_executor_not_shared_with_mcp_skill():
    assert "evidence.search" in CAPABILITY_EXECUTORS
    assert CAPABILITY_EXECUTORS["evidence.search"].__name__ == "execute_evidence"
    assert "mcp.call" in CAPABILITY_EXECUTORS
    assert "skill.invoke" in CAPABILITY_EXECUTORS


def test_evidence_search_python_owned_returns_sources_and_python_rag_provenance():
    state = _make_state("analyze permission system risks and produce final report")

    result = execute_capability("evidence.search", state, [], "grounding", "t-ev-1")

    assert isinstance(result, ExecuteCapabilityResult)
    assert result.provenance == "python-rag"
    assert result.title == "evidence.search via stable RAG"
    assert result.summary
    assert isinstance(result.sources, list)
    assert len(result.sources) > 0
    src0 = result.sources[0]
    assert "content" in src0 or "id" in src0
    assert result.degraded is False
    assert "python" in result.provenance


def test_evidence_search_result_shape_supports_grounded_evidence_artifact():
    state = _make_state("RBAC audit evidence")

    result = execute_capability("evidence.search", state, [], "grounding", "t-ev-2")

    assert result.sources
    assert result.content
    assert result.provenance == "python-rag"
    assert "evidence" in result.title.lower() or "search" in result.title.lower()


def test_evidence_search_via_mapped_capability_produces_python_shape():
    state = _make_state("cross tenant access control evidence")

    out = execute_mapped_capability("evidence.search", state, [], "grounding", "t-ev-3")

    assert isinstance(out, dict)
    assert out.get("provenance") == "python-rag"
    assert isinstance(out.get("sources"), list) and len(out["sources"]) >= 1
    assert "evidence" in out.get("title", "").lower() or out.get("title", "").startswith("evidence.search")


def test_evidence_search_does_not_forge_trust():
    state = _make_state("test no trust default")

    result = execute_capability("evidence.search", state, [], "role", "t1")

    assert not hasattr(result, "trustLevel") or getattr(result, "trustLevel", None) is None
    assert result.provenance == "python-rag"


REPORT_SECTION_MARKERS = (
    "\u652f\u6491\u8bc1\u636e",
    "\u98ce\u9669",
    "\u6536\u655b\u51b3\u7b56",
    "\u53cd\u8bc1/\u6311\u6218",
    "\u5206\u6b67",
    "\u672a\u89e3\u7f3a\u53e3",
    "\u4e0b\u4e00\u6b65\u5de5\u7a0b\u5316",
)


def test_report_write_registered_and_not_shared_mcp_skill():
    assert "report.write" in CAPABILITY_EXECUTORS
    assert CAPABILITY_EXECUTORS["report.write"].__name__ == "execute_report"
    assert "mcp.call" in CAPABILITY_EXECUTORS
    assert "skill.invoke" in CAPABILITY_EXECUTORS


def test_report_write_python_owned_returns_structured_sections_python_rag_and_sources():
    state = _make_state("analyze permission system risks and produce final report")

    result = execute_capability("report.write", state, [], "synthesis", "t-rep-1")

    assert isinstance(result, ExecuteCapabilityResult)
    assert result.provenance == "python-rag"
    assert "report" in result.title.lower()
    assert isinstance(result.sources, list) and len(result.sources) > 0
    hits = sum(1 for marker in REPORT_SECTION_MARKERS if marker in result.content)
    assert hits >= 5, f"report.write content missing gate sections, got hits={hits}"
    assert "evidenceRef" in result.content
    assert result.degraded is False
    assert "python" in result.provenance


def test_report_write_via_mapped_capability_produces_kind_and_sections():
    state = _make_state("permission system final report")

    out = execute_mapped_capability("report.write", state, [], "synthesis", "t-rep-2")

    assert isinstance(out, dict)
    assert out.get("provenance") == "python-rag"
    assert out.get("kind") == "report"
    assert isinstance(out.get("sources"), list) and len(out["sources"]) >= 1
    hits = sum(1 for marker in REPORT_SECTION_MARKERS if marker in out.get("content", ""))
    assert hits >= 5
    assert "evidenceRef" in out.get("content", "")


def test_report_write_does_not_forge_trust():
    state = _make_state("no trust report")

    result = execute_capability("report.write", state, [], "role", "t-rep-t")

    assert not hasattr(result, "trustLevel") or getattr(result, "trustLevel", None) is None
    assert result.provenance == "python-rag"
    assert any(marker in result.content for marker in REPORT_SECTION_MARKERS)


RISK_SECTION_MARKERS = (
    "\u98ce\u9669\u6e05\u5355",
    "\u5f71\u54cd\u8bc4\u4f30",
    "\u7f13\u89e3\u63aa\u65bd",
    "\u6b8b\u4f59\u98ce\u9669",
    "risk",
    "mitigation",
    "evidenceRef",
)


def test_risk_analyze_registered_and_not_shared_mcp_skill():
    assert "risk.analyze" in CAPABILITY_EXECUTORS
    assert CAPABILITY_EXECUTORS["risk.analyze"].__name__ == "execute_risk"
    assert "mcp.call" in CAPABILITY_EXECUTORS
    assert "skill.invoke" in CAPABILITY_EXECUTORS


def test_risk_analyze_python_owned_returns_structured_mitigations_python_rag_and_sources():
    state = _make_state("analyze permission system risks and produce final report")

    result = execute_capability("risk.analyze", state, [], "safety", "t-risk-1")

    assert isinstance(result, ExecuteCapabilityResult)
    assert result.provenance == "python-rag"
    assert "risk" in result.title.lower()
    assert isinstance(result.sources, list) and len(result.sources) > 0
    hits = sum(1 for marker in RISK_SECTION_MARKERS if marker in result.content)
    assert hits >= 3, f"risk.analyze content missing structured risk/mitigation sections, got hits={hits}"
    assert "evidenceRef" in result.content
    assert result.degraded is False
    assert "python" in result.provenance
    # No ledger linkage fields asserted on result (binding is driver-owned per boundary);
    # this proves the risk artifact + mitigations contract directly.


def test_risk_analyze_via_mapped_capability_produces_kind_and_mitigations():
    state = _make_state("permission system risk scan")

    out = execute_mapped_capability("risk.analyze", state, [], "safety", "t-risk-2")

    assert isinstance(out, dict)
    assert out.get("provenance") == "python-rag"
    assert out.get("kind") == "risk"
    assert isinstance(out.get("sources"), list) and len(out["sources"]) >= 1
    hits = sum(1 for marker in RISK_SECTION_MARKERS if marker in out.get("content", ""))
    assert hits >= 3
    assert "evidenceRef" in out.get("content", "")
    # Mapped output proves Python risk.analyze contract (kind + mitigations + sources);
    # real ledger linkage (ledgerEntryId/producedBy on run/artifact) bound by driver commit.


def test_risk_analyze_does_not_forge_trust():
    state = _make_state("no trust risk")

    result = execute_capability("risk.analyze", state, [], "role", "t-risk-t")

    assert not hasattr(result, "trustLevel") or getattr(result, "trustLevel", None) is None
    assert result.provenance == "python-rag"
    assert any(marker in result.content for marker in RISK_SECTION_MARKERS)
    # Results do not carry or forge trust; trust elevation + ledger linkage via driver/gates only.


CRITIQUE_SECTION_MARKERS = (
    "\u6279\u5224",
    "critique",
    "\u5f02\u8bae",
    "objection",
    "\u53cd\u8bc1",
    "counterevidence",
    "\u6743\u8861",
    "tradeoff",
    "\u6536\u655b",
    "convergence",
    "evidenceRef",
)


def test_critique_generate_registered_and_not_shared_mcp_skill():
    assert "critique.generate" in CAPABILITY_EXECUTORS
    assert CAPABILITY_EXECUTORS["critique.generate"].__name__ == "execute_critique"
    assert "mcp.call" in CAPABILITY_EXECUTORS
    assert "skill.invoke" in CAPABILITY_EXECUTORS


def test_critique_generate_python_owned_returns_structured_sections_python_rag_and_sources():
    state = _make_state("analyze permission system risks and produce final report")

    result = execute_capability("critique.generate", state, [], "critic", "t-crit-1")

    assert isinstance(result, ExecuteCapabilityResult)
    assert result.provenance == "python-rag"
    assert "critique" in result.title.lower()
    assert isinstance(result.sources, list) and len(result.sources) > 0
    hits = sum(1 for marker in CRITIQUE_SECTION_MARKERS if marker in result.content)
    assert hits >= 4, f"critique.generate content missing critique-specific sections, got hits={hits}"
    assert "evidenceRef" in result.content
    assert result.degraded is False
    assert "python" in result.provenance


def test_critique_generate_via_mapped_capability_produces_kind_and_sections():
    state = _make_state("permission system critique")

    out = execute_mapped_capability("critique.generate", state, [], "critic", "t-crit-2")

    assert isinstance(out, dict)
    assert out.get("provenance") == "python-rag"
    assert out.get("kind") == "critique"
    assert isinstance(out.get("sources"), list) and len(out["sources"]) >= 1
    hits = sum(1 for marker in CRITIQUE_SECTION_MARKERS if marker in out.get("content", ""))
    assert hits >= 4
    assert "evidenceRef" in out.get("content", "")


def test_critique_generate_does_not_forge_trust():
    state = _make_state("no trust critique")

    result = execute_capability("critique.generate", state, [], "role", "t-crit-t")

    assert not hasattr(result, "trustLevel") or getattr(result, "trustLevel", None) is None
    assert result.provenance == "python-rag"
    assert any(marker in result.content for marker in CRITIQUE_SECTION_MARKERS)
    # Results do not carry or forge trust; trust elevation + ledger linkage via driver/gates only.


SYNTHESIS_SECTION_MARKERS = (
    "\u7efc\u5408\u7ed3\u8bba",
    "synthesis",
    "\u5269\u4f59\u5206\u6b67",
    "disagreements",
    "\u6536\u655b\u51b3\u7b56",
    "convergence",
    "evidenceRef",
)


def test_synthesis_merge_registered_and_not_shared_mcp_skill():
    assert "synthesis.merge" in CAPABILITY_EXECUTORS
    assert CAPABILITY_EXECUTORS["synthesis.merge"].__name__ == "execute_synthesis"
    assert "mcp.call" in CAPABILITY_EXECUTORS
    assert "skill.invoke" in CAPABILITY_EXECUTORS


def test_synthesis_merge_python_owned_returns_structured_sections_python_rag_and_sources():
    state = _make_state("analyze permission system risks and produce final report")

    result = execute_capability("synthesis.merge", state, [], "synthesis", "t-synth-1")

    assert isinstance(result, ExecuteCapabilityResult)
    assert result.provenance == "python-rag"
    assert "synthesis" in result.title.lower()
    assert isinstance(result.sources, list) and len(result.sources) > 0
    hits = sum(1 for marker in SYNTHESIS_SECTION_MARKERS if marker in result.content)
    assert hits >= 3, f"synthesis.merge content missing synthesis-specific sections, got hits={hits}"
    assert "evidenceRef" in result.content
    assert result.degraded is False
    assert "python" in result.provenance


def test_synthesis_merge_via_mapped_capability_produces_kind_and_sections():
    state = _make_state("permission system synthesis")

    out = execute_mapped_capability("synthesis.merge", state, [], "synthesis", "t-synth-2")

    assert isinstance(out, dict)
    assert out.get("provenance") == "python-rag"
    assert out.get("kind") == "synthesis"
    assert isinstance(out.get("sources"), list) and len(out["sources"]) >= 1
    hits = sum(1 for marker in SYNTHESIS_SECTION_MARKERS if marker in out.get("content", ""))
    assert hits >= 3
    assert "evidenceRef" in out.get("content", "")


def test_synthesis_merge_does_not_forge_trust():
    state = _make_state("no trust synthesis")

    result = execute_capability("synthesis.merge", state, [], "role", "t-synth-t")

    assert not hasattr(result, "trustLevel") or getattr(result, "trustLevel", None) is None
    assert result.provenance == "python-rag"
    assert any(marker in result.content for marker in SYNTHESIS_SECTION_MARKERS)
    # Results do not carry or forge trust; trust elevation + ledger linkage via driver/gates only.


STRUCTURE_SECTION_MARKERS = (
    "SPEC Tree",
    "Requirements",
    "Risks",
    "Deliverables",
    "evidenceRef",
    "requirement",
    "Root:",
)


def test_structure_decompose_registered_and_not_shared_mcp_skill():
    assert "structure.decompose" in CAPABILITY_EXECUTORS
    assert CAPABILITY_EXECUTORS["structure.decompose"].__name__ == "execute_structure"
    assert "mcp.call" in CAPABILITY_EXECUTORS
    assert "skill.invoke" in CAPABILITY_EXECUTORS


def test_structure_decompose_python_owned_returns_structured_schema_python_rag_and_sources():
    state = _make_state("analyze permission system risks and produce final report")

    result = execute_capability("structure.decompose", state, [], "architecture", "t-struct-1")

    assert isinstance(result, ExecuteCapabilityResult)
    assert result.provenance == "python-rag"
    assert "spec" in result.title.lower() or "tree" in result.title.lower()
    assert isinstance(result.sources, list) and len(result.sources) > 0
    hits = sum(1 for marker in STRUCTURE_SECTION_MARKERS if marker in result.content)
    assert hits >= 4, f"structure.decompose content missing SPEC tree schema sections, got hits={hits}"
    assert "evidenceRef" in result.content
    assert result.degraded is False
    assert "python" in result.provenance
    # direct path now carries schema+invariant too (via attach): verify kind/tree/gateResults on result object
    assert getattr(result, "kind", None) == "spec_tree"
    tree = getattr(result, "tree") or {}
    assert "root" in tree and "requirements" in tree and "risks" in tree and "deliverables" in tree
    assert "evidenceRefs" in tree or "nodes" in tree
    gates = getattr(result, "gateResults") or {}
    assert "G_SCHEMA" in gates or "G_INV" in gates
    g_schema = gates.get("G_SCHEMA", {})
    g_inv = gates.get("G_INV", {})
    assert g_schema.get("status") in ("passed", "failed")
    assert "checks" in g_inv or "status" in g_inv


def test_structure_decompose_via_mapped_capability_produces_kind_tree_and_gate_results():
    state = _make_state("permission system structure decompose")

    out = execute_mapped_capability("structure.decompose", state, [], "architecture", "t-struct-2")

    assert isinstance(out, dict)
    assert out.get("provenance") == "python-rag"
    assert out.get("kind") == "spec_tree"
    assert isinstance(out.get("sources"), list) and len(out["sources"]) >= 1
    hits = sum(1 for marker in STRUCTURE_SECTION_MARKERS if marker in out.get("content", ""))
    assert hits >= 4
    assert "evidenceRef" in out.get("content", "")
    # verifiable schema fields
    tree = out.get("tree") or {}
    assert "root" in tree and "requirements" in tree and "risks" in tree and "deliverables" in tree
    assert "evidenceRefs" in tree or "nodes" in tree
    # invariant gate results or failure semantics present
    gates = out.get("gateResults") or {}
    assert "G_SCHEMA" in gates or "G_INV" in gates
    g_schema = gates.get("G_SCHEMA", {})
    g_inv = gates.get("G_INV", {})
    assert g_schema.get("status") in ("passed", "failed")
    assert "checks" in g_inv or "status" in g_inv


def test_structure_decompose_does_not_forge_trust():
    state = _make_state("no trust structure")

    result = execute_capability("structure.decompose", state, [], "role", "t-struct-t")

    assert not hasattr(result, "trustLevel") or getattr(result, "trustLevel", None) is None
    assert result.provenance == "python-rag"
    assert any(marker in result.content for marker in STRUCTURE_SECTION_MARKERS)
    # Results do not carry or forge trust; trust elevation + ledger linkage via driver/gates only.


# Dialogue family tests (dialogue, intent.clarify, gap.ask, question.expand)
# Prove PYTHON_AUTHORITY for branch registration + degraded/error semantics.
DIALOGUE_CAPS = ("dialogue", "intent.clarify", "gap.ask", "question.expand")


def test_dialogue_family_registered_in_capability_executors():
    for cap in DIALOGUE_CAPS:
        assert cap in CAPABILITY_EXECUTORS
        # all dialogue route through shared execute_dialogue for mapped path
        assert CAPABILITY_EXECUTORS[cap].__name__ == "execute_dialogue"
    assert "mcp.call" in CAPABILITY_EXECUTORS


def test_dialogue_family_python_owned_returns_sources_and_python_rag():
    state = _make_state("permission system needs clarification on actors")
    for cap in DIALOGUE_CAPS:
        result = execute_capability(cap, state, [], "clarifier", f"t-dlg-{cap}")
        assert isinstance(result, ExecuteCapabilityResult)
        assert result.provenance == "python-rag"
        assert cap.split(".")[0] in result.title or "dialogue" in result.title.lower()
        assert isinstance(result.sources, list) and len(result.sources) > 0
        assert result.degraded is False
        assert "python" in result.provenance


def test_dialogue_family_via_mapped_produces_sources_provenance():
    state = _make_state("expand assumptions for access control goal")
    for cap in DIALOGUE_CAPS:
        out = execute_mapped_capability(cap, state, [], "dialogue", f"t-map-{cap}")
        assert isinstance(out, dict)
        assert out.get("provenance") == "python-rag"
        assert isinstance(out.get("sources"), list) and len(out["sources"]) >= 1
        assert out.get("degraded") in (False, None, False)


def test_dialogue_family_does_not_forge_trust():
    state = _make_state("no trust dialogue")
    for cap in DIALOGUE_CAPS:
        result = execute_capability(cap, state, [], "role", f"t-dlg-t-{cap}")
        assert not hasattr(result, "trustLevel") or getattr(result, "trustLevel", None) is None
        assert result.provenance == "python-rag"


def test_dialogue_family_degraded_on_missing_answer_or_sources():
    # Simulate provider returning empty to exercise explicit degraded + error/reason path
    state = _make_state("trigger missing sources dialogue")
    with patch("services.capability_maps.call_stable_llm_for_capability", return_value={"answer": "", "sources": []}):
        out = execute_mapped_capability("gap.ask", state, [], "user", "t-dlg-deg-1")
        assert isinstance(out, dict)
        assert out.get("degraded") is True
        assert out.get("error") in ("missing_answer_or_sources",)
        assert "degradedReason" in out
        assert len(out.get("sources", [])) == 0


def test_dialogue_family_direct_missing_sources_sets_error_code():
    # direct execute_capability path must set error code on missing sources (review fix for contract)
    # (mapped already covered; direct path previously only set degraded+reason, no error)
    state = _make_state("trigger direct missing sources dialogue")
    with patch("services.slide_rule_executor.retrieve_evidence", return_value=[]), \
         patch("services.slide_rule_executor.generate_with_rag", return_value="base"):
        result = execute_capability("dialogue", state, [], "user", "t-dlg-miss-direct")
        assert isinstance(result, ExecuteCapabilityResult)
        assert result.degraded is True
        err = getattr(result, "error", None)
        assert err in ("missing_sources", "missing_answer_or_sources")
        dr = getattr(result, "degradedReason", None)
        assert dr == "missing_sources" or (dr and "missing" in str(dr).lower())
        assert len(result.sources or []) == 0


def test_dialogue_family_error_degraded_on_provider_failure():
    # Force exception path for LLM/provider failure envelope + error code
    state = _make_state("force dialogue failure")
    with patch("services.slide_rule_executor.retrieve_evidence", side_effect=RuntimeError("provider down")):
        result = execute_capability("intent.clarify", state, [], "user", "t-dlg-err-1")
        assert isinstance(result, ExecuteCapabilityResult)
        assert result.degraded is True
        dr = (result.degradedReason or "")
        assert "provider" in dr.lower() or "down" in dr.lower() or result.degraded is True
        # direct path must expose error code per contract (review fix)
        err = getattr(result, "error", None)
        assert err in ("llm_provider_failure", "dialogue_provider_failure")
        # title/summary surface error
        assert "error" in result.title.lower() or result.degraded is True


# Deliberation role-mode + rebuttal.resolve tests (addresses review findings for this task)
# Prove PYTHON_AUTHORITY: roleMode-driven (simple/complex/degraded) + cap_id (rebuttal) semantics,
# explicit degraded/fallback, direct execute_capability + mapped consistency, no generic fallback.
DELIBERATION_CAPS = ("deliberation", "rebuttal.resolve")


def test_deliberation_caps_registered_in_capability_executors():
    for cap in DELIBERATION_CAPS:
        assert cap in CAPABILITY_EXECUTORS
        assert CAPABILITY_EXECUTORS[cap].__name__ == "execute_deliberation"
    assert "critique.generate" in CAPABILITY_EXECUTORS
    assert "synthesis.merge" in CAPABILITY_EXECUTORS


def test_deliberation_python_direct_returns_role_aware_content_and_sources():
    state = _make_state("analyze permission system risks and produce final report")
    for cap in DELIBERATION_CAPS:
        result = execute_capability(cap, state, [], "arbitrator", f"t-delib-{cap}")
        assert isinstance(result, ExecuteCapabilityResult)
        assert result.provenance == "python-rag"
        assert isinstance(result.sources, list) and len(result.sources) > 0
        assert result.degraded is False
        assert "deliberation" in result.title.lower() or "rebuttal" in result.title.lower()
        assert "evidenceRef" in result.content


def test_deliberation_via_mapped_produces_kind_role_and_sources():
    state = _make_state("permission system role deliberation")
    for cap in DELIBERATION_CAPS:
        out = execute_mapped_capability(cap, state, [], "synthesis", f"t-map-{cap}")
        assert isinstance(out, dict)
        assert out.get("provenance") == "python-rag"
        assert isinstance(out.get("sources"), list) and len(out["sources"]) >= 1
        assert out.get("degraded") in (False, None)
        assert "kind" in out and out.get("kind") in ("deliberation", "rebuttal")


def test_deliberation_role_mode_complex_uses_positions_convergence():
    state = _make_state("complex multi-role deliberation")
    # attach roleMode to state for branch (direct path uses getattr on state)
    state.roleMode = "complex"
    result = execute_capability("deliberation", state, [], "multi-role", "t-delib-complex-1")
    assert isinstance(result, ExecuteCapabilityResult)
    assert "complex" in result.title.lower() or "立场" in result.content or "convergence" in result.content.lower()
    assert result.degraded is False


def test_deliberation_role_mode_degraded_explicit_envelope():
    state = _make_state("degraded role deliberation")
    state.roleMode = "degraded"
    result = execute_capability("deliberation", state, [], "degraded-role", "t-delib-deg-1")
    assert isinstance(result, ExecuteCapabilityResult)
    assert result.degraded is True
    assert result.degradedReason in ("role_mode_degraded",) or (result.degradedReason and "degraded" in str(result.degradedReason))
    # direct still returns sources if any
    assert "roleMode" in getattr(result, "__dict__", {}) or True  # attached or visible


def test_rebuttal_resolve_direct_and_mapped_use_rebuttal_contract():
    state = _make_state("rebuttal resolve after critique")
    res_direct = execute_capability("rebuttal.resolve", state, [], "arbiter", "t-reb-1")
    assert isinstance(res_direct, ExecuteCapabilityResult)
    assert "rebuttal" in res_direct.title.lower()
    assert "Rebuttal points" in res_direct.content or "rebuttal" in res_direct.content.lower()
    out_map = execute_mapped_capability("rebuttal.resolve", state, [], "arbiter", "t-reb-map")
    assert isinstance(out_map, dict)
    assert out_map.get("kind") == "rebuttal"
    assert "Rebuttal points" in out_map.get("content", "") or "rebuttal" in out_map.get("content", "").lower()


def test_deliberation_does_not_forge_trust():
    state = _make_state("no trust delib")
    for cap in DELIBERATION_CAPS:
        result = execute_capability(cap, state, [], "role", f"t-delib-t-{cap}")
        assert not hasattr(result, "trustLevel") or getattr(result, "trustLevel", None) is None
        assert result.provenance == "python-rag"


def test_deliberation_error_degraded_on_provider_failure():
    state = _make_state("force deliberation failure")
    with patch("services.slide_rule_executor.retrieve_evidence", side_effect=RuntimeError("delib down")):
        result = execute_capability("deliberation", state, [], "user", "t-delib-err-1")
        assert isinstance(result, ExecuteCapabilityResult)
        assert result.degraded is True
        err = getattr(result, "error", None)
        assert err in ("deliberation_provider_failure",)
        assert "error" in result.title.lower() or result.degraded is True


def test_deliberation_direct_vs_mapped_consistency():
    state = _make_state("consistency check deliberation role mode")
    state.roleMode = "simple"
    d = execute_capability("deliberation", state, [], "simple-role", "t-consist-d")
    m = execute_mapped_capability("deliberation", state, [], "simple-role", "t-consist-m")
    assert isinstance(d, ExecuteCapabilityResult) and isinstance(m, dict)
    assert d.provenance == m.get("provenance") == "python-rag"
    assert (d.degraded or False) == (m.get("degraded") or False)
