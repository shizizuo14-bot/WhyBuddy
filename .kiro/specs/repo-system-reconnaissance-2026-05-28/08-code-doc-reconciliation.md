# 08 代码-文档对账 / Code-Doc Reconciliation

> **Generated**: 2026-05-28 (frozen HEAD `d181be2f`)
> **Inputs**: `spec-audit-table.md` (289 rows), `module-inventory.md` (969 rows), scanner findings
> **Output**: two reconciliation lists per design.md § 6 and Data Model § 3
> **Boundary**: gaps are *recorded*, not patched (Req 14.3). Items requiring rewrites are routed in Stage 7 (B_Tier_Proposer).

_Implements: REQ-6.1, REQ-14.1, REQ-14.2, REQ-14.3, REQ-14.4 — Validates: Property 5_

## Summary

| metric | value |
| --- | --- |
| total spec rows audited | 289 |
| total module rows scanned | 969 |
| `doc_without_code` entries | 93 |
| ↳ severity `broken-promise` | 0 |
| ↳ severity `needs-attention` | 0 |
| ↳ severity `informational` | 93 |
| `code_without_doc` entries | 903 |
| ↳ severity `needs-attention` (TRUNK) | 510 |
| ↳ severity `informational` (BRANCH) | 393 |

Severity vocabulary is closed: `informational | needs-attention | broken-promise`. Sort within each section: severity priority (broken-promise > needs-attention > informational), then alphabetical by subject.

## Section 1 — `doc_without_code`

Specs that mention no resolvable file paths. Per design.md § 6 mechanical rule: a spec has matching code iff ≥ 1 path mentioned in its three markdown files (`requirements.md`, `design.md`, `tasks.md`) resolves in the working tree at frozen HEAD `d181be2f`. Self-references to the spec's own `.kiro/specs/<spec_dir>/` paths and bare doc-name mentions (`tasks.md` / `requirements.md` / `design.md` / `bugfix.md`) are excluded from the matching test. `DUPLICATE` rows are skipped (handled by Stage 3).

