# Implementation Plan

## Overview

This plan fixes the stale-set overwrite in `invalidateForIntervention`
(`client/src/lib/whybuddy-runtime.ts`) using the bug condition methodology: an exploration
test (Property 1) surfaces the bug before the fix, preservation tests (Property 2) lock in
existing behavior, then the fix unions the new cascade into the prior stale set so the stale
set is monotonic across challenges. Tests precede the fix; the fix is verified by re-running
the same tests.

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
  - **Property 1: Bug Condition** - Stale Set Is Monotonic Across Challenges
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bug exists in `invalidateForIntervention` (`client/src/lib/whybuddy-runtime.ts`)
  - **Bug Condition (C)**: a challenge with a defined cascade target applied to a session whose prior `staleArtifactIds` is non-empty and NOT a subset of the new cascade — `isBugCondition(input)` returns true when `target IS DEFINED AND prior IS NON-EMPTY AND NOT isSubset(prior, cascade)`
  - **Scoped PBT Approach**: Use fast-check to generate random prior stale sets, random dependency graphs, and random challenge targets, then `fc.pre`-filter to the bug condition. For deterministic reproducibility, also pin the concrete S4 "两圈半" case: prior `{risk_A, report_A}`, second challenge cascade `{risk_B, report_B}`
  - Construct a session with a non-empty `staleArtifactIds` (simulating an earlier challenge) and apply a second challenge whose cascade does not cover the prior stale ids
  - Assert the Expected Behavior Property: `result.staleArtifactIds ⊇ state.staleArtifactIds` AND `result.staleArtifactIds ⊇ cascade` (no previously-stale id is dropped)
  - Mirror the V5.1 §2 S4 "两圈半" sequence (challenge loop-1 report → reconverge → challenge loop-2 report) so the exploratory test maps directly to the acceptance assertion
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bug exists; the original overwrites to `Array.from(affected)` = `{risk_B, report_B}`, dropping `risk_A`/`report_A`)
  - Document counterexamples found (e.g., "after challenge 2, `result.staleArtifactIds` is missing `prior \ cascade` = `{risk_A, report_A}`")
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.6_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Non-Buggy Inputs Behave Identically
  - **IMPORTANT**: Follow observation-first methodology — run the UNFIXED code first, record actual outputs, then assert those observed outputs
  - **Non-bug condition (¬C)**: inputs where `isBugCondition` returns false — first/single challenges (empty prior stale set), challenges whose cascade already covers the prior stale set (`prior ⊆ cascade`), supersede paths, and explicit resolve paths
  - Observe on UNFIXED code: with `staleArtifactIds = []` the result equals the cascade (3.1)
  - Observe on UNFIXED code: with `prior ⊆ cascade` (e.g. prior `{risk_A}`, cascade `{risk_A, report_A}`) the result equals the cascade
  - Observe on UNFIXED code: C-1 `pickNextCapabilities` re-includes `risk.analyze` and `report.write` after a challenge (3.2)
  - Observe on UNFIXED code: C-2 `goal.status` downgrades to `needs_refinement` only through `applyGoalConclusion` (3.3)
  - Observe on UNFIXED code: single challenge → reconverge → `clear` with no prior stale set (3.4)
  - Observe on UNFIXED code: the same graph nodes are marked `challenged` (3.6)
  - Observe on UNFIXED code: card-challenge (`targetArtifactId`) and node-click (`targetNodeId`) on the same id produce byte-identical serialized state (3.8)
  - Write property-based tests (fast-check) capturing observed behavior: for generated inputs where `isBugCondition` is false, `serialize(fixed(input)) === serialize(original(input))`
  - Add a monotonicity-over-sequences property: applying an arbitrary sequence of challenges never shrinks `staleArtifactIds`
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms the baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8_

- [x] 3. Fix for stale-set overwrite (union into the durable stale set)

  - [x] 3.1 Implement the fix in `invalidateForIntervention`
    - File: `client/src/lib/whybuddy-runtime.ts`, function `invalidateForIntervention`
    - Replace the overwrite on the main cascade return path with a deterministic, de-duplicated union of the prior stale set and the new cascade (prior ids first, then new cascade ids in iteration order) so the result is stable for P2 byte-identical comparisons:
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
    - Preserve prior stale on the decision-level early return path (it already spreads `...state` and never reassigns `staleArtifactIds`); add an explicit inline comment documenting the monotonic contract so preservation is intentional on both return paths. Do NOT introduce any shrink on this path
    - Keep the C-2 `conclusionArtifactStaled` check computing "freshly staled report" against the prior set: `affected.has(a.id) && !prevStale.has(a.id)` where `prevStale = new Set(state.staleArtifactIds)`; the downgrade continues to route through the single-writer `applyGoalConclusion`
    - Do NOT alter the `affected` cascade closure walk over `dependencyGraph` or the `newGraphNodes` `challenged` marking — only the assignment of `staleArtifactIds` changes
    - Do NOT touch supersede / explicit resolve exits (the only permitted ways the stale set shrinks)
    - _Bug_Condition: isBugCondition(input) = target IS DEFINED AND prior IS NON-EMPTY AND NOT isSubset(prior, cascade)_
    - _Expected_Behavior: result.staleArtifactIds = union(prior, cascade); result.staleArtifactIds ⊇ state.staleArtifactIds AND ⊇ cascade_
    - _Preservation: Preservation Requirements from design (3.1–3.8)_
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [x] 3.2 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Stale Set Is Monotonic Across Challenges
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior; when it passes it confirms the expected behavior is satisfied
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms the bug is fixed — prior stale ids are preserved across the later challenge)
    - Restore the strong V5.1 §2 S4 "两圈半断言" from its `it.fails` placeholder to a passing assertion
    - _Requirements: 2.1, 2.2, 2.3, 2.6_

  - [x] 3.3 Verify preservation tests still pass
    - **Property 2: Preservation** - Non-Buggy Inputs Behave Identically
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions for empty prior set, `prior ⊆ cascade`, supersede, explicit resolve, C-1/C-2 paths, single-loop convergence, graph node marking, and P2 card/node parity)
    - Confirm all tests still pass after fix (no regressions)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8_

- [x] 4. Checkpoint - Ensure all tests pass
  - Run the full relevant test suite (`whybuddy-runtime` unit + property tests, plus the V5.1 §2 S4 integration flow) and confirm everything is green
  - Confirm the only production file changed is `client/src/lib/whybuddy-runtime.ts`
  - Confirm the new TypeScript baseline error count is not increased (`node --run check`)
  - Ensure all tests pass, ask the user if questions arise

## Notes

- The only production file expected to change is `client/src/lib/whybuddy-runtime.ts` (plus tests).
- Findings #1/#2 from the same V5.1 suite (`findInputsForCapability` / `pickNextCapabilities`
  health predicate) are out of scope — handled in the separate `whybuddy-artifact-health-predicate` spec.
- The stale set may only shrink through the two permitted exits (supersede of a specific id,
  explicit resolve of a specific id); challenges only grow it.
- Tasks 1 and 2 are standalone and MUST be written and run on UNFIXED code before task 3.
