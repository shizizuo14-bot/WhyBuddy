# SlideRule V2 Runtime 117: DataModel migration plan runtime

## Execution status
- Status: PENDING
- Phase: 117.02-datamodel-runtime
- Goal: Generate executable pure migration plans for field version/lifecycle changes.
- Required runtime symbols: `planDataModelMigration`, `DM_MIGRATION_REMOVED_FIELD_BLOCKER`, `migrationActions`

## Context
117 is the runtime-closure wave. The previous 113/114/115 queues mostly hardened static Skill contracts. This task must add pure executable runtime helpers and focused tests. Runtime here means deterministic in-memory functions only: no DB, no Redis, no browser, no network, no provider calls, and no secrets.

## Allowed files
- `client/src/lib/skills/datamodel/dataModelSkill.ts`
- `client/src/lib/skills/datamodel/dataModelModel.ts`
- `client/src/lib/skills/datamodel/dataModelSkill.test.ts`
- `agent-loop/tasks/sliderule-v2-datamodel-migration-plan-runtime-117.md`

## Do not
- Do not weaken existing tests or gates.
- Do not use `git add -A`.
- Do not add credentials, provider calls, network calls, DB, Redis, timers, or browser dependencies.
- Do not make fail-closed paths permissive.
- Do not modify unrelated UI or backend files.

## Required implementation
- [ ] Add pure exported `planDataModelMigration(previousModel, nextModel)`.
- [ ] Report added/changed/deprecated/removed fields and classify removed fields referenced by datasets/pages/workflows as blockers.
- [ ] Return `migrationActions` plus stable findings, without performing IO or changing real data.

## Required tests
- [ ] Add focused tests before or alongside implementation.
- [ ] Include at least one positive runtime case and one negative/fail-closed case.
- [ ] Preserve existing purchase approval and leave approval compatibility when relevant.

## Required validation
- `pnpm exec vitest run client/src/lib/skills/datamodel/dataModelSkill.test.ts --reporter=dot`
- `pnpm exec tsc --noEmit --pretty false`
- `node agent-loop/src/check-mojibake.js client/src/lib/skills/datamodel/dataModelSkill.ts client/src/lib/skills/datamodel/dataModelModel.ts client/src/lib/skills/datamodel/dataModelSkill.test.ts agent-loop/tasks/sliderule-v2-datamodel-migration-plan-runtime-117.md`

## Acceptance criteria
- Removed referenced fields block publish.
- Deprecated fields produce warnings or migration actions.
- A positive no-op migration stays green.
- The task produces reviewable runtime behavior, not just field existence or documentation.
- Validation commands have fresh passing evidence in the AgentLoop final report.
