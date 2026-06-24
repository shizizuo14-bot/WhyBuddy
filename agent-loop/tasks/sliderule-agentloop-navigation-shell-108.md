# SlideRule AgentLoop 108: navigation shell

## Execution status
- Status: pending
- Goal: add a product navigation shell for AgentLoop inside the Python-served dashboard.
- Required gate: `slideruleAgentLoopNavigationShell108Gates`

## Context
The dashboard should feel like part of SlideRule, not a transplanted VS Code panel. This task adds the first browser navigation structure.

## Allowed files
- `tws-ai-slide-rule-python/static/agent-loop/index.html`
- `tws-ai-slide-rule-python/static/agent-loop/agent-loop-dashboard.js`
- `tws-ai-slide-rule-python/tests/test_agent_loop_navigation_shell.py`
- `agent-loop/tasks/sliderule-agentloop-navigation-shell-108.md`
- This task file

## Do not
- Do not add unrelated SlideRule pages.
- Do not require a frontend build system in this task.
- Do not use VS Code message APIs.

## Acceptance criteria
- Add a test named `agentloop navigation shell 108 exposes workbench runs settings and sliderule links`.
- Navigation includes Workbench, Runs, Settings, and a SlideRule back link.
- Active view state is represented in URL hash or documented local state.
- Menu labels are stable enough for later React/AntD replacement.
