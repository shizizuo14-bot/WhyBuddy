# Implementation Plan

> Goal: upgrade the blueprint Stage 2 wall flow from a stage/role process graph into an LLM-authored multi-role reasoning graph with semantic nodes, semantic edges, fallback derivation, and Playwright-visible reasoning-board layout.

> Status reconciliation (2026-06-08 audit): code-level deliverables are implemented and green (71 focused tests pass across shared contract, backend parser/persistence, frontend deriver, artifact extraction, wall renderer wiring, and console/telemetry overlays). The only items left unchecked are the Playwright browser-evidence steps (9.2-9.4), which require a running browser + screenshot evidence and cannot be confirmed from source.

## Task 1: Add shared reasoning graph contracts

- [x] 1.1 Create `shared/blueprint/brainstorm-reasoning-graph.ts`.
  - Define `BrainstormReasoningGraph`, `BrainstormReasoningNode`, `BrainstormReasoningEdge`, telemetry, console line, source ref, node type, edge type, and status types.
  - Keep this file free of client-only imports.
  - _Requirements: 2.1-2.3, 3.1-3.7, 4.1-4.7_

- [x] 1.2 Export the new contract from the shared blueprint contract barrel if the repo has one.
  - Search for existing shared blueprint exports before adding a new export path.
  - Do not rename existing backend contracts.
  - _Requirements: 2.1-2.3_

- [x] 1.3 Add type-level or compile-focused tests where existing shared-contract tests live.
  - Verify valid node/edge examples typecheck.
  - Verify graph payload can represent `spec_tree`, `spec_documents`, and `effect_preview`.
  - _Requirements: 3.1-3.7, 4.1-4.7_

## Task 2: Add frontend reasoning graph deriver

- [x] 2.1 Create `client/src/components/three/scene-fusion/blueprint-wall-reasoning-graph.ts`.
  - Implement `deriveBlueprintWallReasoningGraph(input)`.
  - Prefer valid structured graph payloads over fallback.
  - Return `mode: "structured" | "fallback" | "empty"`.
  - _Requirements: 1.1-1.6, 2.1-2.7, 9.1-9.6_

- [x] 2.2 Add current-job scoping.
  - Ignore structured graphs whose `jobId` does not match `job.id`.
  - Ignore runtime entries whose `jobId` exists and does not match `job.id`.
  - Return empty state when there is no active job.
  - _Requirements: 8.1-8.5, 9.1-9.6, 10.1-10.6_

- [x] 2.3 Add fallback central question derivation.
  - Prefer selected SPEC node title/summary.
  - Fall back to job title, objective, prompt, or route text when available.
  - Use a compact placeholder only when no usable question exists.
  - _Requirements: 1.2, 5.1, 9.1-9.6_

- [x] 2.4 Add fallback node derivation from runtime entries.
  - Map thinking-like entries to `hypothesis` or `clarification`.
  - Map observing entries with evidence text to `evidence`.
  - Map errors or missing information to `risk` or `gap`.
  - Map completion/synthesis-like entries to `decision` or `synthesis`.
  - Preserve actual `roleId` and runtime `roleLabel`.
  - _Requirements: 3.1-3.7, 6.1-6.7, 9.1-9.6_

- [x] 2.5 Add fallback edge derivation.
  - Create only conservative `refines`, `depends_on`, and `synthesizes` edges.
  - Mark fallback edges with `source: "fallback"`.
  - Omit `conflicts` and `cites` unless explicit runtime fields support them.
  - Drop edges that reference unknown node ids.
  - _Requirements: 4.1-4.7, 9.5_

- [x] 2.6 Add console and telemetry derivation.
  - Use structured console lines when present.
  - Otherwise derive compact Ask/Thinking/Observation/Report lines from current-job entries.
  - Cap console lines to 6 by default.
  - Render missing telemetry as nulls/placeholders.
  - _Requirements: 7.1-7.7_

- [x] 2.7 Add pure deriver tests.
  - Structured graph wins over fallback.
  - Wrong-job graph is ignored.
  - Fallback uses dynamic runtime role labels, not fixed role presets.
  - Fallback avoids vertical log waterfall by producing semantic nodes.
  - Invalid edges are omitted.
  - Node cap exposes `hiddenNodeCount`.
  - Empty job returns empty state.
  - _Requirements: 2.1-2.7, 3.1-3.7, 4.1-4.7, 9.1-9.6, 11.1-11.3_

