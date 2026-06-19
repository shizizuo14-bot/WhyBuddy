# 后端 NodeJS 到 Python 迁移：RAG / vector inventory

## 执行状态

- 状态：待执行
- 目标：盘点 Node 侧 RAG/vector（检索/向量）资产，为 Python 迁移拆出可执行切片
- 前置：SlideRule capability 覆盖已明显推进，但真实检索/向量仍不足

### 状态清单

- [ ] 已执行 AgentLoop
- [ ] Node RAG/vector 入口已盘点
- [ ] Python 侧已有/缺失能力已列清
- [ ] 切片建议和 gate 建议已写入文档
- [ ] mojibake 检查通过
- [ ] 人工 review（审查）已确认 diff 干净

## 目标

先做 audit/inventory（审计/盘点），不要直接迁实现。列出 Node 里和 RAG、vector、evidence retrieval 相关的 route、helper、配置、测试，以及 Python 侧需要补的最小等价能力。

## 允许修改的文件

- `agent-loop/tasks/backend-python-rag-inventory.md`
- `docs/backend-python-rag-inventory.md`
- `agent-loop/tasks/sliderule-python-migration-status.md`（仅同步下一步，不改百分比除非有验证）

## 禁止扩大范围

- 不改业务代码。
- 不创建真实 vector 数据。
- 不提交本地 data/log/cache。
- 不写入真实 Qdrant key 或数据库配置。

## 必跑 gate

使用 `agent-loop/scripts/migration-queue.json` 里的 `ragInventoryGates`。

## 成功标准

- 文档列出 Node 侧 RAG/vector 入口、Python 缺口、建议迁移顺序。
- 明确哪些任务适合 AgentLoop，哪些必须人工设计。
- mojibake 检查通过。
