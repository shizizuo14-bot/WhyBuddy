# Task List

## Tasks

- [x] 1. Lock `/tasks` workbench tab behavior with tests
  - [x] 1.1 Add or update a `/tasks` page test that renders `TasksPage` with desktop viewport state.
  - [x] 1.2 Mock `OfficeWorkflowFlowPanel`, `OfficeAgentInspectorPanel`, `OfficeMemoryReportsPanel`, and `OfficeWorkflowHistoryPanel` with visible test ids.
  - [x] 1.3 Assert the page contains tab triggers for `任务`, `团队流`, `Agent`, `记忆`, and `历史`.
  - [x] 1.4 Assert the page does not contain a `发起` tab trigger.
  - [x] 1.5 Assert the task tab renders `TasksCockpitDetail`.
  - [x] 1.6 Run the page test with `npx vitest run --pool=forks --poolOptions.forks.singleFork <test-path>` and confirm it fails before implementation.

- [x] 2. Add the task center workbench tabs
  - [x] 2.1 In `client/src/pages/tasks/TasksPage.tsx`, add local active-tab state for `task`, `flow`, `agent`, `memory`, and `history`.
  - [x] 2.2 Add a `Tabs` shell around the main task content.
  - [x] 2.3 Render `TasksCockpitDetail` in the `task` tab.
  - [x] 2.4 Render `OfficeWorkflowFlowPanel` in the `flow` tab.
  - [x] 2.5 Render `OfficeAgentInspectorPanel` or an explicit empty state in the `agent` tab.
  - [x] 2.6 Render `OfficeMemoryReportsPanel` in the `memory` tab.
  - [x] 2.7 Render `OfficeWorkflowHistoryPanel` in the `history` tab.
  - [x] 2.8 Do not render a `launch` tab or trigger on `/tasks`.

- [x] 3. Wire workflow context into `/tasks`
  - [x] 3.1 Import and use `useWorkflowStore` in `TasksPage`.
  - [x] 3.2 Resolve the active workflow for the selected task using existing office utilities.
  - [x] 3.3 Preserve task selection when workflow history selects a mission.
  - [x] 3.4 Disable or show empty states for tabs whose data is not available.

- [x] 4. Preserve width and detail behavior
  - [x] 4.1 Keep the existing `RightInfoPanel` full-width behavior in `/tasks`.
  - [x] 4.2 Keep the `TasksCockpitDetail` full-detail dialog behavior.
  - [x] 4.3 Run `client/src/components/tasks/__tests__/TasksCockpitDetail.test.tsx` and `client/src/components/tasks/__tests__/RightInfoPanel.test.tsx`.

- [x] 5. Verify task center
  - [x] 5.1 Run the new `/tasks` tests.
  - [x] 5.2 Run the UI targeted suite that covers `TasksQueueRail`, `TasksCockpitDetail`, `RightInfoPanel`, and `App.shell-layout`.
  - [x] 5.3 Manually inspect `http://localhost:3000/tasks` and confirm no `发起` tab is visible.
