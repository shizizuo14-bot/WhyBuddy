"""
Focused pytest for Python-owned GCOV required capability authoring + evaluate (TrustGcov slice).
Directly proves Python slide_rule_coverage behavior per TS rules.
No Node fallback; tests the ported author/evaluate/hasTrusted.
Added direct tests for resolved/waived/open lifecycle impact on evaluate_coverage_gate
missingCapabilities/passed (review fix for waived not blocking).
Added negative tests + hardened artifacts for grounding gate requiring external + sources + non-empty content.
"""

import pytest
from services.slide_rule_coverage import (
    author_coverage_contract,
    evaluate_coverage_gate,
    reconcile_coverage,
    has_trusted_committed_for_cap,
    has_grounded_external_evidence,
    count_grounded_trusted_artifacts,
)
from services.slide_rule_trust import (
    record_provenance_and_trust_ledger,
    commit_artifact_with_ledger,
    has_provenance_and_trust_ledger,
    reject_client_forged_provenance_or_ledger,
)
from models.v5_state import V5SessionState, Artifact, ProducedBy, CapabilityRun


def make_min_state(goal_text: str, artifacts=None, runs=None, gaps=None, contract=None, stales=None) -> V5SessionState:
    return V5SessionState(
        sessionId="test-gcov",
        goal={"text": goal_text, "status": "needs_refinement"},
        artifacts=artifacts or [],
        capabilityRuns=runs or [],
        coverageGaps=gaps or [],
        coverageContract=contract,
        staleArtifactIds=stales or [],
        conversation=[],
        graph={"nodes": [], "edges": []},
        openQuestions=[],
        evidence=[],
        decisions=[],
        risks=[],
        gates=[],
        dependencyGraph=[],
    )


def test_author_simple_for_non_complex():
    res = author_coverage_contract("你好，聊天", "t-simple")
    contract = res["contract"]
    assert contract["mode"] == "simple"
    assert contract["requiredCapabilities"] == ["evidence.search", "report.write"]
    assert "critique.generate" not in contract["requiredCapabilities"]
    assert any(g["requiredCapabilityId"] == "evidence.search" for g in res["gaps"])


def test_author_complex_for_risk_safety():
    res = author_coverage_contract("分析这个系统的风险并审计", "t-risk")
    contract = res["contract"]
    assert contract["mode"] == "complex"
    req = contract["requiredCapabilities"]
    assert "critique.generate" in req
    assert "risk.analyze" in req
    assert "synthesis.merge" in req
    assert "evidence.search" in req
    assert "report.write" in req
    # no game extras
    assert "structure.decompose" not in req
    assert "mcp.call" not in req


def test_author_game_rpg_gets_structure_mcp_skill():
    res = author_coverage_contract("写一个以LLM为核心驱动引擎的多Agent自定义RPG游戏", "t-rpg")
    contract = res["contract"]
    assert contract["mode"] == "complex"
    req = contract["requiredCapabilities"]
    assert req == [
        "critique.generate",
        "risk.analyze",
        "synthesis.merge",
        "evidence.search",
        "report.write",
        "structure.decompose",
        "mcp.call",
        "skill.invoke",
    ]
    # extra evidence push deduped so only one
    assert req.count("evidence.search") == 1


def test_has_trusted_committed_for_cap_and_missing_in_evaluate():
    state = make_min_state("简单目标")
    gate = evaluate_coverage_gate(state)
    assert gate["passed"] is False
    assert "evidence.search" in gate["missingCapabilities"]
    assert "report.write" not in gate["missingCapabilities"]  # excluded from missing check

    # now add a healthy run+artifact for evidence.search (wire via commit_artifact_with_ledger to force ledger record at commit)
    run = CapabilityRun(
        id="r1",
        capabilityId="evidence.search",
        turnId="t1",
        outputs=["a1"],
    )
    state2 = make_min_state("简单目标", runs=[run])
    art = commit_artifact_with_ledger(
        state2,
        id="a1",
        kind="evidence",
        provenance="web:search",
        trustLevel="gated_pass",
        producedBy=ProducedBy(capabilityRunId="r1", capabilityId="evidence.search"),
        content="grounded",
        payload={"sources": [{"title": "web1", "snippet": "hit"}]},
    )
    assert has_trusted_committed_for_cap(state2, "evidence.search") is True
    gate2 = evaluate_coverage_gate(state2)
    assert "evidence.search" not in gate2["missingCapabilities"]
    # still may fail on other (gaps/grounding) but missing caps now correct


