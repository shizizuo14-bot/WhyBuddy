# 任务清单：片段检索节点

- [x] 定义片段检索输入输出
- [x] 接入统一检索适配器
- [x] 支持相关度排序
- [x] 写入检索事件

## 当前状态

- 已新增 `fragment_search` 节点适配器，直接复用现有 Web-AIGC RAG 检索契约、请求归一化与片段结果投影逻辑。
- 已补节点级单测，覆盖成功路径、`documentIds` 过滤、输入校验、执行器缺失与检索失败包装。
- 当前闭环范围是“节点适配器 + 节点侧 observability 输出 + `/api/rag/web-aigc/fragment-search` 审计事件 + 单测”，未修改 runtime built-in 注册与其它 lane 文件。
- `/api/rag/web-aigc/fragment-search` 现已复用既有 `external.knowledge_retrieval` 审计口径，写入最小检索事件；节点适配器输出也已补 `observability` 摘要，可为后续 runtime 接线复用。
