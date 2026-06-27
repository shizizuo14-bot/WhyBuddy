# Backend Python 105: Blueprint job store production takeover

## Execution status
- Status: pending
- Goal: Make Python own the production-shaped Blueprint job store read/write/status/cancel boundary, while Node becomes a compatibility shell.
- Queue: `backend-python-total-cutover-105-queue`
- Phase: Blueprint Main System
- Sequence: 01 / 48

## Context
This task is part of the single-batch NodeJS-to-Python total cutover push. The intent is to reduce real Node business ownership, not to add another thin classification slice. Treat `agent-loop/tasks/000-nodejs-to-python-migration-status.md` as the current denominator map and use the 104 evidence as the baseline.

## Allowed files
- `agent-loop/tasks/000-nodejs-to-python-migration-status.md`
- `agent-loop/tasks/backend-python-blueprint-job-store-production-takeover-105.md`
- `server/routes/blueprint.ts`
- `server/routes/blueprint/**`
- `server/routes/blueprint/job-runtime-python-proxy.ts`
- `slide-rule-python/services/blueprint_job_runtime.py`
- `slide-rule-python/tests/test_blueprint_job_runtime_proxy.py`
- `server/routes/__tests__/blueprint.job-runtime-python-proxy.test.ts`

## Evidence to read
- `agent-loop/tasks/000-nodejs-to-python-migration-status.md`
- `.agent-loop/queue-outcomes.json` when present
- `agent-loop/scripts/backend-python-total-cutover-105-queue.json`
- 104 migration status and queue outcome evidence.
- Existing Python and Node tests near the files listed above

## Required implementation
1. Add Python durable job-store service with create/read/update/cancel/list semantics and stable envelope.
2. Route Node Blueprint job operations through Python-first adapter with explicit Node fallback only for compatibility.
3. Prove Python is the source of truth for the selected production-shaped job store slice, not only a decision envelope.

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
