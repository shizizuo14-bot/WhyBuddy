# 需求文档

## 简介

本规格定义 SPEC 自动驾驶系统的项目资产底座。它负责统一管理 Project、RouteSet、SpecTree、SpecNode、SpecDocument、EffectPreview、PromptPackage 和 EngineeringRun 等核心资产，并提供版本、关联和查询能力。

如果这一层不稳定，后续所有菜单都会失去可追溯性和可沉淀性。

## 术语表

- **Project**：一个可推演、可执行、可回放的项目实体
- **Asset**：项目下任意可持久化对象，如路线、树、文档、预演、提示词和执行记录
- **Provenance**：资产来源链路，包括输入、澄清、路线和生成上下文
- **VersionedAsset**：支持版本演进的资产

## 需求

### 需求 1：定义统一资产模型

**用户故事：** 作为系统，我需要统一的资产模型，以便所有菜单都能围绕同一份项目数据工作。

#### 验收标准

1.1 系统 SHALL 定义 Project、RouteSet、SpecTree、SpecNode、SpecDocument、EffectPreview、PromptPackage、EngineeringRun。  
1.2 系统 SHALL 为每类资产定义唯一 ID、项目归属、创建时间和来源信息。  
1.3 系统 SHALL 支持资产之间的引用关系。  
1.4 系统 SHALL 支持资产状态管理，例如 draft、ready、accepted、superseded、archived。

### 需求 2：支持版本化与谱系追踪

**用户故事：** 作为用户，我希望每次推导和编辑都能留下版本，以便比较、回退和回放。

#### 验收标准

2.1 系统 SHALL 为 RouteSet、SpecTree、SpecDocument、PromptPackage 和 EngineeringRun 提供版本字段。  
2.2 系统 SHALL 保留父版本、来源版本和变更原因。  
2.3 系统 SHALL 支持按项目查询完整的资产谱系。  
2.4 系统 SHALL 允许旧版本保持只读状态。

### 需求 3：支持项目作用域存储与查询

**用户故事：** 作为系统，我希望所有资产都能在项目作用域内被查询和过滤，以便不同项目互不干扰。

#### 验收标准

3.1 系统 SHALL 支持按 projectId 查询任意资产。  
3.2 系统 SHALL 提供按类型、版本、状态和时间范围过滤的能力。  
3.3 系统 SHALL 支持从某个资产反查其来源输入、澄清和路线。  
3.4 系统 SHALL 支持 selectors 或派生查询，方便前端页面消费。

### 需求 4：支持执行回填和资产回写

**用户故事：** 作为系统，我希望工程执行结果能回填到资产底座，以便系统越用越准。

#### 验收标准

4.1 系统 SHALL 支持从 EngineeringRun 回写到 SpecNode、SpecDocument 和 RouteSet。  
4.2 系统 SHALL 支持把日志、产物和 replay 绑定到资产。  
4.3 系统 SHALL 支持基于执行结果更新资产状态。  
4.4 系统 SHALL 保留回写前后的差异记录。
