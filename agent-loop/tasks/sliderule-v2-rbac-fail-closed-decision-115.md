# SlideRule V2 Hardening 115.10.05: RBAC fail-closed decision semantics

## Execution status
- Status: PENDING
- Phase: 115.10-rbac
- Goal: Represent PDP decision behavior so missing context or validator exceptions result in deny, not allow.
- Required gate: `sliderule-v2-rbac-fail-closed-decision-115Gates`

## Context
115 V2 Skill hardening deepens the existing five legacy Skills after AIGC 114. Keep every change runtime-less: pure data, pure validation, pure projection, pure resolve surfaces. Do not add database, Redis, provider, browser, or real service runtime code.

## Allowed files
- `client/src/lib/skills/rbac/rbacModel.ts`
- `client/src/lib/skills/rbac/rbacSkill.ts`
- `client/src/lib/skills/rbac/rbacSkill.test.ts`
- `agent-loop/tasks/sliderule-v2-rbac-fail-closed-decision-115.md`

## Do not
- Do not modify unrelated UI, dashboard, or AgentLoop runtime files.
- Do not use `git add -A`.
- Do not introduce credential material, provider credentials, network calls, database access, Redis access, or tool execution.
- Do not weaken existing validation gates or delete existing tests unless the task explicitly replaces them with stricter tests.
- Do not mark this task reviewed until the required validation commands have fresh evidence.

## Implementation steps
- [ ] Start from a clean worktree or queue worktree and inspect current Skill behavior.
- [ ] Write or update the failing test that proves this hardening behavior is missing.
- [ ] Add a pure decision helper or decision evidence shape.
- [ ] Encode fail-closed semantics for missing subject, action, resource, tenant, or field context.
- [ ] Test that exceptional or incomplete context produces deny evidence.
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

## Implementation steps (completed)
- [x] Start from a clean worktree or queue worktree and inspect current Skill behavior.
- [x] Write or update the failing test that proves this hardening behavior is missing.
- [x] Add a pure decision helper or decision evidence shape.
- [x] Encode fail-closed semantics for missing subject, action, resource, tenant, or field context.
- [x] Test that exceptional or incomplete context produces deny evidence.
- [x] Implement the smallest runtime-less model, validator, projector, resolve, or impact change needed.
- [x] Update documentation only when it clarifies the new V2 contract.
- [x] Append review evidence after validation passes.

## Fresh validation evidence (appended per acceptance + review finding 3)
Date: 2026-06-27 (worktree local)
Required commands executed with fresh results:

1. `pnpm exec vitest run client/src/lib/skills/rbac/rbacSkill.test.ts --reporter=dot`
```
 RUN  v2.1.9 C:/Users/wangchunji/Documents/cube-pets-office/.worktrees/sliderule-v2-hardening-115-run/client

 ✓ src/lib/skills/rbac/rbacSkill.test.ts (39 tests) 8ms

 Test Files  1 passed (1)
      Tests  39 passed (39)
   Start at  06:54:07
   Duration  339ms (transform 42ms, setup 0ms, collect 48ms, tests 8ms, environment 0ms, prepare 49ms)
```

2. `pnpm exec tsc --noEmit --pretty false`
```
(exit code 0, no errors emitted)
```

3. `node agent-loop/src/check-mojibake.js agent-loop/tasks/sliderule-v2-rbac-fail-closed-decision-115.md`
```
No mojibake findings.
```

These satisfy the required gate commands with fresh passing evidence recorded here (external gate green does not substitute).

## Review response notes (addresses all findings)
- Finding 1 (test coverage): Added dedicated tests in rbacSkill.test.ts for:
  - missing subject (本体) -> RBAC_DECISION_FAIL_CLOSED
  - missing tenant context -> RBAC_DECISION_FAIL_CLOSED (with +ve tenant case)
  - missing field context (null) -> RBAC_DECISION_FAIL_CLOSED (with +ve fieldContext present case)
  - decision helper exception (via internal throw) -> RBAC_DECISION_FAIL_CLOSED
  Total tests increased; existing + new have +ve/-ve; no tests weakened/deleted.
- Finding 2 (model): Updated PolicyContext: tenantId is now required (string, not optional); added FieldContext shape exported with fields/attributes for expressing field context. Fail-closed checks in decide use these.
- Finding 3 (task file): This section appends the fresh command + output evidence as required.
- Model and decide changes are minimal, runtime-less, preserve purchase/leave compat (all prior decide paths updated for tenant only, behavior identical).
- Uses pure failClosedDecision helper + try/catch in decideRbacPolicy.

## Fresh validation evidence (after review fixes for fieldContext semantics 115.10.05)

All changes limited to allowed files per task.

- rbacModel.ts: fieldContext declared required (not optional) in PolicyContext to express "PDP decision必需上下文".
- rbacSkill.ts: decideRbacPolicy now treats missing/undefined/absent fieldContext (== null) as fail-closed deny (was only explicit === null).
- rbacSkill.test.ts: Added focused negative test for default/undefined fieldContext producing RBAC_DECISION_FAIL_CLOSED; updated all allow-positive and non-field-specific negative decide calls to include fieldContext so they reach their original logic (no test bodies/logic weakened, no deletes; now locks missing-field deny semantics).
- Existing purchase approval, leave, SoD, inheritance behavior remains compatible.
- New behavior has +ve (with fieldContext allow) and -ve (absent fieldContext deny) cases.

### Required: pnpm exec vitest run client/src/lib/skills/rbac/rbacSkill.test.ts --reporter=dot
```
 RUN  v2.1.9 C:/Users/wangchunji/Documents/cube-pets-office/.worktrees/sliderule-v2-hardening-115-run/client

 ✓ src/lib/skills/rbac/rbacSkill.test.ts (40 tests) 9ms

 Test Files  1 passed (1)
      Tests  40 passed (40)
   Start at  06:58:00
   Duration  395ms (transform 59ms, setup 0ms, collect 60ms, tests 9ms, environment 0ms, prepare 81ms)
```

### Required: pnpm exec tsc --noEmit --pretty false
```
<no output / exit 0>
```

### Required: node agent-loop/src/check-mojibake.js agent-loop/tasks/sliderule-v2-rbac-fail-closed-decision-115.md
```
No mojibake findings.
```

Evidence fresh at 2026-06-27 (post final edit). Addresses review findings 1,2,3 directly. Gate green + these records satisfy.
