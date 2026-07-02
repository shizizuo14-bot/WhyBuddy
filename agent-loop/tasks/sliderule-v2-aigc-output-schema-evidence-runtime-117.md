# SlideRule V2 Runtime 117: AIGC output schema and evidence runtime

## Execution status
- Status: PENDING
- Phase: 117.05-aigc-runtime
- Goal: Validate AIGC outputs against schema and citation/evidence policy.
- Required runtime symbols: `validateAigcRuntimeOutput`, `AIGC_RUNTIME_OUTPUT_SCHEMA_INVALID`, `citationEvidence`

## Context
117 is the runtime-closure wave. The previous 113/114/115 queues mostly hardened static Skill contracts. This task must add pure executable runtime helpers and focused tests. Runtime here means deterministic in-memory functions only: no DB, no Redis, no browser, no network, no provider calls, and no secrets.

## Allowed files
- `client/src/lib/skills/aigc/aigcSkill.ts`
- `client/src/lib/skills/aigc/aigcModel.ts`
- `client/src/lib/skills/aigc/aigcSkill.test.ts`
- `agent-loop/tasks/sliderule-v2-aigc-output-schema-evidence-runtime-117.md`

## Do not
- Do not weaken existing tests or gates.
- Do not use `git add -A`.
- Do not add credentials, provider calls, network calls, DB, Redis, timers, or browser dependencies.
- Do not make fail-closed paths permissive.
- Do not modify unrelated UI or backend files.

## Required implementation
- [ ] Add pure exported `validateAigcRuntimeOutput(model, capabilityId, output)`.
- [ ] Validate required output schema fields, field types, citation requirements, and evidence refs.
- [ ] Invalid output returns `AIGC_RUNTIME_OUTPUT_SCHEMA_INVALID` and blocks downstream AppBundle publish/use.

## Required tests
- [ ] Add focused tests before or alongside implementation.
- [ ] Include at least one positive runtime case and one negative/fail-closed case.
- [ ] Preserve existing purchase approval and leave approval compatibility when relevant.

## Required validation
- `pnpm exec vitest run client/src/lib/skills/aigc/aigcSkill.test.ts --reporter=dot`
- `pnpm exec tsc --noEmit --pretty false`
- `node agent-loop/src/check-mojibake.js client/src/lib/skills/aigc/aigcSkill.ts client/src/lib/skills/aigc/aigcModel.ts client/src/lib/skills/aigc/aigcSkill.test.ts agent-loop/tasks/sliderule-v2-aigc-output-schema-evidence-runtime-117.md`

## Acceptance criteria
- Valid output passes with evidence.
- Missing schema field fails.
- Missing citation for RAG-backed capability fails.
- The task produces reviewable runtime behavior, not just field existence or documentation.
- Validation commands have fresh passing evidence in the AgentLoop final report.
