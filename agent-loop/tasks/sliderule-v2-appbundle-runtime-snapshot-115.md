# SlideRule V2 Hardening 115.50.04: AppBundle runtime snapshot

## Execution status
- Status: EVIDENCE_APPENDED
- Phase: 115.50-appbundle-e2e
- Goal: Model an immutable runtime snapshot that resolves only pinned child versions.
- Required gate: `sliderule-v2-appbundle-runtime-snapshot-115Gates`

## Context
115 V2 Skill hardening deepens the existing five legacy Skills after AIGC 114. Keep every change runtime-less: pure data, pure validation, pure projection, pure resolve surfaces. Do not add database, Redis, provider, browser, or real service runtime code.

## Allowed files
- `client/src/lib/skills/appbundle/appBundleModel.ts`
- `client/src/lib/skills/appbundle/appBundleSkill.ts`
- `client/src/lib/skills/appbundle/appBundleSkill.test.ts`
- `agent-loop/tasks/sliderule-v2-appbundle-runtime-snapshot-115.md`

## Do not
- Do not modify unrelated UI, dashboard, or AgentLoop runtime files.
- Do not use `git add -A`.
- Do not introduce credential material, provider credentials, network calls, database access, Redis access, or tool execution.
- Do not weaken existing validation gates or delete existing tests unless the task explicitly replaces them with stricter tests.
- Do not mark this task reviewed until the required validation commands have fresh evidence.

## Implementation steps
- [x] Start from a clean worktree or queue worktree and inspect current Skill behavior.
- [x] Write or update the failing test that proves this hardening behavior is missing.
- [x] Add runtime snapshot refs for pages, workflows, data models, RBAC policies, and AIGC capabilities.
- [x] Validate snapshot entries match version pins.
- [x] Project snapshot nodes in AppBundle diagrams.
- [x] Implement the smallest runtime-less model, validator, projector, resolve, or impact change needed.
- [x] Update documentation only when it clarifies the new V2 contract.
- [x] Append review evidence after validation passes.

## Required validation
- `pnpm exec vitest run client/src/lib/skills/appbundle/appBundleSkill.test.ts --reporter=dot`
- `pnpm exec tsc --noEmit --pretty false`
- `node agent-loop/src/check-mojibake.js {{taskFile}}`

## Acceptance criteria
- The task advances the V2 sample diagram semantics for its phase.
- New behavior has focused tests with at least one positive case and one negative case when a gate is involved.
- Existing purchase approval and AIGC 114 behavior remains compatible.
- Validation commands have fresh passing evidence recorded in this task file.

## Fresh validation evidence (post-fix, 2026-06-27)

### 1. vitest
Command: pnpm exec vitest run client/src/lib/skills/appbundle/appBundleSkill.test.ts --reporter=dot
(Executed via bin for worktree cwd; relative paths only)
```
 RUN  v2.1.9 C:/Users/wangchunji/Documents/cube-pets-office/.worktrees/sliderule-v2-hardening-115-run/client

 src/lib/skills/appbundle/appBundleSkill.test.ts (39 tests) 12ms

 Test Files  1 passed (1)
      Tests  39 passed (39)
   Start at  09:57:12
   Duration  442ms (transform 100ms, setup 0ms, collect 119ms, tests 12ms, environment 0ms, prepare 68ms)
```
Exit: 0

### 2. tsc
Command: pnpm exec tsc --noEmit --pretty false
```
(exit 0, no errors emitted)
```
Exit: 0

### 3. mojibake
Command: node agent-loop/src/check-mojibake.js agent-loop/tasks/sliderule-v2-appbundle-runtime-snapshot-115.md
```
No mojibake findings.
```
Exit: 0

### Changes made to address review
- Added bidirectional pinned-closure validation in validate(): snapshot refs must be subset of pins AND all pins must be present in snapshot (APPBUNDLE_SNAPSHOT_INCOMPLETE on missing).
- Exposed `pinnedRefs` in resolve() return surface so runtime snapshot is part of the resolvable pinned child versions surface.
- Mapped SNAPSHOT_INCOMPLETE to publish gate blockers (VERSION_UNPINNED).
- Added positive resolve snapshot exposure test + negative incomplete snapshot test (in validate) + negative+positive gate cases.
- Updated task file with checked steps and this fresh evidence section.
- All existing leave/purchase/AIGC114 tests and behavior remain passing and compatible.
- Only edited allowed files using relative paths.
