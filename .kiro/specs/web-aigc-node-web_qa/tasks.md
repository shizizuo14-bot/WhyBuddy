# 任务清单：网页问答节点

- [x] 定义网页问答输入输出结构
- [x] 设计网页内容获取适配器
- [x] 输出来源链接与证据
- [x] 验证失败回退逻辑

## 本轮收口说明

- 已确认 `web_qa` 节点支持网页内容、RAG 文档检索与知识库兜底三类上下文来源。
- 已在路由输出层统一补齐 `observability` 字段，覆盖 `strategy`、`projectId`、`pageCount`、`sourceCount`、`searchQuery`、`searchResultCount`、`fallbackUsed` 等运行态信息。
- 已通过路由测试锁定正常问答与知识回退两条路径的结构化输出，便于后续接入主线运行时监控与调试面板。
