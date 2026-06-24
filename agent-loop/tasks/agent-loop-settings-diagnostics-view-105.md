# AgentLoop Settings 105: diagnostics view

## Execution status
- Status: pending
- Goal: add a diagnostics tab that explains why a queue will run with the current effective settings.
- Required gate: `agentLoopSettingsDiagnosticsView105Gates`

## Context
The user needs to understand whether settings came from defaults, VS Code workspace config, queue JSON, SecretStorage, or runtime env. Diagnostics should make configuration precedence visible without exposing secrets.

## Allowed files
- `agent-loop/vscode-extension/src/settingsConfig.ts`
- `agent-loop/vscode-extension/src/dashboardPanel.ts`
- `agent-loop/vscode-extension/src/runController.ts`
- `agent-loop/vscode-extension/src/dashboard-react/DashboardApp.tsx`
- `agent-loop/vscode-extension/src/dashboard-react/dev.tsx`
- `agent-loop/test/vscode-extension.test.js`
- This task file

## Do not
- Do not show raw env values for secrets.
- Do not require a queue to be running.
- Do not add another top-level sidebar item unless the Settings design requires it.
- Do not conflate provider health checks with static diagnostics.

## Acceptance criteria
- Settings has a Diagnostics tab with effective config, source, and redacted secret status.
- Diagnostics identify missing CLI binaries, missing queue file, disabled key injection, and unset provider keys.
- The tab can copy a redacted diagnostic report.
- Tests cover precedence, redaction, and missing-file indicators.
