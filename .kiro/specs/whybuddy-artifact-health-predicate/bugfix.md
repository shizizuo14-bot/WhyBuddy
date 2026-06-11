# Bugfix Requirements Document

## Introduction

Three call sites in `client/src/lib/whybuddy-runtime.ts` decide whether a given
artifact "counts" — i.e. whether it is present / usable as an upstream for a
`(state, capability)` — using **inconsistent rules**. This inconsistency is the
single root cause behind two distinct failures observed in the V5.1 full-path
acceptance suite (`client/src/lib/whybuddy-runtime.fullpath-budget.test.ts`):

- **Finding #2 (suite S10, `it.fails`)** — the "C-1 untrusted half". After an
  untrusted-only commit (e.g. a forced-gate-fail risk/report), `pickNextCapabilities`
  still reads that kind as "present" and does **not** re-schedule it, so the next
  turn's picks drop `risk.analyze` / `counter.argue` / `report.write` even though
  the only artifacts of those kinds are untrusted.
- **Finding #1 (suite S4, `it.fails` "challenging an UPSTREAM risk")** — after
  challenging an upstream artifact (e.g. risk), `findInputsForCapability` grabs the
  leftover stale risk as a report input. The reconverged report's commit gate then
  rejects it (untrusted upstream), blocking trusted reconvergence after an upstream
  (non-report) challenge.

The three sites disagree as follows:

| Call site | Excludes stale? | Excludes untrusted? |
| --------- | --------------- | ------------------- |
| `pickNextCapabilities` kind-presence (`existingKinds`) | yes | **no** |
| `hasTrustedCommittedForCap` (used by GCOV / `evaluateCoverageGate`) | yes | yes (correct) |
| `findInputsForCapability` | **no** | **no** |

The fix is to unify these three sites on a single shared artifact-health
predicate — the same rule `hasTrustedCommittedForCap` already uses — so that ORCH
(pick), GCOV (gate), and input-resolution all agree on whether an artifact is
healthy. This closes both findings at once.

**Scope note / cross-dependency:** A separate spec
`whybuddy-stale-set-monotonic` (being fixed FIRST) changes stale-set accumulation
semantics. Because both touch the same reconvergence flow, this
predicate-unification spec should be implemented **after** the stale-set monotonic
fix. This spec's scope is limited to unifying the artifact-health predicate across
the three call sites. The only production file expected to change is
`client/src/lib/whybuddy-runtime.ts` (plus tests).

## Bug Analysis

### Current Behavior (Defect)

The three call sites apply inconsistent rules for whether an artifact counts as
present / usable, so an untrusted or stale artifact is treated as "present" or
"usable" by at least one site while another site correctly excludes it.

1.1 WHEN `pickNextCapabilities` builds `existingKinds` AND a kind's only artifact is untrusted (e.g. a forced-gate-fail risk/report) THEN the system reads that kind as "present" and does NOT re-schedule it (missing trustLevel half of the C-1 fix; suite S10 `it.fails`)

1.2 WHEN `findInputsForCapability` resolves inputs after an upstream artifact (e.g. risk) has been challenged AND a stale artifact of the needed kind remains THEN the system selects that stale artifact as an input, causing the reconverged report's commit gate to reject it as an untrusted upstream (suite S4 `it.fails` "challenging an UPSTREAM risk")

1.3 WHEN the same `(state, capability)` is judged by `pickNextCapabilities` kind-presence, `hasTrustedCommittedForCap`, and `findInputsForCapability` AND an artifact is untrusted or stale THEN the three sites DISAGREE about whether that artifact counts (at least one treats it as present/usable while another excludes it)

### Expected Behavior (Correct)

All three call sites share one artifact-health predicate so that an artifact
counts as present/usable only when it is healthy (trustLevel ∈ {gated_pass,
audited} AND not stale).

2.1 WHEN `pickNextCapabilities` builds kind-presence AND a kind's only artifact is untrusted (or stale) THEN the system SHALL treat that kind as ABSENT and re-schedule the capability (S10 picks re-include `risk.analyze` / `counter.argue` / `report.write`)

2.2 WHEN `findInputsForCapability` resolves inputs after an upstream artifact has been challenged THEN the system SHALL select only healthy upstreams, never a stale or untrusted artifact, so the reconverged report references a fresh trusted upstream (S4 produces a fresh trusted report)

2.3 WHEN the same `(state, capability)` is judged by `pickNextCapabilities` kind-presence, `hasTrustedCommittedForCap`, and `findInputsForCapability` THEN the system SHALL have all three sites AGREE on artifact health via one shared predicate `isHealthyArtifact(artifact, staleSet)` = trustLevel ∈ {gated_pass, audited} AND not in the stale set

### Unchanged Behavior (Regression Prevention)

