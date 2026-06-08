# Design Document

Autopilot Brainstorm Companion Runtime

## Overview

把已存在但未接通的 brainstorm 辩论子系统接成一条可观察、可控、可审计的伴随运行时：

```
第二阶段开始
  → Decision Gate（主模型判断：是否辩论 / mode / roles）
  → BrainstormOrchestrator(session)
       · llmCaller = Pool-backed caller（5 个 ouyi key 并发，按角色取 key）
       · 多角色 Think→Act→Observe + challenge/rebuttal/vote
  → synthesizing
  → BrainstormSynthesizer.synthesize（主模型 gpt-5.5）
  → 主模型 Audit（证据支撑 / 未解决挑战 / 编造）→ checks ledger
  → session.branchNodes/edges/challenges/votes/synthesis
       → 映射为 BrainstormReasoningGraph（artifact: brainstorm_reasoning_graph）
       → 事件/artifact 喂前端 → BlueprintWallTexture 渲染（已修通）
  任一环节失败 → 降级回单 Agent / 确定性生成
```

核心原则：**复用，不重写**。`BrainstormOrchestrator` / `deliberation-protocol` / `vote-synthesizer` / `synthesizer` / `evidence-trail` / `role-registry` / `decision-gate` / `pipeline-integration` 已存在；本 spec 只新增 4 个接点（pool caller、主审计、图映射、第二阶段接线），全部 env-gated、可降级。

## Architecture

### 当前 vs 目标

```
当前：
  spec_docs 阶段 → DFS → pool(5 ouyi key) 并行写 requirements/design/tasks
  brainstorm 子系统存在但：单 llmCaller、未接主链、不喂墙

目标：
  辅模型层（ouyi pool, 并发）  = 多角色辩论（挑刺/接地/规划/研究/综合候选）
  主模型层（gpt-5.5）          = Decision Gate + Synthesis + Audit 收口
  投影层                       = session → BrainstormReasoningGraph → 3D 墙
```

### 模型分工（物理隔离）

| 层 | 模型 | 配置来源 | 角色 |
| --- | --- | --- | --- |
| 辩论辅层 | `ouyi-5-preview-thinking` | `BLUEPRINT_SPEC_DOCS_LLM_POOL_*`（5 key） | crew member 推理（并发、便宜、可降级） |
| 综合/审计主层 | `gpt-5.5` | `LLM_*` | Decision Gate、Synthesizer、Audit |

注意：pool 当前 env 变量名是 `BLUEPRINT_SPEC_DOCS_LLM_POOL_*`（spec-docs 专用语义）。本设计**复用**该 pool 配置而不新增重复变量；如需独立调参，后续可加 `BLUEPRINT_BRAINSTORM_POOL_*` 覆盖（可选，非必须）。

## Components and Interfaces

### 1. Pool-backed llmCaller（新增）

`server/routes/blueprint/brainstorm/pool-llm-caller.ts`

```ts
import type { LLMCallerFn } from "./orchestrator";
import { parseKeyPoolFromEnv, createLlmKeyPool, callLlmWithPoolKey } from "../llm-key-pool";

export function createPoolBackedBrainstormCaller(): LLMCallerFn | null {
  const config = parseKeyPoolFromEnv();
  if (!config) return null;           // 未配置 → 调用方回退单 caller
  const pool = createLlmKeyPool(config);
  return async (prompt, options) => {
    const entry = pool.next();         // round-robin 取 key
    return callLlmWithPoolKey(entry, config, /* system */ "", prompt);
  };
}
```

- 纯函数式封装：每次调用 `pool.next()` 取一个 key，调用 `callLlmWithPoolKey`（已存在）。
- 并发由 orchestrator 的并发模式（vote/division 用 `Promise.allSettled`）+ pool key 数共同决定。
- `signal` 透传给底层 fetch（`callLlmWithPoolKey` 当前用自身 timeout；signal 接入为可选增强）。

### 2. 主模型 caller + 审计（新增/接线）

