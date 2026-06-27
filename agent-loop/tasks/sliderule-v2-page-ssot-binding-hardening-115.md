# SlideRule V2 Hardening 115.40.01: Page SSOT binding hardening

## Execution status
- Status: PENDING
- Phase: 115.40-page
- Goal: Make page bindings consistently point to DataModel SSOT entity and field refs.
- Required gate: `sliderule-v2-page-ssot-binding-hardening-115Gates`

## Context
115 V2 Skill hardening deepens the existing five legacy Skills after AIGC 114. Keep every change runtime-less: pure data, pure validation, pure projection, pure resolve surfaces. Do not add database, Redis, provider, browser, or real service runtime code.

## Allowed files
- `client/src/lib/skills/page/pageModel.ts`
- `client/src/lib/skills/page/pageSkill.ts`
- `client/src/lib/skills/page/pageSkill.test.ts`
- `agent-loop/tasks/sliderule-v2-page-ssot-binding-hardening-115.md`

## Do not
- Do not modify unrelated UI, dashboard, or AgentLoop runtime files.
- Do not use `git add -A`.
- Do not introduce credential material, provider credentials, network calls, database access, Redis access, or tool execution.
- Do not weaken existing validation gates or delete existing tests unless the task explicitly replaces them with stricter tests.
- Do not mark this task reviewed until the required validation commands have fresh evidence.

## Implementation steps
- [ ] Start from a clean worktree or queue worktree and inspect current Skill behavior.
- [ ] Write or update the failing test that proves this hardening behavior is missing.
- [ ] Represent page, component, and field bindings as SSOT refs.
- [ ] Validate bindings against DataModel external surfaces.
- [ ] Keep page local rendering metadata separate from field identity.
- [ ] Implement the smallest runtime-less model, validator, projector, resolve, or impact change needed.
- [ ] Update documentation only when it clarifies the new V2 contract.
- [ ] Append review evidence after validation passes.

## Required validation
- `pnpm exec vitest run client/src/lib/skills/page/pageSkill.test.ts client/src/lib/skills/datamodel/dataModelSkill.test.ts --reporter=dot`
- `pnpm exec tsc --noEmit --pretty false`
- `node agent-loop/src/check-mojibake.js {{taskFile}}`

## Acceptance criteria
- The task advances the V2 sample diagram semantics for its phase.
- New behavior has focused tests with at least one positive case and one negative case when a gate is involved.
- Existing purchase approval and AIGC 114 behavior remains compatible.
- Validation commands have fresh passing evidence recorded in this task file.

## Fresh validation evidence (post-review fix, 2026-06-27)
Addresses review:
- Finding 1 (pageSkill.ts): BindingSchema now rejects entity/field prefix mismatch and binding entity != PageModel.entity. Added `PAGE_BINDING_FIELD_ENTITY_MISMATCH` and `PAGE_BINDING_ENTITY_MISMATCH` errors in validate. Added focused negative mismatch test case (positive covered by existing coherent page + PEP tests).
- Finding 2 (this file): Appended fresh evidence below per acceptance.

All changes limited to allowed files. No tests deleted/weakened. No runtime code.

### Required validation commands (fresh runs)

#### 1. vitest
```
=== VITEST RUN 2026-06-27 09:12:00 ===

 RUN  v2.1.9 C:/Users/wangchunji/Documents/cube-pets-office/.worktrees/sliderule-v2-hardening-115-run/client

  ✓ src/lib/skills/datamodel/dataModelSkill.test.ts (56 tests) 12ms
  ✓ src/lib/skills/page/pageSkill.test.ts (20 tests) 6ms

 Test Files  2 passed (2)
      Tests  76 passed (76)
   Start at  09:12:01
   Duration  342ms (transform 102ms, setup 0ms, collect 154ms, tests 18ms, environment 0ms, prepare 136ms)
```
Exit: 0

#### 2. tsc
```
=== TSC RUN 2026-06-27 09:12:01 ===
```
Exit: 0 (noEmit clean)

#### 3. mojibake
```
=== MOJIBAKE 2026-06-27 09:12:04 ===
No mojibake findings.
```
Exit: 0

Evidence recorded per "Validation commands have fresh passing evidence recorded in this task file."
