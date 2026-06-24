# SlideRule AgentLoop 108: worker bridge

## Execution status
- Status: pending
- Goal: add a Python service that can build and optionally execute the existing Node AgentLoop queue runner.
- Required gate: `slideruleAgentLoopWorkerBridge108Gates`

## Context
This wave keeps AgentLoop execution in Node but puts SlideRule Python in charge of commands. The bridge must be deterministic and safe before command endpoints call it.

## Allowed files
- `tws-ai-slide-rule-python/config/settings.py`
- `tws-ai-slide-rule-python/services/agent_loop_bridge.py`
- `tws-ai-slide-rule-python/tests/test_agent_loop_worker_bridge.py`
- `agent-loop/tasks/sliderule-agentloop-worker-bridge-108.md`
- This task file

## Do not
- Do not run live Grok or Codex in tests.
- Do not pass raw secrets to command receipts.
- Do not assume `node` or `npm` exists when dry-run mode is requested.

## Acceptance criteria
- Add a test named `agentloop worker bridge 108 builds node queue command without executing in dry run`.
- Bridge supports queue run, single task run, timeout, cwd, env overrides, and dry-run receipts.
- Bridge settings are loaded from Python config with safe defaults.
- Command receipts redact env and credential-like arguments.
