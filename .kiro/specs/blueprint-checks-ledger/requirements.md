# 需求文档：Blueprint 校验台账 (Checks Ledger)

## 简介

Blueprint 管线中的 Quality Gate Checks Ledger（校验台账）是 SlideRule Skill 闭环架构 v4 中
`QA_LEDGER` 节点的 Web 端实现。它作为管线的责任中心，统一记录所有校验步骤的结果，包括
Schema 校验、不变量守卫、测试、内容质量检查、合并门禁、伴生层追踪与预览审计等。

现有 `artifact-ledger`（即 `BlueprintGenerationArtifact[]`）追踪产物版本，**而非**校验结果。
本模块填补该空缺：为每个 generation job 建立一份 append-only 的校验记录台账，支持查询、
导出与事件广播。

## 术语表

- **Checks_Ledger**：校验台账，承载单个 BlueprintGenerationJob 内所有校验步骤结果的有序集合
- **Ledger_Entry**：台账条目，单条校验结果记录，包含 stage、checkType、status、validator 等字段
- **Check_Type**：校验类型枚举，标识校验来源（schema / invariant / content_quality / test / merge_gate / companion_trace / preview_audit）
- **Check_Status**：校验结果状态（pass / fail / warn / skip）
- **Ledger_Store**：台账存储后端，负责持久化与查询
- **Event_Bus**：BlueprintEventBus 实例，用于广播台账事件
- **Job_Store**：BlueprintJobStore 实例，用于关联作业级持久化

## 需求

### 需求 1：统一校验记录写入

**用户故事：** 作为管线开发者，我希望所有校验步骤将结果统一写入校验台账，以便集中追踪每个 job 的质量门禁状态。

#### 验收标准

1. WHEN 任一管线校验步骤完成时，THE Checks_Ledger SHALL 接收一条包含 jobId、stage、checkType、checkName、status、validator、triggeredAt 的 Ledger_Entry 并追加到该 job 对应的台账中
2. THE Checks_Ledger SHALL 为每条 Ledger_Entry 生成唯一且稳定的 id
3. WHEN 一条 Ledger_Entry 被写入后，THE Checks_Ledger SHALL 保证该条目不可变（不允许更新或删除）
4. WHEN 写入 Ledger_Entry 时 jobId 对应的 job 不存在于 Job_Store 中，THEN THE Checks_Ledger SHALL 拒绝写入并返回错误
5. THE Checks_Ledger SHALL 支持以下 checkType 值：schema、invariant、content_quality、test、merge_gate、companion_trace、preview_audit
6. THE Checks_Ledger SHALL 在每条 Ledger_Entry 中记录可选字段：exitCode、output（截断至 4096 字节）、durationMs、metadata

### 需求 2：事件广播

**用户故事：** 作为管线观测系统，我希望每条校验记录写入时都能收到事件通知，以便实时展示校验进度。

#### 验收标准

1. WHEN 一条 Ledger_Entry 成功写入后，THE Checks_Ledger SHALL 通过 Event_Bus 发出一个 `checks.entry.recorded` 事件，事件 payload 包含完整的 Ledger_Entry
2. WHEN 一个 job 的所有校验全部通过（无 fail 状态条目）且至少存在一条 pass 条目，THE Checks_Ledger SHALL 通过 Event_Bus 发出一个 `checks.gate.passed` 事件
3. WHEN 一个 job 出现首条 fail 状态的 Ledger_Entry 时，THE Checks_Ledger SHALL 通过 Event_Bus 发出一个 `checks.gate.failed` 事件

### 需求 3：查询接口

**用户故事：** 作为前端开发者，我希望通过 REST API 查询某个 job 的校验台账，以便在驾驶舱中展示校验结果列表。

#### 验收标准

1. THE Checks_Ledger SHALL 提供 `GET /api/blueprint/jobs/:jobId/checks-ledger` 端点，返回该 job 的全部 Ledger_Entry 列表（按 triggeredAt 升序排列）
2. WHEN 查询的 jobId 不存在时，THEN THE Checks_Ledger SHALL 返回 HTTP 404 响应
3. THE Checks_Ledger SHALL 支持可选查询参数 `stage` 以过滤特定管线阶段的校验记录
4. THE Checks_Ledger SHALL 支持可选查询参数 `status` 以过滤特定结果状态的校验记录
5. THE Checks_Ledger SHALL 支持可选查询参数 `checkType` 以过滤特定校验类型的记录
6. THE Checks_Ledger SHALL 在响应中包含汇总统计：总条数、各 status 计数

