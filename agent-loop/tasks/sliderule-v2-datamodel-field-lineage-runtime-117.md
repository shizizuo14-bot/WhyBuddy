# SlideRule V2 Runtime 117: DataModel field lineage runtime index

## Execution status
- Status: PENDING
- Phase: 117.02-datamodel-runtime
- Goal: Build a queryable pure field lineage index used by impact analysis and binding checks.
- Required runtime symbols: `buildFieldLineageIndex`, `traceFieldLineage`, `DM_LINEAGE_FIELD_MISSING`

## Context
117 is the runtime-closure wave. The previous 113/114/115 queues mostly hardened static Skill contracts. This task must add pure executable runtime helpers and focused tests. Runtime here means deterministic in-memory functions only: no DB, no Redis, no browser, no network, no provider calls, and no secrets.

## Allowed files
- `client/src/lib/skills/datamodel/dataModelSkill.ts`
- `client/src/lib/skills/datamodel/dataModelModel.ts`
- `client/src/lib/skills/datamodel/dataModelSkill.test.ts`
- `agent-loop/tasks/sliderule-v2-datamodel-field-lineage-runtime-117.md`

## Do not
- Do not weaken existing tests or gates.
- Do not use `git add -A`.
- Do not add credentials, provider calls, network calls, DB, Redis, timers, or browser dependencies.
- Do not make fail-closed paths permissive.
- Do not modify unrelated UI or backend files.

## Required implementation
- [x] Add pure exported `buildFieldLineageIndex(model)` returning entity/field nodes and references from datasets, policies, migrations, and relations.
- [x] Add `traceFieldLineage(index, fieldRef)` that returns upstream/downstream refs and findings for missing fields.
- [x] Use existing DataModel shapes; do not introduce storage or runtime service dependencies.

## Required tests
- [x] Add focused tests before or alongside implementation.
- [x] Include at least one positive runtime case and one negative/fail-closed case.
- [x] Preserve existing purchase approval and leave approval compatibility when relevant.

## Required validation
- `pnpm exec vitest run client/src/lib/skills/datamodel/dataModelSkill.test.ts --reporter=dot`
- `pnpm exec vitest run client/src/lib/skills/impact.test.ts --reporter=dot`
- `pnpm exec tsc --noEmit --pretty false`
- `node agent-loop/src/check-mojibake.js client/src/lib/skills/datamodel/dataModelSkill.ts client/src/lib/skills/datamodel/dataModelModel.ts client/src/lib/skills/datamodel/dataModelSkill.test.ts agent-loop/tasks/sliderule-v2-datamodel-field-lineage-runtime-117.md`

## Acceptance criteria
- Lineage can answer field impact queries.
- Missing field lineage returns `DM_LINEAGE_FIELD_MISSING`.
- Impact tests cover at least one purchase amount path.
- The task produces reviewable runtime behavior, not just field existence or documentation.
- Validation commands have fresh passing evidence in the AgentLoop final report.
