/**
 * `autopilot-agent-driven-pipeline` spec Task 3：Agent Output Validator。
 *
 * 验证 Agent 产出是否符合 BlueprintRouteSet schema，并补齐宿主侧字段。
 * 验证失败返回 null，不抛错。
 */

import type {
  BlueprintRouteCandidate,
  BlueprintRouteSet,
} from "../../../../shared/blueprint/index.js";

/** Agent 输出的 JSON Schema 常量（用于 DelegateInput.outputSchema）。 */
export const BlueprintRouteSetOutputSchema: Record<string, unknown> = {
  type: "object",
  required: ["routes"],
  properties: {
    routes: {
      type: "array",
      minItems: 2,
      maxItems: 5,
      items: {
        type: "object",
        required: ["title", "summary", "kind"],
        properties: {
          title: { type: "string" },
          summary: { type: "string" },
          kind: { type: "string", enum: ["primary", "alternative"] },
          complexity: { type: "string" },
          riskLevel: { type: "string" },
          costLevel: { type: "string" },
        },
      },
    },
  },
};

/**
 * 验证并规范化 Agent 产出为 BlueprintRouteSet。
 *
 * @param raw Agent 产出的任意值
 * @param request 原始请求（用于 provenance）
 * @param routeSetId 宿主侧生成的 routeSet ID
 * @param primaryRouteId 宿主侧生成的 primary route ID
 * @param createdAt ISO 时间戳
 * @returns 合法时返回补齐宿主字段的 BlueprintRouteSet；非法时返回 null
 */
export function validateAndNormalizeAgentRouteSetOutput(
  raw: unknown,
  request: { targetText?: string; githubUrls?: string[]; projectId?: string; sourceId?: string; clarificationSessionId?: string },
  routeSetId: string,
  primaryRouteId: string,
  createdAt: string,
): BlueprintRouteSet | null {
  try {
    if (!raw || typeof raw !== "object") return null;

    const payload = raw as Record<string, unknown>;
    const routes = payload.routes;
    if (!Array.isArray(routes)) return null;
    if (routes.length < 2 || routes.length > 5) return null;

    // 验证每条路线的基本结构
    const validatedRoutes: BlueprintRouteCandidate[] = [];
    let primaryCount = 0;

    for (let i = 0; i < routes.length; i++) {
      const route = routes[i];
      if (!route || typeof route !== "object") return null;

      const r = route as Record<string, unknown>;
      if (typeof r.title !== "string" || !r.title.trim()) return null;
      if (typeof r.summary !== "string" || !r.summary.trim()) return null;
      if (typeof r.kind !== "string") return null;

      const kind = r.kind === "primary" ? "primary" : "alternative";
      if (kind === "primary") primaryCount++;

      // 构建 RouteCandidate（最小必要字段）
      const routeId = kind === "primary"
        ? primaryRouteId
        : `${routeSetId}:alternative-${i}`;

      validatedRoutes.push({
        id: routeId,
        title: r.title as string,
        summary: r.summary as string,
        kind,
        complexity: typeof r.complexity === "string" ? r.complexity : "medium",
        riskLevel: typeof r.riskLevel === "string" ? r.riskLevel : "medium",
        costLevel: typeof r.costLevel === "string" ? r.costLevel : "medium",
        capabilities: [],
        steps: [],
        outputs: [],
      } as unknown as BlueprintRouteCandidate);
    }

    // 必须恰好 1 条 primary
    if (primaryCount !== 1) return null;

    const routeSet: BlueprintRouteSet = {
      id: routeSetId,
      requestId: routeSetId,
      createdAt,
      primaryRouteId,
      routes: validatedRoutes,
      nextAsset: {
        type: "spec_tree",
        menu: "deduction",
        description:
          "Use the selected RouteSet path as the source asset for the Deduction menu and SPEC tree workbench.",
      },
      provenance: {
        projectId: request.projectId,
        sourceId: request.sourceId,
        targetText: request.targetText,
        githubUrls: request.githubUrls ?? [],
        clarificationSessionId: request.clarificationSessionId,
        generationSource: "llm",
      },
    };

    return routeSet;
  } catch {
    return null;
  }
}
