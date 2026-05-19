# 集成差距实测报告（2026-05-16）

> 目的：验证架构图（`/autopilot 整体目标架构图`）声称的 ~83% 完成度在端到端运行时是否真实。
> 触发命令：`npm run dev:all`，调用 `/api/blueprint/diagnostics` + `/api/blueprint/intake` + `/api/blueprint/intake/:intakeId/clarifications`。

## 摘要

- **任务清单层面**：架构图涉及的 18 份 spec 共 **1845/1849 任务勾完**，未勾的 4 项全部是 `*` 可选 manual smoke memo。
- **运行时实测层面**：除 `specDocsLlm` 外，**所有 capability bridge 都注册成功但未被主流程调用**；仓库分析未注入；澄清因主 LLM 提供商 500 而 hang 直到 10 分钟默认超时。

## 实测结果

### 1. 启动诊断快照（fresh server，counters 全 0）

```
docker                         mode=enabled   enabledByConfig=true   dependencyReady=false  (Docker 未安装，将走 fallback)
mcpGithub                      mode=enabled   enabledByConfig=true   dependencyReady=true
role                           mode=enabled   enabledByConfig=true   dependencyReady=true
aigcNode                       mode=enabled   enabledByConfig=true   dependencyReady=true
agentCrewStageActivation       mode=enabled   enabledByConfig=true   dependencyReady=true
roleContainerLoader            mode=enabled   enabledByConfig=true   dependencyReady=true
roleAutonomousAgent            mode=unknown   enabledByConfig=false  dependencyReady=false  (.env 已设 true，但诊断报 false)
agentReasoningBridge           mode=unknown   enabledByConfig=false  dependencyReady=false  (启动日志 "[blueprint] agentReasoningBridge enabled" 与诊断不一致)
specTreeLlm                    mode=enabled   enabledByConfig=true   dependencyReady=true
specDocsLlm                    mode=enabled   enabledByConfig=true   dependencyReady=true
```

### 2. Intake 阶段（POST /api/blueprint/intake）

```
intakeId               = blueprint-intake-74f67eac-797c-43f2-b956-772e3e153f8e
domainNotes 数量        = 0                            ← 没有任何仓库分析注入
assets[1].summary      = "Repository context placeholder for ..."
```

**事实**：intake 阶段**没有调用 `mcpGithub` 桥**，也**没有调用 `repo-context-fetcher.ts`**（之前为绕开 MCP 加的直连 GitHub REST API 路径）。生成的 `domainNotes` 为空，只有 placeholder asset。

### 3. Clarification 阶段（POST /api/blueprint/intake/:intakeId/clarifications）

```
客户端等待         = 120 秒（主动超时）
服务端日志         = 完全静默（没有 LLM 调用日志、没有错误日志、没有 capability bridge 调用日志）
diagnostics 终态  = 所有桥 totalInvocations 仍为 0
```

**根因**：
- `defaultPreviewClarificationQuestions(...)` 调用 `generatePreviewResponse(request, "judge")`，最多 3 个 pass。
- 每次 `generatePreviewResponse` 内部 `callLLMJson(...)` **没传 `timeoutMs` 也没传 `retryAttempts`**，落到默认 `LLM_TIMEOUT_MS = 600000` ms（10 分钟）。
- 主 LLM 提供商 `https://api-vip.codex-for.me/v1` **当前 500 错误**（直连 smoke test 确认）。
- 因此服务端在第一个 LLM 调用上 hang 10 分钟，120 秒 客户端超时窗口里啥都看不到。

### 4. 主 LLM 提供商直连 smoke test

```
POST https://api-vip.codex-for.me/v1/chat/completions
→ 远程服务器返回错误: (500) 内部服务器错误
```

## 差距清单

按"任务勾完 → 真实可见"的差距分类。

### A. 主流程未接通：声明的能力都没人调（最大差距）

| 桥 | tasks.md | 启动注册 | 主流程调用 | 应在哪个阶段被调 |
| --- | --- | --- | --- | --- |
| `docker` | 97/97 ✅ | enabled | 0 | spec_docs / preview / sandbox 推演 |
| `mcpGithub` | 125/125 ✅ | enabled | 0 | intake 阶段做仓库扫描；澄清阶段补上下文 |
| `role` | 147/147 ✅ | enabled | 0 | clarification / route / spec 各阶段角色协作 |
| `aigcNode` | 118/118 ✅ | enabled | 0 | route / spec / preview 阶段节点编排 |
| `agentCrewStageActivation` | 114/114 ✅ | enabled | 0 | 每阶段进入时激活角色 |
| `roleContainerLoader` | 117/117 ✅ | enabled | 0 | 角色激活时加载容器 |