The fix must only change how untrusted/stale artifacts are judged at the three
sites; all behavior for healthy artifacts and the already-landed fixes must be
preserved.

3.1 WHEN the already-landed C-1 stale-aware fix and C-2 single-writer fix are exercised THEN the system SHALL CONTINUE TO behave as before (stale kinds re-schedule; goal.status downgrade flows only through `applyGoalConclusion`)

3.2 WHEN a healthy artifact (trustLevel ∈ {gated_pass, audited} AND not stale) exists for a kind THEN the system SHALL CONTINUE TO treat that kind as present and make fresh/ordinary picks without duplicate scheduling

3.3 WHEN a report is committed with healthy (trusted, non-stale) upstreams THEN the system SHALL CONTINUE TO pass the GCOV / commit-gate write path unchanged

3.4 WHEN goal.status is written THEN the system SHALL CONTINUE TO have `applyGoalConclusion` as the sole writer of goal.status

3.5 WHEN the DERIVE path runs THEN the system SHALL CONTINUE TO satisfy P3 (derive is read-only over authoritative state fields)

3.6 WHEN a session converges THEN the system SHALL CONTINUE TO converge exactly once (single convergence, no duplicate convergence)

## Bug Condition (Methodology)

### Bug Condition Function — identifies inputs that trigger the bug

```pascal
FUNCTION isBugCondition(state, artifact)
  INPUT:  state    of type V5SessionState
          artifact of type Artifact   // some artifact in state.artifacts
  OUTPUT: boolean

  // Define the shared health rule (the one hasTrustedCommittedForCap already uses).
  LET staleSet = SET(state.staleArtifactIds)
  FUNCTION isHealthy(a) =
    (a.trustLevel = 'gated_pass' OR a.trustLevel = 'audited')
    AND a.id NOT IN staleSet

  // The three sites' present/usable verdicts for this artifact's kind/identity.
  LET pickPresent     = artifact.id NOT IN staleSet          // pickNextCapabilities: stale-only exclusion
  LET gatedHealthy    = isHealthy(artifact)                  // hasTrustedCommittedForCap: correct rule
  LET inputUsable     = TRUE                                 // findInputsForCapability: excludes neither

  // Bug fires when the three verdicts disagree for the same artifact —
  // i.e. an untrusted or stale artifact counts at one site but not another.
  RETURN NOT (pickPresent = gatedHealthy AND gatedHealthy = inputUsable)
END FUNCTION
```

Concretely, `isBugCondition` is true for an untrusted artifact (counts as present
in `pickNextCapabilities` and usable in `findInputsForCapability`, but excluded by
`hasTrustedCommittedForCap`) and for a stale artifact (still usable in
`findInputsForCapability` but excluded by the other two).

### Property — desired behavior for buggy inputs (Fix Checking)

```pascal
// Property: Fix Checking — unified artifact-health predicate
FOR ALL state, artifact WHERE isBugCondition(state, artifact) DO
  LET staleSet = SET(state.staleArtifactIds)
  LET healthy  = (artifact.trustLevel IN {gated_pass, audited}) AND (artifact.id NOT IN staleSet)

  // After the fix F', all three sites agree with isHealthyArtifact:
  ASSERT pickPresent'(state, artifact)  = healthy   // untrusted/stale kind reads as absent -> re-scheduled
  ASSERT gatedHealthy'(state, artifact) = healthy   // unchanged (already correct)
  ASSERT inputUsable'(state, artifact)  = healthy   // stale/untrusted never selected as input
END FOR
```

### Preservation — non-buggy inputs unchanged (Preservation Checking)

```pascal
// Property: Preservation Checking
FOR ALL state, artifact WHERE NOT isBugCondition(state, artifact) DO
  ASSERT F(state, artifact) = F'(state, artifact)
END FOR
// In particular: for healthy artifacts (already agreed across all three sites),
// pick / gate / input-resolution behavior is byte-for-byte unchanged.
```

**Key definitions:**
- **F** — the original (unfixed) runtime, where the three sites apply inconsistent rules.
- **F'** — the fixed runtime, where all three sites share `isHealthyArtifact(artifact, staleSet)`.

## Acceptance (Suite it.fails → passing)

The fix is accepted when the following currently-`it.fails` assertions in
`client/src/lib/whybuddy-runtime.fullpath-budget.test.ts` (and the S4 case in the
corresponding S4 suite) flip to passing:

- **S10 — "C-1 untrusted variant"**: the next picks re-include
  `risk.analyze` / `counter.argue` / `report.write` when the only artifacts of
  those kinds are untrusted-only.
- **S4 — "reconverging after challenging an UPSTREAM risk should produce a fresh
  trusted report"**: after an upstream (non-report) challenge, input resolution
  selects only healthy upstreams and the reconverged report commits as trusted.
