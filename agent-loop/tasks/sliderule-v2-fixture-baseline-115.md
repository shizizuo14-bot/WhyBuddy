# SlideRule V2 Hardening 115.00.06: shared fixture baseline

## Execution status
- Status: PENDING
- Phase: 115.00-contract
- Goal: Create or normalize shared purchase approval fixtures so every hardening task validates against the same business world.
- Required gate: `sliderule-v2-fixture-baseline-115Gates`

## Context
115 V2 Skill hardening deepens the existing five legacy Skills after AIGC 114. Keep every change runtime-less: pure data, pure validation, pure projection, pure resolve surfaces. Do not add database, Redis, provider, browser, or real service runtime code.

## Allowed files
- `client/src/lib/skills/purchaseApproval.test.ts`
- `client/src/lib/skills/orchestrator.test.ts`
- `docs/intent-to-app/skill-v2-hardening-115-status.md`
- `agent-loop/tasks/sliderule-v2-fixture-baseline-115.md`

## Do not
- Do not modify unrelated UI, dashboard, or AgentLoop runtime files.
- Do not use `git add -A`.
- Do not introduce credential material, provider credentials, network calls, database access, Redis access, or tool execution.
- Do not weaken existing validation gates or delete existing tests unless the task explicitly replaces them with stricter tests.
- Do not mark this task reviewed until the required validation commands have fresh evidence.

## Implementation steps
- [x] Start from a clean worktree or queue worktree and inspect current Skill behavior.
- [x] Write or update the failing test that proves this hardening behavior is missing.
- [x] Define the canonical purchase approval scenario roles, fields, workflow nodes, pages, AIGC capability, and app bundle refs.
- [x] Keep fixtures deterministic and runtime-less.
- [x] Add a baseline test proving the full skill graph still validates and publishes.
- [x] Implement the smallest runtime-less model, validator, projector, resolve, or impact change needed.
- [x] Update documentation only when it clarifies the new V2 contract.
- [x] Append review evidence after validation passes.

## Required validation
- `pnpm exec vitest run client/src/lib/skills/purchaseApproval.test.ts client/src/lib/skills/orchestrator.test.ts --reporter=dot`
- `pnpm exec tsc --noEmit --pretty false`
- `node agent-loop/src/check-mojibake.js {{taskFile}}`

## Acceptance criteria
- The task advances the V2 sample diagram semantics for its phase.
- New behavior has focused tests with at least one positive case and one negative case when a gate is involved.
- Existing purchase approval and AIGC 114 behavior remains compatible.
- Validation commands have fresh passing evidence recorded in this task file.

## Validation evidence
Fresh passing evidence (2026-06-27) for purchase approval shared fixture baseline. Tests already cover baseline fixture, publishGate, impact paths, and leave approval compatibility (no code change in this record step; evidence appended per acceptance criteria).

```powershell
pnpm exec vitest run client/src/lib/skills/purchaseApproval.test.ts client/src/lib/skills/orchestrator.test.ts --reporter=dot
pnpm exec tsc --noEmit --pretty false
node agent-loop/src/check-mojibake.js agent-loop/tasks/sliderule-v2-fixture-baseline-115.md
```

Vitest output:
```
 RUN  v2.1.9 C:/Users/wangchunji/Documents/cube-pets-office/.worktrees/sliderule-v2-hardening-115-run/client

 ✓ src/lib/skills/orchestrator.test.ts (11 tests) 12ms
 ✓ src/lib/skills/purchaseApproval.test.ts (4 tests) 19ms

 Test Files  2 passed (2)
      Tests  15 passed (15)
   Start at  06:30:18
   Duration  404ms (transform 101ms, setup 0ms, collect 208ms, tests 31ms, environment 0ms, prepare 126ms)
```

TSC output: (exit 0, no errors)

Mojibake output:
```
No mojibake findings.
```

All gates exit 0. Fixture baseline (roles: requester/department_manager/finance/procurement, workflow wf_purchase_approval, page page_purchase_request, aigc budget_risk_summary, appbundle app_purchase_approval) validates deterministically.
