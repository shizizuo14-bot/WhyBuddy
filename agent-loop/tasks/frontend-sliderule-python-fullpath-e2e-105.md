# Backend Python 105: SlideRule page Python full-path E2E

## Execution status
- Status: pending
- Goal: Verify /agent-loop/sliderule and /sliderule can complete happy path against Python backend.
- Queue: `backend-python-total-cutover-105-queue`
- Phase: Frontend Python Integration
- Sequence: 39 / 48

## Context
This task is part of the single-batch NodeJS-to-Python total cutover push. The intent is to reduce real Node business ownership, not to add another thin classification slice. Treat `agent-loop/tasks/000-nodejs-to-python-migration-status.md` as the current denominator map and use the 104 evidence as the baseline.

## Allowed files
- `agent-loop/tasks/000-nodejs-to-python-migration-status.md`
- `agent-loop/tasks/frontend-sliderule-python-fullpath-e2e-105.md`
- `client/src/pages/SlideRule.tsx`
- `client/src/pages/sliderule/**`
- `scripts/sliderule-browser-smoke.mjs`
- `slide-rule-python/routes/sliderule_full.py`

## Evidence to read
- `agent-loop/tasks/000-nodejs-to-python-migration-status.md`
- `.agent-loop/queue-outcomes.json` when present
- `agent-loop/scripts/backend-python-total-cutover-105-queue.json`
- Previous 105 queue tasks 1-38 when their outputs are relevant.
- Existing Python and Node tests near the files listed above

## Required implementation
1. Add browser smoke that starts from frontend and observes Python provenance.
2. Ensure session, turn, evidence, and report operations hit Python paths.
3. Test happy path with local dev services.

## Required tests
- Add or update Python tests under `slide-rule-python/tests/` for the Python-owned behavior.
- Add or update Node/Vitest tests under `server/**/__tests__/` or `server/tests/` proving Node is a thin proxy or explicit retained compatibility shell.
- Run the smallest relevant Python and Node test commands and record them in the final task update.
- Keep or add a mojibake check for this task and every edited non-generated markdown/code file named by the queue gate.

## Do not
- Do not count docs-only, no-diff, skipped-live, synthetic, external-owned, or retained Node fallback as Python migration completion.
- Do not remove public API compatibility without a Node bridge or explicit frontend update.
- Do not hide Python failures behind silent Node success; degraded and fallback states must be visible.
- Do not edit unrelated frontend polish or AgentLoop dashboard layout unless the task explicitly names it.

## Acceptance criteria
- The task lands real Python-owned runtime, production wiring, frontend integration, or an executable cutover guard matching the goal.
- Tests prove the Python path is exercised and that Node no longer owns migrated business semantics.
- Any remaining Node behavior is named as thin proxy, compatibility shell, or explicitly retained boundary with a reason.
- The worker final report lists commands run, files changed, and whether the migration numerator can change.
