# SlideRule V2 Skill Hardening 115 状态记录

## 目标

锁定 V2 hardening 边界、phase 顺序、commit 规则和 AgentLoop 执行规则。115 专门对现有五个 legacy Skills 做深层 hardening，而非引入新 Skill 或改动 AIGC 114。115.50 verification handoff 记录最终证据并使 115 队列 reviewable。

## 执行状态
- Status: PENDING
- Phase: 115.50-appbundle-e2e (verification handoff complete)
- Required gate: `sliderule-v2-hardening-verification-handoff-115Gates`

## 115 边界说明

115 V2 Skill hardening 在 AIGC 114 之后，深化现有的五个 legacy Skills：
- DataModel (SSOT 宿主)
- RBAC (PDP 宿主)
- Workflow (PEP 执行点)
- Page (PEP 执行点)
- AppBundle (组装根宿主)

当前默认闭包顺序保持不变：`DataModel -> RBAC -> Workflow -> Page -> AIGC -> AppBundle`。

所有变更必须 runtime-less：纯数据模型、纯校验 gate、纯投影、纯 resolve surface。严禁数据库、Redis、provider、browser 或真实服务 runtime 代码。

不改动 AIGC 114 的行为；purchase approval / leave approval 等现有 E2E 样例必须兼容。

## 115 执行阶段

115 包含 contract 锁定（115.00）与后续子系统 hardening + 最终 verification handoff（115.50）：
1. 115.00.01: scope and execution rules —— 锁定边界、六阶段、dirty-tree 规则、AgentLoop 执行规则。
2. 115.00.02: shared Skill contract hardening —— 扩展共享 Skill 契约，支持 V2 特性表达。
3. 115.00.03: cross-skill reference contract —— 跨 Skill 引用的统一 contract。
4. 115.00.04: gate code taxonomy —— gate 代码分类法与 taxonomy。
5. 115.00.05: impact graph contract —— impact graph 的 contract 收口。
6. 115.00.06: shared fixture baseline —— 共享 fixture 基线。
7. ... 各 Skill 具体 hardening phases（RBAC/Workflow/Page/DataModel/AppBundle 等）。
8. 115.50-appbundle-e2e: verification handoff —— 记录最终验证证据、更新 status docs、使 115 队列 reviewable。

规则：每个 phase 限定在各自的 allowed files 内完成；phase 间的改动互不依赖提交；每阶段的验证证据（gate + validation commands）必须 fresh 且记录在对应 task 文件中。任何 phase 都可单独接受 review，不允许混合未完成 phase 的脏 diff。最终 handoff 汇总确认所有 115 tasks 证据齐全。

## dirty-tree / AgentLoop 执行规则

- 必须从 clean worktree 或 queue worktree 开始，所有执行使用 worktree 隔离。
- 禁止使用 `git add -A`（只改 allowed files，使用显式 add 或 worktree 机制）。
- 只修改任务显式列出的 allowed files；严禁改动无关 UI、dashboard、AgentLoop runtime 文件。
- 不得引入 credential material、provider credentials、网络调用、数据库访问、Redis 访问或工具执行代码。
- 不得削弱现有 validation gates 或删除现有测试（除非任务明确用更严格测试替换）。
- 不得在任务标记 reviewed 前，缺少 required validation commands 的 fresh passing evidence。
- 验证命令输出必须记录在本 task 文件末尾，作为审查证据。
- 最终 verification handoff gate 包含：`node agent-loop/src/check-mojibake.js`（对 README + status + task + 单 task）、`pnpm exec vitest run client/src/lib/skills --reporter=dot`、`pnpm exec tsc --noEmit --pretty false`。
- 所有 115 phases 均记录了各自 fresh evidence。

## 实施步骤完成记录（含 verification handoff）

