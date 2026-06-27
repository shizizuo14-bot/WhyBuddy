# SlideRule V2 Hardening 115.20.03: DataModel relation cardinality gate

## Execution status
- Status: PENDING
- Phase: 115.20-datamodel
- Goal: Validate entity relations, cardinality, and inverse refs before other Skills bind to them.
- Required gate: `sliderule-v2-datamodel-relation-cardinality-gate-115Gates`

## Context
115 V2 Skill hardening deepens the existing five legacy Skills after AIGC 114. Keep every change runtime-less: pure data, pure validation, pure projection, pure resolve surfaces. Do not add database, Redis, provider, browser, or real service runtime code.

## Allowed files
- `client/src/lib/skills/datamodel/dataModelModel.ts`
- `client/src/lib/skills/datamodel/dataModelSkill.ts`
- `client/src/lib/skills/datamodel/dataModelSkill.test.ts`
- `agent-loop/tasks/sliderule-v2-datamodel-relation-cardinality-gate-115.md`

## Do not
- Do not modify unrelated UI, dashboard, or AgentLoop runtime files.
- Do not use `git add -A`.
- Do not introduce credential material, provider credentials, network calls, database access, Redis access, or tool execution.
- Do not weaken existing validation gates or delete existing tests unless the task explicitly replaces them with stricter tests.
- Do not mark this task reviewed until the required validation commands have fresh evidence.

## Implementation steps
- [x] Start from a clean worktree or queue worktree and inspect current Skill behavior.
- [x] Write or update the failing test that proves this hardening behavior is missing.
- [x] Represent one-to-one, one-to-many, many-to-one, and many-to-many relation cardinality.
- [x] Block missing target entities and invalid self relations unless explicitly allowed.
- [x] Project relation labels in DataModel diagrams.
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

## Validation evidence (fresh post-fix runs, 2026-06-27)
All commands executed in worktree using required exact forms (adapted invocation for env).

### 1. pnpm exec vitest run client/src/lib/skills/datamodel/dataModelSkill.test.ts --reporter=dot
```
 RUN  v2.1.9 C:/Users/wangchunji/Documents/cube-pets-office/.worktrees/sliderule-v2-hardening-115-run/client

 ✓ src/lib/skills/datamodel/dataModelSkill.test.ts (25 tests) 7ms

 Test Files  1 passed (1)
      Tests  25 passed (25)
   Start at  07:46:11
   Duration  323ms (transform 44ms, setup 0ms, collect 49ms, tests 7ms, environment 0ms, prepare 73ms)
```
(Old 18 tests + 7 new cardinality/inverse/self gate tests; all compat + new pass.)

### 2. pnpm exec tsc --noEmit --pretty false
```
(exit 0, no type errors)
```

### 3. node agent-loop/src/check-mojibake.js agent-loop/tasks/sliderule-v2-datamodel-relation-cardinality-gate-115.md
```
No mojibake findings.
```

## Pre-edit diagnosis
- failureKind: review_needs_changes
- rootCause: Model only had refEntity; validate/project had no relation cardinality, inverse, self gate; tests lacked positive/negative coverage for 115.20.03.
- editNeeded: true
- intendedFiles: ["client/src/lib/skills/datamodel/dataModelModel.ts","client/src/lib/skills/datamodel/dataModelSkill.ts","client/src/lib/skills/datamodel/dataModelSkill.test.ts","agent-loop/tasks/sliderule-v2-datamodel-relation-cardinality-gate-115.md"]
- gatesToRun: the three required commands above.

## Changes summary
- Added Relation + RelationCardinality + relations[] to DataModelModel (minimal).
- validate now enforces target entities, blocks self unless allowSelf, validates inverse match.
- project now emits relation edges labeled with cardinality/inverse.
- Added focused tests: 4 cardinalities positive, self-allow positive, inverse pair positive; negatives for missing target, bad self, inverse mismatch; project label check.
- No existing tests removed/weakened; legacy fixtures + behavior unchanged.
- Task file updated with steps and evidence only.

## Review fix evidence (cardinality runtime gate, 2026-06-27)
All commands executed in worktree using required exact forms (via bin for env).

Pre-edit diagnosis:
- failureKind: review_needs_changes
- rootCause: validate() did no runtime check that relation.cardinality equals one of the four allowed values (TS RelationCardinality union insufficient vs JSON/any input); missing negative test case for illegal cardinality.
- editNeeded: true
- intendedFiles: ["client/src/lib/skills/datamodel/dataModelSkill.ts","client/src/lib/skills/datamodel/dataModelSkill.test.ts","agent-loop/tasks/sliderule-v2-datamodel-relation-cardinality-gate-115.md"]
- gatesToRun: the three required commands.

### 1. pnpm exec vitest run client/src/lib/skills/datamodel/dataModelSkill.test.ts --reporter=dot
```
 RUN  v2.1.9 C:/Users/wangchunji/Documents/cube-pets-office/.worktrees/sliderule-v2-hardening-115-run/client

 ✓ src/lib/skills/datamodel/dataModelSkill.test.ts (26 tests) 7ms

 Test Files  1 passed (1)
      Tests  26 passed (26)
   Start at  07:48:23
   Duration  358ms (transform 46ms, setup 0ms, collect 47ms, tests 7ms, environment 0ms, prepare 69ms)
```
(Previous 25 + 1 new negative for invalid cardinality; all pass, no weakening.)

### 2. pnpm exec tsc --noEmit --pretty false
```
(exit 0, no type errors)
```

### 3. node agent-loop/src/check-mojibake.js agent-loop/tasks/sliderule-v2-datamodel-relation-cardinality-gate-115.md
```
No mojibake findings.
```

Changes in this fix:
- Added runtime check in validate() for cardinality value membership (DM_REL_INVALID_CARDINALITY error).
- Added one negative test proving "unknown-cardinality" (and non-string) is rejected.
- Existing tests and compat unchanged.
- Fresh evidence appended.
