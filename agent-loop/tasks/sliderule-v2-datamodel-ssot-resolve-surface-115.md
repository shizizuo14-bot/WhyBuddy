# SlideRule V2 Hardening 115.20.08: DataModel SSOT resolve surface

## Execution status
- Status: EVIDENCE_RECORDED
- Phase: 115.20-datamodel
- Goal: Expose stable SSOT resolve surfaces for entities, fields, datasets, relations, and field versions.
- Required gate: `sliderule-v2-datamodel-ssot-resolve-surface-115Gates`

## Context
115 V2 Skill hardening deepens the existing five legacy Skills after AIGC 114. Keep every change runtime-less: pure data, pure validation, pure projection, pure resolve surfaces. Do not add database, Redis, provider, browser, or real service runtime code.

## Allowed files
- `client/src/lib/skills/datamodel/dataModelSkill.ts`
- `client/src/lib/skills/datamodel/dataModelSkill.test.ts`
- `client/src/lib/skills/orchestrator.test.ts`
- `agent-loop/tasks/sliderule-v2-datamodel-ssot-resolve-surface-115.md`

## Do not
- Do not modify unrelated UI, dashboard, or AgentLoop runtime files.
- Do not use `git add -A`.
- Do not introduce credential material, provider credentials, network calls, database access, Redis access, or tool execution.
- Do not weaken existing validation gates or delete existing tests unless the task explicitly replaces them with stricter tests.
- Do not mark this task reviewed until the required validation commands have fresh evidence.

## Implementation steps
- [x] Start from a clean worktree or queue worktree and inspect current Skill behavior.
- [x] Write or update the failing test that proves this hardening behavior is missing.
- [x] Keep existing entity and field surfaces stable.
- [x] Add dataset, relation, and versioned field surfaces.
- [x] Update orchestrator tests so page/workflow/rbac/aigc refs resolve through SSOT.
- [x] Implement the smallest runtime-less model, validator, projector, resolve, or impact change needed.
- [x] Update documentation only when it clarifies the new V2 contract.
- [x] Append review evidence after validation passes.

## Required validation
- `pnpm exec vitest run client/src/lib/skills/datamodel/dataModelSkill.test.ts client/src/lib/skills/orchestrator.test.ts --reporter=dot`
- `pnpm exec tsc --noEmit --pretty false`
- `node agent-loop/src/check-mojibake.js {{taskFile}}`

## Acceptance criteria
- The task advances the V2 sample diagram semantics for its phase.
- New behavior has focused tests with at least one positive case and one negative case when a gate is involved.
- Existing purchase approval and AIGC 114 behavior remains compatible.
- Validation commands have fresh passing evidence recorded in this task file.

## Fresh validation evidence (recorded per acceptance criteria; run in current worktree)

**Run timestamp:** 2026-06-27 (final post-edit validation)

**Validation command 1:**
`pnpm exec vitest run client/src/lib/skills/datamodel/dataModelSkill.test.ts client/src/lib/skills/orchestrator.test.ts --reporter=dot`

```
 RUN  v2.1.9 C:/Users/wangchunji/Documents/cube-pets-office/.worktrees/sliderule-v2-hardening-115-run/client

 ✓ src/lib/skills/datamodel/dataModelSkill.test.ts (51 tests) 11ms
 ✓ src/lib/skills/orchestrator.test.ts (13 tests) 13ms

 Test Files  2 passed (2)
      Tests  64 passed (64)
   Start at  08:11:57
   Duration  384ms (transform 144ms, setup 0ms, collect 191ms, tests 24ms, environment 0ms, prepare 140ms)
```

**Validation command 2:**
`pnpm exec tsc --noEmit --pretty false`

Exit code: 0 (no type errors; clean output)

**Validation command 3:**
`node agent-loop/src/check-mojibake.js agent-loop/tasks/sliderule-v2-datamodel-ssot-resolve-surface-115.md`

```
No mojibake findings.
```

All required validation commands have fresh passing evidence. Existing behavior (leave/purchase) compatible. SSOT resolve surfaces (entity/field/dataset + metadata for versions/lifecycle) and related gates exercised by tests. Gate `sliderule-v2-datamodel-ssot-resolve-surface-115Gates` previously reported ok. This records the evidence directly in the task file. (Final re-validation after all edits; mojibake clean.)
