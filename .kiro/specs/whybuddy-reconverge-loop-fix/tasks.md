# Implementation Plan

## Overview

This plan executes the bugfix workflow for the WhyBuddy V5.1 `clear → challenge → re-clear` soul
loop using the bug-condition methodology. It fixes two distinct defects in
`client/src/lib/whybuddy-runtime.ts`, each modeled as its own bug condition:

- **C-1 — Reconvergence deadlock.** `pickNextCapabilities` derives its presence flags
  (`hasReport` / `hasRisk` / `hasSynthesis`) from `existingKinds`, a set built from **all** artifacts
  without excluding stale ones. After a challenge stales a committed artifact, the kind is still
  treated as present, so the staled capability is never re-scheduled and GCOV can never re-pass.
- **C-2 — Stale "clear" conclusion.** `invalidateForIntervention` handles the challenge/stale
  cascade but never touches `goal`, so `goal.status` stays `"clear"` after the supporting artifacts
  are staled, and the STATUS badge lies until the next GCOV re-evaluation.

Task ordering follows the methodology strictly:
- **Task 1 (standalone, before fix)** — `Property 1: Bug Condition` exploration test covering both
  C-1 and C-2, which MUST FAIL on unfixed code, proving the deadlock and the stale conclusion.
- **Task 2 (standalone, before fix)** — `Property 2: Preservation` tests that MUST PASS on unfixed
  code, capturing fresh-artifact picks, ordinary-turn picks, unrelated-challenge conclusion behavior,
  and the GCOV-pass write path via the observation-first methodology.
- **Task 3 (fix)** — make `pickNextCapabilities` stale-aware (C-1), route a single-writer
  `goal.status` downgrade through `applyGoalConclusion` on the invalidation path (C-2), then re-run
  Tasks 1 + 2.
- **Task 4 (checkpoint)** — unit / integration coverage and the `verify:whybuddy-v5` closed-loop
  suite (63 client + 13 server tests) stay green.

