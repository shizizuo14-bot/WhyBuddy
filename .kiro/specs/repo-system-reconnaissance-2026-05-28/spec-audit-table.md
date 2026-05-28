# Spec Audit Table — A+ Reconnaissance Phase 1

_Implements: REQ-4.1, REQ-5.1, REQ-5.2, REQ-5.3, REQ-5.4, REQ-5.5, REQ-5.6 — Validates: Property 1, Property 4_

## Header

- Snapshot citation: `.kiro/steering/project-overview.md § 项目规模` (`287` specs as of `2026-05-28`).
- Frozen HEAD: `d181be2f
2026-05-28T02:06:35Z` (see `.tmp/scanner-head.txt`).
- Total rows in this table: **289** (scanned spec_dir count from `.tmp/deduped_findings.jsonl`).
- Footnote per Req 11.4: the snapshot baseline records `287` specs; the working tree at scan time contained `289`. The 2 additional spec dirs that appeared after the snapshot are recorded here without reopening the snapshot baseline.

## Distribution

| Bucket | Count |
|---|---|
| DUPLICATE | 1 |
| DRIFTED | 0 |
| PARTIALLY_IMPLEMENTED | 9 |
| IMPLEMENTED_AND_VALID | 157 |
| DESIGNED_NEVER_BUILT | 122 |
| **Total** | **289** |

## Sanity checks

- Row count == bucket sum: ✅ (`289` vs `289`)
- Unique spec_dirs (no duplicates within table): ✅ (`289`/`289`)
- Every `DUPLICATE.duplicate_of` resolves to a non-DUPLICATE row: ✅

## Audit Table (all rows)