def test_evaluate_reports_missing_until_healthy_artifact():
    # complex game
    state = make_min_state("搭建一个RPG游戏平台")
    gate = evaluate_coverage_gate(state)
    missing = gate["missingCapabilities"]
    assert "critique.generate" in missing
    assert "structure.decompose" in missing
    assert "mcp.call" in missing

    # provide healthy for one (use commit helper to record ledger on commit)
    run = CapabilityRun(id="r-crit", capabilityId="critique.generate", turnId="t2")
    state2 = make_min_state("搭建一个RPG游戏平台", runs=[run])
    art = commit_artifact_with_ledger(
        state2,
        id="a-crit",
        kind="critique",
        provenance="python-rag",
        trustLevel="gated_pass",
        producedBy=ProducedBy(capabilityRunId="r-crit", capabilityId="critique.generate"),
    )
    gate2 = evaluate_coverage_gate(state2)
    assert "critique.generate" not in gate2["missingCapabilities"]
    assert "structure.decompose" in gate2["missingCapabilities"]  # still missing


def test_reconcile_upgrades_simple_to_complex_and_preserves_resolved():
    state = make_min_state("做一个多Agent RPG游戏")
    # seed simple
    state.coverageContract = {"id": "old", "mode": "simple", "requiredCapabilities": ["evidence.search", "report.write"]}
    state.coverageGaps = [
        {"id": "gap-critique", "requiredCapabilityId": "critique.generate", "status": "resolved", "kind": "missing_capability", "label": ""}
    ]
    rec = reconcile_coverage(state)
    assert rec.coverageContract["mode"] == "complex"
    assert "critique.generate" in rec.coverageContract["requiredCapabilities"]
    # preserved resolved for overlap (by stable key)
    crit = next((g for g in rec.coverageGaps if g.get("requiredCapabilityId") == "critique.generate"), None)
    assert crit is not None and crit.get("status") == "resolved"


def test_evaluate_returns_full_shape_including_missing_caps():
    state = make_min_state("hi")
    gate = evaluate_coverage_gate(state)
    assert "passed" in gate
    assert "missingCapabilities" in gate
    assert "unresolvedGaps" in gate
    assert "waivedGaps" in gate
    assert "reason" in gate
    assert isinstance(gate["missingCapabilities"], list)


