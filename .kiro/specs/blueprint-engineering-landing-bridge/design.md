# 设计文档：工程落地桥

## 概述

工程落地桥连接 SPEC 资产和真实开发平台。它不会把所有开发过程都塞进 SPEC 树菜单，而是作为独立菜单消费已接受资产，生成落地计划、平台交接包和运行记录。

## 架构

```text
Accepted Spec Assets
      ↓
Landing Planner
      ↓
Platform Handoff Builder
      ↓
Cursor / Kiro / Trae / Windsurf / Codex / Claude
      ↓
Engineering Run Recorder
      ↓
Artifact Memory / SpecTree Feedback
```

## 组件

### Landing Planner

根据 SPEC 树、规格文档和效果预演生成执行顺序、文件范围、风险和验证计划。

### Platform Handoff Builder

负责把落地计划转换为不同平台可使用的上下文包。

### Engineering Run Recorder

记录执行状态、输出、测试结果、失败原因、截图和人工确认。

### Feedback Binder

把工程结果回写到 SpecNode、SpecDocument、PromptPackage 和 Artifact Memory。

## 数据流

1. 用户选择 accepted SPEC 树或子树。
2. Landing Planner 生成落地计划。
3. Handoff Builder 输出平台交接包。
4. 用户或执行器在外部平台落地。
5. Run Recorder 保存结果和验证记录。
6. Feedback Binder 更新资产链状态。

## 约束

- 工程落地必须绑定到明确的 SPEC 资产版本。
- 外部平台交接不应丢失验收标准和验证计划。
- 执行失败必须保留上下文和可恢复入口。

## 测试策略

- 落地计划生成测试
- 平台交接包格式测试
- 工程运行记录测试
- 反馈回写测试
