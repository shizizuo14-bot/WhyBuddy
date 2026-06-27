# SlideRule V2 Hardening 115.20.07: DataModel PDP delegation policy

## Execution status
- Status: PENDING
- Phase: 115.20-datamodel
- Goal: Make DataModel define data policies but delegate all allow/deny decisions to RBAC PDP.
- Required gate: `sliderule-v2-datamodel-pdp-delegation-policy-115Gates`

## Context
115 V2 Skill hardening deepens the existing five legacy Skills after AIGC 114. Keep every change runtime-less: pure data, pure validation, pure projection, pure resolve surfaces. Do not add database, Redis, provider, browser, or real service runtime code.

## Allowed files
- `client/src/lib/skills/datamodel/dataModelModel.ts`
- `client/src/lib/skills/datamodel/dataModelSkill.ts`
- `client/src/lib/skills/datamodel/dataModelSkill.test.ts`
- `client/src/lib/skills/rbac/rbacSkill.test.ts`
- `agent-loop/tasks/sliderule-v2-datamodel-pdp-delegation-policy-115.md`

## Do not
- Do not modify unrelated UI, dashboard, or AgentLoop runtime files.
- Do not use `git add -A`.
- Do not introduce credential material, provider credentials, network calls, database access, Redis access, or tool execution.
- Do not weaken existing validation gates or delete existing tests unless the task explicitly replaces them with stricter tests.
- Do not mark this task reviewed until the required validation commands have fresh evidence.

## Implementation steps
- [ ] Start from a clean worktree or queue worktree and inspect current Skill behavior.
- [ ] Write or update the failing test that proves this hardening behavior is missing.
- [ ] Represent model, row, field, and export policy definitions as policy inputs.
- [ ] Prohibit local allow/deny decisions inside DataModel.
- [ ] Add validation that policy definitions point to PDP decision scopes.
- [ ] Implement the smallest runtime-less model, validator, projector, resolve, or impact change needed.
- [ ] Update documentation only when it clarifies the new V2 contract.
- [ ] Append review evidence after validation passes.

## Required validation
- `pnpm exec vitest run client/src/lib/skills/datamodel/dataModelSkill.test.ts client/src/lib/skills/rbac/rbacSkill.test.ts --reporter=dot`
- `pnpm exec tsc --noEmit --pretty false`
- `node agent-loop/src/check-mojibake.js {{taskFile}}`

## Acceptance criteria
- The task advances the V2 sample diagram semantics for its phase.
- New behavior has focused tests with at least one positive case and one negative case when a gate is involved.
- Existing purchase approval and AIGC 114 behavior remains compatible.
- Validation commands have fresh passing evidence recorded in this task file.

## Fresh validation evidence (2026-06-27, post review fix for 115.20.07)
- Implementation added PolicyDefinition (model/row/field/export) to DataModelModel, validate gate checks decisionScope via external.rbac (errors when missing scope provided in external), project/resolve surface the defs. +ve/-ve focused tests added. Existing compat preserved.
- `pnpm exec vitest run client/src/lib/skills/datamodel/dataModelSkill.test.ts client/src/lib/skills/rbac/rbacSkill.test.ts --reporter=dot`:
  RUN  v2.1.9 ...
   ✓ src/lib/skills/datamodel/dataModelSkill.test.ts (51 tests) 13ms
   ✓ src/lib/skills/rbac/rbacSkill.test.ts (60 tests) 14ms
  Test Files  2 passed (2)
       Tests  111 passed (111)
- `pnpm exec tsc --noEmit --pretty false`: exit 0 (no output)
- `node agent-loop/src/check-mojibake.js agent-loop/tasks/sliderule-v2-datamodel-pdp-delegation-policy-115.md`: No mojibake findings.
- Status evidence appended per acceptance; do not mark reviewed until human.
