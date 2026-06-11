# Bugfix Requirements Document

## Introduction

This is a follow-up bugfix to `whybuddy-goal-conclusion-gate`. That spec correctly added the
GCOV→GOAL conclusion write so a converged WhyBuddy V5.1 session (route `/whybuddy`) can reach
`goal.status === "clear"`, written through the single-writer `applyGoalConclusion` on the
GCOV-gated path (the "GCOV/GOAL single-writer" invariant, ORCH read-only on GOAL, DERIVE P3
read-only on STATE).

Code review of `client/src/lib/whybuddy-runtime.ts` confirmed two further defects that break the
V5.1 soul loop `clear → challenge → re-clear`. The first convergence succeeds, but a subsequent
user challenge can never re-converge, and the conclusion badge lies about the session state in the
interim:

- **C-1 — Reconvergence deadlock (kind-deduped artifacts cannot be re-emitted after a challenge).**
  `pickNextCapabilities` (~L62) computes `const existingKinds = new Set((state.artifacts || []).map(a => a.kind))`
  and derives `hasReport = existingKinds.has('report')` (also `hasRisk`, `hasSynthesis`). This set
  does **not** exclude stale artifacts, so once a report is committed `hasReport` stays `true` even
  after a challenge marks the report stale. The only paths that re-pick `report.write` are guarded
  by `!hasReport` (`if (hasSynthesis && !hasReport) → push report.write`; and the keyword branch
  `if (!hasReport && ...) push report.write`), so `report.write` is never re-scheduled. Meanwhile
  GCOV's `hasTrustedCommittedForCap` (~L801) correctly excludes stale (`!stales.has(art.id)`), so
  after a challenge GCOV correctly no longer sees a trusted report — but `pickNextCapabilities`
  refuses to regenerate one. Net effect: first convergence reaches `goal.status === "clear"`; a
  challenge stales the report → re-orchestrate → `pickNextCapabilities` won't re-select
  `report.write` → GCOV can't re-pass → the session can never re-converge. The loop breaks at the
  **second** convergence.

- **C-2 — Stale "clear" conclusion (goal.status not downgraded on challenge).**
  `applyGoalConclusion` (~L927) is the single writer of `goal.status` and is invoked **only** from
  the GCOV-gated path inside `orchestrateReasoningTurn`. `invalidateForIntervention` (~L1819)
  handles the challenge/stale cascade and decision-level challenge (`targetDecisionId`) but does
  **not** touch `goal`; it returns state with updated `decisionLedger` / `staleArtifactIds` /
  challenged nodes, leaving `goal.status` untouched. Net effect: after a session reaches
  `goal.status === "clear"`, a challenge invalidates the supporting artifacts but `goal.status`
  stays `"clear"`. Between the challenge and the next GCOV re-evaluation, the STATUS bar conclusion
  badge shows a **stale** `clear`, misrepresenting a no-longer-converged session as converged.

The fix follows the bug-condition methodology with two distinct bug conditions:

- **C1(X)**: a session that, after a challenge has staled the trusted artifact of some kind (e.g.
  `report`), re-orchestrates a converge turn yet `pickNextCapabilities` does not make that kind's
  capability eligible for re-scheduling — because the gap/presence check treats a stale artifact as
  "still present". Preservation ¬C1(X): all flows where no stale artifact of the kind exists (fresh
  first-pass convergence, ordinary turns) must be unchanged — no duplicate `report.write` when a
  fresh, non-stale, trusted artifact already exists.
- **C2(X)**: a session at `goal.status ∈ {"clear", "not_recommended"}` receives a
  challenge/invalidation that stales artifacts the current conclusion depended on, yet `goal.status`
  is left unchanged. Preservation ¬C2(X): challenges that do not affect a converged conclusion, and
  all non-challenge flows, leave `goal.status` unchanged; the GCOV-pass write path is unchanged; the
  downgrade is written through the **same** single-writer `applyGoalConclusion` so no second writer
  of `goal.status` is introduced.

Scope: `client/src/lib/whybuddy-runtime.ts` (a stale-aware kind/gap presence check in
`pickNextCapabilities` for C-1; a single-writer goal downgrade on the invalidation path for C-2)
plus tests. `client/src/pages/WhyBuddy.tsx` already binds the STATUS badge to
`sessionState.goal.status`, so it should require no change. No server contract / socket / `/tasks`
deep-link changes. The GCOV gate logic itself is already correct and must not be altered. The
`whybuddy-goal-conclusion-gate` guarantees (single-writer `goal.status`, GCOV sole authority over
the GCOV-pass write, DERIVE P3 read-only) and the `verify:whybuddy-v5` closed-loop suite (63 client
+ 13 server) must stay green.

## Bug Analysis

### Current Behavior (Defect)

**C-1: Reconvergence deadlock — kind-deduped artifacts cannot be re-emitted after a challenge**

1.1 WHEN a trusted `report` artifact has been committed and a subsequent challenge marks it stale (its id is in `staleArtifactIds`) THEN `pickNextCapabilities` still computes `hasReport = existingKinds.has('report') === true` because `existingKinds` is built from all artifacts without excluding stale ones.

1.2 WHEN `hasReport` is `true` for a stale-only report THEN the system never re-schedules `report.write`, because every `report.write` push is guarded by `!hasReport` (the `hasSynthesis && !hasReport` branch and the keyword `!hasReport` branch).

1.3 WHEN the same stale condition applies to `risk` or `synthesis` (their only non-stale artifact has been staled) THEN the system likewise treats `hasRisk` / `hasSynthesis` as satisfied and does not re-schedule the corresponding capability.

