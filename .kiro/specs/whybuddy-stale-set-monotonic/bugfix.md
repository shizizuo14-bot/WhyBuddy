# Bugfix Requirements Document

## Introduction

This bugfix targets finding #3 from the WhyBuddy V5.1 full-path acceptance suite
(`docs/V5.1-full-path-test-plan.md` §2 S4 "两圈半断言"): the session's stale set is
**not durable across challenges**.

In `client/src/lib/whybuddy-runtime.ts`, `invalidateForIntervention` computes the
freshly-affected dependency cascade for the challenged artifact and then **replaces**
the session's stale set via `nextState.staleArtifactIds = Array.from(affected)`. Because
the assignment overwrites rather than unions with the prior `state.staleArtifactIds`, a
second (and any subsequent) challenge silently **un-stales** artifacts that an earlier
challenge had staled — those artifacts resurface as "healthy", trusted artifacts.

The observable impact in the acceptance suite is that the strong S4 assertion
("stale 集合不污染新健康集 / a prior-staled artifact stays stale across a later challenge")
had to be **weakened** to "the 3rd loop still reaches clear", precisely because the loop-1
report un-stales when the loop-2 report is challenged. The intended invariant (V5.1 plan
§2 S4) is that the stale set is **monotonic** across challenges: it never shrinks except
through an explicit, well-defined exit (supersede or explicit resolve).

### Bug condition (methodology summary)

- **C(X)** — Bug Condition: a challenge is applied to a session whose `staleArtifactIds`
  is already non-empty, and the freshly-computed cascade does not cover every previously
  stale id. Formally: `state.staleArtifactIds` ⊄ `cascade(targetId)`.
- **P(result)** — Property (Fix Checking): after the fix `F'`, the resulting
  `staleArtifactIds` SHALL be the **union** of the prior stale set and the new cascade —
  `result.staleArtifactIds ⊇ state.staleArtifactIds`.
- **¬C(X)** — Non-buggy inputs to preserve: first/single challenges (prior stale set empty),
  challenges whose cascade already covers the prior stale set, supersede paths, and explicit
  resolve paths.
- **F** — the original `invalidateForIntervention` (overwrites the stale set).
- **F'** — the fixed `invalidateForIntervention` (unions into the stale set on both return paths).

> **Scope / cross-dependency note:** This spec is **only** about stale-set accumulation
> semantics in `invalidateForIntervention`. Findings #1/#2 documented in the same suite
> (`findInputsForCapability` / `pickNextCapabilities` not excluding stale + untrusted
> upstreams) are handled in a **separate spec** (`whybuddy-artifact-health-predicate`).
> The only production file expected to change here is
> `client/src/lib/whybuddy-runtime.ts`, plus tests.

## Bug Analysis

### Current Behavior (Defect)

When a challenge is applied, `invalidateForIntervention` overwrites the session's stale set
with only the newly-affected cascade, discarding any artifacts that earlier challenges had
already staled.

1.1 WHEN a challenge is applied to a session whose `staleArtifactIds` already contains ids
that are NOT part of the new challenge's cascade THEN the system overwrites
`staleArtifactIds` with only the new cascade (`Array.from(affected)`), dropping the
previously-stale ids.

1.2 WHEN a prior-staled artifact's id is dropped by a later challenge THEN the system
resurfaces that artifact as a "healthy", trusted artifact (it is no longer in
`staleArtifactIds`), even though no supersede or explicit resolve occurred.

1.3 WHEN two or more challenges occur in sequence (e.g. the S4 "两圈半" loop: challenge
loop-1 report, reconverge, then challenge loop-2 report) THEN the loop-1 report un-stales
on the second challenge, forcing the strong acceptance assertion to be weakened to only
"the 3rd loop still reaches clear".

1.4 WHEN the main cascade return path executes THEN it assigns
`staleArtifactIds = Array.from(affected)` without unioning the prior `state.staleArtifactIds`.

### Expected Behavior (Correct)

The stale set is monotonic: a challenge unions its new cascade into the existing stale set
and never shrinks it, except through a supersede or explicit resolve path.

2.1 WHEN a challenge is applied to a session whose `staleArtifactIds` already contains ids
that are NOT part of the new challenge's cascade THEN the system SHALL set
`staleArtifactIds` to the **union** of the prior `state.staleArtifactIds` and the new
cascade, preserving all previously-stale ids.

2.2 WHEN a prior-staled artifact has neither been superseded nor explicitly resolved THEN
the system SHALL keep that artifact's id in `staleArtifactIds` across any number of
subsequent unrelated challenges (it SHALL NOT resurface as healthy).

2.3 WHEN the S4 "两圈半" sequence runs (challenge loop-1 report → reconverge → challenge
loop-2 report) THEN the loop-1 report's id SHALL remain in `staleArtifactIds` after the
later challenge, so the strong acceptance assertion can be restored from `it.fails` to a
passing assertion.

2.4 WHEN a fresh, trusted artifact of the same lineage/kind supersedes a staled artifact
THEN the system SHALL remove ONLY the superseded id from `staleArtifactIds` (the supersede
path is a permitted exit from the stale set).

2.5 WHEN an explicit resolve path is taken for a staled artifact THEN the system SHALL
remove that id from `staleArtifactIds` (the explicit resolve path is a permitted exit).

2.6 WHEN either return path of `invalidateForIntervention` executes (the decision-level
early return AND the main cascade return) THEN the system SHALL preserve the prior stale ids
on both paths.

### Unchanged Behavior (Regression Prevention)

The following behaviors are out of scope for this fix and MUST continue to work exactly as
they do today.

3.1 WHEN a session receives its first or only challenge (prior `staleArtifactIds` is empty)
THEN the system SHALL CONTINUE TO produce the same stale set it produces today (the union
with an empty prior set is identical to the current cascade result).

3.2 WHEN the C-1 fix path runs (stale-aware `pickNextCapabilities` re-including
`risk.analyze` and `report.write` after a challenge) THEN the system SHALL CONTINUE TO
behave as it does today.

3.3 WHEN the C-2 fix path runs (single-writer `goal.status` downgrade to `needs_refinement`
on a conclusion-affecting challenge through `applyGoalConclusion`) THEN the system SHALL
CONTINUE TO behave as it does today, and `applyGoalConclusion` SHALL CONTINUE TO be the only
writer of `goal.status`.

3.4 WHEN a single convergence loop runs (challenge → reconverge → clear, with no prior
stale set) THEN the system SHALL CONTINUE TO reach `clear`.

3.5 WHEN an artifact commits through the GCOV-pass write path THEN the system SHALL
CONTINUE TO commit it unchanged.

3.6 WHEN graph nodes are marked `challenged` during a cascade THEN the system SHALL
CONTINUE TO mark the same nodes as it does today (node-status marking is unchanged).

3.7 WHEN the DERIVE P3 read-only projection runs THEN the system SHALL CONTINUE TO behave
as it does today (DERIVE remains read-only over authoritative fields).

3.8 WHEN a card-challenge (`targetArtifactId`) and a node-click (`targetNodeId`) target the
same id THEN the system SHALL CONTINUE TO produce byte-identical serialized state (P2
deep-equal), now with monotonic stale-set semantics applied identically on both paths.
