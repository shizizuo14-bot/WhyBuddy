# 后端 NodeJS 到 Python 迁移：LLM pool resilience

## 执行状态

- 状态：已完成
- 目标：补 Python LLM pool（模型池）的 resilience（韧性）测试：并发、熔断、退避和失败归因
- 角色分工：Grok 负责补测试和最小实现；Codex 负责审查是否改出假成功或吞错误

### 状态清单

- [x] 已执行 AgentLoop
- [x] pool resilience test 覆盖并发/失败/fallback/熔断过期
- [x] 失败归因不会被吞掉
- [x] 不发真实 LLM 请求
- [x] gate 全绿
- [x] Codex review（审查）已确认没有把 fake provider 稳定性当成真实供应商稳定性

## 目标

当前 Python LLM infra 已有 client/pool/fallback/telemetry，但要支撑更多后端迁移，必须补 pool resilience（模型池韧性）：并发调用、provider failure（供应商失败）、fallback path（回退路径）、backoff/circuit breaker（退避/熔断）至少有可测边界。

## 允许修改的文件

- `tws-ai-slide-rule-python/sliderule_llm/pool.py`
- `tws-ai-slide-rule-python/sliderule_llm/client.py`
- `tws-ai-slide-rule-python/tests/test_pool_resilience.py`
- `tws-ai-slide-rule-python/tests/test_pool_parity.py`
- `tws-ai-slide-rule-python/tests/test_telemetry_cost.py`
- `agent-loop/tasks/backend-python-llm-pool-resilience.md`

## 禁止扩大范围

- 不发 live LLM。
- 不接真实 billing API。
- 不改业务 capability prompt。
- 不提交真实 key、日志、`.env`。
- 不更新全局迁移百分比。

## 必跑 gate

使用 `agent-loop/scripts/migration-queue.json` 里的 `llmPoolResilienceGates`。

## 成功标准

- fake providers 下可测并发、失败、fallback、退避/熔断边界。
- 错误原因和 telemetry 不丢。
- 不破坏现有 pool parity / telemetry 测试。
- 所有 gate 通过。