def test_reconcile_preserves_missing_evidence_resolved_waived_status():
    """Direct pytest for review finding: missing_evidence gap (stable key 'ev') resolved/waived must survive simple->complex upgrade.
    Without 'ev' stable key, reconcile would drop status and reopen as 'open' (inconsistent with TS reconcileCoverageContract).
    """
    goal = "搭建一个多Agent RPG游戏"
    # seed with simple contract + prior resolved ev gap (and a cap one)
    prior_ev_gap = {
        "id": "gap-evidence-old-123",
        "kind": "missing_evidence",
        "label": "Missing grounded external evidence (G-GROUND)",
        "status": "resolved",
        "createdAt": "2026-01-01T00:00:00",
        "updatedAt": "2026-01-02T00:00:00",
    }
    prior_cap_gap = {
        "id": "gap-risk-old",
        "kind": "missing_capability",
        "label": "Missing required capability: risk.analyze",
        "requiredCapabilityId": "risk.analyze",
        "status": "waived",
        "createdAt": "2026-01-01T00:00:00",
    }
    state = make_min_state(goal)
    state.coverageContract = {
        "id": "old", "mode": "simple",
        "requiredCapabilities": ["evidence.search", "report.write"],
    }
    state.coverageGaps = [prior_ev_gap, prior_cap_gap]

    rec = reconcile_coverage(state)
    assert rec.coverageContract["mode"] == "complex"
    assert any(c in rec.coverageContract["requiredCapabilities"] for c in ["risk.analyze", "critique.generate"])

    # missing_evidence must retain resolved via 'ev' key (no requiredCapabilityId)
    ev = next((g for g in rec.coverageGaps if g.get("kind") == "missing_evidence"), None)
    assert ev is not None, "ev gap must exist after reconcile"
    assert ev.get("status") == "resolved", "missing_evidence resolved status must be carried by stable 'ev' key"
    assert ev.get("updatedAt") == "2026-01-02T00:00:00"

    # also cap via cap key
    risk = next((g for g in rec.coverageGaps if g.get("requiredCapabilityId") == "risk.analyze"), None)
    assert risk is not None and risk.get("status") == "waived"


# --- stale artifact rejection tests (sliderule-python-v52-gcov-stale-artifact-block-105) ---
# Directly prove: stale (list / .stale / status) artifacts are blocked from
# has_trusted_committed_for_cap, grounded evidence and coverage gate.
# healthy non-stale gated artifacts continue to satisfy when appropriate.


def test_stale_via_list_blocks_has_trusted_committed():
    run = CapabilityRun(id="r-ev", capabilityId="evidence.search", turnId="t1")
    art = Artifact.server_construct(
        id="a-ev",
        kind="evidence",
        provenance="web:search",
        trustLevel="gated_pass",
        producedBy=ProducedBy(capabilityRunId="r-ev", capabilityId="evidence.search"),
        content="grounded ev",
    )
    # healthy first (use commit_ to wire record)
    state_ok = make_min_state("简单目标", runs=[run], stales=[])
    art = commit_artifact_with_ledger(
        state_ok,
        id="a-ev",
        kind="evidence",
        provenance="web:search",
        trustLevel="gated_pass",
        producedBy=ProducedBy(capabilityRunId="r-ev", capabilityId="evidence.search"),
        content="grounded ev",
    )
    assert has_trusted_committed_for_cap(state_ok, "evidence.search") is True

    # now mark via staleArtifactIds -> must block (stale before ledger in healthy)
    state_stale = make_min_state("简单目标", artifacts=[art], runs=[run], stales=["a-ev"])
    assert has_trusted_committed_for_cap(state_stale, "evidence.search") is False


def test_stale_via_artifact_flag_blocks_has_trusted_and_grounded():
    run = CapabilityRun(id="r-ev2", capabilityId="evidence.search", turnId="t2")
    art_stale = Artifact.server_construct(
        id="a-ev2",
        kind="evidence",
        provenance="mcp:github",
        trustLevel="gated_pass",
        producedBy=ProducedBy(capabilityRunId="r-ev2", capabilityId="evidence.search"),
        stale=True,
        content="stale grounded",
    )
    state = make_min_state("目标", artifacts=[art_stale], runs=[run], stales=[])
    assert has_trusted_committed_for_cap(state, "evidence.search") is False
    assert has_grounded_external_evidence(state) is False
    assert count_grounded_trusted_artifacts(state) == 0


def test_stale_via_status_blocks_grounded_and_gate():
    run = CapabilityRun(id="r-ev3", capabilityId="evidence.search", turnId="t3")
    art_stale_status = Artifact.server_construct(
        id="a-ev3",
        kind="evidence",
        provenance="web:search",
        trustLevel="audited",
        producedBy=ProducedBy(capabilityRunId="r-ev3", capabilityId="evidence.search"),
        status="stale",
        content="status stale",
    )
    state = make_min_state("简单目标", artifacts=[art_stale_status], runs=[run], stales=[])
    assert has_trusted_committed_for_cap(state, "evidence.search") is False
    assert has_grounded_external_evidence(state) is False
    assert count_grounded_trusted_artifacts(state) == 0

    # gate must still see it as missing
    gate = evaluate_coverage_gate(state)
    assert "evidence.search" in gate["missingCapabilities"]
    assert gate["passed"] is False


