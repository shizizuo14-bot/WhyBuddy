# WhyBuddy Artifact-Health Predicate Unification Bugfix Design

## Overview

This bugfix unifies three call sites in `client/src/lib/whybuddy-runtime.ts` onto a
**single shared artifact-health predicate** so that ORCH (capability picking), GCOV
(coverage / commit gate), and input-resolution all agree on whether an artifact
counts as present / usable.

Today the three sites apply inconsistent rules:

| Call site | Excludes stale? | Excludes untrusted? |
| --------- | --------------- | ------------------- |
| `pickNextCapabilities` kind-presence (`existingKinds`) | yes | **no** |
| `hasTrustedCommittedForCap` (used by GCOV / `evaluateCoverageGate`) | yes | yes (correct) |
| `findInputsForCapability` | **no** | **no** |

`hasTrustedCommittedForCap` already encodes the correct rule inline:

```ts
if (art && (art.trustLevel === 'gated_pass' || art.trustLevel === 'audited') && !stales.has(art.id)) {
  return true;
}
```

The fix extracts that rule into a shared predicate
`isHealthyArtifact(artifact, staleSet)` and applies it at the other two sites:

- `pickNextCapabilities` builds `existingKinds` from healthy artifacts only (adding
  the missing `trustLevel` exclusion to its current stale-only filter).
- `findInputsForCapability` selects only healthy artifacts as inputs (adding both the
  stale and `trustLevel` exclusions it currently lacks).

This closes two distinct V5.1 acceptance findings at once:

- **Finding #2 (suite S10, `it.fails`)** — after an untrusted-only commit, the next
  picks correctly re-schedule `risk.analyze` / `counter.argue` / `report.write`.
- **Finding #1 (suite S4, `it.fails` "challenging an UPSTREAM risk")** — after
  challenging an upstream artifact, input resolution selects only healthy upstreams,
  so the reconverged report commits as trusted.

The only production file expected to change is `client/src/lib/whybuddy-runtime.ts`,
plus tests.

**Cross-dependency / ordering:** A separate spec `whybuddy-stale-set-monotonic` makes
the session stale set monotonic across challenges and is implemented **FIRST**. Both
touch the same reconvergence flow, and this spec depends on the stale set being durable
(monotonic) so that "stale" verdicts are stable inputs to the unified predicate. This
spec MUST land after the stale-set monotonic fix.

## Glossary

- **Bug_Condition (C)**: The condition that triggers the bug — an artifact whose
  present/usable verdict differs across the three sites because it is untrusted
  (`trustLevel ∉ {gated_pass, audited}`) or stale (`id ∈ staleArtifactIds`). Formally,
  the three sites' verdicts (`pickPresent`, `gatedHealthy`, `inputUsable`) are not all
  equal for that artifact.
- **Property (P)**: The desired behavior — after the fix, all three sites compute their
  present/usable verdict from one shared predicate `isHealthyArtifact(artifact, staleSet)`,
  so they always agree.
- **Preservation**: Existing behavior that must remain unchanged — verdicts and downstream
  behavior for **healthy** artifacts (already agreed across all three sites), the
  already-landed C-1 stale-aware and C-2 single-writer fixes, GCOV commit, DERIVE
  read-only projection, single convergence, and single-writer `goal.status`.
- **`isHealthyArtifact(artifact, staleSet)`**: The new shared predicate — returns true
  iff `artifact.trustLevel ∈ {gated_pass, audited}` AND `artifact.id ∉ staleSet`. This
  is exactly the rule `hasTrustedCommittedForCap` already applies inline.
- **`pickNextCapabilities`** (ORCH): Builds `existingKinds` for gap analysis and decides
  which capabilities to (re-)schedule. Currently filters stale ids only.
- **`hasTrustedCommittedForCap`** (GCOV): The canonical correct rule; used by the
  coverage gate / `evaluateCoverageGate`. Unchanged in semantics — refactored to call
  the shared predicate.
- **`findInputsForCapability`**: Resolves the upstream artifact ids that a capability run
  consumes as inputs. Currently excludes neither stale nor untrusted artifacts.
- **`staleArtifactIds`**: The authoritative session-level set of stale artifact ids,
  now monotonic per `whybuddy-stale-set-monotonic`.
- **trustLevel**: An artifact's trust state. `gated_pass` and `audited` are the trusted
  (healthy) levels; all other values (e.g. untrusted / forced-gate-fail) are not healthy.

## Bug Details

### Bug Condition

The bug manifests for any artifact that is untrusted or stale, because the three sites
disagree on whether it counts:

