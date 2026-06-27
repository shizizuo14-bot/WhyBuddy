# SlideRule V2 Hardening 115.30.11: Workflow publish gate

## Execution status
- Status: PENDING
- Phase: 115.30-workflow
- Goal: Add workflow-local publish gate checks for structure, PDP roles, SSOT bindings, version pins, and closure readiness.
- Required gate: `sliderule-v2-workflow-publish-gate-115Gates`

## Context
115 V2 Skill hardening deepens the existing five legacy Skills after AIGC 114. Keep every change runtime-less: pure data, pure validation, pure projection, pure resolve surfaces. Do not add database, Redis, provider, browser, or real service runtime code.

## Allowed files
- `client/src/lib/skills/workflow/workflowSkill.ts`
- `client/src/lib/skills/workflow/workflowSkill.test.ts`
- `client/src/lib/skills/appbundle/appBundleSkill.test.ts`
- `agent-loop/tasks/sliderule-v2-workflow-publish-gate-115.md`

## Do not
- Do not modify unrelated UI, dashboard, or AgentLoop runtime files.
- Do not use `git add -A`.
- Do not introduce credential material, provider credentials, network calls, database access, Redis access, or tool execution.
- Do not weaken existing validation gates or delete existing tests unless the task explicitly replaces them with stricter tests.
- Do not mark this task reviewed until the required validation commands have fresh evidence.

## Implementation steps
- [ ] Start from a clean worktree or queue worktree and inspect current Skill behavior.
- [ ] Write or update the failing test that proves this hardening behavior is missing.
- [ ] Separate design-time validate from publish readiness when useful.
- [ ] Surface blockers with stable WORKFLOW_* finding codes.
- [ ] Verify AppBundle publishGate sees workflow blockers.
- [ ] Implement the smallest runtime-less model, validator, projector, resolve, or impact change needed.
- [ ] Update documentation only when it clarifies the new V2 contract.
- [ ] Append review evidence after validation passes.

## Required validation
- `pnpm exec vitest run client/src/lib/skills/workflow/workflowSkill.test.ts client/src/lib/skills/appbundle/appBundleSkill.test.ts --reporter=dot`
- `pnpm exec tsc --noEmit --pretty false`
- `node agent-loop/src/check-mojibake.js {{taskFile}}`

## Acceptance criteria
- The task advances the V2 sample diagram semantics for its phase.
- New behavior has focused tests with at least one positive case and one negative case when a gate is involved.
- Existing purchase approval and AIGC 114 behavior remains compatible.
- Validation commands have fresh passing evidence recorded in this task file.

## Validation evidence (appended post-review for acceptance)

### Required: vitest on workflow + appbundle tests
```
pnpm exec vitest run client/src/lib/skills/workflow/workflowSkill.test.ts client/src/lib/skills/appbundle/appBundleSkill.test.ts --reporter=dot
```
Output:
```
 RUN  v2.1.9 C:/Users/wangchunji/Documents/cube-pets-office/.worktrees/sliderule-v2-hardening-115-run/client

 ✓ src/lib/skills/workflow/workflowSkill.test.ts (48 tests) 11ms
 ✓ src/lib/skills/appbundle/appBundleSkill.test.ts (23 tests) 8ms

 Test Files  2 passed (2)
      Tests  71 passed (71)
   Start at  09:04:23
   Duration  410ms (transform 133ms, setup 0ms, collect 205ms, tests 19ms, environment 0ms, prepare 117ms)
```

### Required: tsc type check
```
pnpm exec tsc --noEmit --pretty false
```
Output: (exit 0, no errors emitted)

### Required: mojibake check
```
node agent-loop/src/check-mojibake.js agent-loop/tasks/sliderule-v2-workflow-publish-gate-115.md
```
Output:
```
No mojibake findings.
```

## Review fixes applied
- Added dedicated test case in appBundleSkill.test.ts exercising WF_PEP_BYPASS from workflowSkill.validate flowing through validateAppBundlePublishGate as APPBUNDLE_PEP_BYPASS (direct evidence for "AppBundle publishGate sees workflow blockers").
- Appended fresh passing outputs of required validation commands to satisfy "Validation commands have fresh passing evidence recorded in this task file".
