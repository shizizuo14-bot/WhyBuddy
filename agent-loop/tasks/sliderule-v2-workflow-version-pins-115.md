# SlideRule V2 Hardening 115.30.08: Workflow version pins

## Execution status
- Status: PENDING
- Phase: 115.30-workflow
- Goal: Add workflow version pin metadata so AppBundle can publish against immutable workflow definitions.
- Required gate: `sliderule-v2-workflow-version-pins-115Gates`

## Context
115 V2 Skill hardening deepens the existing five legacy Skills after AIGC 114. Keep every change runtime-less: pure data, pure validation, pure projection, pure resolve surfaces. Do not add database, Redis, provider, browser, or real service runtime code.

## Allowed files
- `client/src/lib/skills/workflow/workflowModel.ts`
- `client/src/lib/skills/workflow/workflowSkill.ts`
- `client/src/lib/skills/workflow/workflowSkill.test.ts`
- `client/src/lib/skills/appbundle/appBundleSkill.test.ts`
- `agent-loop/tasks/sliderule-v2-workflow-version-pins-115.md`

## Do not
- Do not modify unrelated UI, dashboard, or AgentLoop runtime files.
- Do not use `git add -A`.
- Do not introduce credential material, provider credentials, network calls, database access, Redis access, or tool execution.
- Do not weaken existing validation gates or delete existing tests unless the task explicitly replaces them with stricter tests.
- Do not mark this task reviewed until the required validation commands have fresh evidence.

## Implementation steps
- [ ] Start from a clean worktree or queue worktree and inspect current Skill behavior.
- [ ] Write or update the failing test that proves this hardening behavior is missing.
- [ ] Represent workflow version ids and publish state.
- [ ] Expose version pins through resolve or capability metadata.
- [ ] Test AppBundle can pin the purchase approval workflow version.
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

## Validation evidence (appended after edit to address review findings)

**Run date:** 2026-06-27 (current worktree)
**Addressed findings:**
- Finding 1: Added focused tests (positive pin + negative gate unpin) in client/src/lib/skills/appbundle/appBundleSkill.test.ts for purchaseApprovalAppBundle pinning "wf_purchase_approval" workflow version / runtimeSnapshot.pinnedRefs / publish gate.
- Finding 2: Fresh passing outputs from all required validation commands recorded below.

### Required validation 1
Command: `pnpm exec vitest run client/src/lib/skills/workflow/workflowSkill.test.ts client/src/lib/skills/appbundle/appBundleSkill.test.ts --reporter=dot`

```
 RUN  v2.1.9 C:/Users/wangchunji/Documents/cube-pets-office/.worktrees/sliderule-v2-hardening-115-run/client

  src/lib/skills/workflow/workflowSkill.test.ts (43 tests) 10ms
  src/lib/skills/appbundle/appBundleSkill.test.ts (22 tests) 7ms

 Test Files  2 passed (2)
      Tests  65 passed (65)
   Start at  08:53:02
   Duration  421ms (transform 128ms, setup 0ms, collect 191ms, tests 17ms, environment 0ms, prepare 115ms)
```

### Required validation 2
Command: `pnpm exec tsc --noEmit --pretty false`

```
(exit 0; no errors)
```

### Required validation 3
Command: `node agent-loop/src/check-mojibake.js agent-loop/tasks/sliderule-v2-workflow-version-pins-115.md`

```
No mojibake findings.
```

All commands passed fresh (post final md append) after the minimal test addition. Existing purchase/leave/AIGC 114 behavior preserved (65 tests, no breakage). Gate remains compatible.
