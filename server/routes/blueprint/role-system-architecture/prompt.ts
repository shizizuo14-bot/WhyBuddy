/**
 * Prompt construction for the Role System Architecture capability bridge.
 *
 * Owns:
 * - `ROLE_ARCHITECTURE_PROMPT_ID` stable prompt version identifier.
 * - `buildRoleArchitecturePrompt(input)` pure function producing a
 *   deterministic `{ systemMessage, userMessage, promptId, promptFingerprint, userPayload }`.
 *
 * Locale-aware: zh-CN uses Chinese system prompt; all others use English.
 *
 * No runtime / business imports — only `node:crypto` is allowed.
 * No hardcoded model names, provider names, or API URLs.
 *
 * See design §4.5, requirements 2.2 / 2.3 / 2.6 / 2.8 / 7.2.
 */

import { createHash } from "node:crypto";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const ROLE_ARCHITECTURE_PROMPT_ID = "blueprint.role-architecture.v1";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RoleArchitecturePromptPayload {
  promptId: string;
  systemMessage: string;
  userMessage: string;
  userPayload: Record<string, unknown>;
  /** SHA-256 hex of `systemMessage + "\n\n" + userMessage`; written to provenance.promptFingerprint */
  promptFingerprint: string;
}

export interface BuildRoleArchitecturePromptInput {
  request: {
    targetText?: string;
    githubUrls?: string[];
    domainContext?: { domain?: string };
    projectId?: string;
    sourceId?: string;
  };
  clarificationSession?: {
    strategyId?: string;
    templateId?: string;
    answers: Array<{ questionId: string; answer: string }>;
    locale?: string;
  };
  route: {
    id: string;
    title: string;
    summary: string;
    steps: Array<{ title: string; description: string; role: string }>;
  };
  routeSet: {
    routes: Array<{ id: string; title: string; summary: string }>;
    stagesSummary?: Array<{ stage: string; label: string }>;
  };
  primaryRouteId: string;
  locale: "zh-CN" | "en-US";
}

// ---------------------------------------------------------------------------
// System messages (locale-aware)
// ---------------------------------------------------------------------------

const SYSTEM_MESSAGE_ZH_CN = `你是 /autopilot 沙箱派生管线中的 Role System Architecture 角色架构推理器。

给定用户的目标描述、澄清问答摘要、所选主路线的 steps / stages 摘要与可选领域上下文，请规划完成该路线所需的 Agent 角色车队，识别每个角色在哪些阶段活跃、负责什么职责、需要哪些权限，并以严格 JSON 形式返回。

约束：
1. 必须返回合法 JSON，不得包含 Markdown 代码块围栏、不得返回任何解释性前置文字。
2. JSON 根对象必须包含：
   - "roles": 数组，长度 1 到 9 项。每个角色必须包含：
     - "id": 字符串，必须匹配 /^[a-z][a-z0-9-]{0,63}$/（lowercase kebab-case，最多 64 字符），在 roles 数组内必须唯一。
     - "label": 字符串，1 到 80 字符；人可读短标签（例如 "Planner" / "数据工程师"）。
     - "responsibilities": 字符串数组，1 到 10 项，每项 1 到 200 字符；描述该角色在本次任务中的核心职责。
     - "activationStages": 字符串数组，1 到 10 项，每项 1 到 64 字符；取值应来自当前 primary route 的 stagesSummary 中的 stage 标识。
     - "permissions": 字符串数组（可选），0 到 10 项，每项 1 到 120 字符；该角色需要的权限范围摘要。
3. 不得引入其他顶层字段。不得引入 "group" 字段（由下游归类）。不得引用外部 URL。
4. 只基于用户提供的 intake / clarification / selectedRoute.steps / projectContext 内容进行推理；不得引入用户未提供的机密、外部 URL、真实邮箱、或 API 密钥字面量。如果角色职责中确有人名 / 邮箱 / 凭据风险，请用抽象描述（例如 "数据所有者" / "运行时密钥"）替代。
5. activationStages 必须尽量覆盖主路线所有相关阶段，以便下游按阶段驱动 role 状态切换。
6. 每个角色的 id 在整个 roles 数组中必须唯一，不得重复。`;

