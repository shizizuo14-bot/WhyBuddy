# SlideRule V2 Hardening 115.30.02: Workflow assignee PDP resolution

## Execution status
- Status: DONE_REVIEWED
- Phase: 115.30-workflow
- Goal: Ensure workflow assignees are role refs resolved by RBAC PDP rather than local user lists.
- Required gate: `sliderule-v2-workflow-assignee-pdp-resolution-115Gates`

## Context
115 V2 Skill hardening deepens the existing five legacy Skills after AIGC 114. Keep every change runtime-less: pure data, pure validation, pure projection, pure resolve surfaces. Do not add database, Redis, provider, browser, or real service runtime code.

## Allowed files
- `client/src/lib/skills/workflow/workflowModel.ts`
- `client/src/lib/skills/workflow/workflowSkill.ts`
- `client/src/lib/skills/workflow/workflowSkill.test.ts`
- `agent-loop/tasks/sliderule-v2-workflow-assignee-pdp-resolution-115.md`

## Do not
- Do not modify unrelated UI, dashboard, or AgentLoop runtime files.
- Do not use `git add -A`.
- Do not introduce credential material, provider credentials, network calls, database access, Redis access, or tool execution.
- Do not weaken existing validation gates or delete existing tests unless the task explicitly replaces them with stricter tests.
- Do not mark this task reviewed until the required validation commands have fresh evidence.

## Implementation steps
- [x] Start from a clean worktree or queue worktree and inspect current Skill behavior.
- [x] Write or update the failing test that proves this hardening behavior is missing.
- [x] Represent approval assignees as PDP role refs.
- [x] Validate missing role refs with RBAC external context.
- [x] Project dashed edges from approval nodes to RBAC role nodes.
- [x] Implement the smallest runtime-less model, validator, projector, resolve, or impact change needed.
- [x] Update documentation only when it clarifies the new V2 contract.
- [x] Append review evidence after validation passes.

## Required validation
- `pnpm exec vitest run client/src/lib/skills/workflow/workflowSkill.test.ts client/src/lib/skills/rbac/rbacSkill.test.ts --reporter=dot`
- `pnpm exec tsc --noEmit --pretty false`
- `node agent-loop/src/check-mojibake.js {{taskFile}}`

## Acceptance criteria
- The task advances the V2 sample diagram semantics for its phase.
- New behavior has focused tests with at least one positive case and one negative case when a gate is involved.
- Existing purchase approval and AIGC 114 behavior remains compatible.
- Validation commands have fresh passing evidence recorded in this task file.

## Manual rescue evidence
- 2026-06-27: Made `assigneeRoleRef` the authoritative Workflow -> RBAC PDP role ref, added missing-ref validation, and projected dashed approval-to-role edges.
- Focused verification: `vitest run client/src/lib/skills/rbac/rbacSkill.test.ts client/src/lib/skills/workflow/workflowSkill.test.ts client/src/lib/skills/impact.test.ts client/src/lib/skills/appbundle/appBundleSkill.test.ts client/src/lib/skills/orchestrator.test.ts client/src/lib/skills/kernel.test.ts --reporter=dot` -> 6 files, 214 tests passed.
- Full skills verification: `vitest run client/src/lib/skills --reporter=dot` -> 10 files, 324 tests passed.
- Typecheck: `tsc --noEmit --pretty false` -> passed.
- Mojibake: `node agent-loop/src/check-mojibake.js ... sliderule-v2-workflow-assignee-pdp-resolution-115.md` -> No mojibake findings.
- Note: 115 rescue worktree lacked local `vitest`/`tsc` pnpm bins, so verification used the main checkout binaries against this worktree; exact `pnpm exec` commands are rerun after landing on main.
