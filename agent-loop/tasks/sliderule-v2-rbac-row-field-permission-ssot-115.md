# SlideRule V2 Hardening 115.10.07: RBAC row and field permission SSOT refs

## Execution status
- Status: PENDING
- Phase: 115.10-rbac
- Goal: Harden RBAC row and field policies so every field reference delegates identity to DataModel SSOT.
- Required gate: `sliderule-v2-rbac-row-field-permission-ssot-115Gates`

## Context
115 V2 Skill hardening deepens the existing five legacy Skills after AIGC 114. Keep every change runtime-less: pure data, pure validation, pure projection, pure resolve surfaces. Do not add database, Redis, provider, browser, or real service runtime code.

## Allowed files
- `client/src/lib/skills/rbac/rbacModel.ts`
- `client/src/lib/skills/rbac/rbacSkill.ts`
- `client/src/lib/skills/rbac/rbacSkill.test.ts`
- `client/src/lib/skills/datamodel/dataModelSkill.test.ts`
- `agent-loop/tasks/sliderule-v2-rbac-row-field-permission-ssot-115.md`

## Do not
- Do not modify unrelated UI, dashboard, or AgentLoop runtime files.
- Do not use `git add -A`.
- Do not introduce credential material, provider credentials, network calls, database access, Redis access, or tool execution.
- Do not weaken existing validation gates or delete existing tests unless the task explicitly replaces them with stricter tests.
- Do not mark this task reviewed until the required validation commands have fresh evidence.

## Implementation steps
- [ ] Start from a clean worktree or queue worktree and inspect current Skill behavior.
- [ ] Write or update the failing test that proves this hardening behavior is missing.
- [ ] Represent row and field policy refs with entity and field ids.
- [ ] Validate refs against DataModel resolve surfaces when available.
- [ ] Warn when the SSOT surface is not connected and error when it is connected but missing.
- [ ] Implement the smallest runtime-less model, validator, projector, resolve, or impact change needed.
- [ ] Update documentation only when it clarifies the new V2 contract.
- [ ] Append review evidence after validation passes.

## Required validation
- `pnpm exec vitest run client/src/lib/skills/rbac/rbacSkill.test.ts client/src/lib/skills/datamodel/dataModelSkill.test.ts --reporter=dot`
- `pnpm exec tsc --noEmit --pretty false`
- `node agent-loop/src/check-mojibake.js {{taskFile}}`

## Acceptance criteria
- The task advances the V2 sample diagram semantics for its phase.
- New behavior has focused tests with at least one positive case and one negative case when a gate is involved.
- Existing purchase approval and AIGC 114 behavior remains compatible.
- Validation commands have fresh passing evidence recorded in this task file.

## Validation evidence (appended after fixes per 115.10.07 review)

### pnpm exec vitest run client/src/lib/skills/rbac/rbacSkill.test.ts client/src/lib/skills/datamodel/dataModelSkill.test.ts --reporter=dot
```
 RUN  v2.1.9 C:/Users/wangchunji/Documents/cube-pets-office/.worktrees/sliderule-v2-hardening-115-run/client

 ✓ src/lib/skills/datamodel/dataModelSkill.test.ts (15 tests) 6ms
 ✓ src/lib/skills/rbac/rbacSkill.test.ts (54 tests) 10ms

 Test Files  2 passed (2)
      Tests  69 passed (69)
   Start at  07:09:59
   Duration  315ms (transform 89ms, setup 0ms, collect 120ms, tests 16ms, environment 0ms, prepare 138ms)
VITEST_EXIT=0
```

### pnpm exec tsc --noEmit --pretty false
```
TSC_EXIT=0
```

### node agent-loop/src/check-mojibake.js agent-loop/tasks/sliderule-v2-rbac-row-field-permission-ssot-115.md
```
No mojibake findings.
MOJI_EXIT=0
```

- 5 new focused 115.10.07 tests added (row +ve, row -ve, fieldRef +ve, unresolved warn, fieldRef -ve, plus fields surface compat).
- PolicyRule now models row via resourceType (entity id), field via fieldRef (entity.field SSOT id).
- validate + crossRefs now cover policy row/field against datamodel.entity / .field surfaces with warn (no surface) + error (missing).
- Existing 115.10.06 field deny test updated to fieldRef; all legacy paths + purchase/leave remain compatible.
- All required gates fresh pass.