| subject (spec_dir) | severity | evidence (unresolved paths) |
| --- | --- | --- |
| `admin-audit-and-support-operations` | informational | (no concrete file paths mentioned) |
| `admin-console-and-global-role-gate` | informational | access.ts |
| `api-fallback-empty-states` | informational | manual-verification.md |
| `autopilot-3d-hud-workbench-sync` | informational | (no concrete file paths mentioned) |
| `autopilot-agent-crew-stage-activation` | informational | right-rail/RoleStatusStrip.tsx; right-rail/FleetActivationLog.tsx; client/src/components/right-rail/crew-activation/useRoleCrewState.ts |
| `autopilot-capability-bridge-runtime-panel` | informational | right-rail/CapabilityRail.tsx; client/src/components/right-rail/capability-panel/useCapabilityBridgeState.ts; client/src/components/right-rail/capability-panel/types.ts |
| `autopilot-cockpit-three-column-layout` | informational | AutopilotCockpitLayout.test.tsx |
| `autopilot-destination-card-and-goal-lock` | informational | (no concrete file paths mentioned) |
| `autopilot-drive-state-timeline-and-replan` | informational | (no concrete file paths mentioned) |
| `autopilot-empty-state-and-onboarding` | informational | (no concrete file paths mentioned) |
| `autopilot-evidence-driving-recorder` | informational | (no concrete file paths mentioned) |
| `autopilot-frontend-state-model-and-store` | informational | (no concrete file paths mentioned) |
| `autopilot-input-streaming-timeline` | informational | AutopilotRoutePage.test.tsx; AutopilotRoutePage.tsx |
| `autopilot-llm-react-loop-inline` | informational | client/src/components/right-rail/react-loop/useReActLoopState.ts; client/src/components/right-rail/react-loop/types.ts; client/src/components/right-rail/react-loop/ReActPhaseBlock.tsx |
| `autopilot-mirofish-card-diversity` | informational | cards/index.tsx; cards/card-shell.tsx; card-shell.tsx |
| `autopilot-mobile-and-responsive-cockpit` | informational | (no concrete file paths mentioned) |
| `autopilot-stage-progress-indicator` | informational | right-rail/stage-progress/StageProgressIndicator.tsx; right-rail/stage-progress/StepIndicator.tsx; right-rail/stage-progress/StepDot.tsx |
| `autopilot-streaming-doc-renderer` | informational | right-rail/streaming-doc/StreamingDocRenderer.tsx; right-rail/streaming-doc/DocTabBar.tsx; right-rail/streaming-doc/MarkdownRenderer.tsx |
| `autopilot-streaming-lifecycle-weave` | informational | client/src/components/right-rail/streaming-weave/useStreamingWeave.ts; client/src/components/right-rail/streaming-weave/StreamTokenBuffer.ts; client/src/components/right-rail/streaming-weave/types.ts |
| `autopilot-sub-stage-panel-wrapping` | informational | SpecTreeWorkbenchPanel.tsx; SpecDocumentWorkbenchPanel.tsx; render-sub-stage-panel.tsx |
| `autopilot-takeover-control-panel` | informational | (no concrete file paths mentioned) |
| `autopilot-visual-language-and-motion-system` | informational | (no concrete file paths mentioned) |
| `autopilot-workbench-stage-rhythm` | informational | AutopilotRightRail.tsx; right-rail/stage-viewport/StageViewport.tsx; right-rail/stage-viewport/StageHeader.tsx |
| `blueprint-agent-crew-fabric` | informational | (no concrete file paths mentioned) |
| `blueprint-artifact-memory-and-replay` | informational | (no concrete file paths mentioned) |
| `blueprint-autopilot-route-orchestrator` | informational | (no concrete file paths mentioned) |
| `blueprint-clarification-workflow` | informational | (no concrete file paths mentioned) |
| `blueprint-domain-and-asset-store` | informational | project-store.ts; tasks-store.ts |
| `blueprint-effect-preview-generator` | informational | (no concrete file paths mentioned) |
| `blueprint-engineering-landing-bridge` | informational | (no concrete file paths mentioned) |
| `blueprint-generation-api-and-job-contract` | informational | (no concrete file paths mentioned) |
| `blueprint-implementation-prompt-packager` | informational | (no concrete file paths mentioned) |
| `blueprint-input-github-ingestion` | informational | (no concrete file paths mentioned) |
| `blueprint-runtime-capability-bridge` | informational | (no concrete file paths mentioned) |
| `blueprint-spec-document-generator` | informational | (no concrete file paths mentioned) |
| `blueprint-spec-tree-workbench` | informational | (no concrete file paths mentioned) |
| `browser-artifact-preview-runtime` | informational | agent-image/browser-runner.js |
| `consumer-email-auth-and-account` | informational | (no concrete file paths mentioned) |
| `cube-ai-agent-sandbox-image` | informational | Node.js; /opt/cube-agent/self-check.js; self-check.js |
| `docker-live-preview-workstation` | informational | (no concrete file paths mentioned) |
| `k8s-agent-operator` | informational | SOUL.md; src/types/agent-deployment.ts; src/controller/controller.ts |
| `lightweight-mysql-redis-persistence-strategy` | informational | (no concrete file paths mentioned) |
| `mission-ui-polish` | informational | (no concrete file paths mentioned) |
| `office-cockpit-first-screen-refresh` | informational | Home.tsx; OfficeTaskCockpit.tsx; TasksQueueRail.tsx |
| `office-home-performance-stability` | informational | (no concrete file paths mentioned) |
| `office-wall-display-redesign-v2` | informational | manual-verification.md |
| `personal-project-ownership-and-isolation` | informational | (no concrete file paths mentioned) |
| `project-autopilot-blueprint-master` | informational | (no concrete file paths mentioned) |
| `project-clarification-conversation` | informational | Node.js; project-store.test.ts |
| `project-cockpit-home` | informational | Home.tsx |
| `project-execution-center` | informational | TasksPage.test.tsx |
| `project-fsd-route-planner` | informational | TasksPage.test.tsx |
| `project-scoped-composer` | informational | (no concrete file paths mentioned) |
| `project-spec-center` | informational | (no concrete file paths mentioned) |
| `release-stability-guardrails-v2` | informational | (no concrete file paths mentioned) |
| `skill-aware-agent-sandbox` | informational | run.js; /run.js |
| `ue-camera-system` | informational | (no concrete file paths mentioned) |
| `ue-director-prompt-system` | informational | (no concrete file paths mentioned) |
| `ue-event-callback-system` | informational | Node.js |
| `ue-fallback-and-degradation` | informational | Three.js |
| `ue-interaction-passthrough` | informational | (no concrete file paths mentioned) |
| `ue-local-resource-and-session-governance` | informational | (no concrete file paths mentioned) |
| `ue-local-streaming-runtime` | informational | Three.js; Node.js |
| `ue-mobile-lite-viewer` | informational | Hammer.js; HLS.js |
| `ue-multi-user-session-isolation` | informational | Three.js |
| `ue-office-scene-build` | informational | Three.js |
| `ue-overlay-ui-integration` | informational | Three.js |
| `ue-performance-profiling-and-quality-tier` | informational | Node.js |
| `ue-realtime-narration` | informational | Node.js |
| `ue-recording-and-replay-export` | informational | Node.js |
| `ue-scene-asset-pipeline` | informational | (no concrete file paths mentioned) |
| `ue-scene-command-protocol` | informational | Node.js |
| `ue-shot-list-planner` | informational | (no concrete file paths mentioned) |
| `ue-state-sync-bridge` | informational | Node.js |
| `ue-video-stream-player` | informational | Three.js |
| `ui-redesign-color-and-tokens` | informational | LoadingScreen.tsx |
| `web-aigc-node-condition` | informational | (no concrete file paths mentioned) |
| `web-aigc-node-dialogue` | informational | (no concrete file paths mentioned) |
| `web-aigc-node-excel_read` | informational | (no concrete file paths mentioned) |
| `web-aigc-node-flow_jump` | informational | (no concrete file paths mentioned) |

