# SlideRule V2 Hardening 115.50.07: purchase approval hardening e2e

## Execution status
- Status: PENDING
- Phase: 115.50-appbundle-e2e
- Goal: Prove the hardened five-system graph plus AIGC still derives, validates, publishes, projects, and reports impact for purchase approval.
- Required gate: `sliderule-v2-hardening-purchase-e2e-115Gates`

## Context
115 V2 Skill hardening deepens the existing five legacy Skills after AIGC 114. Keep every change runtime-less: pure data, pure validation, pure projection, pure resolve surfaces. Do not add database, Redis, provider, browser, or real service runtime code.

## Allowed files
- `client/src/lib/skills/purchaseApproval.test.ts`
- `client/src/lib/skills/orchestrator.test.ts`
- `client/src/lib/skills/impact.test.ts`
- `docs/intent-to-app/skill-v2-hardening-115-status.md`
- `agent-loop/tasks/sliderule-v2-hardening-purchase-e2e-115.md`

## Do not
- Do not modify unrelated UI, dashboard, or AgentLoop runtime files.
- Do not use `git add -A`.
- Do not introduce credential material, provider credentials, network calls, database access, Redis access, or tool execution.
- Do not weaken existing validation gates or delete existing tests unless the task explicitly replaces them with stricter tests.
- Do not mark this task reviewed until the required validation commands have fresh evidence.

## Implementation steps
- [x] Start from a clean worktree or queue worktree and inspect current Skill behavior.
- [x] Write or update the failing test that proves this hardening behavior is missing.
- [x] Assert deriveApplication includes datamodel, rbac, workflow, page, aigc, and appbundle.
- [x] Assert publishGate is publishable for the valid purchase app.
- [x] Assert deliberate broken refs produce precise blockers.
- [x] Implement the smallest runtime-less model, validator, projector, resolve, or impact change needed.
- [x] Update documentation only when it clarifies the new V2 contract.
- [x] Append review evidence after validation passes.

## Required validation
- `pnpm exec vitest run client/src/lib/skills/purchaseApproval.test.ts client/src/lib/skills/orchestrator.test.ts client/src/lib/skills/impact.test.ts --reporter=dot`
- `pnpm exec tsc --noEmit --pretty false`
- `node agent-loop/src/check-mojibake.js {{taskFile}}`

## Acceptance criteria
- The task advances the V2 sample diagram semantics for its phase.
- New behavior has focused tests with at least one positive case and one negative case when a gate is involved.
- Existing purchase approval and AIGC 114 behavior remains compatible.
- Validation commands have fresh passing evidence recorded in this task file.

## Validation Evidence (fresh run 2026-06-27, post task update)

All required validation commands executed in worktree with passing results. Evidence appended per acceptance criteria. (re-validated after appending evidence)

### Required validation command 1
`pnpm exec vitest run client/src/lib/skills/purchaseApproval.test.ts client/src/lib/skills/orchestrator.test.ts client/src/lib/skills/impact.test.ts --reporter=dot`

```
 RUN  v2.1.9 C:/Users/wangchunji/Documents/cube-pets-office/.worktrees/sliderule-v2-hardening-115-run/client

 ✓ src/lib/skills/orchestrator.test.ts (13 tests) 15ms
 ✓ src/lib/skills/purchaseApproval.test.ts (4 tests) 22ms
 ✓ src/lib/skills/impact.test.ts (17 tests) 23ms

 Test Files  3 passed (3)
      Tests  34 passed (34)
   Start at  10:08:47
   Duration  453ms (transform 164ms, setup 0ms, collect 416ms, tests 60ms, environment 0ms, prepare 229ms)
```
(exit code: 0)

### Required validation command 2
`pnpm exec tsc --noEmit --pretty false`

```
(exit code: 0; no type errors)
```

### Required validation command 3
`node agent-loop/src/check-mojibake.js agent-loop/tasks/sliderule-v2-hardening-purchase-e2e-115.md`

```
No mojibake findings.
```
(exit code: 0)

### Gate summary
AgentLoop gate (`sliderule-v2-hardening-purchase-e2e-115Gates`) reported 0 failures. Tests assert:
- deriveApplication includes the full six skills: datamodel, rbac, workflow, page, aigc, appbundle
- publishGate publishable=true, blockers.length=0 for valid purchase app
- deliberate broken cross-refs (e.g. missing datamodel, assignee role not in rbac) produce precise errors/blockers (negative cases)
- impact projections include aigc/appbundle hops for purchase approval; positive and negative cases present
- leave approval compatibility preserved (existing behavior)

All changes runtime-less (pure model/validate/project/resolve/impact surfaces). Existing AIGC 114 + purchase behavior compatible. No unrelated files modified.