- Synthesizer 与 Decision Gate 已经吃 `LLMCallerFn`；本 spec 注入的是**主模型 caller**（包装现有 `callLLMJson`/主 LLM 直调）。
- 新增 `auditSynthesis(synthesisResult, session, primaryCaller)`：用主模型对综合结论做一次校验，产出 `{ status: "pass"|"needs_review", reasons }`，写入 checks ledger（复用 `writeEvidenceToLedger` 通道）。

```ts
// server/routes/blueprint/brainstorm/synthesis-audit.ts
export interface SynthesisAuditResult {
  status: "pass" | "needs_review";
  reasons: string[];
  unresolvedChallengeCount: number;
}
export async function auditSynthesis(input: {
  synthesis: SynthesisResult;
  session: BrainstormSession;
  primaryCaller: LLMCallerFn;
}): Promise<SynthesisAuditResult>;
```

### 3. Session → BrainstormReasoningGraph 映射（新增）

`server/routes/blueprint/brainstorm/reasoning-graph-projection.ts`

```ts
import type { BrainstormSession } from "../../../../shared/blueprint/brainstorm-contracts";
import type { BrainstormReasoningGraph } from "../../../../shared/blueprint/brainstorm-reasoning-graph";

export function projectSessionToReasoningGraph(
  session: BrainstormSession,
  centralQuestionTitle: string,
): BrainstormReasoningGraph;
```

映射规则：
- 中心问题节点：`type:"question"`, id `central-question`, title = 阶段问题。
- 每个 crew member 的 branchNode → reasoning node：`thinking`→`hypothesis`、`observation`→`evidence`、`synthesis`→`synthesis`，role 信息填 `roleId/roleLabel`。
- challenge → 边 `conflicts`（challenger→target，label="质疑"）；rebuttal → 边 `supports`/`refines`。
- grounding/接地引用 → 边 `cites`（label="证据/依据"）。
- synthesis 节点 → 多条 `synthesizes` 边汇聚。
- telemetry：`tokenBurn=session.tokenUsed`、`activeRoleCount=crew size`、`remainingBudget=tokenBudget-tokenUsed`、`elapsedMs`。
- consoleLines：从 branchNode 的 thinking/observation 文案派生（Ask/Thinking/Observation/Report）。
- 输出前自检：所有边 source/target 必须在 nodes 内（含中心问题）；不满足则丢弃该边（保证 `isGraphRenderable`）。

产出通过既有 `brainstorm_reasoning_graph` artifact + 事件喂前端；前端 `BlueprintWallTexture` 的 structured graph 路径已能消费（本轮早前已修通并用 fixture 验证）。

### 4. 第二阶段接线（接线，env-gated）

- 复用 `assembleBrainstormContext(llmCaller, emitEvent)` + `executeStageWithBrainstorm(...)`。
- 在第二阶段 stage driver 处：若 `BLUEPRINT_BRAINSTORM_ENABLED==="true"`，用 **pool-backed caller** 作为 orchestrator 的 llmCaller、**主 caller** 作为 synthesizer/gate/audit 的 caller，启动 session；否则维持现有确定性生成。
- session 推进过程中周期性调用 `projectSessionToReasoningGraph` 并 emit/persist artifact。

## Data Models

复用既有契约，不新增破坏性字段：

- `BrainstormSession / BranchNode / BranchEdge / CrewMemberInstance / SynthesisResult`（`shared/blueprint/brainstorm-contracts.ts`）— 不变。
- `BrainstormReasoningGraph / Node / Edge / Telemetry / ConsoleLine`（`shared/blueprint/brainstorm-reasoning-graph.ts`）— 投影目标，不变。
- `LlmKeyPoolConfig / LlmKeyPoolEntry`（`llm-key-pool.ts`）— 复用。
- 新增内存型 `SynthesisAuditResult`（仅服务端，不入持久契约）。
- artifact type `brainstorm_reasoning_graph`（已存在 payload parser `brainstorm-reasoning-graph-payload.ts`）。

## Correctness Properties

### Property 1: 投影图恒可渲染

