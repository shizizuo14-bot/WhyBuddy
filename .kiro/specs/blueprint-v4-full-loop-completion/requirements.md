# Requirements Document

## Introduction

本规格完成 WhyBuddy v4 闭环架构（`docs/assets/WhyBuddyArc/WhyBuddySkill闭环总图_改进版v4.md`）中四个已设计但未端到端接线的主要子系统：

1. **Gap 1 — Brainstorm Real Execution (DG 子图)**：将多角色头脑风暴从"独立并行产出"推进为真正的多轮辩论→挑战→投票→综合收敛闭环。
2. **Gap 2 — Companion Review Full Loop (CO 子图)**：将伴随层（Critic + Grounding）从孤立 findings 推进为结构化质疑/回应/升级闭环，并由真实工具调用（读仓库代码、验证引用）支撑。
3. **Gap 3 — Preview Trustworthiness Layer (S6 v4 增量)**：实现按模块视觉预览生成、确定性 Mermaid 渲染、出图审计（check_previews_real）、finalize_previews gate 全链路。
4. **Gap 4 — Traceability Matrix (EP_MATRIX)**：实现从 spec_tree 自动派生需求↔设计↔任务↔证据↔验收用例的可追溯矩阵，并随交付包导出。

所有四个子系统必须向现有事件总线（`WF_EVT` / `BlueprintEventBus`）emit 事件以供前端实时消费，且不得破坏现有单 Agent 路径。

## Glossary

- **Brainstorm_Session**: 一次多 Crew_Member 参与的多轮辩论/投票/综合会话
- **Crew_Member**: 协作会话中的单个角色实例（决策者/规划师/架构师/执行者/审计员/UI 预览师）
- **Deliberation_Round**: 头脑风暴中的一轮辩论，每个参与角色阅读前轮产出后给出回应
- **Convergence_Score**: 多轮辩论后角色间共识度量（0-1），达阈值视为收敛
- **Companion_Layer**: 伴随式审查与接地层，含 Critic（挑刺者）和 Grounding（接地者）两角色
- **Challenge_Response_Cycle**: 伴随层发出质疑 → 被审产物方提供证据回应 → 伴随层判定接受或升级的闭环
- **Companion_Finding**: 伴随层产出的单条发现记录（`CompanionFinding` 类型）
- **Escalation**: 当回应未能满足质疑时，伴随层将发现升级为 `error` 级并写入台账
- **Preview_Generation_Pipeline**: 按 spec_tree 需求节点逐模块生成视觉预览的管线；在当前代码中由 `server/routes/blueprint/effect-preview/` 的 Stage C 编排承载，审计与门控由 `server/routes/blueprint/preview-audit/` 承载
- **Preview_Provenance**: `BlueprintPreviewProvenance` schema (`source: "model" | "template" | "fallback"`, `ok`, `errorIndicators`, `generatedAt`, `retryCount`, optional `modelUsed` / `promptHash`)
- **Finalize_Previews_Gate**: 出图完成门控，只认本次 `source="model" | "template"` 且 `ok=true` 的有效成功张数，拒绝复制、过期、兜底冒充、假成功
- **Check_Previews_Real**: 用户自跑的出图审计脚本，基于 Preview_Provenance 检测 `fallback_pretending`、`fake_success`、`duplicate_content`
- **Traceability_Matrix**: 需求↔设计↔任务↔证据↔验收用例的五维交叉引用表
- **Checks_Ledger**: 校验台账（`BlueprintChecksLedgerEntry[]`），所有校验/审计/伴随发力的留痕中枢
- **EventBus**: Blueprint 运行时事件总线（`BlueprintEventBus`），用于实时推送阶段产出
- **Decision_Gate**: DG 子图决策门（`D_GATE`），判定简单/复杂以决定走单 Agent 还是头脑风暴
- **Spec_Tree**: 蓝图规格树，包含 Requirements / Design / Tasks / Evidence 节点
- **Orchestrator**: 多智能体协作的顶层调度器
- **Wall_Graph**: 前端实时墙面图谱可视化（`client/src/lib/brainstorm-graph-store.ts`），即 3D HUD 的 "Flow" 大屏展示面，维护 nodes/edges 与有界队列（`MAX_BRAINSTORM_NODES=500`，FIFO 丢弃），由 `dispatchBrainstormGraphEvent` 消费 brainstorm 事件并渲染头脑风暴辩论进程