_Showing first 80 of 93 entries (sorted by severity, then alphabetical). The remaining 13 entries are recorded verbatim in_ `.tmp/doc_without_code.jsonl`.

## Section 2 — `code_without_doc`

Modules with no `referenced_specs` value. Per design.md § 6 mechanical rule: every `module-inventory.md` row labeled `trunk` or `branch` with empty `referenced_specs` enters this list. `legacy` rows are not listed (unreferenced by definition).

| subject (module_path) | severity | evidence |
| --- | --- | --- |
| `client/src/components/AgentRolePanel.tsx` | needs-attention | kind=panel; domain=frontend-cockpit |
| `client/src/components/AnomalyAlertPanel.tsx` | needs-attention | kind=panel; domain=frontend-cockpit |
| `client/src/components/AppSidebar.tsx` | needs-attention | kind=component; domain=frontend-cockpit |
| `client/src/components/AuditChainVerifier.tsx` | needs-attention | kind=component; domain=frontend-cockpit |
| `client/src/components/AuditPanel.tsx` | needs-attention | kind=panel; domain=frontend-cockpit |
| `client/src/components/AuditTimeline.tsx` | needs-attention | kind=component; domain=frontend-cockpit |
| `client/src/components/autopilot/AutopilotImageSettingsPanel.tsx` | needs-attention | kind=panel; domain=frontend-cockpit |
| `client/src/components/autopilot/CapabilitySnapshotBadges.tsx` | needs-attention | kind=component; domain=frontend-cockpit |
| `client/src/components/autopilot/CodeBoundarySidebar.tsx` | needs-attention | kind=component; domain=frontend-cockpit |
| `client/src/components/autopilot/EffectPreviewImagePanel.tsx` | needs-attention | kind=panel; domain=frontend-cockpit |
| `client/src/components/autopilot/EffectPreviewScheduleTimeline.tsx` | needs-attention | kind=component; domain=frontend-cockpit |
| `client/src/components/autopilot/HorizontalCrossCutBar.tsx` | needs-attention | kind=component; domain=frontend-cockpit |
| `client/src/components/autopilot/ProjectMainChainTimeline.tsx` | needs-attention | kind=component; domain=frontend-cockpit |
| `client/src/components/blueprint/AgentReasoningTimeline.tsx` | needs-attention | kind=component; domain=frontend-cockpit |
| `client/src/components/ChatPanel.tsx` | needs-attention | kind=panel; domain=frontend-cockpit |
| `client/src/components/ConfigPanel.tsx` | needs-attention | kind=panel; domain=frontend-cockpit |
| `client/src/components/CostDashboard.tsx` | needs-attention | kind=component; domain=frontend-cockpit |
| `client/src/components/demo/EvolutionScoreCard.tsx` | needs-attention | kind=component; domain=frontend-cockpit |
| `client/src/components/demo/MemoryTimeline.tsx` | needs-attention | kind=component; domain=frontend-cockpit |
| `client/src/components/ErrorBoundary.tsx` | needs-attention | kind=component; domain=frontend-cockpit |
| `client/src/components/ExecutorStatusPanel.tsx` | needs-attention | kind=panel; domain=frontend-cockpit |
| `client/src/components/ExecutorTerminalPanel.tsx` | needs-attention | kind=panel; domain=frontend-cockpit |
| `client/src/components/ExportDialog.tsx` | needs-attention | kind=component; domain=frontend-cockpit |
| `client/src/components/GitHubRepoBadge.tsx` | needs-attention | kind=component; domain=frontend-cockpit |
| `client/src/components/HoloDock.tsx` | needs-attention | kind=component; domain=frontend-cockpit |
| `client/src/components/HoloDrawer.tsx` | needs-attention | kind=component; domain=frontend-cockpit |
| `client/src/components/knowledge/KnowledgeFilters.tsx` | needs-attention | kind=component; domain=frontend-cockpit |
| `client/src/components/knowledge/KnowledgeGraphPanel.tsx` | needs-attention | kind=panel; domain=frontend-cockpit |
| `client/src/components/knowledge/KnowledgeMissionOverlay.tsx` | needs-attention | kind=component; domain=frontend-cockpit |
| `client/src/components/knowledge/KnowledgeNodeDetail.tsx` | needs-attention | kind=component; domain=frontend-cockpit |
| `client/src/components/knowledge/KnowledgeReviewPanel.tsx` | needs-attention | kind=panel; domain=frontend-cockpit |
| `client/src/components/launch/AutopilotLaunchEmptyState.tsx` | needs-attention | kind=component; domain=frontend-cockpit |
| `client/src/components/launch/LaunchAttachmentSection.tsx` | needs-attention | kind=component; domain=frontend-cockpit |
| `client/src/components/launch/LaunchCockpitGrid.tsx` | needs-attention | kind=component; domain=frontend-cockpit |
| `client/src/components/launch/LaunchDestinationPreviewCard.tsx` | needs-attention | kind=component; domain=frontend-cockpit |
| `client/src/components/launch/LaunchGoalInput.tsx` | needs-attention | kind=component; domain=frontend-cockpit |
| `client/src/components/launch/LaunchModeTabBar.tsx` | needs-attention | kind=component; domain=frontend-cockpit |
| `client/src/components/launch/LaunchOperatorActionRail.tsx` | needs-attention | kind=component; domain=frontend-cockpit |
| `client/src/components/launch/LaunchOutputChips.tsx` | needs-attention | kind=component; domain=frontend-cockpit |
| `client/src/components/launch/LaunchPanelActionBar.tsx` | needs-attention | kind=panel; domain=frontend-cockpit |
| `client/src/components/launch/LaunchPanelShell.tsx` | needs-attention | kind=panel; domain=frontend-cockpit |
| `client/src/components/launch/LaunchRouteBanner.tsx` | needs-attention | kind=component; domain=frontend-cockpit |
| `client/src/components/launch/LaunchRoutePlanningFlow.tsx` | needs-attention | kind=component; domain=frontend-cockpit |
| `client/src/components/launch/LaunchRuntimeMeta.tsx` | needs-attention | kind=component; domain=frontend-cockpit |
| `client/src/components/launch/RoutePlanningOverlay.tsx` | needs-attention | kind=component; domain=frontend-cockpit |
| `client/src/components/launch/UnifiedLaunchComposer.tsx` | needs-attention | kind=component; domain=frontend-cockpit |
| `client/src/components/lineage/LineageDAGView.tsx` | needs-attention | kind=component; domain=frontend-cockpit |
| `client/src/components/lineage/LineageExportButton.tsx` | needs-attention | kind=component; domain=frontend-cockpit |
| `client/src/components/lineage/LineageHeatmap.tsx` | needs-attention | kind=component; domain=frontend-cockpit |
| `client/src/components/lineage/LineageNodeDetail.tsx` | needs-attention | kind=component; domain=frontend-cockpit |
| `client/src/components/lineage/LineageTimeline.tsx` | needs-attention | kind=component; domain=frontend-cockpit |
| `client/src/components/lineage/LineageWorkspaceContent.tsx` | needs-attention | kind=component; domain=frontend-cockpit |
| `client/src/components/LoadingScreen.tsx` | needs-attention | kind=component; domain=frontend-cockpit |
| `client/src/components/ManusDialog.tsx` | needs-attention | kind=component; domain=frontend-cockpit |
| `client/src/components/Map.tsx` | needs-attention | kind=component; domain=frontend-cockpit |
| `client/src/components/MobileTabBar.tsx` | needs-attention | kind=component; domain=frontend-cockpit |
| `client/src/components/MoreDrawer.tsx` | needs-attention | kind=component; domain=frontend-cockpit |
| `client/src/components/nl-command/AlertPanel.tsx` | needs-attention | kind=panel; domain=frontend-cockpit |
| `client/src/components/nl-command/ApprovalDialog.tsx` | needs-attention | kind=component; domain=frontend-cockpit |
| `client/src/components/nl-command/ClarificationPanel.tsx` | needs-attention | kind=panel; domain=frontend-cockpit |
| `client/src/components/nl-command/CommandInput.tsx` | needs-attention | kind=component; domain=frontend-cockpit |
| `client/src/components/nl-command/CommandMonitorSummary.tsx` | needs-attention | kind=component; domain=frontend-cockpit |
| `client/src/components/nl-command/CommandPlanSummary.tsx` | needs-attention | kind=component; domain=frontend-cockpit |
| `client/src/components/nl-command/CommentThread.tsx` | needs-attention | kind=component; domain=frontend-cockpit |
| `client/src/components/nl-command/CostChart.tsx` | needs-attention | kind=component; domain=frontend-cockpit |
| `client/src/components/nl-command/DashboardMetrics.tsx` | needs-attention | kind=component; domain=frontend-cockpit |
| `client/src/components/nl-command/DependencyGraph.tsx` | needs-attention | kind=component; domain=frontend-cockpit |
| `client/src/components/nl-command/GanttChart.tsx` | needs-attention | kind=component; domain=frontend-cockpit |
| `client/src/components/nl-command/HistoryPanel.tsx` | needs-attention | kind=panel; domain=frontend-cockpit |
| `client/src/components/nl-command/MissionList.tsx` | needs-attention | kind=component; domain=frontend-cockpit |
| `client/src/components/nl-command/ReportView.tsx` | needs-attention | kind=component; domain=frontend-cockpit |
| `client/src/components/nl-command/ResourceChart.tsx` | needs-attention | kind=component; domain=frontend-cockpit |
| `client/src/components/nl-command/RiskHeatMap.tsx` | needs-attention | kind=component; domain=frontend-cockpit |
| `client/src/components/nl-command/SuggestionPanel.tsx` | needs-attention | kind=panel; domain=frontend-cockpit |
| `client/src/components/nl-command/TaskHubCommandPanel.tsx` | needs-attention | kind=panel; domain=frontend-cockpit |
| `client/src/components/nl-command/TemplateManager.tsx` | needs-attention | kind=component; domain=frontend-cockpit |
| `client/src/components/office/OfficeAgentInspectorPanel.tsx` | needs-attention | kind=panel; domain=frontend-cockpit |
| `client/src/components/office/OfficeTaskCockpit.tsx` | needs-attention | kind=component; domain=frontend-cockpit |
| `client/src/components/office/OfficeWorkflowContextPanels.tsx` | needs-attention | kind=panel; domain=frontend-cockpit |
| `client/src/components/office/OfficeWorkflowLaunchPanel.tsx` | needs-attention | kind=panel; domain=frontend-cockpit |

_Showing first 80 of 903 entries (sorted by severity, then alphabetical). The remaining 823 entries are recorded verbatim in_ `.tmp/code_without_doc.jsonl`.

## Routing notes (Stage 7 input)

Per Req 14.3, gaps recorded here are NOT patched by editing affected specs. Stage 7 (B_Tier_Proposer) routes them:

- `broken-promise` entries in `doc_without_code` → B-tier candidates (per-domain prose).
- `needs-attention` entries in `code_without_doc` → B-tier candidates (per-domain prose).
- `informational` entries (both lists) → deferred unless evidence appears.
