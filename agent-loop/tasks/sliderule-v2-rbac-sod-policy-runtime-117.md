# SlideRule V2 Runtime 117: RBAC runtime SoD policy enforcement

## Execution status
- Status: PENDING
- Phase: 117.01-rbac-runtime
- Goal: Make SoD rules block runtime actions, not only model validation.
- Required runtime symbols: `evaluateRbacSodPolicy`, `RBAC_RUNTIME_SOD_DENIED`, `selfApproval`

## Context
117 is the runtime-closure wave. The previous 113/114/115 queues mostly hardened static Skill contracts. This task must add pure executable runtime helpers and focused tests. Runtime here means deterministic in-memory functions only: no DB, no Redis, no browser, no network, no provider calls, and no secrets.

## Allowed files
- `client/src/lib/skills/rbac/rbacSkill.ts`
- `client/src/lib/skills/rbac/rbacModel.ts`
- `client/src/lib/skills/rbac/rbacSkill.test.ts`
- `agent-loop/tasks/sliderule-v2-rbac-sod-policy-runtime-117.md`

## Do not
- Do not weaken existing tests or gates.
- Do not use `git add -A`.
- Do not add credentials, provider calls, network calls, DB, Redis, timers, or browser dependencies.
- Do not make fail-closed paths permissive.
- Do not modify unrelated UI or backend files.

## Required implementation
- [ ] Add pure exported `evaluateRbacSodPolicy(model, request)` that detects direct mutually-exclusive roles and contextual conflicts such as self approval.
- [ ] Integrate SoD evaluation into the runtime PDP decision path so it can deny before allow.
- [ ] Return stable evidence with the matched SoD rule id and `RBAC_RUNTIME_SOD_DENIED` reason code.

## Required tests
- [ ] Add focused tests before or alongside implementation.
- [ ] Include at least one positive runtime case and one negative/fail-closed case.
- [ ] Preserve existing purchase approval and leave approval compatibility when relevant.

## Required validation
- `pnpm exec vitest run client/src/lib/skills/rbac/rbacSkill.test.ts --reporter=dot`
- `pnpm exec tsc --noEmit --pretty false`
- `node agent-loop/src/check-mojibake.js client/src/lib/skills/rbac/rbacSkill.ts client/src/lib/skills/rbac/rbacModel.ts client/src/lib/skills/rbac/rbacSkill.test.ts agent-loop/tasks/sliderule-v2-rbac-sod-policy-runtime-117.md`

## Acceptance criteria
- Self approval or mutually exclusive runtime roles are denied.
- SoD denial wins over permission allow.
- Existing static SoD validation remains compatible.
- The task produces reviewable runtime behavior, not just field existence or documentation.
- Validation commands have fresh passing evidence in the AgentLoop final report.
