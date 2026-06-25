# 后端 NodeJS 迁 Python：Web AIGC external provider ownership closure 102

## 执行状态

- 状态：待执行
- 目标：对 Web AIGC 长尾和真实 external provider ownership 做 102 收口，明确 search/file/vision/audio/OCR/static/AI PPT/chart/transaction/web-qa/image/graph/page-fetch 等 provider 的真实接管或保留状态。
- 角色分工：worker 负责 Python ownership service、Node provider bridge/observability 和测试；reviewer 必须确认 skipped-live、mock、synthetic 不会被计入真实接管。

### 状态清单

- [x] Python 能输出 Web AIGC external provider ownership matrix。
- [x] Node bridge/observability 能消费 matrix，并区分 `python-owned`、`node-retained`、`skipped-live`、`blocked`、`degraded`。
- [x] 测试覆盖 mock/synthetic 不计入 production takeover。
- [x] gate 全绿。
- [x] review 确认进度文案不虚高。

## 背景

101 已经有 readiness matrix，但状态表仍说大部分 node-adapters、web-qa、image/graph search、real Qdrant/search/OCR/vision/audio/APM/billing 仍是 node-owned-gap。102 不提交真实密钥，不做不可控外部调用，只把真实 provider ownership 和 skipped-live 语义锁死。

## 允许修改的文件

- `slide-rule-python/services/web_aigc_external_provider_ownership_closure.py`
- `slide-rule-python/services/web_aigc_real_provider_readiness.py`
- `slide-rule-python/services/web_aigc_provider_closure.py`
- `slide-rule-python/tests/test_web_aigc_external_provider_ownership_closure_102.py`
- `server/core/web-aigc-runtime-extra-adapters.ts`
- `server/core/web-aigc-runtime-observability.ts`
- `server/tests/web-aigc-external-provider-ownership-closure-102.test.ts`
- `server/tests/web-aigc-real-provider-readiness-101.test.ts`
- `shared/telemetry/contracts.ts`
- `agent-loop/tasks/backend-python-web-aigc-external-provider-ownership-closure-102.md`

## 禁止扩大范围

- 不提交真实 provider 密钥。
- 不发起不可控外部付费调用。
- 不把 skipped-live、mock、fixture、synthetic 写成 real provider ready。
- 不重写 Web AIGC 全部 long-tail routes。
- 不删除既有 Web AIGC runtime adapter 测试。
- 不提交 `.agent-loop`、`.worktrees`、日志、缓存或真实外部响应。

## 必跑 gate

使用 `agent-loop/scripts/migration-queue.json` 里的 `webAigcExternalProviderOwnershipClosure102Gates`。

## 成功标准

- Python matrix 覆盖真实 provider ownership 和 blocked/skipped-live/degraded 分类。
- Node observability 测试确认 skipped-live 不会被计作 real takeover。
- 既有 Web AIGC provider/readiness 测试继续通过。
- 所有 gate 通过。

## 给 worker 的大白话

这次不是去连一堆真实供应商。你要把“哪些真的能由 Python 接管，哪些只是跳过 live，哪些还缺配置”变成代码和测试，不让状态数字靠感觉。
