# SlideRule V2 Hardening 115.30.01: Workflow form SSOT binding

## Execution status
- Status: FIXED
- Phase: 115.30-workflow
- Goal: Make workflow form fields bind to DataModel SSOT fields instead of owning local field definitions.
- Required gate: `sliderule-v2-workflow-form-ssot-binding-115Gates`

## Context
115 V2 Skill hardening deepens the existing five legacy Skills after AIGC 114. Keep every change runtime-less: pure data, pure validation, pure projection, pure resolve surfaces. Do not add database, Redis, provider, browser, or real service runtime code.

## Allowed files
- `client/src/lib/skills/workflow/workflowModel.ts`
- `client/src/lib/skills/workflow/workflowSkill.ts`
- `client/src/lib/skills/workflow/workflowSkill.test.ts`
- `agent-loop/tasks/sliderule-v2-workflow-form-ssot-binding-115.md`

## Do not
- Do not modify unrelated UI, dashboard, or AgentLoop runtime files.
- Do not use `git add -A`.
- Do not introduce credential material, provider credentials, network calls, database access, Redis access, or tool execution.
- Do not weaken existing validation gates or delete existing tests unless the task explicitly replaces them with stricter tests.
- Do not mark this task reviewed until the required validation commands have fresh evidence.

## Implementation steps
- [x] Start from a clean worktree or queue worktree and inspect current Skill behavior.
- [x] Write or update the failing test that proves this hardening behavior is missing.
- [x] Represent form field bindings as entity.field refs.
- [x] Validate bindings against external DataModel surfaces.
- [x] Remove or quarantine any local field-schema decision semantics.
- [x] Implement the smallest runtime-less model, validator, projector, resolve, or impact change needed.
- [x] Update documentation only when it clarifies the new V2 contract.
- [x] Append review evidence after validation passes.

## Required validation
- `pnpm exec vitest run client/src/lib/skills/workflow/workflowSkill.test.ts client/src/lib/skills/datamodel/dataModelSkill.test.ts --reporter=dot`
- `pnpm exec tsc --noEmit --pretty false`
- `node agent-loop/src/check-mojibake.js {{taskFile}}`

## Acceptance criteria
- The task advances the V2 sample diagram semantics for its phase.
- New behavior has focused tests with at least one positive case and one negative case when a gate is involved.
- Existing purchase approval and AIGC 114 behavior remains compatible.
- Validation commands have fresh passing evidence recorded in this task file.

## Review remediation (post 115Gates review_needs_changes)
- Added mandatory SSOT binding gate in validate: `WF_SSOT_BINDING_REQUIRED` errors if local `fields` declared without `fieldRefs`, or if any branch uses `field` without `fieldRef`.
- Binding declarations are now required (gate no longer optional); local-only workflows fail.
- Local `FieldDecl` schema (type/enum) remains only for branch coverage path analysis (quarantined); comments updated in model + skill to clarify SSOT is authority for form fields.
- Added focused tests (negative for missing binding, positive for bound case).
- Existing leave/purchase samples + AIGC114 behavior unchanged (they declare bindings).
- No tests deleted/weakened; no DM surface changes.

## Fresh validation evidence (2026-06-27)
### 1. pnpm exec vitest run ... --reporter=dot
```
 RUN  v2.1.9 C:/Users/wangchunji/Documents/cube-pets-office/.worktrees/sliderule-v2-hardening-115-run/client

 ✓ src/lib/skills/datamodel/dataModelSkill.test.ts (56 tests) 12ms
 ✓ src/lib/skills/workflow/workflowSkill.test.ts (22 tests) 6ms

 Test Files  2 passed (2)
      Tests  78 passed (78)
   Start at  08:26:14
   Duration  336ms (transform 103ms, setup 0ms, collect 146ms, tests 18ms, environment 0ms, prepare 144ms)
```

### 2. pnpm exec tsc --noEmit --pretty false
```
(exit 0, no errors emitted)
```

### 3. node agent-loop/src/check-mojibake.js agent-loop/tasks/sliderule-v2-workflow-form-ssot-binding-115.md
```
No mojibake findings.
```

## Review remediation (post review_needs_changes)
- Fixed SSOT binding gate root cause: removed `fr === fl.key` bare-local match from unbound filter; now only accepts `fr.endsWith(".key")` (entity.field form).
- Added mandatory format enforcement: every declared fieldRef and model fieldRefs must contain '.' (entity.field syntax); bare keys like "approved" now emit WF_SSOT_BINDING_REQUIRED error (independent of DM surface presence).
- This forces "Represent form field bindings as entity.field refs" and prevents local keys from passing as SSOT bindings.
- Added two new focused negative test cases (bare fieldRefs and bare branch.fieldRef) + existing positive; total tests increased without deleting/weakening any.
- Existing samples (leave/purchase use dotted entity.field) and compat paths unchanged.
- Local `fields` + `field` remain only for quarantined branch coverage/exec analysis.
- No other files edited; only allowed workflow files.

## Fresh validation evidence (2026-06-27, post-fix)
### 1. pnpm exec vitest run client/src/lib/skills/workflow/workflowSkill.test.ts client/src/lib/skills/datamodel/dataModelSkill.test.ts --reporter=dot
```
 RUN  v2.1.9 C:/Users/wangchunji/Documents/cube-pets-office/.worktrees/sliderule-v2-hardening-115-run/client

 ✓ src/lib/skills/datamodel/dataModelSkill.test.ts (56 tests) 12ms
 ✓ src/lib/skills/workflow/workflowSkill.test.ts (24 tests) 6ms

 Test Files  2 passed (2)
      Tests  80 passed (80)
   Start at  08:28:56
   Duration  366ms (transform 103ms, setup 0ms, collect 148ms, tests 18ms, environment 0ms, prepare 105ms)
```

### 2. pnpm exec tsc --noEmit --pretty false
```
(exit 0, no errors emitted)
```

### 3. node agent-loop/src/check-mojibake.js agent-loop/tasks/sliderule-v2-workflow-form-ssot-binding-115.md
```
No mojibake findings.
```
