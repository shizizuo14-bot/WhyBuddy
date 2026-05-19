/**
 * Autopilot LLM-Driven Spec Generation：SPEC 树 LLM 推导工厂。
 *
 * 本文件落地 `.kiro/specs/autopilot-llm-spec-generation/design.md` §2 中描述
 * 的 `spec-tree-llm-derivation.ts` 模块，对应 `tasks.md` Task 2.1 - 2.7：
 *
 * - Task 2.1：DI 依赖与对外接口（已完成）。
 * - Task 2.2：旗标 / `BUILD_TARGET=test` / apiKey 缺失短路（本次落地）。
 * - Task 2.3：Tier 1 仓库上下文抓取（best-effort，详细文件过滤后续补强）。
 * - Task 2.4：构造 `AgentJobInput` 并驱动 Lite Agent 循环；缺 lite agent 时
 *   退路使用 `LlmCallFn` 直调，仍标 `generationSource: "llm"`。
 * - Task 2.5：解析、schema 校验与 `BlueprintSpecTree` 构造，包含树关系校验
 *   （唯一 root / 无环 / 无孤儿）。
 * - Task 2.6：诊断写入与脱敏（`applyAgentCrewRedaction` + 400 字符截断），
 *   `recordBridgeInvocation` 失败时静默吞掉并 debug log。
 * - Task 2.7：失败传播边界与日志层级 —— `derive()` 永不抛错，全部走
 *   `debug` / `warn`，不上 `error`。
 *
 * 与既有 `server/routes/blueprint/spec-tree/service.ts` 的关系：
 * - `spec-tree/service.ts` 是 `callJson` 直调版本，已经在主线落地；
 * - 本文件提供的工厂是 **Lite Agent 循环驱动版本**（Task 6 接线后由 handler
 *   按 `BLUEPRINT_SPEC_TREE_LLM_ENABLED` 选择两条路径之一），互不破坏；
 * - Tier 1 / Tier 2 都标 `generationSource: "llm"`，Tier 3 退化为
 *   `"template"`，由调用方走既有模板路径兜底。
 *
 * 硬约束：
 * - 仅 `import type` 引入既有运行期依赖（`agent-reasoning-bridge.ts` /
 *   `callback-receiver.ts` / `lite-agent-runtime.ts` / `llm-call.ts` 内部
 *   实现一律不修改）；
 * - 全部字段使用显式类型，禁用 `any`；
 * - `derive()` 永不抛错；任何异常 `try/catch` 后转 fallback；
 * - prompt 字面量 / promptId 保持英文，模块级 JSDoc / 注释统一中文。
 *
 * 对应需求：1.1 / 1.2 / 1.5 / 1.6 / 1.7 / 3.1 / 3.6 / 4.5 / 5.1 / 5.2 /
 * 5.3 / 5.4 / 6.2。
 */

import { createHash, randomUUID } from "node:crypto";

import type {
  AgentJobInput,
  AgentJobOutput,
} from "../../../shared/blueprint/agent-job.js";
import type { AgentToolDefinition } from "../../../shared/blueprint/agent-tool.js";
import type {
  BlueprintRouteSet,
  BlueprintSpecTree,
  BlueprintSpecTreeNode,
  BlueprintSpecTreeNodeType,
} from "../../../shared/blueprint/index.js";
import { getAIConfig } from "../../core/ai-config.js";
import {
  applyAgentCrewRedaction,
  createDefaultAgentCrewStageActivationPolicy,
  type AgentCrewStageActivationPolicy,
} from "./agent-crew-stage-activation/policy.js";
import {
  buildSpecTreePrompt,
  parseSpecTreeLlmResponse,
  type PromptPayload,
  type SpecTreeLlmResponse,
} from "./llm-spec-prompts.js";
import type { LlmCallFn, LlmCallOutput } from "./role-agent-runtime/llm-call.js";
import type { LiteAgentRuntime } from "./role-agent-runtime/lite-agent-runtime.js";
import type {
  BlueprintLogger,
  McpToolAdapterDependency,
} from "./context.js";
import type { BlueprintRuntimeDiagnosticsStore } from "./runtime-enablement/diagnostics-store.js";

