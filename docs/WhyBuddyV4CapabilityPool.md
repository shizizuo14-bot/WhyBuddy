# WhyBuddy V4 Capability Pool（能力池重构说明文档）

**版本**：v1.0（基于 2026-06 用户觉察）
**目的**：将“阶段”重新归类为能力包，确立 V4 作为目标驱动的能力调用网络，而非固定流水线。防止后续实现被“第几阶段”惯性带偏。
**核心判断标准**：以后所有代码、UI、调度、文档决策，都要先问一句——“这是业务真实依赖，还是旧 pipeline 惯性？”

---

## 1. 核心原则

V4 **不是** 固定阶段流水线（Input → Clarification → Route Selection → SPEC Tree → SPEC Docs → Effect Preview → ...）。

V4 **是** 目标驱动的能力调用网络（target-driven capability scheduling network）。

- 所有旧“阶段”都是能力池中的**能力包**（capability packages）。
- 能力可以被多 Agent 在任意推演轮次**按需调用、反复调用、交叉调用、回溯调用**。
- 最终服务于“证明 / 补全 / 反驳 / 收敛一个产品结论”。
- 控制平面从 `runNextStage(currentStage)` 升级为 `pickNextCapabilities(goal, reasoningState, gaps, agentVotes)` / `orchestrateReasoningTurn(...)`。
- 旧 stage 保留，但**仅作为**：
  - UI grouping
  - artifact family
  - history label
  - compatibility layer
- 真实运行时是 **V4 Reasoning Loop**：
  用户原始输入 / 当前结论
        ↓
  V4 Reasoning Loop（多 Agent 角色池）
        ↓
  能力池 Capability Pool
        ↓
  证据 / 观点 / 反证 / 风险 / 预览 / 文档 / 树
        ↓
  Reasoning Graph（capability invocation graph）
        ↓
  收敛器 Synthesis
        ↓
  可行性报告 / 产品推演报告 / 下一轮行动
        ↺（可重入）

**产品原则（后续所有决策的判断标准）**：
1. 主入口是聊天框（操纵杆），不是阶段向导。
2. 聊天框是操纵杆，不是结果容器。
3. 所有输出都是 artifact（可寻址、可质疑、可追溯、带 provenance）。
4. 旧阶段全部降级为能力池里的能力包。
5. 用户可以随时要求澄清、反驳、重做、预览、出方案、出报告、针对任意节点/段落继续。
6. 系统不推进阶段，只推进推演状态 + capability runs。
7. V4 闭环图是控制平面，UI 只是它的可操作外壳。
8. **画面临时，状态常驻**：黑板（图、报告、方案）可以随聊天流滚走，但背后的 reasoning graph、capability 调用历史、节点/边/证据必须能被找回。
9. 自由的是“whether / when / 顺序”，不自由的是“出来的东西必须可信”（gate、provenance、QA ledger、确定性渲染）。

**一句话总结**：
阶段不是流程，阶段是能力。V4 的核心是围绕一个目标动态调用能力池，完成多 Agent 推演、证明与收敛。

---

## 2. 旧 Stage 到新 Capability 的映射

旧 stage 保留字面量（用于兼容、3D role seeding、进度分组、历史 artifact 分类等），但语义彻底改变。

| 旧 Stage              | 新能力包（V4CapabilityId 示例）                          | 什么时候可以被调用（非 exhaustive） |
|-----------------------|---------------------------------------------------------|-------------------------------------|
| Input / Intake       | intent.parse, context.collect, source.classify         | 初始输入、用户补充上下文、Agent 发现歧义、报告前最终对齐 |
| Clarification        | intent.clarify, gap.ask, assumption.validate, question.expand | 用户目标含糊、Agent 之间意图冲突、证据不足、报告结论需补充边界、SPEC/Docs/Preview 前确认约束 |
| Route Planning / Route Selection | route.generate, route.compare, tradeoff.evaluate      | 存在多个解决路线、Agent 提出替代方案、反驳 Agent 认为当前路线风险过高、报告需给出 A/B/C 方案、工程落地前比较成本 |
| SPEC Tree            | structure.decompose, capability.map, dependency.tree   | 把产品结论拆成能力树、风险拆成验证树、权限系统拆成模块树、报告章节拆成论证树、工程任务拆成依赖树（**不必只在 route selection 之后**） |
| SPEC Docs            | document.draft, requirement.write, design.write, task.write | 从 SPEC Tree、feasibility report、route comparison、risk analysis、effect preview、user decision 等多种输入生成（**不一定只能从 Tree 推导**） |
| Effect Preview       | scenario.simulate, ux.preview, outcome.visualize       | 路线比较时预览、用户意图不清时用预览反向澄清、报告中展示推荐方案、反驳某个方案时展示失败效果、工程前验证体验（**随时可用**） |
| Prompt Pack          | instruction.package, execution.prepare                 | 任何需要把推演结果打包成可执行指令时 |
| Brainstorm / Debate  | argument.expand, critique.generate, rebuttal.resolve, synthesis.merge | 任何需要发散观点、挑刺、反驳、收敛时 |
| 通用常驻能力         | evidence.search, repo.inspect, mcp.call, skill.invoke, risk.analyze, counter.argue, memory.recall, report.write | 证据不足、需要外部信息、调用工具、分析风险、反驳、记忆上下文、生成报告时 |

