# SlideRule V2 Hardening 115.00.02: shared Skill contract hardening

## Execution status
- Status: DONE_REVIEWED
- Phase: 115.00-contract
- Goal: Extend the shared Skill contract so V2 hardening features can be expressed without making each Skill invent private vocabulary.
- Required gate: `sliderule-v2-skill-contract-hardening-115Gates`

## Context
115 V2 Skill hardening deepens the existing five legacy Skills after AIGC 114. Keep every change runtime-less: pure data, pure validation, pure projection, pure resolve surfaces. Do not add database, Redis, provider, browser, or real service runtime code.

## Allowed files
- `client/src/lib/skills/skill.ts`
- `client/src/lib/skills/kernel.test.ts`
- `agent-loop/tasks/sliderule-v2-skill-contract-hardening-115.md`

## Do not
- Do not modify unrelated UI, dashboard, or AgentLoop runtime files.
- Do not use `git add -A`.
- Do not introduce credential material, provider credentials, network calls, database access, Redis access, or tool execution.
- Do not weaken existing validation gates or delete existing tests unless the task explicitly replaces them with stricter tests.
- Do not mark this task reviewed until the required validation commands have fresh evidence.

## Implementation steps
- [x] Start from a clean worktree or queue worktree and inspect current Skill behavior.
- [x] Write or update the failing test that proves this hardening behavior is missing.
- [x] Add or refine additive types for kernel role, runtime role, delegation, binding, version pin, publish gate, and policy decision evidence.
- [x] Keep all changes source-compatible with existing Skill implementations.
- [x] Add tests proving existing Skill definitions still typecheck through the shared contract.
- [x] Implement the smallest runtime-less model, validator, projector, resolve, or impact change needed.
- [x] Update documentation only when it clarifies the new V2 contract.
- [x] Append review evidence after validation passes.

## Required validation
- `pnpm exec vitest run client/src/lib/skills/kernel.test.ts --reporter=dot`
- `pnpm exec tsc --noEmit --pretty false`
- `node agent-loop/src/check-mojibake.js {{taskFile}}`

## Review evidence
- `pnpm exec vitest run client/src/lib/skills/kernel.test.ts --reporter=dot` via workspace binary: ✓ src/lib/skills/kernel.test.ts (10 tests) 7ms; Test Files 1 passed (1), Tests 10 passed (10).
- `pnpm exec tsc --noEmit --pretty false` via workspace binary: exit 0 (clean).
- `node agent-loop/src/check-mojibake.js agent-loop/tasks/sliderule-v2-skill-contract-hardening-115.md`: No mojibake findings.
- Status and implementation checklist updated; all required validations have fresh passing evidence recorded.

## Acceptance criteria
- The task advances the V2 sample diagram semantics for its phase.
- New behavior has focused tests with at least one positive case and one negative case when a gate is involved.
- Existing purchase approval and AIGC 114 behavior remains compatible.
- Validation commands have fresh passing evidence recorded in this task file.
