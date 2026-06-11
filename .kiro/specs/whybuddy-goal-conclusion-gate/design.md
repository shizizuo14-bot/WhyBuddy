# WhyBuddy GOAL Conclusion Gate Bugfix Design

## Overview

WhyBuddy V5.1 (route `/whybuddy`) names the Coverage Gate (GCOV) as the single authority allowed
to write the GOAL/conclusion state — `goal.status: "clear" | "needs_refinement" | "not_recommended"`
in `shared/blueprint/v5-reasoning-state.ts`. The design invariant (knife P1/A) is twofold: ORCH
(`orchestrateReasoningTurn`) stays read-only on GOAL, and the conclusion is written **only** when
GCOV passes.

Code review confirmed the conclusion is never written. `createInitialSessionState` initializes
`goal.status = "needs_refinement"` and no path in `client/src/lib/whybuddy-runtime.ts` or
`client/src/pages/WhyBuddy.tsx` ever transitions it. `evaluateCoverageGate` and the GCOV block in
`orchestrateReasoningTurn` correctly hard-block a premature `report.write` into partial AWAIT on
`!gateResult.passed && hasConvergeIntent`, but on the GCOV-**pass** branch the orchestrator simply
proceeds to plan/graph and writes nothing to `goal`. Invariant #1 ("no path bypasses GCOV to write
GOAL") is therefore only vacuously true: there is no GOAL-write path at all. Separately, the STATUS
bar renders the page's local `goal` text string, so even if a conclusion existed it would be
invisible.

A secondary defect is that the DERIVE read-only-on-STATE invariant (P3) — `deriveNodeStatus` must
only project `graph.nodes[].status` and never write authoritative STATE — is enforced only by
convention. There is no assertion or test pinning it, so a future regression that lets DERIVE write
`artifacts`, `goal`, `decisions`, etc. would go uncaught.

The fix follows the bug-condition methodology. We introduce a GCOV-owned, single-writer conclusion
step that maps the existing `CoverageGateResult` onto `goal.status`, invoked only from the GCOV-gated
path so ORCH's scheduling logic never touches GOAL. We surface `sessionState.goal.status` in the
STATUS bar, and add a guard/test that pins the DERIVE P3 invariant. Every flow that does not reach a
GCOV-pass — including the existing GCOV hard-block behavior — must remain byte-for-byte unchanged,
and the closed-loop suite (63 client + 13 server tests, `verify:whybuddy-v5`) must stay green.

## Glossary

- **Bug_Condition (C)**: A session that reaches a GCOV-pass (all blocking coverage gaps
  resolved/waived AND required capabilities have trusted committed runs) yet whose `goal.status`
  never becomes `"clear"`.
- **Property (P)**: When GCOV passes, the conclusion `goal.status = "clear"` is written through the
  GCOV-gated path; when coverage cannot be satisfied, `goal.status = "not_recommended"`; otherwise it
  stays `"needs_refinement"`.
- **Preservation**: Every flow that does not reach a GCOV-pass — the GCOV hard-block partial AWAIT,
  the Budget block, the contract-sufficiency stop, ordinary turns, and re-entry — keeps its exact
  prior behavior, and `deriveNodeStatus` keeps projecting only `graph.nodes[].status`.
- **GCOV (Coverage Gate)**: `evaluateCoverageGate(state, selected, contract)` →
  `CoverageGateResult { passed, missingCapabilities, unresolvedGaps, waivedGaps, reason }`. The sole
  authority over the conclusion state.
- **ORCH**: `orchestrateReasoningTurn(state, context)` in `client/src/lib/whybuddy-runtime.ts`. Must
  stay read-only on `goal` in its scheduling/budget/pick logic.
- **DERIVE**: `deriveNodeStatus(state)` in `client/src/lib/whybuddy-runtime.ts`. A read-only
  projection that recomputes `graph.nodes[].status` from artifacts + stale + runs + gates.
- **`goal.status`**: The authoritative conclusion field on `V5SessionState.goal`, one of
  `"clear" | "needs_refinement" | "not_recommended"`.
- **`createInitialSessionState`**: Factory that initializes `goal.status = "needs_refinement"`.
- **CoverageContract / CoverageGap**: Authored baseline (`authorCoverageContract`) plus gap lifecycle
  (`open | resolved | waived`) used by GCOV; `blockingGapIds` lists the gaps that gate convergence.

## Bug Details

### Bug Condition

The bug manifests when a session reaches a GCOV-pass — `evaluateCoverageGate` returns
`passed === true` (all blocking gaps resolved/waived AND all required pre-req capabilities have
trusted committed runs) — yet `goal.status` is still `"needs_refinement"` afterward. The orchestrator
either never evaluates a conclusion or never writes it: on the GCOV-pass branch it falls through to
plan/graph construction without touching `goal`.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type { state: V5SessionState, context: OrchestrateContext }
  OUTPUT: boolean

  gate := evaluateCoverageGate(input.state, pickNextCapabilities(input.state, ...), contract)

  RETURN gate.passed == true
         AND afterOrchestrate(input.state, input.context).goal.status != "clear"
