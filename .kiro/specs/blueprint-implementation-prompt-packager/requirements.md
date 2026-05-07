# 需求文档

## 简介

本规格定义 SPEC 自动驾驶链路的第 7 步：系统需要把已接受的 SPEC 树、规格文档和效果预演打包成可迁移的实现提示词，供 Cursor、Kiro、Solo Trae、Windsurf、Codex、Claude 等平台使用。

提示词不再是临时手写文本，而是由项目资产自动推导出的 Prompt Package。

## 术语表

- **PromptPackage**：绑定 SPEC 资产的提示词包
- **PromptTargetPlatform**：目标平台，如 cursor、kiro、codex、claude、windsurf
- **PromptScope**：提示词范围，如 module、page、api、system、integration
- **VerificationPlan**：提示词附带的验收与验证命令

## 需求

### 需求 1：生成跨平台提示词包

**用户故事：** 作为用户，我希望从同一份 SPEC 资产导出不同平台可用的提示词，以便自由选择实现工具。

#### 验收标准

1.1 系统 SHALL 支持导出 Cursor、Kiro、Solo Trae、Windsurf、Codex、Claude 适配格式。  
1.2 系统 SHALL 支持按节点、子树或整树生成提示词包。  
1.3 系统 SHALL 在提示词中包含项目上下文、目标、约束和来源资产。  
1.4 系统 SHALL 标记目标平台和导出时间。

### 需求 2：生成模块、页面和系统级提示词

**用户故事：** 作为开发者，我希望提示词可以按实现粒度拆分，以便不同平台或不同 Agent 分工执行。

#### 验收标准

2.1 系统 SHALL 支持 module、page、api、data、workflow、integration 等范围。  
2.2 系统 SHALL 为每个提示词包包含文件范围和预期变更。  
2.3 系统 SHALL 包含验收标准、风险和约束。  
2.4 系统 SHALL 支持把多个节点打包成一个实现阶段。

### 需求 3：包含验证与回填信息

**用户故事：** 作为系统，我希望提示词中包含验证方式和回填关系，以便工程落地后能更新项目资产。

#### 验收标准

3.1 系统 SHALL 为 PromptPackage 生成 VerificationPlan。  
3.2 系统 SHALL 包含建议运行的测试、构建或检查命令。  
3.3 系统 SHALL 记录提示词来源的 nodeIds、docIds 和 previewIds。  
3.4 系统 SHALL 支持工程执行完成后回填到来源节点。

### 需求 4：支持版本化、复制和导出

**用户故事：** 作为用户，我希望能保存和复制提示词包，以便在多个工具之间复用。

#### 验收标准

4.1 系统 SHALL 保存 PromptPackage 版本。  
4.2 系统 SHALL 支持复制纯文本、Markdown 或 JSON 格式。  
4.3 系统 SHALL 支持重新生成并比较差异。  
4.4 系统 SHALL 支持标记已导出或已用于执行。