## Requirements

---

## Gap 1: Brainstorm Real Execution (DG 子图)

### Requirement 1: Multi-Turn Deliberation Protocol

**User Story:** As a 项目总设计师, I want brainstorm crew members to engage in real multi-turn deliberation where they read, challenge, and build on each other's outputs, so that the brainstorm produces emergent consensus rather than isolated parallel opinions.

#### Acceptance Criteria

1. WHEN a Brainstorm_Session is started with Collaboration_Mode "discussion", THE Orchestrator SHALL execute a minimum of 2 Deliberation_Rounds before proceeding to synthesis
2. WHILE a Deliberation_Round is in progress, THE Orchestrator SHALL pass the complete prior round outputs (all Crew_Member responses) as context to each Crew_Member in the current round
3. WHEN a Crew_Member produces its response in a Deliberation_Round, THE Orchestrator SHALL include explicit instructions for the Crew_Member to reference, agree with, or challenge specific points from other members' prior outputs
4. THE Orchestrator SHALL compute a Convergence_Score after each Deliberation_Round by measuring agreement ratio across Crew_Member outputs
5. WHEN the Convergence_Score exceeds the configurable threshold (default 0.7), THE Orchestrator SHALL stop further rounds and proceed to synthesis
6. IF the maximum round limit (configurable, default 5) is reached without convergence, THEN THE Orchestrator SHALL proceed to synthesis with a notation that consensus was not fully achieved
7. THE Orchestrator SHALL emit a `brainstorm.round.completed` event after each Deliberation_Round containing the round number, participating role IDs, and current Convergence_Score

### Requirement 2: Challenge and Rebuttal Mechanics

**User Story:** As a 项目总设计师, I want crew members to explicitly challenge weak arguments and defend their positions with evidence, so that the brainstorm outcome is stress-tested rather than merely aggregated.

#### Acceptance Criteria

1. WHEN a Crew_Member identifies a disagreement with another member's position in the prior round, THE Crew_Member SHALL produce a structured challenge containing: the target member's claim, the reason for disagreement, and supporting evidence or counter-argument
2. WHEN a Crew_Member receives a challenge directed at its prior output, THE Crew_Member SHALL produce a structured rebuttal containing: acknowledgment of the challenge, evidence supporting its original position or a revised position, and a confidence adjustment
3. THE Orchestrator SHALL track challenge-rebuttal pairs and include them in the synthesis context so the Synthesizer can weigh contested vs uncontested points
4. WHEN a challenge remains unresolved after 2 consecutive rounds, THE Orchestrator SHALL flag the contested point as a dissenting opinion in the synthesis output
5. THE Orchestrator SHALL emit a `brainstorm.challenge.issued` event for each challenge, containing challenger role ID, target role ID, and challenge summary

### Requirement 3: Vote-Based Convergence

**User Story:** As a 项目总设计师, I want crew members to vote on contested decisions after deliberation, so that the system has a deterministic tie-breaking mechanism when consensus cannot be reached through discussion alone.

#### Acceptance Criteria

1. WHEN Collaboration_Mode is "vote", THE Orchestrator SHALL present each Crew_Member with the same decision prompt and collect a structured vote containing: chosen option, confidence level (0-1), and reasoning summary
2. WHEN all votes are collected, THE Orchestrator SHALL determine the outcome using weighted scoring where each vote's weight equals the voter's confidence level
3. IF the winning option's weighted score exceeds the second-place option by less than 0.15, THE Orchestrator SHALL mark the decision as "narrow" and include minority reasoning in the synthesis
4. THE Orchestrator SHALL emit a `brainstorm.vote.completed` event containing the vote tally, winning option, margin, and whether the result is marked "narrow"
5. WHEN a vote follows a discussion phase (hybrid mode), THE Orchestrator SHALL include the discussion history as context for each voter

### Requirement 4: Brainstorm Evidence Trail

**User Story:** As a 项目总设计师, I want every brainstorm session to produce verifiable evidence of multi-turn deliberation, so that the system cannot claim brainstorm execution without observable inter-agent interaction.

