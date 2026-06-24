# AgentLoop Settings 105: queue defaults editor

## Execution status
- Status: pending
- Goal: let users inspect and edit queue defaults safely from the Settings Center.
- Required gate: `agentLoopSettingsQueueDefaultsEditor105Gates`

## Context
Users currently edit `agent-loop/scripts/migration-queue.json` by hand for worker budgets, review behavior, proxy env, worktree mode, and cleanup behavior. This task adds a bounded editor for supported defaults only.

## Allowed files
- `agent-loop/vscode-extension/src/dashboardPanel.ts`
- `agent-loop/vscode-extension/src/settingsConfig.ts`
- `agent-loop/vscode-extension/src/dashboard-react/DashboardApp.tsx`
- `agent-loop/vscode-extension/src/dashboard-react/dev.tsx`
- `agent-loop/scripts/migration-queue.json`
- `agent-loop/test/run-queue.test.js`
- `agent-loop/test/vscode-extension.test.js`
- This task file

## Do not
- Do not expose arbitrary JSON editing in this task.
- Do not overwrite the `tasks` array.
- Do not remove comments from task markdown files.
- Do not store secrets in `workerEnv`.

## Acceptance criteria
- Settings UI shows supported queue defaults with current values.
- Save updates only the `defaults` object keys explicitly owned by this editor.
- Queue file writes preserve valid JSON and keep the `tasks` array intact.
- Preview/dry-run mode shows the diff before applying.
- Tests cover safe patching, unsupported-key rejection, and no secret write-through.
