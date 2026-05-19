/**
 * SPEC Documents LLM Prompt Builder — 纯函数模块。
 *
 * 构造确定性 prompt payload：同一组输入 → 字节相同的 userMessage + promptFingerprint。
 *
 * 本文件禁止 import callLLMJson / getAIConfig / fetch；
 * 仅允许 import type shared blueprint 类型 + node:crypto sha256 纯 helper。
 *
 * 对应 design §4.5 + requirements 2.2, 2.4, 2.5, 3.1, 3.2。
 */

import { createHash } from "node:crypto";

import type {
  BlueprintClarificationSession,
  BlueprintGenerationRequest,
  BlueprintProjectDomainContext,
  BlueprintRouteCandidate,
  BlueprintSpecTreeNode,
} from "../../../../shared/blueprint/index.js";

// ─── Constants ───────────────────────────────────────────────────────────────

export const SPEC_DOCUMENTS_PROMPT_ID = "blueprint.spec-documents.v1";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SpecDocumentsPromptPayload {
  promptId: string;
  systemMessage: string;
  userMessage: string;
  /** Deterministic object used to render userMessage; exposed for tests. */
  userPayload: Record<string, unknown>;
  /** SHA-256 hex of systemMessage + "\n\n" + userMessage, formatted as "sha256:<hex>". */
  promptFingerprint: string;
}

export type BlueprintSpecDocumentTargetType = "requirements" | "design" | "tasks";

export interface BuildSpecDocumentsPromptInput {
  request: BlueprintGenerationRequest;
  specTreeNode: BlueprintSpecTreeNode;
  targetDocumentType: BlueprintSpecDocumentTargetType;
  primaryRoute?: BlueprintRouteCandidate;
  clarificationSession?: BlueprintClarificationSession;
  domainContext?: BlueprintProjectDomainContext;
  upstreamEvidence?: {
    reusableRoleFindings?: Array<{ id: string; label: string; summary: string }>;
  };
  locale: "zh-CN" | "en-US";
}

// ─── System Messages ─────────────────────────────────────────────────────────

// --- Chinese system messages by document type ---

const SYSTEM_MESSAGE_ZH_REQUIREMENTS = `你是 /autopilot SPEC 文档生成器，负责为给定的 SPEC Tree 节点生成「需求文档」。

给定节点的标题、摘要、路线上下文、澄清问答与可选领域上下文，请生成一份结构化的需求文档。

约束：
1. 必须返回合法 JSON，不得包含 Markdown 代码块围栏或解释性前置文字。
2. JSON 根对象必须包含：
   - "title": string，1 到 200 字符，文档标题。
   - "summary": string，1 到 500 字符，文档摘要。
   - "sections": 数组，2 到 20 项，每项包含：
     - "id": string，lowercase kebab-case，1 到 64 字符，节内唯一标识。
     - "title": string，1 到 200 字符，章节标题。
     - "summary": string，1 到 500 字符，章节摘要。
     - "body": string，1 到 8000 字符，章节正文（Markdown 格式）。
3. 可选包含 "status": "draft" | "reviewing" | "accepted" | "rejected"。
4. sections 应覆盖：功能需求、非功能需求、约束条件、验收标准等。
5. 不得在输出中包含真实 API 密钥、令牌或凭据；对敏感标识使用抽象占位符。
6. 所有 section.id 在同一文档内必须唯一（不区分大小写）。`;

const SYSTEM_MESSAGE_ZH_DESIGN = `你是 /autopilot SPEC 文档生成器，负责为给定的 SPEC Tree 节点生成「设计文档」。

给定节点的标题、摘要、路线上下文、澄清问答与可选领域上下文，请生成一份结构化的设计文档。

约束：
1. 必须返回合法 JSON，不得包含 Markdown 代码块围栏或解释性前置文字。
2. JSON 根对象必须包含：
   - "title": string，1 到 200 字符，文档标题。
   - "summary": string，1 到 500 字符，文档摘要。
   - "sections": 数组，2 到 20 项，每项包含：
     - "id": string，lowercase kebab-case，1 到 64 字符，节内唯一标识。
     - "title": string，1 到 200 字符，章节标题。
     - "summary": string，1 到 500 字符，章节摘要。
     - "body": string，1 到 8000 字符，章节正文（Markdown 格式）。
3. 可选包含 "status": "draft" | "reviewing" | "accepted" | "rejected"。
4. sections 应覆盖：架构概述、组件设计、接口定义、数据模型、技术决策等。
5. 不得在输出中包含真实 API 密钥、令牌或凭据；对敏感标识使用抽象占位符。
6. 所有 section.id 在同一文档内必须唯一（不区分大小写）。`;

