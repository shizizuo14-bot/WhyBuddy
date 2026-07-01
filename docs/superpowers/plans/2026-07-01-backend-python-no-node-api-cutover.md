# Backend Python No-Node API Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move backend API business ownership from NodeJS server routes to Python FastAPI while preserving the existing React/Vite/pnpm frontend toolchain.

**Architecture:** Execute one AgentLoop queue in one queue-scoped worktree to avoid cross-worktree drift. Each task moves or verifies one backend API contract slice, records ownership in the shared migration status file, and requires tests showing Python ownership or a precise blocker.

**Tech Stack:** React, Vite, pnpm, TypeScript, Express compatibility routes, FastAPI, pytest, Vitest, Playwright smoke scripts, AgentLoop queue runner.

---

## File Structure
- Create: `agent-loop/scripts/backend-python-api-cutover-no-node-105-queue.json` - queue definition with 60 enabled tasks and queue-scoped worktree defaults.
- Create: `agent-loop/tasks/backend-python-no-node-api-migration-status-105.md` - shared route ownership ledger for this queue.
- Create: `agent-loop/tasks/backend-python-no-node-*.md` - individual AgentLoop task specs.
- Create: `docs/superpowers/plans/2026-07-01-backend-python-no-node-api-cutover.md` - this execution plan and checkpoint guidance.

## Task Groups
- Foundation tasks 1-8 establish route inventory, callsite inventory, Python contract registry, health, Vite proxy defaults, route state taxonomy, provenance, and smoke harness.
- SlideRule tasks 9-20 make /api/sliderule Python-only or Python-first compatibility.
- AgentLoop tasks 21-34 move Workbench, queue ledger, run history, resume preflight, and manual landed state to Python authority.
- RAG tasks 35-42 move RAG query, source evidence, degraded states, callsites, and smoke to Python.
- A2A tasks 43-51 move A2A message, session, lifecycle, stream, retry/cancel, callsites, and smoke to Python.
- Retirement tasks 52-60 audit residual Node backend APIs, add consolidated tests/smokes, document routing, clean deprecated stubs, and add regression guards.

## Execution Steps
- [ ] Run the AgentLoop queue gates against all generated tasks before starting execution.
- [ ] Start the queue with worktree scope set to `queue` and queue worktree name `backend-python-api-cutover-no-node-105`.
- [ ] At each group boundary, stop for checkpoint review, sync accepted changes to main, and make a small commit.
- [ ] Resume unfinished tasks only after confirming Workbench and resume logic read the same merged authoritative ledger.
- [ ] Finish with a final no-Node backend API residual audit before removing or deprecating Node server routes.

## Verification Commands
- `node agent-loop/src/check-mojibake.js agent-loop/tasks/backend-python-no-node-*.md agent-loop/tasks/backend-python-no-node-api-migration-status-105.md`
- `node -e "const fs=require('fs'); const q=JSON.parse(fs.readFileSync('agent-loop/scripts/backend-python-api-cutover-no-node-105-queue.json','utf8')); console.log(q.tasks.length); if(q.tasks.length!==60) process.exit(1);"`
- Run task-specific pytest, Vitest, and smoke commands recorded in each task final report.

## Self-Review
- No generated task should lack Required implementation, Required tests, Do not, or Acceptance criteria sections.
- No generated queue task should use task-scoped worktrees.
- No task should ask workers to remove Node frontend tooling.
