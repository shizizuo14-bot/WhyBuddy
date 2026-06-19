# SlideRule Python live smoke suite

## 执行状态

- 状态：待执行
- 目标：建立 SlideRule Node 到 Python 的 live smoke（真实冒烟）测试套件
- 前置：主要 SlideRule capability 已迁到 Python native LLM；本任务不追求覆盖所有业务细节

### 状态清单

- [ ] 已执行 AgentLoop
- [ ] Python service（Python 服务）健康检查路径可测
- [ ] Node delegation（Node 委托）到 Python 的抽样 live smoke 可测
- [ ] smoke 不依赖真实外部 LLM key
- [ ] gate 全绿
- [ ] 人工 review（审查）已确认 diff 干净

## 目标

补一组可在本机/CI 安全运行的 live smoke gate：启动或连接 Python service，走 Node proxy/delegation，抽样验证 `intent.clarify`、`report.write`、`handoff.package` 等核心能力返回形状和 provenance。

## 允许修改的文件

- `tws-ai-slide-rule-python/tests/test_v5_live_smoke.py`
- `server/routes/__tests__/sliderule.live-delegation.test.ts`
- `agent-loop/tasks/sliderule-python-live-smoke-suite.md`
- `agent-loop/scripts/migration-queue.json`（仅 gate 命令必要时）

## 禁止扩大范围

- 不发真实外部 LLM 请求。
- 不要求真实生产 key。
- 不修改业务 prompt。
- 不提交端口日志、运行缓存、`.env`。

## 必跑 gate

使用 `agent-loop/scripts/migration-queue.json` 里的 `liveSmokeGates`。

## 成功标准

- live smoke 能在无真实 LLM key 情况下通过 mock/fallback 或测试服务完成。
- 至少覆盖一个 dialogue（对话）、一个 JSON/report（报告）、一个 delivery handoff（交付打包）能力。
- 失败时错误信息能区分 Python service 不可达、Node proxy 错误、能力契约错误。
