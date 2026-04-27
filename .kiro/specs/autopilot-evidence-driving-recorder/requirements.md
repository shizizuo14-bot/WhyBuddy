# 需求文档：自动驾驶证据记录仪

## 目标

把 evidence、audit、lineage、replay 聚合成“驾驶记录仪”，让用户能看到一次任务从目的地、路线、接管、执行到交付的可回放证据链。

## 与现有 18 份 task-autopilot specs 的引用关系

本 spec 前端落地：

- `autopilot-evidence-replay-and-trust-chain`
- `autopilot-explainability-and-telemetry`
- `route-recommendation-and-selection`
- `takeover-panel-and-decision-points`
- `task-autopilot-success-metrics`

## 当前差距

- 证据链能力分散在 audit、replay、artifacts、history。
- 路线推荐/选择/锁定/重规划事件没有形成统一驾驶记录。
- 用户不能快速复盘“为什么系统这样开”。

## 需求

### 需求 1：系统必须展示驾驶事件时间线

事件至少包括 destination.parsed、route.recommended、route.selected、takeover.requested、tool.called、output.generated、review.completed、delivery.completed。

### 需求 2：系统必须展示证据可信状态

每条证据必须展示 verified、partial、unverified、redacted 等状态。

### 需求 3：系统必须支持按对象筛选

用户应能按路线、接管、工具调用、产物、审计筛选。

### 需求 4：证据记录仪必须能链接到现有 replay/audit/artifacts

不重复实现全部页面，但必须有跳转和上下文参数。
