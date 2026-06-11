# WhyBuddy Reconverge Loop Fix Bugfix Design

## Overview

This is a follow-up bugfix to `whybuddy-goal-conclusion-gate`. That spec made a converged WhyBuddy
V5.1 session (route `/whybuddy`) reach `goal.status === "clear"`, written through the single-writer
`applyGoalConclusion` on the GCOV-gated path. The first convergence now works. This spec fixes the
**second** convergence: the V5.1 soul loop `clear → challenge → re-clear` currently deadlocks, and
the conclusion badge lies about session state in the interim.

Code review of `client/src/lib/whybuddy-runtime.ts` confirmed two distinct defects, each modeled as
its own bug condition:

- **C-1 — Reconvergence deadlock.** `pickNextCapabilities` (~L72) derives its "already have this
  kind" presence flags (`hasReport` / `hasRisk` / `hasSynthesis`) from
  `existingKinds = new Set((state.artifacts || []).map(a => a.kind))`, which does **not** exclude
  stale artifacts. After a challenge stales the committed `report`, `hasReport` stays `true`, every
  `report.write` push is guarded by `!hasReport`, so the kind is never re-scheduled. Meanwhile GCOV's
  `hasTrustedCommittedForCap` (~L801) correctly excludes stale artifacts, so GCOV can no longer pass
  but ORCH refuses to regenerate the missing artifact — the loop deadlocks at the second
  convergence.

- **C-2 — Stale "clear" conclusion.** `applyGoalConclusion` (~L927) is the single writer of
  `goal.status`, invoked **only** from the GCOV-gated path in `orchestrateReasoningTurn`.
  `invalidateForIntervention` (~L1819) handles the challenge/stale cascade but never touches `goal`.
  After a session reaches `goal.status === "clear"`, a challenge stales the supporting artifacts yet
  `goal.status` stays `"clear"`. Between the challenge and the next GCOV re-evaluation the STATUS
  badge (bound to `sessionState.goal.status`) shows a stale `clear`.

The fix strategy is minimal and surgical, scoped to `client/src/lib/whybuddy-runtime.ts` plus tests:

- **C-1 fix**: make the kind/gap presence check in `pickNextCapabilities` stale-aware, computing
  `hasReport` / `hasRisk` / `hasSynthesis` from non-stale artifacts only, consistent with how
  `hasTrustedCommittedForCap` computes trust. A staled kind becomes eligible for re-scheduling so
  GCOV can re-pass.
- **C-2 fix**: on the invalidation path, when a challenge stales artifacts the current converged
  conclusion depended on, downgrade `goal.status` back to `"needs_refinement"` written through the
  **same** single-writer `applyGoalConclusion` — no second writer of `goal.status` is introduced.

`client/src/pages/WhyBuddy.tsx` already binds the STATUS badge to `sessionState.goal.status`, so it
needs no change. No server contract / socket / `/tasks` deep-link changes. The GCOV gate logic
itself is correct and must not be altered. The `whybuddy-goal-conclusion-gate` invariants and the
`verify:whybuddy-v5` closed-loop suite (63 client + 13 server) must stay green.

## Glossary

- **Bug_Condition (C)**: The condition that triggers a defect. This spec has two: **C1** (a staled
  artifact kind is treated as still-present by `pickNextCapabilities`, so it is never re-scheduled)
  and **C2** (a challenge stales the artifacts a converged conclusion depended on, yet `goal.status`
  is not downgraded).
- **Property (P)**: The desired behavior. **P1**: a staled kind becomes eligible for re-scheduling
  so GCOV can re-pass and the loop re-converges. **P2**: when a challenge stales conclusion-supporting
  artifacts, `goal.status` is downgraded to `"needs_refinement"` through the single writer.
- **Preservation**: Behavior that must remain unchanged — fresh first-pass convergence and ordinary
  turns must keep their picks (¬C1); challenges that do not affect a converged conclusion, the
  GCOV-pass write path, and all non-challenge flows must leave `goal.status` unchanged (¬C2).
- **pickNextCapabilities**: The function in `client/src/lib/whybuddy-runtime.ts` (~L72) that selects
  `(capability, role)` pairs for a turn, using keyword cues and state-driven gap filling.
- **hasTrustedCommittedForCap**: The GCOV helper (~L801) that decides whether a capability has a
  trusted committed artifact, **excluding** stale artifacts (`!stales.has(art.id)`). The reference
  for how staleness should be treated.
