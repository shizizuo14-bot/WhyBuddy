# Backend Python 105: A2A stream cancel transport takeover

## Execution status
- Status: pending
- Goal: Move A2A stream and cancel transport semantics to Python-owned runtime.
- Queue: `backend-python-total-cutover-105-queue`
- Phase: A2A
- Sequence: 35 / 48

## Context
This task is part of the single-batch NodeJS-to-Python total cutover push. The intent is to reduce real Node business ownership, not to add another thin classification slice. Treat `agent-loop/tasks/000-nodejs-to-python-migration-status.md` as the current denominator map and use the 104 evidence as the baseline.

## Allowed files
- `agent-loop/tasks/000-nodejs-to-python-migration-status.md`
- `agent-loop/tasks/backend-python-a2a-stream-cancel-transport-takeover-105.md`
- `server/routes/a2a.ts`
- `server/core/a2a-server.ts`
- `shared/a2a-protocol.ts`
- `slide-rule-python/services/a2a_runtime.py`

## Evidence to read
- `agent-loop/tasks/000-nodejs-to-python-migration-status.md`
- `.agent-loop/queue-outcomes.json` when present
- `agent-loop/scripts/backend-python-total-cutover-105-queue.json`
- Previous 105 queue tasks 1-34 when their outputs are relevant.
- Existing Python and Node tests near the files listed above

## Required implementation
1. Implement Python stream chunks, cancel, timeout, and retry envelope.
2. Bridge Node SSE/stream routes to Python transport.
3. Test stream ordering, cancel idempotency, timeout, and malformed chunks.

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