// ---------------------------------------------------------------------------
// 环境旗标与常量
// ---------------------------------------------------------------------------

/** 是否启用 spec_tree LLM 真实推导；默认关闭，opt-in。 */
const ENV_LLM_ENABLED = "BLUEPRINT_SPEC_TREE_LLM_ENABLED";
/** 测试态硬锁：`BUILD_TARGET=test` 时一律走 fallback，保留既有测试兼容性。 */
const ENV_BUILD_TARGET = "BUILD_TARGET";
/** 整体超时（毫秒）；默认 180_000ms。 */
const ENV_TIMEOUT_MS = "BLUEPRINT_SPEC_TREE_LLM_TIMEOUT_MS";
/** 仓库上下文 token 截断阈值；默认 32_000。 */
const ENV_MAX_REPO_TOKENS = "BLUEPRINT_SPEC_TREE_LLM_MAX_REPO_TOKENS";

const DEFAULT_TIMEOUT_MS = 180_000;
const DEFAULT_MAX_REPO_TOKENS = 32_000;
const MAX_FALLBACK_REASON_CHARS = 400;
/** 单次 LLM 调用估算 token≈4 字符；用于 prompt 内仓库摘要的 byte 截断。 */
const APPROX_CHARS_PER_TOKEN = 4;

const REDACTION_POLICY: AgentCrewStageActivationPolicy =
  createDefaultAgentCrewStageActivationPolicy();

// ---------------------------------------------------------------------------
// 对外类型
// ---------------------------------------------------------------------------

/**
 * `createSpecTreeLlmDerivation` 的依赖注入容器。
 *
 * 与 `BlueprintServiceContext` 风格保持一致：所有运行期能力都通过显式字段注入，
 * 工厂内部不再访问任何模块级单例（参见 design §2 与需求 6.2）。
 */
export interface SpecTreeLlmDerivationDeps {
  /** 直接 LLM 调用函数；当 `liteAgentRuntime` 未注入时作为退路使用。 */
  llmCall: LlmCallFn;
  /** MCP GitHub 适配器；用于抓取仓库结构与关键文件。可选。 */
  mcpToolAdapter?: McpToolAdapterDependency;
  /** Lite Agent 运行时；用于驱动 Think→Act→Observe 循环。可选。 */
  liteAgentRuntime?: LiteAgentRuntime;
  /** 诊断 store；记录 `specTreeLlm` entry 的所有计数与最近错误。 */
  diagnostics: BlueprintRuntimeDiagnosticsStore;
  /** 可观测性 logger；不影响行为。 */
  logger: BlueprintLogger;
  /** 时间源；便于测试注入固定时钟。 */
  now: () => Date;
}

/** SPEC 树 LLM 推导请求。 */
export interface SpecTreeLlmDerivationRequest {
  jobId: string;
  routeSet: BlueprintRouteSet;
  selectedRouteId: string;
  githubUrls: ReadonlyArray<string>;
  targetText: string;
}

/** SPEC 树 LLM 推导结果。 */
export interface SpecTreeLlmDerivationResult {
  /** 真实 LLM 路径返回构造好的 SPEC 树；fallback 时为 `undefined`。 */
  tree?: BlueprintSpecTree;
  /** 生成来源标识；`"llm"` 表示真实推导成功，`"template"` 表示降级到模板。 */
  generationSource: "llm" | "template";
  /** Tier 标记：`"full"` / `"route-only"` / `"fallback"`。 */
  contextTier: "full" | "route-only" | "fallback";
  /** 真实 LLM 路径填充：prompt 版本号。 */
  promptId?: string;
  /** 真实 LLM 路径填充：实际调用的模型名。 */
  model?: string;
  /** 真实 LLM 路径填充：prompt sha256 摘要。 */
  promptFingerprint?: string;
  /** 真实 LLM 路径填充：response sha256 摘要。 */
  responseDigest?: string;
  /** Fallback 路径填充：脱敏并截断后的失败原因（≤ 400 字符）。 */
  fallbackReason?: string;
}