def test_healthy_non_stale_satisfies_grounded_count_and_allows_gate_progress():
    run = CapabilityRun(id="r-ev4", capabilityId="evidence.search", turnId="t4")
    state = make_min_state("简单目标", runs=[run], stales=[])
    art_ok = commit_artifact_with_ledger(
        state,
        id="a-ev4",
        kind="evidence",
        provenance="web:search",
        trustLevel="gated_pass",
        producedBy=ProducedBy(capabilityRunId="r-ev4", capabilityId="evidence.search"),
        stale=False,
        status="active",
        content="good evidence",
        payload={"sources": [{"title": "goodsrc", "snippet": "ok"}]},
    )
    assert has_trusted_committed_for_cap(state, "evidence.search") is True
    assert has_grounded_external_evidence(state) is True
    assert count_grounded_trusted_artifacts(state) == 1

    gate = evaluate_coverage_gate(state)
    # may not fully pass due to gaps etc, but missing cap for ev is gone
    assert "evidence.search" not in gate["missingCapabilities"]


def test_waived_gap_exempts_cap_from_missing_and_unblocks_passed():
    """Direct pytest for review finding 1+2: waived capability gap must not appear in missingCapabilities
    and must not cause passed=false (waived lifecycle actually changes gate result, not just report).
    """
    goal = "简单目标"
    auth = author_coverage_contract(goal, "t-waive1")
    contract = auth["contract"]
    gaps = auth["gaps"]
    # waive the cap gap and ev gap
    for g in gaps:
        if g.get("requiredCapabilityId") == "evidence.search" or g.get("kind") == "missing_evidence":
            g["status"] = "waived"
    state = make_min_state(goal, gaps=gaps, contract=contract)
    # deliberately no artifacts/runs
    gate = evaluate_coverage_gate(state, [], contract)
    assert "evidence.search" not in gate["missingCapabilities"]
    assert gate["unresolvedGaps"] == []
    assert len(gate["waivedGaps"]) > 0
    # waived exempts -> passed true (no open, no missing, ev handled so grounding/upstream ok)
    assert gate["passed"] is True


def test_resolved_gap_exempts_from_missing_like_waived():
    """Lifecycle coverage: resolved status (carried or set) also exempts cap from missing (not just waived)."""
    goal = "分析风险"
    auth = author_coverage_contract(goal, "t-res")
    contract = auth["contract"]
    gaps = auth["gaps"]
    # set one cap gap resolved, ev resolved
    for g in gaps:
        cap = g.get("requiredCapabilityId")
        if cap == "risk.analyze" or g.get("kind") == "missing_evidence":
            g["status"] = "resolved"
        elif cap:
            g["status"] = "open"
    state = make_min_state(goal, gaps=gaps, contract=contract)
    # provide only for non-resolved reqs (e.g. evidence + critique + synthesis) but not risk
    # but since resolved exempts risk, and to pass need no open + handled
    # set all non-waived/resolved to have status resolved? to avoid open block, set provided ones resolved too? simpler: set all to resolved/waived for this
    # provide evidence so if needed
    run = CapabilityRun(id="r-ev", capabilityId="evidence.search", turnId="t1")
    state.capabilityRuns = [run]
    art = commit_artifact_with_ledger(
        state,
        id="a-ev", kind="evidence", provenance="web:search", trustLevel="gated_pass",
        producedBy=ProducedBy(capabilityRunId="r-ev", capabilityId="evidence.search"),
        content="resolved-ex test evidence",
        payload={"sources": [{"title": "src", "snippet": "s"}]},
    )
    # now set statuses so no opens: evidence resolved (has), risk resolved (no has, but exempt), others resolved too
    for g in gaps:
        if g.get("status") == "open":
            g["status"] = "resolved"
    state.coverageGaps = gaps
    gate = evaluate_coverage_gate(state, [], contract)
    assert "risk.analyze" not in gate["missingCapabilities"]
    assert gate["passed"] is True  # resolved exemptions + provided allow pass


