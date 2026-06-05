# 设计文档：Blueprint 校验台账 (Checks Ledger)

## 概述

本设计将 WhyBuddy Skill 闭环架构 v4 中的 `QA_LEDGER` 节点实现为 Web 端 Blueprint 管线的
校验台账模块。模块遵循现有 closure-based factory 模式（与 `createSpecTreeLlmService` /
`createEffectPreviewLlmService` 一致），通过 `BlueprintServiceContext` 注入所有依赖，不使用
模块级单例。

## §1 数据模型

### §1.1 共享类型 (`shared/blueprint/checks-ledger/types.ts`)

```typescript
/** 校验类型枚举 */
export type BlueprintCheckType =
  | "schema"
  | "invariant"
  | "content_quality"
  | "test"
  | "merge_gate"
  | "companion_trace"
  | "preview_audit";

/** 校验结果状态 */
export type BlueprintCheckStatus = "pass" | "fail" | "warn" | "skip";

/** 单条校验台账条目 */
export interface BlueprintChecksLedgerEntry {
  /** 唯一稳定 ID，格式：`chk-{jobId短前缀}-{序号}` */
  id: string;
  /** 关联的 generation job */
  jobId: string;
  /** 管线阶段 */
  stage: BlueprintGenerationStage;
  /** 校验类型 */
  checkType: BlueprintCheckType;
  /** 人类可读校验名称 */
  checkName: string;
  /** 结果状态 */
  status: BlueprintCheckStatus;
  /** 执行校验的模块路径或脚本名称 */
  validator: string;
  /** ISO 8601 触发时间戳 */
  triggeredAt: string;
  /** 脚本退出码（适用时） */
  exitCode?: number;
  /** 校验输出/消息（截断至 4096 字节） */
  output?: string;
  /** 校验耗时（毫秒） */
  durationMs?: number;
  /** 可扩展元数据 */
  metadata?: Record<string, unknown>;
}

/** 校验台账汇总统计 */
export interface BlueprintChecksLedgerSummary {
  total: number;
  pass: number;
  fail: number;
  warn: number;
  skip: number;
}

/** 校验台账查询响应 */
export interface BlueprintChecksLedgerResponse {
  jobId: string;
  entries: BlueprintChecksLedgerEntry[];
  summary: BlueprintChecksLedgerSummary;
}
```

### §1.2 Job Store 扩展 (`shared/blueprint/contracts.ts`)

在 `BlueprintGenerationJob` 接口上新增可选字段：

```typescript
export interface BlueprintGenerationJob {
  // ... existing fields ...
  /** 校验台账条目（可选，append-only） */
  checksLedger?: BlueprintChecksLedgerEntry[];
}
```

该字段为可选，不影响旧 job JSON 的解析。

## §2 设计决策

| ID | 决策 | 理由 |
|----|------|------|
| D1 | 台账条目存储在 `job.checksLedger[]` 数组中 | 与现有 `job.artifacts[]` 模式一致，跟随 job 生命周期 |
| D2 | 服务层通过 factory `createChecksLedgerService(ctx)` 创建 | 与 spec-tree / effect-preview 服务模式一致 |
| D3 | 写入操作为追加，不提供 update/delete API | 台账的核心约束是 append-only 不可篡改 |
| D4 | env gate `BLUEPRINT_CHECKS_LEDGER_ENABLED` 控制写入与事件发出 | 与现有 5 条 capability bridge 门禁模式一致 |
| D5 | output 字段截断 4096 字节 + `[truncated]` 后缀 | 避免单条校验日志撑爆 job JSON |
| D6 | 事件家族名 `checks`，不扩展 12 事件家族枚举 | 与 `role` 家族同理，仅在 event payload 中标识 |
| D7 | 条目 ID 格式 `chk-{jobId前8字符}-{sequence}` | 稳定且可排序 |
| D8 | 查询响应始终返回汇总统计 | 减少前端二次计算 |

## §3 模块结构

```
server/routes/blueprint/checks-ledger/
├── types.ts          # 服务层类型（ChecksLedgerService 接口）
├── service.ts        # createChecksLedgerService(ctx) factory
├── service.test.ts   # 单元测试
├── route.ts          # GET /api/blueprint/jobs/:jobId/checks-ledger 路由处理
├── route.test.ts     # 路由集成测试
├── export.ts         # Markdown 导出渲染器
└── export.test.ts    # 导出测试

shared/blueprint/checks-ledger/
├── types.ts          # BlueprintChecksLedgerEntry 等共享类型
└── index.ts          # barrel export
```