| spec_dir | bucket | evidence_path | evidence_note | duplicate_of | task_completion_pct | last_modified_commit |
|---|---|---|---|---|---|---|
| a2a-protocol | IMPLEMENTED_AND_VALID | shared/organization-schema.ts | tasks 100% (38/38); matches steering |  | 100 | ca8eb5b4 |
| admin-audit-and-support-operations | DESIGNED_NEVER_BUILT | .kiro/specs/admin-audit-and-support-operations/requirements.md | no source path mentioned in spec exists in working tree |  | 0 | b05a3040 |
| admin-console-and-global-role-gate | DESIGNED_NEVER_BUILT | .kiro/specs/admin-console-and-global-role-gate/requirements.md | no source path mentioned in spec exists in working tree |  | 100 | 432567c8 |
| agent-autonomy-upgrade | IMPLEMENTED_AND_VALID | shared/autonomy-types.ts | tasks 100% (60/60); matches steering |  | 100 | ca8eb5b4 |
| agent-marketplace | IMPLEMENTED_AND_VALID | server/core/registry.ts | tasks 100% (39/39); matches steering |  | 100 | ca8eb5b4 |
| agent-marketplace-platform | DESIGNED_NEVER_BUILT | .kiro/specs/agent-marketplace-platform/requirements.md | no source path mentioned in spec exists in working tree |  | 0 | ca8eb5b4 |
| agent-permission-model | IMPLEMENTED_AND_VALID | shared/permission/contracts.ts | tasks 100% (97/97); matches steering |  | 100 | ca8eb5b4 |
| agent-reputation | IMPLEMENTED_AND_VALID | server/core/registry.ts | tasks 100% (60/60); matches steering |  | 100 | ca8eb5b4 |
| ai-enabled-sandbox | IMPLEMENTED_AND_VALID | shared/llm/contracts.ts | tasks 100% (34/34); matches steering |  | 100 | ca8eb5b4 |
| api-fallback-empty-states | DESIGNED_NEVER_BUILT | .kiro/specs/api-fallback-empty-states/requirements.md | no source path mentioned in spec exists in working tree |  | 100 | d6c80670 |
| audit-chain | IMPLEMENTED_AND_VALID | server/audit/audit-chain.ts | tasks 100% (123/123); matches steering |  | 100 | ca8eb5b4 |
| autonomous-swarm | IMPLEMENTED_AND_VALID | shared/swarm.ts | tasks 100% (38/38); matches steering |  | 100 | ca8eb5b4 |
| autopilot-3d-hud-workbench-sync | DESIGNED_NEVER_BUILT | .kiro/specs/autopilot-3d-hud-workbench-sync/requirements.md | no source path mentioned in spec exists in working tree |  | 0 | d181be2f |
| autopilot-advanced-workbench-inline | IMPLEMENTED_AND_VALID | client/src/pages/autopilot/right-rail/resolve-rail-sub-stage.ts | tasks 100% (8/8); matches steering |  | 100 | d41e62d2 |
| autopilot-agent-crew-stage-activation | DESIGNED_NEVER_BUILT | .kiro/specs/autopilot-agent-crew-stage-activation/requirements.md | no source path mentioned in spec exists in working tree |  | 100 | 696cb498 |
| autopilot-agent-driven-pipeline | IMPLEMENTED_AND_VALID | server/routes/blueprint/context.ts | tasks 100% (37/37); matches steering |  | 100 | df8cbdb2 |
| autopilot-agent-reasoning-stream | IMPLEMENTED_AND_VALID | shared/blueprint/agent-state.ts | tasks 100% (87/87); matches steering |  | 100 | df8cbdb2 |
| autopilot-asset-staleness-model | IMPLEMENTED_AND_VALID | shared/blueprint/contracts.ts | tasks 100% (45/45); matches steering |  | 100 | 66b00ade |
| autopilot-blueprint-refactor-split | IMPLEMENTED_AND_VALID | server/routes/blueprint.ts | tasks 100% (2/2); matches steering |  | 100 | ec69a87e |
| autopilot-capability-bridge-aigc-node | IMPLEMENTED_AND_VALID | server/routes/blueprint.ts | tasks 100% (118/118); matches steering |  | 100 | 304ff90a |
| autopilot-capability-bridge-docker | IMPLEMENTED_AND_VALID | server/routes/blueprint.ts | tasks 100% (97/97); matches steering |  | 100 | 5fc5e0fc |
| autopilot-capability-bridge-mcp | IMPLEMENTED_AND_VALID | server/routes/blueprint.ts | tasks 100% (125/125); matches steering |  | 100 | bd454832 |
| autopilot-capability-bridge-role | IMPLEMENTED_AND_VALID | server/routes/blueprint.ts | tasks 100% (147/147); matches steering |  | 100 | df8cbdb2 |
| autopilot-capability-bridge-runtime-panel | DESIGNED_NEVER_BUILT | .kiro/specs/autopilot-capability-bridge-runtime-panel/requirements.md | no source path mentioned in spec exists in working tree |  | 100 | ec69a87e |
| autopilot-capability-runtime-enablement | IMPLEMENTED_AND_VALID | server/index.ts | tasks 100% (85/85); matches steering |  | 100 | df8cbdb2 |
| autopilot-cockpit-information-architecture | IMPLEMENTED_AND_VALID | server/tasks/mission-projection.ts | tasks 100% (11/11); matches steering |  | 100 | fea13543 |
| autopilot-cockpit-right-rail-convergence | IMPLEMENTED_AND_VALID | shared/blueprint/contracts.ts | tasks 100% (10/10); matches steering |  | 100 | cc892a5d |
| autopilot-cockpit-shell-cleanup | DESIGNED_NEVER_BUILT | .kiro/specs/autopilot-cockpit-shell-cleanup/requirements.md | no source path mentioned in spec exists in working tree |  | 100 | 5a3cc5b0 |
| autopilot-cockpit-three-column-layout | DESIGNED_NEVER_BUILT | .kiro/specs/autopilot-cockpit-three-column-layout/requirements.md | no source path mentioned in spec exists in working tree |  | 100 | fea13543 |
| autopilot-destination-card-and-goal-lock | DESIGNED_NEVER_BUILT | .kiro/specs/autopilot-destination-card-and-goal-lock/requirements.md | no source path mentioned in spec exists in working tree |  | 100 | fea13543 |
| autopilot-drive-state-timeline-and-replan | DESIGNED_NEVER_BUILT | .kiro/specs/autopilot-drive-state-timeline-and-replan/requirements.md | no source path mentioned in spec exists in working tree |  | 100 | fea13543 |
| autopilot-effect-preview-llm | IMPLEMENTED_AND_VALID | server/routes/blueprint.ts | tasks 100% (158/158); matches steering |  | 100 | df8cbdb2 |
| autopilot-empty-state-and-onboarding | DESIGNED_NEVER_BUILT | .kiro/specs/autopilot-empty-state-and-onboarding/requirements.md | no source path mentioned in spec exists in working tree |  | 100 | fea13543 |
| autopilot-engineering-handoff-llm | IMPLEMENTED_AND_VALID | server/routes/blueprint.ts | tasks 100% (175/175); matches steering |  | 100 | 0615f62b |
| autopilot-evidence-driving-recorder | DESIGNED_NEVER_BUILT | .kiro/specs/autopilot-evidence-driving-recorder/requirements.md | no source path mentioned in spec exists in working tree |  | 100 | fea13543 |
| autopilot-evidence-replay-and-trust-chain | IMPLEMENTED_AND_VALID | shared/mission/autopilot.ts | tasks 100% (20/20); matches steering |  | 100 | fea13543 |
| autopilot-explainability-and-telemetry | IMPLEMENTED_AND_VALID | server/tasks/mission-projection.ts | tasks 100% (23/23); matches steering |  | 100 | c728e176 |
| autopilot-fabric-streaming-timeline | DESIGNED_NEVER_BUILT | .kiro/specs/autopilot-fabric-streaming-timeline/requirements.md | no source path mentioned in spec exists in working tree |  | 100 | df8cbdb2 |
| autopilot-fleet-live-visualization | IMPLEMENTED_AND_VALID | client/src/lib/tasks-store.ts | tasks 100% (12/12); matches steering |  | 100 | fea13543 |
| autopilot-frontend-state-model-and-store | DESIGNED_NEVER_BUILT | .kiro/specs/autopilot-frontend-state-model-and-store/requirements.md | no source path mentioned in spec exists in working tree |  | 100 | fea13543 |
| autopilot-i18n-consistency | PARTIALLY_IMPLEMENTED | client/src/pages/autopilot/right-rail/role-labels.ts | tasks.md 35/40 checkboxes (88%) |  | 88 | a1fd1e0e |
| autopilot-image-rendering-and-visual-system | IMPLEMENTED_AND_VALID | server/routes/blueprint/effect-preview/image-service.ts | tasks 100% (142/142); matches steering |  | 100 | 51973ab5 |
| autopilot-input-streaming-timeline | DESIGNED_NEVER_BUILT | .kiro/specs/autopilot-input-streaming-timeline/requirements.md | no source path mentioned in spec exists in working tree |  | 100 | df8cbdb2 |
| autopilot-launch-destination-input | IMPLEMENTED_AND_VALID | client/src/lib/launch-router.ts | tasks 100% (12/12); matches steering |  | 100 | fea13543 |
| autopilot-llm-react-loop-inline | DESIGNED_NEVER_BUILT | .kiro/specs/autopilot-llm-react-loop-inline/requirements.md | no source path mentioned in spec exists in working tree |  | 100 | ec69a87e |
| autopilot-llm-spec-generation | IMPLEMENTED_AND_VALID | server/routes/blueprint.ts | tasks 100% (64/64); matches steering |  | 100 | ec69a87e |
| autopilot-mermaid-diagram-rendering | IMPLEMENTED_AND_VALID | client/src/pages/autopilot/right-rail/streaming-doc/mermaid-loader.ts | tasks 100% (15/15); matches steering |  | 100 | 2633a501 |
| autopilot-mirofish-card-diversity | DESIGNED_NEVER_BUILT | .kiro/specs/autopilot-mirofish-card-diversity/requirements.md | no source path mentioned in spec exists in working tree |  | 100 | ec69a87e |
| autopilot-mirofish-stream | IMPLEMENTED_AND_VALID | shared/blueprint/agent-reasoning.ts | tasks 100% (17/17); matches steering |  | 100 | 3366e735 |
| autopilot-mobile-and-responsive-cockpit | DESIGNED_NEVER_BUILT | .kiro/specs/autopilot-mobile-and-responsive-cockpit/requirements.md | no source path mentioned in spec exists in working tree |  | 100 | fea13543 |
| autopilot-prompt-package-llm | IMPLEMENTED_AND_VALID | server/routes/blueprint.ts | tasks 100% (161/161); matches steering |  | 100 | 30de5bb9 |
| autopilot-realtime-observation-bridge | IMPLEMENTED_AND_VALID | server/core/socket.ts | tasks 100% (26/26); matches steering |  | 100 | df8cbdb2 |
| autopilot-recovery-and-human-takeover-governance | IMPLEMENTED_AND_VALID | server/core/workflow-runtime-engine.ts | tasks 100% (103/103); matches steering |  | 100 | c728e176 |
| autopilot-replan-and-branch-action | IMPLEMENTED_AND_VALID | shared/blueprint/contracts.ts | tasks 100% (42/42); matches steering |  | 100 | 66b00ade |
| autopilot-right-rail-data-hook | IMPLEMENTED_AND_VALID | client/src/pages/autopilot/right-rail/hooks/use-autopilot-right-rail-data.ts | tasks 100% (12/12); matches steering |  | 100 | f5e40791 |
| autopilot-right-rail-narrative-swiper | IMPLEMENTED_AND_VALID | client/src/pages/autopilot/right-rail/narrative-swiper/narrative-card-types.ts | tasks 100% (37/37); matches steering |  | 100 | ec69a87e |
| autopilot-right-rail-stage-panels | IMPLEMENTED_AND_VALID | client/src/pages/specs/panels/index.ts | tasks 100% (12/12); matches steering |  | 100 | e305d077 |
| autopilot-right-rail-streaming-layout | DESIGNED_NEVER_BUILT | .kiro/specs/autopilot-right-rail-streaming-layout/requirements.md | no source path mentioned in spec exists in working tree |  | 100 | 24a4f0bf |
| autopilot-role-autonomous-agent | IMPLEMENTED_AND_VALID | shared/blueprint/contracts.ts | tasks 100% (70/70); matches steering |  | 100 | df8cbdb2 |
| autopilot-role-container-loader | IMPLEMENTED_AND_VALID | shared/blueprint/contracts.ts | tasks 100% (117/117); matches steering |  | 100 | df8cbdb2 |
| autopilot-route-planning-overlay | IMPLEMENTED_AND_VALID | client/src/lib/launch-router.ts | tasks 100% (12/12); matches steering |  | 100 | fea13543 |
| autopilot-routeset-llm-generation | IMPLEMENTED_AND_VALID | server/routes/blueprint.ts | tasks 100% (65/65); matches steering |  | 100 | df8cbdb2 |
| autopilot-runtime-orchestration | IMPLEMENTED_AND_VALID | client/src/lib/tasks-store.ts | tasks 100% (37/37); matches steering |  | 100 | c728e176 |
| autopilot-scene-fusion | IMPLEMENTED_AND_VALID | client/src/components/three/scene-fusion/role-id-bridge.ts | tasks 100% (21/21); matches steering |  | 100 | 5550ff5d |
| autopilot-spec-docs-runtime-perception-double-pass | PARTIALLY_IMPLEMENTED | server/routes/blueprint.ts | tasks.md 61/62 checkboxes (98%) |  | 98 | d181be2f |
| autopilot-spec-document-export | IMPLEMENTED_AND_VALID | shared/blueprint/contracts.ts | tasks 100% (23/23); matches steering |  | 100 | 58aedc73 |
| autopilot-spec-documents-llm | IMPLEMENTED_AND_VALID | server/routes/blueprint.ts | tasks 100% (153/153); matches steering |  | 100 | fcfccb10 |
| autopilot-spec-documents-workbench-v2 | IMPLEMENTED_AND_VALID | shared/blueprint/contracts.ts | tasks 100% (12/12); matches steering |  | 100 | 74bd8f69 |
| autopilot-spec-tree-llm | IMPLEMENTED_AND_VALID | server/routes/blueprint.ts | tasks 100% (140/140); matches steering |  | 100 | 6b2d25b6 |
| autopilot-spec-tree-workbench | IMPLEMENTED_AND_VALID | client/src/pages/autopilot/right-rail/derive-spec-tree-chip.ts | tasks 100% (12/12); matches steering |  | 100 | 696cb498 |
| autopilot-stage-edit-mode | IMPLEMENTED_AND_VALID | shared/blueprint/contracts.ts | tasks 100% (49/49); matches steering |  | 100 | 66b00ade |
| autopilot-stage-progress-indicator | DESIGNED_NEVER_BUILT | .kiro/specs/autopilot-stage-progress-indicator/requirements.md | no source path mentioned in spec exists in working tree |  | 100 | ec69a87e |
| autopilot-stage-state-coordination | IMPLEMENTED_AND_VALID | shared/blueprint/contracts.ts | tasks 100% (43/43); matches steering |  | 100 | 66b00ade |
| autopilot-stage-version-history | IMPLEMENTED_AND_VALID | shared/blueprint/contracts.ts | tasks 100% (40/40); matches steering |  | 100 | 66b00ade |
| autopilot-step-driven-rail-navigation | IMPLEMENTED_AND_VALID | client/src/pages/autopilot/right-rail/hooks/use-right-rail-sub-stage-state.ts | tasks 100% (12/12); matches steering |  | 100 | b52e0274 |
| autopilot-streaming-doc-renderer | DESIGNED_NEVER_BUILT | .kiro/specs/autopilot-streaming-doc-renderer/requirements.md | no source path mentioned in spec exists in working tree |  | 100 | ec69a87e |
| autopilot-streaming-experience | IMPLEMENTED_AND_VALID | server/routes/blueprint/stage-progress-emitter.ts | tasks 100% (11/11); matches steering |  | 100 | df8cbdb2 |
| autopilot-streaming-lifecycle-weave | DESIGNED_NEVER_BUILT | .kiro/specs/autopilot-streaming-lifecycle-weave/requirements.md | no source path mentioned in spec exists in working tree |  | 100 | ec69a87e |
| autopilot-sub-stage-card-primitive | IMPLEMENTED_AND_VALID | client/src/pages/autopilot/right-rail/primitives/index.ts | tasks 100% (10/10); matches steering |  | 100 | 3999f7ad |
| autopilot-sub-stage-metrics-extractor | IMPLEMENTED_AND_VALID | client/src/pages/autopilot/right-rail/sub-stage-summary.ts | tasks 100% (14/14); matches steering |  | 100 | 3041dc00 |
| autopilot-sub-stage-panel-wrapping | DESIGNED_NEVER_BUILT | .kiro/specs/autopilot-sub-stage-panel-wrapping/requirements.md | no source path mentioned in spec exists in working tree |  | 100 | 11046ec7 |
| autopilot-takeover-control-panel | DESIGNED_NEVER_BUILT | .kiro/specs/autopilot-takeover-control-panel/requirements.md | no source path mentioned in spec exists in working tree |  | 100 | fea13543 |
| autopilot-visual-language-and-motion-system | DESIGNED_NEVER_BUILT | .kiro/specs/autopilot-visual-language-and-motion-system/requirements.md | no source path mentioned in spec exists in working tree |  | 100 | fea13543 |
| autopilot-workbench-stage-rhythm | DESIGNED_NEVER_BUILT | .kiro/specs/autopilot-workbench-stage-rhythm/requirements.md | no source path mentioned in spec exists in working tree |  | 100 | ec69a87e |
| blueprint-agent-crew-fabric | DESIGNED_NEVER_BUILT | .kiro/specs/blueprint-agent-crew-fabric/requirements.md | no source path mentioned in spec exists in working tree |  | 100 | af552fa9 |
| blueprint-artifact-memory-and-replay | DESIGNED_NEVER_BUILT | .kiro/specs/blueprint-artifact-memory-and-replay/requirements.md | no source path mentioned in spec exists in working tree |  | 100 | af552fa9 |
| blueprint-autopilot-route-orchestrator | DESIGNED_NEVER_BUILT | .kiro/specs/blueprint-autopilot-route-orchestrator/requirements.md | no source path mentioned in spec exists in working tree |  | 100 | af552fa9 |
| blueprint-clarification-workflow | DESIGNED_NEVER_BUILT | .kiro/specs/blueprint-clarification-workflow/requirements.md | no source path mentioned in spec exists in working tree |  | 100 | 370a54d9 |
| blueprint-domain-and-asset-store | DESIGNED_NEVER_BUILT | .kiro/specs/blueprint-domain-and-asset-store/requirements.md | no source path mentioned in spec exists in working tree |  | 100 | 1b9b72b0 |
| blueprint-effect-preview-generator | DESIGNED_NEVER_BUILT | .kiro/specs/blueprint-effect-preview-generator/requirements.md | no source path mentioned in spec exists in working tree |  | 100 | af552fa9 |
| blueprint-engineering-landing-bridge | DESIGNED_NEVER_BUILT | .kiro/specs/blueprint-engineering-landing-bridge/requirements.md | no source path mentioned in spec exists in working tree |  | 100 | 1b9b72b0 |
| blueprint-generation-api-and-job-contract | DESIGNED_NEVER_BUILT | .kiro/specs/blueprint-generation-api-and-job-contract/requirements.md | no source path mentioned in spec exists in working tree |  | 100 | af552fa9 |
| blueprint-implementation-prompt-packager | DESIGNED_NEVER_BUILT | .kiro/specs/blueprint-implementation-prompt-packager/requirements.md | no source path mentioned in spec exists in working tree |  | 100 | 1b9b72b0 |
| blueprint-input-github-ingestion | DESIGNED_NEVER_BUILT | .kiro/specs/blueprint-input-github-ingestion/requirements.md | no source path mentioned in spec exists in working tree |  | 100 | 1b9b72b0 |
| blueprint-runtime-capability-bridge | DESIGNED_NEVER_BUILT | .kiro/specs/blueprint-runtime-capability-bridge/requirements.md | no source path mentioned in spec exists in working tree |  | 100 | af552fa9 |
| blueprint-spec-document-generator | DESIGNED_NEVER_BUILT | .kiro/specs/blueprint-spec-document-generator/requirements.md | no source path mentioned in spec exists in working tree |  | 100 | 1b9b72b0 |
| blueprint-spec-tree-workbench | DESIGNED_NEVER_BUILT | .kiro/specs/blueprint-spec-tree-workbench/requirements.md | no source path mentioned in spec exists in working tree |  | 100 | 1b9b72b0 |
| browser-artifact-preview-runtime | DESIGNED_NEVER_BUILT | .kiro/specs/browser-artifact-preview-runtime/requirements.md | no source path mentioned in spec exists in working tree |  | 100 | 6239575a |
| browser-runtime | IMPLEMENTED_AND_VALID | shared/message-bus-rules.ts | tasks 100% (37/37); matches steering |  | 100 | ca8eb5b4 |
| collaboration-replay | IMPLEMENTED_AND_VALID | shared/replay/contracts.ts | tasks 100% (89/89); matches steering |  | 100 | ca8eb5b4 |
| consumer-email-auth-and-account | DESIGNED_NEVER_BUILT | .kiro/specs/consumer-email-auth-and-account/requirements.md | no source path mentioned in spec exists in working tree |  | 100 | ec69a87e |
| cost-governance-strategy | IMPLEMENTED_AND_VALID | shared/cost.ts | tasks 100% (20/20); matches steering |  | 100 | ca8eb5b4 |
| cost-observability | IMPLEMENTED_AND_VALID | server/core/cost-tracker.ts | tasks 100% (43/43); matches steering |  | 100 | ca8eb5b4 |
| cross-framework-export | IMPLEMENTED_AND_VALID | shared/export-schema.ts | tasks 100% (30/30); matches steering |  | 100 | ec69a87e |
| cube-ai-agent-sandbox-image | DESIGNED_NEVER_BUILT | .kiro/specs/cube-ai-agent-sandbox-image/requirements.md | no source path mentioned in spec exists in working tree |  | 100 | 6239575a |
| data-lineage-tracking | IMPLEMENTED_AND_VALID | shared/lineage/contracts.ts | tasks 100% (82/82); matches steering |  | 100 | ca8eb5b4 |
| demo-data-engine | IMPLEMENTED_AND_VALID | shared/organization-schema.ts | tasks 100% (25/25); matches steering |  | 100 | ca8eb5b4 |
| demo-guided-experience | IMPLEMENTED_AND_VALID | client/src/runtime/demo-playback/engine.ts | tasks 100% (22/22); matches steering |  | 100 | ca8eb5b4 |
| destination-card-and-goal-summary | IMPLEMENTED_AND_VALID | shared/mission/autopilot.ts | tasks 100% (9/9); matches steering |  | 100 | c728e176 |
| destination-model-and-parser | IMPLEMENTED_AND_VALID | shared/mission/autopilot.ts | tasks 100% (14/14); matches steering |  | 100 | c728e176 |
| docker-executor-capabilities-contract | IMPLEMENTED_AND_VALID | shared/executor/contracts.ts | tasks 100% (34/34); matches steering |  | 100 | 6239575a |
| docker-live-preview-workstation | DESIGNED_NEVER_BUILT | .kiro/specs/docker-live-preview-workstation/requirements.md | no source path mentioned in spec exists in working tree |  | 100 | ec69a87e |
| drive-state-and-replan-state-machine | IMPLEMENTED_AND_VALID | server/tasks/mission-projection.ts | tasks 100% (15/15); matches steering |  | 100 | c728e176 |
| dynamic-organization | IMPLEMENTED_AND_VALID | server/core/dynamic-organization.ts | tasks 100% (38/38); matches steering |  | 100 | ca8eb5b4 |
| dynamic-role-system | IMPLEMENTED_AND_VALID | shared/organization-schema.ts | tasks 100% (57/57); matches steering |  | 100 | ca8eb5b4 |
| edge-brain-deployment | DESIGNED_NEVER_BUILT | .kiro/specs/edge-brain-deployment/requirements.md | no source path mentioned in spec exists in working tree |  | 0 | ca8eb5b4 |
| evolution-heartbeat | IMPLEMENTED_AND_VALID | server/core/evolution.ts | tasks 100% (34/34); matches steering |  | 100 | ca8eb5b4 |
| execution-language-refresh | PARTIALLY_IMPLEMENTED | client/src/i18n/messages.ts | tasks.md 14/16 checkboxes (88%) |  | 88 | ca8eb5b4 |
| executor-integration | IMPLEMENTED_AND_VALID | server/core/execution-bridge.ts | tasks 100% (29/29); matches steering |  | 100 | ca8eb5b4 |
| feishu-bridge | IMPLEMENTED_AND_VALID | server/feishu/bridge.ts | tasks 100% (26/26); matches steering |  | 100 | ca8eb5b4 |
| fleet-organization-and-role-packaging | IMPLEMENTED_AND_VALID | shared/mission/autopilot.ts | tasks 100% (31/31); matches steering |  | 100 | c728e176 |
| fleet-status-and-live-execution-view | IMPLEMENTED_AND_VALID | shared/mission/autopilot.ts | tasks 100% (14/14); matches steering |  | 100 | c728e176 |
| frontend-3d | DESIGNED_NEVER_BUILT | .kiro/specs/frontend-3d/requirements.md | no source path mentioned in spec exists in working tree |  | 100 | ca8eb5b4 |
| full-chain-release-readiness-v1 | IMPLEMENTED_AND_VALID | shared/workflow-runtime.ts | tasks 100% (8/8); matches steering |  | 100 | ec69a87e |
| holographic-ui | DESIGNED_NEVER_BUILT | .kiro/specs/holographic-ui/requirements.md | no source path mentioned in spec exists in working tree |  | 100 | ca8eb5b4 |
| human-in-the-loop | IMPLEMENTED_AND_VALID | shared/mission/contracts.ts | tasks 100% (51/51); matches steering |  | 100 | ca8eb5b4 |
| i18n-cleanup | DESIGNED_NEVER_BUILT | .kiro/specs/i18n-cleanup/requirements.md | no source path mentioned in spec exists in working tree |  | 0 | ca8eb5b4 |
| intelligent-launch-convergence | IMPLEMENTED_AND_VALID | client/src/lib/nl-command-store.ts | tasks 100% (29/29); matches steering |  | 100 | ec69a87e |
| k8s-agent-operator | DESIGNED_NEVER_BUILT | .kiro/specs/k8s-agent-operator/requirements.md | no source path mentioned in spec exists in working tree |  | 0 | ca8eb5b4 |
| knowledge-graph | IMPLEMENTED_AND_VALID | server/db/index.ts | tasks 100% (68/68); matches steering |  | 100 | ca8eb5b4 |
| launch-operator-surface-convergence | DESIGNED_NEVER_BUILT | .kiro/specs/launch-operator-surface-convergence/requirements.md | no source path mentioned in spec exists in working tree |  | 100 | ec69a87e |
| launch-panel-visual-overhaul | DESIGNED_NEVER_BUILT | .kiro/specs/launch-panel-visual-overhaul/requirements.md | no source path mentioned in spec exists in working tree |  | 100 | ec69a87e |
| lightweight-mysql-redis-persistence-strategy | DESIGNED_NEVER_BUILT | .kiro/specs/lightweight-mysql-redis-persistence-strategy/requirements.md | no source path mentioned in spec exists in working tree |  | 100 | b05a3040 |
| lobster-executor-real | IMPLEMENTED_AND_VALID | services/lobster-executor/src/runner.ts | tasks 100% (33/33); matches steering |  | 100 | ca8eb5b4 |
| memory-system | IMPLEMENTED_AND_VALID | server/memory/session-store.ts | tasks 100% (32/32); matches steering |  | 100 | ca8eb5b4 |
| mirofish-visual-alignment | PARTIALLY_IMPLEMENTED | client/src/hooks/useMirofishTheme.ts | tasks.md 19/27 checkboxes (70%) |  | 70 | 010bbd0c |
| mission-cancel-control | IMPLEMENTED_AND_VALID | shared/mission/contracts.ts | tasks 100% (35/35); matches steering |  | 100 | ec69a87e |
| mission-model-to-autopilot-model-mapping | IMPLEMENTED_AND_VALID | shared/mission/autopilot.ts | tasks 100% (15/15); matches steering |  | 100 | 5ed98a27 |
| mission-native-projection | IMPLEMENTED_AND_VALID | client/src/lib/tasks-store.ts | tasks 100% (33/33); matches steering |  | 100 | ca8eb5b4 |
| mission-operator-actions | IMPLEMENTED_AND_VALID | server/tasks/mission-operator-service.ts | tasks 100% (33/33); matches steering |  | 100 | ca8eb5b4 |
| mission-runtime | IMPLEMENTED_AND_VALID | server/tasks/mission-store.ts | tasks 100% (74/74); matches steering |  | 100 | ec69a87e |
| mission-ui-polish | DESIGNED_NEVER_BUILT | .kiro/specs/mission-ui-polish/requirements.md | no source path mentioned in spec exists in working tree |  | 84 | 333681ab |
| multi-modal-agent | IMPLEMENTED_AND_VALID | client/src/lib/tts-engine.ts | tasks 100% (40/40); matches steering |  | 100 | ca8eb5b4 |
| multi-modal-vision | IMPLEMENTED_AND_VALID | shared/workflow-input.ts | tasks 100% (37/37); matches steering |  | 100 | ec69a87e |
| multi-region-disaster-recovery | DESIGNED_NEVER_BUILT | .kiro/specs/multi-region-disaster-recovery/requirements.md | no source path mentioned in spec exists in working tree |  | 0 | ca8eb5b4 |
| multi-tenant-architecture | DESIGNED_NEVER_BUILT | .kiro/specs/multi-tenant-architecture/requirements.md | no source path mentioned in spec exists in working tree |  | 0 | ca8eb5b4 |
| multi-user-office | DESIGNED_NEVER_BUILT | .kiro/specs/multi-user-office/requirements.md | no source path mentioned in spec exists in working tree |  | 0 | ca8eb5b4 |
| navigation-convergence | DESIGNED_NEVER_BUILT | .kiro/specs/navigation-convergence/requirements.md | no source path mentioned in spec exists in working tree |  | 100 | ec69a87e |
| nl-command-center | IMPLEMENTED_AND_VALID | shared/mission/contracts.ts | tasks 100% (104/104); matches steering |  | 100 | ec69a87e |
| office-cockpit-first-screen-refresh | DESIGNED_NEVER_BUILT | .kiro/specs/office-cockpit-first-screen-refresh/requirements.md | no source path mentioned in spec exists in working tree |  | 100 | ec69a87e |
| office-home-performance-stability | DESIGNED_NEVER_BUILT | .kiro/specs/office-home-performance-stability/requirements.md | no source path mentioned in spec exists in working tree |  | 100 | ec69a87e |
| office-shell-convergence-v1 | IMPLEMENTED_AND_VALID | client/src/components/navigation-config.ts | tasks 100% (28/28); matches steering |  | 100 | ec69a87e |
| office-task-cockpit | DESIGNED_NEVER_BUILT | .kiro/specs/office-task-cockpit/requirements.md | no source path mentioned in spec exists in working tree |  | 100 | ec69a87e |
| office-wall-display-redesign | DUPLICATE | .kiro/specs/office-wall-display-redesign + .kiro/specs/office-wall-display-redesign-v2 | duplicate cluster C-1158; criterion=name_normalization | office-wall-display-redesign-v2 | 100 | 03b92523 |
| office-wall-display-redesign-v2 | DESIGNED_NEVER_BUILT | .kiro/specs/office-wall-display-redesign-v2/requirements.md | no source path mentioned in spec exists in working tree |  | 100 | ec69a87e |
| personal-project-ownership-and-isolation | DESIGNED_NEVER_BUILT | .kiro/specs/personal-project-ownership-and-isolation/requirements.md | no source path mentioned in spec exists in working tree |  | 100 | 432567c8 |
| plugin-skill-system | IMPLEMENTED_AND_VALID | server/db/index.ts | tasks 100% (42/42); matches steering |  | 100 | ca8eb5b4 |
| production-deployment | DESIGNED_NEVER_BUILT | .kiro/specs/production-deployment/requirements.md | no source path mentioned in spec exists in working tree |  | 0 | ca8eb5b4 |
| project-autopilot-blueprint-master | DESIGNED_NEVER_BUILT | .kiro/specs/project-autopilot-blueprint-master/requirements.md | no source path mentioned in spec exists in working tree |  | 100 | 370a54d9 |
| project-clarification-conversation | DESIGNED_NEVER_BUILT | .kiro/specs/project-clarification-conversation/requirements.md | no source path mentioned in spec exists in working tree |  | 100 | daed40fe |
| project-cockpit-home | DESIGNED_NEVER_BUILT | .kiro/specs/project-cockpit-home/requirements.md | no source path mentioned in spec exists in working tree |  | 100 | daed40fe |
| project-domain-model | IMPLEMENTED_AND_VALID | client/src/lib/project-store.test.ts | tasks 100% (10/10); matches steering |  | 100 | daed40fe |
| project-evidence-artifact-replay | IMPLEMENTED_AND_VALID | client/src/lib/project-store.ts | tasks 100% (10/10); matches steering |  | 100 | daed40fe |
| project-execution-center | DESIGNED_NEVER_BUILT | .kiro/specs/project-execution-center/requirements.md | no source path mentioned in spec exists in working tree |  | 100 | daed40fe |
| project-first-product-architecture | DESIGNED_NEVER_BUILT | .kiro/specs/project-first-product-architecture/requirements.md | no source path mentioned in spec exists in working tree |  | 100 | daed40fe |
| project-fsd-route-planner | DESIGNED_NEVER_BUILT | .kiro/specs/project-fsd-route-planner/requirements.md | no source path mentioned in spec exists in working tree |  | 100 | daed40fe |
| project-scoped-composer | DESIGNED_NEVER_BUILT | .kiro/specs/project-scoped-composer/requirements.md | no source path mentioned in spec exists in working tree |  | 100 | daed40fe |
| project-spec-center | DESIGNED_NEVER_BUILT | .kiro/specs/project-spec-center/requirements.md | no source path mentioned in spec exists in working tree |  | 100 | daed40fe |
| release-stability-guardrails-v2 | DESIGNED_NEVER_BUILT | .kiro/specs/release-stability-guardrails-v2/requirements.md | no source path mentioned in spec exists in working tree |  | 100 | ec69a87e |
| replay-and-debug-surface-v1 | IMPLEMENTED_AND_VALID | server/routes/replay.ts | tasks 100% (21/21); matches steering |  | 100 | ec69a87e |
| repo-system-reconnaissance-2026-05-28 | PARTIALLY_IMPLEMENTED | server/routes/audit.ts | tasks.md 8/16 checkboxes (50%) |  | 50 | d181be2f |
| route-planner-and-route-model | IMPLEMENTED_AND_VALID | shared/mission/autopilot.ts | tasks 100% (77/77); matches steering |  | 100 | c728e176 |
| route-recommendation-and-selection | IMPLEMENTED_AND_VALID | shared/mission/autopilot.ts | tasks 100% (20/20); matches steering |  | 100 | c728e176 |
| sandbox-live-preview | IMPLEMENTED_AND_VALID | shared/executor/contracts.ts | tasks 100% (42/42); matches steering |  | 100 | ca8eb5b4 |
| sandbox-native-executor-compat | IMPLEMENTED_AND_VALID | services/lobster-executor/src/config.ts | tasks 100% (17/17); matches steering |  | 100 | ca8eb5b4 |
| scene-agent-interaction | DESIGNED_NEVER_BUILT | .kiro/specs/scene-agent-interaction/requirements.md | no source path mentioned in spec exists in working tree |  | 88 | 97e2e951 |
| scene-mission-fusion | IMPLEMENTED_AND_VALID | client/src/components/tasks/mission-island-helpers.ts | tasks 100% (26/26); matches steering |  | 100 | ca8eb5b4 |
| secure-sandbox | IMPLEMENTED_AND_VALID | shared/executor/contracts.ts | tasks 100% (44/44); matches steering |  | 100 | ca8eb5b4 |
| skill-aware-agent-sandbox | DESIGNED_NEVER_BUILT | .kiro/specs/skill-aware-agent-sandbox/requirements.md | no source path mentioned in spec exists in working tree |  | 100 | 6239575a |
| spec-docs-generation-progress-feedback | IMPLEMENTED_AND_VALID | shared/blueprint/contracts.ts | tasks 100% (29/29); matches steering |  | 100 | d181be2f |
| spec-first-stage-process-artifact-split-uniform | PARTIALLY_IMPLEMENTED | shared/blueprint/contracts.ts | tasks.md 39/44 checkboxes (89%) |  | 89 | e76daa26 |
| state-persistence-recovery | IMPLEMENTED_AND_VALID | shared/mission/contracts.ts | tasks 100% (36/36); matches steering |  | 100 | ec69a87e |
| steering-volume-snapshot-2026-05-28 | DESIGNED_NEVER_BUILT | .kiro/specs/steering-volume-snapshot-2026-05-28/requirements.md | no source path mentioned in spec exists in working tree |  | 100 | d181be2f |
| takeover-panel-and-decision-points | IMPLEMENTED_AND_VALID | client/src/components/tasks/__tests__/DecisionPanel.param-collection.test.ts | tasks 100% (120/120); matches steering |  | 100 | c728e176 |
| task-autopilot-core-concepts | IMPLEMENTED_AND_VALID | shared/mission/autopilot.ts | tasks 100% (8/8); matches steering |  | 100 | c728e176 |
| task-autopilot-levels-l1-to-l5 | IMPLEMENTED_AND_VALID | shared/mission/autopilot.ts | tasks 100% (19/19); matches steering |  | 100 | c728e176 |
| task-autopilot-platform-positioning | DESIGNED_NEVER_BUILT | .kiro/specs/task-autopilot-platform-positioning/requirements.md | no source path mentioned in spec exists in working tree |  | 100 | c728e176 |
| task-autopilot-success-metrics | IMPLEMENTED_AND_VALID | shared/mission/autopilot.ts | tasks 100% (58/58); matches steering |  | 100 | c728e176 |
| task-detail-operations-first | PARTIALLY_IMPLEMENTED | client/src/lib/tasks-store.ts | tasks.md 13/15 checkboxes (87%) |  | 87 | 7bca0efd |
| task-hub-convergence | IMPLEMENTED_AND_VALID | client/src/lib/nl-command-store.ts | tasks 100% (16/16); matches steering |  | 100 | ec69a87e |
| task-os-home-redesign-v1 | DESIGNED_NEVER_BUILT | .kiro/specs/task-os-home-redesign-v1/requirements.md | no source path mentioned in spec exists in working tree |  | 100 | ec69a87e |
| task-runtime-visibility-v1 | IMPLEMENTED_AND_VALID | client/src/lib/navigation-events.ts | tasks 100% (118/118); matches steering |  | 100 | ec69a87e |
| telemetry-dashboard | IMPLEMENTED_AND_VALID | server/core/llm-client.ts | tasks 100% (34/34); matches steering |  | 100 | ca8eb5b4 |
| ue-camera-system | DESIGNED_NEVER_BUILT | .kiro/specs/ue-camera-system/requirements.md | no source path mentioned in spec exists in working tree |  | 0 | 1a757c7e |
| ue-director-prompt-system | DESIGNED_NEVER_BUILT | .kiro/specs/ue-director-prompt-system/requirements.md | no source path mentioned in spec exists in working tree |  | 0 | b4f9b088 |
| ue-event-callback-system | DESIGNED_NEVER_BUILT | .kiro/specs/ue-event-callback-system/requirements.md | no source path mentioned in spec exists in working tree |  | 0 | 7fc48235 |
| ue-fallback-and-degradation | DESIGNED_NEVER_BUILT | .kiro/specs/ue-fallback-and-degradation/requirements.md | no source path mentioned in spec exists in working tree |  | 0 | 7fc48235 |
| ue-interaction-passthrough | DESIGNED_NEVER_BUILT | .kiro/specs/ue-interaction-passthrough/requirements.md | no source path mentioned in spec exists in working tree |  | 0 | b4f9b088 |
| ue-local-resource-and-session-governance | DESIGNED_NEVER_BUILT | .kiro/specs/ue-local-resource-and-session-governance/requirements.md | no source path mentioned in spec exists in working tree |  | 0 | b4f9b088 |
| ue-local-streaming-runtime | DESIGNED_NEVER_BUILT | .kiro/specs/ue-local-streaming-runtime/requirements.md | no source path mentioned in spec exists in working tree |  | 100 | dd900c27 |
| ue-mobile-lite-viewer | DESIGNED_NEVER_BUILT | .kiro/specs/ue-mobile-lite-viewer/requirements.md | no source path mentioned in spec exists in working tree |  | 0 | 1a757c7e |
| ue-multi-user-session-isolation | DESIGNED_NEVER_BUILT | .kiro/specs/ue-multi-user-session-isolation/requirements.md | no source path mentioned in spec exists in working tree |  | 0 | 1a757c7e |
| ue-office-scene-build | DESIGNED_NEVER_BUILT | .kiro/specs/ue-office-scene-build/requirements.md | no source path mentioned in spec exists in working tree |  | 100 | c97033f0 |
| ue-overlay-ui-integration | DESIGNED_NEVER_BUILT | .kiro/specs/ue-overlay-ui-integration/requirements.md | no source path mentioned in spec exists in working tree |  | 93 | e6bafc5c |
| ue-performance-profiling-and-quality-tier | DESIGNED_NEVER_BUILT | .kiro/specs/ue-performance-profiling-and-quality-tier/requirements.md | no source path mentioned in spec exists in working tree |  | 0 | b4f9b088 |
| ue-pet-character-system | IMPLEMENTED_AND_VALID | shared/ue-character.ts | tasks 100% (27/27); matches steering |  | 100 | b17a6202 |
| ue-realtime-narration | DESIGNED_NEVER_BUILT | .kiro/specs/ue-realtime-narration/requirements.md | no source path mentioned in spec exists in working tree |  | 0 | 1a757c7e |
| ue-recording-and-replay-export | DESIGNED_NEVER_BUILT | .kiro/specs/ue-recording-and-replay-export/requirements.md | no source path mentioned in spec exists in working tree |  | 0 | b4f9b088 |
| ue-scene-asset-pipeline | DESIGNED_NEVER_BUILT | .kiro/specs/ue-scene-asset-pipeline/requirements.md | no source path mentioned in spec exists in working tree |  | 0 | 1a757c7e |
| ue-scene-command-protocol | DESIGNED_NEVER_BUILT | .kiro/specs/ue-scene-command-protocol/requirements.md | no source path mentioned in spec exists in working tree |  | 100 | d032c884 |
| ue-shot-list-planner | DESIGNED_NEVER_BUILT | .kiro/specs/ue-shot-list-planner/requirements.md | no source path mentioned in spec exists in working tree |  | 0 | 7fc48235 |
| ue-state-sync-bridge | DESIGNED_NEVER_BUILT | .kiro/specs/ue-state-sync-bridge/requirements.md | no source path mentioned in spec exists in working tree |  | 0 | 7fc48235 |
| ue-video-stream-player | DESIGNED_NEVER_BUILT | .kiro/specs/ue-video-stream-player/requirements.md | no source path mentioned in spec exists in working tree |  | 100 | ee450421 |
| ui-redesign-color-and-tokens | DESIGNED_NEVER_BUILT | .kiro/specs/ui-redesign-color-and-tokens/requirements.md | no source path mentioned in spec exists in working tree |  | 100 | 96cb8dbe |
| ui-redesign-composer-only-center-input | IMPLEMENTED_AND_VALID | client/src/components/launch/__tests__/UnifiedLaunchComposer.test.ts | tasks 100% (36/36); matches steering |  | 100 | ec69a87e |
| ui-redesign-home-cockpit-shell-convergence | IMPLEMENTED_AND_VALID | client/src/components/office/office-task-cockpit-utils.test.ts | tasks 100% (24/24); matches steering |  | 100 | ec69a87e |
| ui-redesign-launch-panel | DESIGNED_NEVER_BUILT | .kiro/specs/ui-redesign-launch-panel/requirements.md | no source path mentioned in spec exists in working tree |  | 100 | eadcad8b |
| ui-redesign-responsive-regression | DESIGNED_NEVER_BUILT | .kiro/specs/ui-redesign-responsive-regression/requirements.md | no source path mentioned in spec exists in working tree |  | 100 | eadcad8b |
| ui-redesign-right-info-panel | IMPLEMENTED_AND_VALID | client/src/components/tasks/right-info-helpers.ts | tasks 100% (42/42); matches steering |  | 100 | ee06a2e0 |
| ui-redesign-scene-adaptation | IMPLEMENTED_AND_VALID | client/src/hooks/useContainerWidth.ts | tasks 100% (42/42); matches steering |  | 100 | 9e440d54 |
| ui-redesign-sidebar-navigation | DESIGNED_NEVER_BUILT | .kiro/specs/ui-redesign-sidebar-navigation/requirements.md | no source path mentioned in spec exists in working tree |  | 100 | 7d3045ee |
| ui-redesign-status-indicators | DESIGNED_NEVER_BUILT | .kiro/specs/ui-redesign-status-indicators/requirements.md | no source path mentioned in spec exists in working tree |  | 100 | 98e8d821 |
| ui-redesign-task-center-workbench-tabs | DESIGNED_NEVER_BUILT | .kiro/specs/ui-redesign-task-center-workbench-tabs/requirements.md | no source path mentioned in spec exists in working tree |  | 100 | ec69a87e |
| ui-redesign-task-detail-cards | DESIGNED_NEVER_BUILT | .kiro/specs/ui-redesign-task-detail-cards/requirements.md | no source path mentioned in spec exists in working tree |  | 100 | 03469f92 |
| vector-db-rag-pipeline | IMPLEMENTED_AND_VALID | server/core/agent.ts | tasks 100% (79/79); matches steering |  | 100 | ca8eb5b4 |
| vr-extension | DESIGNED_NEVER_BUILT | .kiro/specs/vr-extension/requirements.md | no source path mentioned in spec exists in working tree |  | 0 | ca8eb5b4 |
| web-aigc-node-ai_ppt | IMPLEMENTED_AND_VALID | shared/web-aigc-ai-ppt.ts | tasks 100% (4/4); matches steering |  | 100 | dffd48b2 |
| web-aigc-node-audio_recognition | IMPLEMENTED_AND_VALID | server/routes/voice.ts | tasks 100% (11/11); matches steering |  | 100 | fcc1ba91 |
| web-aigc-node-auto_agent | IMPLEMENTED_AND_VALID | server/routes/a2a.ts | tasks 100% (4/4); matches steering |  | 100 | 0da9afdd |
| web-aigc-node-command_list | IMPLEMENTED_AND_VALID | server/routes/nl-command.ts | tasks 100% (4/4); matches steering |  | 100 | 24eca74d |
| web-aigc-node-condition | DESIGNED_NEVER_BUILT | .kiro/specs/web-aigc-node-condition/requirements.md | no source path mentioned in spec exists in working tree |  | 100 | 8236c679 |
| web-aigc-node-confirm_judge | IMPLEMENTED_AND_VALID | server/routes/tasks.ts | tasks 100% (4/4); matches steering |  | 100 | 6d4ca6f5 |
| web-aigc-node-dialogue | DESIGNED_NEVER_BUILT | .kiro/specs/web-aigc-node-dialogue/requirements.md | no source path mentioned in spec exists in working tree |  | 100 | ffbbfab5 |
| web-aigc-node-document_search | IMPLEMENTED_AND_VALID | server/routes/rag.ts | tasks 100% (4/4); matches steering |  | 100 | 6d4ca6f5 |
| web-aigc-node-dynamic_chart | IMPLEMENTED_AND_VALID | shared/web-aigc-dynamic-chart.ts | tasks 100% (11/11); matches steering |  | 100 | 22d6ec33 |
| web-aigc-node-end | IMPLEMENTED_AND_VALID | server/routes/workflows.ts | tasks 100% (4/4); matches steering |  | 100 | 6d4ca6f5 |
| web-aigc-node-excel_read | DESIGNED_NEVER_BUILT | .kiro/specs/web-aigc-node-excel_read/requirements.md | no source path mentioned in spec exists in working tree |  | 100 | a2102c72 |
| web-aigc-node-file_generation | IMPLEMENTED_AND_VALID | server/routes/tasks.ts | tasks 100% (4/4); matches steering |  | 100 | ec61bfb9 |
| web-aigc-node-file_slicing | IMPLEMENTED_AND_VALID | shared/web-aigc-file-slicing.ts | tasks 100% (4/4); matches steering |  | 100 | 07918a8d |
| web-aigc-node-file_translation | IMPLEMENTED_AND_VALID | shared/web-aigc-file-translation.ts | tasks 100% (4/4); matches steering |  | 100 | a060521a |
| web-aigc-node-flow_jump | DESIGNED_NEVER_BUILT | .kiro/specs/web-aigc-node-flow_jump/requirements.md | no source path mentioned in spec exists in working tree |  | 100 | 0da9afdd |
| web-aigc-node-format_output | DESIGNED_NEVER_BUILT | .kiro/specs/web-aigc-node-format_output/requirements.md | no source path mentioned in spec exists in working tree |  | 100 | cf2dd3f7 |
| web-aigc-node-fragment_search | DESIGNED_NEVER_BUILT | .kiro/specs/web-aigc-node-fragment_search/requirements.md | no source path mentioned in spec exists in working tree |  | 100 | 23c0947f |
| web-aigc-node-get_device_info | IMPLEMENTED_AND_VALID | server/index.ts | tasks 100% (4/4); matches steering |  | 100 | 3d93fcd1 |
| web-aigc-node-get_location_info | DESIGNED_NEVER_BUILT | .kiro/specs/web-aigc-node-get_location_info/requirements.md | no source path mentioned in spec exists in working tree |  | 100 | 062c7982 |
| web-aigc-node-graph_search | IMPLEMENTED_AND_VALID | shared/web-aigc-graph-search.ts | tasks 100% (4/4); matches steering |  | 100 | 31bca976 |
| web-aigc-node-image_search | IMPLEMENTED_AND_VALID | shared/web-aigc-image-search.ts | tasks 100% (4/4); matches steering |  | 100 | 0f1d58ba |
| web-aigc-node-intent_recognition | IMPLEMENTED_AND_VALID | server/routes/nl-command.ts | tasks 100% (4/4); matches steering |  | 100 | 3cd22bbb |
| web-aigc-node-internal_api | IMPLEMENTED_AND_VALID | server/tool/api/internal-api-adapter.ts | tasks 100% (4/4); matches steering |  | 100 | fab56d90 |
| web-aigc-node-knowledge_qa | IMPLEMENTED_AND_VALID | server/routes/knowledge.ts | tasks 100% (4/4); matches steering |  | 100 | 8236c679 |
| web-aigc-node-llm | IMPLEMENTED_AND_VALID | shared/workflow-runtime.ts | tasks 100% (4/4); matches steering |  | 100 | 0da9afdd |
| web-aigc-node-long_text_extraction | DESIGNED_NEVER_BUILT | .kiro/specs/web-aigc-node-long_text_extraction/requirements.md | no source path mentioned in spec exists in working tree |  | 100 | f6a7c7b2 |
| web-aigc-node-loop | DESIGNED_NEVER_BUILT | .kiro/specs/web-aigc-node-loop/requirements.md | no source path mentioned in spec exists in working tree |  | 100 | 0da9afdd |
| web-aigc-node-mcp | IMPLEMENTED_AND_VALID | server/routes/node-adapters/mcp-node-adapter.ts | tasks 100% (8/8); matches steering |  | 100 | bc86cfab |
| web-aigc-node-message_notification | IMPLEMENTED_AND_VALID | server/tests/feishu-bridge.test.ts | tasks 100% (4/4); matches steering |  | 100 | 5c611d3e |
| web-aigc-node-ocr_recognition | IMPLEMENTED_AND_VALID | server/routes/vision.ts | tasks 100% (11/11); matches steering |  | 100 | 937564d1 |
| web-aigc-node-open_dashboard | IMPLEMENTED_AND_VALID | server/routes/node-adapters/open-dashboard-node-adapter.ts | tasks 100% (4/4); matches steering |  | 100 | 618c94c8 |
| web-aigc-node-open_page | DESIGNED_NEVER_BUILT | .kiro/specs/web-aigc-node-open_page/requirements.md | no source path mentioned in spec exists in working tree |  | 100 | 80228bbf |
| web-aigc-node-open_report | IMPLEMENTED_AND_VALID | server/routes/workflows.ts | tasks 100% (4/4); matches steering |  | 100 | 9a09d129 |
| web-aigc-node-orchestration_recognition_jump | DESIGNED_NEVER_BUILT | .kiro/specs/web-aigc-node-orchestration_recognition_jump/requirements.md | no source path mentioned in spec exists in working tree |  | 100 | 90fc5ab9 |
| web-aigc-node-param_collection | IMPLEMENTED_AND_VALID | server/routes/tasks.ts | tasks 100% (4/4); matches steering |  | 100 | dea02b25 |
| web-aigc-node-passthrough_api | DESIGNED_NEVER_BUILT | .kiro/specs/web-aigc-node-passthrough_api/requirements.md | no source path mentioned in spec exists in working tree |  | 100 | 6d4ca6f5 |
| web-aigc-node-qa_search | DESIGNED_NEVER_BUILT | .kiro/specs/web-aigc-node-qa_search/requirements.md | no source path mentioned in spec exists in working tree |  | 100 | 0da9afdd |
| web-aigc-node-recommended_commands | IMPLEMENTED_AND_VALID | server/routes/nl-command.ts | tasks 100% (4/4); matches steering |  | 100 | 24eca74d |
| web-aigc-node-robot_reply | DESIGNED_NEVER_BUILT | .kiro/specs/web-aigc-node-robot_reply/requirements.md | no source path mentioned in spec exists in working tree |  | 100 | 8ac0f4cb |
| web-aigc-node-selection | IMPLEMENTED_AND_VALID | server/routes/tasks.ts | tasks 100% (4/4); matches steering |  | 100 | 6d4ca6f5 |
| web-aigc-node-similarity_match | IMPLEMENTED_AND_VALID | shared/web-aigc-similarity-match.ts | tasks 100% (4/4); matches steering |  | 100 | 222c803a |
| web-aigc-node-start | IMPLEMENTED_AND_VALID | server/routes/workflows.ts | tasks 100% (4/4); matches steering |  | 100 | 6d4ca6f5 |
| web-aigc-node-static_webpage_read | IMPLEMENTED_AND_VALID | shared/static-webpage-read.ts | tasks 100% (4/4); matches steering |  | 100 | 0e7a6234 |
| web-aigc-node-transaction_flow | DESIGNED_NEVER_BUILT | .kiro/specs/web-aigc-node-transaction_flow/requirements.md | no source path mentioned in spec exists in working tree |  | 100 | 90fc5ab9 |
| web-aigc-node-user_input | IMPLEMENTED_AND_VALID | server/routes/tasks.ts | tasks 100% (4/4); matches steering |  | 100 | dea02b25 |
| web-aigc-node-variable_assignment | IMPLEMENTED_AND_VALID | server/core/web-aigc-controlflow.ts | tasks 100% (4/4); matches steering |  | 100 | 0da9afdd |
| web-aigc-node-vector_delete | IMPLEMENTED_AND_VALID | shared/web-aigc-vector-delete.ts | tasks 100% (4/4); matches steering |  | 100 | 0d2f55f5 |
| web-aigc-node-vector_insert | IMPLEMENTED_AND_VALID | server/routes/rag.ts | tasks 100% (4/4); matches steering |  | 100 | 03bcc315 |
| web-aigc-node-vector_query | IMPLEMENTED_AND_VALID | server/routes/rag.ts | tasks 100% (4/4); matches steering |  | 100 | 6d4ca6f5 |
| web-aigc-node-vector_update | IMPLEMENTED_AND_VALID | shared/web-aigc-vector-update.ts | tasks 100% (4/4); matches steering |  | 100 | 0d2f55f5 |
| web-aigc-node-web_qa | DESIGNED_NEVER_BUILT | .kiro/specs/web-aigc-node-web_qa/requirements.md | no source path mentioned in spec exists in working tree |  | 100 | ba73ad34 |
| web-aigc-node-web_search | DESIGNED_NEVER_BUILT | .kiro/specs/web-aigc-node-web_search/requirements.md | no source path mentioned in spec exists in working tree |  | 100 | d7f0173e |
| web-aigc-platform-domain-model | IMPLEMENTED_AND_VALID | server/routes/workflows.ts | tasks 100% (5/5); matches steering |  | 100 | 6d4ca6f5 |
| web-aigc-platform-mission-projection | IMPLEMENTED_AND_VALID | server/routes/workflows.ts | tasks 100% (5/5); matches steering |  | 100 | 6d4ca6f5 |
| web-aigc-platform-observability-audit | IMPLEMENTED_AND_VALID | shared/web-aigc-observability.ts | tasks 100% (5/5); matches steering |  | 100 | 5c611d3e |
| web-aigc-platform-runtime-engine | IMPLEMENTED_AND_VALID | server/core/workflow-runtime-engine.ts | tasks 100% (5/5); matches steering |  | 100 | 7f340078 |
| web-aigc-platform-security-governance | IMPLEMENTED_AND_VALID | server/routes/permissions.ts | tasks 100% (5/5); matches steering |  | 100 | 5c611d3e |
| web-aigc-platform-session-instance | IMPLEMENTED_AND_VALID | server/routes/workflows.ts | tasks 100% (9/9); matches steering |  | 100 | dea02b25 |
| workflow-artifacts-display | PARTIALLY_IMPLEMENTED | shared/mission/contracts.ts | tasks.md 26/27 checkboxes (96%) |  | 96 | ca8eb5b4 |
| workflow-decoupling | IMPLEMENTED_AND_VALID | client/src/lib/tasks-store.ts | tasks 100% (40/40); matches steering |  | 100 | ca8eb5b4 |
| workflow-engine | IMPLEMENTED_AND_VALID | server/db/index.ts | tasks 100% (61/61); matches steering |  | 100 | ca8eb5b4 |
| workflow-panel-decomposition | PARTIALLY_IMPLEMENTED | client/src/lib/workflow-store.ts | tasks.md 17/20 checkboxes (85%) |  | 85 | ca8eb5b4 |
| workspace-visual-unification | DESIGNED_NEVER_BUILT | .kiro/specs/workspace-visual-unification/requirements.md | no source path mentioned in spec exists in working tree |  | 100 | 46f6ffcf |

