# SlideRule V2 Hardening 115.20.09: DataModel impact graph

## Execution status
- Status: PENDING
- Phase: 115.20-datamodel
- Goal: Make SSOT field/entity changes produce multi-hop impact paths into Page, Workflow, AIGC, RBAC, and AppBundle.
- Required gate: `sliderule-v2-datamodel-impact-graph-115Gates`

## Context
115 V2 Skill hardening deepens the existing five legacy Skills after AIGC 114. Keep every change runtime-less: pure data, pure validation, pure projection, pure resolve surfaces. Do not add database, Redis, provider, browser, or real service runtime code.

## Allowed files
- `client/src/lib/skills/impact.ts`
- `client/src/lib/skills/impact.test.ts`
- `client/src/lib/skills/datamodel/dataModelSkill.ts`
- `agent-loop/tasks/sliderule-v2-datamodel-impact-graph-115.md`

## Do not
- Do not modify unrelated UI, dashboard, or AgentLoop runtime files.
- Do not use `git add -A`.
- Do not introduce credential material, provider credentials, network calls, database access, Redis access, or tool execution.
- Do not weaken existing validation gates or delete existing tests unless the task explicitly replaces them with stricter tests.
- Do not mark this task reviewed until the required validation commands have fresh evidence.

## Implementation steps
- [x] Start from a clean worktree or queue worktree and inspect current Skill behavior.
- [x] Write or update the failing test that proves this hardening behavior is missing.
- [x] Add field deletion and field deprecation impact examples.
- [x] Show paths from purchase_request.amount to page components, workflow branches, AIGC capabilities, and app bundle.
- [x] Keep impact output deterministic.
- [x] Implement the smallest runtime-less model, validator, projector, resolve, or impact change needed.
- [x] Update documentation only when it clarifies the new V2 contract.
- [x] Append review evidence after validation passes.

## Required validation
- `pnpm exec vitest run client/src/lib/skills/impact.test.ts client/src/lib/skills/datamodel/dataModelSkill.test.ts --reporter=dot`
- `pnpm exec tsc --noEmit --pretty false`
- `node agent-loop/src/check-mojibake.js {{taskFile}}`

## Acceptance criteria
- The task advances the V2 sample diagram semantics for its phase.
- New behavior has focused tests with at least one positive case and one negative case when a gate is involved.
- Existing purchase approval and AIGC 114 behavior remains compatible.
- Validation commands have fresh passing evidence recorded in this task file.

## Implementation notes (post-review fix)
- Updated purchaseModels to include purchase page + appbundle so multi-hop graph for purchase_request.amount can reach Page/Workflow/AppBundle (plus existing AIGC).
- Added multi-hop path assertions: dm -> cmp_amount -> page -> app; dm -> wf -> app; dm -> aigc.
- Added focused tests covering field deprecation (with RBAC policy cross) and field removal (deletion) impact paths (positive multi-hop + negative safe case).
- All changes limited to allowed files; no test deletions/weakening; purchase/AIGC compat preserved.

## Fresh validation evidence (recorded after fixes)
### vitest
```
 RUN  v2.1.9 C:/Users/wangchunji/Documents/cube-pets-office/.worktrees/sliderule-v2-hardening-115-run/client
  src/lib/skills/datamodel/dataModelSkill.test.ts (51 tests) 11ms
  src/lib/skills/impact.test.ts (12 tests) 18ms

 Test Files  2 passed (2)
      Tests  63 passed (63)
   Start at  08:18:18
   Duration  450ms (transform 130ms, setup 0ms, collect 185ms, tests 28ms, environment 0ms, prepare 143ms)
```

### tsc
```
(no output; exit 0)
```

### mojibake
```
No mojibake findings.
```

All commands executed with fresh passing results on 2026-06-27.
