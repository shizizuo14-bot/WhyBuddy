# AgentLoop Settings 105: schema and runtime config boundary

## Execution status
- Status: pending
- Goal: make Settings Center configuration typed, test-safe, and reusable outside the VS Code host.
- Required gate: `agentLoopSettingsSchemaRuntime105Gates`

## Context
The first Settings Center stores values through VS Code configuration and SecretStorage, but the config reader currently lives close to path helpers and can make Node-based tests require the `vscode` module. This task must create a clean boundary: pure defaults and validation must be usable in Node tests; VS Code access must stay in the extension host layer.

## Allowed files
- `agent-loop/vscode-extension/src/settingsConfig.ts`
- `agent-loop/vscode-extension/src/paths.ts`
- `agent-loop/vscode-extension/src/stateReader.ts`
- `agent-loop/vscode-extension/src/phaseLabels.ts`
- `agent-loop/vscode-extension/src/runController.ts`
- `agent-loop/vscode-extension/src/dashboardPanel.ts`
- `agent-loop/vscode-extension/src/types.ts`
- `agent-loop/test/vscode-extension.test.js`
- This task file

## Do not
- Do not import `vscode` from pure helpers that are required by Node tests.
- Do not store secrets in workspace settings.
- Do not change dashboard visual layout in this task.
- Do not make broad queue or migration changes.

## Acceptance criteria
- A pure settings schema/default module exists and can be imported under plain Node.
- VS Code workspace configuration access is isolated behind an extension-host function.
- Node tests can require `out/paths.js`, `out/phaseLabels.js`, and `out/stateReader.js` without `Cannot find module 'vscode'`.
- Invalid configured values fall back to documented defaults.
- Tests cover the pure default shape and the VS Code adapter boundary.
