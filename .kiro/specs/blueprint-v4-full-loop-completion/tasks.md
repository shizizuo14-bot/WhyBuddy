# Implementation Plan: Blueprint v4 Full Loop Completion (Executable Deltas)

## Overview

本计划已根据 reconciliation 审计重写：先前的 specs（`blueprint-v4-full-alignment` +
`autopilot-multi-agent-brainstorm`）已经落地 Gap 3 / Gap 4 的大部分以及 Gap 1-2 的部分能力。
因此本计划**只列真实增量（true deltas）**，复用现有模块，不重复实现已存在的代码。

每个子系统的任务下都附带 `Reuse:` 说明，列出应在其上构建的现有模块。所有新的台账写入任务
遵循 companion 既有模式：`targetArtifactId` 即 `jobId`，`recordCheck(...)` 始终包裹在
`try/catch` 中（非阻塞）。Brainstorm 任务使用注入的 `emitEvent(type, payload)`（不要用
`ctx.eventBus.emit` 的 object 形式）。语言：TypeScript（审计脚本为 Python），测试 Vitest + fast-check。

**执行原则：**
- 本文件是执行入口，不是愿景文档。每个任务都必须落到明确文件、明确测试、明确验收。
- 先写/补测试，再改实现；所有 checkpoint 必须列出实际命令和期望结果。
- 只做 additive delta：不重命名现有公开接口，不拆大模块，不重做已存在能力。
- 所有 ledger 写入沿用现有 companion 模式：`targetArtifactId` 即 `jobId`，`recordCheck(...)` 必须 `try/catch` 非阻塞。
- Brainstorm 事件必须使用注入的 `emitEvent(type, payload)`，不要改成 `ctx.eventBus.emit({ ... })` object 形式。
- Preview 目录以当前代码为准：生成编排在 `server/routes/blueprint/effect-preview/`，审计/门控在 `server/routes/blueprint/preview-audit/`；不要新建平行的 `preview-generation/` 目录。

**已存在、禁止重做的模块（仅供复用）：**
- Gap 1: `brainstorm/`（orchestrator 4 模式 / decision-gate / synthesizer / pipeline-integration /
  memory-store / role-registry / tool-proxy / event-emitter-adapter，`emitEvent` 注入，`getBrainstormDiagnostics`）
- Gap 2: `companion/`（service `createCompanionLayer` + critic + grounding + `evaluateAll`，
  `recordFinding()` 已 try/catch 写 `companion_trace`，env gate `BLUEPRINT_COMPANION_ENABLED`）
- Gap 3: `effect-preview/image-service.ts`（`runStageC` 真生成 / 503 重试 / 无本地兜底 / provenance）；
  `preview-audit/`（detectors `detectFallbackFraud/detectFakeSuccess/detectDuplicates`、service 台账+
  `preview.audit.regenerate_requested`、regeneration-handler、meta-builder）。
  Provenance 类型 `BlueprintPreviewProvenance`；审计 reason 用 `fallback_pretending|fake_success|duplicate_content`
- Gap 4: `traceability-matrix/`（derive / computeCoverage+gaps / renderMatrixMarkdown / service env gate
  `BLUEPRINT_TRACEABILITY_MATRIX_ENABLED` / route GET `/api/blueprint/jobs/:jobId/traceability-matrix`）
- 已存在事件（禁止再加）：`brainstorm.degraded`、`preview.audit.regenerate_requested`、
  `checks.gate.passed/failed`、`evidence.recorded`、`spec.tree.updated`、`checks.entry.recorded`

## Required Verification Commands

执行任一任务组后，至少运行对应 focused tests；最终 checkpoint 再运行更宽的合同测试。

- Shared contracts: `npx vitest run shared/blueprint/__tests__ shared/blueprint/checks-ledger`
- Brainstorm: `npx vitest run server/routes/blueprint/brainstorm/__tests__ server/tests/blueprint/brainstorm`
- Companion: `npx vitest run server/routes/blueprint/companion`
- Preview/effect preview: `npx vitest run server/routes/blueprint/effect-preview server/routes/blueprint/preview-audit`
- Traceability matrix: `npx vitest run server/routes/blueprint/traceability-matrix client/src/lib/blueprint-api/traceability-matrix.test.ts`
- Frontend HUD graph: `npx vitest run client/src/lib/__tests__/brainstorm-graph-store.test.ts client/src/lib/__tests__/brainstorm-graph-store.properties.test.ts`
- Final smoke: `node --run check`（若存在已知 baseline 失败，必须在执行记录中列出与本 spec 无关的失败文件）

## File Map

