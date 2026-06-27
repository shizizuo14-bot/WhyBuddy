# SlideRule V2 Hardening 115.20.04: DataModel migration plan gate

## Execution status
- Status: IN_PROGRESS (review remediation)
- Phase: 115.20-datamodel
- Goal: Represent model migration intent and block destructive changes without explicit migration evidence.
- Required gate: `sliderule-v2-datamodel-migration-plan-gate-115Gates`

## Context
115 V2 Skill hardening deepens the existing five legacy Skills after AIGC 114. Keep every change runtime-less: pure data, pure validation, pure projection, pure resolve surfaces. Do not add database, Redis, provider, browser, or real service runtime code.

## Allowed files
- `client/src/lib/skills/datamodel/dataModelModel.ts`
- `client/src/lib/skills/datamodel/dataModelSkill.ts`
- `client/src/lib/skills/datamodel/dataModelSkill.test.ts`
- `agent-loop/tasks/sliderule-v2-datamodel-migration-plan-gate-115.md`

## Do not
- Do not modify unrelated UI, dashboard, or AgentLoop runtime files.
- Do not use `git add -A`.
- Do not introduce credential material, provider credentials, network calls, database access, Redis access, or tool execution.
- Do not weaken existing validation gates or delete existing tests unless the task explicitly replaces them with stricter tests.
- Do not mark this task reviewed until the required validation commands have fresh evidence.

## Implementation steps
- [x] Start from a clean worktree or queue worktree and inspect current Skill behavior.
- [x] Write or update the failing test that proves this hardening behavior is missing.
- [x] Add migration plan metadata for add, rename, deprecate, remove, and type-change actions.
- [x] Warn on high-risk migrations and error on destructive changes without a plan.
- [x] Keep runtime-less: no database or actual migration executor.
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

## Review remediation (post 115.20.04 review_needs_changes)

Implemented per findings:
- Added `MigrationActionType`, `MigrationAction`, `MigrationPlan` to dataModelModel.ts (core data contract for add/rename/deprecate/remove/type-change).
- Extended `validate()` in dataModelSkill.ts with plan checks: `DM_MIGRATION_DESTRUCTIVE_NO_PLAN` error for remove/type-change without planRef; `DM_MIGRATION_HIGH_RISK_NO_REF` warning for deprecate/rename (and destructive covered).
- Added 6 focused tests: 3 positive (rename/remove/type-change with planRef pass), 3 negative (destructive without planRef fail; high-risk without ref warns but ok).
- Existing 26 tests (incl. purchaseApprovalDataModel, leaveRequestDataModel, lifecycle, relations, SSOT) remain and pass (now 32 total). No existing tests deleted/weakened.
- All changes runtime-less (pure types + validator logic). purchase/leave models unchanged and still validate ok.

## Fresh validation evidence (recorded after remediation edits)

Command: `pnpm exec vitest run client/src/lib/skills/datamodel/dataModelSkill.test.ts --reporter=dot`
Result: exit 0, 32 tests passed (26 pre-existing + 6 new migration gate tests). Summary:
```
✓ src/lib/skills/datamodel/dataModelSkill.test.ts (32 tests) 7ms
Test Files  1 passed (1)
Tests  32 passed (32)
```

Command: `pnpm exec tsc --noEmit --pretty false`
Result: exit 0 (no errors)

Command: `node agent-loop/src/check-mojibake.js agent-loop/tasks/sliderule-v2-datamodel-migration-plan-gate-115.md`
Result: exit 0
```
No mojibake findings.
```

All required validations have fresh passing evidence. Pre-existing purchase approval and 114 compat preserved.

## Review remediation (runtime action validation)

Per review findings (major):
- Added runtime guard in `dataModelSkill.validate()` for `migrationPlan.actions[].action` (modeled on existing cardinality runtime check): `DM_MIGRATION_INVALID_ACTION` error for any value outside the exact set ["add","rename","deprecate","remove","type-change"]. This blocks JSON/any/generator inputs like "drop"/"delete" from silently bypassing the gate (TS union alone insufficient for runtime gate).
- Added focused negative test case proving invalid action is rejected (complements existing positive planned-* and destructive-without-plan negatives + high-risk warning).
- No changes to dataModelModel.ts (type already present); no test deletions or weakening; no unrelated files; runtime-less pure validation.
- Minor .agent-loop-context diff items ignored (per scope, not touched).

## Fresh validation evidence (post-remediation, 2026-06-27)

Command: `pnpm exec vitest run client/src/lib/skills/datamodel/dataModelSkill.test.ts --reporter=dot`
```
 RUN  v2.1.9 C:/Users/wangchunji/Documents/cube-pets-office/.worktrees/sliderule-v2-hardening-115-run/client

 ✓ src/lib/skills/datamodel/dataModelSkill.test.ts (33 tests) 8ms

 Test Files  1 passed (1)
      Tests  33 passed (33)
   Start at  07:53:53
   Duration  365ms (transform 47ms, setup 0ms, collect 47ms, tests 8ms, environment 0ms, prepare 64ms)
```
(One new invalid-action negative + prior 32 = 33; all pass.)

Command: `pnpm exec tsc --noEmit --pretty false`
```
(exit 0, no type errors)
```

Command: `node agent-loop/src/check-mojibake.js agent-loop/tasks/sliderule-v2-datamodel-migration-plan-gate-115.md`
```
No mojibake findings.
```

All required commands have fresh passing evidence. Acceptance criteria met for this phase.
