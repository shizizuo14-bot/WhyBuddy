# SlideRule Stale-Set Monotonic Bugfix Design

## Overview

This bugfix makes the SlideRule session stale set **durable (monotonic) across challenges**.

Today, in `client/src/lib/sliderule-runtime.ts`, `invalidateForIntervention` computes the
dependency cascade for the freshly-challenged artifact (`affected`) and then **replaces** the
session's stale set with only that cascade on the main return path:

```ts
let nextState: V5SessionState = {
  ...state,
  staleArtifactIds: Array.from(affected), // ← overwrites, does not union
  graph: { ...state.graph, nodes: newGraphNodes },
};
```

Because the assignment overwrites rather than unions with the prior `state.staleArtifactIds`, a
second (and any subsequent) challenge silently **un-stales** artifacts that an earlier challenge
had staled, unless the new cascade happens to re-cover them. Those artifacts resurface as
"healthy", trusted artifacts, even though no supersede or explicit resolve occurred.

The fix is small and targeted: union the new cascade into the existing stale set so the stale set
**only grows** through challenges, and **shrinks only** through the two permitted exits (an
explicit supersede of a specific id, or an explicit resolve of a specific id). The change applies
to both return paths of `invalidateForIntervention` — the decision-level early return and the main
cascade return — so prior stale ids are preserved no matter which path executes.

The only production file expected to change is `client/src/lib/sliderule-runtime.ts`, plus tests.
Findings #1/#2 from the same V5.1 acceptance suite (`findInputsForCapability` /
`pickNextCapabilities` health predicate) are explicitly **out of scope** and handled in the
separate `sliderule-artifact-health-predicate` spec.