#### Acceptance Criteria

1. THE Orchestrator SHALL persist each Deliberation_Round as a timestamped artifact containing: round number, per-member inputs (what they received), per-member outputs (what they produced), and any challenges/rebuttals issued
2. WHEN a Brainstorm_Session completes, THE Orchestrator SHALL write a `brainstorm_evidence` entry to the Checks_Ledger containing: session ID, total rounds executed, final Convergence_Score, number of challenges issued, and whether consensus was achieved
3. THE brainstorm_evidence entry SHALL have checkType "brainstorm_deliberation" and status "pass" when at least 2 rounds were executed with inter-member referencing, or "fail" when only 1 round or no cross-referencing was detected
4. THE Orchestrator SHALL emit all round-level events through the existing EventBus using the `brainstorm.*` family prefix, compatible with the existing `BrainstormNodeCreatedPayload` and `BrainstormSessionCompletedPayload` types

---

## Gap 2: Companion Review Full Loop (CO 子图)

### Requirement 5: Structured Challenge/Response Cycle

**User Story:** As a 项目总设计师, I want the Companion layer to engage in a structured challenge/response cycle with the generation pipeline rather than merely producing isolated findings, so that grounding issues are either resolved or escalated with evidence.

#### Acceptance Criteria

1. WHEN the Companion_Layer produces a CompanionFinding with severity "warn" or "error", THE Companion_Layer SHALL initiate a Challenge_Response_Cycle targeting the artifact that produced the finding
2. DURING a Challenge_Response_Cycle, THE Companion_Layer SHALL present the finding to the generation pipeline and request a structured response containing: acknowledgment, evidence addressing the finding, or explanation of why the finding is invalid
3. WHEN the generation pipeline provides a response, THE Companion_Layer SHALL evaluate the response and determine one of three outcomes: "accepted" (finding resolved), "partially_resolved" (some concerns addressed), or "escalated" (response insufficient)
4. IF the outcome is "escalated", THEN THE Companion_Layer SHALL upgrade the finding severity to "error" and write an escalation entry to the Checks_Ledger with checkType "companion_trace" and status "fail"
5. IF the outcome is "accepted", THEN THE Companion_Layer SHALL mark the original finding as resolved and write a resolution entry to the Checks_Ledger with status "pass"
6. THE Companion_Layer SHALL complete each Challenge_Response_Cycle within 30 seconds; IF the timeout is exceeded, THEN THE Companion_Layer SHALL treat the response as absent and escalate

### Requirement 6: Grounding with Real Tool Calls

**User Story:** As a 项目总设计师, I want the Grounding service to verify claims by reading actual repository code and checking cited file paths, so that grounding findings are backed by real evidence rather than LLM inference alone.

#### Acceptance Criteria

1. WHEN the Grounding service evaluates an artifact that references repository file paths, THE Grounding service SHALL attempt to read those files using the existing MCP tool adapter or file system access
2. WHEN a cited file path does not exist in the repository, THE Grounding service SHALL produce a CompanionFinding with severity "error" and finding text indicating the non-existent citation
3. WHEN a cited file exists but the referenced content (function, class, or section) cannot be located within it, THE Grounding service SHALL produce a CompanionFinding with severity "warn" indicating imprecise citation
4. THE Grounding service SHALL record all file paths it successfully read in the `repoFilesRead` field of the CompanionFinding
5. IF the repository is not accessible (no MCP, no file system access), THEN THE Grounding service SHALL produce a degraded finding with severity "info" and a note indicating the inability to verify, rather than silently skipping
6. THE Grounding service SHALL limit file reads to a maximum of 10 files per evaluation to bound I/O cost

### Requirement 7: Companion End-to-End Pipeline (companion_log → check_companion → checks_ledger)

**User Story:** As a 项目总设计师, I want every Companion layer invocation to flow through the complete pipeline from finding production to ledger recording, so that "companion said it ran" always means "the ledger has the evidence."

#### Acceptance Criteria

