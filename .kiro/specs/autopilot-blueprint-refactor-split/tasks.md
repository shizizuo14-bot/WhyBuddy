<!--
 * @Author: wangchunji
 * @Date: 2026-05-08 11:56:44
 * @Description: 
 * @LastEditTime: 2026-05-08 14:54:48
 * @LastEditors: wangchunji
-->
# 任务清单：Autopilot / Blueprint 模块子域拆分重构

## 概述

本重构按 design.md 的 4 个 worktree 切分执行，严格对齐 requirements.md 的 9 条需求。任务清单按 worktree 拆为 4 个子文件，各 worktree 只看自己那份。

共享 spec 文件：

- [requirements.md](./requirements.md) — 9 条需求，EARS 格式
- [design.md](./design.md) — High-Level + Low-Level 设计，4 个 worktree 切分方案

## Worktree 任务子清单

| Worktree | 分支 | Wave | 前置 | 任务数 | 任务文件 |
| -------- | ---- | ---- | ---- | ------ | -------- |
| `wt1-blueprint-core` | `feat/blueprint-core` | A（串行） | 无 | 17 | [tasks/wt1-blueprint-core.md](./tasks/wt1-blueprint-core.md) |
| `wt2-blueprint-sdk` | `feat/blueprint-sdk` | B | wt1 合入 `main` | 6 | [tasks/wt2-blueprint-sdk.md](./tasks/wt2-blueprint-sdk.md) |
| `wt3-autopilot-page` | `feat/autopilot-page-split` | B | wt2 合入 `main` | 6 | [tasks/wt3-autopilot-page.md](./tasks/wt3-autopilot-page.md) |
| `wt4-blueprint-panels` | `feat/blueprint-panels-split` | B | wt2 合入 `main` | 4 | [tasks/wt4-blueprint-panels.md](./tasks/wt4-blueprint-panels.md) |

**推进顺序**

- **Wave A（串行，阻塞下游）**：先在 wt1 执行 `tasks/wt1-blueprint-core.md` 的全部 17 个任务，合入 `main`。
- **Wave B（wt1 合入后启动）**：先做 wt2 的 SDK 拆分并合入 `main`；再同时开 wt3 与 wt4，二者可并行。
- 4 个 worktree 全部合入 `main` 后执行跨 worktree 收尾（见下方）。

## 跨 worktree 收尾

以下任务跨 worktree，放在 4 个 worktree 全部合入 `main` 之后执行。

- [x] 1. 四个 worktree 合并后的仓库级回归
  - 四个 worktree 全部合入 `main` 后，运行仓库级 `node --run check`，TypeScript 错误数不得比 wt1 合入前扩大。
  - 运行 `vitest run server/tests/blueprint-routes.test.ts`，原 51 条 + 新增 `reviewing` 用例全部通过。
  - 运行客户端冒烟 `vitest run client/src/pages/autopilot client/src/pages/specs client/src/pages/Home.tsx`，全部通过。
  - _Requirements: 7.1, 7.2, 7.5, 8.1, 8.2, 8.3_

- [ ]* 2. 删除 SDK 与 lib 兜底 re-export 文件
  - 删除 `client/src/lib/blueprint-api.ts` 旧文件，以及 `client/src/lib/autopilot-*.ts` / `use-autopilot-*.ts` / `launch-router.ts` / `blueprint-copy.ts` 的兜底 re-export。
  - 建议等一轮观察期后再执行。删除后应再跑一轮 `node --run check` 与相关前端单测。
  - _Requirements: 1.1, 6.5_

## 全局约束

- 所有 worktree 共用同一份 `requirements.md` / `design.md`，不允许 worktree 内部修改共享 spec。
- 所有任务默认为强制项（`- [ ]`）；可选项使用 `- [ ]*` 标记。当前仅"跨 worktree 收尾 2"为可选项。
- 除非任务明确写明 PBT 不变量，否则只做 example-based 测试，不声称是 PBT。
- 本清单不修改 `docs/autopilot-*.svg`、Web-AIGC specs、task-autopilot Phase 1 specs 与 `Home.tsx` 的 project-space 分支（requirements 1.3 / 1.4 / 8.1 / 8.2 / 9.1）。
- Artifact Replay 相关的事件源唯一性（wt1 任务 13）仅做 example-based 断言，不声称为 PBT；若后续要升级为 PBT，需要先显式写出不变量再单独立项。

## 任务状态跟踪

使用 `taskStatus` 工具更新任务状态时，`taskFilePath` 填对应的子文件路径：

- wt1 任务 1-17：`taskFilePath: .kiro/specs/autopilot-blueprint-refactor-split/tasks/wt1-blueprint-core.md`
- wt2 任务 1-6：`taskFilePath: .kiro/specs/autopilot-blueprint-refactor-split/tasks/wt2-blueprint-sdk.md`
- wt3 任务 1-6：`taskFilePath: .kiro/specs/autopilot-blueprint-refactor-split/tasks/wt3-autopilot-page.md`
- wt4 任务 1-4：`taskFilePath: .kiro/specs/autopilot-blueprint-refactor-split/tasks/wt4-blueprint-panels.md`
- 跨 worktree 收尾：`taskFilePath: .kiro/specs/autopilot-blueprint-refactor-split/tasks.md`
