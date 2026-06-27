# SlideRule V2 Hardening 115.30.03: Workflow approval mode model

## Execution status
- Status: PENDING
- Phase: 115.30-workflow
- Goal: Model countersign, or-sign, sequential approval, and percentage approval as runtime-less workflow node semantics.
- Required gate: `sliderule-v2-workflow-approval-mode-model-115Gates`

## Context
115 V2 Skill hardening deepens the existing five legacy Skills after AIGC 114. Keep every change runtime-less: pure data, pure validation, pure projection, pure resolve surfaces. Do not add database, Redis, provider, browser, or real service runtime code.

## Allowed files
- `client/src/lib/skills/workflow/workflowModel.ts`
- `client/src/lib/skills/workflow/workflowSkill.ts`
- `client/src/lib/skills/workflow/workflowSkill.test.ts`
- `agent-loop/tasks/sliderule-v2-workflow-approval-mode-model-115.md`

## Do not
- Do not modify unrelated UI, dashboard, or AgentLoop runtime files.
- Do not use `git add -A`.
- Do not introduce credential material, provider credentials, network calls, database access, Redis access, or tool execution.
- Do not weaken existing validation gates or delete existing tests unless the task explicitly replaces them with stricter tests.
- Do not mark this task reviewed until the required validation commands have fresh evidence.

## Implementation steps
- [ ] Start from a clean worktree or queue worktree and inspect current Skill behavior.
- [ ] Write or update the failing test that proves this hardening behavior is missing.
- [ ] Add approvalMode on approval nodes.
- [ ] Support all, any, sequential, and percentage modes.
- [ ] Add purchase fixture coverage for department manager, buyer, and finance approval modes.
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

## Fresh passing validation evidence (appended per acceptance)

### pnpm exec vitest run client/src/lib/skills/workflow/workflowSkill.test.ts --reporter=dot
```
 RUN  v2.1.9 C:/Users/wangchunji/Documents/cube-pets-office/.worktrees/sliderule-v2-hardening-115-run/client

 ✓ src/lib/skills/workflow/workflowSkill.test.ts (28 tests) 6ms

 Test Files  1 passed (1)
      Tests  28 passed (28)
   Start at  08:36:50
   Duration  487ms (transform 68ms, setup 0ms, collect 77ms, tests 6ms, environment 0ms, prepare 52ms)
```

### pnpm exec tsc --noEmit --pretty false
```
(exit code 0, no errors)
```

### node agent-loop/src/check-mojibake.js agent-loop/tasks/sliderule-v2-workflow-approval-mode-model-115.md
```
No mojibake findings.
```

All gates passed with fresh output after model + fixture + validator + projector + test updates.
