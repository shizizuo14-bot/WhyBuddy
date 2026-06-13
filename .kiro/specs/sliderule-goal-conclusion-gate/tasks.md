# Implementation Plan

## Overview

This plan executes the bugfix workflow for the SlideRule V5.1 GOAL conclusion gate using the
bug-condition methodology. The bug: a session that reaches a GCOV-pass never writes the conclusion
(`goal.status` stays `"needs_refinement"`), there is no GOAL-write path at all, the STATUS bar never
surfaces `sessionState.goal.status`, and the DERIVE read-only-on-STATE invariant (P3) is enforced by
convention only.

Task ordering follows the methodology strictly:
- **Task 1 (standalone, before fix)** — `Property 1: Bug Condition` exploration test that MUST FAIL
  on unfixed code, proving the GCOV-pass branch never writes `goal.status`.
- **Task 2 (standalone, before fix)** — `Property 2 / Property 3: Preservation` tests that MUST PASS
  on unfixed code, capturing the non-GCOV-pass flows and the DERIVE P3 baseline via the
  observation-first methodology.
- **Task 3 (fix)** — introduce the pure `deriveGoalConclusion`, the single-writer
  `applyGoalConclusion`, wire them into `orchestrateReasoningTurn` at the GCOV evaluation site only,
  pin the DERIVE P3 invariant, surface the conclusion in the STATUS bar, then re-run Tasks 1 + 2.
- **Task 4 (checkpoint)** — unit / integration coverage and the `verify:sliderule-v5` closed-loop
  suite (63 client + 13 server tests) stay green.