- `shared/blueprint/checks-ledger/types.ts`: extend accepted ledger check types only.
- `shared/blueprint/events.ts`: extend event type/payload contracts and family resolution.
- `server/routes/blueprint/brainstorm/orchestrator.ts`: existing `BrainstormOrchestrator` owns private mode methods; wire new deliberation/vote flows inside the class, not from an external caller.
- `server/routes/blueprint/brainstorm/*`: implement deliberation, challenge/rebuttal, weighted vote, and evidence ledger helpers using existing `BrainstormSession`, `CrewMemberInstance`, `CrewMemberOutput`, `LLMCallerFn`, and `EventEmitterFn` types.
- `server/routes/blueprint/companion/service.ts`: existing `recordFinding` is local to this module; wire CRC, clean-pass, and enhanced grounding inside `evaluateAll` / local helpers.
- `server/routes/blueprint/companion/*`: implement real citation reads, challenge/response cycle, and clean-pass evidence using existing `CompanionFinding` / `CompanionTriggerContext` types.
- `server/routes/blueprint/effect-preview/image-service.ts`: existing `runStageC(input)` does not carry `jobId` or run-window; keep raster generation here and pass audit/finalize context from the route/job layer.
- `server/routes/blueprint/effect-preview/*`: keep image generation, retry, provenance, and Mermaid rendering orchestration here.
- `server/routes/blueprint/preview-audit/meta-builder.ts`: build `PreviewImageMeta[]` from `runStageC` output before audit/finalize.
- `server/routes/blueprint/preview-audit/*`: keep detectors, audit trail, regeneration, metadata stamping, and finalize gate here.
- `skills/whybuddy/whybuddy/scripts/check_previews_real.py`: user-runnable independent preview audit script.
- `server/routes/blueprint/traceability-matrix/service.ts`: existing service is synchronous and exposes `generateMatrix/exportJson/exportMarkdown`; add ledger/recompute wrappers around this service shape.
- `server/routes/blueprint/traceability-matrix/*`: add ledger integration and recompute trigger around existing derive/export/route.
- `server/routes/blueprint.ts`: add only thin route registration for new job sub-resources if no narrower route module exists.
- `client/src/lib/brainstorm-graph-store.ts`: consume new deliberation events defensively.
- `client/src/components/three/scene-fusion/brainstorm-wall-graph-logic.ts`: surface challenge/vote/round data for the 3D HUD Flow wall.

## Implementation Interface Audit

Before coding each gap, verify the exact local signatures and update this spec if they drift:

- Brainstorm: `BrainstormOrchestrator.startSession(config)` runs private `executeMode(...)`; new discussion/vote behavior must be called from private `executeDiscussionMode` / `executeVoteMode`, or by adding private helper methods in the same class.
- Companion: `createCompanionLayer(ctx).evaluateAll(triggerCtx, artifact)` returns `CompanionFinding[]`; `recordFinding(ctx, finding)` is not exported. Any CRC or clean-pass ledger write must be wired in `service.ts`.
- Grounding: `createGroundingService(ctx, policy).evaluate(triggerCtx, artifact)` currently does heuristic citation detection. A new `grounding-tools.ts` should return data that `grounding.ts` can convert into the existing single `CompanionFinding | null` contract.
- Preview: `ImageService.runStageC(input)` returns `ImageServiceRunStageCResult`; `buildPreviewMetasFromStageCResult(jobId, result, nowIso)` already converts it to `PreviewImageMeta[]`. Finalize gate should consume `PreviewImageMeta[]`, not raw image-service output.
- Matrix: `createTraceabilityMatrixService(ctx)` returns synchronous `generateMatrix/exportJson/exportMarkdown`; recompute-on-event requires a small cache/subscriber layer, not a change to `deriveMatrix` itself.
- HUD graph: `BrainstormGraphState` currently has only `sessionId/sessionStatus/nodes/edges/sessionMetadata`; all R21 fields and actions are additive.

## Tasks

- [x] 1. Cross-cutting foundation: extend shared type & event contracts
  - Reuse: `shared/blueprint/checks-ledger/types.ts`、`shared/blueprint/events.ts`（已有 union + `resolveBlueprintEventFamily`）

  - [x] 1.1 Extend `BlueprintCheckType` union with two new values
    - Modify `shared/blueprint/checks-ledger/types.ts`
    - Add `"brainstorm_deliberation"` and `"traceability_matrix"` to the union
    - Leave all existing values (`companion_trace`, `preview_audit`, ...) untouched
    - _Requirements: 20.3_

  - [x] 1.2 Add 6 new event types to `shared/blueprint/events.ts`
    - Add to `BlueprintGenerationEventType`: `brainstorm.round.completed`, `brainstorm.challenge.issued`,
      `brainstorm.vote.completed`, `companion.challenge.started`, `companion.challenge.resolved`,
      `preview.batch.completed`
    - Add the corresponding payload interfaces; do NOT re-add any existing event
    - _Requirements: 17.5, 17.1, 17.2_

  - [x] 1.3 Add `companion.*` → `checks` family special-case in `resolveBlueprintEventFamily`
    - Modify `resolveBlueprintEventFamily` in `shared/blueprint/events.ts`
    - When the event prefix is `companion`, resolve to the `checks` family
    - Preserve all existing prefix→family mappings
    - _Requirements: 8.4, 17.2_

  - [x] 1.4 Write unit tests for the contract extensions
    - Add or extend tests under `shared/blueprint/__tests__/`
    - Assert `resolveBlueprintEventFamily("companion.challenge.started")` returns `"checks"`
    - Add compile-time `satisfies` checks for the 6 new event payloads and the 2 new ledger check types
    - Run: `npx vitest run shared/blueprint/__tests__`
    - Expected: PASS; no snapshot churn outside shared blueprint contracts
    - _Requirements: 8.4, 17.5, 20.3_

