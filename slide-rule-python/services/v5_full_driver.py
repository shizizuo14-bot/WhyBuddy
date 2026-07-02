"""
Complete V5 driver ported from Node's session-driver.ts, mini-session.ts, and client runtime.

This replaces the entire Node V5 loop with Python RAG-backed execution.
All capabilities now produce real evidence via RAG, no templates, no degraded, no su8 issues.
"""

from typing import Dict, Any
from models.v5_state import V5SessionState, ProducedBy
from .slide_rule_orchestrator import orchestrate_plan
from .slide_rule_session import pick_next_capabilities, commit_artifact
from .v5_capability_executor import execute_v5_capability
from .persistence import persist_state
from .slide_rule_coverage import evaluate_coverage_gate, reconcile_coverage

def drive_full_v5_session(initial_state: V5SessionState, max_loops: int = 10) -> V5SessionState:
    """
    Full replacement for Node's driveReasoningSession.
    Uses orchestrate + execute in loop until converge or budget.
    PYTHON_AUTHORITY for multi capability loop execution until stop condition.
    Stop conditions (locked for test): coverage passed, empty picks from pick_next_capabilities, or max_loops budget.
    Note: pick_next_capabilities end fallbacks often add picks; use max_loops and coverage for reliable stop in tests.
    All evidence from stable RAG.
    Implements V5.2 phase transitions (idle/orchestrating/awaiting/failed/done) as PYTHON_AUTHORITY.
    """
    state = initial_state
    state.runtimePhase = "orchestrating"
    loop = 0
    plan = type("P", (), {"selected": []})()  # safe default for phase decision on early error
    picks = []
    executed_loops = 0
    try:
        while loop < max_loops:
            plan = orchestrate_plan(state, f"loop-{loop}", "drive full path")
            # PYTHON_AUTHORITY: use explicit pick_next_capabilities for V5.2 selection semantics + fallbacks
            # (pick is sole authority; empty means converge; no fallback to plan.selected)
            picks = pick_next_capabilities(state, "drive full path")
            state = reconcile_coverage(state)
            selected = picks
            if not picks:
                break  # converged per pick semantics (empty after all rules)
            for sel in selected:
                cap = sel["capabilityId"]
                role = sel.get("roleId", "agent")
                # Execute via full migrated executor - always real
                result = execute_v5_capability(cap, state, [], role, f"loop-{loop}")
                # Use Python-owned commitArtifact (artifact+run+gate+dependencyGraph updates)
                art_id = f"art-{loop}-{cap}"
                run_id = f"run-{loop}-{cap}"
                produced = ProducedBy(capabilityRunId=run_id, capabilityId=cap, roleId=role)
                kind = "evidence" if "evidence" in cap or cap in ["mcp.call", "skill.invoke"] else ("report" if "report" in cap else "risk")
                turn_id = f"loop-{loop}"
                commit_artifact(
                    state,
                    id=art_id,
                    kind=kind,
                    content=result.get("content", ""),
                    summary=result.get("summary", ""),
                    title=result.get("title"),
                    provenance=result.get("provenance", "python-rag"),
                    producedBy=produced,
                    inputArtifactIds=[],
                    turnId=turn_id,
                    sources=result.get("sources", []),
                )
            executed_loops += 1
            # Check GCOV
            gate = evaluate_coverage_gate(state)
            if gate.get("passed"):
                state.goal["status"] = "clear"
                break
            loop += 1
            persist_state(state)
        # Final phase: done if clear/coverage, else awaiting (converged or budget)
        gate = evaluate_coverage_gate(state)
        if gate.get("passed") or (state.goal or {}).get("status") == "clear":
            state.runtimePhase = "done"
        else:
            state.runtimePhase = "awaiting"
            if loop >= max_loops:
                state.awaitReason = "max_loops"
            else:
                # use last picks (from pick_next_capabilities) for convergence; empty pick owns converge decision
                state.awaitReason = "convergence" if not picks else "coverage"
    except Exception as exc:
        state.runtimePhase = "failed"
        state.awaitReason = "ready"
        state.awaitDetail = f"drive error: {str(exc)[:120]}"
    persist_state(state)
    return state