1.4 WHEN a session has reached `goal.status === "clear"` and the user then challenges the report (or a supporting decision) THEN the report is staled, GCOV correctly no longer sees a trusted report, but `pickNextCapabilities` refuses to regenerate one, so GCOV can never re-pass and the session can never re-converge (the `clear → challenge → re-clear` loop deadlocks at the second convergence).

**C-2: Stale "clear" conclusion — goal.status not downgraded on challenge**

1.5 WHEN a session is at `goal.status === "clear"` (or `"not_recommended"`) and a challenge/invalidation stales artifacts that the conclusion depended on THEN `invalidateForIntervention` updates `staleArtifactIds` / `decisionLedger` / challenged graph nodes but leaves `goal.status` untouched.

1.6 WHEN the STATUS bar renders in the window between such a challenge and the next GCOV re-evaluation THEN the conclusion badge (bound to `sessionState.goal.status`) shows a stale `clear`, misrepresenting a no-longer-converged session as converged.

### Expected Behavior (Correct)

**C-1: Stale-aware kind/gap presence check**

2.1 WHEN `pickNextCapabilities` computes the "already have this kind" presence flags THEN the system SHALL treat a kind as present only when there is a NON-stale (and ideally trusted) artifact of that kind, consistent with how `hasTrustedCommittedForCap` computes trust — i.e. `hasReport`/`hasRisk`/`hasSynthesis` SHALL exclude artifacts whose id is in `staleArtifactIds`.

2.2 WHEN a trusted `report` artifact has been staled by a challenge THEN `pickNextCapabilities` SHALL evaluate `hasReport === false` so that `report.write` becomes eligible for re-scheduling.

2.3 WHEN the staled kind is `risk` or `synthesis` THEN the corresponding presence flag SHALL be `false` so the corresponding capability becomes eligible for re-scheduling.

2.4 WHEN a session at `goal.status === "clear"` is challenged (staling the report or a supporting decision) and re-orchestrated with converge intent THEN the system SHALL be able to re-select `report.write`, allowing GCOV to re-pass and the session to re-converge — closing the `clear → challenge → re-clear` loop.

**C-2: Single-writer conclusion downgrade on the invalidation path**

2.5 WHEN a challenge/invalidation stales artifacts that the current `clear` (or `not_recommended`) conclusion depended on THEN the system SHALL legitimately downgrade `goal.status` back to `"needs_refinement"`.

2.6 WHEN the conclusion is downgraded THEN the write SHALL go through the SAME single-writer `applyGoalConclusion`, so `applyGoalConclusion` remains the only assigner of `goal.status` outside `createInitialSessionState` (no second writer is introduced).

2.7 WHEN the downgrade occurs THEN it SHALL happen on the invalidation path (at challenge time) so the STATUS badge never shows a stale `clear` between the challenge and the next GCOV re-evaluation.

### Unchanged Behavior (Regression Prevention)

**C-1 preservation (¬C1(X))**

3.1 WHEN a fresh, non-stale, trusted artifact of a kind already exists (no challenge has staled it) THEN the system SHALL CONTINUE TO treat that kind as present and SHALL NOT schedule a duplicate capability (e.g. no duplicate `report.write` during normal first-pass convergence).

3.2 WHEN a session runs ordinary, non-converging, non-challenged turns THEN `pickNextCapabilities` SHALL CONTINUE TO produce the same picks as before for all inputs that have no stale artifact of the relevant kind.

3.3 WHEN the Budget gate, contract-sufficiency stop, and GCOV hard-block flows are exercised THEN they SHALL CONTINUE TO behave exactly as before (same notes, empty plans, ledger entries, `[GCOV] blocked` hard-block).

**C-2 preservation (¬C2(X))**

3.4 WHEN a challenge does NOT stale any artifact the current conclusion depended on (or the session is not at a converged conclusion) THEN the system SHALL CONTINUE TO leave `goal.status` unchanged.

3.5 WHEN GCOV passes on the GCOV-gated path THEN the system SHALL CONTINUE TO write `goal.status` (`"clear"` / `"not_recommended"`) exactly as in `whybuddy-goal-conclusion-gate`; the GCOV-pass write path is unchanged.

3.6 WHEN any path other than the GCOV-gated write or the new invalidation downgrade runs THEN it SHALL CONTINUE TO NOT assign `goal.status`; `applyGoalConclusion` SHALL CONTINUE TO be the only assigner of `goal.status` outside `createInitialSessionState`, and ORCH scheduling logic SHALL CONTINUE TO stay read-only on GOAL.

**Shared preservation**

3.7 WHEN `deriveNodeStatus` (DERIVE) projects node statuses THEN it SHALL CONTINUE TO update only `graph.nodes[].status` and leave all authoritative STATE fields (`artifacts`, `goal`, `decisions`, `capabilityRuns`, gaps, ledgers) untouched (DERIVE P3 invariant unchanged).

3.8 WHEN the GCOV gate logic itself (`evaluateCoverageGate`, `hasTrustedCommittedForCap`, `countTrustedUpstreams`) is exercised THEN it SHALL CONTINUE TO behave exactly as before; this fix SHALL NOT alter the gate logic.

3.9 WHEN the STATUS bar renders THEN it SHALL CONTINUE TO bind to `sessionState.goal.status` (no change to `WhyBuddy.tsx` is required by this fix).

3.10 WHEN the existing `whybuddy-goal-conclusion-gate` tests and the `verify:whybuddy-v5` closed-loop suite (63 client + 13 server tests) run THEN they SHALL CONTINUE TO pass green.