**能力池完整示例（平权、无顺序）**：
Intake、Clarification、Route Planning、Route Selection、Structure Decompose（旧 Tree）、Document Draft（旧 Docs）、Scenario Preview（旧 Effect Preview）、Prompt Pack、Repo Inspection、MCP Tools、Skills、Search、Memory、Risk Analysis、Debate、Report Writer、Synthesis...

**能力之间是图结构**（示例）：
```
intent.parse
  ↘
   conclusion.detect → question.expand → evidence.search
  ↘                         ↘
   intent.clarify             risk.analyze
       ↘                         ↘
        route.generate → route.compare → structure.decompose
             ↘                    ↘
              scenario.preview     document.draft
                    ↘              ↘
                     synthesis.merge → report.write
```
这个图**不是一次性走完**，而是在多轮推演里动态走：发散 → 调用若干能力 → 产生观点/证据/风险 → 发现缺口 → 再调用 → 再收敛 → 再发散 → 最终报告。

---

## 3. 动态调度模型

每一轮系统读取当前状态，然后**选择下一组能力**，而不是推进到固定下一阶段。

**输入状态示例（V4SessionState）**：
- goal: GoalState
- graph: ReasoningGraph（capability invocation graph）
- artifacts: Artifact[]
- conversation: ChatTurn[]
- openQuestions: Question[]
- evidence: EvidenceItem[]
- decisions: Decision[]
- risks: Risk[]
- capabilityRuns: CapabilityRun[]
- currentFocus?: FocusTarget
- userIntervention?: UserIntervention

**UserIntervention 示例**：
```ts
{
  targetArtifactId?: string;
  targetNodeId?: string;
  targetReportSectionId?: string;
  intent: "challenge" | "clarify" | "expand" | "synthesize" | "generate_plan" | "preview" | "compare" | "revise";
  text: string;
}
```

**调度器输出示例**：
```ts
{
  selectedCapabilities: ["intent.clarify", "evidence.search", "route.compare", "scenario.preview"],
  reason: "当前结论明确，但缺少支撑证据和替代方案比较",
  expectedArtifacts: ["clarification_questions", "evidence_items", "route_options", "preview_snapshot"],
  targetNodes?: string[]
}
```

**运行时行为**：
- 不是 stage machine，而是**可重入推演图遍历**（re-entrant reasoning graph traversal）。
- 任何能力在任何时候都可被调用（受真实数据依赖和 gate 限制，而非“必须先 A 再 B”的惯性）。
- 用户输入不是“提交一个新任务”，而是“给当前推演状态追加一个控制信号”（改变目标、约束、关注点、质疑点、输出形式等）。
- 聊天 = 操纵杆；每条消息都可能触发新一轮 pickNextCapabilities。

**“画面临时，状态常驻”**：
- 屏幕上：聊天室 + 内联临时黑板（图、报告、方案、树、预览等结构化 artifact）。
- 状态里：常驻 V4 reasoning graph / artifact graph / capability run history。
- 用户可以针对任意历史节点/段落继续追问，系统能找回对应状态重新调度能力。

---

## 4. 输出物重新定位

- **Reasoning Graph**：推演过程图 / capability invocation graph（不是阶段图）。节点/边应携带 `capabilityId`、`roleId`、`reasoningTurnId`、`provenance`。
- **SPEC Tree**：结构化拆解结果（任意时刻可调用的树状分解能力输出），不是固定“第三阶段”产物。
- **SPEC Docs**：文档生成能力输出，可从多种上游能力结果触发，不是只能由 SPEC Tree 推导。
- **Effect Preview**：任意时刻可调用的假设验证 / 可视化预演能力。
- **Feasibility Report / 产品推演报告**：V4 主输出物。汇总：
  - 本轮调用了哪些能力
  - 每个能力贡献了什么
  - 哪些 Agent 支持/反对
  - 哪些证据被引用
  - 哪些风险未解决
  - 最终如何收敛
- 所有真 artifact 必须通过 **gate / provenance / QA ledger**（黑板可以临时出现，内容不能假）。

---

