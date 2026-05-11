/**
 * Autopilot 驾驶舱右栏 — Wave 2 / Spec 4 MiroFish 流式卡片布局单元测试
 *
 * 对应 spec：`.kiro/specs/autopilot-right-rail-streaming-layout/` 任务 9。
 *
 * 覆盖 4 个 case（与 tasks.md 对应）：
 *
 * - case 1：`activeSubStage="spec_tree"` + 数据就绪，断言同时存在
 *   `data-sub-stage-status="completed"` 与 `data-sub-stage-status="active"`；
 * - case 2：`activeSubStage="spec_tree"` + `specTree=null`，断言
 *   `data-sub-stage-status="pending"` + 「AWAITING UPSTREAM DATA」文案；
 * - case 3：`activeSubStage="agent_crew_fabric"`，断言未来 7 个子阶段不渲染
 *   （markup 不含 `data-sub-stage-placeholder="${future}"` 等 placeholder 字符串）；
 * - case 4：adapter wrapper 存在 — `activeSubStage="spec_tree"` 时 markup 含
 *   `data-panel-adapter="spec-tree"` 且 class 含 `autopilot-panel-adapter`。
 *
 * 测试约定：
 * - 统一用 `renderToStaticMarkup` + 字符串断言，避免引入 @testing-library/react 依赖；
 * - 对于 shared 契约类型沿用 sibling `fabric-dispatch.property.test.tsx` 的
 *   `as unknown as T` 约定，不复刻全量字段。
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type {
  BlueprintGenerationJob,
  BlueprintSpecTree,
} from "@shared/blueprint/contracts";
import type { BlueprintAgentCrewSnapshot } from "@/lib/blueprint-api";

import { AutopilotRightRail } from "../AutopilotRightRail";
import {
  RAIL_SUB_STAGE_ORDER,
  type AutopilotRailSubStage,
  type AutopilotRightRailProps,
} from "../types";

/**
 * 构造最小可渲染的 fabric 阶段 props。消费者按需覆盖 `specTree` / `agentCrew` 等字段。
 */
function makeProps(
  overrides: Partial<AutopilotRightRailProps> = {},
): AutopilotRightRailProps {
  return {
    jobId: "job-test",
    currentStage: "fabric",
    job: { id: "job-test", stage: "spec_tree" } as unknown as BlueprintGenerationJob,
    routeSet: null,
    selection: null,
    specTree: null,
    agentCrew: null,
    capabilities: [],
    capabilityInvocations: [],
    capabilityEvidence: [],
    effectPreviews: [],
    locale: "zh-CN",
    onSubStageChange: () => {
      /* noop */
    },
    ...overrides,
  };
}

const EMPTY_SPEC_TREE = {
  id: "spec-tree-test",
  nodes: [],
  documents: [],
} as unknown as BlueprintSpecTree;

const EMPTY_AGENT_CREW = {
  roleTimelines: [],
} as unknown as BlueprintAgentCrewSnapshot;

describe("AutopilotRightRail MiroFish cards (Spec 4)", () => {
  it("case 1: renders a completed card + an active card when activeSubStage=spec_tree and data is ready", () => {
    const markup = renderToStaticMarkup(
      <AutopilotRightRail
        {...makeProps({
          currentSubStage: "spec_tree",
          specTree: EMPTY_SPEC_TREE,
          agentCrew: EMPTY_AGENT_CREW,
        })}
      />,
    );

    // agent_crew_fabric 作为已完成段 → status="completed"
    expect(markup).toContain('data-sub-stage-status="completed"');
    // spec_tree 作为当前活跃段 + 数据就绪 → status="active"
    expect(markup).toContain('data-sub-stage-status="active"');
    // 活跃段 anchor 属性仍然在正确位置
    expect(markup).toContain('data-sub-stage-placeholder="spec_tree"');
    expect(markup).toMatch(
      /data-sub-stage-placeholder="spec_tree"[^>]*aria-current="step"/,
    );
  });

  it("case 2: renders a pending active card with AWAITING UPSTREAM DATA when specTree is null", () => {
    const markup = renderToStaticMarkup(
      <AutopilotRightRail
        {...makeProps({
          currentSubStage: "spec_tree",
          specTree: null,
        })}
        locale="en-US"
      />,
    );

    expect(markup).toContain('data-sub-stage-status="pending"');
    expect(markup).toContain("AWAITING UPSTREAM DATA");
    // spec_tree 仍然是 active sub-stage，anchor 属性保留
    expect(markup).toContain('data-sub-stage-placeholder="spec_tree"');
  });

  it("case 3: does not render any future sub-stages when activeSubStage=agent_crew_fabric", () => {
    const markup = renderToStaticMarkup(
      <AutopilotRightRail
        {...makeProps({
          job: { id: "job-test", stage: "agent_crew_fabric" } as unknown as BlueprintGenerationJob,
          currentSubStage: "agent_crew_fabric",
          agentCrew: EMPTY_AGENT_CREW,
        })}
      />,
    );

    // 起点子阶段作为 active 渲染
    expect(markup).toContain('data-sub-stage-placeholder="agent_crew_fabric"');

    // 未来 7 个子阶段不应出现在 markup 中（通过 placeholder 属性定位）
    const futureSubStages = RAIL_SUB_STAGE_ORDER.slice(1) as readonly AutopilotRailSubStage[];
    for (const sub of futureSubStages) {
      expect(markup).not.toContain(`data-sub-stage-placeholder="${sub}"`);
      expect(markup).not.toContain(`data-panel-adapter="${sub.replace(/_/g, "-")}"`);
    }
  });

  it("case 4: wraps spec_tree with autopilot-panel-adapter div", () => {
    const markup = renderToStaticMarkup(
      <AutopilotRightRail
        {...makeProps({
          currentSubStage: "spec_tree",
          specTree: EMPTY_SPEC_TREE,
          agentCrew: EMPTY_AGENT_CREW,
        })}
      />,
    );

    expect(markup).toContain('data-panel-adapter="spec-tree"');
    expect(markup).toContain("autopilot-panel-adapter");
  });
});
