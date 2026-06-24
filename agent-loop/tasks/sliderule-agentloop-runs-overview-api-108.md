# SlideRule AgentLoop 108: runs overview API

## Execution status
- Status: pending
- Goal: expose an overview endpoint that lists AgentLoop runs from the repository run store.
- Required gate: `slideruleAgentLoopRunsOverviewApi108Gates`

## Context
The dashboard needs a Python source of truth for run lists. This task reads existing `.agent-loop/runs` data safely without changing the Node writer.

## Allowed files
- `tws-ai-slide-rule-python/routes/agent_loop.py`
- `tws-ai-slide-rule-python/services/agent_loop_runs.py`
- `tws-ai-slide-rule-python/tests/test_agent_loop_runs_overview.py`
- `agent-loop/tasks/sliderule-agentloop-runs-overview-api-108.md`
- This task file

## Do not
- Do not mutate `.agent-loop/runs`.
- Do not read unbounded log contents.
- Do not scan `.venv`, `node_modules`, `.worktrees`, or uploads.

## Acceptance criteria
- Add a test named `agentloop runs overview 108 lists run summaries from state files`.
- Overview endpoint returns stable summaries sorted newest first.
- Missing or empty run directories return an empty list, not an error.
- Corrupt run records are reported as degraded items without breaking the full response.