- **applyGoalConclusion**: The single-writer GOAL applier (~L927); the ONLY assigner of
  `goal.status` outside `createInitialSessionState`.
- **invalidateForIntervention**: The re-entry engine (~L1819) that handles challenge/stale cascade
  via `dependencyGraph` and decision-level challenges (`targetDecisionId`).
- **orchestrateReasoningTurn (ORCH)**: The orchestrator entry (~L2087); must stay read-only on GOAL
  in its scheduling/budget/pick logic.
- **deriveNodeStatus (DERIVE)**: The read-only node projector; must touch only `graph.nodes[].status`
  (DERIVE P3 invariant).
- **staleArtifactIds**: The authoritative list of artifact ids invalidated by a challenge.
- **goal.status**: The conclusion state `"clear" | "needs_refinement" | "not_recommended"` in
  `shared/blueprint/v5-reasoning-state.ts`.

## Bug Details

### Bug Condition

There are two distinct bug conditions.

**C-1 — kind-deduped artifacts cannot be re-emitted after a challenge.** The bug manifests when a
trusted artifact of some kind (`report`, `risk`, or `synthesis`) has been committed and a subsequent
challenge marks it stale (its id is in `staleArtifactIds`), yet `pickNextCapabilities` still treats
that kind as present because `existingKinds` is built from all artifacts without excluding stale
ones. The corresponding capability is therefore never re-scheduled (every `report.write` push is
guarded by `!hasReport`, etc.).

**Formal Specification (C-1):**
```
FUNCTION isBugCondition_C1(input)
  INPUT: input of type { state: V5SessionState, userText: string }
  OUTPUT: boolean

  staleIds := SET(input.state.staleArtifactIds)
  kind     := some kind IN { "report", "risk", "synthesis" }

  // There exists a stale artifact of `kind`, and NO non-stale artifact of `kind`.
  hasStaleOfKind   := EXISTS a IN input.state.artifacts WHERE a.kind == kind AND staleIds.has(a.id)
  hasFreshOfKind   := EXISTS a IN input.state.artifacts WHERE a.kind == kind AND NOT staleIds.has(a.id)

  RETURN hasStaleOfKind
         AND NOT hasFreshOfKind
         AND pickNextCapabilities(input.state, input.userText) does NOT include that kind's capability
END FUNCTION
```

**C-2 — goal.status not downgraded on challenge.** The bug manifests when a session is at
`goal.status ∈ {"clear", "not_recommended"}` and a challenge/invalidation stales artifacts the
current conclusion depended on, yet `invalidateForIntervention` returns state with `goal.status`
untouched.

**Formal Specification (C-2):**
```
FUNCTION isBugCondition_C2(input)
  INPUT: input of type { state: V5SessionState, intervention: UserIntervention }
  OUTPUT: boolean

  converged := input.state.goal.status IN { "clear", "not_recommended" }
  next      := invalidateForIntervention(input.state, input.intervention)
  staledSomething := next.staleArtifactIds.length > input.state.staleArtifactIds.length
                     OR a targeted decision/artifact the conclusion depended on was challenged

  RETURN converged
         AND staledSomething
         AND next.goal.status == input.state.goal.status   // conclusion left stale
END FUNCTION
```

### Examples

- **C-1, report**: a session reaches `goal.status === "clear"` with a trusted `report` artifact. The
  user challenges the report → it is staled. Re-orchestrate with converge intent. Expected:
  `pickNextCapabilities` evaluates `hasReport === false` and re-selects `report.write`. Actual:
  `hasReport === true` (stale report still counted), `report.write` never re-selected, GCOV can never
  re-pass.
- **C-1, risk**: the only `risk` artifact has been staled by a supporting-decision challenge.
  Expected: `hasRisk === false` so `risk.analyze` becomes eligible. Actual: `hasRisk === true`, the
  kind is skipped.
- **C-2, clear**: session at `goal.status === "clear"`; a challenge stales the report. Expected:
  `goal.status` downgraded to `"needs_refinement"` at challenge time. Actual: stays `"clear"`; the
  STATUS badge shows a stale `clear` until the next GCOV re-evaluation.
- **C-2 edge case (preservation)**: a challenge that targets an artifact the conclusion did **not**
  depend on, or a session not at a converged conclusion. Expected: `goal.status` unchanged.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Fresh, non-stale, trusted artifacts of a kind MUST continue to be treated as present — no duplicate
  `report.write` (or `risk.analyze` / `synthesis.merge`) during normal first-pass convergence.
