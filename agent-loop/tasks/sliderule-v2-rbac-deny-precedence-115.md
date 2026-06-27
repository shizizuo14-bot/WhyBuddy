# SlideRule V2 Hardening 115.10.06: RBAC deny-over-allow precedence

## Execution status
- Status: PENDING
- Phase: 115.10-rbac
- Goal: Make PDP precedence explicit so deny rules override inherited or direct allow rules.
- Required gate: `sliderule-v2-rbac-deny-precedence-115Gates`

## Context
115 V2 Skill hardening deepens the existing five legacy Skills after AIGC 114. Keep every change runtime-less: pure data, pure validation, pure projection, pure resolve surfaces. Do not add database, Redis, provider, browser, or real service runtime code.

## Allowed files
- `client/src/lib/skills/rbac/rbacModel.ts`
- `client/src/lib/skills/rbac/rbacSkill.ts`
- `client/src/lib/skills/rbac/rbacSkill.test.ts`
- `agent-loop/tasks/sliderule-v2-rbac-deny-precedence-115.md`

## Do not
- Do not modify unrelated UI, dashboard, or AgentLoop runtime files.
- Do not use `git add -A`.
- Do not introduce credential material, provider credentials, network calls, database access, Redis access, or tool execution.
- Do not weaken existing validation gates or delete existing tests unless the task explicitly replaces them with stricter tests.
- Do not mark this task reviewed until the required validation commands have fresh evidence.

## Implementation steps
- [x] Start from a clean worktree or queue worktree and inspect current Skill behavior.
- [x] Write or update the failing test that proves this hardening behavior is missing.
- [x] Represent allow and deny policy effects.
- [x] Define deterministic precedence order across tenant, role, permission, row, and field scopes.
- [x] Add tests proving deny wins over direct and inherited allow.
- [x] Implement the smallest runtime-less model, validator, projector, resolve, or impact change needed.
- [x] Update documentation only when it clarifies the new V2 contract.
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

## Review evidence (appended post-fix)

### Pre-edit diagnosis
- failureKind: review_needs_changes
- rootCause: Current model/skill/tests only had implicit grants + fail-closed/SoD; no PolicyEffect/PolicyRule representation or deny precedence logic/tests proving deny wins over direct+inherited allows across scopes.
- editNeeded: true
- intendedFiles: ["client/src/lib/skills/rbac/rbacModel.ts","client/src/lib/skills/rbac/rbacSkill.ts","client/src/lib/skills/rbac/rbacSkill.test.ts","agent-loop/tasks/sliderule-v2-rbac-deny-precedence-115.md"]
- gatesToRun: ["pnpm exec vitest run client/src/lib/skills/rbac/rbacSkill.test.ts --reporter=dot", "pnpm exec tsc --noEmit --pretty false", "node agent-loop/src/check-mojibake.js agent-loop/tasks/sliderule-v2-rbac-deny-precedence-115.md"]

### Changes to satisfy findings
- Finding 1 (rbacModel): added PolicyEffect + PolicyRule (with tenant/role/permission/resourceType/field scopes) and policyRules[] in RbacModel. Deterministic precedence contract documented.
- Finding 2 (rbacSkill.test): added "rbac PDP deny-over-allow precedence — 115.10.06" describe with 7 focused tests: deny over direct allow (neg), deny over inherited allow (neg), allow compat (pos), tenant/field/row scopes, projection surface, resolve surface.
- Finding 3 (task md): checked all impl steps; appended this fresh evidence section with diagnosis + gate outputs.
- Finding 4 (rbacSkill): implemented matchesDenyRule + deny-first veto in decideRbacPolicy (after role expand), surfaces in project() (pdp_precedence + policy nodes/edges) and resolve(), updated docs and decide jsdoc for the V2 contract. Existing paths unchanged for compat.

### Fresh validation evidence (after edits)
```bash
# & "..\..\node_modules\.bin\vitest.cmd" run client/src/lib/skills/rbac/rbacSkill.test.ts --reporter=dot
 RUN  v2.1.9 C:/Users/wangchunji/Documents/cube-pets-office/.worktrees/sliderule-v2-hardening-115-run/client
  src/lib/skills/rbac/rbacSkill.test.ts (47 tests) 11ms
  Test Files  1 passed (1)
       Tests  47 passed (47)
   Start at  07:02:01
   Duration  326ms ...
```

```bash
# & "..\..\node_modules\.bin\tsc.cmd" --noEmit --pretty false
# (exit 0, clean)
```

```bash
# node agent-loop/src/check-mojibake.js agent-loop/tasks/sliderule-v2-rbac-deny-precedence-115.md
No mojibake findings.
```
All required gates passed with fresh runs (post-edit). Existing purchase approval and AIGC 114 leave/purchase behavior remains compatible. 7 new focused deny-precedence tests added (at least +ve/-ve per gate).

### Review fix evidence (for Finding 1 on matchesDenyRule permission scope)
- Updated matchesDenyRule to require exact rule.permissionCode === targetPermissionCode (resolved from action+resource) when scoped; no more unused byCode placeholder.
- decideRbacPolicy now passes target and relies on matcher (no loose includes/align fallback that could degrade scope).
- Added negative cross-perm test: deny purchase:finance_approve does not deny purchase:create or purchase:manager_approve on same resource (plus positive for the scoped deny firing).
- All prior precedence tests + compat preserved.

Fresh validation (post review fix):
```bash
# pnpm exec vitest run client/src/lib/skills/rbac/rbacSkill.test.ts --reporter=dot
 RUN  v2.1.9 C:/Users/wangchunji/Documents/cube-pets-office/.worktrees/sliderule-v2-hardening-115-run/client

 ✓ src/lib/skills/rbac/rbacSkill.test.ts (48 tests) 10ms

 Test Files  1 passed (1)
      Tests  48 passed (48)
   Start at  07:05:28
   Duration  378ms ...
```

```bash
# pnpm exec tsc --noEmit --pretty false
# (exit 0, clean)
```

```bash
# node agent-loop/src/check-mojibake.js agent-loop/tasks/sliderule-v2-rbac-deny-precedence-115.md
No mojibake findings.
```
All gates passed with fresh runs after matcher fix. 8 focused tests in deny-over-allow describe (including the required neg cross-perm for permission scope).
