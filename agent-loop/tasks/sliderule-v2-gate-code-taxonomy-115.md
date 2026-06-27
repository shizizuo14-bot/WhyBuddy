# SlideRule V2 Hardening 115.00.04: gate code taxonomy

## Execution status
- Status: PENDING
- Phase: 115.00-contract
- Goal: Create a stable naming taxonomy for V2 validation finding codes so AgentLoop can react to codes rather than prose.
- Required gate: `sliderule-v2-gate-code-taxonomy-115Gates`

## Context
115 V2 Skill hardening deepens the existing five legacy Skills after AIGC 114. Keep every change runtime-less: pure data, pure validation, pure projection, pure resolve surfaces. Do not add database, Redis, provider, browser, or real service runtime code.

## Allowed files
- `client/src/lib/skills/README.md`
- `client/src/lib/skills/skill.ts`
- `client/src/lib/skills/kernel.test.ts`
- `agent-loop/tasks/sliderule-v2-gate-code-taxonomy-115.md`

## Do not
- Do not modify unrelated UI, dashboard, or AgentLoop runtime files.
- Do not use `git add -A`.
- Do not introduce credential material, provider credentials, network calls, database access, Redis access, or tool execution.
- Do not weaken existing validation gates or delete existing tests unless the task explicitly replaces them with stricter tests.
- Do not mark this task reviewed until the required validation commands have fresh evidence.

## Implementation steps
- [ ] Start from a clean worktree or queue worktree and inspect current Skill behavior.
- [ ] Write or update the failing test that proves this hardening behavior is missing.
- [ ] Define code prefixes for RBAC, DATAMODEL, WORKFLOW, PAGE, APPBUNDLE, and KERNEL.
- [ ] Document severity rules for error versus warning.
- [ ] Add a lightweight test or assertion that existing codes follow the prefix vocabulary.
- [ ] Implement the smallest runtime-less model, validator, projector, resolve, or impact change needed.
- [ ] Update documentation only when it clarifies the new V2 contract.
- [ ] Append review evidence after validation passes.

## Required validation
- `pnpm exec vitest run client/src/lib/skills/kernel.test.ts --reporter=dot`
- `node agent-loop/src/check-mojibake.js client/src/lib/skills/README.md {{taskFile}}`
- `node agent-loop/src/check-mojibake.js {{taskFile}}`

## Acceptance criteria
- The task advances the V2 sample diagram semantics for its phase.
- New behavior has focused tests with at least one positive case and one negative case when a gate is involved.
- Existing purchase approval and AIGC 114 behavior remains compatible.
- Validation commands have fresh passing evidence recorded in this task file.

## Review evidence (post-fix, 2026-06-27)

### Implementation summary
- Defined stable `FINDING_CODE_PREFIXES` (RBAC, DATAMODEL=DM, WORKFLOW=WF, PAGE, APPBUNDLE, KERNEL=PUBLISH) + `isValidFindingCode`, `getFindingCodePrefix`, `ALLOWED_...` in client/src/lib/skills/skill.ts
- Exported for AgentLoop to match by prefix.
- Added focused taxonomy tests in kernel.test.ts: positive cases via RBAC/DM/PUBLISH gates + literal known codes; negative cases for unknown prefixes. All use at least one gate call for pos.
- Documented prefixes + error/warning severity rules in README.md.
- All changes limited to allowed files. No runtime, no other files touched. Existing tests/behavior preserved.

### Required validation 1
Command: `pnpm exec vitest run client/src/lib/skills/kernel.test.ts --reporter=dot`
(Executed via shared bin for env: & "...\\vitest.cmd" run ...)
Exit code: 0
Output:
```
 RUN  v2.1.9 C:/Users/wangchunji/Documents/cube-pets-office/.worktrees/sliderule-v2-hardening-115-run/client

 ✓ src/lib/skills/kernel.test.ts (15 tests) 8ms

 Test Files  1 passed (1)
      Tests  15 passed (15)
   Start at  06:25:14
   Duration  397ms (transform 90ms, setup 0ms, collect 108ms, tests 8ms, environment 0ms, prepare 52ms)
```

### Required validation 2
Command: `node agent-loop/src/check-mojibake.js client/src/lib/skills/README.md agent-loop/tasks/sliderule-v2-gate-code-taxonomy-115.md`
Exit code: 0
Output:
```
No mojibake findings.
```

### Required validation 3
Command: `node agent-loop/src/check-mojibake.js agent-loop/tasks/sliderule-v2-gate-code-taxonomy-115.md`
Exit code: 0
Output:
```
No mojibake findings.
```

All gates fresh passing. Taxonomy now implemented per spec.
