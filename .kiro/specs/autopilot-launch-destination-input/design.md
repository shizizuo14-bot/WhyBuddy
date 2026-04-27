# 设计文档：自动驾驶目的地输入

## 设计概述

本设计把 `UnifiedLaunchComposer` 从“统一智能发起器”进一步收敛为 `Destination Launcher`。它仍复用当前 NL Command、Workflow、runtime mode 与附件处理能力，但在用户感知层优先呈现：

1. 我输入的目的地是什么
2. 系统还缺哪些路标
3. 附件是否改变路线判断
4. 是否可以进入路线规划
5. 下一步是补路标、选路线还是切换高级执行

## 前端信息结构

### 1. Destination Input

输入区应包含：

- 目的地输入框
- 示例目的地 chips
- 附件入口
- runtime mode 状态
- 当前任务焦点提示

### 2. Destination Preview

输入后展示目的地预览卡：

- `goal`
- `deliverable`
- `constraints`
- `timeline`
- `successCriteria`
- `missingFields`
- `confidence`

### 3. Missing Waypoints

当解析结果不足时展示缺口：

- 缺什么
- 为什么影响路线规划
- 可以如何补充
- 是否允许先按默认路线推进

### 4. Transition To Route Planning

目的地预览下方应进入路线规划面板：

- 当信息足够时：显示候选路线
- 当信息不足时：显示“先补路标”路线
- 当需要高级运行时时：显示“切换高级执行”路线

## 与既有代码的映射

- `client/src/components/launch/UnifiedLaunchComposer.tsx`
  - 入口容器、输入区、路线面板挂载点。
- `client/src/lib/launch-router.ts`
  - 目的地输入到路线候选的前端轻量规划器。
- `client/src/lib/unified-launch-coordinator.ts`
  - 选中路线到 mission/workflow/upgrade 的提交协调器。
- `shared/mission/autopilot.ts`
  - 后续应承接更完整 Destination parser 的共享合同。

## 避免重复造概念

本设计不新增独立的 `FrontendDestination` 概念。前端视图模型应优先投影既有 Destination parser 字段；如果临时字段只存在于 UI 层，必须在命名中标注 `draft` 或 `preview`。

## 回补既有缺陷方向

- 检查 18 份 specs 中 `Destination` 字段与前端展示字段是否不一致。
- 修复 launch-router 中纯正则判断过粗的问题，逐步改为共享 parser。
- 修复目的地不足时仍能误选不可用路线的边界。
- 补齐中文/英文文案一致性，避免 UI 与 README 口径漂移。
