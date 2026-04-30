# 设计文档：Project Clarification & Conversation

## 设计概述

Project Clarification 把一次性补问变成项目上下文建设。它服务于三件事：

1. 降低新用户认知负担。
2. 提高 spec 质量。
3. 避免自动驾驶过早执行。

## 澄清对象

```ts
interface ProjectClarificationQuestion {
  id: string;
  projectId: string;
  text: string;
  reason: string;
  scope: "goal" | "user" | "domain" | "tech" | "delivery" | "risk" | "runtime";
  answerType: "text" | "single" | "multi" | "boolean";
  options?: string[];
  required: boolean;
  defaultAssumption?: string;
  answeredAt?: string;
  answer?: string;
  createdAt: string;
}
```

## 澄清优先级

第一轮只问影响路线的大问题：

- 项目面向谁？
- 交付物是什么？
- 必须使用什么技术栈？
- 有哪些硬约束？
- 是否允许联网 / Docker / GitHub 调研？

第二轮再问细节：

- 页面范围
- 权限模型
- 数据模型
- 设计风格
- 部署方式
- 验收标准

## 与 Spec 的关系

澄清回答进入：

- `ProjectMessage`
- `ProjectEvidence`
- `ProjectSpec.sourceMessageIds`

当澄清完成度足够时，可以生成或更新 `ProjectSpec`。

## UI 行为

### 项目早期

澄清以主面板形式出现，不建议弹窗遮挡。

### 执行中

澄清可作为接管问题出现，接管回答要写入 project decision。

### 跳过澄清

如果用户跳过，系统写入默认假设：

```text
用户跳过技术栈选择，系统默认 React + Node.js，风险：可能与实际部署环境不一致。
```

## 非目标

- 不在本 spec 中实现完整需求分析 Agent。
- 不在本 spec 中生成完整 PRD。
- 不在本 spec 中替代 Spec Center。

