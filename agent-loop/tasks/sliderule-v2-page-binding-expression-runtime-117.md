# SlideRule V2 Runtime 117: Page binding expression runtime

## Execution status
- Status: PENDING
- Phase: 117.04-page-runtime
- Goal: Evaluate Page binding and linkage expressions as pure deterministic runtime output.
- Required runtime symbols: `evaluatePageBindingExpressions`, `PAGE_BINDING_RUNTIME_ERROR`, `linkageEvidence`

## Context
117 is the runtime-closure wave. The previous 113/114/115 queues mostly hardened static Skill contracts. This task must add pure executable runtime helpers and focused tests. Runtime here means deterministic in-memory functions only: no DB, no Redis, no browser, no network, no provider calls, and no secrets.

## Allowed files
- `client/src/lib/skills/page/pageSkill.ts`
- `client/src/lib/skills/page/pageModel.ts`
- `client/src/lib/skills/page/pageSkill.test.ts`
- `agent-loop/tasks/sliderule-v2-page-binding-expression-runtime-117.md`

## Do not
- Do not weaken existing tests or gates.
- Do not use `git add -A`.
- Do not add credentials, provider calls, network calls, DB, Redis, timers, or browser dependencies.
- Do not make fail-closed paths permissive.
- Do not modify unrelated UI or backend files.

## Required implementation
- [ ] Add pure exported `evaluatePageBindingExpressions(model, input)`.
- [ ] Support deterministic expression evaluation for field binding, linkage rules, and event-derived visibility without eval/new Function.
- [ ] Invalid expressions or unresolved refs return `PAGE_BINDING_RUNTIME_ERROR`.

## Required tests
- [ ] Add focused tests before or alongside implementation.
- [ ] Include at least one positive runtime case and one negative/fail-closed case.
- [ ] Preserve existing purchase approval and leave approval compatibility when relevant.

## Required validation
- `pnpm exec vitest run client/src/lib/skills/page/pageSkill.test.ts --reporter=dot`
- `pnpm exec tsc --noEmit --pretty false`
- `node agent-loop/src/check-mojibake.js client/src/lib/skills/page/pageSkill.ts client/src/lib/skills/page/pageModel.ts client/src/lib/skills/page/pageSkill.test.ts agent-loop/tasks/sliderule-v2-page-binding-expression-runtime-117.md`

## Acceptance criteria
- Binding expressions produce deterministic values.
- Invalid bindings fail closed.
- No unsafe eval or network/runtime dependency is introduced.
- The task produces reviewable runtime behavior, not just field existence or documentation.
- Validation commands have fresh passing evidence in the AgentLoop final report.
