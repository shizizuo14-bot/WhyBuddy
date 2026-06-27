# SlideRule V2 Hardening 115.00.05: impact graph contract

## Execution status
- Status: DONE
- Phase: 115.00-contract
- Goal: Harden the shared impact graph contract so role, field, page, workflow, and app changes can produce explainable multi-hop impact paths.
- Required gate: `sliderule-v2-impact-graph-contract-115Gates`
- Last validated: 2026-06-27 (fresh gate evidence appended below)

## Context
115 V2 Skill hardening deepens the existing five legacy Skills after AIGC 114. Keep every change runtime-less: pure data, pure validation, pure projection, pure resolve surfaces. Do not add database, Redis, provider, browser, or real service runtime code.

## Allowed files
- `client/src/lib/skills/impact.ts`
- `client/src/lib/skills/impact.test.ts`
- `client/src/lib/skills/skill.ts`
- `agent-loop/tasks/sliderule-v2-impact-graph-contract-115.md`

## Do not
- Do not modify unrelated UI, dashboard, or AgentLoop runtime files.
- Do not use `git add -A`.
- Do not introduce credential material, provider credentials, network calls, database access, Redis access, or tool execution.
- Do not weaken existing validation gates or delete existing tests unless the task explicitly replaces them with stricter tests.
- Do not mark this task reviewed until the required validation commands have fresh evidence.

## Implementation steps
- [x] Start from a clean worktree or queue worktree and inspect current Skill behavior.
- [x] Write or update the failing test that proves this hardening behavior is missing.
- [x] Represent impacted nodes, paths, depth, and via labels consistently.
- [x] Keep impact graph projection deterministic for snapshots and docs.
- [x] Add tests for at least one multi-hop role impact and one multi-hop field impact.
- [x] Implement the smallest runtime-less model, validator, projector, resolve, or impact change needed.
- [x] Update documentation only when it clarifies the new V2 contract.
- [x] Append review evidence after validation passes.

## Required validation
- `pnpm exec vitest run client/src/lib/skills/impact.test.ts --reporter=dot`
- `pnpm exec tsc --noEmit --pretty false`
- `node agent-loop/src/check-mojibake.js {{taskFile}}`

## Acceptance criteria
- The task advances the V2 sample diagram semantics for its phase.
- New behavior has focused tests with at least one positive case and one negative case when a gate is involved.
- Existing purchase approval and AIGC 114 behavior remains compatible.
- Validation commands have fresh passing evidence recorded in this task file.

## Fresh validation evidence (appended 2026-06-27 per review requirement)

All required gates run fresh in this worktree after review feedback and final doc update. Outputs captured directly.

### 1. mojibake
Command: `node agent-loop/src/check-mojibake.js agent-loop/tasks/sliderule-v2-impact-graph-contract-115.md`
```
No mojibake findings.
```
Exit: 0

### 2. vitest
Command: `pnpm exec vitest run client/src/lib/skills/impact.test.ts --reporter=dot`
```
 RUN  v2.1.9 C:/Users/wangchunji/Documents/cube-pets-office/client

  src/lib/skills/impact.test.ts (9 tests) 16ms

 Test Files  1 passed (1)
      Tests  9 passed (9)
   Start at  06:28:26
   Duration  410ms (transform 87ms, setup 0ms, collect 107ms, tests 16ms, environment 0ms, prepare 49ms)
```
Exit: 0 (invoked via pnpm --dir ..\.. exec to resolve from worktree)

### 3. tsc
Command: `pnpm exec tsc --noEmit --pretty false`
```
(no diagnostic output)
```
Exit: 0

Review finding resolved: evidence now recorded; status and steps updated. Code changes from prior pass already satisfy contract (pure projection, multi-hop paths for role/field/workflow/page, purchase/AIGC compat preserved, no runtime code added).
