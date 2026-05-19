/**
 * Autopilot 驾驶舱右栏子阶段面板 — Chrome strip 回归测试（Spec 5 / autopilot-sub-stage-panel-wrapping）
 *
 * 对应 spec：`.kiro/specs/autopilot-sub-stage-panel-wrapping/`
 * - 需求 1（剥离可改 6 个面板的外壳 chrome）
 * - 需求 6（新增视觉一致性测试）
 * - 任务 9（新增 `panel-chrome-strip.test.ts`）
 *
 * 本文件对 6 个可改面板（`AgentCrewFabricPanel` / `EffectPreviewPanel` / `PromptPackagePanel` /
 * `RuntimeCapabilityPanel` / `EngineeringHandoffPanel` / `ArtifactMemoryPanel`）各写 2 个 case：
 *
 * - `no rounded-[20px] wrapper`：断言 renderToStaticMarkup 后的 markup 不含 `rounded-[20px]`
 *   （Spec 4 的 `SubStageCard` 已经提供外壳，面板不应再渲染自己的 20px 圆角大容器）。
 * - `no counter badge / eyebrow header`：断言 markup 不含自带的计数头部 / eyebrow 文案，
 *   例如 `N 角色 / M 事件`（AgentCrewFabricPanel）或 `实现提示词包`（PromptPackagePanel 的 h3）等。
 *
 * 面板在 `!specTree` / `!agentCrew && roleTimelines.length === 0` 条件下会返回 `null`；
 * 因此测试中对有守卫的面板提供最小可渲染的桩数据（例如 `agentCrew` 带一个 role，或
 * `specTree` 带空节点数组）。useEffect 在 renderToStaticMarkup 中不执行，
 * 因此无需 mock `fetch` 相关 API。
 *
 * 备注：任务文本写作 `panel-chrome-strip.test.ts`，但由于测试文件需要 JSX 渲染面板，
 * 使用 `.test.tsx` 扩展以便 TypeScript 识别 JSX；vitest 会自动 pick 起来。
 */

import { renderToStaticMarkup } from "react-dom/server";

import { describe, expect, it } from "vitest";

import type {
  BlueprintAgentCrewSnapshot,
  BlueprintEffectPreviewSnapshot,
} from "@/lib/blueprint-api";
import type { BlueprintSpecTree } from "@shared/blueprint/contracts";

import { AgentCrewFabricPanel } from "@/pages/autopilot/right-rail/panels/AgentCrewFabricPanel";
import { ArtifactMemoryPanel } from "@/pages/autopilot/right-rail/panels/ArtifactMemoryPanel";
import { EffectPreviewPanel } from "@/pages/autopilot/right-rail/panels/EffectPreviewPanel";
import { EngineeringHandoffPanel } from "@/pages/autopilot/right-rail/panels/EngineeringHandoffPanel";
import { PromptPackagePanel } from "@/pages/autopilot/right-rail/panels/PromptPackagePanel";
import { RuntimeCapabilityPanel } from "@/pages/autopilot/right-rail/panels/RuntimeCapabilityPanel";

// ---------------------------------------------------------------------------
// Minimal stub fixtures — double-cast 宽化到业务类型，本测试只断言 markup
// ---------------------------------------------------------------------------

const stubAgentCrew = {
  stage: "runtime_capability",
  presence: [],
  roleTimelines: [
    {
      id: "role-1",
      roleId: "role-1",
      group: "planner",
      stage: "runtime_capability",
      state: "active",
      displayLabel: "Planner",
      displayName: "Planner",
      currentAction: "idle",
      capabilityIds: [],
      capabilityLabels: [],
      latestCapability: "",
      artifactIds: [],
      latestArtifact: "",
      evidenceIds: [],
      latestEvidence: "",
      entries: [],
    },
  ],
} as unknown as BlueprintAgentCrewSnapshot;

const stubSpecTree = {
  id: "tree-1",
  rootNodeId: "node-1",
  nodes: [],
  edges: [],
  documents: [],
} as unknown as BlueprintSpecTree;