/** SPEC 树 LLM 推导器对外接口。 */
export interface SpecTreeLlmDerivation {
  derive(
    request: SpecTreeLlmDerivationRequest,
  ): Promise<SpecTreeLlmDerivationResult>;
}

// ---------------------------------------------------------------------------
// 内部工具：env 读取 / 脱敏 / sha256
// ---------------------------------------------------------------------------

/** 读取并解析正整数 env 值；非法值回退到默认。 */
function readPositiveIntEnv(key: string, defaultValue: number): number {
  const raw = process.env[key];
  if (typeof raw !== "string" || raw.trim().length === 0) return defaultValue;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return defaultValue;
  return parsed;
}

/** 脱敏并截断 fallback 原因到 ≤ 400 字符。 */
function redactAndTruncate(reason: string): string {
  const redacted = applyAgentCrewRedaction(reason, REDACTION_POLICY);
  return redacted.length > MAX_FALLBACK_REASON_CHARS
    ? redacted.slice(0, MAX_FALLBACK_REASON_CHARS)
    : redacted;
}

/** 计算 sha256 hex 摘要（带 `"sha256:"` 前缀）。 */
function sha256(text: string): string {
  return `sha256:${createHash("sha256").update(text, "utf8").digest("hex")}`;
}

/**
 * 静默写入诊断 invocation；`recordBridgeInvocation` 自身抛错时 debug log，
 * 不影响主流程。
 */