- Ordinary, non-converging, non-challenged turns MUST keep producing the same picks for all inputs
  that have no stale artifact of the relevant kind.
- The Budget gate, contract-sufficiency stop, and GCOV hard-block flows MUST behave exactly as
  before (same notes, empty plans, ledger entries, `[GCOV] blocked` hard-block).
- Challenges that do NOT stale any artifact the current conclusion depended on (or sessions not at a
  converged conclusion) MUST leave `goal.status` unchanged.
- The GCOV-pass write path MUST be unchanged — GCOV continues to write `"clear"` / `"not_recommended"`
  exactly as in `whybuddy-goal-conclusion-gate`.
- `applyGoalConclusion` MUST remain the only assigner of `goal.status` outside
  `createInitialSessionState`; ORCH scheduling logic stays read-only on GOAL; DERIVE P3 stays
  read-only on STATE; the GCOV gate logic itself (`evaluateCoverageGate`,
  `hasTrustedCommittedForCap`, `countTrustedUpstreams`) is not altered.
- `WhyBuddy.tsx` continues to bind the STATUS badge to `sessionState.goal.status` (no change
  required).

**Scope:**
All inputs that do NOT involve a staled artifact of the relevant kind (for C-1) and all inputs that
do NOT stale a converged conclusion's supporting artifacts (for C-2) should be completely unaffected
by this fix. This includes:
- Fresh first-pass convergence with non-stale trusted artifacts.
- Ordinary informational turns with no stale artifacts.
- Budget-blocked, contract-sufficiency-stopped, and GCOV hard-blocked turns.
- Challenges to artifacts a converged conclusion did not depend on, and non-converged sessions.

**Note:** The actual expected correct behavior is defined in the Correctness Properties section
(Property 1 for C-1, Property 2 for C-2). This section focuses on what must NOT change.

## Hypothesized Root Cause

Based on the code review, the most likely issues are:

1. **C-1: presence flags ignore staleness (primary)**: `pickNextCapabilities` computes
   `existingKinds = new Set((state.artifacts || []).map(a => a.kind))` and derives
   `hasReport = existingKinds.has('report')` (also `hasRisk`, `hasSynthesis`) without excluding
   `staleArtifactIds`. This diverges from `hasTrustedCommittedForCap`, which correctly excludes
   stale. So after a challenge, ORCH and GCOV disagree about whether a kind is present.
   - The `hasSynthesis && !hasReport` branch and the keyword `!hasReport` branch both gate
     `report.write` behind `!hasReport`; with a stale-only report, neither fires.

2. **C-1: no shared "non-stale presence" notion**: there is no single helper expressing "a non-stale
   artifact of this kind exists", so the presence computation drifted from the trust computation.

3. **C-2: no conclusion downgrade on the invalidation path (primary)**:
   `invalidateForIntervention` updates `staleArtifactIds` / `decisionLedger` / challenged graph
   nodes and returns, never re-evaluating or re-writing `goal.status`. The conclusion is only ever
   written on the GCOV-gated path, which runs on the *next* orchestrate turn.

4. **C-2: risk of introducing a second writer**: a naive fix could assign `goal.status` directly
   inside `invalidateForIntervention`, violating the `whybuddy-goal-conclusion-gate` single-writer
   invariant. The downgrade must route through `applyGoalConclusion`.

## Correctness Properties

Property 1: Bug Condition - Stale-Aware Kind Presence Enables Reconvergence

_For any_ session and userText where the bug condition holds (`isBugCondition_C1` returns true — a
stale-only artifact of some kind exists with no non-stale artifact of that kind), the fixed
`pickNextCapabilities` SHALL evaluate that kind's presence flag (`hasReport` / `hasRisk` /
`hasSynthesis`) as `false`, making the kind's capability eligible for re-scheduling, so that a
session at `goal.status === "clear"` that is challenged can re-select `report.write`, allowing GCOV
to re-pass and the `clear → challenge → re-clear` loop to close.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4**

Property 2: Preservation - Single-Writer Conclusion Downgrade on Challenge