## Bucket explanations (anchored to design.md § 3. Classifier)

Each bucket below cites the worked example from `design.md § Components and Interfaces § 3. Classifier`. Rows in the table above were classified using the priority order from Req 5.2: **DUPLICATE > DRIFTED > PARTIALLY_IMPLEMENTED > IMPLEMENTED_AND_VALID > DESIGNED_NEVER_BUILT**.

### DUPLICATE

Worked example anchor: `office-wall-display-redesign` and `office-wall-display-redesign-v2` normalize to the same key under criterion 2 (`name_normalization`). The newer one is canonical (later `last_commit`); the older is bucketed `DUPLICATE`, `duplicate_of=office-wall-display-redesign-v2`. See `design.md § 3. Classifier — DUPLICATE`.

- `office-wall-display-redesign` → `duplicate_of=office-wall-display-redesign-v2` (duplicate cluster C-1158; criterion=name_normalization).

### DRIFTED

Worked example anchor: a spec that mandates renaming `MissionStore` to `DestinationStore` while steering project-overview.md § 2026-04-26 records compatibility-first non-rename. Detected here by a conservative keyword heuristic against `requirements.md`. See `design.md § 3. Classifier — DRIFTED`.

_No DRIFTED rows detected by the keyword heuristic in this snapshot._

