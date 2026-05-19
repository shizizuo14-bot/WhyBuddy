/**
 * `@/pages/specs/panels/EffectPreviewPanel` shim
 *
 * Canonical 位置在 `@/pages/autopilot/right-rail/panels/EffectPreviewPanel`。
 *
 * 对应 spec：`.kiro/specs/autopilot-right-rail-stage-panels/`
 * - 需求 1.4 / 6.1 / 8.1（canonical re-export；shim identity 对齐）
 * - 需求 2.4（`EffectPreviewPanel` 只接受 `{ jobId, job, specTree, effectPreviews,
 *   agentCrew, capabilityEvidence, locale }` + 面板私有字段
 *   `documents / initialPreviews / onPreviewsChange`）
 */

export { EffectPreviewPanel } from "@/pages/autopilot/right-rail/panels/EffectPreviewPanel";
export type { EffectPreviewPanelProps } from "@/pages/autopilot/right-rail/panels/EffectPreviewPanel";
