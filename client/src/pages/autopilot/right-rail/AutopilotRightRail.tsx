/**
 * Autopilot 驾驶舱右栏 — `<AutopilotRightRail>`（Wave 2 / Spec 4 MiroFish 流式卡片版）
 *
 * 对应 spec：`.kiro/specs/autopilot-right-rail-streaming-layout/`
 *
 * 重构要点：
 * - 删除旧的「8 个面板全量渲染 + scroll container + `data-sub-stage-anchor`」结构；
 * - 按 MiroFish 原图重写 fabric 分支为「流式 append 卡片栈」：
 *   - 已完成子阶段 → `<SubStageCard status="completed">` + `<MetricsRow>` + 可折叠展开详情；
 *   - 当前活跃子阶段 → `<SubStageCard status="active" | "pending">` + `<MetricsRow>` + 完整面板或
 *     `<PendingInlineState>`；
 *   - 未来尚未到达的子阶段不渲染（本 spec 的默认策略）；
 * - 消费 Wave 1 产物：
 *   - `<SubStageCard>` / `<StatusCapsule>` / `<MetricsRow>` primitives（Spec 2）；
 *   - `deriveSubStageSummary()` 派生器（Spec 3）；
 *   - `renderSubStagePanel()` 抽离文件（Spec 4 任务 1-2，负责把 `spec_tree` / `spec_documents`
 *     外包 `<div className="autopilot-panel-adapter">` 供 Spec 5 的 CSS 剥 chrome）。
 *
 * 契约保留：
 * - `AutopilotRightRailProps` 签名不变；
 * - `data-testid="autopilot-right-rail"` / `data-autopilot-stage` / `data-autopilot-sub-stage`
 *   位于根 `<aside>`；
 * - fabric stage 下活跃卡片同时带 `data-sub-stage-placeholder="${sub}"` 与 `aria-current="step"`，
 *   顺序由 `SubStageCard` 根节点的属性写出顺序保证（Spec 2 的 `anchorAttr` + `ariaCurrentStep`
 *   契约通道），以满足 `fabric-dispatch.property.test.tsx` 的正则断言；
 * - `<aside>` 额外带 `className="mirofish-rail"`，供 Spec 5 在
 *   `client/src/index.css` 的 `.mirofish-rail .autopilot-panel-adapter` 作用域下生效。
 *
 * 非目标：
 * - `onSubStageChange` prop 仍接受，但本组件内部不触发（无 tab 点击）；URL 同步等由父组件负责；
 * - 不引入新的 store / hook；不修改 panel wrapper 内部；
 * - 不保留 auto scrollIntoView / sticky pin / keyboard shortcut，那些旧行为已移除。
 */

import { useCallback, useState, type FC } from "react";

import type { AppLocale } from "@/lib/locale";

import {
  MetricsRow,
  SubStageCard,
} from "./primitives";
import { renderSubStagePanel } from "./render-sub-stage-panel";
import { resolveRailSubStage } from "./resolve-rail-sub-stage";
import { deriveSubStageSummary } from "./sub-stage-summary";
import {
  RAIL_SUB_STAGE_ORDER,
  type AutopilotRailSubStage,
  type AutopilotRightRailProps,
  type AutopilotTimelineStage,
} from "./types";

const TIMELINE_STAGE_ORDER: readonly AutopilotTimelineStage[] = [
  "input",
  "clarification",
  "routeset",
  "selection",
  "fabric",
] as const;

function resolveAriaLabel(locale: AppLocale): string {
  return locale === "zh-CN"
    ? "Autopilot 右栏工作台"
    : "Autopilot right rail workbench";
}

/**
 * Pending 内联态 — 当活跃子阶段的上游数据尚未到达（`dataReady === false`）时，在卡片 body
 * 位置渲染一段虚线框 + mono 小字说明，替代完整面板。
 */
const PendingInlineState: FC<{ locale: AppLocale; title: string }> = ({
  locale,
  title,
}) => {
  const isZh = locale === "zh-CN";
  return (
    <div
      data-testid="autopilot-sub-stage-pending-inline"
      className="mx-5 my-4 border border-dashed border-[#CCCCCC] bg-white px-4 py-6 text-center"
    >
      <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#999]">
        {isZh ? "· 等待上游数据 ·" : "· AWAITING UPSTREAM DATA ·"}
      </div>
      <div className="mt-2 font-mono text-[11px] leading-5 text-[#666]">
        {isZh
          ? `${title} 面板将在数据到达后渲染。`
          : `${title} panel will render once data arrives.`}
      </div>
    </div>
  );
};

/**
 * 单张已完成卡片。默认折叠，仅展示 `<MetricsRow>`；点击 toggle 后在下方追加渲染完整面板。
 */
const CompletedCard: FC<{
  sub: AutopilotRailSubStage;
  index: number;
  props: AutopilotRightRailProps;
  expanded: boolean;
  onToggle: () => void;
}> = ({ sub, index, props, expanded, onToggle }) => {
  const summary = deriveSubStageSummary(sub, props, props.locale);
  const panel = expanded
    ? renderSubStagePanel({
        subStage: sub,
        jobId: props.jobId,
        job: props.job,
        agentCrew: props.agentCrew,
        capabilities: props.capabilities,
        capabilityInvocations: props.capabilityInvocations,
        capabilityEvidence: props.capabilityEvidence,
        specTree: props.specTree,
        selection: props.selection,
        effectPreviews: props.effectPreviews,
        locale: props.locale,
      })
    : null;

  return (
    <SubStageCard
      index={index}
      title={summary.title}
      apiPath={summary.apiPath}
      summary={summary.summary}
      status="completed"
      expanded={expanded}
      onToggleExpanded={onToggle}
      locale={props.locale}
    >
      <MetricsRow metrics={summary.metrics} columns={3} />
      {panel}
    </SubStageCard>
  );
};

