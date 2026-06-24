# AgentLoop Settings 105: worker environment injection

## Execution status
- Status: pending
- Goal: make saved Settings values actually drive AgentLoop worker processes without leaking secrets.
- Required gate: `agentLoopSettingsWorkerEnvInjection105Gates`

## Context
Keys, base URLs, proxy values, worker selection, and turn/retry limits need to affect spawned AgentLoop runs. This task must verify `runQueue` and `runScript` use the same settings resolution and that disabled injection leaves the process environment untouched.

## Allowed files
- `agent-loop/vscode-extension/src/runController.ts`
- `agent-loop/vscode-extension/src/settingsConfig.ts`
- `agent-loop/vscode-extension/src/dashboardPanel.ts`
- `agent-loop/vscode-extension/src/extension.ts`
- `agent-loop/test/vscode-extension.test.js`
- `agent-loop/vscode-extension/package.json`
- This task file

## Do not
- Do not print secret values to the output channel.
- Do not override user-provided process env values unless settings explicitly require it.
- Do not change task queue contents.
- Do not add live provider dependencies to compile/package gates.

## Acceptance criteria
- `runQueue` and `runScript` both receive settings-derived env consistently.
- `injectKeysToWorker=false` prevents LLM key injection.
- Grok/OpenAI/Anthropic keys map to documented env aliases.
- Base URL and proxy settings are applied consistently and can be disabled.
- Tests cover env construction with mocked secrets and verify masking in logs.
