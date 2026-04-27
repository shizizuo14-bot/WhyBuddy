# 需求文档：自动驾驶空状态与新手引导

## 目标

解决用户不知道“输入什么才能触发自动驾驶”的问题，通过示例、模板、引导和演示路线，让用户快速理解目的地输入、路线规划、接管和证据。

## 与现有 18 份 task-autopilot specs 的引用关系

本 spec 面向产品引导层，引用：

- `task-autopilot-platform-positioning`
- `task-autopilot-core-concepts`
- `task-autopilot-levels-l1-to-l5`
- `destination-model-and-parser`
- `route-recommendation-and-selection`

## 当前差距

- README 解释了概念，但前端空状态没有足够引导。
- 用户需要猜什么输入会触发路线规划、澄清、深度路线或 runtime upgrade。
- 缺少可运行的示例目的地。

## 需求

### 需求 1：系统必须提供自动驾驶示例目的地

至少覆盖快速、标准、深度、补路标、高级执行五类。

### 需求 2：系统必须解释自动驾驶触发规则

用户应知道目标、交付物、约束、时间线、附件如何影响路线。

### 需求 3：系统必须提供首次使用引导

首次进入 cockpit 或 launch 入口时，应有轻量引导。

### 需求 4：系统必须避免打断熟练用户

引导应可关闭、可折叠、可从帮助入口再次打开。
