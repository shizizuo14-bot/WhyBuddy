# SlideRule AgentLoop 108: run detail API

## Execution status
- Status: pending
- Goal: expose a Python endpoint for a single AgentLoop run detail, including state, report, logs, and artifacts.
- Required gate: `slideruleAgentLoopRunDetailApi108Gates`

## Context
The detail page must stop depending on VS Code extension state readers. This task creates the Python detail surface using existing run artifacts.

## Allowed files
- `slide-rule-python/routes/agent_loop.py`
- `slide-rule-python/services/agent_loop_runs.py`
- `slide-rule-python/tests/test_agent_loop_run_detail.py`
- `agent-loop/tasks/sliderule-agentloop-run-detail-api-108.md`
- This task file

## Do not
- Do not expose absolute local paths in API responses.
- Do not return full unbounded logs.
- Do not leak raw environment variables or keys from artifacts.

## Acceptance criteria
- Add a test named `agentloop run detail 108 returns bounded state report logs and artifacts`.
- Detail endpoint returns 404 for unknown runs.
- Text tails are bounded and documented in tests.
- Artifact entries include safe relative identifiers that can be fetched later by the control plane.
