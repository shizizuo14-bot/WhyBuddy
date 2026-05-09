/**
 * `route-prompt.ts`：RouteSet LLM 的确定性 prompt 构造器。
 *
 * 对应 `.kiro/specs/autopilot-routeset-llm-generation/design.md` §4.4：
 *
 * - 导出稳定字符串常量 `ROUTE_SET_PROMPT_ID = "blueprint.routeset.v1"`，
 *   用作 provenance 追溯与回归测试锁定。
 * - 构造函数 `buildRouteSetPrompt(input)` 返回一份 `RouteSetPromptPayload`，
 *   `userMessage` 是 `JSON.stringify(userPayload, null, 2)` 的结果。
 * - 字段顺序、数组顺序固定：
 *   - `answers` 按 `questionId` 字典序排序；
 *   - `sources` / `assets` 按 `id` 字典序排序；
 *   - `githubUrls` 保留输入顺序。
 * - locale 分支（D6 选项 A）：
 *   - `locale === "zh-CN"` 时 system message 使用中文文案；
 *   - 其他情况（含 `"en-US"` 与未传）使用英文文案，必须以
 *     `"You are the /autopilot RouteSet planner"` 开头（测试 5.5 锁定）。
 *
 * 纯函数：不访问 `BlueprintServiceContext`、不调用 LLM，便于单测直接快照。
 */

import type {
  BlueprintClarificationAnswer,
  BlueprintClarificationSession,
  BlueprintDomainAsset,
  BlueprintGenerationRequest,
  BlueprintGithubSource,
  BlueprintIntake,
  BlueprintProjectDomainContext,
} from "../../../../shared/blueprint/index.js";

/**
 * RouteSet prompt 的版本标识。当 prompt 的结构（system/user payload 骨架、
 * schema 约束、outputSchema 描述）发生向后不兼容变化时递增到 `v2`；仅文案微
 * 调不构成 bump。
 */
export const ROUTE_SET_PROMPT_ID = "blueprint.routeset.v1";

export type RouteSetPromptLocale = "zh-CN" | "en-US";

export interface RouteSetPromptInput {
  request: BlueprintGenerationRequest;
  intake?: BlueprintIntake;
  clarificationSession?: BlueprintClarificationSession;
  projectContext?: BlueprintProjectDomainContext;
  locale?: RouteSetPromptLocale;
}

export interface RouteSetPromptPayload {
  /** 恒等于 `ROUTE_SET_PROMPT_ID`。 */
  promptId: string;
  /** LLM 的 system 消息文本，按 locale 分支产出中文或英文。 */
  systemMessage: string;
  /** LLM 的 user 消息文本，是 `userPayload` 的 JSON.stringify 结果。 */
  userMessage: string;
  /** 结构化 user payload，供测试与审计直接断言字段。 */
  userPayload: Record<string, unknown>;
}

const SYSTEM_MESSAGE_EN_US =
  "You are the /autopilot RouteSet planner. Given the user intake, clarification answers, " +
  "and optional GitHub context, produce structured route candidates as JSON. " +
  "Return exactly 1 primary route and 1 to 4 alternative routes. " +
  "Only return JSON, no prose.";

const SYSTEM_MESSAGE_ZH_CN =
  "你是 /autopilot 的 RouteSet 规划器。根据用户的 intake、澄清答案和可选 GitHub 上下文，" +
  "产出结构化 JSON 路线候选。返回恰好 1 条 primary 路线与 1 至 4 条 alternative 路线，" +
  "用中文填写 title / summary / rationale。只返回 JSON，不要返回任何额外文本。";

/**
 * 给定的 locale 输入 → 确定的 locale 分支。仅 `"zh-CN"` 走中文路径；未传
 * 或任何其他值都走英文路径（保持与需求 9.5 / D6 选项 A 的口径一致）。
 */
function resolveLocale(locale: RouteSetPromptLocale | undefined): RouteSetPromptLocale {
  return locale === "zh-CN" ? "zh-CN" : "en-US";
}

function buildSystemMessage(locale: RouteSetPromptLocale): string {
  return locale === "zh-CN" ? SYSTEM_MESSAGE_ZH_CN : SYSTEM_MESSAGE_EN_US;
}

function compareById<T extends { id: string }>(a: T, b: T): number {
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}

function compareByQuestionId(
  a: BlueprintClarificationAnswer,
  b: BlueprintClarificationAnswer,
): number {
  if (a.questionId < b.questionId) return -1;
  if (a.questionId > b.questionId) return 1;
  return 0;
}

function projectSource(source: BlueprintGithubSource): Record<string, unknown> {
  return {
    id: source.id,
    slug: source.slug,
    url: source.normalizedUrl,
  };
}

function projectAsset(asset: BlueprintDomainAsset): Record<string, unknown> {
  return {
    id: asset.id,
    title: asset.title,
    summary: asset.summary,
    tags: [...asset.tags],
  };
}

function projectAnswer(
  answer: BlueprintClarificationAnswer,
): Record<string, unknown> {
  return {
    questionId: answer.questionId,
    answer: answer.answer,
    routeDimension: answer.provenance?.routeDimension,
    readinessSignal: answer.provenance?.readinessSignal,
  };
}

