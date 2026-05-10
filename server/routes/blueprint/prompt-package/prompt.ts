/**
 * Locale-aware, deterministic prompt builder for the Prompt Package LLM
 * generator. Same input → byte-identical userMessage + promptFingerprint.
 *
 * Per design §4.5 / requirements 2.3 / 2.4 / 2.5 / 3.1 / 3.2:
 * - `PROMPT_PACKAGE_PROMPT_ID` is the stable version identifier, written into
 *   `BlueprintImplementationPromptPackage.provenance.promptId`.
 * - `buildPromptPackagePrompt` is pure: no runtime business imports, no network,
 *   no model/provider hard-coding.
 * - Only runtime dependency allowed is `node:crypto` for SHA-256 fingerprinting.
 *
 * The `userPayload` object literal uses a fixed key insertion order
 * (`USER_PAYLOAD_KEY_ORDER`) so that `JSON.stringify(..., null, 2)` produces
 * byte-identical output across repeated calls with the same input.
 *
 * Sorting guarantees (determinism):
 * - `nodes` / `sourceDocuments` / `sourcePreviews` sorted by `id` lexicographic
 * - `clarification.answers` sorted by `questionId` lexicographic
 * - `capabilityInvocations` / `capabilityEvidence` sorted by `id` lexicographic
 * - `primaryRoute.steps` preserves original order
 * - `githubUrls` preserves input order
 *
 * Import constraints (design §D1 / task 5.6):
 * - NO `callLLMJson` / `getAIConfig` / module-level `fetch`
 * - Only `import type` for shared blueprint types
 * - One sha256 pure helper (node:crypto)
 */

import { createHash } from "node:crypto";

import type {
  BlueprintCapabilityEvidence,
  BlueprintCapabilityInvocation,
  BlueprintClarificationSession,
  BlueprintEffectPreview,
  BlueprintGenerationJob,
  BlueprintImplementationPromptTargetPlatform,
  BlueprintProjectDomainContext,
  BlueprintRouteCandidate,
  BlueprintSpecDocument,
  BlueprintSpecTree,
  BlueprintSpecTreeNode,
} from "../../../../shared/blueprint/index.js";

export const PROMPT_PACKAGE_PROMPT_ID = "blueprint.prompt-package.v1";

export interface PromptPackagePromptPayload {
  promptId: string;
  systemMessage: string;
  userMessage: string;
  /** Deterministic object used to render userMessage; exposed for tests. */
  userPayload: Record<string, unknown>;
  /** SHA-256 hex of systemMessage + "\n\n" + userMessage, formatted as "sha256:<hex>". */
  promptFingerprint: string;
}

export interface BuildPromptPackagePromptInput {
  job: BlueprintGenerationJob;
  specTree: BlueprintSpecTree;
  targetPlatform: BlueprintImplementationPromptTargetPlatform;
  nodes: BlueprintSpecTreeNode[];
  sourceDocuments: BlueprintSpecDocument[];
  sourcePreviews: BlueprintEffectPreview[];
  primaryRoute?: BlueprintRouteCandidate;
  clarificationSession?: BlueprintClarificationSession;
  domainContext?: BlueprintProjectDomainContext;
  capabilityInvocations?: BlueprintCapabilityInvocation[];
  capabilityEvidence?: BlueprintCapabilityEvidence[];
  includeDrafts: boolean;
  includePreviewDrafts: boolean;
  locale: "zh-CN" | "en-US";
}

