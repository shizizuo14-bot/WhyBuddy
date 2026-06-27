# SlideRule V2 Hardening 115.30.09: Workflow variable reference gate

## Execution status
- Status: PENDING
- Phase: 115.30-workflow
- Goal: Harden branch and action validation so every variable reference points to a known SSOT field or defined process variable.
- Required gate: `sliderule-v2-workflow-variable-reference-gate-115Gates`

## Context
115 V2 Skill hardening deepens the existing five legacy Skills after AIGC 114. Keep every change runtime-less: pure data, pure validation, pure projection, pure resolve surfaces. Do not add database, Redis, provider, browser, or real service runtime code.

## Allowed files
- `client/src/lib/skills/workflow/workflowSkill.ts`
- `client/src/lib/skills/workflow/workflowSkill.test.ts`
- `agent-loop/tasks/sliderule-v2-workflow-variable-reference-gate-115.md`

## Do not
- Do not modify unrelated UI, dashboard, or AgentLoop runtime files.
- Do not use `git add -A`.
- Do not introduce credential material, provider credentials, network calls, database access, Redis access, or tool execution.
- Do not weaken existing validation gates or delete existing tests unless the task explicitly replaces them with stricter tests.
- Do not mark this task reviewed until the required validation commands have fresh evidence.

## Implementation steps
- [ ] Start from a clean worktree or queue worktree and inspect current Skill behavior.
- [ ] Write or update the failing test that proves this hardening behavior is missing.
- [ ] Validate branch conditions against form bindings and process variables.
- [ ] Error on missing variables and mismatched field refs.
- [ ] Preserve existing branch default coverage checks.
- [ ] Implement the smallest runtime-less model, validator, projector, resolve, or impact change needed.
- [ ] Update documentation only when it clarifies the new V2 contract.
- [ ] Append review evidence after validation passes.

## Required validation
- `pnpm exec vitest run client/src/lib/skills/workflow/workflowSkill.test.ts --reporter=dot`
- `pnpm exec tsc --noEmit --pretty false`
- `node agent-loop/src/check-mojibake.js {{taskFile}}`

## Acceptance criteria
- The task advances the V2 sample diagram semantics for its phase.
- New behavior has focused tests with at least one positive case and one negative case when a gate is involved.
- Existing purchase approval and AIGC 114 behavior remains compatible.
- Validation commands have fresh passing evidence recorded in this task file.

## Review remediation changes (to address needs_changes)

- In workflowSkill.ts: added variable reference collection (fieldRefs + branch.fieldRef + node.varRef + edge.when.varRef for branch/action conditions) + known set = declaredSSOT (fieldRefs) UNION declaredProcessVars (model.variables) + WF_VAR_REF_UNKNOWN error for any ref not pointing to known. Logic placed after DM checks; does not alter or weaken prior SSOT binding, DM surface, branch coverage, or other gates.
- In workflowSkill.test.ts: added dedicated describe with 1+ pos cases (defined process var in condition passes; SSOT fieldRef via varRef passes), 1+ neg cases (undefined process var errors; branch fieldRef not in fieldRefs mismatch errors), + compat test. Minor update in one DM test to declare the test ref so new gate isolates the DM surface error.
- No changes outside allowed files. Existing leave/purchase fixtures + tests remain compatible and pass.
- Implementation steps completed; focused gate tests added per acceptance.

## Fresh validation evidence (after remediation)

### vitest (required)
Command: `pnpm exec vitest run client/src/lib/skills/workflow/workflowSkill.test.ts --reporter=dot`
```
 RUN  v2.1.9 C:/Users/wangchunji/Documents/cube-pets-office/.worktrees/sliderule-v2-hardening-115-run/client

 ✓ src/lib/skills/workflow/workflowSkill.test.ts (48 tests) 10ms

 Test Files  1 passed (1)
      Tests  48 passed (48)
   Start at  08:58:13
   Duration  351ms (transform 72ms, setup 0ms, collect 83ms, tests 10ms, environment 0ms, prepare 70ms)
```
exitCode: 0

### tsc (required)
Command: `pnpm exec tsc --noEmit --pretty false`
exitCode: 0 (clean; no type errors emitted)

### mojibake (required)
Command: `node agent-loop/src/check-mojibake.js agent-loop/tasks/sliderule-v2-workflow-variable-reference-gate-115.md`
```
No mojibake findings.
```
exitCode: 0

All acceptance criteria met. Gate evidence fresh as of 2026-06-27.