## Task 3: Extract persisted reasoning graph artifacts

- [x] 3.1 Add a pure helper to read `brainstorm_reasoning_graph` artifacts from `BlueprintGenerationJob`.
  - Place it near existing artifact payload readers.
  - Return an array of `BrainstormReasoningGraph`.
  - Filter malformed payloads defensively.
  - _Requirements: 10.1-10.6_

- [x] 3.2 Wire extracted structured graphs into `Scene3D` / wall graph props.
  - Use active job artifacts as the source.
  - Do not read global latest job state outside the existing page data flow.
  - _Requirements: 2.1-2.7, 8.1-8.5, 10.1-10.6_

- [x] 3.3 Add tests for artifact extraction.
  - Valid graph artifact is returned.
  - Wrong type is ignored.
  - Malformed graph is ignored.
  - Active-job restore can pass extracted graphs to the wall layer.
  - _Requirements: 10.1-10.6, 11.1_

## Task 4: Update Stage 2 wall renderer mapping

- [x] 4.1 Add a reasoning graph branch to the wall renderer for `spec_tree` and `spec_documents`.
  - Use `deriveBlueprintWallReasoningGraph(...)`.
  - Prefer structured graph view model.
  - Use fallback graph only when structured graph is absent.
  - _Requirements: 1.1-1.6, 2.1-2.7, 8.1-8.5_

- [x] 4.2 Implement reasoning-board layout.
  - Place Central Question left.
  - Place clarification/constraint branches next.
  - Place hypothesis/evidence/risk/gap nodes across the middle.
  - Place decision/synthesis nodes right.
  - Cap visible nodes at 16 and group/collapse overflow.
  - _Requirements: 5.1-5.8_

- [x] 4.3 Add semantic node card rendering.
  - Show node type marker.
  - Show title/body.
  - Show role label as secondary metadata.
  - Show status dot/tone.
  - Ensure title/body are more prominent than role name.
  - _Requirements: 3.1-3.7, 6.1-6.7_

- [x] 4.4 Add semantic edge rendering.
  - Map edge types to color/style.
  - Render labels when available.
  - Use lower-priority styling for fallback edges.
  - Drop uncertain or invalid edges.
  - _Requirements: 4.1-4.7_

- [x] 4.5 Preserve non-Stage-2 behavior.
  - Existing route/generic process view remains for Stage 1.
  - Existing effect-preview/projection graph remains for Stage 3.
  - Mission-first `/tasks` wall remains unchanged.
  - _Requirements: 8.1-8.5, Non-Goals 2, 7, 8_

## Task 5: Add Thinking Console and telemetry overlays

- [x] 5.1 Add wall Thinking Console rendering.
  - Render up to 6 graph-scoped console lines.
  - Prefer structured graph console lines.
  - Fall back to derived current-job reasoning lines.
  - _Requirements: 7.1-7.4_

- [x] 5.2 Add graph telemetry display.
  - Token burn.
  - Source count.
  - Elapsed time.
  - Remaining budget/points.
  - Active role count.
  - Use muted placeholders for missing values.
  - _Requirements: 7.5-7.7_

- [x] 5.3 Add tests for console/telemetry rendering.
  - Structured console lines render.
  - Fallback console lines render.
  - Missing telemetry renders placeholders.
  - Console does not render stale wrong-job lines.
  - _Requirements: 7.1-7.7, 11.1-11.5_

## Task 6: Add backend/runtime graph payload support

- [x] 6.1 Define artifact payload shape for `brainstorm_reasoning_graph`.
  - Store `stage`, `subStage`, and `graph`.
  - Keep payload compatible with shared graph contract.
  - _Requirements: 10.1-10.6_

- [x] 6.2 Update SPEC Tree generation runtime to emit or persist a reasoning graph when LLM output contains structured graph data.
  - Do not block normal SPEC Tree generation if graph persistence fails.
  - Emit degradation event on persistence failure.
  - _Requirements: 2.1-2.7, 10.1-10.6_

- [x] 6.3 Update SPEC Document generation runtime to emit or persist a reasoning graph when LLM output contains structured graph data.
  - Use document synthesis question as Central_Question.
  - Preserve role attribution.
  - _Requirements: 1.1-1.6, 2.1-2.7, 10.1-10.6_

