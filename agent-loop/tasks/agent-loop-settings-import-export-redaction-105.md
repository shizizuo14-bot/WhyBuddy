# AgentLoop Settings 105: import/export with redaction

## Execution status
- Status: pending
- Goal: add Settings import/export that is useful for sharing config without leaking credentials.
- Required gate: `agentLoopSettingsImportExportRedaction105Gates`

## Context
AgentLoop configuration is now split across VS Code settings, SecretStorage, queue defaults, and runtime state. Users need an exportable support bundle and a non-secret import format.

## Allowed files
- `agent-loop/vscode-extension/src/dashboardPanel.ts`
- `agent-loop/vscode-extension/src/settingsConfig.ts`
- `agent-loop/vscode-extension/src/dashboard-react/DashboardApp.tsx`
- `agent-loop/vscode-extension/src/dashboard-react/dev.tsx`
- `agent-loop/test/vscode-extension.test.js`
- This task file

## Do not
- Do not export raw API keys.
- Do not import secrets from plain JSON automatically.
- Do not write files outside the workspace without an explicit user command.
- Do not include large run artifacts in the settings export.

## Acceptance criteria
- Export includes non-secret settings, active profile, queue path, worker settings, and redacted secret statuses.
- Import validates schema version and rejects unknown dangerous fields.
- UI clearly distinguishes `import settings` from `set secrets`.
- Tests cover export redaction, invalid import rejection, and schema version handling.
