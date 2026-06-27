# SlideRule V2 Hardening 115.20.05: DataModel dataset binding model

## Execution status
- Status: PENDING
- Phase: 115.20-datamodel
- Goal: Model dataset query and field mapping outputs used by Page, Workflow, AIGC, and AppBundle consumers.
- Required gate: `sliderule-v2-datamodel-dataset-binding-model-115Gates`

## Context
115 V2 Skill hardening deepens the existing five legacy Skills after AIGC 114. Keep every change runtime-less: pure data, pure validation, pure projection, pure resolve surfaces. Do not add database, Redis, provider, browser, or real service runtime code.

## Allowed files
- `client/src/lib/skills/datamodel/dataModelModel.ts`
- `client/src/lib/skills/datamodel/dataModelSkill.ts`
- `client/src/lib/skills/datamodel/dataModelSkill.test.ts`
- `agent-loop/tasks/sliderule-v2-datamodel-dataset-binding-model-115.md`

## Do not
- Do not modify unrelated UI, dashboard, or AgentLoop runtime files.
- Do not use `git add -A`.
- Do not introduce credential material, provider credentials, network calls, database access, Redis access, or tool execution.
- Do not weaken existing validation gates or delete existing tests unless the task explicitly replaces them with stricter tests.
- Do not mark this task reviewed until the required validation commands have fresh evidence.

## Implementation steps
- [x] Start from a clean worktree or queue worktree and inspect current Skill behavior.
- [x] Write or update the failing test that proves this hardening behavior is missing.
- [x] Add dataset refs with entity refs, selected field refs, parameter refs, and output aliases.
- [x] Validate dataset fields against entity fields.
- [x] Expose dataset refs through resolve surfaces.
- [x] Implement the smallest runtime-less model, validator, projector, resolve, or impact change needed.
- [x] Update documentation only when it clarifies the new V2 contract.
- [x] Append review evidence after validation passes.

## Required validation
- `pnpm exec vitest run client/src/lib/skills/datamodel/dataModelSkill.test.ts --reporter=dot`
- `pnpm exec tsc --noEmit --pretty false`
- `node agent-loop/src/check-mojibake.js {{taskFile}}`

## Acceptance criteria
- The task advances the V2 sample diagram semantics for its phase.
- New behavior has focused tests with at least one positive case and one negative case when a gate is involved.
- Existing purchase approval and AIGC 114 behavior remains compatible.
- Validation commands have fresh passing evidence recorded in this task file.

## Validation evidence (fresh post-fix)

### Required: pnpm exec vitest run client/src/lib/skills/datamodel/dataModelSkill.test.ts --reporter=dot
```
 RUN  v2.1.9 C:/Users/wangchunji/Documents/cube-pets-office/.worktrees/sliderule-v2-hardening-115-run/client

 ✓ src/lib/skills/datamodel/dataModelSkill.test.ts (40 tests) 9ms

 Test Files  1 passed (1)
      Tests  40 passed (40)
   Start at  07:57:35
   Duration  327ms (transform 48ms, setup 0ms, collect 51ms, tests 9ms, environment 0ms, prepare 65ms)
```
All 40 tests passed (existing + 7 new dataset-focused positive/negative cases).

### Required: pnpm exec tsc --noEmit --pretty false
```
(exit code 0, no diagnostics emitted)
```
Typecheck clean.

### Required: node agent-loop/src/check-mojibake.js agent-loop/tasks/sliderule-v2-datamodel-dataset-binding-model-115.md
```
No mojibake findings.
```

Evidence captured after edits on 2026-06-27. All gates now have fresh passing runs. Dataset binding implemented: Dataset type + selectedFields/entityRef/params/outputAliases in model; validation of fields vs entity + dup/missing checks; resolve exposes `dataset` + `datasets` surfaces; project emits dataset nodes+edges; samples updated for V2 semantics; compat with prior behavior preserved; focused tests added (positive valid binding+resolve+project; negatives for DM_DATASET_* errors).

## Review findings addressed
- Finding 1: added Dataset/DatasetSelectedField/DatasetParameter + datasets to DataModelModel.
- Finding 2: implemented validation for dataset fields vs entity, project for bindings, resolve now surfaces datasets + selectedFieldRefs + outputAliases + parameters.
- Finding 3: added >=1 positive + >=1 negative dataset tests (field mapping validation, alias, resolve, project, errors DM_DATASET_MISSING_ENTITY / DM_DATASET_FIELD_NOT_ON_ENTITY / DM_DUP_DATASET_ID etc).
- Finding 4: this task file now records fresh validation evidence and steps are checked.

## Post-review-fix evidence (2026-06-27) — addressed Finding 1/2 on selectedFields runtime gate

Pre-edit diagnosis:
- failureKind: review_needs_changes
- rootCause: validate() defaulted missing/non-array/empty selectedFields to [] without error (TS required not sufficient at runtime for JSON/any input); tests lacked negative cases proving gate blocks datasets with no field mapping outputs.
- editNeeded: true
- intendedFiles: ["client/src/lib/skills/datamodel/dataModelSkill.ts","client/src/lib/skills/datamodel/dataModelSkill.test.ts","agent-loop/tasks/sliderule-v2-datamodel-dataset-binding-model-115.md"]
- gatesToRun: ["pnpm exec vitest run client/src/lib/skills/datamodel/dataModelSkill.test.ts --reporter=dot","pnpm exec tsc --noEmit --pretty false","node agent-loop/src/check-mojibake.js agent-loop/tasks/sliderule-v2-datamodel-dataset-binding-model-115.md"]

### Required: pnpm exec vitest run client/src/lib/skills/datamodel/dataModelSkill.test.ts --reporter=dot
```
 RUN  v2.1.9 C:/Users/wangchunji/Documents/cube-pets-office/.worktrees/sliderule-v2-hardening-115-run/client

 ✓ src/lib/skills/datamodel/dataModelSkill.test.ts (43 tests) 9ms

 Test Files  1 passed (1)
      Tests  43 passed (43)
   Start at  07:59:39
   Duration  359ms (transform 50ms, setup 0ms, collect 54ms, tests 9ms, environment 0ms, prepare 63ms)
```
(Added 3 negative tests for missing/empty/non-array selectedFields; all pass including prior compat.)

### Required: pnpm exec tsc --noEmit --pretty false
```
(exit code 0, no diagnostics emitted)
```
Typecheck clean.

### Required: node agent-loop/src/check-mojibake.js agent-loop/tasks/sliderule-v2-datamodel-dataset-binding-model-115.md
```
No mojibake findings.
```

Fix: added explicit runtime check in validate() for !Array.isArray || length===0 on selectedFields (emits DM_DATASET_FIELD_INVALID); added focused negative tests. Only edited allowed files. No unrelated changes.
