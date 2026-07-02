# SlideRule V2 Runtime 117: AIGC RAG and tool policy runtime

## Execution status
- Status: PENDING
- Phase: 117.05-aigc-runtime
- Goal: Make AIGC capability invocation policy executable before retrieval/tool/model use.
- Required runtime symbols: `evaluateAigcRuntimePolicy`, `AIGC_RUNTIME_POLICY_DENIED`, `toolCallBudget`

## Context
117 is the runtime-closure wave. The previous 113/114/115 queues mostly hardened static Skill contracts. This task must add pure executable runtime helpers and focused tests. Runtime here means deterministic in-memory functions only: no DB, no Redis, no browser, no network, no provider calls, and no secrets.

## Allowed files
- `client/src/lib/skills/aigc/aigcSkill.ts`
- `client/src/lib/skills/aigc/aigcModel.ts`
- `client/src/lib/skills/aigc/aigcSkill.test.ts`
- `agent-loop/tasks/sliderule-v2-aigc-rag-tool-policy-runtime-117.md`

## Do not
- Do not weaken existing tests or gates.
- Do not use `git add -A`.
- Do not add credentials, provider calls, network calls, DB, Redis, timers, or browser dependencies.
- Do not make fail-closed paths permissive.
- Do not modify unrelated UI or backend files.

## Required implementation
- [ ] Add pure exported `evaluateAigcRuntimePolicy(model, capabilityId, ctx)`.
- [ ] Check provider/model refs, retrieval policy, citation policy, tool policy, RBAC permission evidence, and DataModel field lifecycle before invocation.
- [ ] Denied policy returns `AIGC_RUNTIME_POLICY_DENIED` and does not produce an invocation plan.

## Required tests
- [ ] Add focused tests before or alongside implementation.
- [ ] Include at least one positive runtime case and one negative/fail-closed case.
- [ ] Preserve existing purchase approval and leave approval compatibility when relevant.

## Required validation
- `pnpm exec vitest run client/src/lib/skills/aigc/aigcSkill.test.ts --reporter=dot`
- `pnpm exec tsc --noEmit --pretty false`
- `node agent-loop/src/check-mojibake.js client/src/lib/skills/aigc/aigcSkill.ts client/src/lib/skills/aigc/aigcModel.ts client/src/lib/skills/aigc/aigcSkill.test.ts agent-loop/tasks/sliderule-v2-aigc-rag-tool-policy-runtime-117.md`

## Acceptance criteria
- AIGC invocation plan is gated before use.
- Tool budget and timeout are represented.
- Missing RBAC/DataModel evidence fails closed.
- The task produces reviewable runtime behavior, not just field existence or documentation.
- Validation commands have fresh passing evidence in the AgentLoop final report.
