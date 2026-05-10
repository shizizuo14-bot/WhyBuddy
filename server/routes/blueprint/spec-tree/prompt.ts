/**
 * Prompt construction for the SPEC Tree LLM generation service.
 *
 * Owns:
 * - `SPEC_TREE_PROMPT_ID` stable prompt version identifier.
 * - `SpecTreePromptPayload` type (promptId / systemMessage / userMessage /
 *   userPayload / promptFingerprint).
 * - `BuildSpecTreePromptInput` type (design §4.5).
 * - `buildSpecTreePrompt(input)` pure function producing a deterministic
 *   `SpecTreePromptPayload`.
 *
 * Locale-aware: zh-CN uses Chinese system prompt; all others use English.
 *
 * Determinism guarantees:
 * - `clarification.answers` sorted by `questionId` lexicographically.
 * - `primaryRoute.steps` preserves original order.
 * - `alternativeRoutes` preserves routeSet order.
 * - `githubUrls` preserves input order.
 * - `userPayload` uses fixed field order → `JSON.stringify` byte-stable.
 *
 * Import restrictions (design §2.D1 / task 5.6):
 * - Only `import type` for shared blueprint types.
 * - Only `node:crypto` for sha256.
 * - NO `callLLMJson`, `getAIConfig`, or `fetch`.
 *
 * See design §4.5, requirements 2.2, 2.4, 3.1, 3.2.
 */

import { createHash } from "node:crypto";

import type { BlueprintGenerationRequest } from "../../../../shared/blueprint/contracts.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const SPEC_TREE_PROMPT_ID = "blueprint.spec-tree.v1";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SpecTreePromptPayload {
  promptId: string;
  systemMessage: string;
  userMessage: string;
  userPayload: Record<string, unknown>;
  /** `"sha256:" + sha256Hex(systemMessage + "\n\n" + userMessage)` */
  promptFingerprint: string;
}

export interface BuildSpecTreePromptInput {
  request: BlueprintGenerationRequest;
  routeSet: {
    id: string;
    routes: Array<{ id: string; title: string; summary: string }>;
  };
  primaryRoute: {
    id: string;
    title: string;
    summary: string;
    rationale?: string;
    steps: Array<{ id: string; title: string; description: string; role: string }>;
    stagesSummary?: Array<{ stage: string; label: string }>;
    capabilities?: Array<{ id: string; label: string }>;
  };
  alternativeRoutes: Array<{ id: string; title: string; summary: string }>;
  clarificationSession?: {
    id?: string;
    strategyId?: string;
    templateId?: string;
    answers: Array<{ questionId: string; answer: string }>;
    locale?: string;
  };
  domainContext?: {
    projectId?: string;
    sourceId?: string;
    domain?: string;
    notes?: string;
  };
  aigcSpecNodeEvidence?: {
    subsystemsSummary: string;
    riskNoteCount: number;
  };
  locale: "zh-CN" | "en-US";
}

// ---------------------------------------------------------------------------
// System messages (locale-aware, covering 9 constraints from design §4.5)
// ---------------------------------------------------------------------------

const SYSTEM_MESSAGE_ZH_CN = `你是 /autopilot 管线中的 SPEC Tree 推理器。

给定用户的目标描述、澄清问答摘要、RouteSet 与所选主路线的 steps / stages 摘要、可选领域上下文与可选 AIGC-node 证据，请以 SPEC 资产树（SPEC Tree）的形式组织完成该主路线所需的节点蓝图，并以严格 JSON 形式返回。

约束：
1. 必须返回合法 JSON，不得包含 Markdown 代码块围栏、不得返回任何解释性前置文字。
2. JSON 根对象必须包含：
   - "nodes": 数组，长度 3 到 50 项。
3. 每个节点必须包含 id / title / summary / type / status / priority / dependencies / outputs / children；非 root 节点必须有 parentId。
4. id 匹配 /^[a-z][a-z0-9-]{0,63}$/；全树内唯一。
5. 恰好存在 1 个 type==="root" 节点；非 root 节点的 parentId 必须能解析到某个节点 id；树深度不超过 4 层；不得出现父子循环。
6. type 取值限定：root / route_step / alternative_route / spec_document / effect_preview / prompt_package / engineering_plan。
7. 不得引用外部 URL、真实邮箱、API 密钥字面量；敏感标识请抽象化。
8. 节点应围绕所选主路线的 steps / stages 展开；对 alternative routes 可选择性生成 alternative_route 节点，不强制生成。
9. 下游菜单层应产出 spec_document / effect_preview / prompt_package / engineering_plan 四类节点的一组或子集，作为后续阶段的承载锚点。`;

