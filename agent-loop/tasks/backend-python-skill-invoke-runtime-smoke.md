# 后端 NodeJS 到 Python 迁移：skill.invoke runtime smoke

## 执行状态

- 状态：待执行
- 目标：在 skill.invoke contract（契约）之后补一个 fake skill runtime smoke（假技能运行时冒烟）
- 角色分工：Grok 负责补最小 fake skill registry 和测试；Codex 负责审查是否误称为真实技能运行时

### 状态清单

- [ ] 已执行 AgentLoop
- [ ] Python test 覆盖 fake skill 成功执行
- [ ] Python test 覆盖 skill 不存在、参数错误、runtime 不可用
- [ ] Node test 确认 provenance（来源）不伪装
- [ ] gate 全绿
- [ ] Codex review（审查）确认没有接真实外部工具或权限系统

## 目标

上一片已经锁住 `skill.invoke` 当前仍是 fallback/mapped path（回退/映射路径）。这一片只补一个可注入 fake skill registry 的 runtime smoke：证明 Python 侧有清楚的 skill runtime 接口和错误形状。

这个任务不迁真实技能系统，只为后续真实 runtime 做接口地基。

## 允许修改的文件

- `tws-ai-slide-rule-python/services/slide_rule_executor.py`
- `tws-ai-slide-rule-python/services/capability_maps.py`
- `tws-ai-slide-rule-python/tests/test_skill_invoke_runtime_smoke.py`
- `tws-ai-slide-rule-python/tests/test_skill_invoke_contract.py`
- `server/routes/__tests__/sliderule.skill-invoke-contract.test.ts`
- `agent-loop/tasks/backend-python-skill-invoke-runtime-smoke.md`

## 禁止扩大范围

- 不接真实技能市场、权限系统或外部工具。
- 不把 fake skill 标成 production runtime。
- 不删除或弱化已有 `skill.invoke` contract。
- 不改无关 SlideRule capability。
- 不更新全局迁移百分比。

## 必跑 gate

使用 `agent-loop/scripts/migration-queue.json` 里的 `skillInvokeRuntimeSmokeGates`。

## 成功标准

- Python runtime smoke 能通过 fake registry 执行一个确定性 skill。
- skill missing、bad args、runtime unavailable 都有稳定 degraded/error shape。
- provenance 不混淆 fallback、fake runtime 和 real skill runtime。
- 所有 gate 通过。
