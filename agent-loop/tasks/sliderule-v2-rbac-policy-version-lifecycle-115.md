# SlideRule V2 Hardening 115.10.08: RBAC policy version lifecycle

## Execution status
- Status: PENDING
- Phase: 115.10-rbac
- Goal: Add draft, published, effective, retired policy lifecycle data so PDP decisions can explain which policy version was used.
- Required gate: `sliderule-v2-rbac-policy-version-lifecycle-115Gates`

## Context
115 V2 Skill hardening deepens the existing five legacy Skills after AIGC 114. Keep every change runtime-less: pure data, pure validation, pure projection, pure resolve surfaces. Do not add database, Redis, provider, browser, or real service runtime code.

## Allowed files
- `client/src/lib/skills/rbac/rbacModel.ts`
- `client/src/lib/skills/rbac/rbacSkill.ts`
- `client/src/lib/skills/rbac/rbacSkill.test.ts`
- `agent-loop/tasks/sliderule-v2-rbac-policy-version-lifecycle-115.md`

## Do not
- Do not modify unrelated UI, dashboard, or AgentLoop runtime files.
- Do not use `git add -A`.
- Do not introduce credential material, provider credentials, network calls, database access, Redis access, or tool execution.
- Do not weaken existing validation gates or delete existing tests unless the task explicitly replaces them with stricter tests.
- Do not mark this task reviewed until the required validation commands have fresh evidence.

## Implementation steps
- [ ] Start from a clean worktree or queue worktree and inspect current Skill behavior.
- [ ] Write or update the failing test that proves this hardening behavior is missing.
- [ ] Add policy version and lifecycle state to RBAC model.
- [ ] Validate that effective policies are published and not retired.
- [ ] Project policy lifecycle nodes in the RBAC diagram.
- [ ] Implement the smallest runtime-less model, validator, projector, resolve, or impact change needed.
- [ ] Update documentation only when it clarifies the new V2 contract.
- [ ] Append review evidence after validation passes.

## Required validation
- `pnpm exec vitest run client/src/lib/skills/rbac/rbacSkill.test.ts --reporter=dot`
- `pnpm exec tsc --noEmit --pretty false`
- `node agent-loop/src/check-mojibake.js {{taskFile}}`

## Acceptance criteria
- The task advances the V2 sample diagram semantics for its phase.
- New behavior has focused tests with at least one positive case and one negative case when a gate is involved.
- Existing purchase approval and AIGC 114 behavior remains compatible.
- Validation commands have fresh passing evidence recorded in this task file.

## Validation evidence (appended after review_needs_changes fix)
- Run date: 2026-06-27 (fresh after model + impl)
- `pnpm exec vitest run client/src/lib/skills/rbac/rbacSkill.test.ts --reporter=dot` → 58 tests passed (was 54; +4 focused lifecycle +ve/-ve)
- `pnpm exec tsc --noEmit --pretty false` → exit 0 (clean)
- `node agent-loop/src/check-mojibake.js agent-loop/tasks/sliderule-v2-rbac-policy-version-lifecycle-115.md` → No mojibake findings.
- Changes (only allowed files):
  - client/src/lib/skills/rbac/rbacModel.ts: added PolicyLifecycleState="draft"|"published"|"effective"|"retired"; added version?, lifecycleState? to PolicyRule; added policyVersion?, policyLifecycleState? to PolicyDecision.
  - client/src/lib/skills/rbac/rbacSkill.ts: import type; validate() now checks effective policies published/not-retired contract; project() adds pdp_policy_lifecycle + lifecycle_* nodes + version/state in labels/edges; resolve() surfaces @ver#state; decideRbacPolicy() filters retired (effective only), attaches version/state to decisions on policy-driven deny.
  - client/src/lib/skills/rbac/rbacSkill.test.ts: 4 new tests (positive: effective/published accepted+reported+projected; negative: retired accepted in model but ignored in PDP so allow not vetoed); compat preserved.
- Core goal met: PDP decisions now carry policyVersion + policyLifecycleState; effective policies validated/published/not-retired enforced via filter+contract.
- All prior behavior (purchase/leave/114) remains compatible (new fields optional).