### 需求 4：持久化与 Job Store 集成

**用户故事：** 作为系统运维者，我希望校验台账数据持久化到 Job Store 中，以便随 job 一起保存和恢复。

#### 验收标准

1. WHEN 一条 Ledger_Entry 被写入时，THE Checks_Ledger SHALL 将其持久化到 Job_Store 中对应 job 的 `checksLedger` 字段
2. THE Checks_Ledger SHALL 在 BlueprintGenerationJob 接口上扩展一个可选字段 `checksLedger: BlueprintChecksLedgerEntry[]`
3. WHEN 从 Job_Store 加载 job 时，THE Checks_Ledger SHALL 能从 `job.checksLedger` 恢复台账状态

### 需求 5：导出与工程交付集成

**用户故事：** 作为项目交付者，我希望校验台账被包含在工程交付包（md/zip）中，以便交付接收方能验证质量门禁通过情况。

#### 验收标准

1. WHEN engineering_handoff 阶段执行导出时，THE Checks_Ledger SHALL 以 Markdown 表格格式被包含在交付包中
2. THE Checks_Ledger SHALL 在导出时包含完整的条目列表和汇总统计
3. THE Checks_Ledger SHALL 导出时按 stage 分组、按 triggeredAt 排序呈现

### 需求 6：环境门禁与降级

**用户故事：** 作为运维工程师，我希望校验台账功能受环境变量门禁控制，以便在不需要时关闭该功能且不影响现有管线。

#### 验收标准

1. WHILE 环境变量 `BLUEPRINT_CHECKS_LEDGER_ENABLED` 值不为 `"true"` 时，THE Checks_Ledger SHALL 跳过所有写入操作，不发出事件，不持久化条目
2. WHILE 环境变量 `BLUEPRINT_CHECKS_LEDGER_ENABLED` 值不为 `"true"` 时，THE Checks_Ledger SHALL 在 `GET /api/blueprint/jobs/:jobId/checks-ledger` 端点返回空列表和零计数统计
3. THE Checks_Ledger SHALL 在 `GET /api/blueprint/diagnostics` 响应中新增一条 `checksLedger` entry，报告启用状态与条目总计

### 需求 7：台账条目数据完整性

**用户故事：** 作为质量审计人员，我希望每条校验记录都携带完整的来源追溯信息，以便准确定位校验来源。

#### 验收标准

1. THE Checks_Ledger SHALL 要求每条 Ledger_Entry 的 `validator` 字段标识执行校验的模块路径或脚本名称
2. THE Checks_Ledger SHALL 要求每条 Ledger_Entry 的 `triggeredAt` 字段为 ISO 8601 格式时间戳
3. THE Checks_Ledger SHALL 要求每条 Ledger_Entry 的 `stage` 字段为有效的 BlueprintGenerationStage 枚举值
4. IF 写入的 Ledger_Entry 缺少必填字段（jobId、stage、checkType、checkName、status、validator、triggeredAt），THEN THE Checks_Ledger SHALL 拒绝写入并返回验证错误
5. THE Checks_Ledger SHALL 将 `output` 字段截断至不超过 4096 字节，超出部分以 `[truncated]` 标记

### 需求 8：兼容性与非破坏性

**用户故事：** 作为测试工程师，我希望校验台账的引入不破坏现有 43+ E2E 测试用例，以便安全集成。

#### 验收标准

1. THE Checks_Ledger SHALL 在 `BLUEPRINT_CHECKS_LEDGER_ENABLED` 未设置或为非 `"true"` 值时，对现有管线行为零影响
2. THE Checks_Ledger SHALL 不修改现有 `BlueprintGenerationArtifact[]` 的结构或行为
3. THE Checks_Ledger SHALL 在 real 模式与 template（fallback）模式下均可用
4. THE Checks_Ledger SHALL 新增的 `checksLedger` 字段为可选字段，不影响未携带该字段的旧 job JSON 解析
