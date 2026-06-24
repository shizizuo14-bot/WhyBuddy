# SlideRule AgentLoop Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge AgentLoop into `tws-ai-slide-rule-python` as a SlideRule-owned control plane while keeping the existing Node AgentLoop runner as an internal worker bridge for the first wave.

**Architecture:** FastAPI becomes the product and API owner for AgentLoop runs, tasks, settings, events, and commands. The current Node runner stays in place behind a bounded bridge until its stable pieces can be ported to Python. UI work moves toward a normal SlideRule web surface instead of being coupled to the VS Code webview.

**Tech Stack:** Python 3, FastAPI, Pydantic, pytest, current AgentLoop Node runner, existing React/AntD dashboard assets as source material.

---

## File Structure

- `agent-loop/tasks/sliderule-agentloop-*-108.md`: queue-ready task specs for the first integration wave.
- `agent-loop/scripts/migration-queue.json`: enables only the 108 integration wave and defines task-specific red gates.
- `agent-loop/test/run-queue.test.js`: validates 108 queue integrity, disabled superseded waves, task files, gate keys, marker checks, and mojibake gates.
- `tws-ai-slide-rule-python/routes/agent_loop.py`: future FastAPI router for `/api/agent-loop/*`.
- `tws-ai-slide-rule-python/models/agent_loop.py`: future Pydantic contracts for runs, tasks, settings, commands, events, and artifacts.
- `tws-ai-slide-rule-python/services/agent_loop_*.py`: future service modules for run reading, path safety, command bridge, settings, provider health, and redaction.
- `tws-ai-slide-rule-python/tests/test_agent_loop_*.py`: future Python tests proving each slice before runtime code lands.
- `tws-ai-slide-rule-python/static/agent-loop/`: future browser dashboard shell if the web UI is served directly by FastAPI.

## Task Wave

### Task 1: Integration Inventory

**Files:**
- Create: `tws-ai-slide-rule-python/AGENT_LOOP_INTEGRATION_INVENTORY.md`
- Test: `tws-ai-slide-rule-python/tests/test_agent_loop_integration_inventory.py`
- Task: `agent-loop/tasks/sliderule-agentloop-integration-inventory-108.md`

- [ ] Write a failing pytest named `agentloop integration inventory 108 documents source boundaries`.
- [ ] Document current AgentLoop runner, queue, state, artifact, settings, and dashboard ownership.
- [ ] Run `cd tws-ai-slide-rule-python; & "{{pythonExe}}" -m pytest tests/test_agent_loop_integration_inventory.py -q --tb=short`.
- [ ] Commit only the inventory document, test, and task status update.

### Task 2: Runtime Boundary Design

**Files:**
- Create: `tws-ai-slide-rule-python/AGENT_LOOP_RUNTIME_BOUNDARY.md`
- Test: `tws-ai-slide-rule-python/tests/test_agent_loop_runtime_boundary.py`
- Task: `agent-loop/tasks/sliderule-agentloop-runtime-boundary-design-108.md`

- [ ] Write a failing pytest named `agentloop runtime boundary 108 keeps node runner behind python control plane`.
- [ ] Define Python-owned control-plane surfaces and Node-owned worker surfaces.
- [ ] Run the targeted pytest.
- [ ] Commit the boundary doc, test, and task status update.

### Task 3: Data Model Alignment

**Files:**
- Create: `tws-ai-slide-rule-python/models/agent_loop.py`
- Test: `tws-ai-slide-rule-python/tests/test_agent_loop_models.py`
- Task: `agent-loop/tasks/sliderule-agentloop-data-model-alignment-108.md`

- [ ] Write failing model tests for run summary, run detail, task entry, event, artifact, settings, and command request.
- [ ] Implement Pydantic models with redaction-friendly fields.
- [ ] Run the targeted pytest.
- [ ] Commit the model slice.

### Task 4: API Bootstrap

**Files:**
- Create: `tws-ai-slide-rule-python/routes/agent_loop.py`
- Modify: `tws-ai-slide-rule-python/app.py`
- Test: `tws-ai-slide-rule-python/tests/test_agent_loop_api_bootstrap.py`
- Task: `agent-loop/tasks/sliderule-agentloop-api-bootstrap-108.md`

- [ ] Write a failing TestClient test named `agentloop api bootstrap 108 mounts health and capabilities`.
- [ ] Mount `/api/agent-loop` and expose health/capabilities without requiring Node runner availability.
- [ ] Run the targeted pytest.
- [ ] Commit the bootstrap slice.

### Task 5: Runs Overview API

**Files:**
- Create: `tws-ai-slide-rule-python/services/agent_loop_runs.py`
- Modify: `tws-ai-slide-rule-python/routes/agent_loop.py`
- Test: `tws-ai-slide-rule-python/tests/test_agent_loop_runs_overview.py`
- Task: `agent-loop/tasks/sliderule-agentloop-runs-overview-api-108.md`

