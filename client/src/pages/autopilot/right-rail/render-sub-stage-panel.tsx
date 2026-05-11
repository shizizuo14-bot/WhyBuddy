/**
 * Autopilot 驾驶舱右栏 — `renderSubStagePanel` 纯派发函数（Wave 2 / Spec 4 任务 1-2）
 *
 * 对应 spec：`.kiro/specs/autopilot-right-rail-streaming-layout/`
 *
 * 本文件从 `AutopilotRightRail.tsx` 抽离原内联 `renderSubStagePanel` 分支，职责：
 *
 * - 根据 `subStage` 把对应的 canonical panel wrapper（`AgentCrewFabricPanel` /
 *   `SpecTreePanel` / ... 共 8 个）实例化；
 * - 为 `SpecTreePanel` 与 `SpecDocumentsPanel` 外层包一层 `<div className="autopilot-panel-adapter">`，
 *   供 Spec 5 `autopilot-sub-stage-panel-wrapping` 在 `client/src/index.css` 中的
 *   `.mirofish-rail .autopilot-panel-adapter` 选择器剥掉 `SpecTreeWorkbenchPanel` /
 *   `SpecDocumentsWorkbenchPanel` 自带的 rounded / bg chrome。其余 6 个 sub-stage 的
 *   panel wrapper 由 Spec 5 直接修改内部样式，无需外包 adapter。
 *
 * 硬性约束：
 * - 参数签名必须与 `AutopilotRightRail.tsx` 原内联版本完全一致，迁移过程零行为变更；
 * - 不 import `@/lib/store` 或任何 hook，保持纯派发函数语义；
 * - adapter CSS class 名 `autopilot-panel-adapter` 与 `data-panel-adapter` 属性值必须与
 *   Spec 5 在 `client/src/index.css` 中的选择器字符串保持一致，二者之间是本次 Wave 2
 *   的唯一跨 spec 约定。
 */

import type { ReactNode } from "react";

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
import type {
  AutopilotRailSubStage,
  AutopilotRightRailProps,
} from "./types";

export interface RenderSubStagePanelParams {
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
}

export function renderSubStagePanel(
  params: RenderSubStagePanelParams,
): ReactNode {
  const {
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
  } = params;

  if (subStage === "agent_crew_fabric") {
    return (
      <AgentCrewFabricPanel
        jobId={jobId}
        job={job}
        agentCrew={agentCrew}
        capabilities={capabilities}
        capabilityInvocations={capabilityInvocations}
        capabilityEvidence={capabilityEvidence}
        locale={locale}
      />
    );
  }

  if (subStage === "spec_tree") {
    // 外包 adapter：Spec 5 在 index.css 的 `.mirofish-rail .autopilot-panel-adapter`
    // 作用域下剥掉 `SpecTreeWorkbenchPanel` 自带的 rounded / bg / border chrome，
    // 让它与 MiroFish 卡片外壳保持 0 半径与透明背景。
    return (
      <div
        className="autopilot-panel-adapter"
        data-panel-adapter="spec-tree"
      >
        <SpecTreePanel
          jobId={jobId}
          specTree={specTree}
          selection={selection}
          locale={locale}
        />
      </div>
    );
  }

  if (subStage === "spec_documents") {
    // 外包 adapter：与 spec_tree 分支同理，交给 Spec 5 的 CSS 剥 chrome。
    return (
      <div
        className="autopilot-panel-adapter"
        data-panel-adapter="spec-documents"
      >
        <SpecDocumentsPanel
          jobId={jobId}
          specTree={specTree}
          locale={locale}
        />
      </div>
    );
  }

  if (subStage === "effect_preview") {
    return (
      <EffectPreviewPanel
        jobId={jobId}
        job={job}
        specTree={specTree}
        effectPreviews={effectPreviews}
        agentCrew={agentCrew}
        capabilityEvidence={capabilityEvidence}
        locale={locale}
      />
    );
  }

  if (subStage === "prompt_package") {
    return (
      <PromptPackagePanel
        jobId={jobId}
        specTree={specTree}
        effectPreviews={effectPreviews}
        locale={locale}
      />
    );
  }

  if (subStage === "runtime_capability") {
    return (
      <RuntimeCapabilityPanel
        jobId={jobId}
        specTree={specTree}
        capabilities={capabilities}
        capabilityInvocations={capabilityInvocations}
        capabilityEvidence={capabilityEvidence}
        agentCrew={agentCrew}
        locale={locale}
      />
    );
  }

  if (subStage === "engineering_handoff") {
    return <EngineeringHandoffPanel jobId={jobId} locale={locale} />;
  }

  if (subStage === "artifact_memory") {
    return <ArtifactMemoryPanel jobId={jobId} locale={locale} />;
  }

  return subStage satisfies never;
}
