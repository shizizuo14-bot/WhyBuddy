# Intent-to-App Skill V2 迁移状态

本文档记录 runtime-less Skill 层的 V2 迁移进度。目标是把产品推演平台从“只画架构图”推进到“能生成结构化 SPEC、能校验闭包、能自动投影总图、能做影响分析”的状态。

## 当前结论

- 113 队列：五系统闭包已完成，覆盖 DataModel、RBAC、Workflow、Page、AppBundle。
- 114 队列：AIGC 已作为第六个 PEP Skill 接入。
- 当前默认闭包：`DataModel -> RBAC -> Workflow -> Page -> AIGC -> AppBundle`。
- 当前端到端样例：`leave approval` 和 `purchase approval`。
- 当前重点样例：`purchase approval` 已包含 AIGC `budget_risk_summary` capability，并进入 publish gate、version pins、runtime snapshot 和 impact graph。

## 113 五系统结果

| 能力 | V2 角色 | 状态 |
|---|---|---|
| DataModel | SSOT 宿主 | DONE_REVIEWED |
| RBAC | PDP 宿主 | DONE_REVIEWED |
| Workflow | PEP 执行点 | DONE_REVIEWED |
| Page | PEP 执行点 | DONE_REVIEWED |
| AppBundle | 组装根宿主 | DONE_REVIEWED |
| Publish gate | 应用发布门禁 | DONE_REVIEWED |
| Impact graph | 全局影响分析 | DONE_REVIEWED |

113 收口验证记录：

- `pnpm exec vitest run client/src/lib/skills --reporter=dot`：9 个测试文件，115 个测试通过。
- `pnpm exec tsc --noEmit --pretty false`：退出码 0。

## 114 AIGC 结果

| 能力 | V2 角色 | 状态 |
|---|---|---|
| AIGC base model | PEP 元模型 | DONE_REVIEWED |
| Provider router | KeyRef/SecretRef 元数据 | DONE_REVIEWED |
| Prompt + OutputSchema | 版本化 prompt 和结构化输出 | DONE_REVIEWED |
| RAG + Citation | 检索策略和引用策略 | DONE_REVIEWED |
| ToolSkillConfig | 工具治理元数据 | DONE_REVIEWED |
| RBAC PEP gate | 委托 RBAC PDP | DONE_REVIEWED |
| DataModel SSOT gate | 绑定 DataModel 字段 | DONE_REVIEWED |
| Project/Resolve/CrossRefs | 进入统一图 | DONE_REVIEWED |
| Impact graph | 字段/角色变更能追到 AIGC | DONE_REVIEWED |
| AppBundle pins | AIGC capability 进入应用包钉选 | DONE_REVIEWED |
| Purchase E2E | 六系统采购审批闭包 | DONE_REVIEWED |
| Handoff docs | README/status/handoff | DONE_REVIEWED |

114 收口验证记录：

- `pnpm exec vitest run client/src/lib/skills/aigc/aigcSkill.test.ts --reporter=dot`：1 个测试文件，17 个测试通过。
- `pnpm exec vitest run client/src/lib/skills --reporter=dot`：10 个测试文件，137 个测试通过。
- `pnpm exec tsc --noEmit --pretty false`：退出码 0。
- `node agent-loop/src/check-mojibake.js client/src/lib/skills/README.md docs/intent-to-app/skill-v2-migration-status.md docs/intent-to-app/aigc-skill-114-status.md`：No mojibake findings。

## 当前非目标

- 不接真实 LLM provider。
- 不保存真实 key，不读取 `.env`，不调用外部网络。
- 不执行工具/MCP/API runtime。
- 不物化到重型低代码平台。
- 不承诺业务设计一定正确；gate 只保证结构和引用闭包。

## 下一步建议：115 V2 Skill Hardening

114 接入 AIGC 后，下一轮建议开 `115 V2 Skill hardening` 队列，专门补五个老系统的深水区：

- RBAC：更完整的 PDP decision matrix、租户边界、数据规则组合。
- DataModel：字段演进、兼容性、引用迁移、OLAP 投影边界。
- Workflow：并行、会签、超时、委托、子流程。
- Page：复杂组件树、页面状态、跨组件依赖图。
- AppBundle：更严格的闭包快照、版本升级影响、发布回滚。
