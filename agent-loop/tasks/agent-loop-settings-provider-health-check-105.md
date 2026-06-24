# AgentLoop Settings 105: provider health checks

## Execution status
- Status: pending
- Goal: add safe provider/CLI connectivity checks from the Settings Center.
- Required gate: `agentLoopSettingsProviderHealthCheck105Gates`

## Context
Users need to know whether Grok, Codex/OpenAI, Anthropic, proxy, and CLI binaries are usable before starting long AgentLoop queues. The checks must be explicit user actions, bounded by timeouts, and return redacted diagnostics.

## Allowed files
- `agent-loop/vscode-extension/src/dashboardPanel.ts`
- `agent-loop/vscode-extension/src/runController.ts`
- `agent-loop/vscode-extension/src/extension.ts`
- `agent-loop/vscode-extension/src/dashboard-react/DashboardApp.tsx`
- `agent-loop/vscode-extension/src/dashboard-react/types.ts`
- `agent-loop/vscode-extension/src/dashboard-react/dev.tsx`
- `agent-loop/test/vscode-extension.test.js`
- This task file

## Do not
- Do not run live network checks automatically on page load.
- Do not expose raw request headers, tokens, or Authorization values.
- Do not block Settings save on provider test failures.
- Do not require real keys in automated tests.

## Acceptance criteria
- Settings UI exposes explicit `test CLI` and `test provider` actions.
- Extension message handlers return structured status: `ready`, `skipped`, `failed`, or `timeout`.
- Results include provider name, duration, command/source, and redacted error details.
- Tests cover message routing, timeout behavior, and redaction.
- Dev preview can simulate success/failure states without real providers.
