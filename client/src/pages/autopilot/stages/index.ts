/**
 * `client/src/pages/autopilot/stages/` barrel（wt3 任务 1、2，方案 B）。
 *
 * 当前只暴露 `AutopilotSpecTreeHandoffPanel`（selection stage），因为它是
 * 原 `AutopilotRoutePage.tsx` 中唯一已经 export 的阶段组件。其余 4 个 stage
 * 暂以 placeholder 常量占位，等物理抽离时填入真实 export。
 *
 * 对应需求 2.5、2.7、6.2。
 */

export { AutopilotSpecTreeHandoffPanel } from "./SelectionStage.js";
export { INPUT_STAGE_PLACEHOLDER } from "./InputStage.js";
export { CLARIFICATION_STAGE_PLACEHOLDER } from "./ClarificationStage.js";
export { ROUTESET_STAGE_PLACEHOLDER } from "./RouteSetStage.js";
export { FABRIC_STAGE_PLACEHOLDER } from "./FabricStage.js";
export { CONSOLE_PANEL_PLACEHOLDER } from "./ConsolePanel.js";
export { AUTOPILOT_VISUAL_STAGE_PLACEHOLDER } from "./AutopilotVisualStage.js";
export { AUTOPILOT_WORKFLOW_RAIL_PLACEHOLDER } from "./AutopilotWorkflowRail.js";
