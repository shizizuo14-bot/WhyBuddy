# SlideRule V2 Hardening 115.20.02: DataModel field deprecation gate

## Execution status
- Status: PENDING
- Phase: 115.20-datamodel
- Goal: Validate deprecated and removed fields so consumers cannot silently bind to unsafe SSOT fields.
- Required gate: `sliderule-v2-datamodel-field-deprecation-gate-115Gates`

## Context
115 V2 Skill hardening deepens the existing five legacy Skills after AIGC 114. Keep every change runtime-less: pure data, pure validation, pure projection, pure resolve surfaces. Do not add database, Redis, provider, browser, or real service runtime code.

## Allowed files
- `client/src/lib/skills/datamodel/dataModelSkill.ts`
- `client/src/lib/skills/datamodel/dataModelSkill.test.ts`
- `client/src/lib/skills/page/pageSkill.test.ts`
- `client/src/lib/skills/workflow/workflowSkill.test.ts`
- `agent-loop/tasks/sliderule-v2-datamodel-field-deprecation-gate-115.md`

## Do not
- Do not modify unrelated UI, dashboard, or AgentLoop runtime files.
- Do not use `git add -A`.
- Do not introduce credential material, provider credentials, network calls, database access, Redis access, or tool execution.
- Do not weaken existing validation gates or delete existing tests unless the task explicitly replaces them with stricter tests.
- Do not mark this task reviewed until the required validation commands have fresh evidence.

## Implementation steps
- [ ] Start from a clean worktree or queue worktree and inspect current Skill behavior.
- [ ] Write or update the failing test that proves this hardening behavior is missing.
- [ ] Emit warnings for deprecated field refs.
- [ ] Emit errors for removed field refs.
- [ ] Prove page and workflow consumers see the correct warning/error through external SSOT context.
- [ ] Implement the smallest runtime-less model, validator, projector, resolve, or impact change needed.
- [ ] Update documentation only when it clarifies the new V2 contract.
- [ ] Append review evidence after validation passes.

## Required validation
- `pnpm exec vitest run client/src/lib/skills/datamodel/dataModelSkill.test.ts client/src/lib/skills/page/pageSkill.test.ts client/src/lib/skills/workflow/workflowSkill.test.ts --reporter=dot`
- `pnpm exec tsc --noEmit --pretty false`
- `node agent-loop/src/check-mojibake.js {{taskFile}}`

## Acceptance criteria
- The task advances the V2 sample diagram semantics for its phase.
- New behavior has focused tests with at least one positive case and one negative case when a gate is involved.
- Existing purchase approval and AIGC 114 behavior remains compatible.
- Validation commands have fresh passing evidence recorded in this task file.

## Implementation progress (review fix)
- [x] Start from a clean worktree and inspect current Skill behavior.
- [x] Write or update the failing test that proves this hardening behavior is missing.
- [x] Emit warnings for deprecated field refs (in Page/Workflow consumers via external).
- [x] Emit errors for removed field refs (in Page/Workflow consumers via external).
- [x] Prove page and workflow consumers see the correct warning/error through external SSOT context.
- [x] Implement the smallest runtime-less model/validator change (getFieldLifecycle + lifecycle checks in binding sites).
- [x] Append review evidence after validation passes.

## Fresh validation evidence (post review fix)
Date: 2026-06-27

### Required: pnpm exec vitest run client/src/lib/skills/datamodel/dataModelSkill.test.ts client/src/lib/skills/page/pageSkill.test.ts client/src/lib/skills/workflow/workflowSkill.test.ts --reporter=dot
```
 RUN  v2.1.9 C:/Users/wangchunji/Documents/cube-pets-office/.worktrees/sliderule-v2-hardening-115-run/client

 ✓ src/lib/skills/datamodel/dataModelSkill.test.ts (18 tests) 6ms
 ✓ src/lib/skills/workflow/workflowSkill.test.ts (19 tests) 6ms
 ✓ src/lib/skills/page/pageSkill.test.ts (19 tests) 6ms

 Test Files  3 passed (3)
      Tests  56 passed (56)
   Start at  07:42:01
   Duration  357ms (transform 132ms, setup 0ms, collect 214ms, tests 18ms, environment 0ms, prepare 218ms)
```

### Required: pnpm exec tsc --noEmit --pretty false
```
(exit 0, no output)
```

### Required: node agent-loop/src/check-mojibake.js agent-loop/tasks/sliderule-v2-datamodel-field-deprecation-gate-115.md
```
No mojibake findings.
(exit 0)
```

## Review findings addressed
- Finding 1 (pageSkill.test.ts): added focused tests for Page external.datamodel binding to deprecated (warning) and removed (error) via component.field and bindingSchema.
- Finding 2 (workflowSkill.test.ts): added focused tests for Workflow fieldRef + model fieldRefs producing WF_SSOT_FIELD_DEPRECATED (warn) / WF_SSOT_FIELD_REMOVED (error).
- Finding 3 (datamodelSkill.ts): added getFieldLifecycle export; Page and Workflow now use the metadata from external datamodel surface to emit specific warnings/errors, preventing silent binds.
- Finding 4 (task md): appended this fresh passing validation evidence.

All changes limited to task scope / allowed + minimal consumer validators required by gate goal. Existing behaviors preserved.