## §4 服务层设计

### §4.1 服务接口

```typescript
// server/routes/blueprint/checks-ledger/types.ts

export interface RecordCheckInput {
  jobId: string;
  stage: BlueprintGenerationStage;
  checkType: BlueprintCheckType;
  checkName: string;
  status: BlueprintCheckStatus;
  validator: string;
  exitCode?: number;
  output?: string;
  durationMs?: number;
  metadata?: Record<string, unknown>;
}

export interface GetChecksFilter {
  stage?: BlueprintGenerationStage;
  status?: BlueprintCheckStatus;
  checkType?: BlueprintCheckType;
}

export interface ChecksLedgerService {
  /** 追加一条校验记录 */
  recordCheck(input: RecordCheckInput): BlueprintChecksLedgerEntry;
  /** 查询某 job 的校验记录 */
  getChecks(jobId: string, filter?: GetChecksFilter): BlueprintChecksLedgerResponse;
  /** 判断某 job 是否通过所有检查（无 fail 条目且至少 1 条 pass） */
  isGatePassed(jobId: string): boolean;
  /** 渲染为 Markdown 导出格式 */
  renderMarkdown(jobId: string): string;
}
```

### §4.2 Factory 实现

```typescript
// server/routes/blueprint/checks-ledger/service.ts

export function createChecksLedgerService(
  ctx: BlueprintServiceContext
): ChecksLedgerService {
  const enabled = process.env.BLUEPRINT_CHECKS_LEDGER_ENABLED === "true";

  return {
    recordCheck(input) {
      // 1. Gate check
      if (!enabled) return createSkippedEntry(input, ctx);

      // 2. Validate required fields
      validateRecordInput(input);

      // 3. Resolve job from store
      const job = ctx.jobStore.get(input.jobId);
      if (!job) throw new Error(`job_not_found: ${input.jobId}`);

      // 4. Build entry
      const entry = buildEntry(input, job, ctx);

      // 5. Append to job.checksLedger[]
      appendToJob(job, entry, ctx.jobStore);

      // 6. Emit event
      emitEntryRecorded(ctx.eventBus, entry);

      // 7. Check gate status change
      checkGateTransition(ctx, job, entry);

      return entry;
    },

    getChecks(jobId, filter) { /* ... */ },
    isGatePassed(jobId) { /* ... */ },
    renderMarkdown(jobId) { /* ... */ },
  };
}
```

### §4.3 Entry 构建规则

- `id`: `chk-${jobId.slice(0, 8)}-${(job.checksLedger?.length ?? 0) + 1}`
- `triggeredAt`: 使用 `ctx.now().toISOString()`
- `output`: 若超过 4096 字节，截断并追加 `\n[truncated]`

### §4.4 Gate 状态转移逻辑

```
初始状态：无条目
  → recordCheck(status: "pass") → 发出 checks.gate.passed（如果无 fail）
  → recordCheck(status: "fail") → 发出 checks.gate.failed（首次 fail 时）
  → recordCheck(status: "warn") → 不触发 gate 事件
  → recordCheck(status: "skip") → 不触发 gate 事件
```

## §5 REST 路由设计

### §5.1 查询端点

```
GET /api/blueprint/jobs/:jobId/checks-ledger
  ?stage=spec_tree            (可选，过滤管线阶段)
  ?status=fail                (可选，过滤结果状态)
  ?checkType=schema           (可选，过滤校验类型)
```

**响应体** (200):
```json
{
  "jobId": "job-abc12345",
  "entries": [ /* BlueprintChecksLedgerEntry[] */ ],
  "summary": { "total": 5, "pass": 3, "fail": 1, "warn": 1, "skip": 0 }
}
```

**错误** (404):
```json
{ "error": "job_not_found" }
```

### §5.2 路由装配

在 `createBlueprintRouter(deps)` 中挂载：
```typescript
router.get("/jobs/:jobId/checks-ledger", checksLedgerRouteHandler(ctx));
```

## §6 事件集成

### §6.1 新增事件类型

| 事件名 | 触发时机 | Payload |
|--------|---------|---------|
| `checks.entry.recorded` | 每条 entry 成功写入 | 完整 `BlueprintChecksLedgerEntry` |
| `checks.gate.passed` | 首次判定通过（无 fail 且有 pass） | `{ jobId, summary }` |
| `checks.gate.failed` | 首条 fail 写入 | `{ jobId, entry, summary }` |

