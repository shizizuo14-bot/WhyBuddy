# AIGC Skill 114 状态记录

## 目标

把 AIGC 中台从 V2 架构图落成 runtime-less Skill：只保留模型、gate、图投影和跨系统引用，不引入数据库、Redis、真实 LLM、真实 provider key 或工具运行时。

## 完成范围

| Task | 状态 | 结果 |
|---|---|---|
| 114.01 base metamodel | DONE_REVIEWED | 新增 `AigcModel`、`AigcCapability`、provider、prompt、output schema、knowledge source、retrieval/citation policy、tool config/policy。 |
| 114.02 provider router | DONE_REVIEWED | 校验 provider/model/tokenBudget，拒绝 `apiKey`/`secret`/`rawKey`。 |
| 114.03 prompt/output schema | DONE_REVIEWED | prompt 必须版本化，output schema 必须类型合法；采购风险输出包含 `riskLevel`、`summary`、`recommendedAction`。 |
| 114.04 RAG/citation | DONE_REVIEWED | RAG source、retrieval policy、citation policy 都是纯元数据，citation-required 能力不能缺 citation policy。 |
| 114.05 tool config | DONE_REVIEWED | 工具只作为治理元数据，校验 whitelist、permission refs、budget/timeout。 |
| 114.06 RBAC PEP gate | DONE_REVIEWED | AIGC 权限委托 RBAC；未接 RBAC 给 warning，接了但缺 role/permission 给 error。 |
| 114.07 DataModel SSOT gate | DONE_REVIEWED | AIGC 输入/输出字段绑定 DataModel；missing/removed 字段失败，deprecated 字段 warning。 |
| 114.08 project/resolve | DONE_REVIEWED | AIGC 进入统一图，暴露 capability/provider/prompt/outputSchema/knowledgeSource/tool surface。 |
| 114.09 impact graph | DONE_REVIEWED | `purchase_request.amount` 和 `finance` 变更会影响 AIGC `budget_risk_summary`。 |
| 114.10 AppBundle pins | DONE_REVIEWED | AppBundle 能引用 AIGC capability，并要求 `aigc:budget_risk_summary@1.0.0` 版本钉选。 |
| 114.11 purchase E2E | DONE_REVIEWED | `purchase approval` 成为六系统闭包样例。 |
| 114.12 verification | DONE_REVIEWED | README/status/handoff 已更新，完整验证通过。 |

## 关键文件

- `client/src/lib/skills/aigc/aigcModel.ts`
- `client/src/lib/skills/aigc/aigcSkill.ts`
- `client/src/lib/skills/aigc/aigcSkill.test.ts`
- `client/src/lib/skills/slideRule.ts`
- `client/src/lib/skills/appbundle/appBundleModel.ts`
- `client/src/lib/skills/appbundle/appBundleSkill.ts`
- `client/src/lib/skills/appbundle/appBundleSkill.test.ts`
- `client/src/lib/skills/orchestrator.test.ts`
- `client/src/lib/skills/impact.test.ts`
- `client/src/lib/skills/purchaseApproval.test.ts`

## 验证证据

```powershell
pnpm exec vitest run client/src/lib/skills/aigc/aigcSkill.test.ts --reporter=dot
pnpm exec vitest run client/src/lib/skills/orchestrator.test.ts --reporter=dot
pnpm exec vitest run client/src/lib/skills/appbundle/appBundleSkill.test.ts --reporter=dot
pnpm exec vitest run client/src/lib/skills/impact.test.ts --reporter=dot
pnpm exec vitest run client/src/lib/skills/purchaseApproval.test.ts --reporter=dot
pnpm exec vitest run client/src/lib/skills --reporter=dot
pnpm exec tsc --noEmit --pretty false
```

结果：

- AIGC 单测：17 passed。
- AppBundle 单测：20 passed。
- Impact 单测：9 passed。
- Purchase E2E：4 passed。
- 完整 Skill suite：10 个测试文件，137 个测试通过。
- TypeScript：退出码 0。

## 非目标

- 不接真实 LLM。
- 不调用真实 provider。
- 不保存真实 key。
- 不执行工具或 MCP。
- 不写数据库或 Redis。

## 下一步：115 V2 Skill hardening

AIGC 已接入以后，下一轮建议不要继续扩大系统数量，而是开 `115 V2 Skill hardening` 队列，补五个老系统的深水区，让六系统闭包更接近真实企业级平台。
