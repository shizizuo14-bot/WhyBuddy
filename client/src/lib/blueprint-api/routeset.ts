/**
 * Blueprint SDK 子域 5：RouteSet & SPEC Tree（方案 B）。
 *
 * 对应需求 2.1 子域 5、2.3、4.1、4.3、4.4、6.4。
 */

export {
  selectBlueprintRoute,
  resetBlueprintRouteSelection,
  updateBlueprintSpecTreeNode,
  saveBlueprintSpecTreeVersion,
  runBlueprintSpecTreeAction,
} from "../blueprint-api.js";

export type {
  SelectBlueprintRouteResult,
  ResetBlueprintRouteSelectionResult,
  UpdateBlueprintSpecTreeNodeResult,
  SaveBlueprintSpecTreeVersionResult,
  RunBlueprintSpecTreeActionResult,
} from "../blueprint-api.js";