- [x] 2. Gap 1 deltas: real deliberation loop, challenge/rebuttal, weighted vote, evidence ledger
  - Reuse: `brainstorm/orchestrator.ts`（discussion/vote 模式入口）、`role-registry.ts`、`llm-adapter.ts`、
    `synthesizer.ts`、`event-emitter-adapter.ts`（注入的 `emitEvent(type, payload)`）。不改 orchestrator 公共接口，仅扩展。

  - [x] 2.1 Implement multi-round deliberation loop extending discussion mode
    - Create `server/routes/blueprint/brainstorm/deliberation-protocol.ts`
    - Export pure helpers and a class-internal runner signature compatible with the current orchestrator:
      `executeDeliberation(input: { session: BrainstormSession; stageContext: string; executeMember(member, context): Promise<void>; emitEvent: EventEmitterFn; config?: Partial<DeliberationConfig> }): Promise<DeliberationResult>`
    - Use `minRounds`(2)/`maxRounds`(5)/`convergenceThreshold`(0.7)
    - Cross-round context chaining: pass complete prior-round outputs to each member in the next round
    - `computeConvergenceScore(memberOutputs)` pure fn clamped to [0,1]; stop when score > threshold; enforce minRounds
    - On maxRounds without convergence, annotate "consensus not achieved" and proceed to synthesis
    - Do not call private `BrainstormOrchestrator.executeCrewMember` from outside the class without passing it as a bound callback
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

  - [x] 2.2 Implement challenge/rebuttal records across rounds
    - Extend `deliberation-protocol.ts` to parse/track `ChallengeRecord[]` and `RebuttalRecord[]` per round
    - Link rebuttals to challenges; flag challenges unresolved after 2 consecutive rounds as dissenting opinions
    - Feed challenge/rebuttal pairs into the existing `synthesizer.ts` synthesis context
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 2.3 Implement weighted vote tallying
    - Create `server/routes/blueprint/brainstorm/vote-synthesizer.ts`
    - `computeVoteResult(votes)`: group by option, sum confidence-weighted scores, compute `margin` and `isNarrow` (margin < 0.15)
    - Add a runner compatible with current orchestrator: `collectVotes(input: { session: BrainstormSession; stageContext: string; executeMember(member, context): Promise<void>; discussionHistory?: DeliberationRound[] }): Promise<VoteResult>`
    - Collect minority reasoning from parsed member outputs; include discussion history in the prompt when hybrid mode is used
    - _Requirements: 3.1, 3.2, 3.3, 3.5_

  - [x] 2.4 Emit the 3 new brainstorm events via injected `emitEvent`
    - In deliberation/vote flow, call `emitEvent("brainstorm.round.completed", payload)` per round,
      `emitEvent("brainstorm.challenge.issued", payload)` per challenge,
      `emitEvent("brainstorm.vote.completed", payload)` after tally
    - Use the injected `emitEvent(type, payload)` signature (NOT `ctx.eventBus.emit` object form)
    - _Requirements: 1.7, 2.5, 3.4, 17.1_

  - [x] 2.5 Write `brainstorm_deliberation` ledger entry
    - Create `server/routes/blueprint/brainstorm/evidence-trail.ts` with `writeEvidenceToLedger(ctx, evidence)`
    - `checkType: "brainstorm_deliberation"`, `checkName: "brainstorm:evidence:{sessionId}"`,
      status `pass` when ≥2 rounds with inter-member referencing else `fail`; `validator: "brainstorm/orchestrator.ts"`
    - Persist an evidence artifact named `brainstorm_evidence` or equivalent store record, matching Requirement 4.2 wording; the ledger check type remains `brainstorm_deliberation`
    - Wrap `ctx.checksLedger.recordCheck(...)` in try/catch (non-blocking); `jobId` is the deliberation target jobId
    - _Requirements: 4.1, 4.2, 4.3_

  - [x] 2.6 Wire deliberation + vote into existing orchestrator modes
    - Modify private methods in `server/routes/blueprint/brainstorm/orchestrator.ts`:
      `executeDiscussionMode(...)` → bound `executeDeliberation(...)`;
      `executeVoteMode(...)` → bound `collectVotes(...)`
    - Use `this.executeCrewMember.bind(this, session)` style or a small private wrapper so helper modules do not depend on private class internals
    - On completion build evidence and call `writeEvidenceToLedger`; if no `checksLedger` is available in this class today, pass ledger integration through the existing pipeline-integration/context layer instead of inventing a global
    - Keep single-agent fallback and the other modes unchanged; reuse existing env gate (`BLUEPRINT_BRAINSTORM_ENABLED`)
    - _Requirements: 1.1, 3.5, 4.2, 18.2_

  - [x] 2.7 Write property test for convergence score bounds
    - **Property: convergence score ∈ [0,1]; single member → 1.0**
    - Test file: `server/routes/blueprint/brainstorm/__tests__/deliberation-protocol.property.test.ts`
    - **Validates: Requirements 1.4**

  - [x] 2.8 Write property test for minimum-round enforcement
    - **Property: at least `minRounds` rounds execute before synthesis for any session**
    - Test file: `server/routes/blueprint/brainstorm/__tests__/deliberation-protocol.property.test.ts`
    - **Validates: Requirements 1.1**

  - [x] 2.9 Write property test for weighted vote correctness
    - **Property: winner has highest weighted sum; margin = winner − second; isNarrow iff margin < 0.15**
    - Test file: `server/routes/blueprint/brainstorm/__tests__/vote-synthesizer.property.test.ts`
    - **Validates: Requirements 3.2, 3.3**

  - [x] 2.10 Write property test for brainstorm_deliberation ledger integrity
    - **Property: completed session → ledger entry with correct checkType + pass/fail status logic**
    - **Validates: Requirements 4.3**

