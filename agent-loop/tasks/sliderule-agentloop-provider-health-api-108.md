# SlideRule AgentLoop 108: provider health API

## Execution status
- Status: pending
- Goal: expose provider and CLI health checks through the SlideRule Python control plane.
- Required gate: `slideruleAgentLoopProviderHealthApi108Gates`

## Context
AgentLoop needs clear diagnostics for Grok, Codex, OpenAI, Anthropic, proxy, and CLI availability. This task moves those diagnostics to Python without requiring live paid calls in tests.

## Allowed files
- `slide-rule-python/routes/agent_loop.py`
- `slide-rule-python/services/agent_loop_provider_health.py`
- `slide-rule-python/tests/test_agent_loop_provider_health.py`
- `agent-loop/tasks/sliderule-agentloop-provider-health-api-108.md`
- This task file

## Do not
- Do not make live network calls in unit tests.
- Do not expose API keys in health output.
- Do not mark missing optional providers as fatal for the whole control plane.

## Acceptance criteria
- Add a test named `agentloop provider health 108 reports available missing and skipped providers`.
- Health results classify providers as ready, missing, skipped, or failed.
- Results include command path and version when available.
- Output is redacted and cacheable.
