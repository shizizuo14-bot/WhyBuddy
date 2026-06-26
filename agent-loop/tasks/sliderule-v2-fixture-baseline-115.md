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
- [ ] Start from a clean worktree or queue worktree and inspect current Skill behavior.
- [ ] Write or update the failing test that proves this hardening behavior is missing.
- [ ] Define the canonical purchase approval scenario roles, fields, workflow nodes, pages, AIGC capability, and app bundle refs.
- [ ] Keep fixtures deterministic and runtime-less.
- [ ] Add a baseline test proving the full skill graph still validates and publishes.
- [ ] Implement the smallest runtime-less model, validator, projector, resolve, or impact change needed.
- [ ] Update documentation only when it clarifies the new V2 contract.
- [ ] Append review evidence after validation passes.

## Required validation
- `pnpm exec vitest run client/src/lib/skills/purchaseApproval.test.ts client/src/lib/skills/orchestrator.test.ts --reporter=dot`
- `pnpm exec tsc --noEmit --pretty false`
- `node agent-loop/src/check-mojibake.js {{taskFile}}`

## Acceptance criteria
- The task advances the V2 sample diagram semantics for its phase.
- New behavior has focused tests with at least one positive case and one negative case when a gate is involved.
- Existing purchase approval and AIGC 114 behavior remains compatible.
- Validation commands have fresh passing evidence recorded in this task file.
