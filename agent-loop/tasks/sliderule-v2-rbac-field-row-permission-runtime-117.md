# SlideRule V2 Runtime 117: RBAC row and field runtime permission checks

## Execution status
- Status: PENDING
- Phase: 117.01-rbac-runtime
- Goal: Make row-level and field-level policy refs executable through the RBAC PDP surface.
- Required runtime symbols: `evaluateRbacFieldAccess`, `evaluateRbacRowAccess`, `RBAC_FIELD_ACCESS_DENIED`

## Context
117 is the runtime-closure wave. The previous 113/114/115 queues mostly hardened static Skill contracts. This task must add pure executable runtime helpers and focused tests. Runtime here means deterministic in-memory functions only: no DB, no Redis, no browser, no network, no provider calls, and no secrets.

## Allowed files
- `client/src/lib/skills/rbac/rbacSkill.ts`
- `client/src/lib/skills/rbac/rbacModel.ts`
- `client/src/lib/skills/rbac/rbacSkill.test.ts`
- `agent-loop/tasks/sliderule-v2-rbac-field-row-permission-runtime-117.md`

## Do not
- Do not weaken existing tests or gates.
- Do not use `git add -A`.
- Do not add credentials, provider calls, network calls, DB, Redis, timers, or browser dependencies.
- Do not make fail-closed paths permissive.
- Do not modify unrelated UI or backend files.

## Required implementation
- [ ] Add pure exported helpers `evaluateRbacRowAccess` and `evaluateRbacFieldAccess`.
- [ ] Both helpers must call the PDP decision path instead of duplicating local authorization logic.
- [ ] Field access must support hidden/read/readonly/editable outcomes, but denied access must be fail-closed.
- [ ] When DataModel provides a sensitive field policyRef, the helper must preserve the policy id in the decision evidence.

## Required tests
- [ ] Add focused tests before or alongside implementation.
- [ ] Include at least one positive runtime case and one negative/fail-closed case.
- [ ] Preserve existing purchase approval and leave approval compatibility when relevant.

## Required validation
- `pnpm exec vitest run client/src/lib/skills/rbac/rbacSkill.test.ts --reporter=dot`
- `pnpm exec tsc --noEmit --pretty false`
- `node agent-loop/src/check-mojibake.js client/src/lib/skills/rbac/rbacSkill.ts client/src/lib/skills/rbac/rbacModel.ts client/src/lib/skills/rbac/rbacSkill.test.ts agent-loop/tasks/sliderule-v2-rbac-field-row-permission-runtime-117.md`

## Acceptance criteria
- Row and field access are executable.
- Sensitive field denial is visible by stable code.
- No database/session dependency is introduced.
- The task produces reviewable runtime behavior, not just field existence or documentation.
- Validation commands have fresh passing evidence in the AgentLoop final report.
