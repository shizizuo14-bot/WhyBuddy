# Bugfix Requirements Document

## Introduction

The SlideRule V5.1 refactor (route `/sliderule`) defines the Coverage Gate (GCOV) as the single
authority that may write the GOAL/conclusion state — `goal.status` is one of
`"clear" | "needs_refinement" | "not_recommended"` (`shared/blueprint/v5-reasoning-state.ts`).
The design invariant (knife P1/A) is: ORCH stays read-only on GOAL, and the conclusion is written
**only** when GCOV passes.

Code review confirmed two defects against this design:

- **Primary defect (no GOAL-write path).** `goal.status` is initialized to `"needs_refinement"` in
  `createInitialSessionState` and is never transitioned to `"clear"` or `"not_recommended"` anywhere
  in the runtime or page. `evaluateCoverageGate` and the GCOV block in `orchestrateReasoningTurn`
  correctly hard-block a premature `report.write` into AWAIT, but on GCOV-pass nothing writes the
  conclusion state. Invariant #1 ("no path bypasses GCOV to write GOAL") is therefore only vacuously
  true — there is no GOAL-write path at all. The STATUS bar in `client/src/pages/SlideRule.tsx` renders
  the page's local `goal` text string, not `sessionState.goal.status`, so the conclusion the design
  centers on is never computed or surfaced.

- **Secondary defect (P3 invariant unguarded).** The design P3 requires DERIVE (`deriveNodeStatus`)
  to be a read-only projection that never writes STATE authority. As-Built analysis flagged this is
  true only by convention — there is no static assertion/test pinning it. A future regression that
  makes DERIVE write authoritative STATE (artifacts, goal, decisions, etc.) would go uncaught.

The fix follows the bug-condition methodology. The bug condition C(X) is a session that reaches a
GCOV-pass (all blocking coverage gaps resolved/waived AND required capabilities have trusted
committed runs) yet whose `goal.status` never becomes `"clear"`. Preservation applies to every flow
that does not reach GCOV-pass (and the existing GCOV hard-block behavior), which must remain
byte-for-byte unchanged. The conclusion write must occur **only** through the GCOV-gated path, never
directly from ORCH, and DERIVE must remain unable to write authoritative STATE.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a session reaches a GCOV-pass (all blocking coverage gaps resolved/waived AND required capabilities have trusted committed runs) THEN the system leaves `goal.status` at its initial `"needs_refinement"` value because no GOAL-write path exists.

1.2 WHEN coverage cannot be met for the goal THEN the system never sets `goal.status` to `"not_recommended"` (or any non-`needs_refinement` conclusion), because the conclusion state is never computed.

1.3 WHEN the STATUS bar in `SlideRule.tsx` renders THEN the system displays the page's local `goal` text string and does not surface `sessionState.goal.status`, so the conclusion state is invisible to the user.

1.4 WHEN `deriveNodeStatus` (DERIVE) executes THEN the system relies on convention alone to keep it read-only on authoritative STATE, with no assertion or test preventing it from writing `artifacts`, `goal`, `decisions`, or other authoritative STATE fields.

### Expected Behavior (Correct)

2.1 WHEN a session reaches a GCOV-pass (all blocking coverage gaps resolved/waived AND required capabilities have trusted committed runs) THEN the system SHALL write `goal.status = "clear"` through the GCOV-gated path.

2.2 WHEN coverage cannot be met / the goal is not recommended at a GCOV evaluation THEN the system SHALL set `goal.status` to the appropriate non-clear conclusion (`"needs_refinement"` while coverage is still open, `"not_recommended"` when coverage cannot be satisfied).

2.3 WHEN the conclusion state is written THEN the write SHALL occur ONLY through the GCOV-gated path and SHALL NEVER be written directly from ORCH, preserving V5.1 invariant #1.

2.4 WHEN the STATUS bar in `SlideRule.tsx` renders THEN the system SHALL surface `sessionState.goal.status` as the conclusion state.

2.5 WHEN `deriveNodeStatus` (DERIVE) executes THEN a guard/test SHALL pin the P3 invariant so that DERIVE writing any authoritative STATE field (`artifacts`, `goal`, `decisions`, etc.) is caught as a regression.

### Unchanged Behavior (Regression Prevention)

3.1 WHEN GCOV fails with converge intent and `report.write` is still scheduled THEN the system SHALL CONTINUE TO hard-block into a partial AWAIT with the existing `[GCOV] blocked` audit note and empty plan.

3.2 WHEN any session does not reach a GCOV-pass THEN the system SHALL CONTINUE TO behave exactly as before (`goal.status` unchanged, no conclusion write).

3.3 WHEN ORCH (`orchestrateReasoningTurn`) runs THEN it SHALL CONTINUE TO be read-only on GOAL and SHALL NOT write `goal.status` directly.

3.4 WHEN the Budget gate is evaluated THEN the system SHALL CONTINUE TO enforce it, and no new bypass into ORCH SHALL be introduced without the Budget gate.

3.5 WHEN `deriveNodeStatus` projects node statuses THEN it SHALL CONTINUE TO update only `graph.nodes[].status` and leave all authoritative STATE fields untouched.

3.6 WHEN the existing closed-loop test suite runs (63 client + 13 server tests, `verify:sliderule-v5`) THEN it SHALL CONTINUE TO pass green.
