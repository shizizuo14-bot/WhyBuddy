# SlideRule V2 Hardening 115.40.03: Page component visibility gate

## Execution status
- Status: PENDING
- Phase: 115.40-page
- Goal: Validate page, region, component, and field visibility rules before publish.
- Required gate: `sliderule-v2-page-component-visibility-gate-115Gates`

## Context
115 V2 Skill hardening deepens the existing five legacy Skills after AIGC 114. Keep every change runtime-less: pure data, pure validation, pure projection, pure resolve surfaces. Do not add database, Redis, provider, browser, or real service runtime code.

## Allowed files
- `client/src/lib/skills/page/pageSkill.ts`
- `client/src/lib/skills/page/pageSkill.test.ts`
- `agent-loop/tasks/sliderule-v2-page-component-visibility-gate-115.md`

## Do not
- Do not modify unrelated UI, dashboard, or AgentLoop runtime files.
- Do not use `git add -A`.
- Do not introduce credential material, provider credentials, network calls, database access, Redis access, or tool execution.
- Do not weaken existing validation gates or delete existing tests unless the task explicitly replaces them with stricter tests.
- Do not mark this task reviewed until the required validation commands have fresh evidence.

## Implementation steps
- [x] Start from a clean worktree or queue worktree and inspect current Skill behavior.
- [x] Write or update the failing test that proves this hardening behavior is missing.
- [x] Error on visibility refs to missing components or missing PDP refs.
- [x] Validate field-level visibility such as amount visible only to finance/admin.
- [x] Project visibility edges in page diagrams.
- [x] Implement the smallest runtime-less model, validator, projector, resolve, or impact change needed.
- [x] Update documentation only when it clarifies the new V2 contract.
- [x] Append review evidence after validation passes.

## Required validation
- `pnpm exec vitest run client/src/lib/skills/page/pageSkill.test.ts --reporter=dot`
- `pnpm exec tsc --noEmit --pretty false`
- `node agent-loop/src/check-mojibake.js {{taskFile}}`

## Acceptance criteria
- The task advances the V2 sample diagram semantics for its phase.
- New behavior has focused tests with at least one positive case and one negative case when a gate is involved.
- Existing purchase approval and AIGC 114 behavior remains compatible.
- Validation commands have fresh passing evidence recorded in this task file.

## Execution status update
- Status: COMPLETED (gate passed previously; review findings addressed with field visibility gate + focused tests + evidence)
- Changes limited to allowed files only.

## Fresh validation evidence (2026-06-27)
All commands executed after edits; outputs are fresh.

### 1. vitest (required)
Command: pnpm exec vitest run client/src/lib/skills/page/pageSkill.test.ts --reporter=dot
(Executed via bin for env: & "C:\Users\wangchunji\Documents\cube-pets-office\node_modules\.bin\vitest.cmd" run ...)
Result:
```
 RUN  v2.1.9 C:/Users/wangchunji/Documents/cube-pets-office/.worktrees/sliderule-v2-hardening-115-run/client

 ✓ src/lib/skills/page/pageSkill.test.ts (23 tests) 7ms

 Test Files  1 passed (1)
      Tests  23 passed (23)
   Start at  09:18:55
   Duration  376ms (transform 73ms, setup 0ms, collect 82ms, tests 7ms, environment 0ms, prepare 76ms)
```
- 2 new focused tests added for field visibility gate (positive subset match, negative exposure violation).
- All tests (incl. compat with purchase/leave/AIGC114 behavior) pass.

### 2. tsc (required)
Command: pnpm exec tsc --noEmit --pretty false
(Executed via: & "C:\Users\wangchunji\Documents\cube-pets-office\node_modules\.bin\tsc.cmd" --noEmit --pretty false)
Result: exit 0 (no output, clean).

### 3. mojibake (required)
Command: node agent-loop/src/check-mojibake.js agent-loop/tasks/sliderule-v2-page-component-visibility-gate-115.md
Result:
```
No mojibake findings.
```
exit 0.

## Summary of fixes for review findings
- Finding 1: Added focused positive/negative tests in pageSkill.test.ts for field-level visibility (amount pdpVisibleTo finance/admin case).
- Finding 2: In pageSkill.ts validate, added PAGE_FIELD_VISIBILITY_VIOLATION constraint using DataModel pdpVisibleTo for bound fields/components; also project visibility edges (kind: "visibility").
- Finding 3: This task file now records fresh passing evidence from required commands.
- purchase fixture updated to use correct amount visibility (finance) so generate produces valid gate-passing model.
- No existing tests deleted/weakened; no scope creep.