The observable acceptance impact: the V5.1 full-path test plan (`docs/V5.1-full-path-test-plan.md`
§2 S4) "两圈半断言" — *"在第二个 clear 上再挑战一次 → 第三圈仍能走通（stale 集合不污染新健康集）"* —
had to be weakened away from the strong invariant ("a prior-staled artifact stays stale across a
later challenge") precisely because of this overwrite. After this fix that strong assertion can be
restored from an `it.fails` placeholder to a passing assertion.

## Glossary

- **Bug_Condition (C)**: The condition that triggers the bug — a challenge applied to a session
  whose `staleArtifactIds` is already non-empty, where the freshly-computed cascade does not cover
  every previously-stale id (`state.staleArtifactIds` ⊄ `cascade(targetId)`).
- **Property (P)**: The desired behavior — after the fix, the resulting `staleArtifactIds` is the
  **union** of the prior stale set and the new cascade, so `result.staleArtifactIds ⊇ state.staleArtifactIds`.
- **Preservation**: Existing behavior that must remain unchanged — first/single challenges,
  challenges whose cascade already covers the prior stale set, supersede paths, explicit resolve
  paths, graph node marking, the C-1/C-2 fix paths, GCOV commit, DERIVE read-only projection, and
  P2 byte-identical card/node parity.
- **`invalidateForIntervention`**: The re-entry engine function in
  `client/src/lib/sliderule-runtime.ts` that, given a state and a `UserIntervention`, marks the
  challenged artifact + its dependency cascade as stale, marks corresponding graph nodes as
  `challenged`, and (when at a converged conclusion) routes a single-writer `goal.status` downgrade
  through `applyGoalConclusion`.
- **`staleArtifactIds`**: The authoritative session-level set of artifact ids currently considered
  stale. Read by `pickNextCapabilities`, `hasTrustedCommittedForCap`, `countTrustedUpstreams`,
  GCOV and DERIVE to decide which artifacts still count as present/trusted.
- **`affected` (cascade)**: The dependency closure starting at `targetId`, computed inside
  `invalidateForIntervention` by walking `state.dependencyGraph` edges (`from`=input → `to`=output).
- **Cascade / `cascade(targetId)`**: The set `affected` produced for a single challenge.
- **Converged conclusion**: A `goal.status` of `clear` or `not_recommended` (per
  `isConvergedConclusion`).

## Bug Details

### Bug Condition

The bug manifests when a challenge is applied to a session whose `staleArtifactIds` is **already
non-empty** and the new challenge's dependency cascade does **not** re-cover every previously-stale
id. The main cascade return path of `invalidateForIntervention` assigns
`staleArtifactIds = Array.from(affected)`, which discards any prior stale id that is not part of the
new cascade. The function is overwriting the durable stale set instead of unioning into it.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type { state: V5SessionState, intervention: UserIntervention }
  OUTPUT: boolean

  LET prior   = SET(input.state.staleArtifactIds)
  LET target  = input.intervention.targetArtifactId OR input.intervention.targetNodeId
  LET cascade = dependencyClosure(target, input.state.dependencyGraph)  // = `affected`

  RETURN target IS DEFINED                       // a cascade is actually computed
         AND prior IS NON-EMPTY                  // an earlier challenge already staled something
         AND NOT isSubset(prior, cascade)        // prior ⊄ cascade: some prior id is dropped
END FUNCTION
```

When `isBugCondition` holds, the original function `F` produces
`result.staleArtifactIds = cascade`, which is missing `prior \ cascade` — those ids silently
un-stale.

### Examples

- **Two-challenge un-stale (S4 两圈半 core)**: Loop-1 produces `report_A` (staled by challenge 1,
  so `staleArtifactIds = {risk_A, report_A}`). The session reconverges to `clear` with new
  `report_B`. Challenge 2 targets `report_B` with cascade `{risk_B, report_B}`. Expected:
  `staleArtifactIds ⊇ {risk_A, report_A}`. Actual (bug): `staleArtifactIds = {risk_B, report_B}` —
  `risk_A`/`report_A` resurface as healthy.
- **Unrelated lineage challenge**: prior `staleArtifactIds = {x}` from an earlier challenge; a new
  challenge on an unrelated artifact `y` with cascade `{y}`. Expected: `{x, y}`. Actual (bug):
  `{y}` — `x` un-stales.
- **Edge — cascade already covers prior**: prior `{risk_A}`; new challenge cascades to
  `{risk_A, report_A}` (superset). Here `prior ⊆ cascade`, so `isBugCondition` is **false** and
  the original and fixed functions agree (`{risk_A, report_A}`). This is a non-buggy input that
  must be preserved.
- **Edge — first/single challenge**: prior `staleArtifactIds = []`; any cascade. `prior` is empty,
  so `isBugCondition` is **false**; union with empty equals the cascade — identical to today.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- First/single challenges (empty prior stale set) SHALL produce the same stale set as today
  (union with `[]` is identical to the current cascade result) — bugfix 3.1.
- The C-1 fix path (stale-aware `pickNextCapabilities` re-including `risk.analyze` and
  `report.write` after a challenge) SHALL behave exactly as today — bugfix 3.2.
- The C-2 fix path (single-writer `goal.status` downgrade to `needs_refinement` through
  `applyGoalConclusion`) SHALL behave exactly as today, and `applyGoalConclusion` SHALL remain the
  only writer of `goal.status` — bugfix 3.3.
- A single convergence loop (challenge → reconverge → clear, no prior stale set) SHALL still reach
  `clear` — bugfix 3.4.
- GCOV-pass commit write path SHALL commit artifacts unchanged — bugfix 3.5.
- Graph node `challenged` marking SHALL mark the same nodes as today — bugfix 3.6.
- DERIVE P3 read-only projection SHALL remain read-only over authoritative fields — bugfix 3.7.
- Card-challenge (`targetArtifactId`) and node-click (`targetNodeId`) on the same id SHALL produce
  byte-identical serialized state (P2 deep-equal), now with monotonic stale-set semantics applied
  identically on both paths — bugfix 3.8.

**Scope:**
All inputs where `isBugCondition` is **false** SHALL be completely unaffected by this fix. This
includes:
- First/single challenges (prior stale set empty).
- Challenges whose cascade already covers the prior stale set (`prior ⊆ cascade`).
- Supersede paths (a fresh, trusted same-lineage/kind artifact replacing a staled one).
- Explicit resolve paths for a staled artifact.

**Note:** The actual expected correct behavior under the bug condition is defined in the
Correctness Properties section (Property 1). This section focuses on what must NOT change.

## Hypothesized Root Cause

Based on the bug description and the code in `invalidateForIntervention`, the cause is well
localized:

1. **Overwrite instead of union on the main cascade return** (primary, high confidence):
   The main return path assigns `staleArtifactIds: Array.from(affected)`. `affected` is seeded only
   from `targetId` and grown via `dependencyGraph` closure — it has no knowledge of
   `state.staleArtifactIds`. Any prior stale id not reachable from the new target is dropped.

2. **No durable accumulation contract**: there is no helper or invariant enforcing that the stale
   set is monotonic; each call computes a fresh cascade and treats it as the whole truth.

3. **Permitted-exit shrink is conflated with challenge recompute**: the only legitimate ways for
   the stale set to shrink (supersede of a specific id, explicit resolve of a specific id) are
   distinct, targeted removals — they should not be achieved as a side effect of overwriting the
   set on every challenge.

4. **Decision-level early return path** currently preserves prior stale only implicitly (it spreads
   `...state` and never reassigns `staleArtifactIds`); the fix should make preservation explicit and
   verified so both return paths share one monotonic contract — bugfix 2.6.

## Correctness Properties

Property 1: Bug Condition - Stale Set Is Monotonic Across Challenges

_For any_ input where the bug condition holds (`isBugCondition` returns true — a challenge with a
defined cascade target applied to a session whose prior `staleArtifactIds` is non-empty and not a
subset of the new cascade), the fixed `invalidateForIntervention` SHALL set the resulting
`staleArtifactIds` to the **union** of the prior `state.staleArtifactIds` and the new cascade, so
that `result.staleArtifactIds ⊇ state.staleArtifactIds` AND `result.staleArtifactIds ⊇ cascade`.
No previously-stale id is dropped by a later challenge.

**Validates: Requirements 2.1, 2.2, 2.3, 2.6**

Property 2: Preservation - Non-Buggy Inputs Behave Identically

_For any_ input where the bug condition does NOT hold (`isBugCondition` returns false — first/single
challenges with an empty prior stale set, challenges whose cascade already covers the prior stale
set, supersede paths, and explicit resolve paths), the fixed `invalidateForIntervention` SHALL
produce the same serialized result as the original function, preserving graph node marking, the
C-1/C-2 fix paths, single-writer `goal.status`, GCOV commit, DERIVE read-only projection, and P2
card/node byte-identical parity.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `client/src/lib/sliderule-runtime.ts`

**Function**: `invalidateForIntervention`

**Specific Changes**:

1. **Union on the main cascade return path** (primary fix):
   Replace the overwrite with a union of the prior stale set and the new cascade. Order
   deterministically (prior ids first, then new cascade ids in iteration order) and de-duplicate so
   the result is stable for P2 byte-identical comparisons:
   ```ts
   const mergedStale = Array.from(
     new Set<string>([...(state.staleArtifactIds || []), ...affected])
   );
   let nextState: V5SessionState = {
     ...state,
     staleArtifactIds: mergedStale,
     graph: { ...state.graph, nodes: newGraphNodes },
   };
   ```

2. **Preserve prior stale on the decision-level early return path** — bugfix 2.6:
   The decision-level branch (`targetDecisionId` found) already spreads `...state` and never
   reassigns `staleArtifactIds`, so prior ids are preserved. Keep that behavior and add an explicit
   inline comment documenting the monotonic contract so the preservation is intentional and
   regression-protected on both return paths. Do not introduce any shrink on this path.

3. **Keep the C-2 conclusion check semantics unchanged** — bugfix 3.3:
   The `conclusionArtifactStaled` check must continue to compute "freshly staled report" against the
   prior set, i.e. `affected.has(a.id) && !prevStale.has(a.id)` where
   `prevStale = new Set(state.staleArtifactIds)`. This uses `affected` and the prior set directly
   (not the merged result), so the union change does not alter the downgrade decision. The downgrade
   continues to route through the single-writer `applyGoalConclusion`.

4. **Do not alter the cascade computation or graph node marking** — bugfix 3.6:
   The `affected` closure walk over `dependencyGraph` and the `newGraphNodes` `challenged` marking
   are unchanged. Only the assignment of `staleArtifactIds` changes.

5. **Do not touch supersede / explicit resolve exits**:
   Those targeted removals (the only permitted ways the stale set shrinks) live outside the
   challenge recompute path and are unchanged — bugfix 2.4, 2.5. After this fix, challenges grow the
   set and only supersede/resolve shrink it.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate
the bug on unfixed code, then verify the fix works correctly (fix checking) and preserves existing
behavior (preservation checking). Property-based testing is used for both the fix property and the
preservation guarantee because the input domain (sessions × challenge sequences) is large and the
monotonicity invariant must hold across arbitrary prior stale sets and cascades.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or
refute the root cause analysis (overwrite-instead-of-union on the main cascade return). If refuted,
re-hypothesize.

**Test Plan**: Construct a session with a non-empty `staleArtifactIds` (simulating an earlier
challenge) and apply a second challenge whose cascade does not cover the prior stale ids. Assert
that the prior stale ids remain in the result. Run on the UNFIXED code to observe the failure. Mirror
the V5.1 §2 S4 "两圈半" sequence (challenge loop-1 report → reconverge → challenge loop-2 report) so
the exploratory test maps directly to the acceptance assertion.

**Test Cases**:
1. **Two-challenge un-stale**: prior `staleArtifactIds = {risk_A, report_A}`, second challenge
   cascade `{risk_B, report_B}`; assert `result.staleArtifactIds ⊇ {risk_A, report_A}` (will fail on
   unfixed code — the original overwrites to `{risk_B, report_B}`).
2. **Unrelated-lineage challenge**: prior `{x}`, new challenge cascade `{y}`; assert `x ∈ result`
   (will fail on unfixed code).
3. **S4 两圈半 sequence**: full challenge → reconverge → challenge replay; assert the loop-1
   report id remains in `staleArtifactIds` after the later challenge (will fail on unfixed code).
4. **Edge — cascade already covers prior**: prior `{risk_A}`, cascade `{risk_A, report_A}`; assert
   result equals `{risk_A, report_A}` (passes on unfixed code — confirms the bug is specific to the
   `prior ⊄ cascade` condition, not all multi-challenge inputs).

**Expected Counterexamples**:
- After a second challenge, `result.staleArtifactIds` is missing `prior \ cascade`.
- Confirmed cause: the main cascade return path assigns `Array.from(affected)` without unioning
  `state.staleArtifactIds`.

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the
expected behavior (the resulting stale set is a superset of the prior stale set and the cascade).

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := invalidateForIntervention_fixed(input.state, input.intervention)
  ASSERT isSuperset(SET(result.staleArtifactIds), SET(input.state.staleArtifactIds))
  ASSERT isSuperset(SET(result.staleArtifactIds), cascade(input))
END FOR
```

**Testing Approach**: Property-based test (fast-check) generating random prior stale sets, random
dependency graphs, and random challenge targets, filtered to the bug condition. This is the test
that reflects `P(result)` and aligns with the V5.1 §2 S4 "两圈半断言" — once it passes, that
acceptance assertion can be restored from `it.fails` to a passing strong assertion.

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function
produces the same result as the original function.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT serialize(invalidateForIntervention_original(input.state, input.intervention))
       = serialize(invalidateForIntervention_fixed(input.state, input.intervention))
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain.
- It catches edge cases (empty prior set, cascade-covers-prior superset) that manual unit tests
  might miss.
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs.

**Test Plan**: Observe behavior on UNFIXED code first for the non-bug inputs (empty prior set,
`prior ⊆ cascade`, supersede, explicit resolve), then write property-based and unit tests capturing
that behavior and assert byte-identical serialized state after the fix.

**Test Cases**:
1. **Empty prior set preservation** (3.1): Observe that with `staleArtifactIds = []` the unfixed
   code yields the cascade; assert the fixed code yields the identical set.
2. **Cascade-covers-prior preservation**: Observe that with `prior ⊆ cascade` the unfixed code
   yields the cascade; assert the fixed code yields the identical set.
3. **C-1 re-pick preservation** (3.2): Observe `pickNextCapabilities` re-includes `risk.analyze`
   and `report.write` after a challenge; assert unchanged after the fix.
4. **C-2 single-writer downgrade preservation** (3.3): Observe `goal.status` downgrades to
   `needs_refinement` only through `applyGoalConclusion`; assert unchanged after the fix.
5. **Single-loop convergence preservation** (3.4): Observe challenge → reconverge → `clear` with no
   prior stale set; assert still reaches `clear`.
6. **Graph node marking preservation** (3.6): Assert the same nodes are marked `challenged`.
7. **P2 card/node parity preservation** (3.8): Assert card-challenge and node-click on the same id
   produce deep-equal serialized state.

### Unit Tests

- Stale-set union on the main cascade return for a representative two-challenge scenario.
- Empty prior stale set yields the cascade unchanged (boundary).
- `prior ⊆ cascade` yields the cascade unchanged (boundary).
- Decision-level early return preserves prior `staleArtifactIds` (bugfix 2.6).
- C-2 conclusion downgrade still routed through `applyGoalConclusion` after the union change.
- Graph node `challenged` marking unchanged for the challenged target.

### Property-Based Tests

- **Fix property (Property 1)**: for generated inputs satisfying `isBugCondition`,
  `result.staleArtifactIds` is a superset of both the prior stale set and the cascade.
- **Preservation property (Property 2)**: for generated inputs not satisfying `isBugCondition`,
  serialized fixed result equals serialized original result.
- **Monotonicity over challenge sequences**: applying an arbitrary sequence of challenges never
  shrinks `staleArtifactIds` (it only grows), confirming durability across many scenarios.

### Integration Tests

- Full S4 "两圈半" flow: challenge loop-1 report → reconverge to `clear` → challenge loop-2 report;
  assert the loop-1 report id remains in `staleArtifactIds` and the third loop still reaches `clear`
  (restores the strong V5.1 §2 S4 assertion from `it.fails` to passing).
- Context/parity flow: run the same challenge once as a card-challenge (`targetArtifactId`) and once
  as a node-click (`targetNodeId`); assert byte-identical serialized state with monotonic semantics
  applied on both paths (P2).
- DERIVE-after-S4 flow: assert DERIVE remains read-only over authoritative fields after monotonic
  stale-set accumulation (P3).
