# 后端 NodeJS 到 Python 迁移：LLM fallback parity

## 执行状态

- 状态：待执行
- 目标：把 Python `sliderule_llm` 的 fallback（备用模型/备用 provider）从“能读配置”推进到“能真实参与调用链”
- 前置：`backend-python-llm-client-parity.md` 已完成或保持全绿
- 注意：本任务不发 live LLM；使用 mock caller / fake provider 验证链路。

### 状态清单

- [ ] 已执行 AgentLoop
- [ ] fallback provider（备用供应商）链路已接入 Python client
- [ ] model fallback（模型备用）顺序和错误处理已验证
- [ ] transient / permanent error（瞬时/永久错误）不会误切换
- [ ] gate 全绿
- [ ] 人工 review（审查）已确认 diff 干净

## 目标

让 Python LLM client（大模型客户端）在主 provider 或主 model 失败时，能按配置尝试 fallback（备用）路径，并保留清晰的 error / usage / model metadata（错误/用量/模型元数据）。

## 允许修改的文件

- `tws-ai-slide-rule-python/sliderule_llm/client.py`
- `tws-ai-slide-rule-python/sliderule_llm/config.py`
- `tws-ai-slide-rule-python/sliderule_llm/__init__.py`
- `tws-ai-slide-rule-python/tests/test_fallback_parity.py`
- `tws-ai-slide-rule-python/tests/test_client_parity.py`
- `tws-ai-slide-rule-python/tests/test_config.py`
- `agent-loop/tasks/backend-python-llm-fallback-parity.md`

## 禁止扩大范围

- 不启动 live LLM。
- 不修改 Node LLM client。
- 不迁 SlideRule capability（能力）。
- 不提交 `.env`、`.agent-loop/`、运行日志或真实密钥。

## 必跑 gate

使用 `agent-loop/scripts/migration-queue.json` 里的 `fallbackGates`。

## 成功标准

- `tests/test_fallback_parity.py` 全绿。
- Python client 能按配置尝试 fallback provider / fallback model。
- transient error（瞬时错误）可触发 fallback；auth/config/permanent error（鉴权/配置/永久错误）不会盲目重试。
- 返回值保留实际使用的 model/provider/usage 信息。
- diff 只落在允许文件范围内。
