# Issue: WhyBuddy `/respond` relay / provider injection diagnosis

**Date:** 2026-06-11  
**Context:** S7 叙述加固前置诊断；用户报告图二式跑题/身份劫持（如「路线对比→交通路线」、开场自我介绍）。

## Diagnostic command

```bash
curl -s -m 130 -X POST "http://127.0.0.1:3001/api/whybuddy/respond" \
  -H "Content-Type: application/json" \
  -d '{"turnId":"diag-relay","userText":"路线对比一下","state":{"sessionId":"diag","goal":{"text":"权限系统","status":"needs_refinement"}},"selected":[{"capabilityId":"route.compare","roleId":"工程"}]}'
```

## Result (2026-06-11 run)

| Field | Value |
|---|---|
| HTTP code | `000` (connection failed) |
| Time | ~0.08s |
| Body | empty |
| Server | `127.0.0.1:3001` not reachable at run time |

**Conclusion:** 本次 curl 未能打到 live 服务，**不能**据此实锤 relay 注入；需在 `dev:all` 启动后重跑同一命令，检查响应正文是否含：

- 开场 `我是 ChatGPT/作为 AI 助手` 等劫持句式 → 倾向 **provider/relay 注入**
- 「交通/导航/地图」类跑题 → 倾向 **领域锚定失效**（S7 已加 prompt + 劫持探测）

## Mitigations landed (S7)

- `shared/blueprint/whybuddy-narration-immunity.ts` — 身份折叠、领域锚定、开场劫持探测（不误杀「我建议/我认为」）
- `/respond` 劫持 → `reason: hijacked` + 模板降级
- 能力侧 + `/orchestrate-plan` 同步领域锚定

## Follow-up

1. 服务启动后重跑 curl，将 HTTP code、首 500 字 body、`source`/`reason` 追加到本 issue。
2. 若实锤 relay 注入：评估换 provider 或直连 `NO_PROXY` 域名（与主 LLM 配置一致）。
3. 配置：`WHYBUDDY_NARRATION_BRAND_WORDS`（逗号分隔品牌词表，可选）。