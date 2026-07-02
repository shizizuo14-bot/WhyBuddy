# SlideRule V2 Runtime 117: Workflow form binding runtime

## Execution status
- Status: PENDING
- Phase: 117.03-workflow-runtime
- Goal: Bind workflow task forms to DataModel fields and RBAC field permissions.
- Required runtime symbols: `buildWorkflowFormRuntime`, `WF_FORM_FIELD_PDP_DENIED`, `frozenFormFieldRefs`

## Context
117 is the runtime-closure wave. The previous 113/114/115 queues mostly hardened static Skill contracts. This task must add pure executable runtime helpers and focused tests. Runtime here means deterministic in-memory functions only: no DB, no Redis, no browser, no network, no provider calls, and no secrets.

## Allowed files
- `client/src/lib/skills/workflow/workflowSkill.ts`
- `client/src/lib/skills/workflow/workflowModel.ts`
- `client/src/lib/skills/workflow/workflowSkill.test.ts`
- `agent-loop/tasks/sliderule-v2-workflow-form-binding-runtime-117.md`

## Do not
- Do not weaken existing tests or gates.
- Do not use `git add -A`.
- Do not add credentials, provider calls, network calls, DB, Redis, timers, or browser dependencies.
- Do not make fail-closed paths permissive.
- Do not modify unrelated UI or backend files.

## Required implementation
- [ ] Add pure exported `buildWorkflowFormRuntime(model, instance, ctx)`.
- [ ] It must return field refs for the current workflow node, lifecycle metadata from DataModel, and field permission state from RBAC evidence.
- [ ] Removed DataModel fields and RBAC-denied fields must produce stable findings.

## Required tests
- [ ] Add focused tests before or alongside implementation.
- [ ] Include at least one positive runtime case and one negative/fail-closed case.
- [ ] Preserve existing purchase approval and leave approval compatibility when relevant.

## Required validation
- `pnpm exec vitest run client/src/lib/skills/workflow/workflowSkill.test.ts client/src/lib/skills/datamodel/dataModelSkill.test.ts --reporter=dot`
- `pnpm exec tsc --noEmit --pretty false`
- `node agent-loop/src/check-mojibake.js client/src/lib/skills/workflow/workflowSkill.ts client/src/lib/skills/workflow/workflowModel.ts client/src/lib/skills/workflow/workflowSkill.test.ts agent-loop/tasks/sliderule-v2-workflow-form-binding-runtime-117.md`

## Acceptance criteria
- Task form fields are derived from DataModel refs.
- RBAC denied fields are not editable.
- Snapshot frozen form refs are honored.
- The task produces reviewable runtime behavior, not just field existence or documentation.
- Validation commands have fresh passing evidence in the AgentLoop final report.