`bugfix.md` defines the verbatim acceptance criteria (1.1-1.4 current behavior, 2.1-2.5 expected,
3.1-3.6 unchanged). `design.md` governs the implementation specifications (Bug Condition / Expected
Behavior / Preservation Requirements and the three Correctness Properties). The `_Requirements_`
annotations reference the `bugfix.md` clause numbers.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 1, "tasks": ["1"] },
    { "id": 2, "tasks": ["2"] },
    { "id": 3, "tasks": ["3.1"] },
    { "id": 4, "tasks": ["3.2", "3.3", "3.4"] },
    { "id": 5, "tasks": ["3.5", "3.6"] },
    { "id": 6, "tasks": ["4"] }
  ]
}
```

Wave summary (informative):

- **Wave 1 — Task 1**: bug condition exploration test, must run alone first, must FAIL on unfixed code.
- **Wave 2 — Task 2**: preservation property tests (Property 2 + Property 3), must PASS on unfixed code.
- **Wave 3 — Task 3.1**: pure `deriveGoalConclusion` + single-writer `applyGoalConclusion` (no edges into ORCH yet).
- **Wave 4 — Tasks 3.2 / 3.3 / 3.4**: wire the GCOV-gated write into `orchestrateReasoningTurn`, pin DERIVE P3, surface the STATUS bar badge. 3.2 depends on 3.1; 3.3 and 3.4 are independent of 3.2.
- **Wave 5 — Tasks 3.5 / 3.6**: re-run Task 1 (must now PASS) and Task 2 (must still PASS).
- **Wave 6 — Task 4**: all-greens checkpoint including `verify:sliderule-v5`.

Cross-cutting invariants the dependency graph enforces:

- Task 1 MUST land first and MUST fail (exploration test on unfixed code).
- Task 2 MUST pass on unfixed code before any fix lands (observation-first baseline).
- Task 3.2 is the only edit that writes `goal.status` from the orchestrate path, and it does so only
  through `applyGoalConclusion` driven by `gateResult` — never from ORCH scheduling logic.
- Task 3.5 is the proof-of-fix gate: the same test from Task 1 MUST flip from FAIL to PASS.
- Task 3.6 is the no-regression gate: the same tests from Task 2 MUST still PASS.
- Task 4 is the all-greens gate; nothing else may follow it.

## Tasks

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Conclusion Written Only Through the GCOV-Gated Path
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the GCOV-pass branch never writes `goal.status`
  - **Scoped PBT Approach**: For the deterministic GCOV-pass cases, scope the property to concrete failing seeds so each counterexample is reproducible:
    - Seed a trusted `risk.analyze` commit for a complex goal, resolve all blocking gaps, drive a converge turn through `orchestrateReasoningTurn`, assert `newState.goal.status === "clear"`.
    - Waive all blocking gaps with required pre-reqs trusted, drive a converge turn, assert `goal.status === "clear"`.
    - Waive all blocking gaps but leave a required pre-req without a trusted committed run, drive a converge turn, assert `goal.status === "not_recommended"`.
  - Property over the GCOV-pass domain: for all sessions where `evaluateCoverageGate(...).passed === true`, the post-orchestrate `goal.status === "clear"` (from Bug Condition / `isBugCondition` in design)
  - The test assertions should match the Expected Behavior Properties from design (Property 1: `"clear"` on pass, `"not_recommended"` when coverage cannot be satisfied)
  - Add an edge-case rendering check: render `SlideRule` with a GCOV-passed `sessionState` and assert the STATUS bar conclusion badge shows the `clear` label sourced from `sessionState.goal.status`
  - Run test on UNFIXED code (`client/src/lib/sliderule-runtime.ts`, `client/src/pages/SlideRule.tsx`)
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bug exists; `goal.status` stays `"needs_refinement"`, badge shows local `goal` text only)
  - Document counterexamples found to understand root cause (e.g. "GCOV-pass after trusted combo leaves goal.status === 'needs_refinement'", "coverage-unsatisfiable case never computes 'not_recommended'", "STATUS bar renders local goal string, never sessionState.goal.status")
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 2.4_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Non-GCOV-Pass Flows and ORCH Read-Only-on-GOAL
  - **IMPORTANT**: Follow observation-first methodology
  - Observe behavior on UNFIXED code for non-buggy inputs (cases where the turn does NOT reach a GCOV-pass), and record the actual outputs:
    - GCOV hard-block: a converge turn with missing pre-reqs parks at partial AWAIT with the `[GCOV] blocked` note, empty plan, `GCOV_BLOCKED` rationale, `goal.status` unchanged
    - Budget block and contract-sufficiency stop: blocked turns keep their notes, empty plans, and `blocked_by_budget` / `stopped_by_contract_sufficiency` DLEDGER entries, `goal.status` unchanged
    - Ordinary / re-entry turns (challenge / node-click) that do not converge: `goal.status` and all authoritative STATE unchanged
  - Write property-based tests capturing observed behavior patterns from Preservation Requirements:
    - For all inputs where `evaluateCoverageGate(...).passed === false` / the turn does not reach a GCOV-pass, the post-orchestrate state deep-equals the original orchestrate result and `goal.status` is unchanged from input
    - ORCH scheduling/budget/pick logic never assigns `goal.status` directly
  - **Property 3: Preservation** - DERIVE Read-Only on Authoritative STATE (P3)
  - Observe `deriveNodeStatus` on a richly populated state on UNFIXED code; record that only `graph.nodes[].status` changes
  - Write property-based test: for all generated session states, `deriveNodeStatus(state)` leaves `artifacts`, `goal`, `decisions`, `capabilityRuns`, `coverageGaps`, `decisionLedger` (and all other authoritative STATE) deep-equal to a pre-call deep clone; only `graph.nodes[].status` may differ
  - Property-based testing generates many session states (varied gaps, runs, stale, contracts) for stronger guarantees
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 2.5, 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 3. Fix for missing GCOV-gated GOAL conclusion write

  - [x] 3.1 Add pure conclusion-derivation and single-writer functions
    - Add pure `deriveGoalConclusion(state, gateResult, contract)` to `client/src/lib/sliderule-runtime.ts` returning the next `goal.status`:
      - `gateResult.passed === true` → `"clear"`
      - coverage cannot be satisfied (all blocking gaps `waived`, none `open`/`resolved`, AND at least one required pre-req capability lacks a trusted committed run via `hasTrustedCommittedForCap`) → `"not_recommended"`
      - otherwise → `"needs_refinement"` (no-op equal to initial value)
    - Keep the function pure: read only `coverageGate` / `coverageContract` / gaps / committed runs
    - Add single-writer `applyGoalConclusion(state, status)` returning `{ ...state, goal: { ...state.goal, status } }` — the ONLY assigner of `goal.status` outside `createInitialSessionState`
    - _Bug_Condition: isBugCondition(input) where evaluateCoverageGate(input.state, ...).passed === true yet goal.status !== "clear" (from design)_
    - _Expected_Behavior: deriveGoalConclusion maps gateResult → "clear" / "not_recommended" / "needs_refinement" (expectedBehavior from design)_
    - _Preservation: applyGoalConclusion writes only goal.status; ORCH stays read-only on GOAL (Preservation Requirements from design)_
    - _Requirements: 2.1, 2.2, 2.3, 3.3_

  - [x] 3.2 Wire the conclusion into `orchestrateReasoningTurn` at the GCOV evaluation site only
    - Right after `working.coverageGate = gateResult`, compute `working = applyGoalConclusion(working, deriveGoalConclusion(working, gateResult, working.coverageContract))`
    - Drive the write from `gateResult`, never from ORCH pick/budget logic (satisfies "GCOV is the sole authority" and "ORCH read-only on GOAL")
    - Leave the existing hard-block branch (`!gateResult.passed && hasConvergeIntent` → partial AWAIT) byte-for-byte unchanged; on that branch `deriveGoalConclusion` returns `"needs_refinement"` (no observable change) before the early return
    - Leave Budget block and contract-sufficiency stop early-return paths untouched
    - _Bug_Condition: isBugCondition(input) — GCOV-pass branch with no GOAL-write path (from design)_
    - _Expected_Behavior: GCOV-gated path writes goal.status = "clear" on pass, "not_recommended" when coverage cannot be satisfied (expectedBehavior from design)_
    - _Preservation: hard-block / budget / contract-sufficiency / ordinary / re-entry flows unchanged; ORCH read-only on GOAL (Preservation Requirements from design)_
    - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4_

  - [x] 3.3 Pin the DERIVE P3 invariant via guard/test
    - Keep production `deriveNodeStatus` pure and unchanged (read-only on authoritative STATE)
    - Add a dev/test guard `assertDeriveReadOnly(before, after)` (or equivalent test assertion) used by the P3 preservation test to fail any regression where DERIVE writes `artifacts`, `goal`, `decisions`, `capabilityRuns`, gaps, or ledgers
    - _Bug_Condition: DERIVE read-only-on-STATE enforced only by convention (from design)_
    - _Expected_Behavior: a guard/test catches any DERIVE write to authoritative STATE (expectedBehavior from design)_
    - _Preservation: deriveNodeStatus continues to update only graph.nodes[].status (Preservation Requirements from design)_
    - _Requirements: 2.5, 3.5_

  - [x] 3.4 Surface the conclusion in the STATUS bar
    - In `client/src/pages/SlideRule.tsx`, add a conclusion badge bound to `sessionState.goal.status` next to the existing `目标` / `phase` indicators (labels: `clear` → 已收敛 / clear, `needs_refinement` → 待细化, `not_recommended` → 不建议)
    - Keep the local `goal` text string as the goal label; only the new conclusion badge is bound to `sessionState.goal.status`; no other page logic changes
    - _Bug_Condition: STATUS bar renders local goal text string, never sessionState.goal.status (from design)_
    - _Expected_Behavior: STATUS bar surfaces sessionState.goal.status (expectedBehavior from design)_
    - _Preservation: no other page logic changes (Preservation Requirements from design)_
    - _Requirements: 1.3, 2.4_

  - [x] 3.5 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Conclusion Written Only Through the GCOV-Gated Path
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior; when it passes, it confirms the GCOV-gated conclusion write is satisfied
    - Run bug condition exploration test from step 1 (including the STATUS bar badge edge case)
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed; `goal.status === "clear"` on GCOV-pass, `"not_recommended"` when coverage cannot be satisfied, badge sourced from `sessionState.goal.status`)
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 3.6 Verify preservation tests still pass
    - **Property 2: Preservation** - Non-GCOV-Pass Flows, ORCH Read-Only-on-GOAL, and DERIVE Read-Only on STATE (P3)
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run preservation property tests from step 2 (non-GCOV-pass orchestrate flows + DERIVE P3)
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions; non-pass flows deep-equal originals, `goal.status` unchanged, DERIVE touches only `graph.nodes[].status`)
    - Confirm all tests still pass after fix (no regressions)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 4. Checkpoint - Ensure all tests pass
  - Add the unit tests from the design Testing Strategy (`deriveGoalConclusion` three cases, `applyGoalConclusion` writes only `goal.status`, `orchestrateReasoningTurn` writes `"clear"` on pass and leaves `goal.status` unchanged on hard-block / budget / contract-sufficiency, STATUS bar label rendering)
  - Add integration tests: full `/sliderule` flow ordinary turns → converge → GCOV-pass → STATUS bar shows `clear`; hard-block flow → partial AWAIT, STATUS bar stays `needs_refinement`
  - Run the closed-loop suite `verify:sliderule-v5` (63 client + 13 server tests) and confirm it stays green
  - Ensure all tests pass, ask the user if questions arise
  - _Requirements: 3.6_

## Notes

- **Methodology**: bug-condition. C(X) = a session reaching a GCOV-pass whose `goal.status` never
  becomes `"clear"`. ¬C(X) = every flow that does not reach a GCOV-pass (hard-block, budget,
  contract-sufficiency, ordinary, re-entry) plus all `deriveNodeStatus` projections.
- **Single-writer invariant**: `applyGoalConclusion` is the only assigner of `goal.status` outside
  `createInitialSessionState`, and it is invoked solely from the GCOV-gated path — never from ORCH
  scheduling logic — preserving V5.1 invariant #1 (ORCH read-only on GOAL).
- **Property → test mapping**: Property 1 (Bug Condition) is Task 1, re-verified at Task 3.5;
  Property 2 + Property 3 (Preservation) are Task 2, re-verified at Task 3.6.
- **Compatibility-first**: no server contract changes, no socket changes, no `/tasks` deep-link
  changes; the only files touched are `client/src/lib/sliderule-runtime.ts` and
  `client/src/pages/SlideRule.tsx` plus their tests.
- **Green gate**: `verify:sliderule-v5` (63 client + 13 server tests) MUST stay green at Task 4;
  property-based tests use fast-check for the universal preservation guarantees.