/**
 * 当前活跃卡片。默认展开完整面板；数据未就绪时渲染 `<PendingInlineState>` 占位。
 *
 * 通过 `anchorAttr` 把 `data-sub-stage-placeholder="${sub}"` 挂到 `SubStageCard` 根 `<article>`，
 * 并配合 `ariaCurrentStep` 渲染 `aria-current="step"`。两个属性在 Spec 2 的 `<SubStageCard>`
 * 内部按「spread anchorAttr → 直接写 aria-current」的顺序挂接，保证 HTML 中
 * `data-sub-stage-placeholder` 出现在 `aria-current` 之前，匹配 `fabric-dispatch.property.test.tsx`
 * 的正则断言。
 */
const ActiveCard: FC<{
  sub: AutopilotRailSubStage;
  index: number;
  props: AutopilotRightRailProps;
}> = ({ sub, index, props }) => {
  const summary = deriveSubStageSummary(sub, props, props.locale);
  const status = summary.dataReady ? "active" : "pending";
  const body = summary.dataReady
    ? renderSubStagePanel({
        subStage: sub,
        jobId: props.jobId,
        job: props.job,
        agentCrew: props.agentCrew,
        capabilities: props.capabilities,
        capabilityInvocations: props.capabilityInvocations,
        capabilityEvidence: props.capabilityEvidence,
        specTree: props.specTree,
        selection: props.selection,
        effectPreviews: props.effectPreviews,
        locale: props.locale,
      })
    : <PendingInlineState locale={props.locale} title={summary.title} />;

  return (
    <SubStageCard
      index={index}
      title={summary.title}
      apiPath={summary.apiPath}
      summary={summary.summary}
      status={status}
      anchorAttr={{
        name: "data-sub-stage-placeholder",
        value: sub,
      }}
      ariaCurrentStep
      locale={props.locale}
    >
      <MetricsRow metrics={summary.metrics} columns={3} />
      {body}
    </SubStageCard>
  );
};

/**
 * Fabric 分支的流式卡片栈。
 *
 * - `completed` = `RAIL_SUB_STAGE_ORDER.slice(0, activeIndex)`
 * - 若 `activeSubStage === undefined`（理论上 fabric 分支不会发生），降级为空完成栈 + 无活跃卡。
 * - 容器作为 `data-stage-placeholder="fabric" data-active="true"` 的承载节点，承接 TIMELINE_STAGE_ORDER
 *   的 fabric 位。
 */
const FabricCardStream: FC<{
  activeSubStage: AutopilotRailSubStage | undefined;
  props: AutopilotRightRailProps;
}> = ({ activeSubStage, props }) => {
  const [expanded, setExpanded] = useState<
    Partial<Record<AutopilotRailSubStage, boolean>>
  >({});

  const toggle = useCallback((sub: AutopilotRailSubStage) => {
    setExpanded((prev) => ({ ...prev, [sub]: !prev[sub] }));
  }, []);

  const activeIndex =
    activeSubStage !== undefined
      ? RAIL_SUB_STAGE_ORDER.indexOf(activeSubStage)
      : -1;
  const completed =
    activeIndex > 0 ? RAIL_SUB_STAGE_ORDER.slice(0, activeIndex) : [];

  return (
    <div
      data-stage-placeholder="fabric"
      data-active="true"
      className="space-y-4 bg-[#FAFAFA] px-5 py-5"
    >
      {completed.map((sub) => (
        <CompletedCard
          key={sub}
          sub={sub}
          index={RAIL_SUB_STAGE_ORDER.indexOf(sub)}
          props={props}
          expanded={expanded[sub] === true}
          onToggle={() => toggle(sub)}
        />
      ))}
      {activeSubStage ? (
        <ActiveCard
          key={activeSubStage}
          sub={activeSubStage}
          index={RAIL_SUB_STAGE_ORDER.indexOf(activeSubStage)}
          props={props}
        />
      ) : null}
    </div>
  );
};

export const AutopilotRightRail: FC<AutopilotRightRailProps> = (props) => {
  const {
    currentStage,
    currentSubStage: currentSubStageFromProps,
    job,
    selection,
    specTree,
    agentCrew,
    locale,
  } = props;

  const computedSubStage = resolveRailSubStage({
    currentStage,
    job,
    selection,
    specTree,
    agentCrew,
  });
  const activeSubStage: AutopilotRailSubStage | undefined =
    currentSubStageFromProps ??
    computedSubStage ??
    (currentStage === "fabric" ? RAIL_SUB_STAGE_ORDER[0] : undefined);

  return (
    <aside
      role="complementary"
      aria-label={resolveAriaLabel(locale)}
      data-testid="autopilot-right-rail"
      data-autopilot-stage={currentStage}
      data-autopilot-sub-stage={activeSubStage ?? ""}
      className="mirofish-rail"
    >
      {TIMELINE_STAGE_ORDER.map((stage) => {
        const isFabric = stage === "fabric";
        const isActive = stage === currentStage;

        if (!isFabric) {
          return (
            <div
              key={stage}
              data-stage-placeholder={stage}
              data-active={isActive ? "true" : "false"}
            />
          );
        }

        // fabric
        if (currentStage !== "fabric") {
          return (
            <div
              key={stage}
              data-stage-placeholder="fabric"
              data-active="false"
            />
          );
        }

        return (
          <FabricCardStream
            key={stage}
            activeSubStage={activeSubStage}
            props={props}
          />
        );
      })}
    </aside>
  );
};

export default AutopilotRightRail;