### PARTIALLY_IMPLEMENTED

Worked example anchor: `office-task-cockpit` — `OfficeTaskCockpit.tsx` exists; `tasks.md` has unchecked items remaining. Bucket assigned when `tasks.md` exists, `0 < task_completion_pct < 100`, and ≥1 referenced source file resolves in the working tree. See `design.md § 3. Classifier — PARTIALLY_IMPLEMENTED`.

Total PARTIALLY_IMPLEMENTED rows: `9` (full list in main table).

### IMPLEMENTED_AND_VALID

Worked example anchor: `audit-chain` (L27) — execution-plan marks it merged, `server/audit/audit-chain.ts` exists, `tasks.md` fully checked, no steering contradiction. Bucket assigned when `tasks.md` is missing or `task_completion_pct == 100` AND ≥1 referenced source file exists AND no contradiction with steering. See `design.md § 3. Classifier — IMPLEMENTED_AND_VALID`.

Total IMPLEMENTED_AND_VALID rows: `157` (full list in main table).

### DESIGNED_NEVER_BUILT

Worked example anchor: `production-deployment` (L31) — `requirements.md` and `design.md` exist; no referenced source path resolvable in the tree. Default bucket when no other criterion fires. See `design.md § 3. Classifier — DESIGNED_NEVER_BUILT`.

Total DESIGNED_NEVER_BUILT rows: `122` (full list in main table).