- [x] 3. Checkpoint - Ensure all brainstorm delta tests pass
  - Run: `npx vitest run server/routes/blueprint/brainstorm/__tests__ server/tests/blueprint/brainstorm`
  - Expected: PASS for new deliberation/vote/evidence tests and no regression in existing orchestrator/event tests
  - Record any unrelated baseline failure with file/test name before moving to Gap 2

- [x] 4. Gap 2 deltas: real file-read grounding, challenge/response cycle, companion events, clean_pass
  - Reuse: `companion/service.ts`（`createCompanionLayer`/`recordFinding` 已 try/catch 写 `companion_trace`，
    pushes to `job.companionFindings[]`）、`companion/grounding.ts`、`companion/critic.ts`、env gate `BLUEPRINT_COMPANION_ENABLED`。
    Pattern: `targetArtifactId` IS the `jobId`; always wrap `recordCheck` in try/catch.
    Note: R7.1–7.5 已完成，仅需复核，不重写。

  - [x] 4.1 Implement real file-read grounding with bounded reads
    - Create `server/routes/blueprint/companion/grounding-tools.ts`
    - `verifyFileCitations(input: { ctx: BlueprintServiceContext; triggerCtx: CompanionTriggerContext; artifact: unknown; maxFileReads?: number }): Promise<GroundingVerificationResult>`
    - Extract citations from artifact text/JSON, parse each into `filePath + optional sectionRef`, and read at most `maxFileReads` (default 10)
    - Prefer `ctx.mcpToolAdapter` / `ctx.httpFetcher` when they expose repo content; otherwise use a bounded filesystem read only when an allowed repo root can be derived from the job/artifact
    - Reject path traversal and absolute paths outside the allowed repository root before reading
    - Return `filesRead`, `missingFiles`, `missingSections`, and `degradedReason`; `grounding.ts` converts this into the existing `CompanionFinding | null` contract and fills `repoFilesRead`
    - _Requirements: 6.1, 6.4, 6.6_

  - [x] 4.2 Produce error/warn/info grounding findings from verification
    - Cited path missing → severity `error`; section not found → `warn`; no repo access → `info` (degraded, never silent skip)
    - Replace the current regex-only heuristic with verification-backed findings
    - _Requirements: 6.2, 6.3, 6.5, 19.3_

  - [x] 4.3 Implement challenge/response cycle with 30s timeout
    - Create `server/routes/blueprint/companion/challenge-response-cycle.ts`
    - `initiateChallenge(ctx: BlueprintServiceContext, request: ChallengeCycleRequest): Promise<ChallengeCycleResult>`
    - `ChallengeCycleRequest` must include the existing `CompanionFinding`, `artifact`, optional `responder?: (finding, artifact) => Promise<ChallengeResponse>`, and `timeoutMs?: number`
    - If no responder is injected yet, return `partially_resolved` for warn/info and `escalated` for error rather than inventing a new generation-pipeline API
    - When a responder exists, present the finding to it with `Promise.race` timeout (30_000ms)
    - Outcomes: `accepted` | `partially_resolved` | `escalated`; timeout → escalate (response treated absent)
    - On `escalated`, upgrade finding severity to `error` and write `companion_trace` fail entry (try/catch, jobId = targetArtifactId);
      on `accepted`, write `companion_trace` pass entry
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [x] 4.4 Emit companion challenge events
    - Emit `companion.challenge.started` at cycle begin and `companion.challenge.resolved` at conclusion (with outcome)
    - Maintain causal ordering (started before resolved); rely on the `companion.*`→`checks` family mapping from task 1.3
    - _Requirements: 8.1, 8.2, 8.3, 17.2_

  - [x] 4.5 Write `clean_pass` ledger entry when zero findings
    - Extend `companion/service.ts` so a clean `evaluateAll` (no findings) still writes a `companion_trace` pass entry
      `checkName: "companion:clean_pass:{stage}"` (try/catch, non-blocking, jobId = targetArtifactId)
    - _Requirements: 7.6_

  - [x] 4.6 Wire CRC + enhanced grounding into `createCompanionLayer`
    - Modify `server/routes/blueprint/companion/grounding.ts` to call `verifyFileCitations(...)` and produce the existing single `CompanionFinding | null`
    - Modify `server/routes/blueprint/companion/service.ts`: after findings are produced and before return, run CRC for each warn/error finding
    - Because `recordFinding` is local to `service.ts`, keep CRC ledger writes either inside `challenge-response-cycle.ts` with explicit ctx or inside new local service helpers; do not expect external callers to call `recordFinding`
    - Preserve existing env gate and non-blocking behavior
    - _Requirements: 5.1, 6.1, 18.2_

  - [x] 4.7 Write property test for grounding read bound + severity mapping
    - **Property: reads min(N,10) files; missing→error, section-missing→warn, no-access→info**
    - **Validates: Requirements 6.2, 6.3, 6.5, 6.6**

  - [x] 4.8 Write property test for CRC outcome-to-ledger mapping + event bracketing
    - **Property: escalated→fail+severity upgrade; accepted→pass; timeout→escalated; exactly one started before one resolved**
    - Test file: `server/routes/blueprint/companion/challenge-response-cycle.test.ts`
    - **Validates: Requirements 5.4, 5.5, 5.6, 8.1, 8.2, 8.5**

