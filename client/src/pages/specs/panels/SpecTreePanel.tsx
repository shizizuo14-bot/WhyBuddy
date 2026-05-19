/**
 * `@/pages/specs/panels/SpecTreePanel` shim
 *
 * Canonical 位置在 `@/pages/autopilot/right-rail/panels/SpecTreePanel`。
 * 同时保留 `SpecTreeWorkbenchPanel` alias 以兼容历史 import。
 *
 * 对应 spec：`.kiro/specs/autopilot-right-rail-stage-panels/`
 * - 需求 1.4 / 6.1 / 8.1（canonical re-export；shim identity 对齐）
 * - 需求 9.1（不修改 `SpecTreeWorkbenchPanel.tsx`，通过 alias re-export 兼容）
 */

export { SpecTreePanel } from "@/pages/autopilot/right-rail/panels/SpecTreePanel";
export type { SpecTreePanelProps } from "@/pages/autopilot/right-rail/panels/SpecTreePanel";
// 兼容历史调用方：`SpecTreeWorkbenchPanel` 仍指向原外部组件
export { default as SpecTreeWorkbenchPanel } from "../SpecTreeWorkbenchPanel.js";
