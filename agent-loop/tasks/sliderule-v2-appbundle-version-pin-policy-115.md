# SlideRule V2 Hardening 115.50.03: AppBundle version pin policy

## Execution status
- Status: PENDING
- Phase: 115.50-appbundle-e2e
- Goal: Require AppBundle releases to pin every referenced child artifact version and reject latest-style runtime lookup.
- Required gate: `sliderule-v2-appbundle-version-pin-policy-115Gates`

## Context
115 V2 Skill hardening deepens the existing five legacy Skills after AIGC 114. Keep every change runtime-less: pure data, pure validation, pure projection, pure resolve surfaces. Do not add database, Redis, provider, browser, or real service runtime code.

## Allowed files
- `client/src/lib/skills/appbundle/appBundleModel.ts`
- `client/src/lib/skills/appbundle/appBundleSkill.ts`
- `client/src/lib/skills/appbundle/appBundleSkill.test.ts`
- `agent-loop/tasks/sliderule-v2-appbundle-version-pin-policy-115.md`

## Do not
- Do not modify unrelated UI, dashboard, or AgentLoop runtime files.
- Do not use `git add -A`.
- Do not introduce credential material, provider credentials, network calls, database access, Redis access, or tool execution.
- Do not weaken existing validation gates or delete existing tests unless the task explicitly replaces them with stricter tests.
- Do not mark this task reviewed until the required validation commands have fresh evidence.

## Implementation steps
- [ ] Start from a clean worktree or queue worktree and inspect current Skill behavior.
- [ ] Write or update the failing test that proves this hardening behavior is missing.
- [ ] Represent version pins for datamodel, rbac, workflow, page, aigc, and appbundle artifacts.
- [ ] Error when a required child ref has no pin.
- [ ] Error on moving latest or wildcard pin semantics.
- [ ] Implement the smallest runtime-less model, validator, projector, resolve, or impact change needed.
- [ ] Update documentation only when it clarifies the new V2 contract.
- [ ] Append review evidence after validation passes.

## Required validation
- `pnpm exec vitest run client/src/lib/skills/appbundle/appBundleSkill.test.ts --reporter=dot`
- `pnpm exec tsc --noEmit --pretty false`
- `node agent-loop/src/check-mojibake.js {{taskFile}}`

## Acceptance criteria
- The task advances the V2 sample diagram semantics for its phase.
- New behavior has focused tests with at least one positive case and one negative case when a gate is involved.
- Existing purchase approval and AIGC 114 behavior remains compatible.
- Validation commands have fresh passing evidence recorded in this task file.

## Implementation notes (115.50.03)
- Added `isFixedPinVersion` pure predicate (rejects "latest", "*", "^...", "1.x", ranges, wildcards).
- Enforced in `appBundleSkill.validate` (new error code APPBUNDLE_VERSION_PIN_MOVABLE) and in `validateAppBundlePublishGate` (maps to APPBUNDLE_VERSION_UNPINNED; rejects in expected ref pin check).
- Added focused gate tests: positive (all fixed pins => publishable true), negatives (latest; wildcard/range => publishable false, VERSION_UNPINNED).
- No changes to model contract, no runtime, no unrelated files, no test deletion/weakening.
- Existing leave/purchase/AIGC 114 bundles and paths remain compatible (use "1.0.0" fixed pins).

## Validation evidence (fresh after fix, 2026-06-27)
Command: pnpm exec vitest run client/src/lib/skills/appbundle/appBundleSkill.test.ts --reporter=dot
```
 RUN  v2.1.9 C:/Users/wangchunji/Documents/cube-pets-office/.worktrees/sliderule-v2-hardening-115-run/client

 ✓ src/lib/skills/appbundle/appBundleSkill.test.ts (35 tests) 11ms
 Test Files  1 passed (1)
      Tests  35 passed (35)
   Start at  09:52:52
   Duration  365ms (transform 97ms, setup 0ms, collect 116ms, tests 11ms, environment 0ms, prepare 67ms)
```

Command: pnpm exec tsc --noEmit --pretty false
```
(exit 0, no diagnostics)
```

Command: node agent-loop/src/check-mojibake.js agent-loop/tasks/sliderule-v2-appbundle-version-pin-policy-115.md
```
No mojibake findings.
```
