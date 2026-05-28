# 05 前端导航地图

_Implements: REQ-2.3, REQ-6.1, REQ-7.2 — Validates: Property 2, Property 7_

## Header

- Frozen HEAD: `d181be2f` (`2026-05-28T02:06:35Z`).
- Filter: `module-inventory.md` rows where `kind ∈ {page, panel, component, store}`. Total: **382** modules (`129` pages, `34` panels, `194` components, `25` stores).
- Companion diagram: [`d5-frontend-navigation-map.svg`](./d5-frontend-navigation-map.svg) (`manifest:` cites the filtered inventory rows).
- Domain note: `frontend-cockpit` accounts for the bulk of these modules; `frontend-3d` covers the Scene3D / R3F sub-tree.

## Distribution

| kind | count | note |
|---|---|---|
| page | 129 | top-level routes (`Home`, `TasksPage`, debug pages, admin pages, replay, lineage) |
| panel | 34 | docked surface widgets (cockpit panels, audit / lineage / sandbox / decision panels) |
| component | 194 | leaf components (UI primitives, three/* leaves, knowledge / RAG / replay / nl-command sub-components) |
| store | 25 | Zustand stores (Mission projection, workflow, audit, lineage, swarm, A2A, sandbox …) |
| **Total** | **382** | — |

## Pages → routes

Routes are derived from `client/src/pages/<segment>/<File>.tsx` per Vite path conventions. Top-level user routes:

| route | page module | wires |
|---|---|---|
| `/` | `client/src/pages/Home.tsx` | OfficeTaskCockpit · Scene3D · UnifiedLaunchComposer |
| `/tasks` | `client/src/pages/tasks/TasksPage.tsx` | TaskQueue · TaskDetailView · TasksCockpitDetail |
| `/tasks/:id` | `client/src/pages/tasks/TaskDetailPage.tsx` | TaskDetailView · MissionStepFlow · Logs/Artifacts/Runtime |
| `/replay/:missionId` | `client/src/pages/replay/ReplayPage.tsx` | ReplayTimeline · ReplayControls |
| `/lineage` | `client/src/pages/lineage/LineagePage.tsx` | LineageDAGView · LineageHeatmap · LineageTimeline |
| `/debug` | `client/src/pages/debug/DebugIndexPage.tsx` | config / permissions / audit / help low-frequency entries |
| `/debug/help` | `client/src/pages/debug/DebugHelpPage.tsx` | consolidated help |
| `/admin/*` | `client/src/pages/admin/` | admin-only debug / governance pages |
| `/nl-command` | `client/src/pages/nl-command/NLCommandPage.tsx` | NLCommandCenter (legacy entry; absorbed by /tasks) |
| `/autopilot/route` | `client/src/pages/AutopilotRoutePage.tsx` | Autopilot route preview |

> Full enumerated page list (129 files) lives in the inventory; the table above only names the top-level user-visible routes.

## Stores

Zustand stores are the canonical client-side projections. Each store owns one or more boundary slices.

| store | path | role |
|---|---|---|
| `a2a-store.ts` | `client/src/lib/a2a-store.ts` | A2A interop messages |
| `admin-store.ts` | `client/src/lib/admin-store.ts` | supporting store |
| `audit-store.ts` | `client/src/lib/audit-store.ts` | Audit chain client cache |
| `auth-store.ts` | `client/src/lib/auth-store.ts` | supporting store |
| `autonomy-store.ts` | `client/src/lib/autonomy-store.ts` | supporting store |
| `blueprint-realtime-store.ts` | `client/src/lib/blueprint-realtime-store.ts` | supporting store |
| `browser-cost-store.ts` | `client/src/lib/browser-cost-store.ts` | supporting store |
| `browser-telemetry-store.ts` | `client/src/lib/browser-telemetry-store.ts` | supporting store |
| `cost-store.ts` | `client/src/lib/cost-store.ts` | supporting store |
| `demo-store.ts` | `client/src/lib/demo-store.ts` | supporting store |
| `knowledge-store.ts` | `client/src/lib/knowledge-store.ts` | supporting store |
| `lineage-store.ts` | `client/src/lib/lineage-store.ts` | Lineage DAG client cache |
| `nl-command-store.ts` | `client/src/lib/nl-command-store.ts` | supporting store |
| `permission-store.ts` | `client/src/lib/permission-store.ts` | supporting store |
| `project-store.ts` | `client/src/lib/project-store.ts` | supporting store |
| `rag-store.ts` | `client/src/lib/rag-store.ts` | supporting store |
| `browser-replay-store.ts` | `client/src/lib/replay/browser-replay-store.ts` | supporting store |
| `reputation-store.ts` | `client/src/lib/reputation-store.ts` | supporting store |
| `role-store.ts` | `client/src/lib/role-store.ts` | supporting store |
| `sandbox-store.ts` | `client/src/lib/sandbox-store.ts` | Sandbox terminal / live-preview state |
| `store.ts` | `client/src/lib/store.ts` | Global UI store (selection, drawer state, theme) |
| `swarm-store.ts` | `client/src/lib/swarm-store.ts` | Swarm topology & messages |
| `tasks-store.ts` | `client/src/lib/tasks-store.ts` | Mission projection (mission-native-projection, IMPLEMENTED) |
| `telemetry-store.ts` | `client/src/lib/telemetry-store.ts` | supporting store |
| `workflow-store.ts` | `client/src/lib/workflow-store.ts` | Workflow snapshot for /workflows views |

## Panels (by feature group)

Panels are docked surface widgets in the cockpit. Grouped by feature; each row shows its kind/domain origin in `module-inventory.md`.

### Cockpit / Office (3)

- `client/src/components/office/OfficeAgentInspectorPanel.tsx` — domain: `frontend-cockpit`, T/B/L: `trunk`
- `client/src/components/office/OfficeWorkflowContextPanels.tsx` — domain: `frontend-cockpit`, T/B/L: `trunk`
- `client/src/components/office/OfficeWorkflowLaunchPanel.tsx` — domain: `frontend-cockpit`, T/B/L: `trunk`

### Tasks / Mission (9)

- `client/src/components/launch/LaunchPanelActionBar.tsx` — domain: `frontend-cockpit`, T/B/L: `trunk`
- `client/src/components/launch/LaunchPanelShell.tsx` — domain: `frontend-cockpit`, T/B/L: `trunk`
- `client/src/components/nl-command/TaskHubCommandPanel.tsx` — domain: `frontend-cockpit`, T/B/L: `trunk`
- `client/src/components/permissions/PermissionPanel.tsx` — domain: `frontend-cockpit`, T/B/L: `trunk`
- `client/src/components/tasks/AutopilotTakeoverControlPanel.tsx` — domain: `frontend-cockpit`, T/B/L: `trunk`
- `client/src/components/tasks/DecisionPanel.tsx` — domain: `frontend-cockpit`, T/B/L: `trunk`
- `client/src/components/tasks/RightInfoPanel.tsx` — domain: `frontend-cockpit`, T/B/L: `trunk`
- `client/src/components/tasks/TaskAutopilotPanel.tsx` — domain: `frontend-cockpit`, T/B/L: `trunk`
- `client/src/components/three/MissionWallTaskPanel.tsx` — domain: `frontend-3d`, T/B/L: `branch`

### Audit / Lineage / Replay (5)

- `client/src/components/AnomalyAlertPanel.tsx` — domain: `frontend-cockpit`, T/B/L: `trunk`
- `client/src/components/AuditPanel.tsx` — domain: `frontend-cockpit`, T/B/L: `trunk`
- `client/src/components/replay/ControlPanel.tsx` — domain: `frontend-cockpit`, T/B/L: `trunk`
- `client/src/components/replay/EventDetailPanel.tsx` — domain: `frontend-cockpit`, T/B/L: `trunk`
- `client/src/components/replay/PerformancePanel.tsx` — domain: `frontend-cockpit`, T/B/L: `trunk`

### Knowledge / RAG / NL-Command (8)

- `client/src/components/knowledge/KnowledgeGraphPanel.tsx` — domain: `frontend-cockpit`, T/B/L: `trunk`
- `client/src/components/knowledge/KnowledgeReviewPanel.tsx` — domain: `frontend-cockpit`, T/B/L: `trunk`
- `client/src/components/nl-command/AlertPanel.tsx` — domain: `frontend-cockpit`, T/B/L: `trunk`
- `client/src/components/nl-command/ClarificationPanel.tsx` — domain: `frontend-cockpit`, T/B/L: `trunk`
- `client/src/components/nl-command/HistoryPanel.tsx` — domain: `frontend-cockpit`, T/B/L: `trunk`
- `client/src/components/nl-command/SuggestionPanel.tsx` — domain: `frontend-cockpit`, T/B/L: `trunk`
- `client/src/components/rag/RAGDebugPanel.tsx` — domain: `frontend-cockpit`, T/B/L: `trunk`
- `client/src/components/rag/RAGInfoPanel.tsx` — domain: `frontend-cockpit`, T/B/L: `trunk`

### Sandbox / Executor / Telemetry (2)

- `client/src/components/ExecutorStatusPanel.tsx` — domain: `frontend-cockpit`, T/B/L: `trunk`
- `client/src/components/ExecutorTerminalPanel.tsx` — domain: `frontend-cockpit`, T/B/L: `trunk`

### Other panels (7)

- `client/src/components/AgentRolePanel.tsx` — domain: `frontend-cockpit`, T/B/L: `trunk`
- `client/src/components/autopilot/AutopilotImageSettingsPanel.tsx` — domain: `frontend-cockpit`, T/B/L: `trunk`
- `client/src/components/autopilot/EffectPreviewImagePanel.tsx` — domain: `frontend-cockpit`, T/B/L: `trunk`
- `client/src/components/ChatPanel.tsx` — domain: `frontend-cockpit`, T/B/L: `trunk`
- `client/src/components/ConfigPanel.tsx` — domain: `frontend-cockpit`, T/B/L: `trunk`
- `client/src/components/WorkflowPanel.tsx` — domain: `frontend-cockpit`, T/B/L: `trunk`
- `client/src/components/WorkflowPanelCompatibility.tsx` — domain: `frontend-cockpit`, T/B/L: `trunk`

## Component sub-trees (counts)

| sub-tree under client/src/components | count |
|---|---|
| `ui` | 54 |
| `tasks` | 32 |
| `nl-command` | 14 |
| `launch` | 13 |
| `replay` | 13 |
| `three` | 9 |
| `lineage` | 6 |
| `autopilot` | 5 |
| `ue-overlay` | 4 |
| `knowledge` | 3 |
| `reputation` | 3 |
| `stream` | 3 |
| `demo` | 2 |
| `permissions` | 2 |
| `sandbox` | 2 |
| `scene` | 2 |
| `AppSidebar.tsx` | 1 |
| `AuditChainVerifier.tsx` | 1 |
| `AuditTimeline.tsx` | 1 |
| `blueprint` | 1 |
| `CostDashboard.tsx` | 1 |
| `ErrorBoundary.tsx` | 1 |
| `ExportDialog.tsx` | 1 |
| `GitHubRepoBadge.tsx` | 1 |
| `HoloDock.tsx` | 1 |
| `HoloDrawer.tsx` | 1 |
| `LoadingScreen.tsx` | 1 |
| `ManusDialog.tsx` | 1 |
| `Map.tsx` | 1 |
| `MobileTabBar.tsx` | 1 |
| `MoreDrawer.tsx` | 1 |
| `office` | 1 |
| `PdfViewer.tsx` | 1 |
| `rag` | 1 |
| `RecoveryDialog.tsx` | 1 |
| `RolePerformanceRadar.tsx` | 1 |
| `Scene3D.tsx` | 1 |
| `SessionHistoryTab.tsx` | 1 |
| `SidebarStatusBlock.tsx` | 1 |
| `SkillCard.tsx` | 1 |
| `TelemetryDashboard.tsx` | 1 |
| `Toolbar.tsx` | 1 |
| `workspace` | 1 |

## Reference

- Inventory: [module-inventory.md](./module-inventory.md)
- Domain map (parent view): [04-domain-map.md](./04-domain-map.md)
- Companion diagram: [d5-frontend-navigation-map.svg](./d5-frontend-navigation-map.svg)
- Audit table: [spec-audit-table.md](./spec-audit-table.md)
- Q3 traceability: this document is a supporting answer to Q3 of the `Five_Control_Recovery_Questions`; primary is `01`, peers are `03`, `04`, `06`, `09`.
