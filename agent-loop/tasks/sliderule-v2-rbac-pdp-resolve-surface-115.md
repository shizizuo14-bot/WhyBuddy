# SlideRule V2 Hardening 115.10.09: RBAC PDP resolve surface

## Execution status
- Status: IN_PROGRESS (fixing per review: richer resolve surfaces + cross tests + evidence)
- Phase: 115.10-rbac
- Goal: Expose a richer PDP resolve surface for roles, permissions, policies, row rules, field rules, and decision scopes.
- Required gate: `sliderule-v2-rbac-pdp-resolve-surface-115Gates`

## Context
115 V2 Skill hardening deepens the existing five legacy Skills after AIGC 114. Keep every change runtime-less: pure data, pure validation, pure projection, pure resolve surfaces. Do not add database, Redis, provider, browser, or real service runtime code.

## Allowed files
- `client/src/lib/skills/rbac/rbacSkill.ts`
- `client/src/lib/skills/rbac/rbacSkill.test.ts`
- `client/src/lib/skills/orchestrator.test.ts`
- `agent-loop/tasks/sliderule-v2-rbac-pdp-resolve-surface-115.md`

## Do not
- Do not modify unrelated UI, dashboard, or AgentLoop runtime files.
- Do not use `git add -A`.
- Do not introduce credential material, provider credentials, network calls, database access, Redis access, or tool execution.
- Do not weaken existing validation gates or delete existing tests unless the task explicitly replaces them with stricter tests.
- Do not mark this task reviewed until the required validation commands have fresh evidence.

## Implementation steps
- [x] Start from a clean worktree or queue worktree and inspect current Skill behavior.
- [x] Write or update the failing test that proves this hardening behavior is missing.
- [x] Keep existing role and permission surfaces stable.
- [x] Add new surfaces for policy and field-rule refs without breaking existing consumers.
- [x] Update orchestrator tests for workflow/page/appbundle references into RBAC.
- [x] Implement the smallest runtime-less model, validator, projector, resolve, or impact change needed.
- [x] Update documentation only when it clarifies the new V2 contract.
- [ ] Append review evidence after validation passes.

## Required validation
- `pnpm exec vitest run client/src/lib/skills/rbac/rbacSkill.test.ts client/src/lib/skills/orchestrator.test.ts --reporter=dot`
- `pnpm exec tsc --noEmit --pretty false`
- `node agent-loop/src/check-mojibake.js {{taskFile}}`

## Acceptance criteria
- The task advances the V2 sample diagram semantics for its phase.
- New behavior has focused tests with at least one positive case and one negative case when a gate is involved.
- Existing purchase approval and AIGC 114 behavior remains compatible.
- Validation commands have fresh passing evidence recorded in this task file.

## Review evidence (appended after fix per 115.10.09)

### Implementation checklist update
- [x] Append review evidence after validation passes.

### Fresh validation (2026-06-27)
Command 1: pnpm exec vitest run client/src/lib/skills/rbac/rbacSkill.test.ts client/src/lib/skills/orchestrator.test.ts --reporter=dot
Output:
 RUN  v2.1.9 ...
 src/lib/skills/rbac/rbacSkill.test.ts (60 tests) 14ms
 src/lib/skills/orchestrator.test.ts (13 tests) 13ms
 Test Files  2 passed (2)
      Tests  73 passed (73)

Command 2: pnpm exec tsc --noEmit --pretty false
Output: (exit 0, no errors)

Command 3: node agent-loop/src/check-mojibake.js agent-loop/tasks/sliderule-v2-rbac-pdp-resolve-surface-115.md
Output: No mojibake findings.

### Changes summary (addressing review findings)
- rbacSkill.resolve now returns rowRule, fieldRule, decisionScope (plus existing) from policyRules and decisionCodes. Role/permission/policy/decision stable.
- Added +ve (policyRules present) and -ve (no rules, legacy unchanged) tests in rbacSkill.test.ts focused on resolve surfaces.
- Added orchestrator.test.ts tests exercising workflow/page/appbundle-style cross resolution (via surface lookup + assemble/publishGate) against rbac's new surfaces; compat locked.
- refNodeId updated to support policy/rowRule/fieldRule/decisionScope.
- No existing tests weakened/deleted. Only allowed files edited. No runtime added.
