# SlideRule AgentLoop 108: Python test harness

## Execution status
- Status: pending
- Goal: add deterministic Python fixtures and tests for the AgentLoop control plane.
- Required gate: `slideruleAgentLoopPythonTests108Gates`

## Context
The merged product should be testable without live workers. This task creates reusable fixtures for run state, reports, logs, artifacts, settings, and redaction tests.

## Allowed files
- `slide-rule-python/tests/fixtures/agent_loop_run/`
- `slide-rule-python/tests/test_agent_loop_python_harness.py`
- `agent-loop/tasks/sliderule-agentloop-python-tests-108.md`
- This task file

## Do not
- Do not call live Grok, Codex, OpenAI, Anthropic, Node, npm, or git.
- Do not rely on the local `.agent-loop/runs` directory.
- Do not create large binary fixtures.

## Acceptance criteria
- Add a test named `agentloop python harness 108 provides deterministic run fixtures`.
- Fixtures cover done, failed, running, no-diff, artifact, and redacted-secret cases.
- Tests can run alone with `pytest tests/test_agent_loop_python_harness.py`.
- Fixture helper paths are portable on Windows.
