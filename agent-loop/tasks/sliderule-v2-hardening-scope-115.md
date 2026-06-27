# SlideRule V2 Hardening 115.00.01: scope and execution rules

## Execution status
- Status: PENDING
- Phase: 115.00-contract
- Goal: Lock the V2 hardening boundary, phase order, commit rules, and AgentLoop execution rules before code changes.
- Required gate: `sliderule-v2-hardening-scope-115Gates`

## Context
115 V2 Skill hardening deepens the existing five legacy Skills after AIGC 114. Keep every change runtime-less: pure data, pure validation, pure projection, pure resolve surfaces. Do not add database, Redis, provider, browser, or real service runtime code.

## Allowed files
- `docs/intent-to-app/skill-v2-hardening-115-status.md`
- `agent-loop/tasks/sliderule-v2-hardening-scope-115.md`

## Do not
- Do not modify unrelated UI, dashboard, or AgentLoop runtime files.
- Do not use `git add -A`.
- Do not introduce credential material, provider credentials, network calls, database access, Redis access, or tool execution.
- Do not weaken existing validation gates or delete existing tests unless the task explicitly replaces them with stricter tests.
- Do not mark this task reviewed until the required validation commands have fresh evidence.

## Implementation steps
- [x] Start from a clean worktree or queue worktree and inspect current Skill behavior.
- [x] Write or update the failing test that proves this hardening behavior is missing. (本 scope phase 为纯 contract 规则锁定；focused tests 由后续 115.00 各 phase 负责)
- [x] Document that 115 hardens the existing five legacy Skills, not AIGC.
- [x] Record the six execution phases and the rule that each phase must be reviewable on its own.
- [x] Document dirty-tree rules: no git add -A, no unrelated files, use worktree for execution.
- [x] Implement the smallest runtime-less model, validator, projector, resolve, or impact change needed. (本 phase 无需模型变更)
- [x] Update documentation only when it clarifies the new V2 contract.
- [x] Append review evidence after validation passes.

## Required validation
- `node agent-loop/src/check-mojibake.js docs/intent-to-app/skill-v2-hardening-115-status.md {{taskFile}}`
- `node agent-loop/src/check-mojibake.js {{taskFile}}`

## Acceptance criteria
- The task advances the V2 sample diagram semantics for its phase.
- New behavior has focused tests with at least one positive case and one negative case when a gate is involved.
- Existing purchase approval and AIGC 114 behavior remains compatible.
- Validation commands have fresh passing evidence recorded in this task file.

## 115 边界 / 六执行阶段记录（115.00-contract）

115 V2 Skill hardening 深化现有的五个 legacy Skills（DataModel、RBAC、Workflow、Page、AppBundle），在 AIGC 114 之后。不扩大系统，不改 AIGC。

当前闭包顺序（保持）：DataModel -> RBAC -> Workflow -> Page -> AIGC -> AppBundle。

### 六执行阶段（每个 phase 必须独立可 review）

1. 115.00.01 scope and execution rules —— 锁定边界、phase order、commit rules、AgentLoop 执行规则（本任务）。
2. 115.00.02 shared Skill contract hardening。
3. 115.00.03 cross-skill reference contract。
4. 115.00.04 gate code taxonomy。
5. 115.00.05 impact graph contract。
6. 115.00.06 shared fixture baseline。

每阶段规则：
- 限定 allowed files。
- 独立 reviewable：一个 phase 的改动可单独通过 review，不依赖其他 phase 未完成内容。
- 每阶段结束后必须有 fresh gate + required validation evidence 记录在对应 task.md 。

### dirty-tree / 执行规则

- 总是从 clean worktree 或 queue worktree 启动；使用 worktree 隔离执行。
- 禁止 `git add -A`；只改任务允许文件。
- 禁止修改无关文件（UI、dashboard、AgentLoop runtime 等）。
- 严禁 credential、network calls、DB、Redis、runtime code。
- 不得弱化 gates 或删除测试。
- 任务完成前必须记录 required validation 的 fresh passing evidence。
- 不得用 git 提交或历史改写；本 worker 只做文件修改。

## Required validation 执行记录

运行命令（fresh evidence，2026-06-27）：

```powershell
node agent-loop/src/check-mojibake.js docs/intent-to-app/skill-v2-hardening-115-status.md agent-loop/tasks/sliderule-v2-hardening-scope-115.md
node agent-loop/src/check-mojibake.js agent-loop/tasks/sliderule-v2-hardening-scope-115.md
```

输出：
- `node ... status.md task.md`：No mojibake findings. (exit 0)
- `node ... task.md`：No mojibake findings. (exit 0)

Gate 其他命令（fresh 确认，无回归）：
- `npx vitest run client/src/lib/skills --reporter=dot`：10 Test Files passed, 137 tests passed.
- `npx tsc --noEmit --pretty false`：exit 0 (clean)。

## Review evidence

Fresh passing evidence 已记录。115.00.01 scope contract 完成边界/阶段/规则/evidence 锁定，符合 review 要求。