- [x] 5. Checkpoint - Ensure all companion delta tests pass
  - Run: `npx vitest run server/routes/blueprint/companion`
  - Expected: PASS for service, grounding, and challenge-response tests
  - Confirm all new ledger writes remain non-blocking by covering a throwing fake ledger

- [x] 6. Gap 3 deltas: Mermaid renderer, unverified watermark, user-runnable audit script, blocking gate
  - Reuse: `effect-preview/image-service.ts`（`runStageC` 真生成 / 503 重试 / provenance）、
    `preview-audit/detectors.ts`（`detectFallbackFraud/detectFakeSuccess/detectDuplicates`，reasons
    `fallback_pretending|fake_success|duplicate_content`）、`preview-audit/meta-builder.ts`、
    `preview-audit/service.ts`、`preview-audit/regeneration-handler.ts`。
    Note: R9 generation, R12.2-R12.6 detectors, and R13 ledger trail may already exist; verify and reuse them where they satisfy the canonical `BlueprintPreviewProvenance` contract. R11 finalize gate is mandatory in this spec and must not remain post-hoc only.

  - [x] 6.1 Implement deterministic Mermaid→image rendering
    - Create `server/routes/blueprint/effect-preview/mermaid-renderer.ts` (no renderer exists today)
    - `render(request: MermaidRenderRequest, deps: MermaidRenderDeps): Promise<MermaidRenderResult>` validates Mermaid syntax then renders SVG first; PNG output is optional only if the existing pipeline already has a deterministic converter
    - Include `jobId` in `MermaidRenderRequest` because syntax errors must write `preview_audit` entries with the correct job id
    - Same normalized Mermaid source must produce the same output bytes/hash; strip timestamps or random IDs before hashing
    - On syntax error: write `preview_audit` fail entry (try/catch) and skip; on success set
      `BlueprintPreviewProvenance.source = "model"` with `modelUsed: "mermaid-deterministic"`
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

  - [x] 6.2 Route architecture/flowchart nodes to the Mermaid renderer
    - Detect architecture/flowchart spec-tree nodes and render via `mermaid-renderer.ts` instead of the image service
    - Merge Mermaid results with `ImageServiceRunStageCResult` by converting both through `PreviewImageMeta[]` compatible records; extend `meta-builder.ts` if necessary
    - Do not change `ImageService.runStageC` input shape unless current route callers are updated and existing effect-preview tests are adjusted
    - Keep the route entrypoint `POST /api/blueprint/jobs/:jobId/effect-previews`; do not introduce a second preview-generation endpoint
    - _Requirements: 10.1, 10.5_

  - [x] 6.3 Add "preview · unverified" (预览 · 未验证) watermark/label
    - Extend `preview-audit/meta-builder.ts` (and image-service output metadata) to stamp each preview with the
      "preview · unverified" / "预览 · 未验证" label in metadata/watermark
    - Preserve existing frontend `data-testid="effect-preview-unverified-label"` behavior; this task is about metadata/provenance parity, not restyling the panel
    - _Requirements: 9.2_

  - [x] 6.4 Create user-runnable, integrity-checked audit script
    - Create `skills/whybuddy/whybuddy/scripts/check_previews_real.py`
    - Reuse the detector reasons (`fallback_pretending`/`fake_success`/`duplicate_content`) over the provenance JSON
      produced by the pipeline; report violations and exit non-zero on any violation
    - Must be runnable by the user directly
    - Add an integrity control for the script, such as a committed SHA-256 manifest plus a CI/test assertion that fails when the script content changes without updating the manifest under review
    - Add a focused test for the manifest check; do not rely on a manual review note as the only control
    - _Requirements: 12.1, 12.7_

  - [x] 6.5 Add a true blocking finalize gate
    - Add `server/routes/blueprint/preview-audit/finalize-gate.ts`
    - `evaluateFinalizeGate(input: { jobId: string; expectedNodeIds: string[]; previews: PreviewImageMeta[]; currentRunWindow: { start: string; end: string }; emitEvent?: EventEmitterFn; checksLedger?: ChecksLedgerService }): FinalizeGateResult`
    - The gate blocks preview-complete/finalize success when valid current-run image count is not exactly `expectedNodeIds.length`
    - Reuse detectors + provenance;
      write `preview_audit` pass/fail entry (try/catch) and emit existing `checks.gate.passed/failed`
    - Reject `source: "fallback"`, `ok: true` with non-empty `errorIndicators`, duplicate content hashes, and stale/current-run mismatches
    - Wire the gate at the existing `POST /api/blueprint/jobs/:jobId/effect-previews` completion layer in `server/routes/blueprint.ts` or its extracted route handler, after `buildPreviewMetasFromStageCResult(...)` and before the job/artifact is marked preview-complete
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6_

  - [x] 6.6 Write property test for Mermaid determinism
    - **Property: identical Mermaid source → identical output hash; syntax error → fail entry + skip**
    - **Validates: Requirements 10.2, 10.4**

  - [x] 6.7 Write unit test for unverified watermark presence
    - Assert every generated preview metadata carries the "preview · unverified" / "预览 · 未验证" label
    - _Requirements: 9.2_

