<!--
 * @Author: wangchunji
 * @Date: 2026-05-08 12:03:06
 * @Description: 
 * @LastEditTime: 2026-05-08 14:28:08
 * @LastEditors: wangchunji
-->
# Worktree wt2-blueprint-sdk 任务清单

**分支**：`feat/blueprint-sdk`
**Wave**：B
**前置**：`wt1-blueprint-core` 必须先合入 `main`
**下游**：合入 `main` 后 wt3 与 wt4 才可启动（并行）

## 目标

客户端 SDK 按 8 个子域切分；把 `autopilot-*.ts` / `blueprint-copy.ts` 归类到 `client/src/lib/autopilot/` 与 `client/src/lib/blueprint/`。所有任务为强制项。

## 任务

- [x] 1. 按 8 个子域切出 SDK 子模块
  - 新建 `client/src/lib/blueprint-api/` 目录，切出 `intake.ts`、`clarification.ts`、`jobs.ts`、`agent-crew.ts`、`routeset.ts`、`spec-documents.ts`、`downstream.ts`、`artifact-replay.ts` 八个 SDK 子模块。
  - 通过 `client/src/lib/blueprint-api/index.ts` re-export 现有 `@/lib/blueprint-api` 全部导出符号（endpoint 常量、normalizer、fetch 函数）。
  - _Requirements: 2.3, 6.4_

- [x] 2. 把 `client/src/lib/blueprint-api.ts` 降为 re-export barrel
  - `client/src/lib/blueprint-api.ts` 只 re-export `@/lib/blueprint-api/index`，保留文件位置兜底一轮。
  - 现有 `import { ... } from "@/lib/blueprint-api"` 调用方无需修改。
  - _Requirements: 6.4, 6.5_

- [x] 3. 补齐 SDK 子模块 happy-path 断言
  - 为每个 SDK 子模块补最小断言：URL、HTTP 方法、请求体结构。可复用现有 `blueprint-api.test.ts` 的测试工具与 fetch mock。
  - _Requirements: 7.4_

- [x] 4. 归类 `client/src/lib/autopilot/`
  - 新建 `client/src/lib/autopilot/`，把 `autopilot-launch-examples.ts` / `autopilot-prompt-optimizer.ts` / `autopilot-frontend-model.ts` / `use-autopilot-cockpit-model.ts` / `use-autopilot-route-plan.ts` / `launch-router.ts` 迁入（改名见 design.md §支持 lib）。
  - 在原位置保留 re-export 兜底文件，一轮观察期后再评估是否删除。
  - _Requirements: 1.1, 6.5_

- [x] 5. 归类 `client/src/lib/blueprint/`
  - 新建 `client/src/lib/blueprint/`，把 `blueprint-copy.ts` 迁入并重命名为 `copy.ts`。
  - 在原位置保留 re-export 兜底文件。
  - _Requirements: 1.1, 6.5_

- [x] 6. 运行类型检查与受影响前端单测
  - 本地运行 `node --run check` 与受影响前端单测（`client/src/lib/blueprint-api` 下各 `*.test.ts`），确认无新增 TypeScript 错误与测试失败。
  - _Requirements: 7.5_
