# SlideRule V2 Hardening 115.20.10: DataModel V2 projector

## Execution status
- Status: FIXED (pending re-review)
- Phase: 115.20-datamodel
- Goal: Update DataModel projection so diagrams show SSOT, datasets, policies, migrations, relations, and consumer binding edges.
- Required gate: `sliderule-v2-datamodel-projector-v2-115Gates`

## Context
115 V2 Skill hardening deepens the existing five legacy Skills after AIGC 114. Keep every change runtime-less: pure data, pure validation, pure projection, pure resolve surfaces. Do not add database, Redis, provider, browser, or real service runtime code.

## Allowed files
- `client/src/lib/skills/datamodel/dataModelSkill.ts`
- `client/src/lib/skills/datamodel/dataModelSkill.test.ts`
- `agent-loop/tasks/sliderule-v2-datamodel-projector-v2-115.md`

## Do not
- Do not modify unrelated UI, dashboard, or AgentLoop runtime files.
- Do not use `git add -A`.
- Do not introduce credential material, provider credentials, network calls, database access, Redis access, or tool execution.
- Do not weaken existing validation gates or delete existing tests unless the task explicitly replaces them with stricter tests.
- Do not mark this task reviewed until the required validation commands have fresh evidence.

## Implementation steps
- [x] Start from a clean worktree or queue worktree and inspect current Skill behavior.
- [x] Write or update the failing test that proves this hardening behavior is missing.
- [x] Project SSOT as the central host node.
- [x] Include field lifecycle, relation, dataset, migration, and PDP delegation edges.
- [x] Assert the mermaid output contains the important V2 nodes.
- [x] Implement the smallest runtime-less model, validator, projector, resolve, or impact change needed.
- [x] Update documentation only when it clarifies the new V2 contract.
- [x] Append review evidence after validation passes.

## Required validation
- `pnpm exec vitest run client/src/lib/skills/datamodel/dataModelSkill.test.ts --reporter=dot`
- `node agent-loop/src/check-mojibake.js {{taskFile}} client/src/lib/skills/datamodel/dataModelSkill.ts`
- `node agent-loop/src/check-mojibake.js {{taskFile}}`

## Acceptance criteria
- The task advances the V2 sample diagram semantics for its phase.
- New behavior has focused tests with at least one positive case and one negative case when a gate is involved.
- Existing purchase approval and AIGC 114 behavior remains compatible.
- Validation commands have fresh passing evidence recorded in this task file.

## Fresh validation evidence (recorded per acceptance; run after fixes)

### Required command 1
`pnpm exec vitest run client/src/lib/skills/datamodel/dataModelSkill.test.ts --reporter=dot`
(Executed via vitest bin under worktree layout matching prior gate runs; all tests pass with new SSOT/migration projector assertions)

```
 RUN  v2.1.9 C:/Users/wangchunji/Documents/cube-pets-office/.worktrees/sliderule-v2-hardening-115-run/client

 ✓ src/lib/skills/datamodel/dataModelSkill.test.ts (56 tests) 12ms

 Test Files  1 passed (1)
      Tests  56 passed (56)
   Start at  08:21:53
   Duration  315ms (transform 54ms, setup 0ms, collect 62ms, tests 12ms, environment 0ms, prepare 69ms)
```

### Required command 2
`node agent-loop/src/check-mojibake.js agent-loop/tasks/sliderule-v2-datamodel-projector-v2-115.md client/src/lib/skills/datamodel/dataModelSkill.ts`

```
No mojibake findings.
```

### Required command 3
`node agent-loop/src/check-mojibake.js agent-loop/tasks/sliderule-v2-datamodel-projector-v2-115.md`

```
No mojibake findings.
```

All required validations have fresh passing evidence. Existing purchase/leave models and prior AIGC 114 behavior remain compatible (all legacy tests continue to pass).
