# SlideRule AgentLoop 108: command API

## Execution status
- Status: pending
- Goal: expose Python command endpoints for starting queue runs, single-task runs, reruns, and cancel placeholders.
- Required gate: `slideruleAgentLoopCommandApi108Gates`

## Context
The product UI needs Python-owned actions even while the Node runner remains the execution worker. This task wraps the bridge behind validated FastAPI endpoints.

## Allowed files
- `tws-ai-slide-rule-python/routes/agent_loop.py`
- `tws-ai-slide-rule-python/services/agent_loop_bridge.py`
- `tws-ai-slide-rule-python/tests/test_agent_loop_command_api.py`
- `agent-loop/tasks/sliderule-agentloop-command-api-108.md`
- This task file

## Do not
- Do not start live workers from unit tests.
- Do not implement process cancellation by killing arbitrary PIDs.
- Do not return raw command env.

## Acceptance criteria
- Add a test named `agentloop command api 108 starts queue through bridge dry run`.
- Endpoints validate task ids, queue paths, and mode values.
- Dry-run mode returns the exact redacted command that would be executed.
- Cancel endpoint returns an explicit unsupported or queued-cancel placeholder instead of pretending success.