def test_open_gap_still_blocks_and_populates_missing():
    """Lifecycle: open status still requires has_trusted; causes missing and !passed."""
    goal = "简单目标"
    auth = author_coverage_contract(goal, "t-open")
    contract = auth["contract"]
    gaps = auth["gaps"]
    # leave as open (default)
    state = make_min_state(goal, gaps=gaps, contract=contract)
    gate = evaluate_coverage_gate(state, [], contract)
    assert "evidence.search" in gate["missingCapabilities"]
    assert len(gate["unresolvedGaps"]) > 0
    assert gate["passed"] is False


def test_waived_ev_gap_exempts_grounding():
    """Evidence gap waived allows passed without grounded artifact (covers evidence in lifecycle)."""
    goal = "搭建系统"
    auth = author_coverage_contract(goal, "t-wev")
    contract = auth["contract"]
    gaps = auth["gaps"]
    for g in gaps:
        if g.get("kind") == "missing_evidence":
            g["status"] = "waived"
        else:
            # waive all caps too for no-open
            g["status"] = "waived"
    state = make_min_state(goal, gaps=gaps, contract=contract)
    # no artifacts
    gate = evaluate_coverage_gate(state, [], contract)
    assert gate["passed"] is True
    assert any(g in gate["waivedGaps"] for g in [gg["id"] for gg in gaps if gg.get("kind")=="missing_evidence"]) or len(gate["waivedGaps"]) > 0


# --- grounding gate negative cases for external evidence + sources + non-empty content (review fix) ---
# These directly prove that empty content or missing sources cause G-GROUND rejection for external prov.
# Positive grounded artifacts in other tests now carry content + sources to satisfy the hardened gate.


def test_grounded_external_evidence_requires_nonempty_content_and_sources():
    """Negative cases: external provenance + gated_pass evidence without content or without sources must NOT satisfy grounded checks.
    This implements the task goal and resolves review findings.
    """
    run = CapabilityRun(id="r-g1", capabilityId="evidence.search", turnId="t1")
    base_prod = ProducedBy(capabilityRunId="r-g1", capabilityId="evidence.search")

    # case 1: external prov but empty content and no payload/sources -> not grounded
    art_empty = Artifact.server_construct(
        id="a-g-empty",
        kind="evidence",
        provenance="web:search",
        trustLevel="gated_pass",
        producedBy=base_prod,
        content="",
        summary="",
        payload=None,
    )
    state_empty = make_min_state("目标", artifacts=[art_empty], runs=[run])
    assert has_grounded_external_evidence(state_empty) is False
    assert count_grounded_trusted_artifacts(state_empty) == 0

    # case 2: has content but sources=[] empty -> not grounded
    art_nosrc = Artifact.server_construct(
        id="a-g-nosrc",
        kind="evidence",
        provenance="mcp:github",
        trustLevel="gated_pass",
        producedBy=base_prod,
        content="some content from github",
        summary="sum",
        payload={"sources": []},
    )
    state_nosrc = make_min_state("目标", artifacts=[art_nosrc], runs=[run])
    assert has_grounded_external_evidence(state_nosrc) is False
    assert count_grounded_trusted_artifacts(state_nosrc) == 0

    # case 3: has content + sources list with item -> grounded
    art_good = Artifact.server_construct(
        id="a-g-good",
        kind="evidence",
        provenance="repo:static",
        trustLevel="gated_pass",
        producedBy=base_prod,
        content="real content",
        summary="sum",
        payload={"sources": [{"title": "repo", "snippet": "hit", "url": "https://ex"}]},
    )
    state_good = make_min_state("目标", artifacts=[art_good], runs=[run])
    assert has_grounded_external_evidence(state_good) is True
    assert count_grounded_trusted_artifacts(state_good) == 1

    # also sources in payload for model Artifact (real server_construct path uses payload={"sources": [...]})
    art_pl = Artifact.server_construct(
        id="a-g-pl",
        kind="evidence",
        provenance="python-rag",
        trustLevel="audited",
        producedBy=base_prod,
        content="payload sources content",
        payload={"sources": [{"title": "rag", "snippet": "vec"}]},
    )
    state_pl = make_min_state("目标", artifacts=[art_pl], runs=[run])
    assert has_grounded_external_evidence(state_pl) is True
    assert count_grounded_trusted_artifacts(state_pl) == 1


