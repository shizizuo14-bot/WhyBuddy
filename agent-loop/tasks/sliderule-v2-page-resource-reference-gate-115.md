# SlideRule V2 Hardening 115.40.06: Page resource reference gate

## Execution status
- Status: PENDING
- Phase: 115.40-page
- Goal: Validate page resource refs such as assets, routes, workflow launch refs, and app menu refs before publish.
- Required gate: `sliderule-v2-page-resource-reference-gate-115Gates`

## Context
115 V2 Skill hardening deepens the existing five legacy Skills after AIGC 114. Keep every change runtime-less: pure data, pure validation, pure projection, pure resolve surfaces. Do not add database, Redis, provider, browser, or real service runtime code.

## Allowed files
- `client/src/lib/skills/page/pageModel.ts`
- `client/src/lib/skills/page/pageSkill.ts`
- `client/src/lib/skills/page/pageSkill.test.ts`
- `client/src/lib/skills/workflow/workflowSkill.test.ts`
- `agent-loop/tasks/sliderule-v2-page-resource-reference-gate-115.md`

## Do not
- Do not modify unrelated UI, dashboard, or AgentLoop runtime files.
- Do not use `git add -A`.
- Do not introduce credential material, provider credentials, network calls, database access, Redis access, or tool execution.
- Do not weaken existing validation gates or delete existing tests unless the task explicitly replaces them with stricter tests.
- Do not mark this task reviewed until the required validation commands have fresh evidence.

## Implementation steps
- [x] Start from a clean worktree or queue worktree and inspect current Skill behavior.
- [x] Write or update the failing test that proves this hardening behavior is missing.
- [x] Represent workflow launch and route refs.
- [x] Validate workflow refs against Workflow resolve surfaces where connected.
- [x] Warn or error consistently for unresolved resources.
- [x] Implement the smallest runtime-less model, validator, projector, resolve, or impact change needed.
- [x] Update documentation only when it clarifies the new V2 contract.
- [x] Append review evidence after validation passes.

## Required validation
- `pnpm exec vitest run client/src/lib/skills/page/pageSkill.test.ts client/src/lib/skills/workflow/workflowSkill.test.ts --reporter=dot`
- `pnpm exec tsc --noEmit --pretty false`
- `node agent-loop/src/check-mojibake.js {{taskFile}}`

## Acceptance criteria
- The task advances the V2 sample diagram semantics for its phase.
- New behavior has focused tests with at least one positive case and one negative case when a gate is involved.
- Existing purchase approval and AIGC 114 behavior remains compatible.
- Validation commands have fresh passing evidence recorded in this task file.

## Fresh validation evidence (post-fix, 2026-06-27)
Required commands executed with passing results. No mojibake, types clean, tests cover new resource ref gate + compat.

```
VITEST:
 RUN  v2.1.9 C:/Users/wangchunji/Documents/cube-pets-office/.worktrees/sliderule-v2-hardening-115-run/client

  src/lib/skills/workflow/workflowSkill.test.ts (48 tests) 10ms
  src/lib/skills/page/pageSkill.test.ts (31 tests) 8ms

 Test Files  2 passed (2)
      Tests  79 passed (79)
   Start at  09:29:03
   Duration  353ms (transform 124ms, setup 0ms, collect 177ms, tests 19ms, environment 0ms, prepare 143ms)

TSC:
(no errors)

node agent-loop/src/check-mojibake.js agent-loop/tasks/sliderule-v2-page-resource-reference-gate-115.md
No mojibake findings.
```

- Added PageModel fields: assetRefs, routeRefs, workflowLaunchRefs, appMenuRefs; touched PageComponent.resourceRef + LinkageRule.resourceRef for representation.
- validate now reads ctx.external.workflow (and peers) and emits UNRESOLVED warnings + MISSING errors for resource refs.
- workflow refs validated against workflow surface; focused +ve/-ve tests in pageSkill.test.ts (positive workflow match; negative missing wf; unresolved cases; cross/project coverage). Existing payloadRef and purchase/leave tests untouched.
- crossRefs + project updated to declare and diagram the refs (advances V2 semantics).
- Existing AIGC114/PEP/leave/purchase behavior preserved (compat).
- Checklist marked, evidence appended. (gate was green before; now core coverage added per review).
