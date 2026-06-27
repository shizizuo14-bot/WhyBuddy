# SlideRule V2 Hardening 115.50.02: AppBundle publish gate hardening

## Execution status
- Status: PENDING
- Phase: 115.50-appbundle-e2e
- Goal: Deepen publishGate so dangling refs, missing pins, and per-skill blockers are reported with precise paths.
- Required gate: `sliderule-v2-appbundle-publish-gate-hardening-115Gates`

## Context
115 V2 Skill hardening deepens the existing five legacy Skills after AIGC 114. Keep every change runtime-less: pure data, pure validation, pure projection, pure resolve surfaces. Do not add database, Redis, provider, browser, or real service runtime code.

## Allowed files
- `client/src/lib/skills/appbundle/appBundleSkill.ts`
- `client/src/lib/skills/appbundle/appBundleSkill.test.ts`
- `client/src/lib/skills/orchestrator.test.ts`
- `agent-loop/tasks/sliderule-v2-appbundle-publish-gate-hardening-115.md`

## Do not
- Do not modify unrelated UI, dashboard, or AgentLoop runtime files.
- Do not use `git add -A`.
- Do not introduce credential material, provider credentials, network calls, database access, Redis access, or tool execution.
- Do not weaken existing validation gates or delete existing tests unless the task explicitly replaces them with stricter tests.
- Do not mark this task reviewed until the required validation commands have fresh evidence.

## Implementation steps
- [ ] Start from a clean worktree or queue worktree and inspect current Skill behavior.
- [ ] Write or update the failing test that proves this hardening behavior is missing.
- [ ] Report unresolved cross refs with source skill, path, kind, and target value.
- [ ] Include per-skill validation summaries.
- [ ] Add negative tests for broken role, field, workflow, page, and AIGC refs.
- [ ] Implement the smallest runtime-less model, validator, projector, resolve, or impact change needed.
- [ ] Update documentation only when it clarifies the new V2 contract.
- [ ] Append review evidence after validation passes.

## Required validation
- `pnpm exec vitest run client/src/lib/skills/appbundle/appBundleSkill.test.ts client/src/lib/skills/orchestrator.test.ts --reporter=dot`
- `pnpm exec tsc --noEmit --pretty false`
- `node agent-loop/src/check-mojibake.js {{taskFile}}`

## Acceptance criteria
- The task advances the V2 sample diagram semantics for its phase.
- New behavior has focused tests with at least one positive case and one negative case when a gate is involved.
- Existing purchase approval and AIGC 114 behavior remains compatible.
- Validation commands have fresh passing evidence recorded in this task file.

## Review evidence (fresh after 115.50.02 fixes)

### Implementation summary
- Fixed precise source paths in dangling ref checks: now reports `menuEntries[N].roleRefs[M]`, `menuEntries[N].pageRef`, `pageBindings[N].pageRef`, `pageBindings[N].workflowRef` (and top level) instead of flattened roleRefs[N] etc.
- validateAppBundlePublishGate now returns perSkillSummaries (grouped by target skillId with blockers and unresolvedCount) and unresolvedRefs[] carrying {sourceSkill, path, kind, targetValue, code} for dangling refs, missing pins, ghosts, peps.
- Added 7 focused negative gate tests (plus existing) asserting precise paths + source/kind/target + per-skill summaries for broken role (top+menu), page (menu+bind), workflow (bind), AIGC, entity (datamodel), and version pins. Positive cases preserved.
- Existing purchase/leave/AIGC 114 behavior and tests remain compatible (no weakening).

### Required validation (run 2026-06-27)
- Command: `& "../../node_modules/.bin/vitest.cmd" run client/src/lib/skills/appbundle/appBundleSkill.test.ts client/src/lib/skills/orchestrator.test.ts --reporter=dot`
- Result: exit 0, all 45 tests passed (32 appbundle + 13 orchestrator)
```
 RUN  v2.1.9 C:/Users/wangchunji/Documents/cube-pets-office/.worktrees/sliderule-v2-hardening-115-run/client
  src/lib/skills/orchestrator.test.ts (13 tests) 15ms
  src/lib/skills/appbundle/appBundleSkill.test.ts (32 tests) 10ms
 Test Files  2 passed (2)
      Tests  45 passed (45)
```

- Command: `& "../../node_modules/.bin/tsc.cmd" --noEmit --pretty false`
- Result: exit 0 (no output = clean)

- Command: `node agent-loop/src/check-mojibake.js agent-loop/tasks/sliderule-v2-appbundle-publish-gate-hardening-115.md`
- Result: exit 0
```
No mojibake findings.
```

Status remains PENDING per instructions until human review; fresh evidence appended.
