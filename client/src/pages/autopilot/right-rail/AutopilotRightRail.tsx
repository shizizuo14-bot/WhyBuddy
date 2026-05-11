/**
 * Autopilot 驾驶舱右栏 — `<AutopilotRightRail>`
 *
 * 2026-05-11 简化版:
 * - 删除 tab 栏、sticky pin、键盘快捷键
 * - fabric 阶段所有 8 个子阶段面板**从上到下全部渲染**,超出滚动
 * - 保留 scroll container + `data-sub-stage-anchor` + job.stage 推进时自动 scrollIntoView
 * - 保留 `data-sub-stage-placeholder` + `aria-current="step"` 以兼容 Spec 3 PBT 断言
 * - 底部固定 4 个指标卡(RailMetricsBlock)
 *
 * Spec 1 冻结的 `AutopilotRightRailProps` 契约不变;`onSubStageChange` 仍接受但本组件
 * 内部不再触发(无 tab 点击);外部 consumer 可继续传入。
 */

import { useEffect, useRef, type FC } from "react";

import {
  readPrefersReducedMotion,
  resolveScrollBehavior,
  scrollAnchorIntoView,
} from "./hooks/use-right-rail-sub-stage-state";
import {
  AgentCrewFabricPanel,
  ArtifactMemoryPanel,
  EffectPreviewPanel,
  EngineeringHandoffPanel,
  PromptPackagePanel,
  RuntimeCapabilityPanel,
  SpecDocumentsPanel,
  SpecTreePanel,
} from "./panels";
import { RailMetricsBlock } from "./rail-metrics-block";
import { resolveRailSubStage } from "./resolve-rail-sub-stage";
import {
  RAIL_SUB_STAGE_ORDER,
  type AutopilotRailSubStage,
  type AutopilotRightRailProps,
  type AutopilotTimelineStage,
} from "./types";

/**
 * Anchor 属性名。测试、组件、hook 共用同一常量。
 */
export const RAIL_SUB_STAGE_ANCHOR_ATTR = "data-sub-stage-anchor" as const;

const TIMELINE_STAGE_ORDER: readonly AutopilotTimelineStage[] = [
  "input",
  "clarification",
  "routeset",
  "selection",
  "fabric",
] as const;

const TIMELINE_STAGE_LABELS: Record<
  AutopilotTimelineStage,
  { "zh-CN": string; "en-US": string }
> = {
  input: { "zh-CN": "输入阶段", "en-US": "Input stage" },
  clarification: { "zh-CN": "澄清问答", "en-US": "Clarification" },
  routeset: { "zh-CN": "路线候选", "en-US": "Route set" },
  selection: { "zh-CN": "路线选择", "en-US": "Route selection" },
  fabric: {
    "zh-CN": "AgentCrewFabric 推演工作台",
    "en-US": "AgentCrewFabric workbench",
  },
};

function resolveAriaLabel(locale: AutopilotRightRailProps["locale"]): string {
  return locale === "zh-CN"
    ? "Autopilot 右栏工作台"
    : "Autopilot right rail workbench";
}

function renderSubStagePanel(params: {
  subStage: AutopilotRailSubStage;
  jobId: string;
  job: AutopilotRightRailProps["job"];
  agentCrew: AutopilotRightRailProps["agentCrew"];
  capabilities: AutopilotRightRailProps["capabilities"];
  capabilityInvocations: AutopilotRightRailProps["capabilityInvocations"];
  capabilityEvidence: AutopilotRightRailProps["capabilityEvidence"];
  specTree: AutopilotRightRailProps["specTree"];
  selection: AutopilotRightRailProps["selection"];
  effectPreviews: AutopilotRightRailProps["effectPreviews"];
  locale: AutopilotRightRailProps["locale"];
}) {
  const { subStage, jobId, job, agentCrew, capabilities, capabilityInvocations, capabilityEvidence, specTree, selection, effectPreviews, locale } = params;

  if (subStage === "agent_crew_fabric") {
    return <AgentCrewFabricPanel jobId={jobId} job={job} agentCrew={agentCrew} capabilities={capabilities} capabilityInvocations={capabilityInvocations} capabilityEvidence={capabilityEvidence} locale={locale} />;
  }
  if (subStage === "spec_tree") {
    return <SpecTreePanel jobId={jobId} specTree={specTree} selection={selection} locale={locale} />;
  }
  if (subStage === "spec_documents") {
    return <SpecDocumentsPanel jobId={jobId} specTree={specTree} locale={locale} />;
  }
  if (subStage === "effect_preview") {
    return <EffectPreviewPanel jobId={jobId} job={job} specTree={specTree} effectPreviews={effectPreviews} agentCrew={agentCrew} capabilityEvidence={capabilityEvidence} locale={locale} />;
  }
  if (subStage === "prompt_package") {
    return <PromptPackagePanel jobId={jobId} specTree={specTree} effectPreviews={effectPreviews} locale={locale} />;
  }
  if (subStage === "runtime_capability") {
    return <RuntimeCapabilityPanel jobId={jobId} specTree={specTree} capabilities={capabilities} capabilityInvocations={capabilityInvocations} capabilityEvidence={capabilityEvidence} agentCrew={agentCrew} locale={locale} />;
  }
  if (subStage === "engineering_handoff") {
    return <EngineeringHandoffPanel jobId={jobId} locale={locale} />;
  }
  if (subStage === "artifact_memory") {
    return <ArtifactMemoryPanel jobId={jobId} locale={locale} />;
  }
  return subStage satisfies never;
}

