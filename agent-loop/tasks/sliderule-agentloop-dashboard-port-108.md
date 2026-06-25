# SlideRule AgentLoop 108: dashboard port

## Execution status
- Status: pending
- Goal: serve an initial AgentLoop browser dashboard from `slide-rule-python`.
- Required gate: `slideruleAgentLoopDashboardPort108Gates`

## Context
The user wants AgentLoop and SlideRule to become one product. This task creates the first Python-served dashboard shell instead of relying on the VS Code webview as the primary UI.

## Allowed files
- `slide-rule-python/routes/agent_loop.py`
- `slide-rule-python/static/agent-loop/index.html`
- `slide-rule-python/static/agent-loop/agent-loop-dashboard.js`
- `slide-rule-python/tests/test_agent_loop_dashboard_port.py`
- `agent-loop/tasks/sliderule-agentloop-dashboard-port-108.md`
- This task file

## Do not
- Do not introduce CDN dependencies.
- Do not bundle the VS Code extension into Python.
- Do not block the dashboard when the run list is empty.

## Acceptance criteria
- Add a test named `agentloop dashboard port 108 serves python owned dashboard shell`.
- Dashboard shell is served from a stable `/agent-loop` or `/api/agent-loop/dashboard` route.
- The shell fetches `/api/agent-loop/runs` or a documented overview endpoint.
- Empty and error states render without VS Code APIs.
