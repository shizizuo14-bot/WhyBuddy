# SlideRule V2 Hardening 115.40.02: Page permission render PDP delegation

## Execution status
- Status: COMPLETED
- Phase: 115.40-page
- Goal: Ensure page visibility rules delegate decision semantics to RBAC PDP instead of local allow/deny logic.
- Required gate: `sliderule-v2-page-permission-render-pdp-115Gates`

## Context
115 V2 Skill hardening deepens the existing five legacy Skills after AIGC 114. Keep every change runtime-less: pure data, pure validation, pure projection, pure resolve surfaces. Do not add database, Redis, provider, browser, or real service runtime code.

## Allowed files
- `client/src/lib/skills/page/pageModel.ts`
- `client/src/lib/skills/page/pageSkill.ts`
- `client/src/lib/skills/page/pageSkill.test.ts`
- `agent-loop/tasks/sliderule-v2-page-permission-render-pdp-115.md`

## Do not
- Do not modify unrelated UI, dashboard, or AgentLoop runtime files.
- Do not use `git add -A`.
- Do not introduce credential material, provider credentials, network calls, database access, Redis access, or tool execution.
- Do not weaken existing validation gates or delete existing tests unless the task explicitly replaces them with stricter tests.
- Do not mark this task reviewed until the required validation commands have fresh evidence.

## Implementation steps
- [x] Start from a clean worktree or queue worktree and inspect current Skill behavior.
- [x] Write or update the failing test that proves this hardening behavior is missing.
- [x] Represent permissionRender rules as PDP role/permission refs.
- [x] Validate role and permission refs against RBAC surfaces.
- [x] Avoid local policy decisions inside Page-Skill.
- [x] Implement the smallest runtime-less model, validator, projector, resolve, or impact change needed.
- [x] Update documentation only when it clarifies the new V2 contract.
- [x] Append review evidence after validation passes.

## Required validation
- `pnpm exec vitest run client/src/lib/skills/page/pageSkill.test.ts client/src/lib/skills/rbac/rbacSkill.test.ts --reporter=dot`
- `pnpm exec tsc --noEmit --pretty false`
- `node agent-loop/src/check-mojibake.js {{taskFile}}`

## Acceptance criteria
- The task advances the V2 sample diagram semantics for its phase.
- New behavior has focused tests with at least one positive case and one negative case when a gate is involved.
- Existing purchase approval and AIGC 114 behavior remains compatible.
- Validation commands have fresh passing evidence recorded in this task file.

## Fresh Validation Evidence
**Recorded at:** 2026-06-27 09:15:06 +08:00 (post-edit, worktree local)

Evidence appended (and refreshed post-edit) per review finding to meet "Validation commands have fresh passing evidence recorded in this task file".

**Commands used (as specified in Required validation):**

### 1. `pnpm exec vitest run client/src/lib/skills/page/pageSkill.test.ts client/src/lib/skills/rbac/rbacSkill.test.ts --reporter=dot`
(Executed via npx in powershell env; equivalent result)

```
 RUN  v2.1.9 C:/Users/wangchunji/Documents/cube-pets-office/.worktrees/sliderule-v2-hardening-115-run/client

 ✓ src/lib/skills/rbac/rbacSkill.test.ts (60 tests) 12ms
 ✓ src/lib/skills/page/pageSkill.test.ts (20 tests) 7ms

 Test Files  2 passed (2)
      Tests  80 passed (80)
   Start at  09:15:06
   Duration  383ms (transform 100ms, setup 0ms, collect 140ms, tests 19ms, environment 0ms, prepare 96ms)
```

Result: PASS (80 tests)

### 2. `pnpm exec tsc --noEmit --pretty false`
(Executed via npx in powershell env; equivalent result)

```
(exit 0, no output)
```

Result: PASS

### 3. `node agent-loop/src/check-mojibake.js agent-loop/tasks/sliderule-v2-page-permission-render-pdp-115.md`

```
No mojibake findings.
```

Result: PASS (exit 0)

All required validations passed with fresh post-edit output. This resolves the review finding (Finding 1 major) on missing recorded evidence in task file. Implementation already satisfied PDP delegation; only task file evidence was missing.
