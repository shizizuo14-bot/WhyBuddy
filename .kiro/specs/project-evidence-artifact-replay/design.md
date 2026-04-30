# 设计文档：Project Evidence, Artifact & Replay

## 设计概述

Project-first 系统的信任来自证据闭环：

```text
输入 -> 澄清 -> spec -> route -> execution -> artifact -> evidence -> spec update
```

用户不一定要看全部日志，但系统必须能解释：

- 为什么走这条路线？
- 为什么生成这个 spec？
- 哪个任务产出了这个文件？
- 失败在哪里？
- 下一步建议依据是什么？

## Artifact 类型

```text
spec
doc
svg
code
report
prototype
screenshot
dataset
diff
other
```

## Evidence 类型

```text
message
clarification
decision
route
runtime
log
source
artifact-link
failure
replay
```

## 展示层级

### Project Cockpit

只展示：

- 最近产物
- 当前证据摘要
- 等待确认的证据
- 下一步建议来源

### Project Execution Center

展示：

- mission logs
- runtime events
- role activity
- operator action
- artifacts

### Replay View

展示完整时间线：

- message
- clarification
- spec version
- route selection
- mission events
- artifacts
- decisions
- replan

## SVG 项目化

SVG 架构图和进度图应作为 `ProjectArtifact(type: "svg")`。第一阶段可以引用 docs 路径，后续可进入项目文件存储。

示例：

```ts
{
  type: "svg",
  title: "Project-first 首页主线架构图",
  path: "docs/entry-execution-architecture.svg",
  sourceSpecId: "...",
}
```

## 回写时机

- 用户提交输入
- 系统生成澄清
- 用户回答澄清
- spec 生成或更新
- route 生成或选择
- mission 创建
- runtime event 到达
- artifact 生成
- operator action
- mission 完成、失败、取消

## 非目标

- 第一阶段不做完整文件版本管理系统。
- 第一阶段不做复杂审计合规后台。
- 第一阶段不要求所有历史 docs 自动归档。

