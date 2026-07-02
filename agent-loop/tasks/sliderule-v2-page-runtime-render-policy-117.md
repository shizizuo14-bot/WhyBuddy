# SlideRule V2 Runtime 117: Page runtime render policy

## Execution status
- Status: PENDING
- Phase: 117.04-page-runtime
- Goal: Make Page components renderable as visible/read-only/hidden/disabled through RBAC and DataModel evidence.
- Required runtime symbols: `renderPageRuntimePolicy`, `PAGE_RUNTIME_COMPONENT_HIDDEN`, `PermissionRender`

## Context
117 is the runtime-closure wave. The previous 113/114/115 queues mostly hardened static Skill contracts. This task must add pure executable runtime helpers and focused tests. Runtime here means deterministic in-memory functions only: no DB, no Redis, no browser, no network, no provider calls, and no secrets.

## Allowed files
- `client/src/lib/skills/page/pageSkill.ts`
- `client/src/lib/skills/page/pageModel.ts`
- `client/src/lib/skills/page/pageSkill.test.ts`
- `agent-loop/tasks/sliderule-v2-page-runtime-render-policy-117.md`

## Do not
- Do not weaken existing tests or gates.
- Do not use `git add -A`.
- Do not add credentials, provider calls, network calls, DB, Redis, timers, or browser dependencies.
- Do not make fail-closed paths permissive.
- Do not modify unrelated UI or backend files.

## Required implementation
- [ ] Add pure exported `renderPageRuntimePolicy(model, ctx)`.
- [ ] Return component render states based on PermissionRender, RBAC field decision evidence, DataModel lifecycle, and Workflow task context.
- [ ] Denied components must be hidden or disabled according to declared render policy, never silently editable.

## Required tests
- [ ] Add focused tests before or alongside implementation.
- [ ] Include at least one positive runtime case and one negative/fail-closed case.
- [ ] Preserve existing purchase approval and leave approval compatibility when relevant.

## Required validation
- `pnpm exec vitest run client/src/lib/skills/page/pageSkill.test.ts --reporter=dot`
- `pnpm exec tsc --noEmit --pretty false`
- `node agent-loop/src/check-mojibake.js client/src/lib/skills/page/pageSkill.ts client/src/lib/skills/page/pageModel.ts client/src/lib/skills/page/pageSkill.test.ts agent-loop/tasks/sliderule-v2-page-runtime-render-policy-117.md`

## Acceptance criteria
- Component visibility is executable.
- RBAC denied component is not editable.
- Removed bound field blocks rendering.
- The task produces reviewable runtime behavior, not just field existence or documentation.
- Validation commands have fresh passing evidence in the AgentLoop final report.
