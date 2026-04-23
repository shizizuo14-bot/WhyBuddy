# 任务清单：图谱检索节点

- [x] 定义图查询输入输出
- [x] 对接知识图谱能力
- [x] 输出节点、边、路径结果
- [x] 验证与知识问答联动

## 完成说明

- 已新增 `shared/web-aigc-graph-search.ts`，定义 `graph_search` 节点输入输出、图节点/边/路径结构，以及供知识问答继续消费的 `answerDraft` 契约。
- 已新增 `server/routes/node-adapters/graph-search-node-adapter.ts`，复用 `server/knowledge/query-service.ts` 的 `getNeighbors / findPath / subgraph / naturalLanguageQuery` 能力，完成图谱查询最小闭环。
- 已新增 `server/routes/graph-search.ts`，提供独立 `POST /api/graph-search/nodes/execute` 执行入口，不改 `server/index.ts`。
- 已新增 `server/tests/graph-search-node-adapter.test.ts` 与 `server/tests/graph-search-routes.test.ts`，覆盖邻居查询、路径查询、子图参数校验、自然语言图检索，以及与知识问答结果草稿的最小联动。
