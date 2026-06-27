# SlideRule V2 Hardening 115.20.06: DataModel sensitive field policy

## Execution status
- Status: PENDING
- Phase: 115.20-datamodel
- Goal: Mark sensitive fields and export policy metadata while delegating final decisions to RBAC PDP.
- Required gate: `sliderule-v2-datamodel-sensitive-field-policy-115Gates`

## Context
115 V2 Skill hardening deepens the existing five legacy Skills after AIGC 114. Keep every change runtime-less: pure data, pure validation, pure projection, pure resolve surfaces. Do not add database, Redis, provider, browser, or real service runtime code.

## Allowed files
- `client/src/lib/skills/datamodel/dataModelModel.ts`
- `client/src/lib/skills/datamodel/dataModelSkill.ts`
- `client/src/lib/skills/datamodel/dataModelSkill.test.ts`
- `client/src/lib/skills/rbac/rbacSkill.test.ts`
- `agent-loop/tasks/sliderule-v2-datamodel-sensitive-field-policy-115.md`

## Do not
- Do not modify unrelated UI, dashboard, or AgentLoop runtime files.
- Do not use `git add -A`.
- Do not introduce credential material, provider credentials, network calls, database access, Redis access, or tool execution.
- Do not weaken existing validation gates or delete existing tests unless the task explicitly replaces them with stricter tests.
- Do not mark this task reviewed until the required validation commands have fresh evidence.

## Implementation steps
- [ ] Start from a clean worktree or queue worktree and inspect current Skill behavior.
- [ ] Write or update the failing test that proves this hardening behavior is missing.
- [ ] Add sensitivity levels and export policy refs to fields.
- [ ] Validate that sensitive fields have PDP delegation metadata.
- [ ] Test purchase_request.amount as a sensitive field visible to finance/admin.
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

## Execution updates (post-review fix 115.20.06)
- Implemented sensitivity level, policyRef, pdpVisibleTo on Field (dataModelModel.ts).
- purchase_request.amount now marked: sensitivity="financial", policyRef="pdp:purchase:amount", pdpVisibleTo=["finance","admin"].
- Added DM_SENSITIVE_FIELD_NO_POLICY validation gate requiring policyRef for sensitive fields (PDP delegation).
- resolve() now exports sensitivity/policyRef/pdpVisibleTo on fields surface.
- project() emits policy nodes + sensitive policy edges for V2 diagram semantics.
- Added focused positive (amount visible to finance/admin) + negative (sensitive without policyRef errors) + compat tests.
- All prior behavior (SSOT/version/lifecycle/dataset, leave/purchase compat) preserved; no tests deleted/weakened.
- Status remains PENDING until reviewer marks; validation evidence appended below.

## Fresh required validation evidence (recorded after edit)
- Command: pnpm exec vitest run client/src/lib/skills/datamodel/dataModelSkill.test.ts client/src/lib/skills/rbac/rbacSkill.test.ts --reporter=dot
```
 RUN  v2.1.9 C:/Users/wangchunji/Documents/cube-pets-office/.worktrees/sliderule-v2-hardening-115-run/client

  src/lib/skills/rbac/rbacSkill.test.ts (60 tests) 12ms
  src/lib/skills/datamodel/dataModelSkill.test.ts (47 tests) 12ms

 Test Files  2 passed (2)
      Tests  107 passed (107)
   Start at  08:03:17
   Duration  343ms (transform 107ms, setup 0ms, collect 143ms, tests 24ms, environment 0ms, prepare 131ms)
```
- Command: pnpm exec tsc --noEmit --pretty false
```
(no errors, exit 0)
```
- Command: node agent-loop/src/check-mojibake.js agent-loop/tasks/sliderule-v2-datamodel-sensitive-field-policy-115.md
```
No mojibake findings.
```
All required validations have fresh passing evidence.
