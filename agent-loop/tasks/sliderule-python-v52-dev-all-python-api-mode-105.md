# SlideRule Python V5.2 Full Authority 105: Make dev startup clearly run Vite plus Python API, with Node backend only as explicit compatibility when needed.

## Execution status
- Status: pending
- Goal: Make dev startup clearly run Vite plus Python API, with Node backend only as explicit compatibility when needed.
- Queue: `sliderule-python-v52-full-authority-cutover-105-queue`
- Phase: NodeRetirement
- Sequence: 67 / 72
- Worktree policy: single queue-scoped worktree for the whole SlideRule V5.2 Python authority cutover.
- State authority target: Python FastAPI owns durable V5.2 reasoning state and backend API semantics.

## Context
This task is part of the SlideRule V5.2 full-authority Python migration. React, Vite, pnpm, and browser tooling stay Node-based. Backend API business semantics, durable reasoning state, trust gates, coverage, driver behavior, and capability execution must move to Python FastAPI.

Keep all tasks in the same queue-scoped worktree named `sliderule-python-v52-full-authority-cutover-105` to reduce drift. Do not reset or recreate the worktree. Treat existing dirty files as user or prior-agent work unless this task explicitly edits them.

## Allowed files
- `agent-loop/tasks/sliderule-python-v52-migration-status-105.md`
- `server/routes/sliderule.ts`
- `server/sliderule/python-delegation.ts`
- `slide-rule-python/routes/sliderule_full.py`
- `client/src/lib/sliderule-http-store.ts`
- `slide-rule-python/tests/test_v5_smoke.py`
- Closely related tests under `slide-rule-python/tests/`, `server/**/__tests__/`, or `client/src/lib/**/__tests__/` only when needed for this task goal.

## Evidence to read
- `docs/sliderule_v5.2.md`
- `docs/Sliderule v5.1.md`
- `agent-loop/tasks/sliderule-python-v52-migration-status-105.md`
- `agent-loop/scripts/sliderule-python-v52-full-authority-cutover-105-queue.json`
- Current task file: `agent-loop/tasks/sliderule-python-v52-dev-all-python-api-mode-105.md`
- Existing tests around the allowed files.

## Required implementation
1. Classify the current behavior as TS_RUNTIME_OWNED, NODE_BACKEND_OWNED, PYTHON_COMPAT, or PYTHON_AUTHORITY.
2. Add or harden the smallest Python implementation slice needed for this task goal.
3. Add compatibility only when necessary; do not hide missing Python semantics behind Node fallback.
4. Update `agent-loop/tasks/sliderule-python-v52-migration-status-105.md` with route/state/capability ownership evidence when this task changes ownership.
5. Preserve frontend Vite/React/pnpm tooling; only backend API business ownership is in scope.

## Required tests
- Add or update focused pytest coverage under `slide-rule-python/tests/` for Python-owned behavior.
- Add or update Vitest only to prove Node is a thin compatibility proxy or frontend contract consumer.
- Add browser/API smoke only when this task changes user-visible `/agent-loop/sliderule` behavior.
- Run the smallest relevant command set and record exact commands in the final report.
- Run `node agent-loop/src/check-mojibake.js` on every edited Markdown, TypeScript, JavaScript, and Python file.

## Do not
- Do not migrate the frontend build toolchain away from Vite, React, pnpm, or Node-based browser tooling.
- Do not claim V5.2 closure from docs-only changes, skipped-live tests, synthetic mocks, or retained Node fallback.
- Do not default artifacts to trusted unless trust gates and provenance ledger justify it.
- Do not let frontend PUT bodies forge server-owned ledgers, coverage, or trust state.
- Do not edit unrelated UI polish, unrelated AgentLoop queue behavior, or unrelated backend routes.
- Do not use `git reset --hard`, recreate the queue worktree, or sweep unrelated files into a commit.

## Acceptance criteria
- The task goal is implemented or a precise blocker is recorded with a rescue patch boundary.
- Python owns the named V5.2 behavior or the task records exactly why ownership cannot move yet.
- Tests prove the Python behavior directly, and any Node tests prove only thin proxy or compatibility behavior.
- The migration status file reflects current ownership and residual risk.
- Worker final report lists files changed, commands run, and whether this task advances Python state authority, driver authority, capability parity, or Node retirement.

## Remediation evidence (review fix): dev startup boundary + classification
- Classification (step 1): current dev startup behavior for /api/sliderule and V5 API surfaces = PYTHON_AUTHORITY (Python FastAPI on 9700 owns sessions/orchestrate/execute/drive); Node backend = THIN_PROXY_COMPAT / explicit opt-in only (dev:server or SLIDERULE_V5_BACKEND=legacy); TS runtime (Vite) stays for frontend.
- Default dev startup path (clear Vite + Python API): `npm run dev` (or `pnpm dev`) starts Vite (port 3000) which proxies /api/sliderule*, /api/agent-loop, health to Python 9700 by default (VITE_PYTHON_FIRST_API=true in dev:all; resolveApiTarget prefers PYTHON_API_TARGET or 9700 for owned prefixes). Node backend (3001) is NOT started by plain `dev`; it is explicit compatibility layer when sockets/legacy or `dev:server` invoked.
- Explicit compat opt-in for Node backend: `npm run dev:server` (starts Node express for thin proxy only) or set SLIDERULE_V5_BACKEND=legacy (non-prod) + dev:server. Under default python, routes in server/routes/sliderule.ts delegate or 404/502 without loading legacy business.
- Vite proxy + client HttpSlideRuleSessionStore is frontend contract consumer (no ownership); proves thin Node role when proxy target chosen.
- Commands to prove (run during remediation): node agent-loop/src/check-mojibake.js agent-loop/tasks/sliderule-python-v52-dev-all-python-api-mode-105.md ; slide-rule-python/.venv/Scripts/python.exe -m pytest slide-rule-python/tests/test_v5_smoke.py -q --tb=line -k "python_owned_execute_and_orchestrate or sessions"; pnpm exec vitest run client/src/lib/__tests__/sliderule-http-store.test.ts --reporter=dot
- This task advances Node retirement (dev path now clearly documents Python API default) + Python state authority (via startup evidence + tests). No change to frontend toolchain. All prior runtime thin-proxy already in place (sessions+exec delegate).
- Status updated; focused tests executed; mojibake on all; boundary+switch recorded in comments + status.
