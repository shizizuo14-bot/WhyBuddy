/**
 * `client/src/pages/specs/panels/` barrel（wt4 任务 1，方案 B）。
 *
 * SpecTreePanel 与 SpecDocumentsPanel 是 re-export 已经存在的外部工作台面板；
 * 其余 9 个 panel 因为实物还内联在 BlueprintProgressPanel.tsx，用占位常量标记。
 *
 * 对应需求 2.6、2.7、6.2。
 */

export { SpecTreeWorkbenchPanel } from "./SpecTreePanel.js";
export { SpecDocumentWorkbenchPanel } from "./SpecDocumentsPanel.js";

export { PROGRESS_HEADER_PANEL_PLACEHOLDER } from "./ProgressHeaderPanel.js";
export { JOB_LEDGER_PANEL_PLACEHOLDER } from "./JobLedgerPanel.js";
export { EFFECT_PREVIEW_PANEL_PLACEHOLDER } from "./EffectPreviewPanel.js";
export { PROMPT_PACKAGE_PANEL_PLACEHOLDER } from "./PromptPackagePanel.js";
export { RUNTIME_CAPABILITY_PANEL_PLACEHOLDER } from "./RuntimeCapabilityPanel.js";
export { ENGINEERING_LANDING_PANEL_PLACEHOLDER } from "./EngineeringLandingPanel.js";
export { ARTIFACT_MEMORY_PANEL_PLACEHOLDER } from "./ArtifactMemoryPanel.js";
export { ROUTE_CANDIDATE_CARD_PLACEHOLDER } from "./RouteCandidateCard.js";
export { RUNTIME_PROJECTION_CARD_PLACEHOLDER } from "./RuntimeProjectionCard.js";
