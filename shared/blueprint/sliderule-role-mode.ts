/**
 * P6 · ROLES layer routing (D_GATE simple vs complex vs degraded).
 */

import type { V5CapabilityId } from "./contracts.js";
import type { V5SessionState } from "./v5-reasoning-state.js";

export type RoleMode = "simple" | "complex" | "degraded";

/** Capabilities routed through deliberation / brainstorm mini-sessions (S16). */
export const DELIBERATION_CAPABILITY_IDS = [
  "counter.argue",
  "critique.generate",
  "rebuttal.resolve",
  "synthesis.merge",
] as const satisfies readonly V5CapabilityId[];

export function isDeliberationCapability(capabilityId: string): boolean {
  return (DELIBERATION_CAPABILITY_IDS as readonly string[]).includes(capabilityId);
}

export function resolveRoleMode(state: V5SessionState, userText: string): RoleMode {
  if (state.roleMode === "degraded" || state.brainstormDegraded) return "degraded";
  if (
    typeof process !== "undefined" &&
    (process as { env?: Record<string, string> }).env?.SLIDERULE_BRAINSTORM_DEGRADE === "1"
  ) {
    return "degraded";
  }

  const t = `${state.goal?.text || ""} ${userText}`.toLowerCase();
  // 1) 显式协作意图关键词（保留）。
  if (/辩论|brainstorm|多角色|复杂|合规|审计|跨部门|平台化|多模块/.test(t)) {
    return "complex";
  }
  // 2) 覆盖率合约判为 complex 即触发多角色（去掉旧的 "≥4 产物" 硬门槛 ——
  //    那条门槛让 brainstorm 几乎不触发，Roles 形同虚设）。
  if (state.coverageContract?.mode === "complex") {
    return "complex";
  }
  // 3) 产品搭建类目标（SlideRule 主用例）默认走多角色面板：产品/架构/安全等视角天然受益。
  //    限定为"造东西"的名词 + 动词，避免在纯澄清/闲聊轮误触发。
  if (/工具|系统|应用|平台|产品|功能|服务|模块|网站|小程序|\bapp\b|tool|system|platform|feature|product|service/.test(t) &&
      /做|造|搭建|开发|实现|设计|构建|规划|推演|build|design|implement|plan/.test(t)) {
    return "complex";
  }
  return "simple";
}

export function shouldDegradeBrainstorm(state: V5SessionState, userText: string): boolean {
  return resolveRoleMode(state, userText) === "degraded";
}

/**
 * S16 · D_BO primer chain before standard BUS picks.
 * 复杂模式下 prime 多角色面板：critique.generate（complex 时由 deliberation-exec 跑成 3 角色面板）
 * → synthesis.merge（读面板多角色立场聚合 + 投票/分歧）→ 让 report.write 吃到结构化多视角上游。
 */
export function pickBrainstormChain(
  state: V5SessionState
): Array<{ capabilityId: V5CapabilityId; roleId: string }> {
  const recent = new Set(
    (state.capabilityRuns || []).slice(-12).map((r) => r.capabilityId as V5CapabilityId)
  );
  const picks: Array<{ capabilityId: V5CapabilityId; roleId: string }> = [];

  // 面板质疑（多角色立场 + 交叉质疑）。挑刺=auditor 作为面板发起者标签。
  if (!recent.has("critique.generate")) {
    picks.push({ capabilityId: "critique.generate", roleId: "挑刺" });
  }
  // 面板综合：聚合多角色立场 + 投票/分歧。
  if (!recent.has("synthesis.merge")) {
    picks.push({ capabilityId: "synthesis.merge", roleId: "综合" });
  }
  return picks;
}

/** @deprecated use pickBrainstormChain */
export function pickBrainstormPrimers(): Array<{
  capabilityId: "critique.generate";
  roleId: string;
}> {
  return [{ capabilityId: "critique.generate", roleId: "挑刺" }];
}

export function applyRoleModeToState(
  state: V5SessionState,
  userText: string
): V5SessionState {
  const mode = resolveRoleMode(state, userText);
  return { ...state, roleMode: mode };
}

export function markBrainstormDegraded(state: V5SessionState, reason: string): V5SessionState {
  return {
    ...state,
    roleMode: "degraded",
    brainstormDegraded: true,
    conversation: [
      ...(state.conversation || []),
      {
        id: `d-deg-${Date.now()}`,
        role: "system",
        text: `[D_DEG] brainstorm degraded → single agent: ${reason}`,
        timestamp: new Date().toISOString(),
      },
    ],
  };
}