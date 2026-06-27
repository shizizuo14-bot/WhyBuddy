# SlideRule V2 Hardening 115.10.03: RBAC SoD policy model

## Execution status
- Status: PENDING
- Phase: 115.10-rbac
- Goal: Model separation-of-duty policies for self-grant, mutually exclusive permissions, and dual-control checks.
- Required gate: `sliderule-v2-rbac-sod-policy-model-115Gates`

## Context
115 V2 Skill hardening deepens the existing five legacy Skills after AIGC 114. Keep every change runtime-less: pure data, pure validation, pure projection, pure resolve surfaces. Do not add database, Redis, provider, browser, or real service runtime code.

## Allowed files
- `client/src/lib/skills/rbac/rbacModel.ts`
- `client/src/lib/skills/rbac/rbacSkill.ts`
- `client/src/lib/skills/rbac/rbacSkill.test.ts`
- `agent-loop/tasks/sliderule-v2-rbac-sod-policy-model-115.md`

## Do not
- Do not modify unrelated UI, dashboard, or AgentLoop runtime files.
- Do not use `git add -A`.
- Do not introduce credential material, provider credentials, network calls, database access, Redis access, or tool execution.
- Do not weaken existing validation gates or delete existing tests unless the task explicitly replaces them with stricter tests.
- Do not mark this task reviewed until the required validation commands have fresh evidence.

## Implementation steps
- [ ] Start from a clean worktree or queue worktree and inspect current Skill behavior.
- [ ] Write or update the failing test that proves this hardening behavior is missing.
- [ ] Add SoD policy records to the RBAC model.
- [ ] Represent self-grant denial and mutually exclusive permission sets.
- [ ] Add fixture examples tied to purchase approval finance/admin roles.
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

## Fresh validation evidence (recorded after review fixes for 115.10.03)

All changes limited to allowed files. Extended PolicyContext with approverCount/approverUserIds; implemented dual-control minApprovers + distinct approver check inside decideRbacPolicy (after self-grant); added dual ref + minApprovers validation in validate; added 3 focused dual-control decision +/- cases (denies low count/dupe; allows distinct>=2) + preserved/adjusted non-self case for compatibility. Self-grant denial + prior behavior untouched.

### Required: pnpm exec vitest run client/src/lib/skills/rbac/rbacSkill.test.ts --reporter=dot
```
 RUN  v2.1.9 C:/Users/wangchunji/Documents/cube-pets-office/.worktrees/sliderule-v2-hardening-115-run/client

 ✓ src/lib/skills/rbac/rbacSkill.test.ts (33 tests) 8ms

 Test Files  1 passed (1)
      Tests  33 passed (33)
   Start at  06:43:11
   Duration  329ms (transform 45ms, setup 0ms, collect 50ms, tests 8ms, environment 0ms, prepare 53ms)
```

### Required: pnpm exec tsc --noEmit --pretty false
```
<no output / exit 0>
```

### Required: node agent-loop/src/check-mojibake.js agent-loop/tasks/sliderule-v2-rbac-sod-policy-model-115.md
```
No mojibake findings.
```

Evidence fresh at 2026-06-27. Dual-control checks now enforceable on pure decision surface; review findings addressed (Finding 1/2).