- `pickNextCapabilities` excludes stale but **not** untrusted → an untrusted-only kind
  reads as "present" and is not re-scheduled (Finding #2 / S10).
- `findInputsForCapability` excludes **neither** stale nor untrusted → a stale or
  untrusted leftover is selected as an input, and the reconverged report's commit gate
  then rejects it as an untrusted/stale upstream (Finding #1 / S4).
- `hasTrustedCommittedForCap` applies the correct rule (excludes both), so its verdict
  diverges from the other two.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type { state: V5SessionState, artifact: Artifact }
  OUTPUT: boolean

  LET staleSet = SET(input.state.staleArtifactIds)
  FUNCTION isHealthy(a) =
    (a.trustLevel = 'gated_pass' OR a.trustLevel = 'audited')
    AND a.id NOT IN staleSet

  // The three sites' present/usable verdicts for this artifact.
  LET pickPresent  = a.id NOT IN staleSet     // pickNextCapabilities: stale-only exclusion
  LET gatedHealthy = isHealthy(input.artifact) // hasTrustedCommittedForCap: correct rule
  LET inputUsable  = TRUE                       // findInputsForCapability: excludes neither

  // Bug fires when the three verdicts disagree for the same artifact.
  RETURN NOT (pickPresent = gatedHealthy AND gatedHealthy = inputUsable)
END FUNCTION
```

When `isBugCondition` holds, the original runtime `F` lets at least one site count the
artifact as present/usable while another excludes it.

### Examples

- **Untrusted-only kind (S10 / Finding #2)**: A forced-gate-fail produces an untrusted
  `risk` (and `report`). `staleSet` does not contain it, so `pickPresent = true` but
  `gatedHealthy = false`. ORCH reads `risk` as present and drops `risk.analyze` /
  `counter.argue` / `report.write` from the next picks. Expected: treat the untrusted
  kind as absent and re-schedule.
- **Stale upstream selected as input (S4 / Finding #1)**: After challenging an upstream
  `risk`, a stale `risk` artifact remains. `findInputsForCapability` (which excludes
  nothing) selects the stale `risk` as the report input; the reconverged report's commit
  gate rejects it as an untrusted/stale upstream. Expected: select only healthy upstreams.
- **Edge — healthy artifact (non-buggy)**: An artifact with `trustLevel = gated_pass`
  and `id ∉ staleSet`. All three verdicts are `true`; `isBugCondition` is **false**.
  Pick/gate/input behavior must be byte-for-byte unchanged.
- **Edge — stale + trusted artifact**: `trustLevel = gated_pass` but `id ∈ staleSet`.
  `pickPresent = false`, `gatedHealthy = false`, `inputUsable = true` → the input site
  disagrees → `isBugCondition` is **true**. After the fix the input site excludes it too.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- For a healthy artifact (`trustLevel ∈ {gated_pass, audited}` AND not stale), all three
  sites SHALL continue to treat the kind as present and make fresh/ordinary picks with no
  duplicate scheduling — bugfix 3.2.
- The C-1 stale-aware re-pick and C-2 single-writer downgrade SHALL behave exactly as
  today (stale kinds re-schedule; `goal.status` downgrade flows only through
  `applyGoalConclusion`) — bugfix 3.1, 3.4.
- A report committed with healthy (trusted, non-stale) upstreams SHALL continue to pass
  the GCOV / commit-gate write path unchanged — bugfix 3.3.
- `applyGoalConclusion` SHALL remain the sole writer of `goal.status` — bugfix 3.4.
- The DERIVE path SHALL remain read-only over authoritative state fields (P3) — bugfix 3.5.
- A session SHALL continue to converge exactly once (single convergence) — bugfix 3.6.

**Scope:**
All inputs where `isBugCondition` is **false** (healthy artifacts, already agreed across
all three sites) SHALL be completely unaffected by this fix.

**Note:** The expected correct behavior under the bug condition is defined in the
Correctness Properties section (Property 1). This section focuses on what must NOT change.

## Hypothesized Root Cause

Based on the bug description and the three call sites, the cause is well localized:

1. **No shared health predicate** (primary, high confidence): the correct rule lives only
   inline inside `hasTrustedCommittedForCap`. `pickNextCapabilities` re-implements a weaker
   variant (stale-only), and `findInputsForCapability` implements none. Without a single
   source of truth, the rules drift apart.

2. **`pickNextCapabilities` missing the `trustLevel` half**: `existingKinds` is built with
   `(state.artifacts || []).filter(a => !stales.has(a.id))` — it excludes stale ids but
   counts untrusted artifacts as present, so an untrusted-only kind is never re-scheduled
   (Finding #2).

3. **`findInputsForCapability` excludes nothing**: it walks `state.artifacts` backwards and
   selects the most recent artifact of each needed kind regardless of trust/stale, so a
   stale or untrusted leftover becomes an input and trips the downstream commit gate
   (Finding #1).

## Correctness Properties

Property 1: Bug Condition — All Three Sites Agree via the Shared Predicate

_For any_ input where the bug condition holds (`isBugCondition` returns true — an artifact
whose present/usable verdict differs across the three sites because it is untrusted or
stale), the fixed runtime SHALL compute each site's present/usable verdict as
`isHealthyArtifact(artifact, staleSet)` = `trustLevel ∈ {gated_pass, audited}` AND
`id ∉ staleSet`, so that:
- `pickPresent'(state, artifact) = isHealthyArtifact(...)` — untrusted/stale kinds read as
  absent and are re-scheduled (S10 picks re-include `risk.analyze` / `counter.argue` /
  `report.write`);
- `gatedHealthy'(state, artifact) = isHealthyArtifact(...)` — unchanged (already correct);
- `inputUsable'(state, artifact) = isHealthyArtifact(...)` — a stale/untrusted artifact is
  never selected as an input (S4 produces a fresh trusted report).

**Validates: Requirements 2.1, 2.2, 2.3**

Property 2: Preservation — Healthy Artifacts Behave Identically

_For any_ input where the bug condition does NOT hold (`isBugCondition` returns false — a
healthy artifact already agreed across all three sites), the fixed runtime SHALL produce
the same pick set, the same gate verdict, and the same resolved inputs as the original
function, preserving the C-1/C-2 fixes, GCOV commit, single-writer `goal.status`, DERIVE
read-only projection, and single-convergence behavior.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `client/src/lib/whybuddy-runtime.ts`

1. **Introduce the shared predicate** (module-level helper):
   ```ts
   function isHealthyArtifact(
     artifact: { id: string; trustLevel?: string },
     staleSet: Set<string>
   ): boolean {
     return (
       (artifact.trustLevel === 'gated_pass' || artifact.trustLevel === 'audited') &&
       !staleSet.has(artifact.id)
     );
   }
   ```
   Place it near `hasTrustedCommittedForCap` so the three sites share one definition.

2. **Refactor `hasTrustedCommittedForCap` to call the predicate** (semantics-preserving):
   Replace the inline `(art.trustLevel === 'gated_pass' || art.trustLevel === 'audited') && !stales.has(art.id)`
   check with `isHealthyArtifact(art, stales)`. This is a pure extraction — no behavior change —
   and pins the canonical rule to the shared helper.

3. **`pickNextCapabilities` — build `existingKinds` from healthy artifacts** (Finding #2):
   ```ts
   const stales = new Set(state.staleArtifactIds || []);
   const existingKinds = new Set(
     (state.artifacts || [])
       .filter(a => isHealthyArtifact(a, stales))
       .map(a => a.kind)
   );
   ```
   This adds the missing `trustLevel` exclusion to the existing stale-only filter, so an
   untrusted-only kind reads as absent and is re-scheduled. The surrounding keyword/state/
   ledger pick logic is unchanged.

4. **`findInputsForCapability` — select only healthy artifacts** (Finding #1):
   ```ts
   const stales = new Set(state.staleArtifactIds || []);
   for (let i = state.artifacts.length - 1; i >= 0; i--) {
     const art = state.artifacts[i];
     if (
       neededKinds.includes(art.kind) &&
       isHealthyArtifact(art, stales) &&
       !inputs.includes(art.id)
     ) {
       inputs.push(art.id);
       if (inputs.length >= neededKinds.length) break;
     }
   }
   ```
   The backward-walk ("most recent matching first"), the per-kind cap, and the de-dup are
   unchanged; only the health filter is added.

5. **Do not change anything else**: the GCOV / commit-gate write path, `applyGoalConclusion`
   single-writer downgrade, DERIVE read-only projection, and the stale-set accumulation
   (owned by `whybuddy-stale-set-monotonic`) are untouched.

## Testing Strategy

### Validation Approach

The strategy is two-phase: first surface counterexamples that demonstrate the disagreement
on unfixed code, then verify the fix (fix checking) and that healthy-artifact behavior is
preserved (preservation checking). Property-based testing is used because the input domain
(sessions × artifacts × trust/stale combinations) is large and the "all three sites agree"
invariant must hold across arbitrary artifacts.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the three-site disagreement BEFORE the
fix. Confirm or refute the root cause (no shared predicate; `pickNextCapabilities` missing
the `trustLevel` half; `findInputsForCapability` excluding nothing). If refuted, re-hypothesize.

**Test Plan**: Construct a session containing an untrusted-only artifact of a kind and,
separately, a stale leftover of a needed input kind. Compare the three sites' verdicts.

**Test Cases**:
1. **Untrusted-only kind (S10)**: state with an untrusted `risk` (and `report`) as the only
   artifacts of those kinds; assert `pickNextCapabilities` currently keeps the kind "present"
   and drops `risk.analyze` / `counter.argue` / `report.write` (fails on unfixed code).
2. **Stale upstream as input (S4)**: state where the only `risk` of the needed kind is stale;
   assert `findInputsForCapability` currently selects the stale `risk` (fails on unfixed code).
3. **Three-site disagreement**: for an untrusted artifact, assert `pickPresent = true`,
   `gatedHealthy = false`, `inputUsable = true` on unfixed code (verdicts disagree).
4. **Edge — healthy artifact**: for a `gated_pass`, non-stale artifact, assert all three
   verdicts are `true` on unfixed code (confirms the bug is specific to untrusted/stale).

**Expected Counterexamples**:
- Untrusted-only kind reads as present in ORCH; stale/untrusted leftover usable as input.
- Confirmed cause: the correct rule exists only inside `hasTrustedCommittedForCap`.

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, all three sites agree
with `isHealthyArtifact`.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  staleSet := SET(input.state.staleArtifactIds)
  healthy  := isHealthyArtifact(input.artifact, staleSet)
  ASSERT pickPresent_fixed(input.state, input.artifact)  = healthy
  ASSERT gatedHealthy_fixed(input.state, input.artifact) = healthy
  ASSERT inputUsable_fixed(input.state, input.artifact)  = healthy
END FOR
```

**Testing Approach**: Property-based test (fast-check) generating random artifacts with
random `trustLevel` and stale membership, filtered to the bug condition. Aligns with the
V5.1 S10 and S4 `it.fails` assertions — once it passes, those flip to passing.

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold (healthy
artifacts), the fixed sites produce the same verdicts and downstream behavior as the
original.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT pickNextCapabilities_fixed(...)    = pickNextCapabilities_original(...)
  ASSERT findInputsForCapability_fixed(...) = findInputsForCapability_original(...)
  ASSERT hasTrustedCommittedForCap_fixed(...) = hasTrustedCommittedForCap_original(...)
END FOR
```

**Testing Approach**: Property-based testing across generated healthy artifacts and sessions,
plus targeted unit tests for the C-1/C-2, GCOV, DERIVE, and single-convergence paths.

**Test Cases**:
1. **Healthy-kind present preservation** (3.2): a `gated_pass` non-stale artifact keeps its
   kind "present"; picks unchanged.
2. **C-1 re-pick preservation** (3.1): stale kinds still re-schedule as before.
3. **C-2 single-writer preservation** (3.4): `goal.status` downgrade still only via
   `applyGoalConclusion`.
4. **GCOV commit preservation** (3.3): a report with healthy upstreams still commits.
5. **DERIVE read-only preservation** (3.5): DERIVE remains read-only over authoritative fields.
6. **Single convergence preservation** (3.6): a session still converges exactly once.

### Unit Tests

- `isHealthyArtifact` truth table: `gated_pass`/`audited` × stale/non-stale, plus untrusted.
- `hasTrustedCommittedForCap` returns identical results before/after the extraction.
- `pickNextCapabilities` re-includes `risk.analyze` / `counter.argue` / `report.write` when the
  only artifacts of those kinds are untrusted-only (S10).
- `findInputsForCapability` skips a stale/untrusted leftover and selects a healthy upstream (S4).
- `findInputsForCapability` returns the same inputs as today when all candidates are healthy.

### Property-Based Tests

- **Fix property (Property 1)**: for generated inputs satisfying `isBugCondition`, all three
  sites' verdicts equal `isHealthyArtifact(artifact, staleSet)`.
- **Preservation property (Property 2)**: for generated healthy-artifact inputs, fixed verdicts
  and resolved inputs equal the original.
- **Agreement invariant**: for any artifact and stale set, `pickPresent = gatedHealthy = inputUsable`
  after the fix (the three sites never disagree).

### Integration Tests

- **S10 full flow**: forced-gate-fail untrusted commit → next turn picks re-include
  `risk.analyze` / `counter.argue` / `report.write` (restores S10 `it.fails` to passing).
- **S4 upstream-challenge flow**: challenge an upstream `risk` → input resolution selects only
  healthy upstreams → reconverged report commits as trusted (restores S4 `it.fails` to passing).
- **Combined with stale-set-monotonic**: run S4 "两圈半" after the monotonic fix to confirm the
  unified predicate consumes the durable stale set correctly and trusted reconvergence holds.
