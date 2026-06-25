# SlideRule AgentLoop 108: task detail view

## Execution status
- Status: pending
- Goal: add a browser detail view for AgentLoop runs in the Python-served dashboard.
- Required gate: `slideruleAgentLoopTaskDetailView108Gates`

## Context
The VS Code detail page already has useful flow, timeline, review, diff, agent output, and artifact sections. This task ports the first browser version against Python APIs.

## Allowed files
- `slide-rule-python/static/agent-loop/index.html`
- `slide-rule-python/static/agent-loop/agent-loop-dashboard.js`
- `slide-rule-python/tests/test_agent_loop_task_detail_view.py`
- `agent-loop/tasks/sliderule-agentloop-task-detail-view-108.md`
- This task file

## Do not
- Do not copy VS Code-specific bridge code.
- Do not duplicate artifact cards if the center panel already exposes artifacts.
- Do not fetch unbounded logs.

## Acceptance criteria
- Add a test named `agentloop task detail view 108 renders flow timeline review diff output and artifacts`.
- Detail view uses the Python run detail endpoint.
- Flow, timeline, review, diff, agent output, and artifact sections have stable DOM anchors.
- Missing sections render empty states instead of crashing.
