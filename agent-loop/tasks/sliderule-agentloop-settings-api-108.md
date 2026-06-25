# SlideRule AgentLoop 108: settings API

## Execution status
- Status: pending
- Goal: move AgentLoop settings ownership into SlideRule Python with non-secret persistence and secret status reporting.
- Required gate: `slideruleAgentLoopSettingsApi108Gates`

## Context
The VS Code Settings page cannot be the long-term product settings store. This task creates Python settings APIs that can later power the browser dashboard.

## Allowed files
- `slide-rule-python/routes/agent_loop.py`
- `slide-rule-python/services/agent_loop_settings.py`
- `slide-rule-python/tests/test_agent_loop_settings_api.py`
- `agent-loop/tasks/sliderule-agentloop-settings-api-108.md`
- This task file

## Do not
- Do not write raw keys to project JSON.
- Do not echo raw secrets in API responses.
- Do not remove the VS Code settings implementation in this wave.

## Acceptance criteria
- Add a test named `agentloop settings api 108 stores non secret settings and hides keys`.
- Non-secret settings include worker agents, max turns, retries, queue path, worktree mode, proxy flags, and provider base URLs.
- Secret responses return configured status only.
- Save operations normalize unsupported enum values or reject them with a 400 response.
