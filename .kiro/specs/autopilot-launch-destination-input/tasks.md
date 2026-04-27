# 任务清单：自动驾驶目的地输入

- [x] 盘点 `UnifiedLaunchComposer` 当前入口文案、placeholder、按钮、空状态，统一替换为目的地输入心智。
- [x] 设计并实现目的地示例 chips，覆盖分析、生成、实现、研究、附件处理、需要高级执行六类场景。
- [x] 增加目的地预览卡片，展示目标、交付物、约束、时间线、成功标准。
- [x] 增加缺失路标提示，明确缺失字段、影响原因和补充建议。
- [x] 将附件状态纳入目的地预览，解释附件为何触发深度路线或高级编排。
- [x] 将 `buildLaunchRoutePlan()` 的判断结果与目的地预览关联，避免路线面板与输入提示各说各话。
- [x] 为目的地输入补充单元测试，覆盖完整输入、短输入、附件输入、高级执行输入。
- [x] 为中文与英文入口文案补充测试或快照，避免后续回退到“创建任务”心智。
- [x] 回补 `destination-model-and-parser` 与 `destination-card-and-goal-summary` 中已落地代码字段的差异说明。
- [x] 检查并修复既有 18 份 specs 落地代码中 Destination 字段命名不一致的问题。
- [x] 检查 `TaskAutopilotPanel` 的 destination fallback，避免 preview 与 detail 展示不一致。
- [x] 更新 README / steering 中“如何触发自动驾驶”的最小输入示例。

## Lane 6 回补说明（2026-04-26）

- 本轮只修补前端 destination preview/parser 的识别缺陷，不调整总勾选数。
- `buildLaunchDestinationPreview()` 已补充稳定英文标签路径，能识别 `Deliverables / Constraints / Success criteria` 这类带冒号或换行的输入，并避免把多项交付物、成功标准、约束互相串段。
- 回归测试新增覆盖：英文稳定标签输入下的多交付物、多约束、多成功标准；同时保留当前并行 lane 扩展后的 6 类 launch examples，验证其 routeId 仍属于合法 route 集合并覆盖 standard/deep/upgrade 分支。
- 仍未在本 lane 内处理的是跨 18 specs 的 Destination 字段命名一致性审计、`TaskAutopilotPanel` preview/detail 完整一致性，以及 README / steering 的触发示例扩展；这些仍应留给后续文档或集成 lane。

## Lane F 文档回补说明（2026-04-26）

- README / README.zh-CN 已补齐六类最小目的地输入示例，并与前端 chips：analysis、generation、implementation、research、attachment、advanced-execution 对齐。
- `.kiro/steering/task-autopilot-frontend-experience-spec-roadmap-2026-04-26.md` 已回补 parser/projection 与 launch preview、cockpit goal card 的字段差异：parser 保留审计、映射和版本字段；frontend preview/card 只展示轻量 view model 字段。
- 仍未完成的是跨 18 specs 的 Destination 字段命名一致性审计，以及 `TaskAutopilotPanel` preview/detail fallback 的代码级一致性检查。

## Lane D/E 实现收口说明（2026-04-27）

- `autopilot-launch-examples` 与 `use-autopilot-cockpit-model` 已集中化 Destination alias normalization，覆盖 `goal / request / deliverable(s) / successCriteria / success_criteria / constraints / missingInfo / lockState / lock_state` 等 canonical、legacy 与 snake_case 命名。
- `TaskAutopilotPanel` 已补齐 parser-backed destination fallback，覆盖 `destination.parser.*`、`normalizedGoal.expectedDeliverables`、`mappedMissionContext.reviewInput.*`、`mappedWorkflowInput.plannerInput.*`、missing info 与 clarification aliases，避免 launch preview 与 detail 目的地卡片字段分叉。
- 对应 lib 与 panel 测试已覆盖混合命名、结构化 parser 数组、mapped mission/workflow 字段和 normalized deliverables。