function safeRecordInvocation(
  deps: SpecTreeLlmDerivationDeps,
  result: { mode: "real" | "simulated_fallback"; error?: string },
): void {
  try {
    deps.diagnostics.recordBridgeInvocation("specTreeLlm", result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    deps.logger.debug("[spec-tree-llm] diagnostics record failed", {
      error: message,
    });
  }
}

// ---------------------------------------------------------------------------
// 内部工具：Tier 1 仓库上下文抓取（best-effort）
// ---------------------------------------------------------------------------

/** 解析 GitHub URL 为 `{ owner, repo }`；不能解析时返回 null。 */
function parseGithubUrl(url: string): { owner: string; repo: string } | null {
  const trimmed = url.trim();
  if (trimmed.length === 0) return null;
  const match = /github\.com[/:]([^/]+)\/([^/?#]+?)(?:\.git|\/.*|#.*|\?.*)?$/i.exec(
    trimmed,
  );
  if (!match) return null;
  const owner = match[1];
  const repo = match[2];
  if (!owner || !repo) return null;
  return { owner, repo };
}

/**
 * 通过 MCP 抓取仓库上下文，best-effort 实现：
 *
 * - 仅在 `mcpToolAdapter` 存在且第一条 GitHub URL 可解析时执行；
 * - 设置独立 sub-timeout（≤ 整体 timeout 的 1/3）；
 * - 抓取成功时以 `JSON.stringify(result.response)` 作为 `repoTreeDigest`，
 *   并按 `BLUEPRINT_SPEC_TREE_LLM_MAX_REPO_TOKENS * 4` 字符截断；
 * - 任何错误（adapter 抛错 / status 非 completed / 解析失败）都向上抛错，
 *   由调用方降级到 Tier 2 并记录 warn。
 *
 * NOTE: 关键文件（package.json / tsconfig.json / Cargo.toml / pom.xml）
 * 的精细化抓取与过滤暂以 best-effort 方式呈现：默认 keyFiles 为空数组，
 * 详细文件检索可在后续 PR 优化。
 */
async function attemptRepoFetch(
  deps: SpecTreeLlmDerivationDeps,
  request: SpecTreeLlmDerivationRequest,
  subTimeoutMs: number,
): Promise<{
  repoTreeDigest: string;
  keyFiles: Array<{ path: string; content: string }>;
} | null> {
  const adapter = deps.mcpToolAdapter;
  if (!adapter) return null;
  const firstUrl = request.githubUrls[0];
  if (!firstUrl) return null;
  const parsed = parseGithubUrl(firstUrl);
  if (!parsed) return null;

  const fetchPromise = adapter.execute({
    serverId: "github",
    toolName: "github.get_repository",
    arguments: { owner: parsed.owner, repo: parsed.repo },
    input: `Inspect GitHub repository ${parsed.owner}/${parsed.repo} for spec tree derivation.`,
    context: [],
    stage: "spec_tree",
    metadata: {
      bridge: "blueprint-spec-tree-llm-derivation",
      jobId: request.jobId,
      routeId: request.selectedRouteId,
    },
    agentId: "blueprint-spec-tree-llm",
    requireApproval: false,
    timeoutMs: Math.min(30_000, subTimeoutMs),
  });

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`mcp fetch timeout after ${subTimeoutMs}ms`)),
      subTimeoutMs,
    );
  });

  try {
    const result = await Promise.race([fetchPromise, timeoutPromise]);
    if (!result.ok || result.status !== "completed") {
      throw new Error(
        `mcp status=${result.status} error=${result.error ?? "n/a"}`,
      );
    }
    const responseStr = JSON.stringify(result.response ?? {}, null, 2);
    const maxBytes =
      readPositiveIntEnv(ENV_MAX_REPO_TOKENS, DEFAULT_MAX_REPO_TOKENS) *
      APPROX_CHARS_PER_TOKEN;
    const repoTreeDigest =
      responseStr.length > maxBytes
        ? `${responseStr.slice(0, maxBytes)}\n…(truncated)`
        : responseStr;
    return { repoTreeDigest, keyFiles: [] };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// 内部工具：Lite Agent 调用 / 直接 LLM 调用
// ---------------------------------------------------------------------------

/** 构造 `AgentJobInput`；callbackUrl / Secret 在 lite mode 下不使用，留空字符串。 */
function buildAgentJobInput(
  request: SpecTreeLlmDerivationRequest,
  promptPayload: PromptPayload,
  hasMcpAdapter: boolean,
  totalTimeoutMs: number,
): AgentJobInput {
  const tools: AgentToolDefinition[] = [];
  if (hasMcpAdapter) {
    tools.push({
      id: "mcp.github",
      name: "github",
      description:
        "Fetch GitHub repository file tree or file contents via MCP for spec tree derivation.",
      category: "mcp",
      inputSchema: { type: "object" },
      requiresProxy: true,
      timeoutMs: 30_000,
    });
  }
  return {
    jobId: request.jobId,
    roleId: "blueprint-spec-tree-llm",
    stageId: "spec_tree",
    goal: "Derive a SPEC tree decomposition from the selected route and repository context.",
    systemPrompt: `${promptPayload.systemMessage}\n\nWhen ready, call builtin.finish with the JSON object as output.`,
    tools,
    budget: {
      maxIterations: 8,
      maxTokens: 16_000,
      timeoutMs: totalTimeoutMs,
      toolTimeoutMs: 30_000,
      allowParallelTools: false,
    },
    context: {
      userMessage: promptPayload.userMessage,
      promptId: promptPayload.promptId,
      promptFingerprint: promptPayload.promptFingerprint,
    },
    callbackUrl: "",
    callbackSecret: "",
  };
}

/**
 * 通过 Lite Agent 循环驱动 LLM 推导；返回最终 LLM 输出（finish output）。
 *
 * - 用 `Promise.race` 把 `liteAgentRuntime.run(...)` 与超时竞速；
 * - `status !== "completed"` 视作失败（抛错由 caller 捕获后降级）；
 * - `output` 为 LLM 通过 `builtin.finish` 提交的最终答案，按 schema 校验。
 */
async function runLiteAgent(
  liteAgentRuntime: LiteAgentRuntime,
  agentInput: AgentJobInput,
  totalTimeoutMs: number,
): Promise<unknown> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`agent timeout after ${totalTimeoutMs}ms`)),
      totalTimeoutMs,
    );
  });
  try {
    const output: AgentJobOutput = await Promise.race([
      liteAgentRuntime.run(agentInput),
      timeoutPromise,
    ]);
    if (output.status !== "completed") {
      throw new Error(
        `agent status=${output.status} error=${output.error ?? "n/a"}`,
      );
    }
    return output.output;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * 直接调用 `LlmCallFn` 完成单轮推导（缺 lite agent 时退路）。
 *
 * 返回 `LlmCallOutput.output` 中的 raw JSON；`type !== "finish"` 视作失败。
 */
async function callLlmDirectly(
  llmCall: LlmCallFn,
  promptPayload: PromptPayload,
  totalTimeoutMs: number,
): Promise<unknown> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`llm timeout after ${totalTimeoutMs}ms`)),
      totalTimeoutMs,
    );
  });
  try {
    const result: LlmCallOutput = await Promise.race([
      llmCall({
        systemPrompt: promptPayload.systemMessage,
        history: [],
        context: { userMessage: promptPayload.userMessage },
        tools: [],
      }),
      timeoutPromise,
    ]);
    if (result.type === "finish") {
      return result.output;
    }
    if (result.type === "error") {
      throw new Error(`llmCall error: ${result.error}`);
    }
    throw new Error(
      `llmCall returned unexpected action toolId=${result.action.toolId}`,
    );
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// 内部工具：树关系校验 + BlueprintSpecTree 构造
// ---------------------------------------------------------------------------

/**
 * 校验 LLM 返回的节点关系：
 *
 * - id 唯一；
 * - 恰好一个 root 节点（`type === "root"` 或没有 parentId）；
 * - 非 root 节点必须有 parentId 且能解析；
 * - 不允许自指；
 * - DFS 检测无环。
 */
function validateTreeStructure(
  data: SpecTreeLlmResponse,
):
  | { ok: true; rootId: string }
  | { ok: false; reason: string } {
  const ids = new Set<string>();
  for (const node of data.nodes) {
    if (ids.has(node.id)) {
      return { ok: false, reason: `duplicate node id ${node.id}` };
    }
    ids.add(node.id);
  }

  const roots: string[] = [];
  for (const node of data.nodes) {
    if (node.type === "root" || !node.parentId) {
      roots.push(node.id);
    }
  }
  if (roots.length === 0) {
    return { ok: false, reason: "no root node found" };
  }
  if (roots.length > 1) {
    return {
      ok: false,
      reason: `multiple root nodes: ${roots.join(", ")}`,
    };
  }
  const rootId = roots[0];

  for (const node of data.nodes) {
    if (node.id === rootId) continue;
    if (!node.parentId) {
      return {
        ok: false,
        reason: `non-root node ${node.id} missing parentId`,
      };
    }
    if (!ids.has(node.parentId)) {
      return {
        ok: false,
        reason: `orphan node ${node.id} references missing parent ${node.parentId}`,
      };
    }
    if (node.parentId === node.id) {
      return { ok: false, reason: `self-referencing node ${node.id}` };
    }
  }

  // 环检测：从每个非 root 节点向上追溯，最多 N 步。
  for (const start of data.nodes) {
    if (start.id === rootId) continue;
    const visited = new Set<string>([start.id]);
    let current: string | undefined = start.parentId;
    while (current) {
      if (visited.has(current)) {
        return { ok: false, reason: `cycle detected at node ${current}` };
      }
      visited.add(current);
      if (current === rootId) break;
      const parent = data.nodes.find((n) => n.id === current);
      current = parent?.parentId;
    }
  }

  return { ok: true, rootId };
}

/** 把 LLM 节点 type 映射为平台 `BlueprintSpecTreeNodeType`。 */
function mapNodeType(
  llmType: SpecTreeLlmResponse["nodes"][number]["type"],
): BlueprintSpecTreeNodeType {
  switch (llmType) {
    case "root":
      return "root";
    case "alternative_route":
      return "alternative_route";
    case "route_step":
    case "module":
    case "submodule":
    default:
      return "route_step";
  }
}

/**
 * 把 LLM 解析后的响应构造为完整的 `BlueprintSpecTree`：
 *
 * - LLM 节点 id 重映射为稳定平台 id（root 节点对应 `rootStableId`）；
 * - 节点 type 映射到平台 union；非 alternative_route 节点附 `routeId`；
 * - 推导 `children[]`；其余字段（dependencies / outputs）置空数组；
 * - `provenance.generationSource = "llm"`，附 prompt / model / 双 digest。
 */
function buildBlueprintSpecTree(args: {
  request: SpecTreeLlmDerivationRequest;
  parsedData: SpecTreeLlmResponse;
  rootLlmId: string;
  promptPayload: PromptPayload;
  rawResponse: unknown;
  model: string;
  now: () => Date;
}): BlueprintSpecTree {
  const { request, parsedData, rootLlmId, promptPayload, rawResponse, model, now } = args;

  const idMap = new Map<string, string>();
  const rootStableId = `blueprint-spec-node-${randomUUID()}`;
  for (const llmNode of parsedData.nodes) {
    if (llmNode.id === rootLlmId) {
      idMap.set(llmNode.id, rootStableId);
    } else {
      idMap.set(llmNode.id, `blueprint-spec-node-${randomUUID()}`);
    }
  }

  const platformNodes: BlueprintSpecTreeNode[] = parsedData.nodes.map((llmNode) => {
    const stableId = idMap.get(llmNode.id);
    if (!stableId) {
      // 防御性兜底：理论上 idMap 已覆盖所有节点。
      throw new Error(`node ${llmNode.id} missing in idMap`);
    }
    const platformType = mapNodeType(llmNode.type);
    const node: BlueprintSpecTreeNode = {
      id: stableId,
      title: llmNode.title,
      summary: llmNode.summary,
      type: platformType,
      status: "seed",
      priority: llmNode.priority,
      dependencies: [],
      outputs: [],
      children: [],
    };
    if (llmNode.parentId) {
      const remapped = idMap.get(llmNode.parentId);
      if (remapped) node.parentId = remapped;
    }
    if (platformType !== "alternative_route") {
      node.routeId = request.selectedRouteId;
    }
    return node;
  });

  // 构造 children 数组：父节点 children 包含其子节点的稳定 id。
  const nodeById = new Map<string, BlueprintSpecTreeNode>();
  for (const node of platformNodes) nodeById.set(node.id, node);
  for (const node of platformNodes) {
    if (!node.parentId) continue;
    const parent = nodeById.get(node.parentId);
    if (parent) parent.children.push(node.id);
  }

  const ts = now().toISOString();
  const responseDigest = sha256(JSON.stringify(rawResponse ?? null));
  const structuredPayloadDigest = sha256(JSON.stringify(parsedData));
  const alternativeRouteIds = request.routeSet.routes
    .filter((r) => r.id !== request.selectedRouteId)
    .map((r) => r.id);

  return {
    id: `blueprint-spec-tree-${randomUUID()}`,
    routeSetId: request.routeSet.id,
    selectionId: `blueprint-selection-${request.jobId}`,
    selectedRouteId: request.selectedRouteId,
    rootNodeId: rootStableId,
    version: 1,
    status: "draft",
    createdAt: ts,
    updatedAt: ts,
    alternativeRouteIds,
    nodes: platformNodes,
    provenance: {
      jobId: request.jobId,
      githubUrls: [...request.githubUrls],
      targetText: request.targetText,
      generationSource: "llm",
      promptId: promptPayload.promptId,
      model,
      promptFingerprint: promptPayload.promptFingerprint,
      responseDigest,
      structuredPayloadDigest,
    },
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * 创建 SPEC 树 LLM 推导器。
 *
 * `derive()` 流程：
 *
 * 1. 旗标 / `BUILD_TARGET=test` / apiKey 缺失 → 直接 fallback（不写诊断）。
 * 2. Tier 1：尝试 MCP 抓取仓库上下文（best-effort，sub-timeout 为整体 1/3）。
 * 3. 构造 prompt 与 `AgentJobInput`，优先经 `liteAgentRuntime` 驱动 ReAct
 *    循环；缺 lite agent 时退路使用 `LlmCallFn` 直调（仍标 `"llm"`，但不
 *    产生中间事件流）。
 * 4. 解析 LLM JSON 输出，通过 `SpecTreeLlmResponseSchema` 校验，再做树关系
 *    校验（唯一 root / 无环 / 无孤儿 / 无自指）。
 * 5. 构造 `BlueprintSpecTree` 并返回；任何阶段失败都走 Tier 3 fallback，
 *    `recordBridgeInvocation` 写入 `mode: "simulated_fallback"`。
 *
 * `derive()` **绝不抛错**：任何意外异常被外层 `try/catch` 捕获后返回
 * `{ generationSource: "template", contextTier: "fallback", fallbackReason }`，
 * 由调用方走既有模板路径兜底。
 */
export function createSpecTreeLlmDerivation(
  deps: SpecTreeLlmDerivationDeps,
): SpecTreeLlmDerivation {
  return {
    derive: async (
      request: SpecTreeLlmDerivationRequest,
    ): Promise<SpecTreeLlmDerivationResult> => {
      // ── 顶层 try/catch：保证 derive() 永不抛错（Task 2.7） ──
      try {
        // ── Task 2.2：旗标 / BUILD_TARGET / apiKey 短路 ──
        const llmEnabled = process.env[ENV_LLM_ENABLED] === "true";
        const isTest = process.env[ENV_BUILD_TARGET] === "test";
        if (!llmEnabled || isTest) {
          deps.logger.debug("[spec-tree-llm] disabled by env, skipping LLM", {
            llmEnabled,
            isTest,
          });
          return {
            generationSource: "template",
            contextTier: "fallback",
            fallbackReason: "llm disabled",
          };
        }

        const aiConfig = getAIConfig();
        if (!aiConfig.apiKey || aiConfig.apiKey.trim().length === 0) {
          deps.logger.debug("[spec-tree-llm] apiKey missing, skipping LLM");
          return {
            generationSource: "template",
            contextTier: "fallback",
            fallbackReason: "apiKey missing",
          };
        }

        // ── 校验 selectedRouteId 在 routeSet 中存在 ──
        const selectedRoute = request.routeSet.routes.find(
          (r) => r.id === request.selectedRouteId,
        );
        if (!selectedRoute) {
          return fallbackWithDiagnostic(
            deps,
            "selected route not found in route set",
          );
        }

        const totalTimeoutMs = readPositiveIntEnv(
          ENV_TIMEOUT_MS,
          DEFAULT_TIMEOUT_MS,
        );
        const mcpSubTimeoutMs = Math.max(1, Math.floor(totalTimeoutMs / 3));

        // ── Task 2.3：Tier 1 仓库上下文抓取（best-effort） ──
        let repoTreeDigest: string | undefined;
        let keyFiles:
          | Array<{ path: string; content: string }>
          | undefined;
        let contextTier: "full" | "route-only" = "route-only";

        if (deps.mcpToolAdapter) {
          try {
            const mcpResult = await attemptRepoFetch(
              deps,
              request,
              mcpSubTimeoutMs,
            );
            if (mcpResult) {
              repoTreeDigest = mcpResult.repoTreeDigest;
              keyFiles = mcpResult.keyFiles;
              contextTier = "full";
            }
          } catch (err) {
            const reason = err instanceof Error ? err.message : String(err);
            deps.logger.warn(
              "[spec-tree-llm] mcp fetch failed, falling back to route-only",
              { reason: redactAndTruncate(reason) },
            );
            // 继续走 Tier 2，不视为致命。
          }
        }

        // ── 构造 prompt ──
        const promptPayload = buildSpecTreePrompt({
          request: {
            targetText: request.targetText,
            githubUrls: request.githubUrls,
          },
          routeSet: {
            id: request.routeSet.id,
            routes: request.routeSet.routes,
          },
          primaryRoute: selectedRoute,
          repoTreeDigest,
          keyFiles,
        });

        // ── Task 2.4：驱动 Lite Agent 或退路直调 ──
        let llmResponseRaw: unknown;
        try {
          if (deps.liteAgentRuntime) {
            const agentInput = buildAgentJobInput(
              request,
              promptPayload,
              Boolean(deps.mcpToolAdapter),
              totalTimeoutMs,
            );
            llmResponseRaw = await runLiteAgent(
              deps.liteAgentRuntime,
              agentInput,
              totalTimeoutMs,
            );
          } else {
            deps.logger.warn(
              "[spec-tree-llm] liteAgentRuntime missing, falling back to direct llmCall",
            );
            llmResponseRaw = await callLlmDirectly(
              deps.llmCall,
              promptPayload,
              totalTimeoutMs,
            );
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          deps.logger.warn("[spec-tree-llm] agent invocation failed", {
            reason: redactAndTruncate(message),
          });
          return fallbackWithDiagnostic(deps, `agent threw: ${message}`);
        }

        // ── Task 2.5：schema 校验 + 树关系校验 + BlueprintSpecTree 构造 ──
        const parsed = parseSpecTreeLlmResponse(llmResponseRaw);
        if (!parsed.ok) {
          deps.logger.warn("[spec-tree-llm] schema validation failed", {
            reason: redactAndTruncate(parsed.reason),
          });
          return fallbackWithDiagnostic(deps, parsed.reason);
        }

        const treeValidation = validateTreeStructure(parsed.data);
        if (!treeValidation.ok) {
          deps.logger.warn("[spec-tree-llm] tree construction failed", {
            reason: redactAndTruncate(treeValidation.reason),
          });
          return fallbackWithDiagnostic(
            deps,
            `tree construction failed: ${treeValidation.reason}`,
          );
        }

        let tree: BlueprintSpecTree;
        try {
          tree = buildBlueprintSpecTree({
            request,
            parsedData: parsed.data,
            rootLlmId: treeValidation.rootId,
            promptPayload,
            rawResponse: llmResponseRaw,
            model: aiConfig.model,
            now: deps.now,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          deps.logger.warn("[spec-tree-llm] tree assembly threw", {
            reason: redactAndTruncate(message),
          });
          return fallbackWithDiagnostic(
            deps,
            `tree construction failed: ${message}`,
          );
        }

        // ── Task 2.6：成功路径写入诊断 ──
        const degraded = contextTier === "route-only";
        safeRecordInvocation(deps, {
          mode: "real",
          error: degraded ? "degraded: mcp unavailable" : undefined,
        });

        return {
          tree,
          generationSource: "llm",
          contextTier,
          promptId: promptPayload.promptId,
          model: aiConfig.model,
          promptFingerprint: promptPayload.promptFingerprint,
          responseDigest: tree.provenance.responseDigest,
        };
      } catch (err) {
        // ── 顶层 try/catch 兜底（Task 2.7） ──
        const message = err instanceof Error ? err.message : String(err);
        deps.logger.warn("[spec-tree-llm] unexpected error in derive", {
          reason: redactAndTruncate(message),
        });
        return fallbackWithDiagnostic(deps, `unexpected error: ${message}`);
      }
    },
  };
}

/**
 * Tier 3 fallback 统一出口：
 *
 * - 脱敏并截断 `reason`；
 * - 写入诊断 `mode: "simulated_fallback"`（失败时静默吞掉，debug log）；
 * - 返回 `generationSource: "template"` / `contextTier: "fallback"` /
 *   `fallbackReason`。
 */
function fallbackWithDiagnostic(
  deps: SpecTreeLlmDerivationDeps,
  reason: string,
): SpecTreeLlmDerivationResult {
  const safeReason = redactAndTruncate(reason);
  safeRecordInvocation(deps, {
    mode: "simulated_fallback",
    error: safeReason,
  });
  return {
    generationSource: "template",
    contextTier: "fallback",
    fallbackReason: safeReason,
  };
}