1. WHEN the Companion_Layer completes an evaluateAll invocation, THE system SHALL produce a companion_log entry for each finding containing: finding ID, role, stage, severity, timestamp, and target artifact ID
2. THE system SHALL validate each companion_log entry against the existing `CompanionFinding` schema before writing to the Checks_Ledger
3. WHEN a companion_log entry passes validation, THE system SHALL write it to the Checks_Ledger with checkType "companion_trace" and the appropriate status mapped from finding severity (info→pass, warn→warn, error→fail)
4. IF a companion_log entry fails validation, THEN THE system SHALL write a "fail" entry to the Checks_Ledger with output describing the validation error, ensuring the failure itself is recorded
5. THE system SHALL emit a `checks.entry.recorded` event for each Checks_Ledger write originating from the Companion pipeline
6. WHEN no findings are produced by an evaluateAll invocation (clean evaluation), THE system SHALL still write a "pass" entry to the Checks_Ledger with checkName "companion:clean_pass:{stage}" to prove the companion was invoked

### Requirement 8: Companion Event Bus Integration

**User Story:** As a 项目总设计师, I want all Companion layer activities to emit events through the existing EventBus so the frontend can display challenge/response cycles and escalations in real-time.

#### Acceptance Criteria

1. WHEN a Challenge_Response_Cycle begins, THE Companion_Layer SHALL emit a `companion.challenge.started` event containing: finding ID, target artifact ID, and challenge summary
2. WHEN a Challenge_Response_Cycle concludes, THE Companion_Layer SHALL emit a `companion.challenge.resolved` event containing: finding ID, outcome (accepted/partially_resolved/escalated), and response summary
3. WHEN the Companion_Layer escalates a finding, THE system SHALL emit both the `companion.challenge.resolved` event (with outcome "escalated") and a `checks.entry.recorded` event for the ledger write
4. THE `companion.*` events SHALL be resolved to the existing `checks` event family by the `resolveBlueprintEventFamily` function (prefix mapping: `companion.` → `checks`)
5. THE system SHALL maintain causal ordering for events within a single Challenge_Response_Cycle (started before resolved)

---

## Gap 3: Preview Trustworthiness Layer (S6 v4 增量)

### Requirement 9: Per-Module Visual Preview Generation (EP_VIS_GEN)

**User Story:** As a 项目总设计师, I want the system to generate one visual preview per spec_tree requirement node, so that every requirement has an inspectable UI sketch labeled as "preview · unverified."

#### Acceptance Criteria

1. WHEN the preview generation phase begins, THE Preview_Generation_Pipeline SHALL enumerate all requirement-type nodes from the Spec_Tree and generate one preview image per node
2. THE Preview_Generation_Pipeline SHALL label each generated preview with the text "preview · unverified" (预览 · 未验证) in the image metadata or watermark
3. WHEN a preview for a given node succeeds, THE Preview_Generation_Pipeline SHALL record `BlueprintPreviewProvenance` with `source` set to `"model"` for image-model output or `"template"` for explicitly allowed template output, `ok: true`, an empty `errorIndicators` array, and a unique `generatedAt` timestamp
4. WHEN a preview generation attempt receives HTTP 503 from the image generation service, THE Preview_Generation_Pipeline SHALL retry up to 3 times with exponential backoff (1s, 2s, 4s)
5. THE Preview_Generation_Pipeline SHALL reject any attempt to use a local fallback placeholder image as a successful preview; IF the generation service is permanently unreachable, THEN THE pipeline SHALL record the node as failed with `source: "fallback"`, `ok: false`, and a non-empty `errorIndicators` array rather than substituting a placeholder
6. THE Preview_Generation_Pipeline SHALL emit a `preview.generated` event for each successfully generated preview containing the node ID, generation source, and timestamp
7. WHEN all requirement nodes have been processed, THE Preview_Generation_Pipeline SHALL emit a `preview.batch.completed` event containing total attempted, succeeded, failed, and retried counts

### Requirement 10: Deterministic Mermaid Rendering (EP_VIS_REND)

**User Story:** As a 项目总设计师, I want architecture diagrams to be rendered deterministically from Mermaid definitions rather than generated by image models, so that structural diagrams are precise and reproducible.

#### Acceptance Criteria

