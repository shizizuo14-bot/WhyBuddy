# Web-AIGC 第二阶段集成计划

更新时间：2026-04-22

## 文档目标

本文件用于把 `web-aigc` 迁移工作从“10 条功能线首刀完成”推进到“主仓库主线集成、冲突收口、批量验证”的第二阶段。

这不是新的规划文档，而是基于当前真实代码落盘、主仓库已有兼容接线、以及后台智能体只读盘点结果形成的执行文档。

## 当前真实状态

- `10 / 10` 功能线已经完成第一段薄切片。
- `4 / 10` 能力线已经并入主仓并明确跑通自动化验证。
- `2 / 3` 平台底座薄切片已经并入主仓并明确跑通自动化验证。
- 主仓库已经提前吸收了一部分兼容能力，不再是“完全空白等待合并”状态。
- 当前主仓库已落盘的先行集成主要包括：
  - Office / History 面板里的 `web-aigc` 兼容监控视图
  - `workflow-store` 对监控实例、监控会话、终止动作的兼容接线
  - `auto-agent`、`risk-actions` 相关的一部分服务端兼容改动
  - `platform-a` 的统一 workflow domain / runtime engine / graph status 映射
  - `platform-b` 的 mission projection links 与 task projection/session 只读接口
  - `multimodal-output` 的 OCR provider 与 vision output 下载能力
  - `content-processing` 的 Web-AIGC RAG 兼容搜索 adapter
  - `controlflow` 的图投影 adapter 与 `control_flow` 边类型兼容
- 当前主瓶颈已经从“有没有人做”转成“如何把 10 条分线安全并回主线，并在依赖环境不一致的情况下保持可验证”。

## 第二阶段原则

### 1. 不按分支创建时间合并，按冲突半径和依赖顺序合并

优先把低冲突、边界清晰、能给后续主干减压的切片并回主仓库，再处理 mission / workflow / governance 这三条真正的平台主干。

### 2. 先收共享语义，再收热路由

像 `shared/*` 契约、状态映射、轻量 adapter 接口，优先于 `server/index.ts`、`server/routes/workflows.ts`、`server/routes/tasks.ts` 这种高热点文件。

### 3. 已在主仓库出现的能力，采用“对账式收口”

对 `tools-and-agents`、`risk-actions`、监控兼容这类已经部分进入主仓库的能力，不再机械地整分支搬运，而是按主仓库现状对账补差。

### 4. 高风险能力后置

涉及 `server/index.ts`、RAG 初始化、权限治理、审计链、共享 mission contract 的线，统一放到后半程，并要求更严格的验证。

## 后台只读结论摘要

### 第一组：平台底座

- `platform-b` 比 `platform-a` 更接近底座，应优先于 `platform-a` 做 mission / session / projection 收口。
- `platform-a` 当前更适合先吸收“共享运行时语义与轻量 runtime 骨架”，再晚一点处理 `workflows` 路由热区。
- `platform-c` 已经成形，但因为触达 `server/index.ts`、`shared/audit/contracts.ts`、`shared/permission/contracts.ts`，不适合早期直接硬并。

### 第二组：低冲突能力线

- `multimodal-output` 是当前唯一明确跑通过 `22` 个测试和 `node --run check` 的分线，优先级最高。
- `content-processing` 改动集中在 RAG 兼容搜索层，适合作为早期并回主线的能力线。
- `controlflow` 变更面相对集中，适合作为中早期并线对象。

补充说明：

- 上面三条低冲突能力线已经在主仓完成首轮集成与定向验证，下一步重点从“是否并入”切换为“如何与平台主干继续收口”。

### 第三组：中高冲突能力线

- `tools-and-agents` 方向明确，但命中 `server/index.ts`、`server/routes/a2a.ts`、`server/routes/skills.ts`、`server/routes/guest-agents.ts`，适合做主仓库对账式收口。
- `hitl-session` 横跨 `shared + client + server`，功能闭环强，但冲突半径较大，应放到平台主干之后。
- `dialogue-qa` 直接命中 `server/routes/chat.ts` 和 `server/routes/knowledge.ts`，适合放在较后阶段。
- `risk-actions` 触达 RAG 初始化、权限检查、审计挂接和 `server/index.ts`，属于最后一批高风险并线对象。

## 推荐集成顺序

### Batch 0：主仓库对账与共享层预收口

目标：先把能独立成立、又能降低后续冲突的共享层吸收入主仓库。

- `shared workflow-domain` 状态映射与统一语义
- `workflow graph projection` 对共享状态映射的复用
- 主仓库已存在的监控兼容、`auto-agent`、`risk-actions` 改动对账

说明：
- 这一批不追求“功能面最大”，追求“后面所有热文件少打一遍架”。

### Batch 1：低冲突、已证明成形的能力线

建议顺序：

1. `multimodal-output`
2. `content-processing`
3. `controlflow`

原因：
- 这三条线对主仓库的侵入面相对可控。
- 其中 `multimodal-output` 验证最完整，可以作为第二阶段的第一条正式合流线。

当前状态：

- `multimodal-output`：已并入主仓，`vision-routes / ocr-provider / vision-output` 测试已通过，`node --run check` 已通过。
- `content-processing`：已并入主仓，`rag-web-aigc-routes` 测试已通过，`node --run check` 已通过。
- `controlflow`：已并入主仓，`workflow-graph-projection` 定向测试已通过，`node --run check` 已通过。

