/**
 * `autopilot-role-autonomous-agent` spec Task 3.1–3.4：工具注册协议。
 *
 * 将角色运行时上下文中的 MCP / Skill / AIGC 节点绑定，连同两个内置工具
 * （`finish` / `think`），统一转换成 Agent Loop 可消费的
 * {@link AgentToolDefinition} 数组。
 *
 * 关键约束：
 * - 纯函数：只读 `roleCtx.mcp.list()` / `roleCtx.skill.list()` /
 *   `roleCtx.aigcNode.list()`，不触发 logger、不 emit 事件。
 * - 不做去重：如果 ctx 上 list 本身包含重复元素，输出也保留重复，重复处理
 *   归属 loader 侧，本模块保持可预测的一一映射。
 * - 字段完整：每个 {@link AgentToolDefinition} 都填齐 id / name / description /
 *   category / inputSchema / requiresProxy / timeoutMs 七个必填字段。
 * - 输出顺序：mcp → skill → aigc → builtin，便于测试与 LLM function schema
 *   稳定排序。
 *
 * 对应 design.md §10.3 的伪代码；由于当前 loader 暴露的 `mcp.list()` /
 * `skill.list()` / `aigcNode.list()` 只能拿到 id 字符串，本实现先使用 spec 给
 * 出的通用输入 schema 与描述模板。后续若 loader 扩展出 schema/description
 * 读取能力，本模块可就地升级而不改变外部调用形态。
 */

import type { AgentToolDefinition } from "../../../../shared/blueprint/agent-tool.js";
import type { RoleRuntimeContext } from "../role-container-loader/loader.js";

/** MCP 工具统一超时：30 秒。 */
const MCP_TOOL_TIMEOUT_MS = 30_000;
/** Skill 工具统一超时：60 秒。 */
const SKILL_TOOL_TIMEOUT_MS = 60_000;
/** AIGC 节点工具统一超时：120 秒。 */
const AIGC_NODE_TOOL_TIMEOUT_MS = 120_000;
/** 内置工具统一超时：1 秒。 */
const BUILTIN_TOOL_TIMEOUT_MS = 1_000;

/**
 * 通用的 open-object 输入 schema：LLM 侧能看到一个接受任意参数的对象。
 * 与 design §10.3 一致；后续若 loader 暴露 per-tool schema，会替换这一层。
 */
const OPEN_OBJECT_INPUT_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {},
  additionalProperties: true,
};

/**
 * 内置 `finish` 工具的 inputSchema：要求 `output` 字段。
 */
const FINISH_INPUT_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: { output: {} },
  required: ["output"],
};

/**
 * 内置 `think` 工具的 inputSchema：要求 `thought` 字符串字段。
 */
const THINK_INPUT_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: { thought: { type: "string" } },
  required: ["thought"],
};

/**
 * 把一个角色的运行时绑定转换为 Agent Loop 可直接喂给 LLM 的工具定义列表。
 *
 * 输出顺序固定为：
 * 1. 所有 MCP 工具（category `"mcp"`）
 * 2. 所有 Skill 工具（category `"skill"`）
 * 3. 所有 AIGC 节点工具（category `"aigc_node"`）
 * 4. 两个内置工具（category `"builtin"`）：`builtin.finish` 与 `builtin.think`
 *
 * @param roleCtx 角色运行时上下文；仅读取 mcp / skill / aigcNode 的 `list()`。
 * @returns 新构造的 {@link AgentToolDefinition} 数组。每次调用返回新数组。
 */
export function buildToolDefinitions(
  roleCtx: RoleRuntimeContext,
): AgentToolDefinition[] {
  const tools: AgentToolDefinition[] = [];

  // MCP 工具：每个 MCP server id 对应一个代理型工具。
  for (const mcpId of roleCtx.mcp.list()) {
    tools.push({
      id: `mcp.${mcpId}`,
      name: `mcp_${mcpId}`,
      description: `MCP server: ${mcpId}`,
      category: "mcp",
      inputSchema: { ...OPEN_OBJECT_INPUT_SCHEMA },
      requiresProxy: true,
      timeoutMs: MCP_TOOL_TIMEOUT_MS,
    });
  }

  // Skill 工具：每个 skill id 对应一个代理型工具。
  for (const skillId of roleCtx.skill.list()) {
    tools.push({
      id: `skill.${skillId}`,
      name: `skill_${skillId}`,
      description: `Skill: ${skillId}`,
      category: "skill",
      inputSchema: { ...OPEN_OBJECT_INPUT_SCHEMA },
      requiresProxy: true,
      timeoutMs: SKILL_TOOL_TIMEOUT_MS,
    });
  }

  // AIGC 节点工具：每个 on-demand aigc node id 对应一个代理型工具。
  for (const nodeId of roleCtx.aigcNode.list()) {
    tools.push({
      id: `aigc.${nodeId}`,
      name: `aigc_${nodeId}`,
      description: `AIGC node: ${nodeId}`,
      category: "aigc_node",
      inputSchema: { ...OPEN_OBJECT_INPUT_SCHEMA },
      requiresProxy: true,
      timeoutMs: AIGC_NODE_TOOL_TIMEOUT_MS,
    });
  }

  // 内置工具：始终注册，不走 tool proxy。
  tools.push(
    {
      id: "builtin.finish",
      name: "finish",
      description: "完成任务并返回最终产物",
      category: "builtin",
      inputSchema: { ...FINISH_INPUT_SCHEMA },
      requiresProxy: false,
      timeoutMs: BUILTIN_TOOL_TIMEOUT_MS,
    },
    {
      id: "builtin.think",
      name: "think",
      description: "记录思考过程（不执行动作）",
      category: "builtin",
      inputSchema: { ...THINK_INPUT_SCHEMA },
      requiresProxy: false,
      timeoutMs: BUILTIN_TOOL_TIMEOUT_MS,
    },
  );

  return tools;
}
