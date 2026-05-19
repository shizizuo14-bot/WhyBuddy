import { describe, expect, it } from "vitest";

import * as launchExamples from "./launch-examples.js";
import * as promptOptimizer from "./prompt-optimizer.js";
import * as frontendModel from "./frontend-model.js";
import * as useCockpitModel from "./use-cockpit-model.js";
import * as useRoutePlan from "./use-route-plan.js";
import * as launchRouter from "./launch-router.js";
import * as barrel from "./index.js";

/**
 * wt2 任务 4：autopilot lib 归类的 re-export 视图 smoke 测试。
 */
describe("client/src/lib/autopilot re-export views", () => {
  it("launch-examples 导出 AUTOPILOT_LAUNCH_EXAMPLES", () => {
    expect(Array.isArray(launchExamples.AUTOPILOT_LAUNCH_EXAMPLES)).toBe(true);
    expect(typeof launchExamples.buildLaunchDestinationPreview).toBe(
      "function"
    );
  });

  it("prompt-optimizer 导出 builder 与 normalizer", () => {
    expect(
      typeof promptOptimizer.buildAutopilotPromptOptimizationMessages
    ).toBe("function");
    expect(typeof promptOptimizer.normalizeOptimizedAutopilotPrompt).toBe(
      "function"
    );
  });

  it("frontend-model 导出 normalize 函数", () => {
    expect(typeof frontendModel.normalizeFrontendAutopilotViewModel).toBe(
      "function"
    );
  });

  it("use-cockpit-model / use-route-plan 导出 hook", () => {
    expect(typeof useCockpitModel.useAutopilotCockpitModel).toBe("function");
    expect(typeof useRoutePlan.useAutopilotRoutePlan).toBe("function");
  });

  it("launch-router 导出 plan builder", () => {
    expect(typeof launchRouter.buildLaunchRoutePlan).toBe("function");
  });

  it("barrel 汇聚六件 autopilot lib 的代表性符号", () => {
    expect(Array.isArray(barrel.AUTOPILOT_LAUNCH_EXAMPLES)).toBe(true);
    expect(typeof barrel.buildAutopilotPromptOptimizationMessages).toBe(
      "function"
    );
    expect(typeof barrel.normalizeFrontendAutopilotViewModel).toBe("function");
    expect(typeof barrel.useAutopilotCockpitModel).toBe("function");
    expect(typeof barrel.useAutopilotRoutePlan).toBe("function");
    expect(typeof barrel.buildLaunchRoutePlan).toBe("function");
  });
});
