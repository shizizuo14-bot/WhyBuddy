# SlideRule V2 Hardening 115.30.07: Workflow instance snapshot

## Execution status
- Status: PENDING
- Phase: 115.30-workflow
- Goal: Model workflow instance snapshots that freeze process version and form field refs at start time.
- Required gate: `sliderule-v2-workflow-instance-snapshot-115Gates`

## Context
115 V2 Skill hardening deepens the existing five legacy Skills after AIGC 114. Keep every change runtime-less: pure data, pure validation, pure projection, pure resolve surfaces. Do not add database, Redis, provider, browser, or real service runtime code.

## Allowed files
- `client/src/lib/skills/workflow/workflowModel.ts`
- `client/src/lib/skills/workflow/workflowSkill.ts`
- `client/src/lib/skills/workflow/workflowSkill.test.ts`
- `agent-loop/tasks/sliderule-v2-workflow-instance-snapshot-115.md`

## Do not
- Do not modify unrelated UI, dashboard, or AgentLoop runtime files.
- Do not use `git add -A`.
- Do not introduce credential material, provider credentials, network calls, database access, Redis access, or tool execution.
- Do not weaken existing validation gates or delete existing tests unless the task explicitly replaces them with stricter tests.
- Do not mark this task reviewed until the required validation commands have fresh evidence.

## Implementation steps
- [ ] Start from a clean worktree or queue worktree and inspect current Skill behavior.
- [ ] Write or update the failing test that proves this hardening behavior is missing.
- [ ] Add instance snapshot metadata for process version, form bindings, and initial variables.
- [ ] Validate snapshots point to published workflow versions.
- [ ] Keep the feature runtime-less: no actual workflow executor.
- [ ] Implement the smallest runtime-less model, validator, projector, resolve, or impact change needed.
- [ ] Update documentation only when it clarifies the new V2 contract.
- [ ] Append review evidence after validation passes.

## Required validation
- `pnpm exec vitest run client/src/lib/skills/workflow/workflowSkill.test.ts --reporter=dot`
- `pnpm exec tsc --noEmit --pretty false`
- `node agent-loop/src/check-mojibake.js {{taskFile}}`

## Acceptance criteria
- The task advances the V2 sample diagram semantics for its phase.
- New behavior has focused tests with at least one positive case and one negative case when a gate is involved.
- Existing purchase approval and AIGC 114 behavior remains compatible.
- Validation commands have fresh passing evidence recorded in this task file.

## Fresh validation evidence (post 115.30.07 snapshot fix)

- Command: `pnpm exec vitest run client/src/lib/skills/workflow/workflowSkill.test.ts --reporter=dot`
```
 RUN  v2.1.9 C:/Users/wangchunji/Documents/cube-pets-office/client

 ✓ src/lib/skills/workflow/workflowSkill.test.ts (16 tests) 5ms

 Test Files  1 passed (1)
      Tests  16 passed (16)
   Start at  08:49:07
   Duration  371ms (transform 63ms, setup 0ms, collect 69ms, tests 5ms, environment 0ms, prepare 68ms)
```

- Command: `pnpm exec tsc --noEmit --pretty false`
```
(exit code 0; no type errors)
```

- Command: `node agent-loop/src/check-mojibake.js agent-loop/tasks/sliderule-v2-workflow-instance-snapshot-115.md`
```
No mojibake findings.
```

## Changes addressing review
- Added `WorkflowInstanceSnapshot` + `version`/`published` to workflowModel.ts
- Added snapshot freeze + published version checks inside validate() and dedicated pure snapshot validate/create in workflowSkill.ts
- Added positive (published freeze+validate pass) + negative (unpublished snapshot fails) cases in workflowSkill.test.ts
- Updated fixtures and task evidence; all existing tests + compat preserved.
