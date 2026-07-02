# SlideRule V2 Runtime 117: AppBundle runtime publish closure

## Execution status
- Status: PENDING
- Phase: 117.06-appbundle-runtime
- Goal: Make AppBundle publish gate execute a full runtime closure check across all six Skills.
- Required runtime symbols: `evaluateAppBundleRuntimeClosure`, `APPBUNDLE_RUNTIME_CLOSURE_BLOCKED`, `runtimeClosure`

## Context
117 is the runtime-closure wave. The previous 113/114/115 queues mostly hardened static Skill contracts. This task must add pure executable runtime helpers and focused tests. Runtime here means deterministic in-memory functions only: no DB, no Redis, no browser, no network, no provider calls, and no secrets.

## Allowed files
- `client/src/lib/skills/appbundle/appBundleSkill.ts`
- `client/src/lib/skills/appbundle/appBundleModel.ts`
- `client/src/lib/skills/appbundle/appBundleSkill.test.ts`
- `client/src/lib/skills/orchestrator.ts`
- `agent-loop/tasks/sliderule-v2-appbundle-publish-runtime-closure-117.md`

## Do not
- Do not weaken existing tests or gates.
- Do not use `git add -A`.
- Do not add credentials, provider calls, network calls, DB, Redis, timers, or browser dependencies.
- Do not make fail-closed paths permissive.
- Do not modify unrelated UI or backend files.

## Required implementation
- [ ] Add pure exported `evaluateAppBundleRuntimeClosure(models)`.
- [ ] Check version pins, runtime policy evidence, DataModel bindings, RBAC PDP decisions, Workflow/Page task view consistency, AIGC invocation/output policy, and unresolved refs.
- [ ] Return blockers with `APPBUNDLE_RUNTIME_CLOSURE_BLOCKED` when any runtime evidence is missing or denied.

## Required tests
- [ ] Add focused tests before or alongside implementation.
- [ ] Include at least one positive runtime case and one negative/fail-closed case.
- [ ] Preserve existing purchase approval and leave approval compatibility when relevant.

## Required validation
- `pnpm exec vitest run client/src/lib/skills/appbundle/appBundleSkill.test.ts client/src/lib/skills/orchestrator.test.ts --reporter=dot`
- `pnpm exec vitest run client/src/lib/skills/purchaseApproval.test.ts --reporter=dot`
- `pnpm exec tsc --noEmit --pretty false`
- `node agent-loop/src/check-mojibake.js client/src/lib/skills/appbundle/appBundleSkill.ts client/src/lib/skills/appbundle/appBundleModel.ts client/src/lib/skills/appbundle/appBundleSkill.test.ts client/src/lib/skills/orchestrator.ts agent-loop/tasks/sliderule-v2-appbundle-publish-runtime-closure-117.md`

## Acceptance criteria
- Purchase approval closure is green.
- Missing AIGC or Page runtime evidence blocks publish.
- Closure result lists per-skill evidence.
- The task produces reviewable runtime behavior, not just field existence or documentation.
- Validation commands have fresh passing evidence in the AgentLoop final report.
