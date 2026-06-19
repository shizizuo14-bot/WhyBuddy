# 后端 NodeJS 到 Python 迁移：Blueprint spec-docs inventory

## 执行状态

- 状态：已完成 — Blueprint spec-docs 迁移边界已盘点
- 目标：盘点 Blueprint/spec-docs（蓝图/规格文档）LLM 链路，准备切出 Python proxy（代理）迁移片
- 前置：LLM infra Phase 1 parity 建议先完成或保持全绿

### 状态清单

- [x] 已执行本地审计
- [x] Node 侧 spec-docs LLM route/helper 已盘点
- [x] prompt / response shape / gate 已列出
- [x] Python proxy 可切片边界已定义
- [x] mojibake 检查通过
- [x] 人工 review（审查）已确认 diff 干净

## 最近执行

- 最近执行：2026-06-19
- 执行方式：Codex 本地审计，不发 live LLM，不迁业务代码
- 审计报告：`docs/backend-python-blueprint-spec-docs-inventory.md`
- gate 结果：`blueprintInventoryGates` 通过

## 目标

只做 inventory（盘点），不写业务迁移实现。找出 Blueprint/spec-docs 里最小可迁的 LLM 调用链，为后续 `backend-python-blueprint-spec-docs-proxy-contract.md` 做准备。

## 允许修改的文件

- `agent-loop/tasks/backend-python-blueprint-spec-docs-inventory.md`
- `docs/backend-python-blueprint-spec-docs-inventory.md`
- `agent-loop/tasks/sliderule-python-migration-status.md`（仅同步下一步，不改百分比除非有验证）

## 禁止扩大范围

- 不改 Blueprint/Autopilot 业务代码。
- 不迁 route。
- 不改 UI。
- 不提交运行产物。

## 必跑 gate

使用 `agent-loop/scripts/migration-queue.json` 里的 `blueprintInventoryGates`。

## 成功标准

- 文档列出 Node 侧入口、Python 可承接边界、测试建议、风险。
- 选出一个最小 spec-docs proxy 切片。
- mojibake 检查通过。
