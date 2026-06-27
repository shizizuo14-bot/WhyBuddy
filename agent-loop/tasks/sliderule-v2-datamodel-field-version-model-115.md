# SlideRule V2 Hardening 115.20.01: DataModel field version model

## Execution status
- Status: PENDING
- Phase: 115.20-datamodel
- Goal: Add first-class field identity and version metadata so DataModel behaves as the SSOT host.
- Required gate: `sliderule-v2-datamodel-field-version-model-115Gates`

## Context
115 V2 Skill hardening deepens the existing five legacy Skills after AIGC 114. Keep every change runtime-less: pure data, pure validation, pure projection, pure resolve surfaces. Do not add database, Redis, provider, browser, or real service runtime code.

## Allowed files
- `client/src/lib/skills/datamodel/dataModelModel.ts`
- `client/src/lib/skills/datamodel/dataModelSkill.ts`
- `client/src/lib/skills/datamodel/dataModelSkill.test.ts`
- `agent-loop/tasks/sliderule-v2-datamodel-field-version-model-115.md`

## Do not
- Do not modify unrelated UI, dashboard, or AgentLoop runtime files.
- Do not use `git add -A`.
- Do not introduce credential material, provider credentials, network calls, database access, Redis access, or tool execution.
- Do not weaken existing validation gates or delete existing tests unless the task explicitly replaces them with stricter tests.
- Do not mark this task reviewed until the required validation commands have fresh evidence.

## Implementation steps
- [ ] Start from a clean worktree or queue worktree and inspect current Skill behavior.
- [ ] Write or update the failing test that proves this hardening behavior is missing.
- [ ] Represent stable field ids, display names, versions, lifecycle, and storage role.
- [ ] Keep entity and field ids deterministic across projections.
- [ ] Add fixture coverage for purchase_request.amount field versioning.
- [ ] Implement the smallest runtime-less model, validator, projector, resolve, or impact change needed.
- [ ] Update documentation only when it clarifies the new V2 contract.
- [ ] Append review evidence after validation passes.

## Required validation
- `pnpm exec vitest run client/src/lib/skills/datamodel/dataModelSkill.test.ts --reporter=dot`
- `pnpm exec tsc --noEmit --pretty false`
- `node agent-loop/src/check-mojibake.js {{taskFile}}`

## Acceptance criteria
- The task advances the V2 sample diagram semantics for its phase.
- New behavior has focused tests with at least one positive case and one negative case when a gate is involved.
- Existing purchase approval and AIGC 114 behavior remains compatible.
- Validation commands have fresh passing evidence recorded in this task file.

## Review fix evidence (2026-06-27)
Added import and dedicated fixture tests in dataModelSkill.test.ts for purchaseApprovalDataModel / purchase_request.amount covering fieldId, version, lifecycle, storageRole (positive assertions + resolve/validate/generate). No changes to other allowed files. Existing tests/behavior preserved. Fresh runs below.

### Implementation step addressed
- Add fixture coverage for purchase_request.amount field versioning.
- Append review evidence after validation passes.

## Fresh validation evidence

### Command: pnpm exec vitest run client/src/lib/skills/datamodel/dataModelSkill.test.ts --reporter=dot
```
 RUN  v2.1.9 C:/Users/wangchunji/Documents/cube-pets-office/.worktrees/sliderule-v2-hardening-115-run/client

 ✓ src/lib/skills/datamodel/dataModelSkill.test.ts (17 tests) 6ms

 Test Files  1 passed (1)
      Tests  17 passed (17)
   Start at  07:37:42
   Duration  317ms (transform 49ms, setup 0ms, collect 50ms, tests 6ms, environment 0ms, prepare 79ms)
```

### Command: pnpm exec tsc --noEmit --pretty false
```
(exit 0, no diagnostics)
```

### Command: node agent-loop/src/check-mojibake.js agent-loop/tasks/sliderule-v2-datamodel-field-version-model-115.md
```
No mojibake findings.
```

All required validation commands pass with fresh evidence.
