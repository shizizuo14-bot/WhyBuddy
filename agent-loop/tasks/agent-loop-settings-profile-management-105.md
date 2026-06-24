# AgentLoop Settings 105: profiles

## Execution status
- Status: pending
- Goal: add named Settings profiles for local, proxy, CI, and production-like AgentLoop runs.
- Required gate: `agentLoopSettingsProfileManagement105Gates`

## Context
Different AgentLoop runs need different provider, proxy, worker, and timeout settings. Profiles should switch non-secret values safely while keeping secret status redacted and scoped.

## Allowed files
- `agent-loop/vscode-extension/package.json`
- `agent-loop/vscode-extension/src/settingsConfig.ts`
- `agent-loop/vscode-extension/src/dashboardPanel.ts`
- `agent-loop/vscode-extension/src/runController.ts`
- `agent-loop/vscode-extension/src/dashboard-react/DashboardApp.tsx`
- `agent-loop/vscode-extension/src/dashboard-react/dev.tsx`
- `agent-loop/test/vscode-extension.test.js`
- This task file

## Do not
- Do not duplicate raw secrets into profile JSON.
- Do not silently switch the active profile while a queue is running.
- Do not add profile support to migration status docs.
- Do not create global machine-wide files outside VS Code settings/SecretStorage.

## Acceptance criteria
- UI can create, rename, delete, and select a profile.
- Active profile is visible in overview and detail context.
- Non-secret profile settings are persisted through workspace configuration.
- Secret keys are represented as per-profile statuses or clearly documented shared statuses.
- Tests cover profile selection, save payload shape, and running-state guard behavior.