1. WHEN the Spec_Tree contains architecture-type or flowchart-type nodes, THE system SHALL render those nodes using a deterministic Mermaid-to-SVG/PNG pipeline rather than sending them to an image generation model
2. THE Mermaid rendering pipeline SHALL produce identical output for identical input (deterministic: same Mermaid source → same output bytes, excluding timestamp metadata)
3. THE system SHALL store Mermaid-rendered diagrams separately from image-model previews and mark their provenance as `source: "model"`, `ok: true`, and `modelUsed: "mermaid-deterministic"`
4. IF a Mermaid definition contains syntax errors, THEN THE system SHALL record the error in the Checks_Ledger with checkType "preview_audit" and status "fail", and skip rendering for that node
5. THE Mermaid rendering results SHALL be included in the delivery package alongside LLM-generated previews, clearly distinguished by provenance label

### Requirement 11: Finalize Previews Gate

**User Story:** As a 项目总设计师, I want the finalize_previews gate to only count genuinely-generated-this-run images, reject copies, retry on 503, and forbid local fallback placeholders, so that the gate cannot be fooled by stale or fake output.

#### Acceptance Criteria

1. THE Finalize_Previews_Gate SHALL count only images whose provenance record shows they were generated during the current pipeline run (matching the current job ID and a generation timestamp within the current run window)
2. WHEN two or more images in the output directory have identical byte content (detected by SHA-256 hash comparison), THE Finalize_Previews_Gate SHALL reject duplicates and count only the first occurrence as a valid generation
3. THE Finalize_Previews_Gate SHALL reject any image whose provenance has `source: "fallback"` or whose provenance has `ok: true` with a non-empty `errorIndicators` array, and exclude it from the success count
4. WHEN the success count is less than the total requirement node count, THE Finalize_Previews_Gate SHALL block the preview-complete/finalize success state for that run and record a "fail" entry in the Checks_Ledger with checkType "preview_audit" containing the delta (expected vs actual)
5. WHEN the success count equals the total requirement node count, THE Finalize_Previews_Gate SHALL record a "pass" entry in the Checks_Ledger with checkType "preview_audit"
6. THE Finalize_Previews_Gate SHALL emit a `checks.gate.passed` or `checks.gate.failed` event through the EventBus upon completion

### Requirement 12: Check Previews Real Audit (EP_VIS_AUDIT)

**User Story:** As a 项目总设计师, I want the check_previews_real audit script to be user-runnable and integrity-checked, detecting placeholder fallbacks, false successes, and duplicate copies, so that the trustworthiness of generated previews is independently verifiable.

#### Acceptance Criteria

1. THE check_previews_real script SHALL reside under `skills/whybuddy/whybuddy/scripts/` and be executable by the user without requiring agent permissions or modifications
2. WHEN check_previews_real detects an image with `source: "fallback"` and `ok: true`, THE script SHALL report it as a `fallback_pretending` violation
3. WHEN check_previews_real detects an image whose provenance record shows `ok: true` alongside a non-empty `errorIndicators` array, THE script SHALL report it as a `fake_success` violation
4. WHEN check_previews_real detects two or more images with identical SHA-256 hash, THE script SHALL report them as `duplicate_content` violations
5. THE check_previews_real script SHALL write its audit results to the Checks_Ledger with checkType "preview_audit" and the appropriate status (pass if no violations, fail if any violation detected)
6. WHEN violations are detected, THE system SHALL emit a `preview.audit.regenerate_requested` event for each violated image, triggering the Preview_Generation_Pipeline to retry generation for those specific nodes
7. THE repository SHALL define an integrity control for check_previews_real (for example a committed SHA-256 hash manifest, CI assertion, or protected-code-owner review rule) so unauthorized script changes are detected before the audit result is trusted

### Requirement 13: Preview Pipeline Checks Ledger Integration

**User Story:** As a 项目总设计师, I want every step of the preview pipeline (generation, gate, audit) to leave an entry in the Checks_Ledger, so that the full preview trustworthiness chain is auditable.

#### Acceptance Criteria