export const AutopilotRightRail: FC<AutopilotRightRailProps> = (props) => {
  const {
    jobId,
    currentStage,
    currentSubStage: currentSubStageFromProps,
    job,
    routeSet,
    selection,
    specTree,
    agentCrew,
    capabilities,
    capabilityInvocations,
    capabilityEvidence,
    effectPreviews,
    locale,
  } = props;

  const computedSubStage = resolveRailSubStage({ currentStage, job, selection, specTree, agentCrew });
  const activeSubStage: AutopilotRailSubStage | undefined =
    currentSubStageFromProps ?? computedSubStage ?? (currentStage === "fabric" ? RAIL_SUB_STAGE_ORDER[0] : undefined);

  // Auto-scroll to active sub-stage anchor when job.stage advances.
  const scrollRef = useRef<HTMLDivElement>(null);
  const firstMountRef = useRef<boolean>(true);

  useEffect(() => {
    if (currentStage !== "fabric" || !activeSubStage) return;
    const behavior = resolveScrollBehavior({
      isFirstMount: firstMountRef.current,
      prefersReducedMotion: readPrefersReducedMotion(),
    });
    scrollAnchorIntoView({
      container: scrollRef.current,
      anchorAttr: RAIL_SUB_STAGE_ANCHOR_ATTR,
      anchorValue: activeSubStage,
      behavior,
      block: "start",
    });
    if (firstMountRef.current) firstMountRef.current = false;
  }, [currentStage, activeSubStage]);

  return (
    <aside
      role="complementary"
      aria-label={resolveAriaLabel(locale)}
      data-testid="autopilot-right-rail"
      data-autopilot-stage={currentStage}
      data-autopilot-sub-stage={activeSubStage ?? ""}
    >
      {TIMELINE_STAGE_ORDER.map((stage) => {
        const labels = TIMELINE_STAGE_LABELS[stage];
        const label = labels[locale] ?? labels["en-US"];
        const isFabric = stage === "fabric";
        const isActive = stage === currentStage;

        if (!isFabric || currentStage !== "fabric") {
          return (
            <div key={stage} data-stage-placeholder={stage} data-active={isActive ? "true" : "false"}>
              <div>{label}</div>
            </div>
          );
        }

        // Fabric: all 8 panels rendered top-to-bottom, scrollable.
        return (
          <div key={stage} data-stage-placeholder={stage} data-active={isActive ? "true" : "false"}>
            <div className="mb-2 text-sm font-bold">{label}</div>
            <div
              ref={scrollRef}
              data-testid="autopilot-right-rail-scroll-container"
              className="relative h-[calc(100vh-220px)] overflow-y-auto space-y-4"
            >
              {RAIL_SUB_STAGE_ORDER.map((subStage) => {
                const isCurrent = subStage === activeSubStage;
                return (
                  <section
                    key={subStage}
                    {...{ [RAIL_SUB_STAGE_ANCHOR_ATTR]: subStage }}
                    data-sub-stage-placeholder={subStage}
                    aria-current={isCurrent ? "step" : undefined}
                    className="scroll-mt-4"
                  >
                    {renderSubStagePanel({
                      subStage,
                      jobId,
                      job,
                      agentCrew,
                      capabilities,
                      capabilityInvocations,
                      capabilityEvidence,
                      specTree,
                      selection,
                      effectPreviews,
                      locale,
                    })}
                  </section>
                );
              })}
            </div>
          </div>
        );
      })}
      <RailMetricsBlock
        locale={locale}
        routeSet={routeSet}
        selection={selection}
        specTree={specTree}
        agentCrew={agentCrew}
        effectPreviews={effectPreviews}
        capabilityEvidence={capabilityEvidence}
      />
    </aside>
  );
};

export default AutopilotRightRail;