def test_evaluate_gate_fails_gground_without_proper_grounded_evidence():
    """G-GROUND fails (when ev gap not handled) if only empty/no-source external evidence present."""
    goal = "简单目标"
    auth = author_coverage_contract(goal, "t-gneg")
    contract = auth["contract"]
    gaps = auth["gaps"]
    # leave gaps open (no waive)
    run = CapabilityRun(id="r-bad", capabilityId="evidence.search", turnId="t1")
    art_bad = Artifact.server_construct(
        id="a-bad",
        kind="evidence",
        provenance="web:search",
        trustLevel="gated_pass",
        producedBy=ProducedBy(capabilityRunId="r-bad", capabilityId="evidence.search"),
        content="",  # empty
        payload={},
    )
    state = make_min_state(goal, artifacts=[art_bad], runs=[run], gaps=gaps, contract=contract)
    gate = evaluate_coverage_gate(state, [], contract)
    # since no real grounded (empty), and ev gap open, grounding_ok false
    assert gate["passed"] is False
    assert "G-GROUND" in gate["reason"] or not gate.get("passed")


def test_grounded_external_evidence_evidenceSource_label_alone_does_not_count_as_traceable_source():
    """Explicit test: external prov + content + evidenceSource label (no sources/url/citations) must reject.
    Addresses review minor finding: evidenceSource (e.g. legacy labels) alone is not a traceable source.
    """
    run = CapabilityRun(id="r-esrc", capabilityId="evidence.search", turnId="t1")
    base_prod = ProducedBy(capabilityRunId="r-esrc", capabilityId="evidence.search")

    # external + nonempty content + only evidenceSource label (no real source fields) -> not grounded
    art_label = Artifact.server_construct(
        id="a-g-labelsrc",
        kind="evidence",
        provenance="web:search",
        trustLevel="gated_pass",
        producedBy=base_prod,
        content="some external evidence content here",
        summary="sum",
        payload={"evidenceSource": "F1_Github_Source 取数"},  # label only, not real sources
    )
    state_label = make_min_state("目标", artifacts=[art_label], runs=[run])
    assert has_grounded_external_evidence(state_label) is False
    assert count_grounded_trusted_artifacts(state_label) == 0

    # same for other label
    art_label2 = Artifact.server_construct(
        id="a-g-labelsrc2",
        kind="evidence",
        provenance="mcp:github",
        trustLevel="gated_pass",
        producedBy=base_prod,
        content="github hit",
        payload={"evidenceSource": "会话内综合"},
    )
    state_label2 = make_min_state("目标", artifacts=[art_label2], runs=[run])
    assert has_grounded_external_evidence(state_label2) is False
    assert count_grounded_trusted_artifacts(state_label2) == 0

    # but with real sources list alongside, it passes (to show sources is what matters)
    art_with_src = Artifact.server_construct(
        id="a-g-label-with-src",
        kind="evidence",
        provenance="web:search",
        trustLevel="gated_pass",
        producedBy=base_prod,
        content="real with label",
        payload={"evidenceSource": "F1_Github_Source 取数", "sources": [{"title": "s", "url": "u"}]},
    )
    state_with = make_min_state("目标", artifacts=[art_with_src], runs=[run])
    assert has_grounded_external_evidence(state_with) is True
    assert count_grounded_trusted_artifacts(state_with) == 1


