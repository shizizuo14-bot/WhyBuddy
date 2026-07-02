# SlideRule V2 Runtime 117: Page workflow task view projection

## Execution status
- Status: PENDING
- Phase: 117.04-page-runtime
- Goal: Project a workflow instance state into an actionable task page view.
- Required runtime symbols: `projectWorkflowTaskView`, `PAGE_WORKFLOW_TASK_VIEW_INVALID`, `taskActions`

## Context
117 is the runtime-closure wave. The previous 113/114/115 queues mostly hardened static Skill contracts. This task must add pure executable runtime helpers and focused tests. Runtime here means deterministic in-memory functions only: no DB, no Redis, no browser, no network, no provider calls, and no secrets.

## Allowed files
- `client/src/lib/skills/page/pageSkill.ts`
- `client/src/lib/skills/page/pageModel.ts`
- `client/src/lib/skills/page/pageSkill.test.ts`
- `client/src/lib/skills/workflow/workflowSkill.ts`
- `agent-loop/tasks/sliderule-v2-page-workflow-task-view-117.md`

## Do not
- Do not weaken existing tests or gates.
- Do not use `git add -A`.
- Do not add credentials, provider calls, network calls, DB, Redis, timers, or browser dependencies.
- Do not make fail-closed paths permissive.
- Do not modify unrelated UI or backend files.

## Required implementation
- [ ] Add pure exported `projectWorkflowTaskView(pageModel, workflowInstance, ctx)`.
- [ ] Return task fields, action buttons, disabled reasons, and evidence links for the current workflow node.
- [ ] Invalid page/workflow binding returns `PAGE_WORKFLOW_TASK_VIEW_INVALID`.

## Required tests
- [ ] Add focused tests before or alongside implementation.
- [ ] Include at least one positive runtime case and one negative/fail-closed case.
- [ ] Preserve existing purchase approval and leave approval compatibility when relevant.

## Required validation
- `pnpm exec vitest run client/src/lib/skills/page/pageSkill.test.ts client/src/lib/skills/workflow/workflowSkill.test.ts --reporter=dot`
- `pnpm exec tsc --noEmit --pretty false`
- `node agent-loop/src/check-mojibake.js client/src/lib/skills/page/pageSkill.ts client/src/lib/skills/page/pageModel.ts client/src/lib/skills/page/pageSkill.test.ts client/src/lib/skills/workflow/workflowSkill.ts agent-loop/tasks/sliderule-v2-page-workflow-task-view-117.md`

## Acceptance criteria
- Workflow current node maps to a task view.
- Available actions reflect workflow state.
- Permission and DataModel evidence are preserved.
- The task produces reviewable runtime behavior, not just field existence or documentation.
- Validation commands have fresh passing evidence in the AgentLoop final report.
