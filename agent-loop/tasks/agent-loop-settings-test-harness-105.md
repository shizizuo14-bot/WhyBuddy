# AgentLoop Settings 105: test harness repair

## Execution status
- Status: pending
- Goal: repair the AgentLoop extension test harness after Settings runtime integration.
- Required gate: `agentLoopSettingsTestHarness105Gates`

## Context
Some Node tests can fail when compiled extension modules import `vscode` directly. This task focuses on testability and should not add new Settings UI features.

## Allowed files
- `agent-loop/vscode-extension/src/settingsConfig.ts`
- `agent-loop/vscode-extension/src/paths.ts`
- `agent-loop/vscode-extension/src/stateReader.ts`
- `agent-loop/vscode-extension/src/phaseLabels.ts`
- `agent-loop/vscode-extension/src/runController.ts`
- `agent-loop/vscode-extension/src/dashboardPanel.ts`
- `agent-loop/test/vscode-extension.test.js`
- `agent-loop/test/run-queue.test.js`
- This task file

## Do not
- Do not skip failing tests by deleting coverage.
- Do not introduce a real `vscode` runtime dependency into Node unit tests.
- Do not change user-facing Settings behavior unless required for testability.
- Do not package a VSIX in this task.

## Acceptance criteria
- `node --test agent-loop/test/vscode-extension.test.js` passes or known unrelated failures are isolated behind explicit targeted tests.
- Settings modules can be tested with mocked workspace configuration and mocked SecretStorage.
- Tests cover get/save settings, config defaults, SecretStorage redaction, and worker env construction.
- Existing active-log/state-reader tests no longer fail because of `Cannot find module 'vscode'`.
