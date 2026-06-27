# SlideRule V2 Hardening 115.10.02: RBAC role inheritance gate

## Execution status
- Status: PENDING
- Phase: 115.10-rbac
- Goal: Validate inherited role graphs so missing parents and inheritance cycles are blocked.
- Required gate: `sliderule-v2-rbac-role-inheritance-gate-115Gates`

## Context
115 V2 Skill hardening deepens the existing five legacy Skills after AIGC 114. Keep every change runtime-less: pure data, pure validation, pure projection, pure resolve surfaces. Do not add database, Redis, provider, browser, or real service runtime code.

## Allowed files
- `client/src/lib/skills/rbac/rbacSkill.ts`
- `client/src/lib/skills/rbac/rbacSkill.test.ts`
- `agent-loop/tasks/sliderule-v2-rbac-role-inheritance-gate-115.md`

## Do not
- Do not modify unrelated UI, dashboard, or AgentLoop runtime files.
- Do not use `git add -A`.
- Do not introduce credential material, provider credentials, network calls, database access, Redis access, or tool execution.
- Do not weaken existing validation gates or delete existing tests unless the task explicitly replaces them with stricter tests.
- Do not mark this task reviewed until the required validation commands have fresh evidence.

## Implementation steps
- [ ] Start from a clean worktree or queue worktree and inspect current Skill behavior.
- [ ] Write or update the failing test that proves this hardening behavior is missing.
- [ ] Add errors for missing parent role refs.
- [ ] Add errors for role inheritance cycles.
- [ ] Prove inherited permissions resolve deterministically after validation.
- [ ] Implement the smallest runtime-less model, validator, projector, resolve, or impact change needed.
- [ ] Update documentation only when it clarifies the new V2 contract.
- [ ] Append review evidence after validation passes.

## Required validation
- `pnpm exec vitest run client/src/lib/skills/rbac/rbacSkill.test.ts --reporter=dot`
- `pnpm exec tsc --noEmit --pretty false`
- `node agent-loop/src/check-mojibake.js {{taskFile}}`

## Acceptance criteria
- The task advances the V2 sample diagram semantics for its phase.
- New behavior has focused tests with at least one positive case and one negative case when a gate is involved.
- Existing purchase approval and AIGC 114 behavior remains compatible.
- Validation commands have fresh passing evidence recorded in this task file.

## Fresh validation evidence (post-review fix)

### Required: pnpm exec vitest run client/src/lib/skills/rbac/rbacSkill.test.ts --reporter=dot
```
 RUN  v2.1.9 C:/Users/wangchunji/Documents/cube-pets-office/.worktrees/sliderule-v2-hardening-115-run/client

 ✓ src/lib/skills/rbac/rbacSkill.test.ts (26 tests) 7ms

 Test Files  1 passed (1)
      Tests  26 passed (26)
   Start at  06:37:19
   Duration  328ms (transform 45ms, setup 0ms, collect 49ms, tests 7ms, environment 0ms, prepare 53ms)
```

### Required: pnpm exec tsc --noEmit --pretty false
```
(exit code 0, no errors)
```

### Required: node agent-loop/src/check-mojibake.js agent-loop/tasks/sliderule-v2-rbac-role-inheritance-gate-115.md
```
No mojibake findings.
```

- Focused regression test added for missing parent in `inheritsRoleIds` (RBAC_REF_MISSING_ROLE on inherits path).
- All existing tests (purchase, leave, AIGC114 compat, cycles, SoD, inheritance resolve) remain passing.
- Gate evidence fresh after the minimal targeted edit.
