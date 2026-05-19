# 需求文档：工程落地桥

## 简介

本规格定义 SPEC 自动驾驶系统的工程落地桥。它负责把已经被用户接受的 SPEC 树、规格文档、效果预演和实现提示词转化为工程执行计划，并将执行结果、日志、差异和验证信息回写到资产链。

这一阶段不是替代开发工具，而是把前面沉淀的资产转换成可迁移、可追踪、可验证的工程落地上下文。

## 术语表

- **Engineering Run**：一次工程落地尝试，包括输入资产、执行计划、输出结果和验证记录
- **Landing Plan**：由 SPEC 资产推导出的文件范围、实现顺序、风险和验证步骤
- **Run Evidence**：工程执行产生的日志、截图、测试结果、diff 摘要和失败原因
- **Platform Handoff**：将实现提示词和上下文交给 Cursor、Kiro、Trae、Windsurf、Codex 或 Claude 等平台

## 需求

### 需求 1：生成工程落地计划

**用户故事：** 作为开发者，我希望系统能把 SPEC 资产转换为工程落地计划，以便知道先改什么、怎么验收。

#### 验收标准

1.1 系统 SHALL 基于 accepted SpecTree、SpecDocument 和 EffectPreview 生成 Landing Plan。  
1.2 系统 SHALL 输出模块范围、文件范围、实现顺序、依赖和风险。  
1.3 系统 SHALL 为每个执行步骤绑定来源 SpecNode。  
1.4 系统 SHALL 区分可自动执行、需人工确认和仅导出提示词的步骤。

### 需求 2：支持平台交接

**用户故事：** 作为用户，我希望把实现上下文交给不同 AI 编程平台，而不是被锁定在一个执行器里。

#### 验收标准

2.1 系统 SHALL 支持导出 Cursor、Kiro、Trae、Windsurf、Codex 和 Claude 可用的上下文包。  
2.2 系统 SHALL 在交接包中包含目标、约束、文件范围、验收标准和验证命令。  
2.3 系统 SHALL 为每次导出记录 platform、时间、来源资产和版本。  
2.4 系统 SHALL 支持重新生成交接包并比较差异。

### 需求 3：记录工程执行结果

**用户故事：** 作为系统，我希望工程执行结果能回写到 SPEC 资产，以便后续推导知道哪些已经落地。

#### 验收标准

3.1 系统 SHALL 保存 Engineering Run 的状态、开始时间、结束时间和结果摘要。  
3.2 系统 SHALL 保存测试、构建、lint、截图和人工验证结果。  
3.3 系统 SHALL 将执行结果绑定到 SpecNode、SpecDocument 和 PromptPackage。  
3.4 系统 SHALL 支持失败后重新规划或回退到提示词阶段。

### 需求 4：保持资产链闭环

**用户故事：** 作为产品负责人，我希望从最终落地结果能反查到最初想法和澄清过程，以便审计整条链路。

#### 验收标准

4.1 系统 SHALL 从 Engineering Run 反查 RouteSet、SpecTree、SpecDocument、EffectPreview 和 PromptPackage。  
4.2 系统 SHALL 记录执行产生的差异和用户确认。  
4.3 系统 SHALL 保留历史运行记录而不是覆盖旧结果。  
4.4 系统 SHALL 支持把运行反馈写回下一版 SPEC 树。