const SYSTEM_MESSAGE_ZH_TASKS = `你是 /autopilot SPEC 文档生成器，负责为给定的 SPEC Tree 节点生成「任务清单」。

给定节点的标题、摘要、路线上下文、澄清问答与可选领域上下文，请生成一份结构化的任务清单文档。

约束：
1. 必须返回合法 JSON，不得包含 Markdown 代码块围栏或解释性前置文字。
2. JSON 根对象必须包含：
   - "title": string，1 到 200 字符，文档标题。
   - "summary": string，1 到 500 字符，文档摘要。
   - "sections": 数组，2 到 20 项，每项包含：
     - "id": string，lowercase kebab-case，1 到 64 字符，节内唯一标识。
     - "title": string，1 到 200 字符，章节标题。
     - "summary": string，1 到 500 字符，章节摘要。
     - "body": string，1 到 8000 字符，章节正文（Markdown 格式）。
3. 可选包含 "status": "draft" | "reviewing" | "accepted" | "rejected"。
4. sections 应覆盖：实施步骤、验证标准、依赖关系、风险缓解措施等。
5. 不得在输出中包含真实 API 密钥、令牌或凭据；对敏感标识使用抽象占位符。
6. 所有 section.id 在同一文档内必须唯一（不区分大小写）。`;

// --- English system messages by document type ---

const SYSTEM_MESSAGE_EN_REQUIREMENTS = `You are the /autopilot SPEC Document generator responsible for producing a "requirements" document for a given SPEC Tree node.

Given the node's title, summary, route context, clarification answers, and optional domain context, generate a structured requirements document.

Constraints:
1. Return a single JSON object. Do NOT wrap in Markdown code fences or include any prose.
2. The root object MUST include:
   - "title": string, 1 to 200 characters, the document title.
   - "summary": string, 1 to 500 characters, the document summary.
   - "sections": array of 2 to 20 items, each containing:
     - "id": string, lowercase kebab-case, 1 to 64 characters, unique within the document.
     - "title": string, 1 to 200 characters, section title.
     - "summary": string, 1 to 500 characters, section summary.
     - "body": string, 1 to 8000 characters, section body in Markdown.
3. Optionally include "status": "draft" | "reviewing" | "accepted" | "rejected".
4. Sections should cover: functional requirements, non-functional requirements, constraints, acceptance criteria, etc.
5. Do NOT include real API keys, tokens, or credentials; use abstract placeholders for sensitive identifiers.
6. All section.id values must be unique within the document (case-insensitive).`;

const SYSTEM_MESSAGE_EN_DESIGN = `You are the /autopilot SPEC Document generator responsible for producing a "design" document for a given SPEC Tree node.

Given the node's title, summary, route context, clarification answers, and optional domain context, generate a structured design document.

Constraints:
1. Return a single JSON object. Do NOT wrap in Markdown code fences or include any prose.
2. The root object MUST include:
   - "title": string, 1 to 200 characters, the document title.
   - "summary": string, 1 to 500 characters, the document summary.
   - "sections": array of 2 to 20 items, each containing:
     - "id": string, lowercase kebab-case, 1 to 64 characters, unique within the document.
     - "title": string, 1 to 200 characters, section title.
     - "summary": string, 1 to 500 characters, section summary.
     - "body": string, 1 to 8000 characters, section body in Markdown.
3. Optionally include "status": "draft" | "reviewing" | "accepted" | "rejected".
4. Sections should cover: architecture overview, component design, interface definitions, data models, technical decisions, etc.
5. Do NOT include real API keys, tokens, or credentials; use abstract placeholders for sensitive identifiers.
6. All section.id values must be unique within the document (case-insensitive).`;

const SYSTEM_MESSAGE_EN_TASKS = `You are the /autopilot SPEC Document generator responsible for producing a "tasks" document for a given SPEC Tree node.

Given the node's title, summary, route context, clarification answers, and optional domain context, generate a structured task list document.

Constraints:
1. Return a single JSON object. Do NOT wrap in Markdown code fences or include any prose.
2. The root object MUST include:
   - "title": string, 1 to 200 characters, the document title.
   - "summary": string, 1 to 500 characters, the document summary.
   - "sections": array of 2 to 20 items, each containing:
     - "id": string, lowercase kebab-case, 1 to 64 characters, unique within the document.
     - "title": string, 1 to 200 characters, section title.
     - "summary": string, 1 to 500 characters, section summary.
     - "body": string, 1 to 8000 characters, section body in Markdown.
3. Optionally include "status": "draft" | "reviewing" | "accepted" | "rejected".
4. Sections should cover: implementation steps, verification criteria, dependencies, risk mitigation, etc.
5. Do NOT include real API keys, tokens, or credentials; use abstract placeholders for sensitive identifiers.
6. All section.id values must be unique within the document (case-insensitive).`;

// ─── Output Schema Descriptor ────────────────────────────────────────────────

