# AgentLoop Settings 105: CLI worker routing

## Execution status
- Status: pending
- Goal: expand CLI configuration so worker binaries, models, turns, retries, queue path, and worktree scope are all configurable and applied.
- Required gate: `agentLoopSettingsCliWorkerRouting105Gates`

## Context
The first Settings Center exposes basic fix/review agent fields. This task must make the configuration complete enough to run different local setups without editing JSON by hand.

## Allowed files
- `agent-loop/vscode-extension/package.json`
- `agent-loop/vscode-extension/src/settingsConfig.ts`
- `agent-loop/vscode-extension/src/runController.ts`
- `agent-loop/vscode-extension/src/stateReader.ts`
- `agent-loop/vscode-extension/src/phaseLabels.ts`
- `agent-loop/vscode-extension/src/dashboard-react/DashboardApp.tsx`
- `agent-loop/vscode-extension/src/dashboard-react/dev.tsx`
- `agent-loop/test/vscode-extension.test.js`
- This task file

## Do not
- Do not remove existing queue JSON defaults.
- Do not hardcode local absolute paths.
- Do not assume Grok is always the fix worker or Codex is always reviewer.
- Do not change unrelated dashboard layout.

## Acceptance criteria
- Settings include fix/review agent, model, CLI command/path, max turns, max retries, queue path, and worktree scope.
- `reviewAgent=none` is supported end-to-end and reflected in the Flow/labels.
- Spawned runs receive the configured worker arguments.
- Invalid values are rejected in UI or normalized by the schema.
- Tests cover config fallback, command argument construction, and display labels.