事件通过 `ctx.eventBus.emit()` 发出，遵循现有 `BlueprintGenerationEvent` 类型：

```typescript
{
  id: createId("checks-event"),
  jobId: entry.jobId,
  type: "checks.entry.recorded",
  family: "checks",
  stage: entry.stage,
  createdAt: entry.triggeredAt,
  payload: entry,
}
```

## §7 环境门禁与降级

| 场景 | `BLUEPRINT_CHECKS_LEDGER_ENABLED` | 行为 |
|------|-----------------------------------|------|
| 未设置 / 非 "true" | disabled | recordCheck 静默返回空 entry，不持久化，不发事件 |
| "true" | enabled | 完整写入、持久化、事件发出 |

诊断端点扩展：
```typescript
// GET /api/blueprint/diagnostics 响应新增：
{
  checksLedger: {
    enabled: boolean;
    totalEntries: number; // 全局累计
    lastRecordedAt: string | null;
  }
}
```

## §8 导出集成

### §8.1 Markdown 渲染格式

```markdown
## 校验台账 (Checks Ledger)

| # | 阶段 | 类型 | 名称 | 状态 | 校验器 | 时间 | 耗时 |
|---|------|------|------|------|--------|------|------|
| 1 | spec_tree | schema | SpecTree Schema Validation | ✅ pass | spec-tree/schema.ts | 2026-05-28T10:00:00Z | 12ms |
| 2 | spec_tree | invariant | Tree Depth ≤ 4 | ✅ pass | spec-tree/schema.ts | 2026-05-28T10:00:01Z | 2ms |
| 3 | effect_preview | schema | Effect Preview Schema | ❌ fail | effect-preview/schema.ts | 2026-05-28T10:00:05Z | 45ms |

### 汇总
- 总计: 3 | ✅ 通过: 2 | ❌ 失败: 1 | ⚠️ 警告: 0 | ⏭ 跳过: 0
```

### §8.2 集成点

在 `buildEngineeringLandingPlan` / engineering handoff 阶段，调用
`checksLedgerService.renderMarkdown(jobId)` 将结果追加到交付包中。

## §9 集成点（调用侧）

### §9.1 现有模块接入

| 调用位置 | checkType | checkName 示例 |
|---------|-----------|----------------|
| `spec-tree/service.ts` schema 校验后 | `schema` | "SpecTree LLM Response Schema" |
| `spec-tree/service.ts` flattenAndRemap 后 | `invariant` | "SpecTree Invariant Guard" |
| `effect-preview/service.ts` schema 校验后 | `schema` | "EffectPreview LLM Response Schema" |
| `route-schema.ts` 路线 schema 校验后 | `schema` | "RouteSet Schema Validation" |

### §9.2 未来接入（本轮不实现，预留接口）

| 调用位置 | checkType | 说明 |
|---------|-----------|------|
| 伴随式审查层 (CO) | `companion_trace` | 挑刺者/接地者留痕 |
| 内容质量校验 (QA_CONTENT) | `content_quality` | 验收 EARS 句式校验 |
| 出图审计 (EP_VIS_AUDIT) | `preview_audit` | check_previews_real |
| 合并门禁 (QA_MERGE) | `merge_gate` | 自动断言 + 人工目检 |

## §10 BlueprintServiceContext 扩展

在 `BlueprintServiceContext` 接口新增可选字段：

```typescript
export interface BlueprintServiceContext {
  // ... existing fields ...
  /** 校验台账服务实例（可选，未启用时为 undefined） */
  checksLedger?: ChecksLedgerService;
}
```

`buildBlueprintServiceContext()` 中按 env gate 决定是否装配：
```typescript
const checksLedger =
  process.env.BLUEPRINT_CHECKS_LEDGER_ENABLED === "true"
    ? createChecksLedgerService(ctx)
    : undefined;
```

## §11 测试策略

| 测试类型 | 覆盖项 |
|---------|--------|
| 单元测试 | recordCheck 字段校验、output 截断、ID 生成、gate 状态转移 |
| 集成测试 | REST 端点 200/404/filter、事件发出验证 |
| 属性测试 | append-only 不变量、entry ID 唯一性、output 长度不超限 |
| 兼容测试 | enabled=false 时零副作用、旧 job 无 checksLedger 字段时正常解析 |
