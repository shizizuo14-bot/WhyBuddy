# Task List: Autopilot Fleet Live Visualization

- [x] Define the minimum Fleet Role Card view model.
- [x] Split Fleet display out of `TaskAutopilotPanel` by reusing `AutopilotFleetLiveView` behind a front-end adapter.
- [x] Add local labels for Planner, Clarifier, Researcher, Generator, Reviewer, Auditor, and Operator.
- [x] Add role status visuals for idle, running, waiting, blocked, done, and failed.
- [x] Add minimum display for parallel lanes.
- [x] Display role current action, waiting reason, and latest artifact when available.
- [x] Add component tests for Fleet Live View.
- [x] Backfill `fleet-status-and-live-execution-view` support notes in this task list.
- [x] Optimize fleet role normalize/fallback at the front-end helper layer without broad store/server rewrites.
- [x] Audit server projection output for role status/currentFocus support.
- [x] Avoid exposing Web-AIGC node lists directly as user-facing fleet roles.
- [x] Add a takeover panel jump relationship for blocked roles.

## Support Notes

- Store normalize support: `client/src/lib/tasks-store.ts` already normalizes `fleet.roles[]` with `id`, `roleType`, `title`, `status`, `responsibility`, `boundAgents`, `boundExecutors`, and `currentFocus`, plus `activeRoleCount` and `blockedRoleCount`.
- Server projection support: `server/tasks/mission-projection.ts` delegates to `buildMissionAutopilotSummary`, which emits planner/operator/executor-style fleet roles with `roleType`, `status`, `responsibility`, `boundAgents`, `boundExecutors`, and `currentFocus`.
- Front-end adapter support: `TaskAutopilotPanel` maps shared fleet roles into `AutopilotFleetLiveView` cards, derives semantic lanes, maps unsupported `executor` roles to the user-facing `operator` lane, and summarizes bound agents/executors rather than rendering raw node lists.
- Not yet server-native fields: `laneId`, `laneLabel`, `waitingReason`, `latestArtifact`, and `takeoverAnchorId` are front-end alias/fallback fields today. They can be promoted into the shared/server projection contract later if product needs stable persisted semantics.