/**
 * Explicit key order for the userPayload object to guarantee deterministic
 * JSON.stringify output. Node's JSON.stringify writes keys in insertion order.
 * This constant documents the canonical order; the implementation below
 * inserts keys in this exact sequence.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const USER_PAYLOAD_KEY_ORDER = {
  promptId: 0,
  targetPlatform: 1,
  nodes: 2,
  sourceDocuments: 3,
  sourcePreviews: 4,
  primaryRoute: 5,
  intake: 6,
  clarification: 7,
  projectContext: 8,
  upstreamEvidence: 9,
  includeDrafts: 10,
  includePreviewDrafts: 11,
  outputSchema: 12,
} as const;

// ─── System Messages ────────────────────────────────────────────────────────

const SYSTEM_MESSAGE_ZH = `你是 /autopilot 管线中的 Prompt Package 生成器，当前任务是为给定的 SPEC Tree 节点集合、SPEC 文档、效果预演，以及指定目标平台（Codex / Claude / Cursor / Kiro / Trae / Windsurf 之一）产出一份可落地复用的 Prompt Package。

给定用户的目标描述、澄清问答摘要、所选主路线的 steps / stages 摘要、目标节点的 id / title / summary / type / dependencies / outputs / priority、节点归属的 SPEC Documents 摘要、相关效果预演摘要，以及可选的 capability invocations 与 capability evidence 摘要，请以严格 JSON 形式返回该 Package 的结构化内容。

约束：
1. 必须返回合法 JSON，不得包含 Markdown 代码块围栏、不得返回任何解释性前置文字。
2. JSON 根对象必须包含：
   - "title": Package 标题（字符串，trim 后非空，1..200 字符）
   - "summary": Package 概要（字符串，trim 后非空，1..500 字符）
   - "prompts": 可复用 prompt 资产数组，长度 1..12
   - "sections": Package 正文 section 数组，长度 1..20
3. 每个 prompt 必须包含：
   - "id": Package 内唯一字符串（建议 kebab-case，1..128 字符，trim 后非空）
   - "title": prompt 标题（1..200 字符）
   - "systemPrompt": 系统提示词（1..4000 字符，trim 后非空）
   - "userPrompt": 用户提示词（1..4000 字符，trim 后非空）
   - "variables": 变量占位符数组（长度 0..30）
   - （可选）"examples": 示例输入输出数组（长度 0..10）
4. 每个 variable 必须包含：
   - "name": prompt 内唯一字符串（1..64 字符，trim 后非空）
   - "description": 变量用途说明（1..500 字符，trim 后非空）
   - "required": 严格布尔值（true 或 false；不得返回 "true" / "false" 字符串）
5. 每个 example 至少包含 "title" / "input" / "output" 中的一个非空字段。
6. 每个 section 必须包含：
   - "heading": Package 内唯一标题（1..200 字符，trim 后非空，不区分大小写比较）
   - "body": 正文内容（1..5000 字符，trim 后非空）
7. prompts[*].id 在 Package 内唯一（不区分大小写 / trim 后比较）。
8. 每个 prompt 的 variables[*].name 在该 prompt 内唯一（不区分大小写 / trim 后比较）。
9. sections[*].heading 在 Package 内唯一。
10. 不得引用外部 URL 真实凭据、真实邮箱、API 密钥字面量；敏感标识请抽象化。
11. prompt 内容应围绕目标平台（targetPlatform）的执行语义 + 目标节点 + SPEC 文档 + 效果预演推导，让下游工程落地可以直接复制使用。`;

const SYSTEM_MESSAGE_EN = `You are the Prompt Package generator inside the /autopilot pipeline. Your current task is to produce a reusable, deployment-ready Prompt Package for the given SPEC Tree node set, SPEC documents, effect previews, and a specified target platform (one of Codex / Claude / Cursor / Kiro / Trae / Windsurf).

Given the user's goal description, clarification Q&A summary, selected primary route steps / stages summary, target nodes' id / title / summary / type / dependencies / outputs / priority, the SPEC Documents associated with those nodes, related effect preview summaries, and optional capability invocations and capability evidence summaries, return the Package's structured content as strict JSON.

Constraints:
1. Return valid JSON only. Do NOT wrap in Markdown code fences. Do NOT include any explanatory prose before or after.
2. The root JSON object MUST contain:
   - "title": Package title (string, non-empty after trim, 1..200 characters)
   - "summary": Package summary (string, non-empty after trim, 1..500 characters)
   - "prompts": array of reusable prompt assets, length 1..12
   - "sections": array of Package body sections, length 1..20
3. Each prompt MUST contain:
   - "id": unique string within the Package (kebab-case recommended, 1..128 characters, non-empty after trim)
   - "title": prompt title (1..200 characters)
   - "systemPrompt": system prompt text (1..4000 characters, non-empty after trim)
   - "userPrompt": user prompt text (1..4000 characters, non-empty after trim)
   - "variables": variable placeholder array (length 0..30)
   - (optional) "examples": example input/output array (length 0..10)
4. Each variable MUST contain:
   - "name": unique string within the prompt (1..64 characters, non-empty after trim)
   - "description": variable purpose description (1..500 characters, non-empty after trim)
   - "required": strict boolean (true or false; do NOT return "true" / "false" strings)
5. Each example must have at least one non-empty field among "title" / "input" / "output".
6. Each section MUST contain:
   - "heading": unique title within the Package (1..200 characters, non-empty after trim, case-insensitive comparison)
   - "body": body content (1..5000 characters, non-empty after trim)
7. prompts[*].id must be unique within the Package (case-insensitive, compared after trim).
8. Each prompt's variables[*].name must be unique within that prompt (case-insensitive, compared after trim).
9. sections[*].heading must be unique within the Package.
10. Do NOT reference real credentials, real email addresses, or API key literals; abstract sensitive identifiers.
11. Prompt content should be derived from the target platform (targetPlatform) execution semantics + target nodes + SPEC documents + effect previews, so downstream engineering can directly copy and use them.`;

// ─── Output Schema Descriptor ───────────────────────────────────────────────

const OUTPUT_SCHEMA_DESCRIPTOR = {
  title: "string (1..200, non-empty after trim)",
  summary: "string (1..500, non-empty after trim)",
  prompts:
    "array[1..12] of { id (unique, 1..128), title (1..200), systemPrompt (1..4000), userPrompt (1..4000), variables (0..30), examples? (0..10) }",
  sections:
    "array[1..20] of { heading (unique, 1..200), body (1..5000) }",
  variables:
    "each item: { name (unique per prompt, 1..64), description (1..500), required: boolean }",
  examples:
    "each item (optional): { title?, input?, output? } with at least one non-empty",
} as const;

// ─── Helpers ────────────────────────────────────────────────────────────────

function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

// ─── Main Builder ───────────────────────────────────────────────────────────

export function buildPromptPackagePrompt(
  input: BuildPromptPackagePromptInput,
): PromptPackagePromptPayload {
  const systemMessage =
    input.locale === "zh-CN" ? SYSTEM_MESSAGE_ZH : SYSTEM_MESSAGE_EN;

  // Build userPayload with explicit key insertion order (USER_PAYLOAD_KEY_ORDER)
  const userPayload: Record<string, unknown> = {};

  // 1. promptId
  userPayload.promptId = PROMPT_PACKAGE_PROMPT_ID;

  // 2. targetPlatform
  userPayload.targetPlatform = input.targetPlatform;

  // 3. nodes — sorted by id lexicographic
  const nodesSorted = [...input.nodes]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      summary: n.summary,
      status: n.status,
      priority: n.priority,
      dependencies: n.dependencies,
      outputs: n.outputs,
      routeId: n.routeId,
      routeStepId: n.routeStepId,
    }));
  userPayload.nodes = nodesSorted;

  // 4. sourceDocuments — sorted by id lexicographic
  const docsSorted = [...input.sourceDocuments]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((d) => ({
      id: d.id,
      nodeId: d.nodeId,
      type: d.type,
      title: d.title,
      summary: d.summary,
      status: d.status,
      contentSnippet:
        typeof d.content === "string" ? d.content.slice(0, 4000) : "",
    }));
  userPayload.sourceDocuments = docsSorted;

  // 5. sourcePreviews — sorted by id lexicographic
  const previewsSorted = [...input.sourcePreviews]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((p) => ({
      id: p.id,
      nodeId: p.nodeId,
      status: p.status,
      summary: p.summary,
      architectureNotesSnippet: Array.isArray(p.architectureNotes)
        ? p.architectureNotes.join("; ").slice(0, 2000)
        : "",
      runtimeHudTitle: p.runtimeProjection?.hudState?.title,
    }));
  userPayload.sourcePreviews = previewsSorted;

  // 6. primaryRoute — steps preserve original order
  if (input.primaryRoute) {
    userPayload.primaryRoute = {
      id: input.primaryRoute.id,
      title: input.primaryRoute.title,
      summary: input.primaryRoute.summary,
      rationale: input.primaryRoute.rationale,
      steps: Array.isArray(input.primaryRoute.steps)
        ? input.primaryRoute.steps.map((s) => ({
            id: s.id,
            title: s.title,
            description: s.description,
            role: s.role,
          }))
        : [],
      capabilities: Array.isArray(input.primaryRoute.capabilities)
        ? input.primaryRoute.capabilities.map((c) => ({
            id: c.id,
            label: c.label,
          }))
        : [],
    };
  }

  // 7. intake — githubUrls preserve input order
  const githubUrls = Array.isArray(input.job.request?.githubUrls)
    ? [...input.job.request.githubUrls]
    : [];
  userPayload.intake = {
    targetText: input.job.request?.targetText,
    githubUrls,
  };

  // 8. clarification — answers sorted by questionId lexicographic
  if (input.clarificationSession) {
    const rawAnswers = Array.isArray(input.clarificationSession.answers)
      ? input.clarificationSession.answers
      : [];
    const answersSorted = rawAnswers
      .slice()
      .sort((a, b) => a.questionId.localeCompare(b.questionId))
      .map((entry) => ({
        questionId: entry.questionId,
        answer: entry.answer,
      }));
    userPayload.clarification = {
      strategyId: input.clarificationSession.strategyId,
      templateId: input.clarificationSession.templateId,
      answers: answersSorted,
    };
  }

  // 9. projectContext
  if (input.domainContext) {
    userPayload.projectContext = {
      projectId: input.domainContext.projectId,
    };
  } else if (input.job.request?.projectId || input.job.request?.sourceId) {
    userPayload.projectContext = {
      projectId: input.job.request.projectId,
      sourceId: input.job.request.sourceId,
    };
  }

  // 10. upstreamEvidence — sorted by id lexicographic (if provided)
  if (input.capabilityInvocations || input.capabilityEvidence) {
    const evidence: Record<string, unknown> = {};
    if (
      input.capabilityInvocations &&
      input.capabilityInvocations.length > 0
    ) {
      evidence.capabilityInvocations = [...input.capabilityInvocations]
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((inv) => ({
          id: inv.id,
          capability: inv.capabilityLabel,
          adapter: inv.provenance?.executionPath ?? "unknown",
          status: inv.status,
          summary: inv.outputSummary,
        }));
    }
    if (input.capabilityEvidence && input.capabilityEvidence.length > 0) {
      evidence.capabilityEvidence = [...input.capabilityEvidence]
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((ev) => ({
          id: ev.id,
          label: ev.capabilityLabel,
          summary: ev.summary,
          kind: ev.kind,
        }));
    }
    if (Object.keys(evidence).length > 0) {
      userPayload.upstreamEvidence = evidence;
    }
  }

  // 11. includeDrafts
  userPayload.includeDrafts = input.includeDrafts;

  // 12. includePreviewDrafts
  userPayload.includePreviewDrafts = input.includePreviewDrafts;

  // 13. outputSchema
  userPayload.outputSchema = OUTPUT_SCHEMA_DESCRIPTOR;

  // ─── Finalize ───────────────────────────────────────────────────────────────

  const userMessage = JSON.stringify(userPayload, null, 2);
  const promptFingerprint = `sha256:${sha256Hex(`${systemMessage}\n\n${userMessage}`)}`;

  return {
    promptId: PROMPT_PACKAGE_PROMPT_ID,
    systemMessage,
    userMessage,
    userPayload,
    promptFingerprint,
  };
}
