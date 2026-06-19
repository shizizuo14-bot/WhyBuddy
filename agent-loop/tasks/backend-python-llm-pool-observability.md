# 后端 NodeJS 到 Python 迁移：LLM pool observability

## 执行状态

- 状态：待执行
- 目标：在 LLM pool resilience（池子韧性）之后补 pool observability（观测元数据）
- 角色分工：Grok 负责补失败元数据和测试；Codex 负责审查是否泄露 key 或把观测写成业务逻辑

### 状态清单

- [ ] 已执行 AgentLoop
- [ ] Python test 覆盖 last failures、selected key metadata、penalty window metadata
- [ ] 元数据不包含真实 API key
- [ ] 旧 pool parity 和 resilience 测试不退化
- [ ] gate 全绿
- [ ] Codex review（审查）确认没有泄露密钥

## 目标

Python pool 已有基础 fallback 和 resilience 测试。下一步补 observability：当某个 key 失败、被惩罚、跳过或选中时，外部能拿到安全的诊断元数据，但不能泄露真实 key。

这个任务不改路由策略，只补可观察性。

## 允许修改的文件

- `tws-ai-slide-rule-python/sliderule_llm/pool.py`
- `tws-ai-slide-rule-python/tests/test_pool_observability.py`
- `tws-ai-slide-rule-python/tests/test_pool_resilience.py`
- `tws-ai-slide-rule-python/tests/test_pool_parity.py`
- `agent-loop/tasks/backend-python-llm-pool-observability.md`

## 禁止扩大范围

- 不打印、返回或提交真实 API key。
- 不改变 504 penalty / circuit breaker（惩罚窗口/熔断）已有语义。
- 不新增真实网络依赖。
- 不改 Node pool。
- 不更新全局迁移百分比。

## 必跑 gate

使用 `agent-loop/scripts/migration-queue.json` 里的 `llmPoolObservabilityGates`。

## 成功标准

- Python test 能看到安全的 failure metadata（失败元数据），只包含 key id/hash/alias 之类脱敏信息。
- selected / skipped / penalized 三类 pool 事件可被测试断言。
- 旧 pool parity 和 resilience 测试继续通过。
- 所有 gate 通过，且没有密钥泄露。