- [x] 7. Checkpoint - Ensure all preview delta tests pass
  - Run: `npx vitest run server/routes/blueprint/effect-preview server/routes/blueprint/preview-audit`
  - If the Python script has standalone tests, run them as well with the repo's Python test command or direct script fixtures
  - Expected: PASS; finalize gate tests must prove fake/stale/fallback/duplicate previews block completion

- [x] 8. Gap 4 deltas: matrix checks-ledger integration + recompute on spec.tree.updated
  - Reuse: `traceability-matrix/derive.ts`（`deriveMatrix`/`computeCoverage`+gaps）、`export.ts`
    （`renderMatrixMarkdown`）、`service.ts`（env gate）、`route.ts`。
    Note: 派生 + 导出 + route 已完成，仅需复核，不重写。

  - [x] 8.1 Integrate matrix coverage into the checks ledger
    - Create `server/routes/blueprint/traceability-matrix/ledger-integration.ts`
    - Write `matrix:coverage_check` entry: status `pass` when coverage ≥ threshold (default 80%),
      `warn` when 50% ≤ coverage < threshold, `fail` when coverage < 50%; checkType `"traceability_matrix"`
    - Write per-gap entries `matrix:gap:{requirementId}`; all writes try/catch non-blocking, jobId = matrix jobId
    - _Requirements: 16.1, 16.2, 16.3, 16.4_

  - [x] 8.2 Emit ledger + evidence events for the matrix
    - Emit `checks.entry.recorded` for each matrix ledger write and `evidence.recorded` when the matrix is attached to delivery
    - _Requirements: 16.5, 15.6_

  - [x] 8.3 Recompute matrix on `spec.tree.updated`
    - Add a small subscriber/cache wrapper around `createTraceabilityMatrixService(ctx)` rather than changing `deriveMatrix`
    - Subscribe to the existing `spec.tree.updated` event where the `BlueprintEventBus` is available; trigger `generateMatrix(jobId)` and cache the latest result
    - Mark cached matrix entries stale until recompute completes; `exportJson/exportMarkdown` may fall back to synchronous rebuild when no cache exists
    - Debounce same-job rapid updates if the existing event bus can deliver bursts; do not recompute concurrently for the same jobId
    - _Requirements: 14.5_

  - [x] 8.4 Write property test for coverage-to-status threshold mapping
    - **Property: C>=T -> pass, 50%<=C<T -> warn, C<50% -> fail; G gaps -> exactly G+1 ledger entries**
    - **Property: coveragePercent is based on fully covered requirements; partial links increase per-dimension counts but do not make a requirement fully covered**
    - **Validates: Requirements 16.1, 16.2, 16.4**