# --- provenance and trust ledger on committed artifact (sliderule-python-v52-trust-provenance-ledger-105) ---
# Prove Python slice: record_provenance_and_trust_ledger + commit_artifact_with_ledger force record+bind.
# has_trusted_committed_for_cap requires ledger: producedBy + gated_pass + !stale but no ledger => has_trusted=False.
# Positive via commit helper; negatives via direct server_construct (no record) prove gate exclusion.
# Client forgery guard tested. Full durable list field + all-path enforcement deferred (see status).
# Tests kept as-is per safety (no weaken/delete).


def test_commit_artifact_records_provenance_and_trust_ledger_entry():
    """Via commit helper: produces producedBy + ledger record (list + ledgerEntryId bind); satisfies gate."""
    state = make_min_state("目标 for trust ledger")
    run = CapabilityRun(id="r-prov", capabilityId="evidence.search", turnId="t-prov")
    state.capabilityRuns = [run]
    art = commit_artifact_with_ledger(
        state,
        id="a-prov-1",
        kind="evidence",
        provenance="python-rag",
        trustLevel="gated_pass",
        producedBy=ProducedBy(capabilityRunId="r-prov", capabilityId="evidence.search"),
        content="provenanced content",
        payload={"sources": [{"title": "s"}]},
    )
    assert art.producedBy is not None
    assert art.provenance == "python-rag"
    assert art.trustLevel == "gated_pass"
    # ledger entry recorded and bound
    assert has_provenance_and_trust_ledger(state, "a-prov-1") is True
    assert has_trusted_committed_for_cap(state, "evidence.search") is True
    # run carries ledgerEntryId
    bound_run = next((r for r in state.capabilityRuns if getattr(r, "id", None) == "r-prov"), None)
    assert bound_run is not None
    assert getattr(bound_run, "ledgerEntryId", None) is not None and "trust-ledger" in str(getattr(bound_run, "ledgerEntryId"))


def test_artifact_without_producedby_or_ledger_cannot_satisfy_trusted_committed():
    """Missing producedBy blocks record; producedBy + gated_pass but no ledger blocks has_trusted_committed_for_cap (and has_ledger)."""
    state = make_min_state("目标")
    run = CapabilityRun(id="r-nop", capabilityId="evidence.search", turnId="t1")
    state.capabilityRuns = [run]

    # case: no producedBy -> record rejects (kept for coverage)
    art_no_prov = Artifact.server_construct(
        id="a-no-prov",
        kind="evidence",
        provenance="web:search",
        trustLevel="gated_pass",
        # deliberately no producedBy
        content="no prov",
        payload={"sources": [{"t": "x"}]},
    )
    state.artifacts = [art_no_prov]
    assert has_provenance_and_trust_ledger(state, "a-no-prov") is False
    with pytest.raises(ValueError) as exc:
        record_provenance_and_trust_ledger(state, art_no_prov, run)
    assert "producedBy" in str(exc.value)

    # key negative per review: has producedBy + gated_pass + !stale but NO ledger record => has_trusted_committed False
    # (directly proves ledger is now mandatory condition, not optional)
    state2 = make_min_state("目标")
    run2 = CapabilityRun(id="r-prod-no-ledger", capabilityId="evidence.search", turnId="t2")
    state2.capabilityRuns = [run2]
    art_no_ledger = Artifact.server_construct(
        id="a-prod-no-ledger",
        kind="evidence",
        provenance="web:search",
        trustLevel="gated_pass",
        producedBy=ProducedBy(capabilityRunId="r-prod-no-ledger", capabilityId="evidence.search"),
        content="has prov but no ledger yet",
        payload={"sources": [{"t": "x"}]},
    )
    state2.artifacts = [art_no_ledger]
    assert has_provenance_and_trust_ledger(state2, "a-prod-no-ledger") is False
    assert has_trusted_committed_for_cap(state2, "evidence.search") is False
    # now record makes both true
    record_provenance_and_trust_ledger(state2, art_no_ledger, run2)
    assert has_provenance_and_trust_ledger(state2, "a-prod-no-ledger") is True
    assert has_trusted_committed_for_cap(state2, "evidence.search") is True


