# Autopilot Spec 执行计划（2026-05-08 快照）

配套图表：[`autopilot-spec-execution-progress-2026-05-08.svg`](./autopilot-spec-execution-progress-2026-05-08.svg)

分支：`feat/project-autopilot-blueprint`

---

## 一句话概括

为了闭合架构图（`docs/autopilot-target-experience-architecture-2026-05-07.svg`）里"澄清之后每一步都应由真实能力网络驱动"的承诺，共落地 **9 份 spec**（1 份已有 tasks + 8 份 requirements-first 首轮），按 4 个 wave 并行推进，最终把 RouteSet → SPEC Tree → SPEC Documents → Effect Preview → Prompt Package → Engineering Handoff 每一环从"模板字符串拼接"升级为"LLM + 严格 schema + fallback + provenance"，并把 sandbox derivation 的 4 个 simulated capability 换成真实 Docker / MCP / LLM / 角色架构推理。

---

## 9 份 spec 当前状态

| # | Spec | Wave | 状态 | 源文件 |
| - | ---- | ---- | ---- | ---- |
| 1 | `autopilot-routeset-llm-generation` | 0 | `tasks.md` 已就绪 | `.kiro/specs/autopilot-routeset-llm-generation/` |
| 2 | `autopilot-capability-bridge-docker` | 1 | `requirements.md` 已就绪 | `.kiro/specs/autopilot-capability-bridge-docker/` |
| 3 | `autopilot-capability-bridge-mcp` | 1 | `requirements.md` 已就绪 | `.kiro/specs/autopilot-capability-bridge-mcp/` |
| 4 | `autopilot-capability-bridge-aigc-node` | 1 | `requirements.md` 已就绪 | `.kiro/specs/autopilot-capability-bridge-aigc-node/` |
| 5 | `autopilot-capability-bridge-role` | 1 | `requirements.md` 已就绪 | `.kiro/specs/autopilot-capability-bridge-role/` |
| 6 | `autopilot-agent-crew-stage-activation` | 2 | `requirements.md` 已就绪 | `.kiro/specs/autopilot-agent-crew-stage-activation/` |
| 7 | `autopilot-spec-tree-llm` | 3 | `requirements.md` 已就绪 | `.kiro/specs/autopilot-spec-tree-llm/` |
| 8 | `autopilot-spec-documents-llm` | 3 | `requirements.md` 已就绪 | `.kiro/specs/autopilot-spec-documents-llm/` |
| 9 | `autopilot-effect-preview-llm` | 3 | `requirements.md` 已就绪 | `.kiro/specs/autopilot-effect-preview-llm/` |
| 10 | `autopilot-prompt-package-llm` | 3 | `requirements.md` 已就绪 | `.kiro/specs/autopilot-prompt-package-llm/` |
| 11 | `autopilot-engineering-handoff-llm` | 3 | `requirements.md` 已就绪 | `.kiro/specs/autopilot-engineering-handoff-llm/` |

> Wave 0 = 已封板入口；Wave 1 = capability bridges；Wave 2 = 依赖角色桥的 Agent Crew 驱动；Wave 3 = downstream LLM 生成。

---

## 依赖关系（只有 2 条硬约束）

1. `autopilot-agent-crew-stage-activation` **强依赖** `autopilot-capability-bridge-role` 的结构化角色 JSON（R4.6 / R9.3 保证可检索）。
2. Wave 3 的 5 条 downstream LLM **弱依赖** Wave 0 的 RouteSet LLM（它们需要选中的 primary route 作为 prompt 输入；没有真实 route，也能跑，只是输入变成模板路线）。

其它组合都可以并行。

---

## 并行执行建议

### 🟢 Agent A — Wave 0 实施

开箱即用：

```powershell
# 在 feat/project-autopilot-blueprint 分支上
# 跟着 .kiro/specs/autopilot-routeset-llm-generation/tasks.md 的 15 步执行
```

预期产出：
- `shared/blueprint/contracts.ts` 追加 `BlueprintRouteSet.provenance` 可选字段
- `server/routes/blueprint/routeset/` 下 3 个新源文件 + 3 个 co-located 测试文件
- `server/routes/blueprint.ts` 的 `buildRouteSet()` / `createGenerationJob()` / `handleCreateGenerationJob` 改为 async
- `server/tests/blueprint-routes.test.ts` 追加 2 条 E2E

### 🟡 Agents B–E — Wave 1 四条桥并行

每人开一个 worktree：

