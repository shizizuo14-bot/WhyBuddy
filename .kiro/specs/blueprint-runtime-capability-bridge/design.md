# 设计文档：运行时能力桥

## 概述

运行时能力桥位于自动驾驶路线和真实执行能力之间。它把页面输入、路线节点和 SPEC 树节点转换为可调度的能力调用，并将能力输出沉淀回项目资产。

## 架构

```text
Route / Spec Node
      ↓
Capability Planner
      ↓
Runtime Bridge
      ↓
Docker / MCP / Skill / AIGC Node / Role Agent
      ↓
Capability Evidence
      ↓
RouteSet / SpecTree / SpecDocument / Preview
```

## 组件

### Capability Registry

负责登记所有可用能力，包括类型、标签、输入输出结构、安全等级和运行状态。

### Capability Planner

根据路线步骤、SPEC 节点类型和项目上下文选择能力组合。

### Runtime Adapter

把统一调用请求转换为具体运行时的调用参数。首批适配 Docker 沙盒、MCP、Skill 和本地 AIGC 节点。

### Evidence Collector

负责收集执行输出、日志、产物路径、错误和摘要，并写入项目资产层。

### Safety Gate

负责校验权限、沙盒等级、网络能力和写入范围。

## 数据流

1. 路线或 SPEC 节点提交能力调用请求。
2. Capability Planner 选择能力组合。
3. Safety Gate 判断是否允许执行。
4. Runtime Adapter 调用具体运行时。
5. Evidence Collector 保存执行证据。
6. 下游菜单消费能力证据。

## 约束

- 能力调用必须能追溯到来源节点。
- 高风险能力默认需要沙盒或审批。
- 能力失败不应阻断整个项目资产链。

## 测试策略

- 能力注册与过滤测试
- 沙盒执行调度测试
- 证据沉淀测试
- 安全等级校验测试
