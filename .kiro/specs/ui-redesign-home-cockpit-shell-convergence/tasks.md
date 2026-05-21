# Task List

## Tasks

- [x] 1. Lock the home shell behavior with tests
  - [x] 1.1 Update `client/src/components/office/OfficeTaskCockpit.test.tsx` so the mocked `TasksQueueRail` has a `data-testid="tasks-queue-rail"` marker.
  - [x] 1.2 Add a test asserting `OfficeTaskCockpit` does not render `data-testid="tasks-queue-rail"` on the home cockpit.
  - [x] 1.3 Add a test asserting `OfficeTaskCockpit` still renders exactly one `data-testid="unified-launch-composer"`.
  - [x] 1.4 Add a test asserting the home right drawer exposes `launch`, `task`, `flow`, `agent`, `memory`, and `history` tab triggers.
  - [x] 1.5 Add a test asserting `data-testid="office-scene-hud"` remains present.
  - [x] 1.6 Run `npx vitest run --pool=forks --poolOptions.forks.singleFork client/src/components/office/OfficeTaskCockpit.test.tsx` and confirm the new drawer-removal test fails before implementation.

- [x] 2. Remove the home left task queue drawer
  - [x] 2.1 In `client/src/components/office/OfficeTaskCockpit.tsx`, remove the left `Splitter.Panel` that renders `TasksQueueRail`.
  - [x] 2.2 Remove the `TasksQueueRail` import from `OfficeTaskCockpit.tsx` if it is no longer used.
  - [x] 2.3 Adjust the remaining `Splitter.Panel` sizes so the center stage expands into the freed space.
  - [x] 2.4 Ensure `selectedDetail`, `activeTaskId`, `filteredTasks`, and task selection logic are not removed if still used by the right drawer and launch flows.
  - [x] 2.5 Run the `OfficeTaskCockpit.test.tsx` target and confirm the drawer-removal tests pass.

- [x] 3. Move center autopilot guidance to the right drawer launch tab
  - [x] 3.1 Identify the existing center autopilot/launch guidance inside `launcherFloatingStack`, `launcherDock`, and `launcherContextDock`.
  - [x] 3.2 Keep the actual `UnifiedLaunchComposer` in the center-bottom composer.
  - [x] 3.3 Move non-composer launch guidance into the right drawer `launch` tab content.
  - [x] 3.4 Keep clarification as a separate overlay without duplicating the composer.
  - [x] 3.5 Run `OfficeTaskCockpit.test.tsx` and confirm exactly one composer still renders.

- [x] 4. Final home cockpit verification
  - [x] 4.1 Run `npx vitest run --pool=forks --poolOptions.forks.singleFork client/src/components/office/OfficeTaskCockpit.test.tsx client/src/components/office/__tests__/OfficeTaskCockpit.cards-integration.test.tsx client/src/components/office/office-task-cockpit-utils.test.ts`.
  - [x] 4.2 Manually inspect `http://localhost:3000/` on desktop after implementation and confirm there is no home left task queue drawer.
  - [x] 4.3 Confirm the center scene is not covered by a large autopilot panel.
  - [x] 4.4 Confirm the right drawer still has six tabs on home.
