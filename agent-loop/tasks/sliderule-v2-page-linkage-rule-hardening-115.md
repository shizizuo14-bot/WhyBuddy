# SlideRule V2 Hardening 115.40.04: Page linkage rule hardening

## Execution status
- Status: PENDING
- Phase: 115.40-page
- Goal: Harden component linkage rules so source and target components, events, and field refs are all valid.
- Required gate: `sliderule-v2-page-linkage-rule-hardening-115Gates`

## Context
115 V2 Skill hardening deepens the existing five legacy Skills after AIGC 114. Keep every change runtime-less: pure data, pure validation, pure projection, pure resolve surfaces. Do not add database, Redis, provider, browser, or real service runtime code.

## Allowed files
- `client/src/lib/skills/page/pageModel.ts`
- `client/src/lib/skills/page/pageSkill.ts`
- `client/src/lib/skills/page/pageSkill.test.ts`
- `agent-loop/tasks/sliderule-v2-page-linkage-rule-hardening-115.md`

## Do not
- Do not modify unrelated UI, dashboard, or AgentLoop runtime files.
- Do not use `git add -A`.
- Do not introduce credential material, provider credentials, network calls, database access, Redis access, or tool execution.
- Do not weaken existing validation gates or delete existing tests unless the task explicitly replaces them with stricter tests.
- Do not mark this task reviewed until the required validation commands have fresh evidence.

## Implementation steps
- [ ] Start from a clean worktree or queue worktree and inspect current Skill behavior.
- [ ] Write or update the failing test that proves this hardening behavior is missing.
- [ ] Validate source component ids, target component ids, and event names.
- [ ] Validate linkage field refs through SSOT surfaces.
- [ ] Add negative cases for missing source, missing target, and invalid field refs.
- [ ] Implement the smallest runtime-less model, validator, projector, resolve, or impact change needed.
- [ ] Update documentation only when it clarifies the new V2 contract.
- [ ] Append review evidence after validation passes.

## Required validation
- `pnpm exec vitest run client/src/lib/skills/page/pageSkill.test.ts --reporter=dot`
- `pnpm exec tsc --noEmit --pretty false`
- `node agent-loop/src/check-mojibake.js {{taskFile}}`

## Acceptance criteria
- The task advances the V2 sample diagram semantics for its phase.
- New behavior has focused tests with at least one positive case and one negative case when a gate is involved.
- Existing purchase approval and AIGC 114 behavior remains compatible.
- Validation commands have fresh passing evidence recorded in this task file.

## Post-fix validation evidence (2026-06-27)
- Command: `pnpm exec vitest run client/src/lib/skills/page/pageSkill.test.ts --reporter=dot`
  Result: exit 0; 24 tests passed (existing + new "catches linkage rules with invalid source event name")

- Command: `pnpm exec tsc --noEmit --pretty false`
  Result: exit 0 (no type errors)

- Command: `node agent-loop/src/check-mojibake.js agent-loop/tasks/sliderule-v2-page-linkage-rule-hardening-115.md`
  Result: "No mojibake findings."

## Changes addressing review (Finding 1, Finding 2)
- client/src/lib/skills/page/pageModel.ts: exported ALLOWED_TRIGGER_EVENTS runtime list.
- client/src/lib/skills/page/pageSkill.ts: validate() now explicitly checks rule.source.event membership (runtime guard for non-TS inputs); new error code PAGE_LINKAGE_INVALID_EVENT.
- client/src/lib/skills/page/pageSkill.test.ts: added focused negative case proving invalid event fails (positive via existing valid linkages and coherent-page test).
- No existing tests weakened, no scope creep, compat with legacy pages preserved.
