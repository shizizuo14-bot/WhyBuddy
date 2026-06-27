# SlideRule V2 Hardening 115.10.01: RBAC role inheritance model

## Execution status
- Status: IN_PROGRESS (review fixes applied)
- Phase: 115.10-rbac
- Goal: Add explicit role inheritance to the RBAC metamodel while keeping RBAC as the PDP host.
- Required gate: `sliderule-v2-rbac-role-inheritance-model-115Gates`

## Context
115 V2 Skill hardening deepens the existing five legacy Skills after AIGC 114. Keep every change runtime-less: pure data, pure validation, pure projection, pure resolve surfaces. Do not add database, Redis, provider, browser, or real service runtime code.

## Allowed files
- `client/src/lib/skills/rbac/rbacModel.ts`
- `client/src/lib/skills/rbac/rbacSkill.ts`
- `client/src/lib/skills/rbac/rbacSkill.test.ts`
- `agent-loop/tasks/sliderule-v2-rbac-role-inheritance-model-115.md`

## Do not
- Do not modify unrelated UI, dashboard, or AgentLoop runtime files.
- Do not use `git add -A`.
- Do not introduce credential material, provider credentials, network calls, database access, Redis access, or tool execution.
- Do not weaken existing validation gates or delete existing tests unless the task explicitly replaces them with stricter tests.
- Do not mark this task reviewed until the required validation commands have fresh evidence.

## Implementation steps
- [x] Start from a clean worktree or queue worktree and inspect current Skill behavior.
- [x] Write or update the failing test that proves this hardening behavior is missing.
- [x] Represent parent role refs on roles without flattening source data.
- [x] Expose inherited permissions only through deterministic helper logic.
- [x] Add purchase fixture coverage for admin or finance inheriting lower-level permissions.
- [x] Implement the smallest runtime-less model, validator, projector, resolve, or impact change needed.
- [ ] Update documentation only when it clarifies the new V2 contract.
- [x] Append review evidence after validation passes.

## Required validation
- `pnpm exec vitest run client/src/lib/skills/rbac/rbacSkill.test.ts --reporter=dot`
- `pnpm exec tsc --noEmit --pretty false`
- `node agent-loop/src/check-mojibake.js {{taskFile}}`

## Acceptance criteria
- The task advances the V2 sample diagram semantics for its phase.
- New behavior has focused tests with at least one positive case and one negative case when a gate is involved.
- Existing purchase approval and AIGC 114 behavior remains compatible.
- Validation commands have fresh passing evidence recorded in this task file.

## Post-fix validation evidence (fresh, 2026-06-27)
### 1. vitest (rbacSkill.test.ts specific)
```
 RUN  v2.1.9 C:/Users/wangchunji/Documents/cube-pets-office/.worktrees/sliderule-v2-hardening-115-run/client

 ✓ src/lib/skills/rbac/rbacSkill.test.ts (25 tests) 7ms

 Test Files  1 passed (1)
      Tests  25 passed (25)
   Start at  06:33:41
   Duration  349ms (transform 47ms, setup 0ms, collect 51ms, tests 7ms, environment 0ms, prepare 66ms)
```

### 2. tsc --noEmit
```
(exit 0, no output)
```

### 3. mojibake
```
No mojibake findings.
```

## Review findings addressed
- Finding 1: Added explicit d3 assertion in decide test that manager (after inheriting, with direct create stripped) is allowed for `create` purely via inherited perm; also checks matchedPermission and expanded.
- Finding 2: Added dedicated test `decideRbacPolicy allows finance to create purchase via inheriting requester` with negative (base fixture no-inherit -> deny) + positive (inherit -> allow create, matched, expanded contains requester).
- Finding 3: Updated task status and appended this fresh validation evidence section.