### Batch 2：平台主干收口

建议顺序：

1. `platform-b`
2. `platform-a`
3. `platform-c`

原因：
- `platform-b` 先把 mission / session / projection links 稳住。
- `platform-a` 再把 runtime definition / runtime state / runtime run/resume 接到稳定的投影结构上。
- `platform-c` 最后把 governance / audit 作为横切能力并进来。

当前状态：

- `platform-b`：已并入主仓底座薄切片，`mission-store / mission-routes / workflows-routes / workflow-runtime-engine / workflow-graph-projection` 相关回归已通过，`node --run check` 已通过。
- `platform-a`：已并入主仓底座薄切片，统一 runtime/domain 语义已生效，更高冲突热区留待后续收口。
- `platform-c`：仍待正式主仓收口，建议继续维持后置。

### Batch 3：交互与节点入口能力

建议顺序：

1. `hitl-session`
2. `dialogue-qa`
3. `tools-and-agents`

说明：
- `tools-and-agents` 虽然功能价值高，但当前主仓库已经有部分先行接线，应以“对账补差”方式处理，不建议简单整分支搬运。

### Batch 4：高风险动作收尾

建议顺序：

1. `risk-actions`

说明：
- 该线必须建立在 `platform-c` 的治理审计能力和主仓库当前 RAG 启动路径已经稳定的前提下。

## 冲突热点

以下文件是第二阶段最容易出现人工冲突的热点，需要提前标记 ownership：

- `server/index.ts`
- `server/routes/workflows.ts`
- `server/routes/tasks.ts`
- `server/routes/chat.ts`
- `server/routes/knowledge.ts`
- `server/routes/rag.ts`
- `server/routes/a2a.ts`
- `server/routes/skills.ts`
- `server/routes/guest-agents.ts`
- `server/routes/vision.ts`
- `server/core/workflow-graph-projection.ts`
- `server/core/mission-enrichment-bridge.ts`
- `shared/mission/contracts.ts`
- `shared/mission/api.ts`
- `shared/workflow-input.ts`
- `shared/audit/contracts.ts`
- `shared/permission/contracts.ts`

## 验证批次

### 验证批次 A：共享层与图投影

- `server/tests/workflow-graph-projection.test.ts`
- `shared/__tests__/workflow-domain.test.ts`
- `node --run check`

当前结论：

- 已通过。当前主仓已经覆盖统一状态映射、runtime engine 和 controlflow graph projection 的定向验证。

### 验证批次 B：多模态与内容处理

- `server/tests/vision-routes.test.ts`
- `server/tests/ocr-provider.test.ts`
- `server/tests/vision-output.test.ts`
- `server/tests/rag-web-aigc-routes.test.ts`

当前结论：

- 已通过。`multimodal-output` 与 `content-processing` 的主仓兼容层已经完成自动化验证。

### 验证批次 C：workflow runtime / mission projection

- `server/tests/workflows-routes.test.ts`
- `server/tests/workflow-runtime-engine.test.ts`
- `server/tests/mission-routes.test.ts`
- `server/tests/mission-store.test.ts`

当前结论：

- 已通过。当前主仓已经覆盖 mission projection links、task projection/session 路由、workflow runtime 与相关图投影回归。

### 验证批次 D：治理与高风险动作

- `server/tests/permission-governance-audit-routes.test.ts`
- `server/tests/auto-agent-routes.test.ts`
- `server/tests/auto-agent-adapter.test.ts`
- `server/tests/web-aigc-risk-actions-routes.test.ts`
- `server/tests/vector-insert-adapter.test.ts`

## Ready / Blocked 判定

### 可优先集成

- `multimodal-output`
- `content-processing`
- `controlflow`

当前状态：

- 这三条已经完成主仓集成，后续不再作为“待接入项”，而是作为后续平台主干收口时的已落地依赖。

### 需要主仓库对账后集成

- `tools-and-agents`
- `platform-a`

### 需要主干先稳定后集成

- `platform-c`
- `hitl-session`
- `dialogue-qa`
- `risk-actions`

## 本轮执行决策

本轮不再继续增加新的 worktree 或新的 spec 文档，而是进入以下动作：

1. 更新第二阶段中文集成文档与实时看板。
2. 先把主仓库能独立成立的共享层与低冲突能力并入。
3. 再按 `Batch 1 -> Batch 2 -> Batch 3 -> Batch 4` 的顺序继续推进。

当前推进到：

1. 已完成共享层、`multimodal-output`、`content-processing`、`controlflow` 的主仓并入与验证。
2. 已完成 `platform-b` 的 mission / session / projection 链路底座收口与验证。
3. 当前执行重心转向 `platform-a` 更高冲突热区、`platform-c` 治理线，以及 `tools-and-agents` / `risk-actions` 的对账式收口。

## 结论

第二阶段不再是“继续把 58 个 spec 分得更细”，而是“把已经做出来的 10 条线安全并回主仓库”。

真正决定成败的，不是再多写多少份说明，而是：

- 合并顺序是否正确
- 热点文件 ownership 是否清晰
- 主仓库已有先行改动是否被对账吸收
- 每一批并线后是否能做最小验证
