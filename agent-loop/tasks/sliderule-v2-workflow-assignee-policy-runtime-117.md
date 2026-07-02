# SlideRule V2 Runtime 117: Workflow assignee policy runtime

## Execution status
- Status: PENDING
- Phase: 117.03-workflow-runtime
- Goal: Resolve workflow assignees through RBAC PDP surfaces instead of local role assumptions.
- Required runtime symbols: `resolveWorkflowAssignees`, `WF_ASSIGNEE_PDP_DENIED`, `policyEvidence`

## Context
117 is the runtime-closure wave. The previous 113/114/115 queues mostly hardened static Skill contracts. This task must add pure executable runtime helpers and focused tests. Runtime here means deterministic in-memory functions only: no DB, no Redis, no browser, no network, no provider calls, and no secrets.

## Allowed files
- `client/src/lib/skills/workflow/workflowSkill.ts`
- `client/src/lib/skills/workflow/workflowModel.ts`
- `client/src/lib/skills/workflow/workflowSkill.test.ts`
- `client/src/lib/skills/rbac/rbacSkill.ts`
- `agent-loop/tasks/sliderule-v2-workflow-assignee-policy-runtime-117.md`

## Do not
- Do not weaken existing tests or gates.
- Do not use `git add -A`.
- Do not add credentials, provider calls, network calls, DB, Redis, timers, or browser dependencies.
- Do not make fail-closed paths permissive.
- Do not modify unrelated UI or backend files.

## Required implementation
- [ ] Add pure exported `resolveWorkflowAssignees(model, nodeId, ctx)`.
- [ ] The helper must consume RBAC decision evidence or decision surface from `ctx.external.rbac` rather than deciding locally.
- [ ] Denied/missing assignee policy returns `WF_ASSIGNEE_PDP_DENIED`.

## Required tests
- [ ] Add focused tests before or alongside implementation.
- [ ] Include at least one positive runtime case and one negative/fail-closed case.
- [ ] Preserve existing purchase approval and leave approval compatibility when relevant.

## Required validation
- `pnpm exec vitest run client/src/lib/skills/workflow/workflowSkill.test.ts client/src/lib/skills/rbac/rbacSkill.test.ts --reporter=dot`
- `pnpm exec tsc --noEmit --pretty false`
- `node agent-loop/src/check-mojibake.js client/src/lib/skills/workflow/workflowSkill.ts client/src/lib/skills/workflow/workflowModel.ts client/src/lib/skills/workflow/workflowSkill.test.ts client/src/lib/skills/rbac/rbacSkill.ts agent-loop/tasks/sliderule-v2-workflow-assignee-policy-runtime-117.md`

## Acceptance criteria
- Assignee resolution depends on RBAC evidence.
- Missing PDP evidence fails closed.
- Existing Workflow validation remains green.
- The task produces reviewable runtime behavior, not just field existence or documentation.
- Validation commands have fresh passing evidence in the AgentLoop final report.