- [x] 6.4 Add backend tests for graph artifact persistence.
  - Persist graph on successful structured output.
  - Continue generation when graph persistence fails.
  - Restore graph from job artifacts.
  - _Requirements: 10.1-10.6_

## Task 7: Add prompt/output contract for LLM-authored graph

- [x] 7.1 Extend the relevant SPEC Tree / SPEC Document LLM prompt contract to request an optional reasoning graph.
  - Ask for concise semantic nodes.
  - Ask for explicit semantic edges.
  - Ask for role attribution.
  - Do not require graph output when the model cannot confidently provide it.
  - _Requirements: 2.1-2.7, 3.1-3.7, 4.1-4.7_

- [x] 7.2 Add parser/validator for LLM graph output.
  - Validate node ids.
  - Validate edge endpoints.
  - Validate node/edge enum values.
  - Summarize overlong node text.
  - _Requirements: 2.1-2.7, 3.7, 4.6_

- [x] 7.3 Add tests for parser/validator.
  - Valid payload passes.
  - Unknown node type is rejected or normalized to a safe fallback.
  - Edge to missing node is dropped.
  - Overlong body is summarized/truncated.
  - _Requirements: 3.1-3.7, 4.1-4.7_

## Task 8: Focus SPEC Tree page boundary with wall graph

- [x] 8.1 Ensure `spec_tree` right rail continues to render `SpecTreeWorkbench`.
  - Assert `streaming-doc-renderer` is absent.
  - Assert `enter-effect-preview` is absent.
  - Assert TrustSection/check ledger is not shown in the SPEC Tree first viewport.
  - _Requirements: 8.1-8.5, 11.8_

- [x] 8.2 Ensure wall graph respects `sub=spec_tree`.
  - Do not switch to effect preview graph merely because preview artifacts exist.
  - Use SPEC Tree reasoning graph as primary wall content.
  - _Requirements: 8.1-8.5_

- [x] 8.3 Add right-rail/wall integration tests.
  - Active SPEC Tree page has SPEC Tree workbench.
  - Active SPEC Tree page wall graph uses Stage 2 reasoning model.
  - Active Effect Preview page wall graph uses preview model.
  - _Requirements: 8.1-8.5, 11.8_

## Task 9: Playwright visual QA

- [x] 9.1 Run focused unit tests.
  - Reasoning graph deriver tests.
  - Artifact extraction tests.
  - Renderer mapping tests.
  - Right rail stage-boundary tests.
  - _Requirements: 11.1-11.5_

- [ ] 9.2 Run Playwright on `http://localhost:3000/autopilot?activeJob=<jobId>&sub=spec_tree`.
  - Log in with an existing test account or create one through existing helpers.
  - Wait for canvas and right rail to settle.
  - Capture screenshot.
  - _Requirements: 11.6-11.9_

- [ ] 9.3 Verify DOM and visual expectations.
  - `spec-tree-workbench` count is 1.
  - `streaming-doc-renderer` count is 0.
  - `autopilot-workbench-action-enter-effect-preview` count is 0.
  - Wall screenshot shows wide multi-branch reasoning graph.
  - Wall screenshot does not show a narrow vertical waterfall.
  - _Requirements: 5.1-5.8, 8.1-8.5, 11.6-11.9_

- [ ] 9.4 Document browser evidence.
  - Save screenshot outside the repo or in the agreed evidence location.
  - Record console warnings/errors.
  - Treat app errors as failures.
  - Document unrelated Three/WebGL warnings separately.
  - _Requirements: 11.6-11.9_

## Verification Checklist

- [x] Shared reasoning graph contract exists.
- [x] Structured graph payload wins over fallback.
- [x] Fallback uses runtime roles and labels, not a fixed role list.
- [x] Fallback graph does not invent conflict/citation relationships.
- [x] SPEC Tree wall graph shows reasoning content, not only role cards.
- [x] Semantic edges have labels/styles.
- [x] Thinking Console is scoped to the active graph.
- [x] Telemetry placeholders render when values are missing.
- [x] SPEC Tree page does not show Effect Preview controls.
- [x] Historical jobs get safe fallback graph behavior.
- [x] Graph payloads can be persisted and restored.
- [x] Focused unit tests pass.
- [ ] Playwright screenshot proves wide multi-branch graph and right-rail boundary.