END FUNCTION
```

Symmetrically, the conclusion is also never set to `"not_recommended"` when coverage cannot be
satisfied (e.g. all blocking gaps waived but required trusted runs still absent), because no
conclusion is ever computed.

### Examples

- **GCOV-pass after a complete combo round**: goal `"分析权限系统的风险并给出最终报告"`, with a
  trusted `risk.analyze` run committed and all blocking gaps resolved. `evaluateCoverageGate` returns
  `passed: true`. Expected: `goal.status === "clear"`. Actual: `goal.status === "needs_refinement"`.
- **GCOV-pass via waived gaps**: all blocking gaps waived and required pre-reqs have trusted runs;
  `passed: true`. Expected: `"clear"`. Actual: `"needs_refinement"`.
- **Coverage cannot be satisfied**: user waives all blocking gaps but required capabilities never
  produced trusted runs. Expected: `goal.status === "not_recommended"`. Actual:
  `"needs_refinement"` (never computed).
- **STATUS bar (edge case)**: even after a GCOV-pass, the STATUS bar shows the local `goal` text
  string and never the conclusion — expected behavior is that the bar surfaces
  `sessionState.goal.status`.
- **DERIVE P3 (edge case)**: `deriveNodeStatus` could be regressed to write `goal`/`artifacts`; today
  nothing catches it. Expected: a guard/test fails such a regression.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- The GCOV hard-block path (`!gateResult.passed && hasConvergeIntent` with still-missing pre-reqs and
  `report.write` still present) MUST continue to park into partial AWAIT with the existing
  `[GCOV] blocked` conversation note, empty plan, and `GCOV_BLOCKED` decision rationale.
- The Budget block and contract-sufficiency stop paths MUST continue to behave exactly as before
  (same notes, empty plans, `blocked_by_budget` / `stopped_by_contract_sufficiency` DLEDGER entries).
- Ordinary turns and re-entry (challenge / node-click) that do not reach a GCOV-pass MUST keep
  `goal.status` at its prior value and write no conclusion.
- ORCH scheduling/budget/pick logic MUST stay read-only on `goal`; it MUST NOT assign `goal.status`
  directly.
- `deriveNodeStatus` MUST continue to update only `graph.nodes[].status` and leave all authoritative
  STATE fields (`artifacts`, `goal`, `decisions`, `capabilityRuns`, gaps, ledgers, etc.) untouched.
- The existing closed-loop suite (63 client + 13 server tests, `verify:whybuddy-v5`) MUST stay green.

**Scope:**
All inputs that do NOT reach a GCOV-pass should be completely unaffected by this fix. This includes:
- Sessions whose GCOV evaluates to `passed: false` (open blocking gaps, missing pre-reqs).
- Budget-blocked and contract-sufficiency-stopped turns.
- Ordinary informational turns and re-entry turns that do not converge.
- All `deriveNodeStatus` projections, which must remain read-only on authoritative STATE.

**Note:** The actual expected correct behavior (writing the conclusion) is defined in the
Correctness Properties section (Property 1). This section focuses on what must NOT change.

## Hypothesized Root Cause

Based on the code review, the most likely issues are:

1. **Missing GOAL-write path (primary)**: `orchestrateReasoningTurn` evaluates GCOV and stores
   `coverageGate`, but the GCOV-pass branch has no follow-up that writes `goal.status`. The
   conclusion the design centers on is simply never computed.
   - `createInitialSessionState` sets `goal.status = "needs_refinement"` and nothing transitions it.
   - The GCOV block only acts on `!gateResult.passed && hasConvergeIntent` (the hard-block); the
     pass branch falls straight through to `selectedWithInputs` / `newGraphNodes`.

2. **No single-writer abstraction for the conclusion**: because there is no GCOV-owned writer, there
   is no clear, enforceable place that holds the "GCOV is the sole authority" invariant. Adding the
   write ad hoc inside ORCH's body would violate "ORCH read-only on GOAL".

3. **STATUS bar bound to the wrong source**: `WhyBuddy.tsx` renders the local React `goal` string in
   the STATUS bar and never reads `sessionState.goal.status`, so the conclusion is invisible.

4. **DERIVE P3 unguarded**: `deriveNodeStatus` is read-only on authoritative STATE by convention
   only; no assertion or test pins it, so a future regression would be silent.

## Correctness Properties

Property 1: Bug Condition - Conclusion Written Only Through the GCOV-Gated Path

_For any_ session and orchestrate turn where the bug condition's GCOV evaluation passes
(`evaluateCoverageGate(...).passed === true`), the fixed `orchestrateReasoningTurn` SHALL produce a
state with `goal.status === "clear"`, written by the GCOV-owned conclusion step and never by ORCH's
scheduling logic; and where coverage cannot be satisfied the same GCOV-gated step SHALL write
`goal.status === "not_recommended"`. The STATUS bar SHALL surface `sessionState.goal.status`.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4**

Property 2: Preservation - Non-GCOV-Pass Flows and ORCH Read-Only-on-GOAL

_For any_ input where the bug condition does NOT hold (GCOV does not pass / the turn does not reach a
GCOV-pass), the fixed code SHALL produce the same result as the original code, preserving
`goal.status` unchanged, the existing GCOV hard-block partial AWAIT (note, empty plan,
`GCOV_BLOCKED` rationale), the Budget block and contract-sufficiency stop paths, and ORCH staying
read-only on GOAL.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.6**

Property 3: Preservation - DERIVE Read-Only on Authoritative STATE (P3)

_For any_ session state, `deriveNodeStatus(state)` SHALL change only `graph.nodes[].status` and SHALL
leave every authoritative STATE field (`artifacts`, `goal`, `decisions`, `capabilityRuns`,
`coverageGaps`, `decisionLedger`, etc.) deep-equal to the input, pinned by a guard/test so that any
regression writing authoritative STATE from DERIVE is caught.

**Validates: Requirements 2.5, 3.5**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `client/src/lib/whybuddy-runtime.ts`

1. **Add a pure conclusion-derivation function (GCOV authority)**: introduce
   `deriveGoalConclusion(state, gateResult, contract)` that returns the next `goal.status`:
   - `gateResult.passed === true` → `"clear"`.
   - coverage cannot be satisfied — defined narrowly as: all blocking gaps are `waived` (none `open`,
     none `resolved` by an artifact) AND at least one required pre-req capability still lacks a
     trusted committed run (`hasTrustedCommittedForCap` false) — → `"not_recommended"`.
   - otherwise → `"needs_refinement"` (equal to the initial value; a no-op for existing flows).
   This function is pure and reads only `coverageGate` / `coverageContract` / gaps / committed runs.

2. **Add a single-writer GOAL applier (GCOV-gated path)**: introduce
   `applyGoalConclusion(state, status)` that returns `{ ...state, goal: { ...state.goal, status } }`.
   This is the ONLY place outside `createInitialSessionState` that assigns `goal.status`. It is
   invoked solely from the GCOV step, never from ORCH scheduling logic.

3. **Wire the conclusion into `orchestrateReasoningTurn` at the GCOV evaluation site only**: right
   after `working.coverageGate = gateResult`, compute
   `working = applyGoalConclusion(working, deriveGoalConclusion(working, gateResult, working.coverageContract))`.
   - This is the GCOV-gated path: the write is driven by `gateResult`, not by ORCH's pick/budget
     logic, satisfying "GCOV is the sole authority" and "ORCH read-only on GOAL".
   - The existing hard-block branch (`!gateResult.passed && hasConvergeIntent` → partial AWAIT) is
     left byte-for-byte unchanged; on that branch `deriveGoalConclusion` returns `"needs_refinement"`
     (no observable change) before the early `return`.
   - All early-return paths above the GCOV step (Budget block, contract-sufficiency stop) are
     untouched and continue to leave `goal.status` unchanged.

4. **Pin the DERIVE P3 invariant**: add a guard/test (see Testing Strategy) asserting
   `deriveNodeStatus` mutates only `graph.nodes[].status`. Optionally add a dev-only assertion helper
   `assertDeriveReadOnly(before, after)` used in tests; production `deriveNodeStatus` stays pure and
   unchanged.

**File**: `client/src/pages/WhyBuddy.tsx`

5. **Surface the conclusion in the STATUS bar**: add a conclusion badge bound to
   `sessionState.goal.status` (e.g. labels: `clear` → 已收敛 / clear, `needs_refinement` → 待细化,
   `not_recommended` → 不建议), placed next to the existing `目标` / `phase` indicators. The local
   `goal` text string remains as the goal label; only the conclusion badge is newly bound to
   `sessionState.goal.status`. No other page logic changes.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate
the bug on unfixed code (GCOV-pass leaves `goal.status` at `"needs_refinement"`), then verify the fix
writes the conclusion only through the GCOV-gated path and preserves every non-GCOV-pass flow and the
DERIVE P3 invariant.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or
refute the root-cause hypothesis that the GCOV-pass branch never writes `goal.status`. If refuted,
re-hypothesize.

**Test Plan**: Drive `orchestrateReasoningTurn` to a GCOV-pass (commit a trusted `risk.analyze` run
so required pre-reqs are satisfied and blocking gaps resolve, then orchestrate a converge turn), and
assert `newState.goal.status === "clear"`. Run on UNFIXED code to observe the failure.

**Test Cases**:
1. **GCOV-pass after trusted combo**: seed a trusted `risk.analyze` commit for a complex goal, run a
   converge turn, assert `goal.status === "clear"` (will fail on unfixed code — stays
   `"needs_refinement"`).
2. **GCOV-pass via waived gaps**: waive all blocking gaps with required pre-reqs trusted, assert
   `"clear"` (will fail on unfixed code).
3. **Coverage cannot be satisfied**: waive all blocking gaps but leave a required pre-req without a
   trusted run, assert `goal.status === "not_recommended"` (will fail on unfixed code — never
   computed).
4. **STATUS bar binding** (edge case): render `WhyBuddy` with a GCOV-passed session and assert the
   conclusion badge shows the `clear` label sourced from `sessionState.goal.status` (will fail on
   unfixed code — bar shows local `goal` text only).

**Expected Counterexamples**:
- After a GCOV-pass, `goal.status` remains `"needs_refinement"`.
- Possible causes: no GOAL-write path on the GCOV-pass branch; conclusion never derived; STATUS bar
  bound to local `goal` string.

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds (GCOV passes), the fixed function
produces the expected conclusion via the GCOV-gated path.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := orchestrateReasoningTurn_fixed(input.state, input.context)
  ASSERT result.goal.status == "clear"
  ASSERT goalWasWrittenBy(GCOV_path) AND NOT goalWasWrittenBy(ORCH_scheduling)
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold (no GCOV-pass), the fixed
function produces the same result as the original function, and that `deriveNodeStatus` stays
read-only on authoritative STATE.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT orchestrateReasoningTurn_original(input).goal == orchestrateReasoningTurn_fixed(input).goal
  ASSERT orchestrateReasoningTurn_original(input) deep-equals orchestrateReasoningTurn_fixed(input)
END FOR

FOR ALL state DO
  before := deepClone(state)
  after  := deriveNodeStatus(state)
  ASSERT after.artifacts == before.artifacts (deep-equal)
  ASSERT after.goal == before.goal
  ASSERT after.decisions == before.decisions
  ASSERT after.capabilityRuns == before.capabilityRuns
  // only graph.nodes[].status may differ
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many session states across the input domain (varied gaps, runs, stale, contracts).
- It catches edge cases that manual unit tests might miss (partial coverage, mixed gap lifecycles).
- It provides strong guarantees that behavior is unchanged for all non-GCOV-pass inputs and that
  DERIVE never writes authoritative STATE.

**Test Plan**: Observe behavior on UNFIXED code first for non-pass flows (hard-block, budget block,
contract-sufficiency stop, ordinary/re-entry turns) and for `deriveNodeStatus`, then write tests
capturing that behavior so the fix is proven not to disturb it.

**Test Cases**:
1. **GCOV hard-block preservation**: a converge turn with missing pre-reqs still parks at partial
   AWAIT with the `[GCOV] blocked` note, empty plan, `GCOV_BLOCKED` rationale, and `goal.status`
   unchanged.
2. **Budget / contract-sufficiency preservation**: blocked turns keep their notes, empty plans, and
   DLEDGER entries, with `goal.status` unchanged.
3. **Ordinary / re-entry preservation**: non-converging turns leave `goal.status` and all other
   authoritative STATE unchanged.
4. **DERIVE P3 preservation**: `deriveNodeStatus` on a richly populated state leaves `artifacts`,
   `goal`, `decisions`, `capabilityRuns`, gaps, and ledgers deep-equal; only `graph.nodes[].status`
   may change.

### Unit Tests

- `deriveGoalConclusion` returns `"clear"` / `"not_recommended"` / `"needs_refinement"` for the three
  defined cases.
- `applyGoalConclusion` writes only `goal.status` and leaves the rest of the state structurally
  intact.
- `orchestrateReasoningTurn` writes `"clear"` on GCOV-pass and leaves `goal.status` unchanged on the
  hard-block, budget, and contract-sufficiency paths.
- STATUS bar renders the conclusion label from `sessionState.goal.status`.

### Property-Based Tests

- Generate random session states; assert that whenever `evaluateCoverageGate(...).passed`, the
  post-orchestrate `goal.status === "clear"`, and whenever it does not pass, `goal.status` is
  unchanged from the input.
- Generate random states and assert `deriveNodeStatus` leaves all authoritative STATE fields
  deep-equal (P3), changing only `graph.nodes[].status`.

### Integration Tests

- Full `/whybuddy` flow: ordinary turns → converge → GCOV-pass → STATUS bar shows `clear`.
- Hard-block flow: converge with missing pre-reqs → partial AWAIT, STATUS bar stays `needs_refinement`.
- `verify:whybuddy-v5` closed-loop suite (63 client + 13 server tests) remains green after the fix.
