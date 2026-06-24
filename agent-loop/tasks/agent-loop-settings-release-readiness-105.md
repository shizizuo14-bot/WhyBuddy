# AgentLoop Settings 105: release readiness

## Execution status
- Status: pending
- Goal: package a clean VSIX after the Settings Center 105 tasks land.
- Required gate: `agentLoopSettingsReleaseReadiness105Gates`

## Context
This is the final release task for the Settings Center 105 queue. It should not implement new behavior; it should verify compile/build/package, artifact hygiene, and status documentation for the new AgentLoop settings work.

## Allowed files
- `agent-loop/vscode-extension/package.json`
- `agent-loop/vscode-extension/README.md`
- `agent-loop/vscode-extension/agent-loop-dashboard-*.vsix`
- `agent-loop/vscode-extension/media/dashboard.bundle.js`
- `agent-loop/vscode-extension/media/dashboard.bundle.css`
- `agent-loop/vscode-extension/out/**`
- `agent-loop/tasks/agent-loop-settings-*-105.md`
- `agent-loop/test/vscode-extension.test.js`
- This task file

## Do not
- Do not add new Settings features in this task.
- Do not include temporary diagnostic files such as `tsc-errors.txt`.
- Do not modify older VSIX artifacts unless intentionally replacing them.
- Do not claim full queue success without checking package contents.

## Acceptance criteria
- `npm run compile`, `npm run build:dashboard`, and `npm run package` pass in `agent-loop/vscode-extension`.
- The generated VSIX includes the React bundle, compiled extension files, and no temporary diagnostics.
- Package warnings are either fixed or listed as non-blocking with rationale.
- The task files record which 105 Settings tasks landed and which remain pending.