function buildIntakeBlock(
  intake: BlueprintIntake | undefined,
  request: BlueprintGenerationRequest,
): Record<string, unknown> | undefined {
  if (!intake) {
    // 即便没有 intake 实体，也把 request 中显式提供的 targetText / githubUrls
    // 放入 payload，便于 LLM 拿到最基本的目标描述。
    const targetText = request.targetText;
    const githubUrls = request.githubUrls ?? [];
    if (targetText === undefined && githubUrls.length === 0) {
      return undefined;
    }
    return {
      targetText,
      githubUrls: [...githubUrls],
      sources: [],
      domainNotes: [],
      assets: [],
    };
  }

  const sources = [...intake.sources].sort(compareById).map(projectSource);
  const assets = [...intake.assets].sort(compareById).map(projectAsset);

  return {
    targetText: intake.targetText,
    githubUrls: [...intake.githubUrls],
    sources,
    domainNotes: [...intake.domainNotes],
    assets,
  };
}

function buildClarificationBlock(
  session: BlueprintClarificationSession | undefined,
): Record<string, unknown> | undefined {
  if (!session) return undefined;
  const answers = [...session.answers]
    .sort(compareByQuestionId)
    .map(projectAnswer);
  return {
    strategyId: session.strategyId,
    templateId: session.templateId,
    answers,
  };
}

function buildProjectContextBlock(
  context: BlueprintProjectDomainContext | undefined,
  request: BlueprintGenerationRequest,
): Record<string, unknown> | undefined {
  if (!context && !request.projectId && !request.sourceId) {
    return undefined;
  }
  return {
    projectId: context?.projectId ?? request.projectId,
    sourceId: request.sourceId,
    // `BlueprintProjectDomainContext` 当前没有 `domain` 字段，这里占位为
    // undefined 以保持 payload schema 稳定（design §4.4）。若未来接入域名
    // 摘要，可在 context 上追加而不破坏 prompt 结构。
    domain: undefined,
  };
}

/**
 * outputSchema 段用于提示 LLM：产出结构必须匹配 `BlueprintRouteCandidate`
 * 的核心字段（见 design §4.4）。这部分文本是确定性的纯字面量，输入变化不
 * 会改变它，保证在同一组其他输入下整体 `userMessage` 逐字节稳定。
 */
function buildOutputSchemaBlock(): Record<string, unknown> {
  return {
    routes: [
      {
        id: "string (route-level unique id within this RouteSet)",
        kind: "primary | alternative",
        title: "short label, e.g. 'Primary SPEC asset route'",
        summary: "1-2 sentence summary of the route",
        rationale:
          "why this route is a good fit for the intake + clarification",
        riskLevel: "low | medium | high",
        costLevel: "low | medium | high",
        complexity: "light | balanced | deep",
        estimatedEffort: "e.g. '1-3 analysis passes'",
        capabilities: [
          {
            id: "capability id, e.g. 'docker-analysis-sandbox'",
            label: "capability label",
            purpose: "1-sentence purpose",
            kind: "docker | mcp | aigc_node | skill | role",
          },
        ],
      },
    ],
  };
}

/**
 * 构造 RouteSet LLM 的确定性 prompt。
 *
 * 确定性保证：同一组 `(request, intake, clarificationSession, projectContext, locale)`
 * 必须产生逐字节相同的 `userMessage`。实现上靠以下不变量：
 *
 * 1. `userPayload` 的顶层字段顺序固定：`promptId` → `intake` → `clarification`
 *    → `projectContext` → `outputSchema`。
 * 2. 数组排序：`answers` 按 `questionId`；`sources` / `assets` 按 `id`；
 *    `githubUrls` / `domainNotes` / `tags` 保留输入顺序（用 spread 拷贝）。
 * 3. 可选字段缺失时直接置为 `undefined`，并通过 `JSON.stringify` 自动丢弃，
 *    不在序列化输出中留下占位。
 */
export function buildRouteSetPrompt(
  input: RouteSetPromptInput,
): RouteSetPromptPayload {
  const locale = resolveLocale(input.locale);
  const systemMessage = buildSystemMessage(locale);

  // 严格按照 design §4.4 定义的字段顺序构造对象：promptId 在最前，之后依次
  // 是 intake / clarification / projectContext / outputSchema。顶层的 key
  // 插入顺序就是序列化顺序。
  const userPayload: Record<string, unknown> = {
    promptId: ROUTE_SET_PROMPT_ID,
    intake: buildIntakeBlock(input.intake, input.request),
    clarification: buildClarificationBlock(input.clarificationSession),
    projectContext: buildProjectContextBlock(
      input.projectContext,
      input.request,
    ),
    outputSchema: buildOutputSchemaBlock(),
  };

  const userMessage = JSON.stringify(userPayload, null, 2);

  return {
    promptId: ROUTE_SET_PROMPT_ID,
    systemMessage,
    userMessage,
    userPayload,
  };
}
