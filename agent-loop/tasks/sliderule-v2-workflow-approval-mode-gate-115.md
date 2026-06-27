# SlideRule V2 Hardening 115.30.04: Workflow approval mode gate

## Execution status
- Status: PENDING
- Phase: 115.30-workflow
- Goal: Validate approval mode settings so invalid thresholds and missing approvers fail before publish.
- Required gate: `sliderule-v2-workflow-approval-mode-gate-115Gates`

## Context
115 V2 Skill hardening deepens the existing five legacy Skills after AIGC 114. Keep every change runtime-less: pure data, pure validation, pure projection, pure resolve surfaces. Do not add database, Redis, provider, browser, or real service runtime code.

## Allowed files
- `client/src/lib/skills/workflow/workflowSkill.ts`
- `client/src/lib/skills/workflow/workflowSkill.test.ts`
- `agent-loop/tasks/sliderule-v2-workflow-approval-mode-gate-115.md`

## Do not
- Do not modify unrelated UI, dashboard, or AgentLoop runtime files.
- Do not use `git add -A`.
- Do not introduce credential material, provider credentials, network calls, database access, Redis access, or tool execution.
- Do not weaken existing validation gates or delete existing tests unless the task explicitly replaces them with stricter tests.
- Do not mark this task reviewed until the required validation commands have fresh evidence.

## Implementation steps
- [ ] Start from a clean worktree or queue worktree and inspect current Skill behavior.
- [ ] Write or update the failing test that proves this hardening behavior is missing.
- [ ] Error when percentage mode has missing or out-of-range threshold.
- [ ] Error when sequential/all/any mode has no assignee refs.
- [ ] Keep simple approval fixtures green.
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

## Fresh validation evidence (post-review fix for needs_changes)

- Status after edits: all gates green with new threshold behavior.
- Date: 2026-06-27 (worktree: sliderule-v2-hardening-115-run)

### pnpm exec vitest run client/src/lib/skills/workflow/workflowSkill.test.ts --reporter=dot
```
 RUN  v2.1.9 C:/Users/wangchunji/Documents/cube-pets-office/.worktrees/sliderule-v2-hardening-115-run/client

 ✓ src/lib/skills/workflow/workflowSkill.test.ts (32 tests) 7ms

 Test Files  1 passed (1)
      Tests  32 passed (32)
   Start at  08:40:35
   Duration  350ms (transform 74ms, setup 0ms, collect 83ms, tests 7ms, environment 0ms, prepare 78ms)
```
(32 includes 4 new threshold gate tests: missing, low=0, high=101, valid-positive)

### pnpm exec tsc --noEmit --pretty false
(exit code 0; no diagnostics)

### node agent-loop/src/check-mojibake.js agent-loop/tasks/sliderule-v2-workflow-approval-mode-gate-115.md
```
No mojibake findings.
```

## Pre-edit diagnosis (before any source edits)
- failureKind: review_needs_changes
- rootCause: validate() only checked approvalMode enum + assigneeRole presence (no threshold logic for "percentage"), and purchaseApprovalWorkflow fixture + positive test required a percentage node without threshold to pass.
- editNeeded: true
- intendedFiles: ["client/src/lib/skills/workflow/workflowSkill.ts", "client/src/lib/skills/workflow/workflowSkill.test.ts", "agent-loop/tasks/sliderule-v2-workflow-approval-mode-gate-115.md"]
- gatesToRun: ["pnpm exec vitest run client/src/lib/skills/workflow/workflowSkill.test.ts --reporter=dot", "pnpm exec tsc --noEmit --pretty false", "node agent-loop/src/check-mojibake.js agent-loop/tasks/sliderule-v2-workflow-approval-mode-gate-115.md"]

## Review findings addressed (only scoped to allowed files)
- Blocker (workflowSkill.ts): added percentage threshold missing/out-of-range validation (new WF_APPROVAL_INVALID_THRESHOLD) inside approval loop.
- Blocker (workflowSkill.test.ts): added 3 negative tests (missing threshold, th=0, th=101) + 1 positive valid threshold; purchase fixture now carries valid threshold:60 to keep compat positive green without deleting/weakening tests.
- Minor (task md): appended this fresh evidence section with exact required command outputs.

No unrelated changes; kept all prior behavior and tests; runtime-less pure validation.