_For any_ input where the C-1 bug condition does NOT hold (a fresh, non-stale, trusted artifact of
the kind exists, or the session runs an ordinary non-challenged turn), the fixed
`pickNextCapabilities` SHALL produce exactly the same picks as the original function, preserving
first-pass convergence and ordinary-turn behavior (no duplicate capabilities). _And for any_
challenge where the C-2 bug condition holds (a converged conclusion's supporting artifacts are
staled), the fixed `invalidateForIntervention` SHALL downgrade `goal.status` to
`"needs_refinement"` through the same single-writer `applyGoalConclusion`; _while for any_ challenge
that does not stale a converged conclusion's artifacts (or a non-converged session), `goal.status`
SHALL remain unchanged, `applyGoalConclusion` SHALL remain the only assigner of `goal.status`
outside `createInitialSessionState`, the GCOV-pass write path and GCOV gate logic SHALL stay
unchanged, and DERIVE P3 SHALL keep projecting only `graph.nodes[].status`.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `client/src/lib/whybuddy-runtime.ts`

**Function 1**: `pickNextCapabilities` (~L72) — C-1 fix

**Specific Changes**:
1. **Stale-aware presence set**: replace the unconditional
   `const existingKinds = new Set((state.artifacts || []).map(a => a.kind))` with a set built from
   **non-stale** artifacts only. Concretely, compute
   `const stales = new Set(state.staleArtifactIds || [])` and
   `const existingKinds = new Set((state.artifacts || []).filter(a => !stales.has(a.id)).map(a => a.kind))`.
2. **Consistency with trust computation**: this makes `hasReport` / `hasRisk` / `hasSynthesis`
   align with `hasTrustedCommittedForCap`'s `!stales.has(art.id)` exclusion, so ORCH and GCOV agree
   a staled kind is absent. (Trust-level filtering may be considered, but staleness exclusion is the
   minimal change that closes the loop and keeps ¬C1 inputs unchanged, since a non-stale committed
   artifact still counts as present.)
3. **No other logic changes**: the keyword branches, state-driven gap-filling, ledger-avoidance,
   de-dupe, and `.slice(0, 5)` cap remain byte-for-byte the same. Only the source of `existingKinds`
   changes, so behavior differs **only** when a stale artifact of a kind exists.

**Function 2**: `invalidateForIntervention` (~L1819) — C-2 fix

**Specific Changes**:
4. **Detect conclusion dependency on staled artifacts**: after computing the stale cascade
   (`affected` set) and the decision-level challenge branch, determine whether the session is at a
   converged conclusion (`goal.status ∈ {"clear", "not_recommended"}`) and whether the challenge
   staled at least one artifact (or challenged a supporting decision) the conclusion depended on.
5. **Single-writer downgrade**: when both hold, route the downgrade through
   `applyGoalConclusion(nextState, "needs_refinement")` so it remains the only assigner of
   `goal.status`. Apply this on **both** return paths of `invalidateForIntervention` — the
   decision-level early return (`targetDecisionId`) and the main artifact/node cascade return — so a
   decision challenge that undermines a conclusion is also downgraded.
6. **No second writer / no GCOV-pass change**: do NOT assign `goal.status` directly; do NOT change
   the GCOV-gated write in `orchestrateReasoningTurn`. The downgrade is a legitimate conclusion
   transition expressed through the existing single writer.
7. **Preserve non-converged / unrelated challenges**: when the session is not at a converged
   conclusion, or the challenge does not stale conclusion-supporting artifacts, return the existing
   state untouched on `goal.status`.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate
the bug on unfixed code, then verify the fix works correctly and preserves existing behavior. Both
bug conditions (C-1 and C-2) are exercised independently and together in a closed-loop scenario.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or
refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Construct sessions that reach `goal.status === "clear"` with a trusted `report`,
apply a challenge that stales the report, then (a) call `pickNextCapabilities` with converge intent
and assert `report.write` is selected (C-1), and (b) inspect `goal.status` immediately after
`invalidateForIntervention` (C-2). Run these on the UNFIXED code to observe failures.

**Test Cases**:
1. **C-1 report re-selection**: after staling a trusted report, `pickNextCapabilities` with report
   intent should re-select `report.write` (will fail on unfixed code — `hasReport` stays `true`).
2. **C-1 risk/synthesis re-selection**: after staling the only `risk` (or `synthesis`) artifact,
   the corresponding capability should be eligible (will fail on unfixed code).
3. **C-2 conclusion downgrade**: after a challenge stales the supporting report,
   `invalidateForIntervention` should return `goal.status === "needs_refinement"` (will fail on
   unfixed code — stays `"clear"`).
