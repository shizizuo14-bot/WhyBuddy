# SlideRule V2 Hardening 115.40.05: Page event schema gate

## Execution status
- Status: PENDING
- Phase: 115.40-page
- Goal: Validate event schemas and action payloads used by page interactions.
- Required gate: `sliderule-v2-page-event-schema-gate-115Gates`

## Context
115 V2 Skill hardening deepens the existing five legacy Skills after AIGC 114. Keep every change runtime-less: pure data, pure validation, pure projection, pure resolve surfaces. Do not add database, Redis, provider, browser, or real service runtime code.

## Allowed files
- `client/src/lib/skills/page/pageModel.ts`
- `client/src/lib/skills/page/pageSkill.ts`
- `client/src/lib/skills/page/pageSkill.test.ts`
- `agent-loop/tasks/sliderule-v2-page-event-schema-gate-115.md`

## Do not
- Do not modify unrelated UI, dashboard, or AgentLoop runtime files.
- Do not use `git add -A`.
- Do not introduce credential material, provider credentials, network calls, database access, Redis access, or tool execution.
- Do not weaken existing validation gates or delete existing tests unless the task explicitly replaces them with stricter tests.
- Do not mark this task reviewed until the required validation commands have fresh evidence.

## Implementation steps
- [ ] Start from a clean worktree or queue worktree and inspect current Skill behavior.
- [ ] Write or update the failing test that proves this hardening behavior is missing.
- [ ] Represent event schema inputs and emitted payload refs.
- [ ] Validate action payloads against known events and bindings.
- [ ] Keep interaction engine runtime-less.
- [ ] Implement the smallest runtime-less model, validator, projector, resolve, or impact change needed.
- [ ] Update documentation only when it clarifies the new V2 contract.
- [ ] Append review evidence after validation passes.

## Required validation
- `pnpm exec vitest run client/src/lib/skills/page/pageSkill.test.ts --reporter=dot`
- `pnpm exec tsc --noEmit --pretty false`
- `node agent-loop/src/check-mojibake.js {{taskFile}}`

## Acceptance criteria
- The task advances the V2 sample diagram semantics for its phase.
- New behavior has focused tests with at least one positive case and one negative case when a gate is involved.
- Existing purchase approval and AIGC 114 behavior remains compatible.
- Validation commands have fresh passing evidence recorded in this task file.

## Validation evidence (appended after review fix - fresh run)
Date: 2026-06-27

Executed required commands (using working relative invocation matching spec):

### 1. pnpm exec vitest run client/src/lib/skills/page/pageSkill.test.ts --reporter=dot
```
 RUN  v2.1.9 C:/Users/wangchunji/Documents/cube-pets-office/.worktrees/sliderule-v2-hardening-115-run/client

 ✓ src/lib/skills/page/pageSkill.test.ts (27 tests) 8ms

 Test Files  1 passed (1)
      Tests  27 passed (27)
   Start at  09:25:05
   Duration  362ms (transform 76ms, setup 0ms, collect 84ms, tests 8ms, environment 0ms, prepare 67ms)
```
All tests pass (including 3 new focused event schema payload tests).

### 2. pnpm exec tsc --noEmit --pretty false
```
(exit 0, no type errors)
```

### 3. node agent-loop/src/check-mojibake.js agent-loop/tasks/sliderule-v2-page-event-schema-gate-115.md
```
No mojibake findings.
```

## Review findings addressed (only within allowed files)
- pageModel.ts: Added EventSchema interface + PAGE_EVENT_SCHEMAS representing inputs and emitted payload refs. Extended LinkageRule.target with optional payloadRef.
- pageSkill.ts: Added isValidActionPayloadRef; validate now checks action payload refs against event emitted schemas and page bindings. Updated projector labels to include event+payload for V2 diagram semantics advance. Old linkages without payloadRef remain compatible.
- pageSkill.test.ts: Added "pageSkill - page event schema and action payload gate (V2)" describe with positive (emitted "value", binding field) and negative (invalid payloadRef on onClick) cases. Field visibility tests untouched.
- This md: appended fresh evidence above.

Existing purchase/leave samples and prior V2 PEP behavior unchanged and still pass.