**结论**：所有 capability spec 实现了 bridge module，但**没有把它们 wire 进主流程**。主流程从 intake → clarification → routeSet → specTree → specDocs → effectPreview 全程**完全没经过任何一条桥**。spec 任务清单只覆盖了"桥模块本身能跑"，没覆盖"主流程在该阶段会去调它"。

### B. 注册一致性问题

| 桥 | 启动日志 | 诊断面 | 状态 |
| --- | --- | --- | --- |
| `agentReasoningBridge` | `[blueprint] agentReasoningBridge enabled` | `enabledByConfig=false`, `dependencyReady=false` | 不一致：日志说启用，诊断说没启用 |
| `roleAutonomousAgent` | （无日志） | `enabledByConfig=false`, `dependencyReady=false` | `.env` 显式设 `true`，但诊断 false |

### C. LLM 调用没有兜底超时

`server/routes/nl-command.ts` `generatePreviewResponse` 调 `callLLMJson` 时不传 `timeoutMs`，最坏情况下 1 个澄清要 10 分钟。当主 LLM 不可用，整条主线全部静默 hang。

### D. 仓库分析回归

之前已经实现 `repo-context-fetcher.ts` 用 GitHub REST API，但在当前 intake handler 路径中**没被调用**（asset 只生成了 placeholder）。

## 这就是为什么图里显示 73%~85% 而不是 100%

| 架构层 | 图上 % | 我观察到的真实状态 | 真正完成度估计 |
| --- | --- | --- | --- |
| Step 2 Agent Crew | 93% | 桥模块在，但主流程不调 | ~50%（实现了，但没接） |
| Step 3 能力网络 | 85% | 4 桥 + Sandbox + MCP 注册成功，但 totalInvocations=0 | ~50%（同上） |
| Step 5 3D 伴随观察 | 75% | 只有事件总线接通，3D Fleet/HUD/Replay 无消费面 | ~30% |
| 主流程 | 78% | 单纯的 specDocsLlm 是真亮，其它都没跑过 | ~25% |
| 事件总线 12 家族 | 85% | role.* 一类能流到子时间线，其它 11 类没有 UI 消费 | ~15% |
| 目标闭环 | 73% | 反向回流（artifactMemory → 反哺 SPEC）从未端到端跑过 | ~10% |

## 优先收口建议（不需要再开 spec，需要写集成胶水代码）

按"用最少代码点亮最多面板"的优先级：

### P0：让主流程真的走桥（让 totalInvocations > 0）

1. 在 `intake` handler 里调用 `repo-context-fetcher.ts`（已存在），把 `domainNotes` 真实填上。
2. 在 `clarification` handler 进入时通过 `agentCrewStageActivation` 桥发出 `crew.stage.activated`。
3. 在 `routeSet` 生成时通过 `aigcNode` 桥发节点级事件。
4. 在 `specTree` 生成时通过 `role` 桥发角色协作事件。
5. 给 `generatePreviewResponse` 的 `callLLMJson` 调用加 `timeoutMs: 30000` + `retryAttempts: 1`。

### P1：把诊断面与启动日志对齐

1. `roleAutonomousAgent` 与 `agentReasoningBridge` 注入诊断 registry，让诊断面真实反映状态。
2. `.env` 中明确各桥的开关（`BLUEPRINT_*_ENABLED`），让 diagnostics 不再依赖默认 opt-out 推断。

### P2：UI 消费面拼装

1. 横向 capability rail（订阅 `capability.*` + `sandbox.*`）。
2. 角色态卡片（订阅 `crew.*` + `role.*`，按当前激活角色高亮）。
3. 3D Fleet 投影（订阅 `role.*` + `scene.*`，把当前角色映射到 Scene3D 中的 Agent）。
4. 全 12 家族 Replay Viewer。

### P3：反向回流

1. `evidence.*` → `artifactMemory` 持久化。
2. `artifactMemory` → 下一版 SPEC 的输入注入。
3. 端到端回归测试覆盖整条反哺路径。

## 不在本报告范围

- 不再开 spec。已有的 18 份 spec 已经把"砖块"全摆好。
- 不修改受保护文件（`agent-reasoning-bridge.ts` / `callback-receiver.ts` / `lite-agent-runtime.ts` / `llm-call.ts`）。
- 不依赖 LLM 上游可用性（report 已经记录上游 500 的事实，但修复不在本仓职责内；仓内能做的是给 LLM 调用加合理超时与回退）。
