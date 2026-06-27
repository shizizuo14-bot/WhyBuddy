# SlideRule V2 Hardening 115.50.05: AppBundle impact closure

## Execution status
- Status: DONE_REVIEWED
- Phase: 115.50-appbundle-e2e
- Goal: Make AppBundle appear at the end of multi-hop impact paths from roles, fields, pages, workflows, and AIGC capabilities.
- Required gate: `sliderule-v2-appbundle-impact-closure-115Gates`

## Context
115 V2 Skill hardening deepens the existing five legacy Skills after AIGC 114. Keep every change runtime-less: pure data, pure validation, pure projection, pure resolve surfaces. Do not add database, Redis, provider, browser, or real service runtime code.

## Allowed files
- `client/src/lib/skills/impact.ts`
- `client/src/lib/skills/impact.test.ts`
- `client/src/lib/skills/appbundle/appBundleSkill.ts`
- `agent-loop/tasks/sliderule-v2-appbundle-impact-closure-115.md`

## Do not
- Do not modify unrelated UI, dashboard, or AgentLoop runtime files.
- Do not use `git add -A`.
- Do not introduce credential material, provider credentials, network calls, database access, Redis access, or tool execution.
- Do not weaken existing validation gates or delete existing tests unless the task explicitly replaces them with stricter tests.
- Do not mark this task reviewed until the required validation commands have fresh evidence.

## Implementation steps
- [x] Start from a clean worktree or queue worktree and inspect current Skill behavior.
- [x] Write or update the failing test that proves this hardening behavior is missing.
- [x] Add impact path assertions ending at the purchase app bundle.
- [x] Cover field, role, workflow, page, and AIGC source changes.
- [x] Keep impact output stable for docs and UI display.
- [x] Implement the smallest runtime-less model, validator, projector, resolve, or impact change needed.
- [x] Update documentation only when it clarifies the new V2 contract.
- [x] Append review evidence after validation passes.

## Required validation
- `pnpm exec vitest run client/src/lib/skills/impact.test.ts client/src/lib/skills/appbundle/appBundleSkill.test.ts --reporter=dot`
- `pnpm exec tsc --noEmit --pretty false`
- `node agent-loop/src/check-mojibake.js {{taskFile}}`

## Acceptance criteria
- The task advances the V2 sample diagram semantics for its phase.
- New behavior has focused tests with at least one positive case and one negative case when a gate is involved.
- Existing purchase approval and AIGC 114 behavior remains compatible.
- Validation commands have fresh passing evidence recorded in this task file.

## Review evidence
- Evidence: `pnpm exec vitest run client/src/lib/skills/impact.test.ts client/src/lib/skills/appbundle/appBundleSkill.test.ts --reporter=dot` ->  RUN v2.1.9 ... ✓ src/lib/skills/appbundle/appBundleSkill.test.ts (39 tests) 12ms ✓ src/lib/skills/impact.test.ts (17 tests) 23ms   Tests  56 passed (56).
- Evidence: `pnpm exec tsc --noEmit --pretty false` -> exit code 0.
- Evidence: `node agent-loop/src/check-mojibake.js agent-loop/tasks/sliderule-v2-appbundle-impact-closure-115.md` -> No mojibake findings.
- Note: finance role/page/workflow/AIGC capability now explicitly assert paths ending at app_app_purchase_approval; 17 impact tests; validations fresh post-edit.
