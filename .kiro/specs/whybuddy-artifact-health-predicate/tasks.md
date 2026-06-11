# Implementation Plan

## Overview

This plan unifies three call sites in `client/src/lib/whybuddy-runtime.ts`
(`pickNextCapabilities` kind-presence, `hasTrustedCommittedForCap`, and
`findInputsForCapability`) onto a single shared artifact-health predicate
`isHealthyArtifact(artifact, staleSet)`, using the bug condition methodology: an
exploration test (Property 1) surfaces the three-site disagreement before the fix,
preservation tests (Property 2) lock in existing behavior for healthy artifacts and the
already-landed C-1/C-2/GCOV/DERIVE/single-convergence paths, then the fix extracts the
shared predicate and applies it at all three sites. Tests precede the fix; the fix is
verified by re-running the same tests.

**Ordering dependency:** This spec MUST land AFTER `whybuddy-stale-set-monotonic`, because
the unified predicate consumes the (now monotonic) session stale set as a stable input.

## Task Dependency Graph

Tasks 1 and 2 are written and run on UNFIXED code before the fix. The fix (3.1) precedes its
verification sub-tasks (3.2, 3.3), which precede the checkpoint (4).

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1", "2"], "dependsOn": [] },
    { "wave": 2, "tasks": ["3.1"], "dependsOn": ["1", "2"] },
    { "wave": 3, "tasks": ["3.2", "3.3"], "dependsOn": ["3.1"] },
    { "wave": 4, "tasks": ["4"], "dependsOn": ["3.2", "3.3"] }
  ]
}
```

## Tasks

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - All Three Sites Agree via the Shared Predicate
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the three-site disagreement in `client/src/lib/whybuddy-runtime.ts` (`pickNextCapabilities` kind-presence vs `hasTrustedCommittedForCap` vs `findInputsForCapability`)
  - **Bug Condition (C)**: an artifact whose present/usable verdict differs across the three sites because it is untrusted (`trustLevel ∉ {gated_pass, audited}`) or stale (`id ∈ staleArtifactIds`) — `isBugCondition(input)` returns true when `NOT (pickPresent = gatedHealthy AND gatedHealthy = inputUsable)`, where `pickPresent = id ∉ staleSet`, `gatedHealthy = isHealthy(artifact)`, `inputUsable = TRUE`
  - **Scoped PBT Approach**: Use fast-check to generate random artifacts with random `trustLevel` and random stale-set membership, then `fc.pre`-filter to the bug condition. For deterministic reproducibility, also pin the concrete S10 and S4 cases below
  - **Pinned case — Untrusted-only kind (S10 / Finding #2)**: construct a session whose only `risk` (and `report`) artifacts are untrusted (forced-gate-fail, `id ∉ staleSet`); assert `pickNextCapabilities` currently reads the kind as "present" and drops `risk.analyze` / `counter.argue` / `report.write` from the next picks
  - **Pinned case — Stale upstream as input (S4 / Finding #1)**: construct a session where the only `risk` of the needed input kind is stale; assert `findInputsForCapability` currently selects that stale `risk` as an input
  - Assert the Expected Behavior Property (Property 1 from design): for the buggy artifact, the three verdicts disagree on UNFIXED code — `pickPresent = true`, `gatedHealthy = false`, `inputUsable = true` for an untrusted artifact (and the analogous stale case)
  - Mirror the V5.1 full-path S10 ("C-1 untrusted variant") and S4 ("challenging an UPSTREAM risk") `it.fails` assertions in `client/src/lib/whybuddy-runtime.fullpath-budget.test.ts` so the exploratory test maps directly to the acceptance assertions
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bug exists; the three sites disagree because the correct rule lives only inside `hasTrustedCommittedForCap`)
  - Document counterexamples found (e.g., "untrusted-only `risk` reads as present in `pickNextCapabilities`, so `risk.analyze` is dropped"; "stale `risk` selected by `findInputsForCapability` trips the reconverged report's commit gate")
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Healthy Artifacts Behave Identically
  - **IMPORTANT**: Follow observation-first methodology — run the UNFIXED code first, record actual outputs, then assert those observed outputs
  - **Non-bug condition (¬C)**: inputs where `isBugCondition` returns false — healthy artifacts (`trustLevel ∈ {gated_pass, audited}` AND `id ∉ staleSet`), already agreed across all three sites
  - Observe on UNFIXED code: for a `gated_pass` non-stale artifact, all three verdicts (`pickPresent`, `gatedHealthy`, `inputUsable`) are `true`, the kind reads as present, and picks are unchanged (3.2)
  - Observe on UNFIXED code: the C-1 stale-aware re-pick still re-schedules stale kinds (3.1)
  - Observe on UNFIXED code: `goal.status` downgrade still flows only through `applyGoalConclusion` as the single writer (3.1, 3.4)
  - Observe on UNFIXED code: a report committed with healthy (trusted, non-stale) upstreams still passes the GCOV / commit-gate write path (3.3)
  - Observe on UNFIXED code: the DERIVE path remains read-only over authoritative state fields, satisfying P3 (3.5)
  - Observe on UNFIXED code: a session converges exactly once (single convergence, no duplicate) (3.6)
  - Observe on UNFIXED code: `findInputsForCapability` returns the same inputs as today when all candidates are healthy
  - Write property-based tests (fast-check) capturing observed behavior: for generated inputs where `isBugCondition` is false (healthy artifacts), `serialize(pickNextCapabilities_fixed(input)) === serialize(pickNextCapabilities_original(input))`, `findInputsForCapability_fixed(input) === findInputsForCapability_original(input)`, and `hasTrustedCommittedForCap_fixed(input) === hasTrustedCommittedForCap_original(input)`
  - Add an agreement invariant property: for any healthy artifact and stale set, `pickPresent = gatedHealthy = inputUsable` already holds on UNFIXED code
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms the baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [x] 3. Fix for three-site artifact-health disagreement (unify on a shared predicate)

  - [x] 3.1 Implement the shared predicate and apply it at all three sites
    - File: `client/src/lib/whybuddy-runtime.ts`
    - Introduce the module-level shared predicate near `hasTrustedCommittedForCap`:
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
    - Refactor `hasTrustedCommittedForCap` to call `isHealthyArtifact(art, stales)` instead of the inline `(art.trustLevel === 'gated_pass' || art.trustLevel === 'audited') && !stales.has(art.id)` check — pure extraction, no behavior change, pins the canonical rule to the shared helper
    - `pickNextCapabilities` — build `existingKinds` from healthy artifacts only (adds the missing `trustLevel` exclusion to its current stale-only filter), so an untrusted-only kind reads as absent and is re-scheduled (Finding #2 / S10):
      ```ts
      const stales = new Set(state.staleArtifactIds || []);
      const existingKinds = new Set(
        (state.artifacts || [])
          .filter(a => isHealthyArtifact(a, stales))
          .map(a => a.kind)
      );
      ```
      The surrounding keyword/state/ledger pick logic is unchanged
    - `findInputsForCapability` — select only healthy artifacts as inputs (adds both the stale and `trustLevel` exclusions it currently lacks), so a stale/untrusted leftover is never selected (Finding #1 / S4); the backward-walk ("most recent matching first"), the per-kind cap, and the de-dup are unchanged — only the health filter is added
    - Do NOT change anything else: the GCOV / commit-gate write path, `applyGoalConclusion` single-writer downgrade, DERIVE read-only projection, and the stale-set accumulation (owned by `whybuddy-stale-set-monotonic`) are untouched
    - _Bug_Condition: isBugCondition(input) = NOT (pickPresent = gatedHealthy AND gatedHealthy = inputUsable) — an untrusted or stale artifact_
    - _Expected_Behavior: pickPresent'(state, artifact) = gatedHealthy'(state, artifact) = inputUsable'(state, artifact) = isHealthyArtifact(artifact, staleSet)_
    - _Preservation: Preservation Requirements from design (3.1–3.6)_
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 3.2 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - All Three Sites Agree via the Shared Predicate
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior; when it passes it confirms the expected behavior is satisfied
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms the bug is fixed — all three sites compute their verdict as `isHealthyArtifact`, so untrusted/stale kinds read as absent / are never selected as inputs)
    - Flip the V5.1 S10 "C-1 untrusted variant" `it.fails` to passing (next picks re-include `risk.analyze` / `counter.argue` / `report.write`)
    - Flip the V5.1 S4 "challenging an UPSTREAM risk" `it.fails` to passing (input resolution selects only healthy upstreams; the reconverged report commits as trusted)
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 3.3 Verify preservation tests still pass
    - **Property 2: Preservation** - Healthy Artifacts Behave Identically
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions for healthy-kind presence, C-1 re-pick, C-2 single-writer downgrade, GCOV commit, DERIVE read-only projection, and single convergence)
    - Confirm all tests still pass after fix (no regressions)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [x] 4. Checkpoint - Ensure all tests pass
  - Run the full relevant test suite (`whybuddy-runtime` unit + property tests, plus the V5.1 full-path S10 and S4 integration flows) and confirm everything is green
  - Confirm the S10 ("C-1 untrusted variant") and S4 ("challenging an UPSTREAM risk") assertions have flipped from `it.fails` to passing
  - Confirm the only production file changed is `client/src/lib/whybuddy-runtime.ts`
  - Confirm the new TypeScript baseline error count is not increased (`node --run check`)
  - Ensure all tests pass, ask the user if questions arise

## Notes

- The only production file expected to change is `client/src/lib/whybuddy-runtime.ts` (plus tests).
- This spec depends on `whybuddy-stale-set-monotonic` (fixed FIRST): the unified predicate
  consumes the durable (monotonic) stale set so "stale" verdicts are stable inputs.
- Scope is limited to unifying the artifact-health predicate across the three call sites; the
  stale-set accumulation semantics are owned by `whybuddy-stale-set-monotonic`.
- Tasks 1 and 2 are standalone and MUST be written and run on UNFIXED code before task 3.
- The shared predicate `isHealthyArtifact(artifact, staleSet)` = `trustLevel ∈ {gated_pass, audited}` AND `id ∉ staleSet` is exactly the rule `hasTrustedCommittedForCap` already applies inline.