对任意 `BrainstormSession` 状态（任意 branchNodes/edges/challenges 组合，含空、含失败成员、含未完成 synthesis），`projectSessionToReasoningGraph` 的输出恒满足 `isGraphRenderable`：每条边的 `source`/`target` 都存在于 `nodes`（含中心问题节点），且 `nodes` 非空。

**Validates: Requirements 3.1, 3.5, 7.1**

### Property 2: 降级永不抛错

对任意 key 失败组合（pool 全失败 / 部分失败 / 主 caller 失败 / 投影抛错），`executeStageWithBrainstorm` 恒返回一个 `StageResult`（type 为 `single-agent` 或 `brainstorm`），永不向上抛错。

**Validates: Requirements 1.4, 6.1, 7.2**

### Property 3: 主辅模型隔离

辩论阶段的 LLM 调用恒走 pool-backed caller（aux），综合/审计阶段的 LLM 调用恒走主 caller（primary）；两者可注入、可在测试中区分计数，never crossed。

**Validates: Requirements 2.1, 2.4, 7.3**

## Error Handling

- **pool 未配置**：`createPoolBackedBrainstormCaller` 返回 `null` → 调用方用主 caller 或现有单 caller，不报错。
- **单 key 失败（503/超时）**：该角色走既有 `failMember`/fallback，不阻塞其它角色；计入 degradation。
- **session 超时**：既有 120s watchdog `forceTerminateSession` → 带部分结果进 synthesis。
- **综合/审计失败**：降级为「无审计的综合结论」并标注，或回退单 Agent；不抛错。
- **投影失败**：try/catch 包裹，失败则跳过该次墙面更新（墙保留上一帧 / 空态），不影响 job。
- **总开关关闭**：完全不进入伴随层，零副作用。

## Testing Strategy

### 单元 / 属性测试
- `reasoning-graph-projection.test.ts`：Property 1（fast-check 枚举 session 形态 → 恒 `isGraphRenderable`）。
- `pool-llm-caller.test.ts`：pool 配置存在→返回 caller、轮询取 key；未配置→返回 null。
- `synthesis-audit.test.ts`：pass / needs_review 分支；未解决挑战计数。
- `pipeline-integration` 扩展测试：Property 2（key 失败组合下不抛错、降级）、Property 3（辩论用 aux caller、综合用 primary caller，注入 spy 区分计数）。

### 接线 / 回归
- 复用既有 brainstorm 测试（orchestrator/deliberation/vote/synthesizer/evidence）保持绿。
- `BLUEPRINT_BRAINSTORM_ENABLED` 关闭时，第二阶段行为与改动前一致（快照/SSR 断言）。
- `node --run check` 不扩大基线。

### 手动 / 视觉
- 开 `BLUEPRINT_BRAINSTORM_ENABLED`，跑一个第二阶段 job，确认 3D 墙出现辩论发散图（中心问题 + 多角色 + 挑战连线 + 投票 + 综合 + telemetry + console），接近参考图。

## Non-Goals

- 不新增场景系统（SceneSpace/ThemeConfig）——那是后续「场景化推演引擎」spec。
- 不重写 3D 渲染器 / CinematicScheduler（另立 spec）。
- 不改 spec 树/文档最终产物形态与 `/tasks` 深链。
- 不新增第二套 mission/runtime 真相源。
- 不强制把辩论结论覆盖确定性生成（先作为上游上下文/墙面投影；是否替换生成由 Req 4 接线决定，默认保守）。

## Rollout / Flags

- 主开关：`BLUEPRINT_BRAINSTORM_ENABLED`（默认 off；`BUILD_TARGET=test` 默认 off，opt-in 打开）。
- pool 复用 `BLUEPRINT_SPEC_DOCS_LLM_POOL_*`；可选新增 `BLUEPRINT_BRAINSTORM_POOL_*` 覆盖。
- 建议先以「旁路 + 喂墙」上线（Req 4 的 session 启动 + 投影），验证视觉与成本后，再决定是否让综合结论参与 spec 文档生成主链。