const OUTPUT_SCHEMA_DESCRIPTOR = {
  title: "string, 1..200 chars",
  summary: "string, 1..500 chars",
  sections: "Array of 2..20 objects, each with: id (lowercase kebab-case, 1..64 chars), title (1..200 chars), summary (1..500 chars), body (1..8000 chars, Markdown)",
  "sections[].id": "lowercase kebab-case, unique within document (case-insensitive)",
  "sections[].title": "1..200 chars, non-empty after trim",
  "sections[].summary": "1..500 chars, non-empty after trim",
  "sections[].body": "1..8000 chars, non-empty after trim, Markdown content",
  status: "optional, one of: draft | reviewing | accepted | rejected",
} as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function getSystemMessage(
  locale: "zh-CN" | "en-US",
  targetDocumentType: BlueprintSpecDocumentTargetType,
): string {
  if (locale === "zh-CN") {
    switch (targetDocumentType) {
      case "requirements":
        return SYSTEM_MESSAGE_ZH_REQUIREMENTS;
      case "design":
        return SYSTEM_MESSAGE_ZH_DESIGN;
      case "tasks":
        return SYSTEM_MESSAGE_ZH_TASKS;
    }
  }
  switch (targetDocumentType) {
    case "requirements":
      return SYSTEM_MESSAGE_EN_REQUIREMENTS;
    case "design":
      return SYSTEM_MESSAGE_EN_DESIGN;
    case "tasks":
      return SYSTEM_MESSAGE_EN_TASKS;
  }
}

// ─── Main Builder ────────────────────────────────────────────────────────────

/**
 * Constructs a deterministic prompt payload for SPEC Document generation.
 *
 * Same input → byte-identical userMessage + promptFingerprint.
 *
 * Field order in userPayload is fixed:
 * `promptId / targetDocumentType / specTreeNode / primaryRoute / intake /
 *  clarification / projectContext / upstreamEvidence / outputSchema`
 *
 * - `clarification.answers` sorted by `questionId` (lexicographic)
 * - `primaryRoute.steps` preserved in original order
 * - `intake.githubUrls` preserved in request input order
 * - `upstreamEvidence.reusableRoleFindings` sorted by `id` (lexicographic)
 */
export function buildSpecDocumentsPrompt(
  input: BuildSpecDocumentsPromptInput,
): SpecDocumentsPromptPayload {
  const systemMessage = getSystemMessage(input.locale, input.targetDocumentType);

  // --- Build userPayload with fixed field order ---
  const userPayload: Record<string, unknown> = {
    promptId: SPEC_DOCUMENTS_PROMPT_ID,
    targetDocumentType: input.targetDocumentType,
    specTreeNode: {
      id: input.specTreeNode.id,
      title: input.specTreeNode.title,
      summary: input.specTreeNode.summary,
      type: input.specTreeNode.type,
      priority: input.specTreeNode.priority,
      dependencies: input.specTreeNode.dependencies,
      outputs: input.specTreeNode.outputs,
    },
  };

  // primaryRoute — steps in original order
  if (input.primaryRoute) {
    userPayload.primaryRoute = {
      id: input.primaryRoute.id,
      title: input.primaryRoute.title,
      summary: input.primaryRoute.summary,
      steps: Array.isArray(input.primaryRoute.steps)
        ? input.primaryRoute.steps.map((step) => ({
            id: step.id,
            title: step.title,
            description: step.description,
          }))
        : [],
    };
  }

  // intake
  const githubUrls = Array.isArray(input.request.githubUrls)
    ? [...input.request.githubUrls]
    : [];
  userPayload.intake = {
    targetText: input.request.targetText,
    githubUrls,
  };

  // clarification — answers sorted by questionId
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

  // projectContext
  if (input.domainContext) {
    userPayload.projectContext = {
      projectId: input.domainContext.projectId,
    };
  } else if (input.request.projectId || input.request.sourceId) {
    userPayload.projectContext = {
      projectId: input.request.projectId,
      sourceId: input.request.sourceId,
    };
  }

  // upstreamEvidence — reusableRoleFindings sorted by id
  if (input.upstreamEvidence) {
    const findings = input.upstreamEvidence.reusableRoleFindings;
    if (findings && findings.length > 0) {
      userPayload.upstreamEvidence = {
        reusableRoleFindings: findings
          .slice()
          .sort((a, b) => a.id.localeCompare(b.id))
          .map((f) => ({ id: f.id, label: f.label, summary: f.summary })),
      };
    }
  }

  // outputSchema — always last
  userPayload.outputSchema = OUTPUT_SCHEMA_DESCRIPTOR;

  // --- Serialize ---
  const userMessage = JSON.stringify(userPayload, null, 2);
  const promptFingerprint = `sha256:${sha256Hex(systemMessage + "\n\n" + userMessage)}`;

  return {
    promptId: SPEC_DOCUMENTS_PROMPT_ID,
    systemMessage,
    userMessage,
    userPayload,
    promptFingerprint,
  };
}