| Agent | Spec | Worktree 建议名 |
| ----- | ---- | ---- |
| B | `autopilot-capability-bridge-docker` | `cpo-bridge-docker` |
| C | `autopilot-capability-bridge-mcp` | `cpo-bridge-mcp` |
| D | `autopilot-capability-bridge-aigc-node` | `cpo-bridge-aigc-node` |
| E | `autopilot-capability-bridge-role` | `cpo-bridge-role` |

每位都要按 `requirements-first` 流程依次产出 `design.md` → `tasks.md` → 实施。4 条桥**彼此完全无依赖**，只共享 `BlueprintServiceContext` 与既有测试基线。

> 🎯 优先级提示：**Agent E（role bridge）最好最先完工**，这样 Agent F 的 Wave 2 才能动工。B/C/D 的完工顺序无关紧要。

### 🟣 Agent F — Wave 2（需要 role bridge 有 evidence 写入）

可以先做 `design.md`，等 Agent E 合并后再做 tasks + 实施。核心点：

- 从 evidence store 按 `jobId / routeSetId / primaryRouteId` 检索角色 JSON
- 根据每 role 的 `activationStages`，在 stage 过渡时发 `role.activated / watching / reviewing / sleeping` 事件
- 上游 fallback → 本 driver 也 fallback，保持既有测试通过
- 可能需要扩展 `BlueprintEventName.RoleSleeping`（前 4 个桥禁止新增事件名，这里允许）

### 🔵 Agents G–K — Wave 3 五条 downstream LLM

全部彼此独立，可直接 5 人开工：

| Agent | Spec | 目标函数 |
| ----- | ---- | ---- |
| G | `autopilot-spec-tree-llm` | `buildSpecTreeFromRouteSet()` (blueprint.ts:11994) |
| H | `autopilot-spec-documents-llm` | `generateSpecDocuments()` (blueprint.ts:8571) |
| I | `autopilot-effect-preview-llm` | `generateEffectPreviews()` (blueprint.ts:8678) |
| J | `autopilot-prompt-package-llm` | `generateImplementationPromptPackages()` (blueprint.ts:8846) |
| K | `autopilot-engineering-handoff-llm` | `generateEngineeringLandingPlans()` (blueprint.ts:9036) |

每份 spec 都按同一套 requirements-first → design → tasks → 实施流程走。

---

## 每份 spec 共用的强约束（共享契约，务必遵守）

这些约束在每份 requirements.md 的 R8 / R9 里都有，在实施前必须反复确认：

- ✅ **既有 47 E2E + 48 subdomain + 9 SDK smoke 全部继续通过** — 一条都不许改
- ✅ **strict zod schema + fallback** — 校验失败立即回到模板产出，不 coerce、不 normalize
- ✅ **provenance 只追加可选字段** — `generationSource` / `promptId` / `model` / `error` / `executionMode`；不删、不重命名既有字段
- ✅ **通过 `BlueprintServiceContext` 注入依赖** — 禁止 `import { callLLMJson } from "../../core/llm-client.js"` 或任何模块级单例
- ✅ **locale-aware prompt** — `clarificationSession.locale === "zh-CN"` 时中文，否则英文
- ✅ **事件名只走 `BlueprintEventName` 常量** — 禁止裸字符串；Wave 1 的 4 条桥禁止新增事件名；Wave 2 明确允许扩展 `RoleSleeping`
- ❌ **禁止 PBT（property-based test）** — 本批次全部 example-based
- ❌ **禁止 UI 改动作为验收条件** — 前端消费属于独立 UI spec 范围

---

## 快速导航

- 架构目标图：[`autopilot-target-experience-architecture-2026-05-07.svg`](./autopilot-target-experience-architecture-2026-05-07.svg)
- 执行进度图：[`autopilot-spec-execution-progress-2026-05-08.svg`](./autopilot-spec-execution-progress-2026-05-08.svg)
- 本执行计划：本文件
- Spec 索引：`.kiro/specs/autopilot-*/requirements.md`

---

## 在另一台电脑上继续的开工步骤

```powershell
# 1. 拉最新
git fetch origin
git checkout feat/project-autopilot-blueprint
git pull origin feat/project-autopilot-blueprint

# 2. 确认 9 份 spec 目录都在
Get-ChildItem .kiro/specs -Directory | Where-Object { $_.Name -like "autopilot-*-llm*" -or $_.Name -like "autopilot-capability-bridge-*" -or $_.Name -like "autopilot-agent-crew-*" } | Select-Object Name

# 3. 打开执行进度图对照
# docs/autopilot-spec-execution-progress-2026-05-08.svg

# 4. 从 Wave 0 开始（或者任选一个 Wave 1 spec 开 design）
# 入口：.kiro/specs/autopilot-routeset-llm-generation/tasks.md
```
