# AgentLoop Settings 105: SecretStorage contract

## Execution status
- Status: pending
- Goal: harden the LLM key storage contract so secrets never leak to webview payloads, logs, or exported settings.
- Required gate: `agentLoopSettingsSecretStorage105Gates`

## Context
The Settings Center exposes Grok, OpenAI, and Anthropic key status. This task must turn the first-pass implementation into a durable contract: webview receives status only, save operations distinguish unchanged/cleared/updated values, and test coverage prevents raw key leakage.

## Allowed files
- `agent-loop/vscode-extension/src/dashboardPanel.ts`
- `agent-loop/vscode-extension/src/runController.ts`
- `agent-loop/vscode-extension/src/types.ts`
- `agent-loop/vscode-extension/src/dashboard-react/DashboardApp.tsx`
- `agent-loop/vscode-extension/src/dashboard-react/types.ts`
- `agent-loop/vscode-extension/src/dashboard-react/dev.tsx`
- `agent-loop/test/vscode-extension.test.js`
- This task file

## Do not
- Do not send raw keys through `postMessage`.
- Do not write raw keys to `package.json`, queue JSON, `.agent-loop`, logs, or workspace settings.
- Do not echo key values in diagnostics or provider test results.
- Do not make provider network calls in unit tests.

## Acceptance criteria
- `getSettings` returns only configured/unconfigured status for each secret.
- `saveSettings` supports no-change, update, single-key clear, and clear-all semantics.
- Worker env injection reads secrets only inside extension-host/runtime code.
- Tests assert serialized webview payloads and logs never contain sample secret values.
- Dev preview mocks follow the same redaction contract.
