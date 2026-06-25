# 后端 NodeJS 到 Python 迁移：LLM pool parity

## 执行状态

- 状态：进行中 — 红灯测试已落地，等待 AgentLoop + Grok 修复
- 目标：让 Python `sliderule_llm.pool` 对齐 Node `pool-json-llm` 关键运行语义
- 前置：`backend-python-llm-config-parity.md` 已完成；`client-parity` 建议先完成
- 注意：用 mock caller，不发 live pool 请求。

- 最近执行：2026-06-17
- 最近确认：2026-06-17
- AgentLoop run id：`2026-06-17T14-08-00-495Z`
- AgentLoop 本地时间：`2026-06-17 22:08:00 (Asia/Shanghai)`
- AgentLoop 结果：`DONE_REVIEWED`
- AgentLoop 运行模式：`grok-review`
- Grok 已运行：`true`
- Codex 已运行：`false`
- gate 结果：最终状态为 `DONE_REVIEWED`
### 状态清单

- [x] 代理环境下默认 `sequential` race mode
- [x] 504 / transient 错误 penalty 与 key 冷却
- [x] pool label / model metadata 保留
- [x] `call_pool_json` 空 JSON / 形状失败时不假装成功
- [x] `tests/test_pool_parity.py` 绿灯
- [x] 现有 `test_pool.py` 无回归

## 目标

补齐 Python pool 的运行语义，支撑 SlideRule/Blueprint pool 调用路径后续迁移。

## 允许修改的文件

- `slide-rule-python/sliderule_llm/pool.py`
- `slide-rule-python/sliderule_llm/config.py`（仅 pool 相关字段）
- `slide-rule-python/sliderule_llm/__init__.py`
- `slide-rule-python/tests/test_pool_parity.py`
- `slide-rule-python/tests/test_pool.py`
- `agent-loop/tasks/backend-python-llm-pool-parity.md`

## 禁止事项

- 不修改 `client.py` 主聊天路径（除非 pool 共享小函数且 gate 证明必要）
- 不修改 Node `server/sliderule/pool-json-llm.ts`
- 不启动 live LLM / live pool
- 不提交 `.agent-loop/`、`.env`

## 必跑 gate

```powershell
cd slide-rule-python; .\.venv\Scripts\python.exe -m pytest tests/test_pool_parity.py tests/test_pool.py tests/test_config.py -q --tb=short
```

```powershell
node agent-loop/src/check-mojibake.js agent-loop/tasks/backend-python-llm-pool-parity.md slide-rule-python/sliderule_llm/pool.py slide-rule-python/tests/test_pool_parity.py
```

## 成功标准

- `tests/test_pool_parity.py` 全绿
- `tests/test_pool.py` 无回归