1. WHEN the Preview_Generation_Pipeline completes processing all nodes, THE system SHALL write a summary entry to the Checks_Ledger with checkType "preview_audit" and checkName "preview:generation_summary" containing total/success/fail counts
2. WHEN the Finalize_Previews_Gate runs, THE system SHALL write its result to the Checks_Ledger with checkType "preview_audit" and checkName "preview:finalize_gate"
3. WHEN check_previews_real runs, THE system SHALL write its result to the Checks_Ledger with checkType "preview_audit" and checkName "preview:audit_real"
4. THE Checks_Ledger entries from the preview pipeline SHALL reference the same jobId, enabling a single query to retrieve the complete preview trustworthiness trail for a given job
5. EACH preview pipeline Checks_Ledger entry SHALL include the `durationMs` field recording how long the step took to execute

---

## Gap 4: Traceability Matrix (EP_MATRIX)

### Requirement 14: Automatic Matrix Derivation from Spec Tree

**User Story:** As a 项目总设计师, I want the Traceability Matrix to be automatically derived from the spec_tree without any manual annotation, so that the matrix is always in sync with the current spec state.

#### Acceptance Criteria

1. THE Traceability_Matrix service SHALL derive matrix entries exclusively from the Spec_Tree node graph and generated spec documents (requirements.md, design.md, tasks.md) without requiring any user-provided mapping annotations
2. FOR EACH requirement-type node in the Spec_Tree, THE service SHALL identify: linked design sections (child/descendant design-type nodes), linked task items (child/descendant task-type nodes), linked evidence sources (evidence fields on nodes), and linked acceptance criteria (from spec document content)
3. THE service SHALL compute coverage statistics: total requirements, count covered by design, count covered by tasks, count covered by evidence, count covered by tests, and `coveragePercent` defined as the percentage of requirements that have all four link types present
4. WHEN a requirement has no linked design, task, evidence, or test, THE service SHALL record it as a gap entry with the specific missing link types enumerated
5. THE service SHALL recompute the matrix whenever the Spec_Tree is updated (new `spec.tree.updated` event) to ensure the matrix never goes stale beyond one generation cycle
6. THE matrix derivation SHALL complete within 2 seconds for spec trees containing up to 200 nodes

### Requirement 15: Matrix Export and Delivery Package Integration

**User Story:** As a 项目总设计师, I want the Traceability Matrix to be included in the delivery package in both JSON and Markdown formats, so that stakeholders can consume it in their preferred tooling.

#### Acceptance Criteria

1. WHEN a delivery package is assembled (EP_HAND), THE system SHALL include the Traceability_Matrix in both JSON format (machine-readable) and Markdown table format (human-readable)
2. THE Markdown export SHALL render a five-column table: Requirement | Design Section | Task Item | Evidence Source | Acceptance Test
3. THE Markdown export SHALL include a coverage summary section showing overall coverage percentages and listing all gap entries
4. WHEN the matrix contains stale entries (marked by the `stale` flag after spec_tree changes), THE export SHALL include a warning header indicating which entries may be outdated
5. THE JSON export SHALL conform to the existing `TraceabilityMatrix` type interface defined in `shared/blueprint/traceability-matrix/types.ts`
6. THE system SHALL emit a `evidence.recorded` event when the Traceability_Matrix is successfully generated and attached to the delivery package

### Requirement 16: Matrix Checks Ledger Integration

**User Story:** As a 项目总设计师, I want matrix generation and coverage results to be recorded in the Checks_Ledger, so that traceability completeness is part of the auditable quality gate chain.

#### Acceptance Criteria

1. WHEN the Traceability_Matrix is generated, THE system SHALL write an entry to the Checks_Ledger with checkType "traceability_matrix" and checkName "matrix:coverage_check"
2. THE entry status SHALL be "pass" when coveragePercent is greater than or equal to the configurable threshold (default 80%), "warn" when greater than or equal to 50% and below the threshold, and "fail" when below 50%
3. THE entry output SHALL contain a JSON summary including: totalRequirements, coveragePercent, gapCount, and the list of requirement IDs with gaps
4. WHEN individual gaps are identified, THE system SHALL write additional per-gap entries with checkName "matrix:gap:{requirementId}" to enable granular tracking
5. THE system SHALL emit a `checks.entry.recorded` event for each matrix-related Checks_Ledger write

---

## Cross-Cutting Requirements