const stubEffectPreviews: BlueprintEffectPreviewSnapshot[] = [];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("sub-stage panel chrome strip (Spec 5)", () => {
  describe("AgentCrewFabricPanel", () => {
    it("P1 - no rounded-[20px] wrapper", () => {
      const markup = renderToStaticMarkup(
        <AgentCrewFabricPanel
          jobId="job-1"
          job={null}
          agentCrew={stubAgentCrew}
          capabilities={[]}
          capabilityInvocations={[]}
          capabilityEvidence={[]}
          locale="zh-CN"
        />
      );
      expect(markup).toContain('data-testid="blueprint-agent-crew-surface"');
      expect(markup).not.toContain("rounded-[20px]");
    });

    it("P2 - no counter badge header (N roles / M events)", () => {
      const markup = renderToStaticMarkup(
        <AgentCrewFabricPanel
          jobId="job-1"
          job={null}
          agentCrew={stubAgentCrew}
          capabilities={[]}
          capabilityInvocations={[]}
          capabilityEvidence={[]}
          locale="zh-CN"
        />
      );
      // header 被剥掉，eyebrow / 计数徽章文案都不应再出现
      expect(markup).not.toContain("协作角色面板");
      expect(markup).not.toContain("智能体团队");
      expect(markup).not.toMatch(/\d+ 角色 \/ \d+ 事件/);
    });
  });

  describe("EffectPreviewPanel", () => {
    it("P1 - no rounded-[20px] wrapper", () => {
      const markup = renderToStaticMarkup(
        <EffectPreviewPanel
          jobId="job-1"
          job={null}
          specTree={stubSpecTree}
          effectPreviews={stubEffectPreviews}
          agentCrew={null}
          capabilityEvidence={[]}
          locale="zh-CN"
        />
      );
      expect(markup).toContain('data-testid="effect-preview-workbench"');
      expect(markup).not.toContain("rounded-[20px]");
    });

    it("P2 - no eyebrow header (已接受 SPEC 的效果预演 h3 removed)", () => {
      const markup = renderToStaticMarkup(
        <EffectPreviewPanel
          jobId="job-1"
          job={null}
          specTree={stubSpecTree}
          effectPreviews={stubEffectPreviews}
          agentCrew={null}
          capabilityEvidence={[]}
          locale="zh-CN"
        />
      );
      expect(markup).not.toContain("已接受 SPEC 的效果预演");
    });
  });

  describe("PromptPackagePanel", () => {
    it("P1 - no rounded-[20px] wrapper", () => {
      const markup = renderToStaticMarkup(
        <PromptPackagePanel
          jobId="job-1"
          specTree={stubSpecTree}
          effectPreviews={stubEffectPreviews}
          locale="zh-CN"
        />
      );
      expect(markup).toContain('data-testid="prompt-package-workbench"');
      expect(markup).not.toContain("rounded-[20px]");
    });

    it("P2 - no eyebrow header (实现提示词包 h3 + subtitle removed)", () => {
      const markup = renderToStaticMarkup(
        <PromptPackagePanel
          jobId="job-1"
          specTree={stubSpecTree}
          effectPreviews={stubEffectPreviews}
          locale="zh-CN"
        />
      );
      // 原 header subtitle 是本面板独有，目标节点 fallback 不会出现该文案
      expect(markup).not.toContain(
        "将已接受的 SPEC 资产和效果预演打包成可交给下游编码工具使用的实现提示词。"
      );
    });
  });

  describe("RuntimeCapabilityPanel", () => {
    it("P1 - no rounded-[20px] wrapper", () => {
      const markup = renderToStaticMarkup(
        <RuntimeCapabilityPanel
          jobId="job-1"
          specTree={stubSpecTree}
          capabilities={[]}
          capabilityInvocations={[]}
          capabilityEvidence={[]}
          agentCrew={null}
          locale="zh-CN"
        />
      );
      expect(markup).toContain(
        'data-testid="runtime-capability-bridge-workbench"'
      );
      expect(markup).not.toContain("rounded-[20px]");
    });

    it("P2 - no eyebrow header (运行时能力桥工作台 h3 removed)", () => {
      const markup = renderToStaticMarkup(
        <RuntimeCapabilityPanel
          jobId="job-1"
          specTree={stubSpecTree}
          capabilities={[]}
          capabilityInvocations={[]}
          capabilityEvidence={[]}
          agentCrew={null}
          locale="zh-CN"
        />
      );
      expect(markup).not.toContain("运行时能力桥工作台");
    });
  });

  describe("EngineeringHandoffPanel", () => {
    it("P1 - no rounded-[20px] wrapper", () => {
      const markup = renderToStaticMarkup(
        <EngineeringHandoffPanel jobId="job-1" locale="zh-CN" />
      );
      expect(markup).toContain('data-testid="engineering-landing-workbench"');
      expect(markup).not.toContain("rounded-[20px]");
    });

    it("P2 - no eyebrow header (工程落地工作台 h3 removed)", () => {
      const markup = renderToStaticMarkup(
        <EngineeringHandoffPanel jobId="job-1" locale="zh-CN" />
      );
      expect(markup).not.toContain("工程落地工作台");
    });
  });

  describe("ArtifactMemoryPanel", () => {
    it("P1 - no rounded-[20px] wrapper", () => {
      const markup = renderToStaticMarkup(
        <ArtifactMemoryPanel jobId="job-1" locale="zh-CN" />
      );
      expect(markup).toContain('data-testid="artifact-memory-workbench"');
      expect(markup).not.toContain("rounded-[20px]");
    });

    it("P2 - no eyebrow header (资产记忆与回放工作台 h3 removed)", () => {
      const markup = renderToStaticMarkup(
        <ArtifactMemoryPanel jobId="job-1" locale="zh-CN" />
      );
      expect(markup).not.toContain("资产记忆与回放工作台");
    });
  });
});
