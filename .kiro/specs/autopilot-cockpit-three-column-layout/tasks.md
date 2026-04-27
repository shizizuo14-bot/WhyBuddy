# Task List: Autopilot Cockpit Three-Column Layout

- [x] Design `AutopilotCockpitLayout` props and region slots.
- [x] Move Destination and Route blocks into the left rail.
- [x] Move Drive State, Fleet, and Outputs into the center rail.
- [x] Move DecisionPanel, Takeover, Evidence, and Cost/Risk into the right rail.
- [x] Preserve compatibility entry points for existing TaskDetailView tabs.
- [x] Design minimum breakpoint rules for desktop three-column ratios.
- [x] Add visual regression or component tests for the cockpit variant.
- [x] Backfill the status note in `autopilot-cockpit-information-architecture` for "main structure landed / not landed".
- [x] Split reusable Destination/Route/Fleet/Takeover/Evidence subcomponents from `TaskAutopilotPanel`.
- [x] Fix height conflict between OfficeTaskCockpit bottom dock and route planning overlay.
- [x] Ensure the three-column layout does not break existing task list, refresh, new task, and selected-task behavior.
- [x] Update architecture diagram or README screenshot notes explaining the three-column cockpit main structure.

## Lane F Documentation Backfill Notes (2026-04-26)

README / README.zh-CN now describe the three-column cockpit main structure in text without changing the architecture SVG: left Destination / Route, center Drive / Fleet / Outputs, right Takeover / Evidence / Cost / Risk.

Steering records the current landed and not-landed boundary: three-column layout, breakpoints, and baseline tests are present; full right-rail Cost/Risk data loop, `TaskAutopilotPanel` subcomponent split, and bottom dock / route overlay height conflict were still incomplete at that time.

## Lane F Implementation Closeout (2026-04-27)

- `AutopilotCockpitLayout` now exposes explicit right-rail `decision / takeover / evidence / costRisk` slots and a `data-right-rail-slots="decision takeover evidence cost-risk"` contract.
- `AutopilotCockpitLayout.test.tsx` locks the right-rail order so DecisionPanel, Takeover, Evidence, and Cost/Risk remain in the right side of the three-column cockpit.
- `RoutePlanningOverlay` now applies bottom-dock clearance guards for panel and bottom-sheet mode, including `--autopilot-bottom-dock-clearance`, safe-area max-height calculation, and overscroll containment tests.
