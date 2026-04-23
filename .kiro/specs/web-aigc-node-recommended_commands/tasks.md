# 任务清单：推荐命令节点

- [x] 定义推荐命令结构
  - `shared/nl-command/api.ts` 已补充 `Suggestion` 的推荐命令字段、`selectionOptions`、`confirmPayload` 与 `observability` 响应结构。
  - `server/routes/node-adapters/recommended-commands-node-adapter.ts` 已统一产出可供 `recommended_commands` 节点消费的推荐对象。
- [x] 接入命令推荐或 suggestion 能力
  - `server/routes/nl-command.ts` 已实现 `GET /api/nl-command/plans/:id/suggestions`。
  - 优先复用 `decision-support` 的 `cost/resource` suggestion；缺少计划或引擎依赖时退化为启发式推荐，保证最小可用闭环。
- [x] 与选择、确认节点联调
  - 推荐响应已显式输出 `selectionOptions` 和 `confirmPayload`，可直接映射到现有 `selection` / `confirm_judge` 输入模型。
  - 推荐项内同步写入 `selectionOption` / `confirmOption` / `recommendedCommand`，便于前端或 runtime 下游直接消费。
- [x] 写入推荐与采纳事件
  - `shared/nl-command/contracts.ts` 已补充 `suggestion_generated` 审计类型。
  - 推荐生成写入 `suggestion_generated`，采纳写入 `suggestion_applied`，并在接口响应里透出最小 observability / audit 标识。