const SYSTEM_MESSAGE_EN_US = `You are the SPEC Tree reasoner inside the /autopilot pipeline.

Given the user's goal, clarification answers, the RouteSet with the selected primary route's steps / stages summary, optional domain context, and optional AIGC-node evidence, organise the node blueprint required to complete the primary route as a SPEC asset tree (SPEC Tree) and return it as strict JSON.

Constraints:
1. Return a single JSON object. Do NOT wrap in Markdown code fences. Do NOT include any prose before or after.
2. The root object MUST include:
   - "nodes": array of 3..50 entries.
3. Each node MUST include id / title / summary / type / status / priority / dependencies / outputs / children; non-root nodes MUST include parentId.
4. id MUST match /^[a-z][a-z0-9-]{0,63}$/ (lowercase kebab-case, up to 64 chars) and be UNIQUE across the entire tree.
5. Exactly 1 node with type==="root" MUST exist; every non-root node's parentId MUST resolve to another node's id; tree depth MUST NOT exceed 4 layers; no parent-child cycles allowed.
6. type MUST be one of: root / route_step / alternative_route / spec_document / effect_preview / prompt_package / engineering_plan.
7. Do NOT reference external URLs, real emails, or API key literals; abstract sensitive identifiers.
8. Nodes SHOULD be organised around the selected primary route's steps / stages; alternative_route nodes for other routes are optional.
9. The downstream menu layer SHOULD produce a subset of spec_document / effect_preview / prompt_package / engineering_plan nodes as anchors for subsequent stages.`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function buildSpecTreePrompt(
  input: BuildSpecTreePromptInput,
): SpecTreePromptPayload {
  const {
    request,
    routeSet,
    primaryRoute,
    alternativeRoutes,
    clarificationSession,
    domainContext,
    aigcSpecNodeEvidence,
    locale,
  } = input;

  // --- systemMessage (locale-aware) ---
  const systemMessage = locale === "zh-CN" ? SYSTEM_MESSAGE_ZH_CN : SYSTEM_MESSAGE_EN_US;

  // --- userPayload (deterministic, fixed field order per design §4.5) ---

  // primaryRoute.steps: preserve original order
  const steps = primaryRoute.steps.map((s) => ({
    id: s.id,
    title: s.title,
    description: s.description,
    role: s.role,
  }));

  // primaryRoute.stagesSummary: preserve input order
  const stagesSummary = primaryRoute.stagesSummary ?? [];

  // primaryRoute.capabilities: preserve input order
  const capabilities = primaryRoute.capabilities ?? [];

  // alternativeRoutes: preserve routeSet order (already filtered by caller)
  const altRoutes = alternativeRoutes.map((r) => ({
    id: r.id,
    title: r.title,
    summary: r.summary,
  }));

  // intake.githubUrls: preserve input order
  const githubUrls = request.githubUrls ?? [];

  // clarification: answers sorted by questionId lexicographic order
  const clarification = clarificationSession
    ? {
        strategyId: clarificationSession.strategyId,
        templateId: clarificationSession.templateId,
        answers: clarificationSession.answers
          .slice()
          .sort((a, b) => a.questionId.localeCompare(b.questionId))
          .map((a) => ({ questionId: a.questionId, answer: a.answer })),
      }
    : undefined;

  // projectContext: undefined when both projectId and sourceId are missing
  const projectContext =
    domainContext != null
      ? {
          projectId: domainContext.projectId,
          sourceId: domainContext.sourceId,
          domain: domainContext.domain,
          notes: domainContext.notes,
        }
      : undefined;

  // aigcSpecNodeEvidence: passthrough if present
  const evidence = aigcSpecNodeEvidence
    ? {
        subsystemsSummary: aigcSpecNodeEvidence.subsystemsSummary,
        riskNoteCount: aigcSpecNodeEvidence.riskNoteCount,
      }
    : undefined;

  // Construct userPayload with fixed field order (design §4.5):
  // { promptId, primaryRoute, alternativeRoutes, intake, clarification,
  //   projectContext, aigcSpecNodeEvidence, outputSchema }
  const userPayload: Record<string, unknown> = {
    promptId: SPEC_TREE_PROMPT_ID,
    primaryRoute: {
      id: primaryRoute.id,
      title: primaryRoute.title,
      summary: primaryRoute.summary,
      rationale: primaryRoute.rationale,
      steps,
      stagesSummary,
      capabilities,
    },
    alternativeRoutes: altRoutes,
    intake: {
      targetText: request.targetText,
      githubUrls,
      domainNotes: domainContext?.notes,
    },
    clarification,
    projectContext,
    aigcSpecNodeEvidence: evidence,
    outputSchema: {
      nodes:
        "array[3..50] of { id, parentId?, title, summary, type, status, priority, dependencies, outputs, children, metadata? }",
      "nodes[].id":
        "matches /^[a-z][a-z0-9-]{0,63}$/, unique, lowercase kebab-case",
      "nodes[].type":
        "one of: root, route_step, alternative_route, spec_document, effect_preview, prompt_package, engineering_plan",
      constraints:
        "exactly 1 root; tree depth <= 4; no cycles; all non-root parentId must resolve",
    },
  };

  // --- userMessage ---
  const userMessage = JSON.stringify(userPayload, null, 2);

  // --- promptFingerprint ---
  const promptFingerprint =
    "sha256:" + sha256Hex(systemMessage + "\n\n" + userMessage);

  return {
    promptId: SPEC_TREE_PROMPT_ID,
    systemMessage,
    userMessage,
    userPayload,
    promptFingerprint,
  };
}