`bugfix.md` defines the verbatim acceptance criteria (1.1-1.6 current behavior, 2.1-2.7 expected,
3.1-3.10 unchanged). `design.md` governs the implementation specifications (Bug Condition C-1 / C-2,
Expected Behavior, Preservation Requirements, and the two Correctness Properties). The
`_Requirements_` annotations reference the `bugfix.md` clause numbers.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 1, "tasks": ["1"] },
    { "id": 2, "tasks": ["2"] },
    { "id": 3, "tasks": ["3.1", "3.2"] },
    { "id": 4, "tasks": ["3.3", "3.4"] },
    { "id": 5, "tasks": ["4"] }
  ]
}
```

Wave summary (informative):

- **Wave 1 — Task 1**: bug condition exploration test (C-1 + C-2), must run alone first, must FAIL on unfixed code.
- **Wave 2 — Task 2**: preservation property tests (¬C1 + ¬C2), must PASS on unfixed code.
- **Wave 3 — Tasks 3.1 / 3.2**: the C-1 stale-aware presence fix in `pickNextCapabilities` and the C-2 single-writer downgrade in `invalidateForIntervention`. Independent edits to different functions.
- **Wave 4 — Tasks 3.3 / 3.4**: re-run Task 1 (must now PASS) and Task 2 (must still PASS).
- **Wave 5 — Task 4**: all-greens checkpoint including `verify:whybuddy-v5`.

Cross-cutting invariants the dependency graph enforces:

- Task 1 MUST land first and MUST fail (exploration test on unfixed code).
- Task 2 MUST pass on unfixed code before any fix lands (observation-first baseline).
- Task 3.2 is the only edit that writes `goal.status` from the invalidation path, and it does so only
  through `applyGoalConclusion` — never by assigning `goal.status` directly — preserving the
  `whybuddy-goal-conclusion-gate` single-writer invariant.
- Task 3.3 is the proof-of-fix gate: the same test from Task 1 MUST flip from FAIL to PASS.
- Task 3.4 is the no-regression gate: the same tests from Task 2 MUST still PASS.
- Task 4 is the all-greens gate; nothing else may follow it.

## Tasks

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Stale-Aware Kind Presence Enables Reconvergence
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate (C-1) the staled kind is never re-scheduled and (C-2) `goal.status` stays a stale `"clear"`
  - **Scoped PBT Approach**: For the deterministic bug cases, scope the property to concrete failing seeds so each counterexample is reproducible:
    - **C-1 report**: drive a session to `goal.status === "clear"` with a trusted `report`, stale the report (its id in `staleArtifactIds`), call `pickNextCapabilities(state, convergeText)`, assert it includes `report.write`.
    - **C-1 risk/synthesis**: stale the only `risk` (then `synthesis`) artifact, assert the corresponding capability (`risk.analyze` / `synthesis.merge`) becomes eligible.
    - **C-2 downgrade**: at `goal.status === "clear"`, apply a challenge that stales the supporting report via `invalidateForIntervention`, assert the returned `goal.status === "needs_refinement"`.
    - **Closed loop**: full `clear → challenge → re-orchestrate → re-clear` cycle, assert the second convergence reaches `"clear"` again.
  - Property over the C-1 domain (from `isBugCondition_C1` in design): for all `(state, userText)` where a stale-only artifact of some kind exists with no non-stale artifact of that kind, the fixed `pickNextCapabilities` evaluates that kind's presence flag as `false` so the capability is eligible
  - Property over the C-2 domain (from `isBugCondition_C2` in design): for all converged states where a challenge stales conclusion-supporting artifacts, `invalidateForIntervention` returns `goal.status === "needs_refinement"`
  - The test assertions should match the Expected Behavior (design Correctness Property 1 for C-1; the C-2 downgrade through the single writer)
  - Add an edge-case rendering check: drive the `/whybuddy` closed loop and assert the STATUS badge (bound to `sessionState.goal.status`) shows `"needs_refinement"` between the challenge and the next GCOV re-evaluation
  - Run test on UNFIXED code (`client/src/lib/whybuddy-runtime.ts`)
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bug exists; `pickNextCapabilities` omits the staled kind because `hasReport` stays `true`, and `goal.status` stays `"clear"` after the challenge)
  - Document counterexamples found to understand root cause (e.g. "calculatePrice analogue: `pickNextCapabilities` omits `report.write` when a stale-only report exists", "`invalidateForIntervention` leaves `goal.status === 'clear'` after staling supporting artifacts", "closed loop deadlocks at the second convergence")
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Fresh-Kind Picks, Ordinary Turns, and Single-Writer Conclusion Boundary
  - **IMPORTANT**: Follow observation-first methodology
  - Observe behavior on UNFIXED code for non-buggy inputs (cases where neither C-1 nor C-2 holds), and record the actual outputs:
    - **¬C1 fresh picks**: with a fresh, non-stale, trusted `report` (and `risk` / `synthesis`), record that `pickNextCapabilities` does NOT schedule a duplicate `report.write`
    - **¬C1 ordinary turns**: with empty `staleArtifactIds`, record the exact picks for varied user texts
    - **¬C2 unrelated challenge**: a challenge that does NOT stale conclusion-supporting artifacts (or a non-converged session), record that `goal.status` is unchanged after `invalidateForIntervention`
    - **¬C2 GCOV-pass write**: a GCOV-pass turn still writes `"clear"` / `"not_recommended"` exactly as in `whybuddy-goal-conclusion-gate`
  - Write property-based tests capturing observed behavior patterns from the design Preservation Requirements:
    - For all `(state, userText)` where the C-1 bug condition does NOT hold (a non-stale artifact of the kind exists, or no stale artifact of the kind exists), `pickNextCapabilities_fixed` produces picks identical to `pickNextCapabilities_original`
    - For all `(state, intervention)` where the C-2 bug condition does NOT hold, `invalidateForIntervention_fixed(...).goal.status === invalidateForIntervention_original(...).goal.status` (unchanged)
    - `applyGoalConclusion` remains the only assigner of `goal.status` outside `createInitialSessionState`; the GCOV-pass write path and GCOV gate logic (`evaluateCoverageGate`, `hasTrustedCommittedForCap`, `countTrustedUpstreams`) are unchanged; DERIVE P3 still projects only `graph.nodes[].status`
  - Property-based testing generates many session states (varied artifact kinds, stale subsets, conclusion states, intervention targets) for stronger preservation guarantees
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10_

- [x] 3. Fix for the reconvergence deadlock (C-1) and the stale conclusion (C-2)

  - [x] 3.1 Make `pickNextCapabilities` kind/gap presence stale-aware (C-1)
    - In `client/src/lib/whybuddy-runtime.ts` `pickNextCapabilities` (~L72), replace
      `const existingKinds = new Set((state.artifacts || []).map(a => a.kind))` with a set built from
      **non-stale** artifacts only: compute `const stales = new Set(state.staleArtifactIds || [])` and
      `const existingKinds = new Set((state.artifacts || []).filter(a => !stales.has(a.id)).map(a => a.kind))`
    - This aligns `hasReport` / `hasRisk` / `hasSynthesis` with `hasTrustedCommittedForCap`'s
      `!stales.has(art.id)` exclusion, so ORCH and GCOV agree a staled kind is absent and the
      capability becomes eligible for re-scheduling
    - Leave the keyword branches, state-driven gap-filling, ledger-avoidance, de-dupe, and the
      `.slice(0, 5)` cap byte-for-byte unchanged; only the source of `existingKinds` changes
    - _Bug_Condition: isBugCondition_C1(input) — a stale-only artifact of some kind exists yet pickNextCapabilities omits that kind's capability (from design)_
    - _Expected_Behavior: a kind is treated as present iff a non-stale artifact of that kind exists, so a staled kind becomes eligible for re-scheduling (expectedBehavior from design)_
    - _Preservation: fresh non-stale trusted artifacts still count as present (no duplicate report.write); ordinary turns with no stale artifacts unchanged (Preservation Requirements from design)_
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3_

  - [x] 3.2 Route a single-writer `goal.status` downgrade on the invalidation path (C-2)
    - In `invalidateForIntervention` (~L1819), after computing the stale cascade (`affected` set) and
      the decision-level challenge branch, determine whether the session is at a converged conclusion
      (`goal.status ∈ {"clear", "not_recommended"}`) AND whether the challenge staled at least one
      artifact (or challenged a supporting decision) the conclusion depended on
    - When both hold, route the downgrade through `applyGoalConclusion(nextState, "needs_refinement")`
      so it remains the only assigner of `goal.status`; apply on BOTH return paths — the decision-level
      early return (`targetDecisionId`) and the main artifact/node cascade return
    - Do NOT assign `goal.status` directly; do NOT change the GCOV-gated write in
      `orchestrateReasoningTurn`; when the session is not converged or the challenge does not stale
      conclusion-supporting artifacts, return state with `goal.status` untouched
    - _Bug_Condition: isBugCondition_C2(input) — a challenge stales a converged conclusion's supporting artifacts yet goal.status is left unchanged (from design)_
    - _Expected_Behavior: downgrade goal.status to "needs_refinement" through the single-writer applyGoalConclusion at challenge time (expectedBehavior from design)_
    - _Preservation: unrelated challenges / non-converged sessions leave goal.status unchanged; applyGoalConclusion stays the sole writer; GCOV-pass write path and gate logic unchanged; DERIVE P3 unchanged (Preservation Requirements from design)_
    - _Requirements: 2.5, 2.6, 2.7, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9_

  - [x] 3.3 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Stale-Aware Kind Presence Enables Reconvergence
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior; when it passes, it confirms the staled kind
      is re-schedulable (C-1) and `goal.status` is downgraded through the single writer (C-2)
    - Run bug condition exploration test from step 1 (including the C-1 re-selection seeds, the C-2
      downgrade, the closed-loop re-convergence, and the STATUS badge edge case)
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed; `pickNextCapabilities` re-selects the staled kind, `goal.status === "needs_refinement"` after the challenge, the loop re-converges to `"clear"`, badge sourced from `sessionState.goal.status`)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

  - [x] 3.4 Verify preservation tests still pass
    - **Property 2: Preservation** - Fresh-Kind Picks, Ordinary Turns, and Single-Writer Conclusion Boundary
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run preservation property tests from step 2 (¬C1 fresh/ordinary picks equality + ¬C2 conclusion
      equality + single-writer / GCOV-pass / DERIVE P3 invariants)
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions; non-buggy picks deep-equal originals, `goal.status` unchanged for unrelated challenges, `applyGoalConclusion` remains the sole writer)
    - Confirm all tests still pass after fix (no regressions)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9_

- [x] 4. Checkpoint - Ensure all tests pass
  - Add the unit tests from the design Testing Strategy (C-1: stale-only report → `report.write`
    re-selected; stale-only risk/synthesis → corresponding capability eligible; C-1 preservation: fresh
    trusted report → no duplicate `report.write`, empty stale set → unchanged picks; C-2: challenge
    staling supporting report / decision-level challenge → downgraded to `"needs_refinement"`; C-2
    preservation: unrelated challenge / non-converged session → unchanged, `applyGoalConclusion` sole
    writer; edge cases: multiple artifacts of one kind with mixed stale/fresh, no artifacts present)
  - Add integration tests: full closed loop on `/whybuddy` — drive to `goal.status === "clear"`,
    challenge the report, re-orchestrate, assert re-convergence to `"clear"`; assert the STATUS badge
    shows `"needs_refinement"` between the challenge and re-convergence, then `"clear"` after
  - Run the closed-loop suite `verify:whybuddy-v5` (63 client + 13 server tests) and confirm it stays green
  - Ensure all tests pass, ask the user if questions arise
  - _Requirements: 3.10_

## Notes

- **Methodology**: bug-condition with two conditions. **C1(X)** = a `(state, userText)` where a
  stale-only artifact of some kind exists yet `pickNextCapabilities` omits that kind's capability.
  **C2(X)** = a converged session whose challenge stales conclusion-supporting artifacts yet
  `goal.status` is left unchanged. ¬C1(X) = all picks where no stale artifact of the relevant kind
  exists (fresh first-pass convergence, ordinary turns). ¬C2(X) = challenges that do not undermine a
  conclusion, non-converged sessions, and the GCOV-pass write path.
- **Single-writer invariant**: the C-2 downgrade routes through `applyGoalConclusion`, keeping it the
  only assigner of `goal.status` outside `createInitialSessionState`; no second writer is introduced,
  and the GCOV-pass write in `orchestrateReasoningTurn` is unchanged.
- **Consistency with GCOV**: the C-1 fix mirrors `hasTrustedCommittedForCap`'s staleness exclusion so
  ORCH and GCOV agree about kind presence, closing the reconvergence deadlock.
- **Property → test mapping**: Property 1 (Bug Condition, C-1 + C-2) is Task 1, re-verified at
  Task 3.3; Property 2 (Preservation, ¬C1 + ¬C2) is Task 2, re-verified at Task 3.4.
- **Compatibility-first**: no server contract changes, no socket changes, no `/tasks` deep-link
  changes; `WhyBuddy.tsx` already binds the STATUS badge to `sessionState.goal.status` and needs no
  change; the only file touched is `client/src/lib/whybuddy-runtime.ts` plus its tests.
- **Green gate**: `verify:whybuddy-v5` (63 client + 13 server tests) and the existing
  `whybuddy-goal-conclusion-gate` tests MUST stay green at Task 4; property-based tests use fast-check
  for the universal preservation guarantees.
