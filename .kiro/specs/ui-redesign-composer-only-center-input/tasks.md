# Task List

## Tasks

- [x] 1. Lock composer-only center expectations with tests
  - [x] 1.1 Update `OfficeTaskCockpit.test.tsx` to assert exactly one `UnifiedLaunchComposer`.
  - [x] 1.2 Add an assertion that the default center does not render a large autopilot guidance panel.
  - [x] 1.3 Add or update launch tests so key composer actions remain visible.
  - [x] 1.4 Run the targeted tests and confirm the large-panel absence assertion fails before implementation if the panel is still present.
  - [x] 1.5 Add a launch composer test asserting destination preview and route planning are not rendered inside the composer surface.
  - [x] 1.6 Add an office cockpit test asserting destination preview and route planning render in the lower Support tab when a draft destination exists.

- [x] 2. Simplify the center composer stack
  - [x] 2.1 In `OfficeTaskCockpit.tsx`, keep the composer in the center-bottom launcher stage.
  - [x] 2.2 Remove default center rendering of non-composer autopilot guidance.
  - [x] 2.3 Keep temporary clarification rendering above the composer only when `currentDialog` exists.
  - [x] 2.4 Keep pending-launch status compact and avoid a large default panel.

- [x] 3. Tune composer visual treatment
  - [x] 3.1 Adjust the composer container to match the compact rounded reference shape.
  - [x] 3.2 Ensure the send button is visually clear on the right side.
  - [x] 3.3 Keep secondary actions compact and readable.
  - [x] 3.4 Ensure action labels do not overlap at desktop and tablet widths.

- [x] 4. Preserve launch functionality
  - [x] 4.1 Verify attachment controls still work through existing callbacks.
  - [x] 4.2 Verify create-task access remains present.
  - [x] 4.3 Verify advanced/more actions remain present.
  - [x] 4.4 Verify launch submission uses existing `UnifiedLaunchComposer` behavior.
  - [x] 4.5 Move destination preview and route planning from the composer surface into the lower Support tab without changing the launch submission path.

- [x] 5. Move the support/runtime panel into the central Splitter
  - [x] 5.1 Add an `OfficeTaskCockpit.test.tsx` assertion that the central control Splitter exists.
  - [x] 5.2 Assert the control panel renders above the composer panel in markup order.
  - [x] 5.3 Import and use Ant Design `Splitter` for the center control area.
  - [x] 5.4 Move launch guidance and Support / Logs / Artifacts / Runtime tabs into the upper Splitter panel.
  - [x] 5.5 Keep the compact `UnifiedLaunchComposer` in the lower Splitter panel.
  - [x] 5.6 Remove the separate standalone bottom support/runtime panel below the composer.

- [x] 6. Verify composer-centered control area
  - [x] 6.1 Run `npx vitest run --pool=forks --poolOptions.forks.singleFork client/src/components/office/OfficeTaskCockpit.test.tsx client/src/components/launch/__tests__/LaunchPanelShell.test.tsx client/src/components/launch/__tests__/LaunchPanelIntegration.test.tsx`.
  - [x] 6.2 Run `npx vitest run --pool=forks --poolOptions.forks.singleFork client/src/components/launch/__tests__/UnifiedLaunchComposer.test.ts client/src/components/office/OfficeTaskCockpit.test.tsx`.
  - [x] 6.3 Manually inspect home desktop and confirm the central Splitter shows support/runtime content above the compact composer.
  - [x] 6.4 Manually inspect a draft destination and confirm the central Support tab shows destination preview and route planning.
  - [x] 6.5 Update the UI progress SVG after implementation.
