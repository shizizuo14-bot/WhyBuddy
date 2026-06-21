# 后端 NodeJS 到 Python 迁移：Web AIGC long-tail inventory 89

## 执行状态
- 状态：待执行
- 目标：盘点 Web AIGC 长尾 node-only 路由，拆出下一批 contract/proxy/runtime 候选，不直接改业务代码。
- 角色分工：worker 负责 inventory 和分层建议；reviewer 确认没有把 fake runtime 或 Node route shell 误计为生产迁移。

### 状态清单
- [x] 读取 `docs/backend-python-node-route-inventory-90.md` 和当前 server route 文件。
- [x] 盘点 web-qa、dynamic-chart、ai-ppt、transaction-flow、location/device/open-* 等长尾路径。
- [x] 生成 `docs/backend-python-web-aigc-longtail-inventory-89.md`。
- [x] 更新状态文档的下一步建议，不更新总迁移百分比。
- [x] gate 全绿。
- [x] Codex review 确认没有把 inventory 当实现完成。

## 目标

Web AIGC search/file/vision/audio 已有 bounded runtime bridge，但长尾 adapters 仍大量 node-only。本任务只做下一批切片的盘点和优先级，不引入 Python runtime 实现。后续可以按一个 adapter 或一组同构 adapter 拆 contract/proxy/runtime 任务。

## 允许修改的文件
- `docs/backend-python-web-aigc-longtail-inventory-89.md`
- `agent-loop/tasks/sliderule-python-migration-status.md`
- `agent-loop/tasks/backend-python-web-aigc-longtail-inventory-89.md`

## 禁止扩大范围
- 不改业务代码。
- 不新增 Web AIGC adapter。
- 不把 search/file/vision/audio fake runtime 写成真实外部服务生产接管。
- 不提交 `.agent-loop` 运行产物。
- 不更新总迁移百分比。

## 必跑 gate

使用 `agent-loop/scripts/migration-queue.json` 里的 `webAigcLongtailInventory89Gates`。

## 成功标准

- 文档列出长尾 routes、当前 Node 文件、已有测试、建议下一步层级。
- 明确哪些是 `node-only`、哪些可走 `contract`、哪些可走 bounded `runtime`。
- 状态文档只更新下一步计划和证据口径。
- mojibake 扫描通过。
