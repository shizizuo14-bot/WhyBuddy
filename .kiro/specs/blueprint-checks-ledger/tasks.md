# 任务列表：Blueprint 校验台账 (Checks Ledger)

## 任务 1：共享类型定义

- [x] 1.1 创建 `shared/blueprint/checks-ledger/types.ts`，定义 `BlueprintCheckType`、`BlueprintCheckStatus`、`BlueprintChecksLedgerEntry`、`BlueprintChecksLedgerSummary`、`BlueprintChecksLedgerResponse` 类型
- [x] 1.2 创建 `shared/blueprint/checks-ledger/index.ts` barrel export
- [x] 1.3 在 `shared/blueprint/index.ts` 中增加对 `checks-ledger` 子模块的 re-export
- [x] 1.4 在 `shared/blueprint/contracts.ts` 的 `BlueprintGenerationJob` 接口上新增可选字段 `checksLedger?: BlueprintChecksLedgerEntry[]`

## 任务 2：服务层核心实现

- [x] 2.1 创建 `server/routes/blueprint/checks-ledger/types.ts`，定义 `RecordCheckInput`、`GetChecksFilter`、`ChecksLedgerService` 接口
- [x] 2.2 创建 `server/routes/blueprint/checks-ledger/service.ts`，实现 `createChecksLedgerService(ctx)` factory
  - [x] 2.2.1 实现 `recordCheck()`：env gate 检查、必填字段校验、entry 构建、追加到 job.checksLedger[]、事件发出、gate 状态转移
  - [x] 2.2.2 实现 `getChecks()`：从 jobStore 读取 job.checksLedger，应用 filter，计算 summary
  - [x] 2.2.3 实现 `isGatePassed()`：判断无 fail 条目且至少 1 条 pass
  - [x] 2.2.4 实现 `renderMarkdown()`：生成 Markdown 表格 + 汇总统计
- [x] 2.3 实现 output 字段截断逻辑（4096 字节 + `[truncated]` 后缀）
- [x] 2.4 实现 entry ID 生成逻辑（`chk-{jobId前8字符}-{sequence}`）

## 任务 3：事件集成

- [x] 3.1 在事件发出逻辑中实现 `checks.entry.recorded` 事件（每条 entry 写入后）
- [x] 3.2 实现 `checks.gate.passed` 事件（首次判定通过时）
- [x] 3.3 实现 `checks.gate.failed` 事件（首条 fail 写入时）
- [x] 3.4 确保事件遵循 `BlueprintGenerationEvent` 结构，family 为 `"checks"`

## 任务 4：REST 路由

- [x] 4.1 创建 `server/routes/blueprint/checks-ledger/route.ts`，实现 `GET /api/blueprint/jobs/:jobId/checks-ledger` 路由处理
- [x] 4.2 实现 query 参数解析：`stage`、`status`、`checkType` 过滤
- [x] 4.3 实现 404 响应（job 不存在时）
- [x] 4.4 在 `createBlueprintRouter(deps)` 中挂载新路由

## 任务 5：BlueprintServiceContext 扩展

- [x] 5.1 在 `BlueprintServiceContext` 接口新增可选字段 `checksLedger?: ChecksLedgerService`
- [x] 5.2 在 `buildBlueprintServiceContext()` 中按 env gate 装配 checksLedger 实例
- [x] 5.3 在 `GET /api/blueprint/diagnostics` 响应中新增 `checksLedger` entry（enabled / totalEntries / lastRecordedAt）

## 任务 6：导出集成

- [x] 6.1 创建 `server/routes/blueprint/checks-ledger/export.ts`，实现 Markdown 渲染逻辑
- [x] 6.2 在 engineering handoff 导出路径中调用 `checksLedgerService.renderMarkdown(jobId)` 追加校验台账到交付包

## 任务 7：现有模块接入

- [x] 7.1 在 `spec-tree/service.ts` 中，schema 校验（pass/fail）后调用 `ctx.checksLedger?.recordCheck()`
- [x] 7.2 在 `spec-tree/service.ts` 中，flattenAndRemap 成功后记录 invariant pass
- [x] 7.3 在 `effect-preview/service.ts` 中，schema 校验（pass/fail）后调用 `ctx.checksLedger?.recordCheck()`
- [x] 7.4 在 `routeset/route-schema.ts` 中，路线 schema 校验后调用 `ctx.checksLedger?.recordCheck()`

## 任务 8：单元测试

- [x] 8.1 创建 `server/routes/blueprint/checks-ledger/service.test.ts`
  - [x] 8.1.1 测试 recordCheck 必填字段校验（缺少字段时拒绝）
  - [x] 8.1.2 测试 output 截断逻辑
  - [x] 8.1.3 测试 entry ID 唯一性与格式
  - [x] 8.1.4 测试 env gate disabled 时静默返回
  - [x] 8.1.5 测试 gate 状态转移（pass → gate.passed，fail → gate.failed）
  - [x] 8.1.6 测试 jobId 不存在时抛错
- [x] 8.2 创建 `server/routes/blueprint/checks-ledger/route.test.ts`
  - [x] 8.2.1 测试 GET 200 正常查询
  - [x] 8.2.2 测试 GET 404 job 不存在
  - [x] 8.2.3 测试 query 参数过滤（stage / status / checkType）
- [x] 8.3 创建 `server/routes/blueprint/checks-ledger/export.test.ts`
  - [x] 8.3.1 测试 Markdown 渲染格式正确性

## 任务 9：兼容性验证

- [x] 9.1 运行现有 `server/tests/blueprint-routes.test.ts` 全部用例，确认无回归
- [x] 9.2 验证 `BLUEPRINT_CHECKS_LEDGER_ENABLED` 未设置时对现有管线行为零影响
- [x] 9.3 验证旧 job JSON（无 checksLedger 字段）正常解析不报错