## 5. 交互形态建议（聊天室 + 临时黑板）

推荐形态（不是固定三栏工作台）：
```
┌──────────────────────────────────────────────────────┐
│ 顶部：当前目标 / 当前结论状态 / 可信度 / 轮次 / 已调用能力 │
├───────────────┬──────────────────────────────────────┤
│               │                                      │
│ Chat          │ 聊天流（内联临时黑板）                 │
│ 用户输入       │ - 多 Agent 讨论摘要                   │
│ Agent 回复     │ - 结构化图（节点可点击）               │
│               │ - 报告段落 / 工程方案 / 预览 / 树      │
│               │                                      │
├───────────────┴──────────────────────────────────────┤
│ 活报告 / 当前可行性报告 / 方案 / SPEC / 预览（可更新）   │
└──────────────────────────────────────────────────────┘
```

用户不是点“下一步”，而是说：
- “这个报告里‘权限模型’这一段我不满意”
- “为什么不用 ABAC？”
- “把这部分出一个工程方案”
- “针对这个节点让安全 Agent 再反驳一轮”
- “先不要出 SPEC Tree，先给我看可行性报告”

系统把这些变成 UserIntervention，驱动新一轮能力调度。

**多人围坐讨论的画面感**：
- 产品 Agent：认为权限系统必须先明确组织/角色/资源模型
- 安全 Agent：反驳：仅 RBAC 不够，需考虑数据范围与审计
- 架构 Agent：补充：建议 RBAC + policy layer
- 工程 Agent：评估：MVP 可先支持用户/角色/菜单/按钮/数据范围
- 综合 Agent：收敛：第一版做 RBAC + 数据范围，预留策略扩展

这些讨论直接映射到 reasoning graph 的节点和边。

---

## 6. 实施路线（克制版，先重解释、再重写控制平面）

**第一步（当前）**：写本文档，锁死新原则。所有后续工作必须引用本文档。

**第二步（小步代码）**：
1. 在 shared 里新增 `V4CapabilityId` union + `STAGE_TO_CAPABILITIES` 映射（旧 stage 字面量不变）。
2. Reasoning Graph 的 Node/Edge 开始带 `capabilityId`（additive）。
3. 现有代码（PetWorkers、BlueprintRuntimeAgents、AutopilotRoutePage、右栏等）加注释说明“activeStage 现在是 legacy UI/artifact/history 标签，真实调度权在 capability orchestrator”。
4. 报告/右栏等地方开始按 capability 维度总结（而非只按 stage）。
5. 做一个 v4-workspace dev harness（聊天 + 动态 artifact + fixture 驱动的“输入 → 多 Agent 讨论 → 报告 → 用户质疑 → 重新调度能力”循环），先验证形态，不碰老页面。

**第三步**：
- 引入真正的 `orchestrateReasoningTurn` / `pickNextCapabilities` 作为新控制平面（可先在 server / lib 里做一个薄实现）。
- 逐步把现有 stage gating 降级为“默认呈现分组”。
- 把旧能力逐个挂进能力池。

**物料保守，控制激进**：
- 底层（reasoning graph 数据结构、角色池、evidence/risk/decision/gap、gates、2D map、debate 协议、三级 provenance、QA ledger、失效重算引擎）**直接复用、重挂接**。
- 只有“谁决定下一步”（stage sequencer → capability orchestrator）是这次要激进换的。

---

## 7. 后续判断 checklist

每当出现以下情况，就要被打回并引用本文档：
- “必须先 route selection 才能 spec tree”
- “必须先 spec tree 才能 spec docs”
- “必须最后才能 effect preview”
- UI 上出现“Step X / Y: XXX” + “下一步”按钮作为主节奏
- 3D 场景 / wall 只根据 stage 决定呈现，而不根据当前活跃的 capability set
- 报告只按阶段总结，而不按 capability run 总结

**真实依赖 vs 惯性**：
- 真实依赖：没有 route comparison 的结果，就没法写基于它的 spec doc（这是数据依赖 + gate）。
- 惯性：因为 UI 是按顺序画的，所以“看起来”必须先做 Tree 再做 Docs。

---

本文档放在 V4 架构图旁边（docs/assets/WhyBuddyArc/ 目录下）。  
后续任何实现、UI 改动、调度逻辑，都必须先读本文档，并回答：“这个改动是强化了能力池调度，还是又在强化旧的阶段流水线？”

**阶段不是流程，阶段是能力。V4 的核心是围绕一个目标动态调用能力池，完成多 Agent 推演、证明与收敛。**

---

*文档完成。需要我继续输出 V4CapabilityId 的 TypeScript 定义草稿、或者 capability 映射的完整表格、或者 v4-workspace harness 的伪代码示例吗？*