- [ ] Write failing tests for listing runs from `.agent-loop/runs`.
- [ ] Implement safe, sorted overview reading with empty-state behavior.
- [ ] Run the targeted pytest.
- [ ] Commit the overview API slice.

### Task 6: Run Detail API

**Files:**
- Modify: `tws-ai-slide-rule-python/services/agent_loop_runs.py`
- Modify: `tws-ai-slide-rule-python/routes/agent_loop.py`
- Test: `tws-ai-slide-rule-python/tests/test_agent_loop_run_detail.py`
- Task: `agent-loop/tasks/sliderule-agentloop-run-detail-api-108.md`

- [ ] Write failing tests for state, final report, logs, artifacts, and missing run handling.
- [ ] Implement detail loading with bounded text tails and stable JSON shapes.
- [ ] Run the targeted pytest.
- [ ] Commit the detail API slice.

### Task 7: Event Stream API

**Files:**
- Create: `tws-ai-slide-rule-python/services/agent_loop_events.py`
- Modify: `tws-ai-slide-rule-python/routes/agent_loop.py`
- Test: `tws-ai-slide-rule-python/tests/test_agent_loop_event_stream.py`
- Task: `agent-loop/tasks/sliderule-agentloop-event-stream-api-108.md`

- [ ] Write failing tests for normalized event snapshots and SSE framing.
- [ ] Implement bounded polling/event formatting without long-running tests.
- [ ] Run the targeted pytest.
- [ ] Commit the event API slice.

### Task 8: Worker Bridge

**Files:**
- Create: `tws-ai-slide-rule-python/services/agent_loop_bridge.py`
- Modify: `tws-ai-slide-rule-python/config/settings.py`
- Test: `tws-ai-slide-rule-python/tests/test_agent_loop_worker_bridge.py`
- Task: `agent-loop/tasks/sliderule-agentloop-worker-bridge-108.md`

- [ ] Write failing tests proving command construction, cwd, timeout, env redaction, and disabled execution in test mode.
- [ ] Implement a subprocess bridge that can call the existing Node runner.
- [ ] Run the targeted pytest.
- [ ] Commit the bridge slice.

### Task 9: Command API

**Files:**
- Modify: `tws-ai-slide-rule-python/routes/agent_loop.py`
- Modify: `tws-ai-slide-rule-python/services/agent_loop_bridge.py`
- Test: `tws-ai-slide-rule-python/tests/test_agent_loop_command_api.py`
- Task: `agent-loop/tasks/sliderule-agentloop-command-api-108.md`

- [ ] Write failing tests for start queue, single task run, cancel placeholder, and rerun request validation.
- [ ] Implement command endpoints that call the bridge and return redacted command receipts.
- [ ] Run the targeted pytest.
- [ ] Commit the command API slice.

### Task 10: Settings API

**Files:**
- Create: `tws-ai-slide-rule-python/services/agent_loop_settings.py`
- Modify: `tws-ai-slide-rule-python/routes/agent_loop.py`
- Test: `tws-ai-slide-rule-python/tests/test_agent_loop_settings_api.py`
- Task: `agent-loop/tasks/sliderule-agentloop-settings-api-108.md`

- [ ] Write failing tests for non-secret settings, secret status, and no raw key echo.
- [ ] Implement JSON-backed non-secret settings and local secret status reporting.
- [ ] Run the targeted pytest.
- [ ] Commit the settings API slice.

### Task 11: Provider Health API

**Files:**
- Create: `tws-ai-slide-rule-python/services/agent_loop_provider_health.py`
- Modify: `tws-ai-slide-rule-python/routes/agent_loop.py`
- Test: `tws-ai-slide-rule-python/tests/test_agent_loop_provider_health.py`
- Task: `agent-loop/tasks/sliderule-agentloop-provider-health-api-108.md`

- [ ] Write failing tests for Grok, Codex, OpenAI, Anthropic, and unavailable CLI classification.
- [ ] Implement health probes with cacheable, redacted results.
- [ ] Run the targeted pytest.
- [ ] Commit the provider health slice.

### Task 12: Dashboard Port

**Files:**
- Create: `tws-ai-slide-rule-python/static/agent-loop/index.html`
- Create: `tws-ai-slide-rule-python/static/agent-loop/agent-loop-dashboard.js`
- Modify: `tws-ai-slide-rule-python/routes/agent_loop.py`
- Test: `tws-ai-slide-rule-python/tests/test_agent_loop_dashboard_port.py`
- Task: `agent-loop/tasks/sliderule-agentloop-dashboard-port-108.md`

- [ ] Write failing tests proving the dashboard shell is served from Python.
- [ ] Add a minimal browser shell that calls `/api/agent-loop/runs`.
- [ ] Run the targeted pytest.
- [ ] Commit the dashboard shell slice.