- [x] 9. Cross-cutting deltas: sub-resource endpoints + unified v4 diagnostics
  - Reuse: existing `traceability-matrix/route.ts`（matrix endpoint already exists）、existing
    `GET /api/blueprint/diagnostics`、`getBrainstormDiagnostics`、`job.companionFindings[]`、preview-audit service.

  - [x] 9.1 Add 3 new sub-resource endpoints
    - Add `GET /api/blueprint/jobs/:jobId/brainstorm-evidence`, `.../companion-challenges`, `.../preview-audit-trail`
      (matrix endpoint already exists — do not re-add). Read from existing evidence/findings/audit stores; response-shape additive only
    - _Requirements: 18.4_

  - [x] 9.2 Extend `GET /api/blueprint/diagnostics` with v4 subsystem health
    - Add companion / preview / matrix health entries (enabled/disabled, healthy/degraded, last error) alongside the existing
      brainstorm diagnostics; additive, must not change existing diagnostic entries
    - _Requirements: 19.5_

  - [x] 9.3 Write integration tests for the new endpoints + diagnostics
    - Test each sub-resource endpoint returns the persisted data and diagnostics includes the 3 new health entries
    - _Requirements: 18.4, 19.5_

- [x] 10. Final checkpoint - Ensure all delta tests pass
  - Run all focused commands listed in **Required Verification Commands**
  - Run: `node --run check`
  - Expected: focused commands pass. If `node --run check` has unrelated baseline failures, list them explicitly and prove the new focused tests passed

