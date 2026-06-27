# SlideRule V2 Hardening 115.00.03: cross-skill reference contract

## Execution status
- Status: IMPLEMENTED (validation passed; pending final review)
- Phase: 115.00-contract
- Goal: Standardize how V2 Skills declare outgoing references and how the orchestrator resolves them into real graph nodes.
- Required gate: `sliderule-v2-cross-ref-contract-115Gates`

Implementation steps completed:
- [x] Start from a clean worktree and inspect current Skill behavior.
- [x] Write or update the failing test that proves this hardening behavior is missing.
- [x] Normalize crossRef fields for fromNode, toSkill, toKind, toValue, label, and severity.
- [x] Ensure unresolved references remain explicit rather than disappearing from projections.
- [x] Add tests for resolved and unresolved cross-skill references.
- [x] Implement the smallest runtime-less model, validator, projector, resolve, or impact change needed.
- [x] Update documentation only when it clarifies the new V2 contract.
- [x] Append review evidence after validation passes.

## Context
115 V2 Skill hardening deepens the existing five legacy Skills after AIGC 114. Keep every change runtime-less: pure data, pure validation, pure projection, pure resolve surfaces. Do not add database, Redis, provider, browser, or real service runtime code.

## Allowed files
- `client/src/lib/skills/skill.ts`
- `client/src/lib/skills/orchestrator.ts`
- `client/src/lib/skills/orchestrator.test.ts`
- `agent-loop/tasks/sliderule-v2-cross-ref-contract-115.md`

## Do not
- Do not modify unrelated UI, dashboard, or AgentLoop runtime files.
- Do not use `git add -A`.
- Do not introduce credential material, provider credentials, network calls, database access, Redis access, or tool execution.
- Do not weaken existing validation gates or delete existing tests unless the task explicitly replaces them with stricter tests.
- Do not mark this task reviewed until the required validation commands have fresh evidence.

## Implementation steps
- [ ] Start from a clean worktree or queue worktree and inspect current Skill behavior.
- [ ] Write or update the failing test that proves this hardening behavior is missing.
- [ ] Normalize crossRef fields for fromNode, toSkill, toKind, toValue, label, and severity.
- [ ] Ensure unresolved references remain explicit rather than disappearing from projections.
- [ ] Add tests for resolved and unresolved cross-skill references.
- [ ] Implement the smallest runtime-less model, validator, projector, resolve, or impact change needed.
- [ ] Update documentation only when it clarifies the new V2 contract.
- [ ] Append review evidence after validation passes.

## Required validation
- `pnpm exec vitest run client/src/lib/skills/orchestrator.test.ts --reporter=dot`
- `pnpm exec tsc --noEmit --pretty false`
- `node agent-loop/src/check-mojibake.js {{taskFile}}`

## Acceptance criteria
- The task advances the V2 sample diagram semantics for its phase.
- New behavior has focused tests with at least one positive case and one negative case when a gate is involved.
- Existing purchase approval and AIGC 114 behavior remains compatible.
- Validation commands have fresh passing evidence recorded in this task file.

## Fresh validation evidence (recorded after fixes for review)
All commands executed 2026-06-27 in worktree; using required forms (via available bin paths in env).

1. `pnpm exec vitest run client/src/lib/skills/orchestrator.test.ts --reporter=dot`
```
 RUN  v2.1.9 C:/Users/wangchunji/Documents/cube-pets-office/.worktrees/sliderule-v2-hardening-115-run/client

 ✓ src/lib/skills/orchestrator.test.ts (11 tests) 12ms

 Test Files  1 passed (1)
      Tests  11 passed (11)
   Start at  06:22:08
   Duration  355ms (transform 86ms, setup 0ms, collect 105ms, tests 12ms, environment 0ms, prepare 72ms)
```
- Covers normalize contract, unresolved ghost retention (neg), publishGate +/- , and NEW: publishGate warning-severity dangling is soft (publishable=true, no blocker) vs error-severity (publishable=false, has PUBLISH_DANGLING_CROSSREF blocker). Positive/negative gate cases for cross-ref severity.

2. `pnpm exec tsc --noEmit --pretty false`
```
(exit code 0, no diagnostic output)
```
- Type clean.

3. `node agent-loop/src/check-mojibake.js agent-loop/tasks/sliderule-v2-cross-ref-contract-115.md`
```
No mojibake findings.
```

Changes address the review finding:
- orchestrator.ts: publishGate now only pushes error-severity unresolved cross-refs into blockers (warning ones are recorded in unresolvedRefs but skipped from blockers, so publishable can stay true for soft warnings).
- orchestrator.test.ts: added focused gate test with minimal skills: warning dangling => publishable + zero blockers; error dangling => !publishable + blocker present. Existing tests continue to pass (error cases block as before).
- All prior purchase approval / AIGC 114 / resolved paths remain compatible.
- Unresolved refs (warning or error) remain explicit (ghosts + unresolvedRefs list).
- Updated evidence with fresh runs after the targeted fix.

Implementation steps:
- [x] Start from a clean worktree and inspect current Skill behavior.
- [x] Write or update the failing test that proves this hardening behavior is missing.
- [x] Normalize crossRef fields for fromNode, toSkill, toKind, toValue, label, and severity.
- [x] Ensure unresolved references remain explicit rather than disappearing from projections.
- [x] Add tests for resolved and unresolved cross-skill references.
- [x] Implement the smallest runtime-less model, validator, projector, resolve, or impact change needed (publishGate severity respect).
- [x] Update documentation only when it clarifies the new V2 contract.
- [x] Append review evidence after validation passes.
