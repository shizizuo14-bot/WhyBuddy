# SlideRule Python V5.2 Full Authority Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the SlideRule V5.2 migration so Python FastAPI owns durable reasoning state, backend API semantics, trust/coverage gates, driver execution, capability parity, and Node backend retirement.

**Architecture:** Execute one 72-task AgentLoop queue in one queue-scoped worktree. Each task moves one state, gate, driver, capability, await, budget, or retirement slice to Python authority and records evidence in the shared migration status file.

**Tech Stack:** React, Vite, pnpm, TypeScript compatibility/proxy code, FastAPI, Pydantic, pytest, Vitest, Playwright/browser smoke, AgentLoop queue runner.

---

## File Structure
- Create: `agent-loop/scripts/sliderule-python-v52-full-authority-cutover-105-queue.json` - queue definition with 72 enabled tasks and queue-scoped worktree defaults.
- Create: `agent-loop/tasks/sliderule-python-v52-migration-status-105.md` - shared V5.2 ownership ledger.
- Create: `agent-loop/tasks/sliderule-python-v52-*.md` - individual AgentLoop task specs.
- Create: `docs/superpowers/plans/2026-07-02-sliderule-python-v52-full-authority-cutover.md` - this execution plan.

## Task Groups
- StateSchema tasks 1-8 align Python V5SessionState and durable artifact/run contracts.
- SessionAuthority tasks 9-16 make Python session persistence, replay, sanitize, and concurrency authoritative.
- TrustGcov tasks 17-26 port strict coverage and trust gates.
- PythonDriver tasks 27-38 implement the closed-loop reasoning driver.
- CapabilityParity tasks 39-52 port key capability semantics and golden tests.
- InteractiveAwait tasks 53-58 port readiness, confirm, user intervention, and await/resume.
- BudgetMarathon tasks 59-64 port budget, cost ledger, marathon, digest, and escalation.
- NodeRetirement tasks 65-72 reduce Node backend to thin compatibility, run browser smoke, and write final report.

## Execution Steps
- [ ] Validate generated task count and required sections before running the queue.
- [ ] Start AgentLoop using `agent-loop/scripts/sliderule-python-v52-full-authority-cutover-105-queue.json`.
- [ ] Keep the queue in one queue-scoped worktree named `sliderule-python-v52-full-authority-cutover-105`.
- [ ] Checkpoint after StateSchema, TrustGcov, PythonDriver, CapabilityParity, BudgetMarathon, and NodeRetirement.
- [ ] Land reviewed batches to main only after targeted tests and status ledger updates.

## Verification Commands
- `node -e "const fs=require('fs'); const q=JSON.parse(fs.readFileSync('agent-loop/scripts/sliderule-python-v52-full-authority-cutover-105-queue.json','utf8')); console.log(q.tasks.length); if(q.tasks.length!==72) process.exit(1);"`
- `node agent-loop/src/check-mojibake.js agent-loop/tasks/sliderule-python-v52-migration-status-105.md`
- `node agent-loop/src/check-mojibake.js agent-loop/tasks/sliderule-python-v52-*.md`
- Task-specific pytest, Vitest, and browser smoke commands must be recorded by each worker.

## Self-Review
- No task should remove Node frontend tooling.
- No task should count retained Node backend fallback as Python authority.
- No task should trust client-submitted ledgers or coverage state.
- No task should claim V5.2 closure without direct Python tests.