### Requirement 17: Event Bus Integration for All Subsystems

**User Story:** As a 项目总设计师, I want all four subsystems to emit events through the existing BlueprintEventBus, so that the frontend can consume real-time updates from brainstorm deliberation, companion challenges, preview generation, and matrix computation through a single transport.

#### Acceptance Criteria

1. THE Brainstorm subsystem SHALL emit events using the existing `brainstorm.*` event family prefix, extending with: `brainstorm.round.completed`, `brainstorm.challenge.issued`, `brainstorm.vote.completed`
2. THE Companion subsystem SHALL emit events using `companion.*` prefix, which SHALL be resolved to the `checks` event family by `resolveBlueprintEventFamily`
3. THE Preview subsystem SHALL emit events using the existing `preview.*` event family prefix, extending with: `preview.batch.completed`
4. THE Matrix subsystem SHALL emit events through the existing `checks.entry.recorded` event when writing ledger entries
5. ALL new events SHALL be added to the `BlueprintGenerationEventType` union type in `shared/blueprint/events.ts`
6. ALL new events SHALL be relayed to connected Socket.IO clients subscribed to the corresponding job room without requiring additional transport configuration

### Requirement 18: Backward Compatibility with Single-Agent Path

**User Story:** As a 项目总设计师, I want all four subsystems to be additive and non-breaking to the existing single-agent execution path, so that users who do not trigger brainstorm or whose environment lacks preview generation capabilities continue to work without degradation.

#### Acceptance Criteria

1. WHEN the Decision_Gate determines a task is "simple", THE system SHALL execute the single-agent path (D_SA) with no changes to its current behavior, latency, or output format
2. WHEN any of the four subsystem env gates are disabled (`BLUEPRINT_COMPANION_ENABLED`, `BLUEPRINT_PREVIEW_AUDIT_ENABLED`, `BLUEPRINT_TRACEABILITY_MATRIX_ENABLED`, `BLUEPRINT_CHECKS_LEDGER_ENABLED`), THE corresponding subsystem SHALL gracefully no-op without affecting the main generation pipeline
3. THE system SHALL NOT add mandatory latency to the existing single-agent path; all new subsystem processing SHALL be either asynchronous or gated behind the Decision_Gate "complex" branch
4. THE existing `POST /api/blueprint/jobs` and `POST /api/blueprint/generations` response shapes SHALL remain unchanged; new data (deliberation evidence, challenge logs, matrix) SHALL be accessible via dedicated sub-resource endpoints
5. THE existing test suite (all tests currently passing) SHALL continue to pass without modification after the four subsystems are integrated

### Requirement 19: Graceful Degradation Hierarchy

**User Story:** As a 项目总设计师, I want each subsystem to degrade gracefully when its dependencies are unavailable (LLM unreachable, image service down, MCP unavailable, repository inaccessible), so that the overall pipeline never hard-fails due to optional enhancement subsystem issues.

#### Acceptance Criteria

1. IF the LLM provider is unreachable during a Brainstorm_Session, THEN THE Orchestrator SHALL terminate the session, emit a `brainstorm.degraded` event, fall back to single-agent execution, and record the degradation in the Checks_Ledger
2. IF the image generation service is permanently unreachable during preview generation, THEN THE Preview_Generation_Pipeline SHALL record all affected nodes as "failed" (never substitute placeholders), emit a degradation event, and allow the broader blueprint pipeline process to continue with a partial preview set; however, the Finalize_Previews_Gate SHALL NOT mark preview finalization as passed for the affected run
3. IF the repository is inaccessible during Companion Grounding, THEN THE Grounding service SHALL produce degraded findings with severity "info" rather than blocking the evaluation
4. IF the Checks_Ledger service itself is unavailable, THEN THE system SHALL log the failure locally and continue pipeline execution without blocking; ledger writes SHALL be wrapped in non-throwing retry/deferred-record logic where the existing service supports it
5. THE diagnostics endpoint `GET /api/blueprint/diagnostics` SHALL include status entries for each of the four subsystems reporting their current operational state (enabled/disabled, healthy/degraded, last error)

### Requirement 20: Checks Ledger Unified Schema Compliance

