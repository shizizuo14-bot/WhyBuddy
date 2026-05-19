# Tasks

## Task 1: Context 扩展（追加 `roleAgentDelegator` 字段 + 默认装配）

- [x] 1.1 在 `BlueprintServiceContext` 接口中追加可选字段 `roleAgentDelegator?: RoleAgentDelegator`
- [x] 1.2 在 `buildBlueprintServiceContext` 中实现 `assembleRoleAgentDelegator()` 装配逻辑，仅当 env flag 为 `"true"` 时装配
- [x] 1.3 确保 env flag 关闭时 `roleAgentDelegator` 为 `undefined`，不产生任何额外开销

## Task 2: Planner Goal Builder（goal / systemPrompt / budget 构建）

- [x] 2.1 创建 `server/routes/blueprint/routeset/planner-goal-builder.ts` 模块
- [x] 2.2 实现 `buildPlannerGoal(request, intake?)` 函数，从 `targetText`、`githubUrls`、`intake` 提取关键信息生成结构化目标描述
- [x] 2.3 实现 `buildPlannerSystemPrompt(locale)` 函数，返回 Planner 角色系统提示词
- [x] 2.4 实现 `resolveAgentBudget(overrides?)` 函数，提供默认预算配置并支持 env 变量覆盖，值域 clamp 到有效范围

## Task 3: Agent Output Validator（schema 验证 + normalize）

- [x] 3.1 创建 `server/routes/blueprint/routeset/agent-output-validator.ts` 模块
- [x] 3.2 定义 `BlueprintRouteSetOutputSchema` JSON Schema 常量
- [x] 3.3 实现 `validateAndNormalizeAgentRouteSetOutput(raw, request, routeSetId, primaryRouteId, createdAt)` 函数
- [x] 3.4 确保验证失败返回 `null` 而非抛错，验证成功时补齐宿主侧字段（`routeSetId`、`primaryRouteId`、`provenance`）

## Task 4: Agent-Driven Generator（封装 delegate → RouteSet 转换）

- [x] 4.1 创建 `server/routes/blueprint/routeset/agent-driven-generator.ts` 模块
- [x] 4.2 实现 `createAgentDrivenRouteSetGenerator(delegator, fallbackGenerator)` 工厂函数
- [x] 4.3 实现内部 `generateRouteSetViaAgent()` 逻辑：构建 DelegateInput → 调用 delegate → 验证输出 → 成功返回或 fallback
- [x] 4.4 确保所有异常被内部捕获并走 fallback 路径，永不向调用方抛错

## Task 5: createGenerationJob 调用点替换（env flag 分支）

- [x] 5.1 在 `createGenerationJob` 中添加条件分支：当 `ctx.roleAgentDelegator != null` 且 env flag 为 `"true"` 时走 Agent 路径
- [x] 5.2 Agent 路径调用 `generateRouteSetViaAgent()` 并收集 `AgentDrivenRouteSetProvenance` 元数据
- [x] 5.3 Legacy 路径保持不变，确保 env flag 关闭时行为与升级前完全一致
- [x] 5.4 确保最终 `BlueprintRouteSet` 产物格式不变，`/api/blueprint/jobs` API 契约不变

## Task 6: Env flag 注册（resolver + .env.example）

- [x] 6.1 在 `.env.example` 中添加 `BLUEPRINT_AGENT_DRIVEN_PIPELINE_ENABLED=false` 及描述注释
- [x] 6.2 确保 `BUILD_TARGET=test` 时 Agent 路径不被激活（在装配逻辑中检查）
- [x] 6.3 验证 env flag 的读取位置与现有 env 变量管理方式一致

## Task 7: 单元测试

- [x] 7.1 为 `buildPlannerGoal()` 编写测试：验证不同 request 组合下的 goal 文本结构（含 githubUrls、含 intake、仅 targetText）
- [x] 7.2 为 `resolveAgentBudget()` 编写测试：验证默认值、env 变量覆盖、overrides 参数、值域 clamp
- [x] 7.3 为 `validateAndNormalizeAgentRouteSetOutput()` 编写测试：验证合法输出返回 BlueprintRouteSet、非法输出返回 null、不抛错
- [x] 7.4 为 `assembleRoleAgentDelegator()` 编写测试：验证 env flag 开关对装配结果的影响
- [x] 7.5 为 `generateRouteSetViaAgent()` 编写测试（mock delegator）：验证成功路径、Agent 失败走 fallback、输出校验失败走 fallback
- [x] 7.6 确保所有新增测试不扩大 TS 基线错误数（当前 113）

## Task 8: 集成测试（E2E）

- [x] 8.1 env flag OFF：验证完整 `createGenerationJob` 行为不变，delegate 未被调用
- [x] 8.2 env flag ON + mock delegator 返回有效输出：验证 Agent 路径端到端产出有效 RouteSet
- [x] 8.3 env flag ON + mock delegator 返回 failed：验证 fallback 到 routeSetLlmGenerator 并产出有效 RouteSet
- [x] 8.4 env flag ON + mock delegator 返回无效 schema 输出：验证 fallback 链路
- [x] 8.5 `BUILD_TARGET=test`：验证默认不激活 Agent 路径

## Task 9: 全量回归

- [x] 9.1 运行现有 blueprint 相关测试套件，确认全部通过
- [x] 9.2 运行 `node --run check`，确认 TS 错误数不超过基线 113
- [x] 9.3 验证 `.env.example` 更新不影响现有开发流程
- [x] 9.4 验证 env flag 默认关闭时，所有现有测试行为完全不变
