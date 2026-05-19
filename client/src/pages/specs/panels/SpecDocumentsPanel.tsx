/**
 * `@/pages/specs/panels/SpecDocumentsPanel` shim
 *
 * Canonical 位置在 `@/pages/autopilot/right-rail/panels/SpecDocumentsPanel`。
 * 同时保留 `SpecDocumentWorkbenchPanel` alias 以兼容历史 import。
 *
 * 对应 spec：`.kiro/specs/autopilot-right-rail-stage-panels/`
 * - 需求 1.4 / 6.1 / 8.1（canonical re-export；shim identity 对齐）
 * - 需求 9.2（不修改 `SpecDocumentWorkbenchPanel.tsx`，通过 alias re-export 兼容）
 */

export { SpecDocumentsPanel } from "@/pages/autopilot/right-rail/panels/SpecDocumentsPanel";
export type { SpecDocumentsPanelProps } from "@/pages/autopilot/right-rail/panels/SpecDocumentsPanel";
// 兼容历史调用方：`SpecDocumentWorkbenchPanel` 仍指向原外部组件
export { default as SpecDocumentWorkbenchPanel } from "../SpecDocumentWorkbenchPanel.js";
