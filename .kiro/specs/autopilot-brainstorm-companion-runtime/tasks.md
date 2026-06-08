# Implementation Plan: Autopilot Brainstorm Companion Runtime

## Overview

把已存在的 brainstorm 辩论子系统接通成伴随运行时：pool-backed 并发辩论（辅 ouyi）+ 主模型综合/审计 + Session→BrainstormReasoningGraph 投影喂 3D 墙 + 第二阶段 env-gated 接线。全部可降级、不扩大基线。采用保守路线：先「旁路 + 喂墙」，再视情况接生成主链。

服务端测试用 `vitest.config.server.ts`；客户端用 `client/src`。新增能力默认 `BLUEPRINT_BRAINSTORM_ENABLED` 关闭、`BUILD_TARGET=test` 关闭，opt-in 打开。

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1", "2", "3"] },
    { "wave": 2, "tasks": ["4", "5"] },
    { "wave": 3, "tasks": ["6"] },
    { "wave": 4, "tasks": ["7", "8"] }
  ]
}
```

```
1 pool caller ─┐
2 audit       ─┼─→ 4 接线(orchestrator 注入) ─→ 6 第二阶段触发+喂墙 ─→ 7 诊断 / 8 手测
3 图投影      ─┘                                  └─→ 5 投影接 artifact/事件 ─┘
```

## Tasks

- [ ] 1. Pool-backed brainstorm llmCaller
  - 新建 `server/routes/blueprint/brainstorm/pool-llm-caller.ts`，导出 `createPoolBackedBrainstormCaller(): LLMCallerFn | null`
  - 复用 `parseKeyPoolFromEnv` / `createLlmKeyPool` / `callLlmWithPoolKey`（`../llm-key-pool`）；每次 `pool.next()` 轮询取 key
  - pool 未配置时返回 `null`（调用方回退）；单次调用失败按既有抛错语义（由 orchestrator 的 failMember 接住）
  - _Requirements: 1.1, 1.2, 1.3, 1.5_

- [ ] 2. 主模型综合审计 synthesis-audit
  - 新建 `server/routes/blueprint/brainstorm/synthesis-audit.ts`，导出 `auditSynthesis({ synthesis, session, primaryCaller }): Promise<SynthesisAuditResult>`
  - 用主 caller 校验综合结论：证据是否支撑、未解决挑战数、是否编造 → `status: "pass"|"needs_review"` + reasons
  - 任意异常降级为 `{ status:"needs_review", reasons:["audit failed: ..."] }`，不抛错
  - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [ ] 3. Session→BrainstormReasoningGraph 投影
  - 新建 `server/routes/blueprint/brainstorm/reasoning-graph-projection.ts`，导出 `projectSessionToReasoningGraph(session, centralQuestionTitle): BrainstormReasoningGraph`
  - 映射：中心问题节点 + 角色节点（thinking→hypothesis/observation→evidence/synthesis→synthesis）；challenge→`conflicts`(label 质疑)、rebuttal→`supports`、grounding→`cites`、synthesis→`synthesizes`
  - 填 telemetry（tokenBurn/activeRoleCount/remainingBudget/elapsedMs）+ consoleLines；输出前剔除悬挂边，保证 `isGraphRenderable`
  - _Requirements: 3.1, 3.2, 3.4, 3.5_

- [ ] 4. 编排注入：辩论用 pool caller、综合/审计用主 caller
  - 在 `pipeline-integration.ts`（`assembleBrainstormContext` / `executeStageWithBrainstorm`）注入：orchestrator 的 `llmCaller` = `createPoolBackedBrainstormCaller() ?? 主caller`；synthesizer/decision-gate/audit = 主 caller
  - 综合后调用 `auditSynthesis`，结果经 `writeEvidenceToLedger` 写入 checks ledger；needs_review 时在 StageResult 标注
  - 保证主辅 caller 物理隔离、可注入（便于测试区分计数）
  - _Requirements: 1.1, 2.1, 2.2, 2.4, 6.1_

- [ ] 5. 投影接 artifact / 事件喂墙
  - session 推进过程中（节点更新 / synthesis 完成）调用 `projectSessionToReasoningGraph`，以 `brainstorm_reasoning_graph` artifact + 事件增量 emit（复用既有 payload parser）
  - 确认前端 `BlueprintWallTexture` structured graph 路径消费该 artifact（已修通，无需改渲染器）
  - 投影失败 try/catch 跳过本次更新，不影响 job
  - _Requirements: 3.3, 6.1_

- [ ] 6. 第二阶段 env-gated 触发
  - 在第二阶段 stage driver 接入 `executeStageWithBrainstorm`：`BLUEPRINT_BRAINSTORM_ENABLED==="true"` 才经 Decision Gate 启动 session；否则维持现有确定性生成路径零变化
  - 保守路线：综合结论先作为上游上下文 + 墙面投影，不强制替换 spec 文档生成
  - `BUILD_TARGET=test` 默认关闭，opt-in 打开
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 6.2_

- [ ] 7. 诊断与可观测
  - `GET /api/blueprint/diagnostics` 暴露 brainstorm 诊断（复用 `getBrainstormDiagnostics`）+ pool 使用 / 降级计数
  - 降级时 emit `brainstorm.degraded` 并计入 `degradationCount`
  - _Requirements: 5.1, 5.2, 5.3_

- [ ] 8. 测试与回归
  - 属性测试：Property 1（投影恒 `isGraphRenderable`，fast-check 枚举 session 形态）、Property 2（key 失败组合下 `executeStageWithBrainstorm` 不抛错）、Property 3（辩论走 aux caller / 综合走主 caller，注入 spy 区分）
  - 单元：`pool-llm-caller` / `synthesis-audit` / `reasoning-graph-projection`
  - 回归：既有 brainstorm 测试保持绿；`BLUEPRINT_BRAINSTORM_ENABLED` 关闭时第二阶段行为零变化；`node --run check` 不扩大基线
  - _Requirements: 6.3, 6.4, 7.1, 7.2, 7.3_

## Notes

- 复用，不重写：orchestrator/deliberation/vote/synthesizer/evidence/role-registry/decision-gate/pipeline-integration 已存在。
- pool 复用 `BLUEPRINT_SPEC_DOCS_LLM_POOL_*`；如需独立调参再加 `BLUEPRINT_BRAINSTORM_POOL_*`（可选，本计划不含）。
- 保守上线：先旁路喂墙，验证视觉/成本后再决定是否让综合结论参与生成主链。
- 不做：场景系统、3D 引擎重写、CinematicScheduler（各自另立 spec）。
