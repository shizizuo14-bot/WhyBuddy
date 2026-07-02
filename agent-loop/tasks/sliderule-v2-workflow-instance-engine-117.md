# SlideRule V2 Runtime 117: Workflow pure instance engine

## Execution status
- Status: PENDING
- Phase: 117.03-workflow-runtime
- Goal: Add a pure workflow instance state machine for start/transition/approve/reject/timeout.
- Required runtime symbols: `startWorkflowInstance`, `transitionWorkflowInstance`, `WF_RUNTIME_INVALID_TRANSITION`

## Context
117 is the runtime-closure wave. The previous 113/114/115 queues mostly hardened static Skill contracts. This task must add pure executable runtime helpers and focused tests. Runtime here means deterministic in-memory functions only: no DB, no Redis, no browser, no network, no provider calls, and no secrets.

## Allowed files
- `client/src/lib/skills/workflow/workflowSkill.ts`
- `client/src/lib/skills/workflow/workflowModel.ts`
- `client/src/lib/skills/workflow/workflowSkill.test.ts`
- `agent-loop/tasks/sliderule-v2-workflow-instance-engine-117.md`

## Do not
- Do not weaken existing tests or gates.
- Do not use `git add -A`.
- Do not add credentials, provider calls, network calls, DB, Redis, timers, or browser dependencies.
- Do not make fail-closed paths permissive.
- Do not modify unrelated UI or backend files.

## Required implementation
- [ ] Add pure exported `startWorkflowInstance(model, input)` that creates a snapshot-backed instance state.
- [ ] Add pure exported `transitionWorkflowInstance(model, instance, command)` supporting approve/reject/submit/timeout transitions.
- [ ] Invalid transitions must return findings with `WF_RUNTIME_INVALID_TRANSITION` and leave the instance unchanged.

## Required tests
- [ ] Add focused tests before or alongside implementation.
- [ ] Include at least one positive runtime case and one negative/fail-closed case.
- [ ] Preserve existing purchase approval and leave approval compatibility when relevant.

## Required validation
- `pnpm exec vitest run client/src/lib/skills/workflow/workflowSkill.test.ts --reporter=dot`
- `pnpm exec tsc --noEmit --pretty false`
- `node agent-loop/src/check-mojibake.js client/src/lib/skills/workflow/workflowSkill.ts client/src/lib/skills/workflow/workflowModel.ts client/src/lib/skills/workflow/workflowSkill.test.ts agent-loop/tasks/sliderule-v2-workflow-instance-engine-117.md`

## Acceptance criteria
- A purchase approval fixture can advance through at least two nodes.
- Invalid transition is rejected.
- Snapshot version is frozen at start.
- The task produces reviewable runtime behavior, not just field existence or documentation.
- Validation commands have fresh passing evidence in the AgentLoop final report.