### Task 13: Navigation Shell

**Files:**
- Modify: `tws-ai-slide-rule-python/static/agent-loop/index.html`
- Modify: `tws-ai-slide-rule-python/static/agent-loop/agent-loop-dashboard.js`
- Test: `tws-ai-slide-rule-python/tests/test_agent_loop_navigation_shell.py`
- Task: `agent-loop/tasks/sliderule-agentloop-navigation-shell-108.md`

- [ ] Write failing tests for workbench, runs, settings, and SlideRule back-link labels.
- [ ] Implement the first product navigation shell in the Python-served dashboard.
- [ ] Run the targeted pytest.
- [ ] Commit the navigation slice.

### Task 14: Task Detail View

**Files:**
- Modify: `tws-ai-slide-rule-python/static/agent-loop/agent-loop-dashboard.js`
- Modify: `tws-ai-slide-rule-python/static/agent-loop/index.html`
- Test: `tws-ai-slide-rule-python/tests/test_agent_loop_task_detail_view.py`
- Task: `agent-loop/tasks/sliderule-agentloop-task-detail-view-108.md`

- [ ] Write failing tests for detail panel anchors and API usage.
- [ ] Implement run detail sections for flow, timeline, review, diff, agent output, and artifacts.
- [ ] Run the targeted pytest.
- [ ] Commit the detail view slice.

### Task 15: Path Security

**Files:**
- Create: `tws-ai-slide-rule-python/services/agent_loop_paths.py`
- Modify: `tws-ai-slide-rule-python/services/agent_loop_runs.py`
- Test: `tws-ai-slide-rule-python/tests/test_agent_loop_path_security.py`
- Task: `agent-loop/tasks/sliderule-agentloop-path-security-108.md`

- [ ] Write failing tests for path traversal, absolute path escape, symlink escape, and allowed run paths.
- [ ] Implement path resolution helpers used by all run/artifact readers.
- [ ] Run the targeted pytest.
- [ ] Commit the path security slice.

### Task 16: Secret Redaction

**Files:**
- Create: `tws-ai-slide-rule-python/services/agent_loop_redaction.py`
- Modify: `tws-ai-slide-rule-python/services/agent_loop_runs.py`
- Modify: `tws-ai-slide-rule-python/services/agent_loop_bridge.py`
- Test: `tws-ai-slide-rule-python/tests/test_agent_loop_secret_redaction.py`
- Task: `agent-loop/tasks/sliderule-agentloop-secret-redaction-108.md`

- [ ] Write failing tests for API keys, bearer tokens, proxy credentials, env output, and command receipts.
- [ ] Implement one redaction helper and use it at every Python AgentLoop API boundary.
- [ ] Run the targeted pytest.
- [ ] Commit the redaction slice.

### Task 17: Python Test Harness

**Files:**
- Create: `tws-ai-slide-rule-python/tests/fixtures/agent_loop_run/`
- Create: `tws-ai-slide-rule-python/tests/test_agent_loop_python_harness.py`
- Task: `agent-loop/tasks/sliderule-agentloop-python-tests-108.md`

- [ ] Write fixture-backed tests for overview, detail, event, command dry-run, settings, and redaction.
- [ ] Keep tests deterministic and independent of live Grok/Codex CLIs.
- [ ] Run the targeted pytest.
- [ ] Commit the harness slice.

### Task 18: Release Runbook

**Files:**
- Create: `tws-ai-slide-rule-python/AGENT_LOOP_RUNBOOK.md`
- Modify: `tws-ai-slide-rule-python/README.md`
- Test: `tws-ai-slide-rule-python/tests/test_agent_loop_release_runbook.py`
- Task: `agent-loop/tasks/sliderule-agentloop-release-runbook-108.md`

- [ ] Write failing tests that check documented startup, queue execution, settings, security, and rollback commands.
- [ ] Document the one-product SlideRule + AgentLoop operation path.
- [ ] Run the targeted pytest.
- [ ] Commit the runbook slice.

## Queue Guardrails

- Only 108 integration tasks should be enabled while this wave is active.
- 100-107 Settings tasks and older migration waves should stay disabled unless explicitly selected with `--only`.
- Every enabled 108 task must have:
  - an existing task file,
  - a unique `gatesKey`,
  - a first gate that checks a task-specific marker,
  - a mojibake gate covering the task file and touched files,
  - `workerMaxTurns: 128`,
  - `guardTests: false`.

## Self Review

- Spec coverage: all requested parts of the recommended C path are covered: control plane, bridge, APIs, settings, provider health, dashboard, security, tests, and runbook.
- Placeholder scan: this plan intentionally avoids TBD/TODO placeholders.
- Type consistency: task names, marker names, and file paths use the `sliderule-agentloop-*-108` wave consistently.
