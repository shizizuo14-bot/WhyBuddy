# SlideRule AgentLoop 108: API bootstrap

## Execution status
- Status: pending
- Goal: mount a Python-owned `/api/agent-loop` router with health and capability metadata.
- Required gate: `slideruleAgentLoopRunsApiBootstrap108Gates`

## Context
SlideRule Python must become the public AgentLoop control plane. This task adds the router without depending on live Node worker availability.

## Allowed files
- `slide-rule-python/app.py`
- `slide-rule-python/routes/agent_loop.py`
- `slide-rule-python/tests/test_agent_loop_api_bootstrap.py`
- `agent-loop/tasks/sliderule-agentloop-runs-api-bootstrap-108.md`
- This task file

## Do not
- Do not invoke Node processes.
- Do not require Grok, Codex, OpenAI, or Anthropic credentials.
- Do not change existing `/api/sliderule/*` behavior.

## Acceptance criteria
- Add a test named `agentloop api bootstrap 108 mounts health and capabilities`.
- `GET /api/agent-loop/health` returns backend identity, bridge mode, and status.
- `GET /api/agent-loop/capabilities` returns supported control-plane features and marks worker execution as bridged.
- Existing `/health` and `/api/sliderule/*` smoke tests continue to pass.