const SYSTEM_MESSAGE_EN_US = `You are the Role System Architecture reasoner inside the /autopilot sandbox derivation pipeline.

Given the user's goal, clarification answers, the selected primary route's steps / stages summary, and optional domain context, plan the Agent role fleet required to complete this route: identify which role is active in which stages, what each role is responsible for, and what permissions each needs. Return the result as strict JSON.

Constraints:
1. Return a single JSON object. Do NOT wrap in Markdown code fences. Do NOT include any prose before or after.
2. The root object MUST include:
   - "roles": array of 1..9 entries. Each role entry MUST include:
     - "id": string matching /^[a-z][a-z0-9-]{0,63}$/ (lowercase kebab-case, up to 64 chars), UNIQUE across the roles array.
     - "label": string, 1..80 chars; human-readable short label (e.g. "Planner", "Data engineer").
     - "responsibilities": string[] with 1..10 entries, each 1..200 chars; describe the role's core duties in this task.
     - "activationStages": string[] with 1..10 entries, each 1..64 chars; values should come from the primary route's stagesSummary stage identifiers.
     - "permissions": string[] (optional), 0..10 entries, each 1..120 chars; summarise the permissions this role needs.
3. Do NOT introduce additional top-level fields. Do NOT include a "group" field. Do NOT reference external URLs.
4. Reason ONLY from the provided intake / clarification / selectedRoute.steps / projectContext. Do NOT inject secrets, real emails, API keys, or hallucinated names. If a responsibility implies sensitive identifiers, abstract them (e.g. "data owner", "runtime secret").
5. activationStages MUST cover the primary route's relevant stages so that downstream can drive per-stage role state transitions.
6. Each role id MUST be unique across the entire roles array.`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function buildRoleArchitecturePrompt(
  input: BuildRoleArchitecturePromptInput,
): RoleArchitecturePromptPayload {
  const { request, clarificationSession, route, routeSet, primaryRouteId, locale } = input;

  // --- systemMessage (locale-aware) ---
  const systemMessage = locale === "zh-CN" ? SYSTEM_MESSAGE_ZH_CN : SYSTEM_MESSAGE_EN_US;

  // --- userPayload (deterministic, fixed field order) ---

  // selectedRoute.steps: passthrough input order, keep only title/description/role
  const steps = route.steps.map((s) => ({
    title: s.title,
    description: s.description,
    role: s.role,
  }));

  // selectedRoute.stagesSummary: preserve routeSet.stagesSummary input order
  const stagesSummary = routeSet.stagesSummary ?? [];

  // alternativeRoutes: exclude primaryRouteId, preserve input order, keep id/title/summary
  const alternativeRoutes = routeSet.routes
    .filter((r) => r.id !== primaryRouteId)
    .map((r) => ({
      id: r.id,
      title: r.title,
      summary: r.summary,
    }));

  // intake.githubUrls: preserve request.githubUrls ?? [] input order
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
    request.projectId != null || request.sourceId != null
      ? {
          projectId: request.projectId,
          sourceId: request.sourceId,
          domain: request.domainContext?.domain,
        }
      : undefined;

  // Construct userPayload with fixed field order
  const userPayload: Record<string, unknown> = {
    promptId: ROLE_ARCHITECTURE_PROMPT_ID,
    selectedRoute: {
      id: route.id,
      title: route.title,
      summary: route.summary,
      steps,
      stagesSummary,
    },
    alternativeRoutes,
    intake: {
      targetText: request.targetText,
      githubUrls,
      domainNotes: request.domainContext?.domain,
    },
    clarification,
    projectContext,
    outputSchema: {
      roles: "array[1..9] of { id, label, responsibilities, activationStages, permissions? }",
      "roles[].id": "matches /^[a-z][a-z0-9-]{0,63}$/, unique",
      "roles[].activationStages":
        "should come from selectedRoute.stagesSummary[].stage",
    },
  };

  // --- userMessage ---
  const userMessage = JSON.stringify(userPayload, null, 2);

  // --- promptFingerprint ---
  const promptFingerprint = "sha256:" + sha256Hex(systemMessage + "\n\n" + userMessage);

  return {
    promptId: ROLE_ARCHITECTURE_PROMPT_ID,
    systemMessage,
    userMessage,
    userPayload,
    promptFingerprint,
  };
}
