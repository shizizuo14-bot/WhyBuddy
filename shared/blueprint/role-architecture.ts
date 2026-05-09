/**
 * @module shared/blueprint/role-architecture
 *
 * 纯 TypeScript interface 定义，描述 Role System Architecture capability bridge
 * 产出的结构化角色架构 JSON。
 *
 * 本文件中的 `RoleArchitectureResponse` 与 server 侧
 * `server/routes/blueprint/role-system-architecture/schema.ts` 中
 * `z.infer<typeof RoleArchitectureResponseSchema>` 结构等价，
 * 供前端 / SDK / Browser Runtime 同构消费，无需引入 zod 运行时依赖。
 *
 * 字段形态与 `shared/blueprint/contracts.ts` 中既有
 * `BlueprintAgentRole` / `BlueprintRolePresence` 类型只读对齐：
 * - `AgentRoleEntry.id` 对应 `BlueprintAgentRole.id`（kebab-case 标识）
 * - `AgentRoleEntry.label` 对应 `BlueprintAgentRole.name` / `displayName`
 * - `AgentRoleEntry.responsibilities` 对应 `BlueprintAgentRole.responsibility`（单条 → 多条）
 * - `AgentRoleEntry.activationStages` 对应 `BlueprintAgentRole.defaultStages`（string[] 弱耦合）
 * - `AgentRoleEntry.permissions` 对应 `BlueprintAgentRole.permissions`
 *
 * 本文件 **不** 修改 `BlueprintAgentRole` / `BlueprintRolePresence` 的任何字段。
 */

/**
 * 单个 Agent 角色条目。
 *
 * 由 LLM 角色架构推理产出，经 server 侧 zod schema 严格校验后写入 evidence。
 */
export interface AgentRoleEntry {
  /** 角色唯一标识，kebab-case，首字符小写字母，长度 1-64 */
  id: string;
  /** 角色人可读标签，长度 1-80 */
  label: string;
  /** 角色职责列表，1-10 条，每条 1-200 字符 */
  responsibilities: string[];
  /** 角色活跃阶段列表，1-10 条，每条 1-64 字符 */
  activationStages: string[];
  /** 角色权限列表（可选），0-10 条，每条 1-120 字符 */
  permissions?: string[];
}

/**
 * Role System Architecture capability bridge 的完整响应。
 *
 * `roles` 数组长度约束 [1, 9]，与 `BlueprintAgentRole[]` 的 9 角色分类体系对齐。
 */
export interface RoleArchitectureResponse {
  /** 结构化角色数组，1-9 个角色 */
  roles: AgentRoleEntry[];
}