- [x] Start from a clean worktree or queue worktree and inspect current Skill behavior. （已读确认五 legacy + AppBundle + AIGC 顺序，314 tests 基线）
- [x] Write or update the failing test that proves this hardening behavior is missing. （各 hardening phase 均有 focused tests，正负例；handoff 无新测试）
- [x] Document what V2 hardening completed and what remains intentionally out of scope. （见边界 + 非目标）
- [x] Record exact verification commands and expected evidence. （更新至 115.50）
- [x] Confirm all 115 tasks have review evidence before final landing. （handoff 确认）
- [x] Implement the smallest runtime-less model, validator, projector, resolve, or impact change needed. （115 各 phase 完成；无 runtime）
- [x] Update documentation only when it clarifies the new V2 contract. （本 status.md + handoff task + README 同步）
- [x] Append review evidence after validation passes. （见下节 + handoff task）

## 关键文件（allowed for handoff）

- `docs/intent-to-app/skill-v2-hardening-115-status.md`
- `client/src/lib/skills/README.md`
- `agent-loop/tasks/sliderule-v2-hardening-verification-handoff-115.md`
- 各 phase 对应 task 文件（已分别记录证据）

## 验证证据

Required validation commands for final handoff (fresh run 2026-06-27 after handoff updates to README + status + task)：

```powershell
pnpm exec vitest run client/src/lib/skills --reporter=dot
pnpm exec tsc --noEmit --pretty false
node agent-loop/src/check-mojibake.js client/src/lib/skills/README.md docs/intent-to-app/skill-v2-hardening-115-status.md agent-loop/tasks/sliderule-v2-hardening-verification-handoff-115.md
node agent-loop/src/check-mojibake.js agent-loop/tasks/sliderule-v2-hardening-verification-handoff-115.md
```

输出结果：
- `pnpm exec vitest run client/src/lib/skills --reporter=dot` → 314 tests passed (10 files)
- `pnpm exec tsc --noEmit --pretty false` → exit 0
- `node agent-loop/src/check-mojibake.js client/src/lib/skills/README.md docs/intent-to-app/skill-v2-hardening-115-status.md agent-loop/tasks/sliderule-v2-hardening-verification-handoff-115.md` → No mojibake findings. (exit 0)
- `node agent-loop/src/check-mojibake.js agent-loop/tasks/sliderule-v2-hardening-verification-handoff-115.md` → No mojibake findings. (exit 0)

Gate 确认（sliderule-v2-hardening-verification-handoff-115Gates）：
- 所有命令 fresh passing。
- 最终 115 基线：314 tests passed（涵盖 datamodel/rbac/workflow/page/aigc/appbundle + orchestrator/impact/purchaseApproval）。
- 兼容 AIGC 114 / purchase approval 行为。

## 115 完成与 verification handoff 收口记录

- 115.00-contract 锁定边界、规则、taxonomy、fixtures、contracts 已完成并记录。
- 各 legacy Skill hardening（含 AppBundle）已按 phase 推进，V2 sample diagram 语义演进（purchase/leave approval）。
- 115.50-appbundle-e2e handoff：已记录最终验证证据（314 tests、tsc clean、mojibake clean on allowed files），更新本 status + README + handoff task。
- 所有 115 tasks 现均有 review evidence；115 hardening queue reviewable。
- 本 status 汇总最终状态；单个 phase task 保留各自 fresh evidence。

## 非目标

- 不继续扩大 Skill 数量（AIGC 已是第六）。
- 不引入真实 runtime、LLM 调用、provider key、DB/Redis。
- 不改写历史、提交、git add -A。
- 不弱化 gate 或现有测试。
- 不标记 reviewed 直到 fresh evidence 就位。

## 下一步

115 hardening + handoff 已完成。V2 sample diagram 语义已在各 phase 推进（含 AppBundle 闭包）。后续进入 review / landing；保持兼容现有 purchase approval 和 AIGC 114 行为。

## 收口备注

115 全阶段已完成边界锁定、hardening、最终 handoff 证据记录。队列现可 review。所有变更 runtime-less，保持 purchase approval 和 AIGC 114 兼容。