**User Story:** As a 项目总设计师, I want all four subsystems to write to the Checks_Ledger using the same `BlueprintChecksLedgerEntry` schema, so that the ledger remains a single consistent audit trail.

#### Acceptance Criteria

1. ALL entries written to the Checks_Ledger by any of the four subsystems SHALL conform to the existing `BlueprintChecksLedgerEntry` interface defined in `shared/blueprint/checks-ledger/types.ts`
2. THE `checkType` field SHALL use one of the existing enumerated values: "companion_trace" (for companion findings), "preview_audit" (for preview pipeline entries), or a new value "brainstorm_deliberation" (for brainstorm evidence) and "traceability_matrix" (for matrix entries)
3. THE `BlueprintCheckType` type union in `shared/blueprint/checks-ledger/types.ts` SHALL be extended to include "brainstorm_deliberation" and "traceability_matrix" as valid values
4. EACH entry SHALL include a non-empty `validator` field identifying the module that produced the entry (e.g., "brainstorm/orchestrator.ts", "companion/critic.ts", "preview-audit/finalize-gate.ts", "traceability-matrix/derive.ts")
5. EACH entry SHALL include a `triggeredAt` timestamp in ISO 8601 format representing the exact time the check was performed

---

## Frontend Consumption Gap: Deliberation Events on the HUD Wall

> 审计发现：Requirement 1/2/3 产出的三个新辩论事件（`brainstorm.round.completed`、`brainstorm.challenge.issued`、`brainstorm.vote.completed`）已由后端 emit 并经 Socket.IO 中继（R17.1、R17.6），但前端没有任何 store 消费它们——`brainstorm-graph-store.ts` 的 `dispatchBrainstormGraphEvent` switch 只处理 7 个既有事件类型（session.started/synthesizing/completed/failed、node.created/updated、gate.evaluated），3 个新事件因此永远到不了 3D HUD 的 Flow 墙面。R17.6 止步于 "relayed to clients"，未要求前端渲染。本需求补齐这一断点，让多角色辩论真正显示在大屏 3D HUD 上，而非只停留在后端日志中。

### Requirement 21: Frontend Consumption of Deliberation Events on the HUD Wall

**User Story:** As a 项目总设计师, I want the brainstorm deliberation — rounds, challenges, votes — to appear on the 3D HUD Flow wall in real time, so that I can watch the agents actually debate rather than only seeing it in backend logs.

#### Acceptance Criteria

1. WHEN a `brainstorm.round.completed` event is received by the realtime store and forwarded to `dispatchBrainstormGraphEvent`, THE brainstorm-graph-store SHALL record the round (round number and Convergence_Score) and surface it on the Wall_Graph as a round marker or progress indicator, while preserving the existing bounded-queue invariant (Wall_Graph node count SHALL NOT exceed `MAX_BRAINSTORM_NODES` = 500, with oldest-first FIFO eviction when the limit is reached)
2. WHEN a `brainstorm.challenge.issued` event is received, THE Wall_Graph SHALL render a challenge edge or marker from the challenger role node to the target role node carrying the challenge summary, visually distinct from normal parent→child node edges
3. WHEN a `brainstorm.vote.completed` event is received, THE Wall_Graph SHALL render the vote outcome (winning option, margin, and the isNarrow flag) and SHALL surface minority/dissent information visibly WHEN the isNarrow flag is true
4. THE new event handlers SHALL be additive to the existing `dispatchBrainstormGraphEvent` switch statement and SHALL preserve the existing handling of the 7 existing brainstorm event types (session.started, session.synthesizing, session.completed, session.failed, node.created, node.updated, gate.evaluated) without behavioral change
5. WHEN any of the 3 new events references a session identifier that does not match the current active session held in the brainstorm-graph-store, THE store SHALL ignore the event, matching the session-id guard behavior of the existing handlers
6. WHERE the HUD top strip is present, THE HUD top strip MAY display the current round number and Convergence_Score derived from the latest `brainstorm.round.completed` event, as a non-blocking optional surface that SHALL NOT cause an error when absent
7. IF a new event arrives with a missing or malformed payload, THEN THE store SHALL ignore the event without throwing, matching the existing defensive parsing behavior in `dispatchBrainstormGraphEvent`
