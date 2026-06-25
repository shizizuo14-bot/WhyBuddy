# NodeJS To Python 100 AgentLoop Tasks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the final AgentLoop queue that can push the overall NodeJS backend to a truthful Python migration 100% candidate, or prove exactly why it must remain below 100%.

**Architecture:** The queue is split into five code-bearing closure tasks, one route cutover audit, and one final status refresh. Code tasks must produce Python runtime/production-cutover evidence plus Node bridge tests; audit/status tasks do not count as migration implementation.

**Tech Stack:** AgentLoop queue JSON, Markdown task specs, Node/Vitest, Python/pytest, TypeScript, SlideRule Python backend.

---

### Task 1: Blueprint Main Runtime Closure 100

**Files:**
- Create: `agent-loop/tasks/backend-python-blueprint-main-runtime-closure-100.md`
- Modify: `agent-loop/scripts/migration-queue.json`

- [ ] **Step 1: Run the task through AgentLoop**

Run:

```powershell
node agent-loop/scripts/run-queue.mjs --repo . --only backend-python-blueprint-main-runtime-closure-100
```

Expected: task produces real Python/Node runtime diff and all `blueprintMainRuntimeClosure100Gates` pass.

- [ ] **Step 2: Review the result**

Check:

```powershell
git diff -- slide-rule-python server/routes/blueprint server/routes/__tests__ shared/blueprint agent-loop/tasks/backend-python-blueprint-main-runtime-closure-100.md
```

Expected: no `.agent-loop` artifacts; no broad Blueprint route rewrite; no fake 100% status update.

### Task 2: Auth/Audit Production Closure 100

**Files:**
- Create: `agent-loop/tasks/backend-python-auth-audit-production-closure-100.md`
- Modify: `agent-loop/scripts/migration-queue.json`

- [ ] **Step 1: Run the task through AgentLoop**

Run:

```powershell
node agent-loop/scripts/run-queue.mjs --repo . --only backend-python-auth-audit-production-closure-100
```

Expected: task produces real Auth/Audit/Permission closure code and all `authAuditProductionClosure100Gates` pass.

- [ ] **Step 2: Review the result**

Check:

```powershell
git diff -- slide-rule-python server/auth server/audit server/permission server/routes/auth.ts server/routes/audit.ts shared/auth.ts shared/audit shared/permission
```

Expected: no real secrets, no forced external service access, no relaxed auth/audit semantics.

### Task 3: Task Lifecycle Production Closure 100

**Files:**
- Create: `agent-loop/tasks/backend-python-task-lifecycle-production-closure-100.md`
- Modify: `agent-loop/scripts/migration-queue.json`

- [ ] **Step 1: Run the task through AgentLoop**

Run:

```powershell
node agent-loop/scripts/run-queue.mjs --repo . --only backend-python-task-lifecycle-production-closure-100
```

Expected: task produces mission/task lifecycle closure code and all `taskLifecycleProductionClosure100Gates` pass.

- [ ] **Step 2: Review the result**

Check:

```powershell
git diff -- slide-rule-python/services slide-rule-python/tests server/tasks server/routes/tasks.ts shared/mission
```

Expected: no scheduler rewrite; cancel/error/replay semantics are preserved.

### Task 4: Web AIGC Provider Closure 100

**Files:**
- Create: `agent-loop/tasks/backend-python-web-aigc-provider-closure-100.md`
- Modify: `agent-loop/scripts/migration-queue.json`

- [ ] **Step 1: Run the task through AgentLoop**

Run:

```powershell
node agent-loop/scripts/run-queue.mjs --repo . --only backend-python-web-aigc-provider-closure-100
```

Expected: task produces Web AIGC provider closure code and all `webAigcProviderClosure100Gates` pass.

- [ ] **Step 2: Review the result**

Check:

```powershell
git diff -- slide-rule-python/services slide-rule-python/tests server/core server/routes/node-adapters shared/web-aigc-*
```

Expected: provider_missing/config_missing are not reported as healthy; no user files or generated media are committed.

### Task 5: External Provider Cutover 100

**Files:**
- Create: `agent-loop/tasks/backend-python-external-provider-cutover-100.md`
- Modify: `agent-loop/scripts/migration-queue.json`

- [ ] **Step 1: Run the task through AgentLoop**

Run:

```powershell
node agent-loop/scripts/run-queue.mjs --repo . --only backend-python-external-provider-cutover-100
```

Expected: task produces cutover readiness code and all `externalProviderCutover100Gates` pass.

- [ ] **Step 2: Review the result**

Check:

```powershell
git diff -- slide-rule-python/services slide-rule-python/sliderule_llm slide-rule-python/tests server/rag server/core/web-aigc-runtime-observability.ts shared/telemetry
```

Expected: no secrets, no forced external network dependency, skipped/config_missing remain explicit.

### Task 6: Node Route Cutover Audit 100

**Files:**
- Create: `agent-loop/tasks/backend-python-node-route-cutover-audit-100.md`
- Create: `docs/backend-python-node-route-cutover-audit-100.md`
- Modify: `agent-loop/scripts/migration-queue.json`

- [ ] **Step 1: Run the task through AgentLoop**

Run:

```powershell
node agent-loop/scripts/run-queue.mjs --repo . --only backend-python-node-route-cutover-audit-100
```

Expected: task produces a route cutover audit with thin-proxy, compat-shell, intentionally-retained, and blocker classifications.

- [ ] **Step 2: Review the report**

Check:

```powershell
Get-Content docs/backend-python-node-route-cutover-audit-100.md
```

Expected: report does not count docs-only work as migration implementation.

### Task 7: Migration Status Refresh 100

**Files:**
- Create: `agent-loop/tasks/backend-python-migration-status-refresh-100.md`
- Modify: `agent-loop/tasks/sliderule-python-migration-status.md`
- Modify: `agent-loop/scripts/migration-queue.json`

- [ ] **Step 1: Run the task through AgentLoop**

Run:

```powershell
node agent-loop/scripts/run-queue.mjs --repo . --only backend-python-migration-status-refresh-100
```

Expected: status doc says 100% only if all code tasks and cutover audit support it; otherwise it must keep 97-99% and list blockers.

- [ ] **Step 2: Verify status wording**

Run:

```powershell
node agent-loop/src/check-mojibake.js agent-loop/tasks/sliderule-python-migration-status.md agent-loop/tasks/backend-python-migration-status-refresh-100.md
```

Expected: no mojibake findings.