4. **Closed-loop edge case**: full `clear → challenge → re-orchestrate → re-clear` cycle — the
   second convergence should reach `"clear"` again (will fail on unfixed code — deadlocks at the
   second convergence).

**Expected Counterexamples**:
- `pickNextCapabilities` omits `report.write` when a stale-only report exists.
- `invalidateForIntervention` leaves `goal.status === "clear"` after staling supporting artifacts.
- Possible causes: presence flags ignore `staleArtifactIds`; no downgrade on the invalidation path.

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the
expected behavior.

**Pseudocode (C-1):**
```
FOR ALL input WHERE isBugCondition_C1(input) DO
  picks := pickNextCapabilities_fixed(input.state, input.userText)
  ASSERT picks includes the staled kind's capability   // e.g. report.write
END FOR
```

**Pseudocode (C-2):**
```
FOR ALL input WHERE isBugCondition_C2(input) DO
  next := invalidateForIntervention_fixed(input.state, input.intervention)
  ASSERT next.goal.status == "needs_refinement"
  ASSERT applyGoalConclusion is the writer (no direct goal.status assignment)
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function
produces the same result as the original function.

**Pseudocode (¬C1):**
```
FOR ALL input WHERE NOT isBugCondition_C1(input) DO
  ASSERT pickNextCapabilities_original(input.state, input.userText)
       = pickNextCapabilities_fixed(input.state, input.userText)
END FOR
```

**Pseudocode (¬C2):**
```
FOR ALL input WHERE NOT isBugCondition_C2(input) DO
  ASSERT invalidateForIntervention_original(input.state, input.intervention).goal.status
       = invalidateForIntervention_fixed(input.state, input.intervention).goal.status
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain (varied artifact sets,
  stale-id combinations, conclusion states, and intervention targets).
- It catches edge cases that manual unit tests might miss (e.g. multiple artifacts of one kind, mixed
  stale/fresh).
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs.

**Test Plan**: Observe behavior on UNFIXED code first for sessions with no stale artifacts and for
challenges that do not undermine a conclusion, then write property-based tests capturing that
behavior and asserting equality against the fixed code.

**Test Cases**:
1. **Fresh-artifact picks preserved**: with non-stale trusted artifacts, `pickNextCapabilities`
   produces identical picks (no duplicate `report.write`) before and after the fix.
2. **Ordinary-turn picks preserved**: sessions with empty `staleArtifactIds` produce identical picks.
3. **Unrelated-challenge conclusion preserved**: a challenge that does not stale conclusion-supporting
   artifacts (or a non-converged session) leaves `goal.status` unchanged.
4. **GCOV-pass write preserved**: a GCOV-pass turn still writes `"clear"` / `"not_recommended"`
   exactly as in `whybuddy-goal-conclusion-gate`.

### Unit Tests

- C-1: stale-only report → `report.write` re-selected; stale-only risk/synthesis → corresponding
  capability eligible.
- C-1 preservation: fresh trusted report → no duplicate `report.write`; empty stale set → unchanged
  picks.
- C-2: challenge staling supporting report at `goal.status === "clear"` → downgraded to
  `"needs_refinement"`; decision-level challenge undermining a conclusion → downgraded.
- C-2 preservation: unrelated challenge / non-converged session → `goal.status` unchanged; verify
  `applyGoalConclusion` is the sole writer.
- Edge cases: multiple artifacts of one kind with mixed stale/fresh; no buttons/artifacts present.

### Property-Based Tests

- Generate random session states (varied artifact kinds, stale subsets) and assert: a kind is
  treated as present iff a non-stale artifact of that kind exists (C-1 fix invariant).
- Generate random `(conclusion state, intervention)` pairs and assert the ¬C2 preservation equality
  on `goal.status`, and the C-2 downgrade when supporting artifacts are staled.
- Generate random non-stale states and assert `pickNextCapabilities` picks are identical before and
  after the fix (¬C1 preservation).

### Integration Tests

- Full closed loop on `/whybuddy`: drive a session to `goal.status === "clear"`, challenge the
  report, re-orchestrate, and assert the session re-converges to `"clear"` (C-1 + C-2 together).
- STATUS badge: assert the badge (bound to `sessionState.goal.status`) shows `"needs_refinement"`
  between the challenge and the next GCOV re-evaluation, then `"clear"` after re-convergence.
- Regression: run the existing `whybuddy-goal-conclusion-gate` tests and the `verify:whybuddy-v5`
  closed-loop suite (63 client + 13 server tests) and confirm all stay green.
