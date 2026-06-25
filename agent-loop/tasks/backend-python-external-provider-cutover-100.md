# 后端 NodeJS 到 Python 迁移：External provider cutover 100

## 执行状态

- 状态：待执行
- 目标：把 Qdrant、embedding、search、OCR、vision、audio、APM、billing、audit platform、deployed Python service 的外部依赖从 diagnostics（诊断）推进到可审计 cutover readiness（切换就绪）层。
- 角色分工：worker 负责 Python/Node cutover readiness 代码和测试；reviewer 确认没有提交真实密钥、没有强制访问外网、没有把 skipped 写成 production ready。

### 状态清单

- [x] Python cutover readiness 能输出 ready、config_missing、skipped、failed、timeout、degraded。
- [x] Node live smoke/cutover route 能消费 Python readiness，并按 provider 分类输出。
- [x] 缺少配置时必须 safe skip（安全跳过），不能红炸，也不能假绿。
- [x] gate 全绿。
- [x] Codex review 确认没有真实外部副作用和密钥泄漏。

## 目标

97 阶段已经有 external live smoke diagnostics，但要接近整体 100%，还需要从“能诊断”推进到“能判断是否可以 cutover（切换）”。本任务不强制外网，不提交密钥，只补可配置、可跳过、可审计的 readiness contract，让生产部署时能明确知道哪些 provider 已可切、哪些还只能保持 Node-owned 或 disabled。

## 允许修改的文件

- `slide-rule-python/services/external_provider_cutover.py`
- `slide-rule-python/services/external_dependency_live_smoke.py`
- `slide-rule-python/services/telemetry.py`
- `slide-rule-python/sliderule_llm/vector.py`
- `slide-rule-python/sliderule_llm/evidence.py`
- `slide-rule-python/tests/test_external_provider_cutover_100.py`
- `slide-rule-python/tests/test_external_dependency_live_smoke_97.py`
- `server/routes/__tests__/python-external-provider-cutover-100.test.ts`
- `server/routes/__tests__/python-external-dependency-live-smoke.test.ts`
- `server/rag/store/qdrant-adapter.ts`
- `server/rag/embedding/embedding-provider.ts`
- `server/core/web-aigc-runtime-observability.ts`
- `shared/telemetry/contracts.ts`
- `agent-loop/tasks/backend-python-external-provider-cutover-100.md`

## 禁止扩大范围

- 不提交 `.env`、API key、Bearer token、数据库密码、Qdrant key 或真实用户数据。
- 不默认访问外网；只有显式 env/config 存在时才允许只读 smoke。
- 不写入真实 Qdrant、APM、billing、audit platform 或外部 provider。
- 不把 skipped/config_missing 写成 ready。
- 不在本任务直接刷新整体迁移百分比。

## 必跑 gate

使用 `agent-loop/scripts/migration-queue.json` 里的 `externalProviderCutover100Gates`。

## 成功标准

- Python 测试覆盖 ready、config_missing、skipped、failed、timeout、degraded。
- Node 测试确认 cutover readiness 能按 Qdrant、embedding、search、OCR、vision、audio、APM、billing、audit platform、deployed Python service 分类输出。
- 既有 deployment/live smoke、vector、observability 测试继续通过。
- 产生真实业务代码 diff，不能以 `HALT_NO_CHANGES` 收口。
- 所有 gate 通过。