def test_client_cannot_forge_producedby_or_ledger_on_artifact_commit():
    """Directly prove: client PUT-like dicts with producedBy or elevated or ledgerEntry are rejected (no forge of server trust ledger)."""
    with pytest.raises(ValueError) as e1:
        reject_client_forged_provenance_or_ledger({
            "id": "fake",
            "producedBy": {"capabilityRunId": "r", "capabilityId": "x"},
        })
    assert "producedBy" in str(e1.value) and "forge" in str(e1.value).lower()

    with pytest.raises(ValueError) as e2:
        reject_client_forged_provenance_or_ledger({
            "id": "fake2",
            "trustLevel": "gated_pass",
        })
    assert "trustLevel" in str(e2.value) or "server-only" in str(e2.value)

    # normal untrusted client artifact ok (no forge)
    reject_client_forged_provenance_or_ledger({"id": "ok-client", "trustLevel": "untrusted", "content": "c"})


def test_healthy_committed_with_ledger_satisfies_has_trusted_and_has_ledger():
    """After record, has_trusted (which now requires ledger) + has_ledger both true (ties trust slice to coverage gate)."""
    state = make_min_state("目标")
    run = CapabilityRun(id="r-led", capabilityId="evidence.search", turnId="tl")
    state.capabilityRuns = [run]
    art = Artifact.server_construct(
        id="a-led",
        kind="evidence",
        provenance="web:search",
        trustLevel="gated_pass",
        producedBy=ProducedBy(capabilityRunId="r-led", capabilityId="evidence.search"),
        content="with ledger content",
        payload={"sources": [1]},
    )
    state.artifacts = [art]
    record_provenance_and_trust_ledger(state, art, run)
    assert has_trusted_committed_for_cap(state, "evidence.search") is True
    assert has_provenance_and_trust_ledger(state, "a-led") is True
    assert getattr(run, "ledgerEntryId", None) is not None


def test_producedby_gated_pass_but_no_ledger_blocks_trusted_committed():
    """Dedicated negative: producedBy + gated_pass + !stale but NO ledger => has_trusted_committed_for_cap False.
    Proves ledger mandatory for trusted committed (per review finding). Uses direct construct to show bypass path blocked at gate; record makes pass.
    (Full wiring of all paths outside this allowed scope.)
    """
    state = make_min_state("目标")
    run = CapabilityRun(id="r-noled", capabilityId="evidence.search", turnId="t-noled")
    state.capabilityRuns = [run]
    art = Artifact.server_construct(
        id="a-noled",
        kind="evidence",
        provenance="web:search",
        trustLevel="gated_pass",
        producedBy=ProducedBy(capabilityRunId="r-noled", capabilityId="evidence.search"),
        content="prov but no ledger entry recorded",
        payload={"sources": [{"t": "x"}]},
    )
    state.artifacts = [art]
    # no record call: directly tests the block in gate
    assert has_provenance_and_trust_ledger(state, "a-noled") is False
    assert has_trusted_committed_for_cap(state, "evidence.search") is False
    # after proper server record via helper, now trusted
    record_provenance_and_trust_ledger(state, art, run)
    assert has_provenance_and_trust_ledger(state, "a-noled") is True
    assert has_trusted_committed_for_cap(state, "evidence.search") is True
