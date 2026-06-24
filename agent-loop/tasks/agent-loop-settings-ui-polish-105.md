# AgentLoop Settings 105: AntD UI polish

## Execution status
- Status: pending
- Goal: make Settings Center feel like a product surface while staying consistent with the current AntD dashboard.
- Required gate: `agentLoopSettingsUiPolish105Gates`

## Context
The first Settings page is functional but still basic. This task should improve layout, grouping, descriptions, validation feedback, empty states, and disabled states without changing runtime semantics.

## Allowed files
- `agent-loop/vscode-extension/src/dashboard-react/DashboardApp.tsx`
- `agent-loop/vscode-extension/src/dashboard-react/dashboard-react.css`
- `agent-loop/vscode-extension/src/dashboard-react/dev.tsx`
- `agent-loop/vscode-extension/src/dashboard-react/devPayload.ts`
- `agent-loop/test/vscode-extension.test.js`
- This task file

## Do not
- Do not replace AntD components with custom UI when an AntD component fits.
- Do not add another styling system.
- Do not rework the detail Flow in this task.
- Do not change settings persistence semantics.

## Acceptance criteria
- Settings uses AntD `Tabs`, `Descriptions`, `Form`, `Alert`, `Tag`, `Switch`, `Select`, and `Button` consistently.
- CLI, Keys, Profiles, Queue Defaults, Diagnostics, and Import/Export sections have clear grouping.
- Buttons align predictably and show loading/disabled states.
- Validation messages are visible before save.
- CSS avoids double padding and unnecessary scrollbars.