- [x] 11. Gap 1 Frontend: Deliberation Events on the HUD Wall (R21)
  - Reuse: `client/src/lib/blueprint-realtime-store.ts`（已把每个事件转发给 `dispatchBrainstormGraphEvent`、已映射 `brainstorm.node.*` → rolePhases —— **不要改这个 relay**）；
    `client/src/lib/brainstorm-graph-store.ts`（`useBrainstormGraphStore` + `dispatchBrainstormGraphEvent`，已有 7 个 handler、有界队列
    `MAX_BRAINSTORM_NODES=500` FIFO、`asRecord` 防御式解析、session-id 守卫）；`BranchNode` / `BranchEdge` / `BrainstormRoleId`
    来自 `@shared/blueprint/brainstorm-contracts`。
    Note: 后端三个事件（`brainstorm.round.completed` / `brainstorm.challenge.issued` / `brainstorm.vote.completed`）由 task 2.4 emit、
    经 Socket.IO 中继（R17.1/R17.6）；本组只做**前端消费**，纯增量，不动既有 7 个 handler / 字段 / relay。

  - [x] 11.1 Extend `BrainstormGraphState` with deliberation fields (additive)
    - Modify `client/src/lib/brainstorm-graph-store.ts`
    - Append `currentRound: number | null`, `convergenceScore: number | null`, `challengeEdges: ChallengeEdge[]`,
      `voteOutcome: VoteOutcomeView | null`; add a new `ChallengeEdge` interface (`challengerRoleId` → `targetRoleId` + `summary`
      + `roundNumber`, distinct from structural `BranchEdge`) and a `VoteOutcomeView` shape (`winningOption` / `margin` / `isNarrow`
      + optional `minority`)
    - Add `MAX_CHALLENGE_EDGES = 500`; reset all four new fields in `INITIAL_BRAINSTORM_GRAPH`, `handleSessionStarted`, and `reset`
    - Leave the existing state fields (`sessionId` / `sessionStatus` / `nodes` / `edges` / `sessionMetadata`) untouched
    - _Requirements: 21.1_

  - [x] 11.2 Add 3 additive switch cases + actions to `dispatchBrainstormGraphEvent`
    - Modify `client/src/lib/brainstorm-graph-store.ts`; add `brainstorm.round.completed` / `brainstorm.challenge.issued` /
      `brainstorm.vote.completed` cases immediately after the 7 existing cases — do NOT touch any existing case
    - Each case reuses the existing pattern: `asRecord(payload)` defensive parse + session-id guard
      (`store.sessionId && sessionId !== store.sessionId` → ignore) + per-field type checks; any missing/mistyped field early-returns
      without throwing
    - Implement actions `handleRoundCompleted` (set `currentRound` + `convergenceScore`; optionally append a round-marker node via the
      existing `handleNodeCreated` / `MAX_BRAINSTORM_NODES` FIFO path), `handleChallengeIssued` (push a `ChallengeEdge` ONLY when BOTH
      role nodes exist — drop dangling edges; FIFO-bound by `MAX_CHALLENGE_EDGES`), `handleVoteCompleted` (set `voteOutcome`; retain
      `minority` only when `isNarrow === true`)
    - _Requirements: 21.1, 21.2, 21.3, 21.4, 21.5, 21.7_

  - [x] 11.3 Add Wall Graph selectors
    - Add `selectChallengeEdges`, `selectVoteOutcome`, `selectCurrentRound`, `selectConvergenceScore` alongside the existing
      `selectAllNodes` / `selectSessionMetadata` exports in `client/src/lib/brainstorm-graph-store.ts`
    - _Requirements: 21.3_

  - [x] 11.4 Render deliberation surfaces on the Wall Graph
    - In the Wall_Graph (3D HUD "Flow") rendering layer, draw `ChallengeEdge` visually distinct from structural `BranchEdge`
      (dashed + accent color + challenge badge revealing `summary`); render a vote-outcome card (highlight `winningOption`, show
      `margin`, narrow/dissent indicator + `minority` list when `isNarrow`)
    - Add an optional non-blocking HUD top-strip showing `currentRound` + `convergenceScore`; it MUST NOT render or throw when those
      values are `null`
    - Primary data integration point: `client/src/lib/brainstorm-graph-store.ts` selectors
    - Primary scene projection point: `client/src/components/three/scene-fusion/brainstorm-wall-graph-logic.ts`; follow existing graph projection patterns and keep visual rendering changes isolated from the store
    - _Requirements: 21.2, 21.3, 21.6_

  - [x] 11.5 Write property tests for deliberation event consumption
    - Create `client/src/lib/__tests__/brainstorm-graph-store.deliberation.property.test.ts` (fast-check, 100 runs,
      tagged `Feature: blueprint-v4-full-loop-completion, Property {n}`)
    - **Property 23: HUD wall bounded-queue invariant preserved across deliberation events**
    - **Property 24: Challenge edge references two known role nodes or is dropped**
    - **Property 25: Defensive consumption of malformed or session-mismatched events**
    - **Validates: Requirements 21.1, 21.2, 21.4, 21.5, 21.7**

  - [x] 11.6 Write unit / regression tests for the additive consumption
    - Regression: the 7 existing `dispatchBrainstormGraphEvent` handlers behave identically after the additive cases (R21.4)
    - Narrow vote (`isNarrow = true`) retains `minority`; non-narrow vote does not (R21.3)
    - HUD top-strip renders `currentRound`/`convergenceScore` when present and does not throw when `null` (R21.6)
    - Challenge edge renders visually distinct from a structural edge (component test, R21.2)
    - _Requirements: 21.2, 21.3, 21.4, 21.6_

## Notes

- This file lists **only true deltas** against already-existing code; verify-only items (R7.1–7.5, R9,
  R12.2–12.6, R13, matrix derivation/export/route) are intentionally NOT re-implemented.
- R11 is not verify-only in this spec: the finalize gate must be a true blocking gate wired into the effect-preview completion path.
- No property or regression test in this file is optional. A faster MVP may reduce UI polish, but it may not skip contract, ledger, provenance/gate/audit, or frontend defensive-consumption tests.
- Every new ledger write reuses the companion pattern: `targetArtifactId` IS the `jobId`, and `recordCheck`
  is always wrapped in try/catch (non-blocking).
- Brainstorm event emission uses the injected `emitEvent(type, payload)`, never `ctx.eventBus.emit` object form.
- Each subsystem keeps its existing env gate and single-agent fallback; all deltas are additive.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["1.3", "2.1", "2.3", "4.1", "4.3", "6.1", "8.1"] },
    { "id": 2, "tasks": ["1.4", "2.2", "4.2", "8.2", "6.3", "6.4"] },
    { "id": 3, "tasks": ["2.4", "2.5", "4.4", "4.5", "6.2", "8.3"] },
    { "id": 4, "tasks": ["2.6", "4.6", "6.5", "9.1", "9.2"] },
    { "id": 5, "tasks": ["2.7", "2.8", "2.9", "2.10", "4.7", "4.8", "6.6", "6.7", "8.4", "9.3"] },
    { "id": 6, "tasks": ["11.1"] },
    { "id": 7, "tasks": ["11.2"] },
    { "id": 8, "tasks": ["11.3"] },
    { "id": 9, "tasks": ["11.4"] },
    { "id": 10, "tasks": ["11.5", "11.6"] }
  ]
}
```
