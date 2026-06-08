# Requirements Document

## Introduction

The current `/autopilot` 3D wall has moved away from a single vertical waterfall, but it still reads as a stage-centered process graph: root -> stage -> roles -> synthesis. That is not enough for the desired blueprint experience. During SPEC Tree and SPEC Document generation, the wall should feel like a multi-role reasoning board: a central problem, multiple role-produced thinking nodes, evidence branches, risk/gap nodes, semantic relationship labels, and a final synthesis.

The reference direction is closer to a reasoning graph than a pipeline graph. It shows a question on the left, multiple semantic branches in the middle, edge labels such as support/evidence/related law, colored node types, telemetry counters, and a bottom console stream. This spec defines the requirements for upgrading the blueprint wall flow from "multi-role stage topology" to "LLM-authored multi-role reasoning graph".

The most important product invariant: the graph structure must come from runtime/LLM decisions whenever available. The frontend may provide a deterministic fallback for incomplete historical jobs, but it must not hardcode a fixed role list, a fixed five-branch shape, or fixed relationships that pretend to be LLM reasoning.

## Glossary

- **Brainstorm_Reasoning_Graph**: A graph describing the reasoning process for one active blueprint problem or SPEC node. It contains semantic nodes and semantic edges, not only stage/role topology.
- **Reasoning_Node**: A card in the wall graph representing a question, hypothesis, evidence, constraint, risk, gap, decision, or synthesis.
- **Reasoning_Edge**: A labeled relationship between nodes, such as supports, refines, conflicts, cites, questions, or synthesizes.
- **Central_Question**: The user goal, route decision, SPEC tree node, or document-generation question currently being reasoned about.
- **Role_Contribution**: A runtime/LLM-authored contribution from a role. It may become one or more Reasoning_Nodes.
- **Graph_Emitter**: The backend or orchestration layer that produces structured graph payloads from LLM outputs and runtime events.
- **Graph_Deriver_Fallback**: A frontend pure derivation fallback that converts existing `agentReasoningEntries`, `roleLabels`, `specTree`, and job artifacts into a limited graph when structured graph payloads are missing.
- **Wall_Renderer**: The 3D wall renderer, currently `BlueprintWallTexture` / related scene-fusion components, that draws the graph.
- **SPEC Stage 2**: The merged product stage containing SPEC Tree and SPEC Document generation. It is separate from Stage 3 Effect Preview.
- **Thinking Console**: A compact bottom console showing recent Ask/Thinking/Report or equivalent runtime reasoning lines for the active graph.

## Requirements

### Requirement 1: Represent Stage 2 as a reasoning graph, not a stage pipeline

**User Story:** As a blueprint user, I want the wall to show how roles reason about the current SPEC problem, so I can understand the decision process instead of seeing only a stage progress diagram.

#### Acceptance Criteria

1. WHEN the active visual stage is `spec_tree` or `spec_documents`, THE wall graph SHALL prioritize a Brainstorm_Reasoning_Graph over the generic stage pipeline graph.
2. THE graph SHALL include a Central_Question node when the active job, selected SPEC node, route, or LLM graph payload provides a question/objective.
3. THE graph SHALL display role contributions as semantic Reasoning_Nodes, not only as role-name cards.
4. THE graph SHALL include a synthesis/final-answer node when the runtime has produced a conclusion, document summary, or synthesis result.
5. THE graph SHALL avoid showing a vertical sequence of document-generation log entries as the primary visual shape.
6. THE graph SHALL preserve stage context through small labels or metadata, but stage nodes SHALL NOT dominate the Stage 2 wall layout.

### Requirement 2: Let LLM/runtime decide graph branches and relationships

**User Story:** As a product designer, I want the graph structure to reflect LLM autonomous decisions, so the wall does not fake brainstorming with fixed frontend branches.

#### Acceptance Criteria

1. THE system SHALL support a structured Brainstorm_Reasoning_Graph payload emitted by the runtime/LLM layer.
2. THE structured payload SHALL contain nodes, edges, central question metadata, role attribution, status, and optional telemetry.
3. THE frontend SHALL render the structured graph payload when it is present and valid.
4. THE frontend SHALL NOT hardcode a fixed set of five roles, fixed branch names, or fixed role-to-role relationship order.
5. THE frontend SHALL NOT infer conflict/support/citation relationships unless those relationships are present in the structured payload or directly derivable from explicit runtime fields.
6. IF structured graph payloads are absent, THEN the Graph_Deriver_Fallback MAY create a limited graph from runtime entries, but all fallback-created relationships SHALL be marked as fallback-derived.
7. The fallback graph SHALL prefer actual runtime `roleLabels` and `roleId` values over static role presets.

### Requirement 3: Define semantic node types for reasoning

**User Story:** As a user reading the wall, I want node cards to say what kind of thought they represent, so I can follow the reasoning without reading raw logs.

#### Acceptance Criteria

1. THE graph model SHALL support at least these node types: `question`, `clarification`, `hypothesis`, `evidence`, `constraint`, `risk`, `gap`, `decision`, and `synthesis`.
2. Each Reasoning_Node SHALL include stable `id`, `type`, `title`, optional `body`, optional `roleId`, optional `roleLabel`, `status`, and `sourceRefs`.
3. `status` SHALL support at least `open`, `active`, `supported`, `challenged`, `resolved`, and `failed`.
4. Evidence nodes SHALL be able to reference source URLs, repo files, spec files, API responses, or runtime observations when available.
5. Gap nodes SHALL identify missing information or unresolved uncertainty without blocking rendering.
6. Synthesis nodes SHALL summarize the final decision or answer in compact wall-readable text.
7. Node text SHALL be concise enough for wall rendering; long LLM outputs SHALL be summarized before becoming node card text.

### Requirement 4: Define semantic edge types and labels

**User Story:** As a user, I want the graph lines to tell me why nodes are connected, so I can distinguish support, conflict, evidence, and synthesis paths.

#### Acceptance Criteria

1. THE graph model SHALL support at least these edge types: `supports`, `refines`, `conflicts`, `cites`, `questions`, `depends_on`, and `synthesizes`.
2. Each Reasoning_Edge SHALL include stable `id`, `source`, `target`, `type`, optional `label`, and optional `confidence`.
3. Edge labels SHALL be displayed when provided and hidden only when the wall renderer determines that label overlap would make the graph unreadable.
4. Edge color/style SHALL vary by edge type.
5. Conflict or risk edges SHALL be visually distinguishable from support/evidence edges.
6. The graph SHALL omit uncertain edges rather than draw guessed relationships.
7. Fallback-derived edges SHALL be visually lower priority than LLM-authored edges.

### Requirement 5: Use a reasoning-board layout for SPEC stages

**User Story:** As a user, I want the wall to look like a reasoning board similar to the reference image, so the brainstorming process is visually clear.

#### Acceptance Criteria

1. THE Stage 2 wall layout SHALL place the Central_Question toward the left side of the graph.
2. THE layout SHALL place role/evidence/hypothesis branches across the middle canvas, not in a narrow vertical column.
3. THE layout SHALL place synthesis/final-answer nodes toward the right side of the graph.
4. THE layout SHALL reserve enough whitespace for curved semantic edges and edge labels.
5. THE layout SHALL support at least 8 visible Reasoning_Nodes without overlap at the default desktop wall view.
6. THE layout SHALL cap or collapse excessive nodes into grouped summaries when more than 16 nodes are available.
7. THE renderer SHALL prefer readability over exhaustiveness: the wall should show the most important reasoning graph, not every raw runtime event.
8. The graph SHALL have a deterministic layout for the same input so screenshots and tests remain stable.

### Requirement 6: Render graph cards with type and role identity

**User Story:** As a user, I want to know both what a node means and which role contributed it, so I can see multi-role interaction instead of anonymous cards.

#### Acceptance Criteria

1. Each node card SHALL show a type marker through color, icon, or compact label.
2. Each node card SHALL show `roleLabel` when role attribution exists.
3. Role attribution SHALL be secondary to the node's reasoning content; the card title/body SHALL describe the contribution, not only the role name.
4. Node cards SHALL use stable width and controlled wrapping.
5. Node cards SHALL not overlap each other in the default desktop wall view.
6. Node cards SHALL be readable on the 3D wall screenshot at 1440x950 desktop viewport.
7. Failed or challenged nodes SHALL be visibly different from supported/resolved nodes.

### Requirement 7: Add Thinking Console and telemetry affordances

**User Story:** As a user, I want the wall to feel like a live reasoning workspace, so I can see the current Ask/Thinking/Report flow and process metrics.

#### Acceptance Criteria

1. THE wall graph SHALL include a compact Thinking Console for the active reasoning graph.
2. The console SHALL show recent runtime reasoning lines such as Ask, Thinking, Tool, Observation, Report, or equivalent event names when available.
3. Console lines SHALL be scoped to the active job and active reasoning graph.
4. Console lines SHALL be capped to a wall-readable count, defaulting to 6.
5. THE wall graph SHALL include telemetry counters when available: token burn, source count, elapsed time, remaining budget/points, and active roles.
6. Missing telemetry SHALL render as muted placeholders, not fabricated values.
7. The console SHALL not cover the primary graph nodes at the default desktop wall view.

### Requirement 8: Preserve Stage 2 and Stage 3 page boundaries

**User Story:** As a user navigating the staged workflow, I want the wall graph to reflect the active stage without making SPEC Tree look like Effect Preview.

#### Acceptance Criteria

1. WHEN the active right-rail page is `spec_tree`, THE wall MAY show SPEC reasoning graph content but SHALL NOT show effect-preview-specific controls as the primary graph outcome.
2. WHEN the active right-rail page is `spec_documents`, THE wall MAY show document synthesis and document-quality reasoning nodes.
3. WHEN the active right-rail page is `effect_preview`, THE wall SHALL switch to effect-preview/projection reasoning rather than SPEC Tree structure.
4. Stage 2 graph content SHALL not be automatically replaced by Stage 3 preview content merely because effect preview artifacts already exist for the job.
5. The wall graph stage boundary SHALL match the top-level stage chain: Stage 1 clarification/route, Stage 2 spec tree/spec documents, Stage 3 effect preview.

### Requirement 9: Provide fallback behavior for historical jobs

**User Story:** As a user opening an old job, I still want a useful graph even if the job was created before structured reasoning graph payloads existed.

#### Acceptance Criteria

1. IF a job has no structured Brainstorm_Reasoning_Graph payload, THEN the Graph_Deriver_Fallback SHALL build a limited graph from `agentReasoningEntries`, `roleLabels`, `specTree`, and available artifacts.
2. The fallback graph SHALL include a fallback marker in graph metadata.
3. The fallback graph SHALL still avoid a pure vertical waterfall.
4. The fallback graph SHALL show actual runtime role labels when available.
5. The fallback graph SHALL avoid claiming semantic relationships such as `conflicts` or `cites` unless explicit fields support those relationships.
6. The fallback graph SHALL always include a safe empty state when insufficient data exists.

### Requirement 10: Persist and replay reasoning graph payloads

**User Story:** As a reviewer, I want the same reasoning graph to be visible after reload/history restore, so the wall remains explainable and auditable.

#### Acceptance Criteria

1. Structured Brainstorm_Reasoning_Graph payloads SHALL be persisted as job artifacts or equivalent blueprint job state.
2. Persisted graph payloads SHALL be keyed by job id and stage/sub-stage.
3. History restore via `activeJob` SHALL be able to recover graph payloads for the active job.
4. Replay views SHALL distinguish live graph events from restored graph payloads.
5. Persisted graph data SHALL include enough chronological ordering metadata to replay node/edge appearance later.
6. IF persistence fails, THE runtime SHALL emit a degradation event and the UI SHALL fall back to derived graph behavior.

### Requirement 11: Verify with unit tests and Playwright visual QA

**User Story:** As a maintainer, I want confidence that the new graph is not another decorative layer, so tests and screenshots prove the behavior.

#### Acceptance Criteria

1. Pure graph model/deriver tests SHALL verify structured graph payload rendering preference over fallback derivation.
2. Pure graph tests SHALL verify that fallback derivation uses runtime role ids/labels rather than a fixed role list.
3. Pure graph tests SHALL verify semantic node and edge typing.
4. Renderer tests SHALL verify that Stage 2 graph nodes include reasoning content, not only role names.
5. Renderer tests SHALL verify that edge labels/styles are mapped by edge type.
6. Playwright visual QA SHALL capture `/autopilot?activeJob=<jobId>&sub=spec_tree` at desktop viewport.
7. The Playwright screenshot SHALL show a wide multi-branch reasoning graph rather than a narrow vertical waterfall.
8. The Playwright DOM checks SHALL verify SPEC Tree page boundaries: `spec-tree-workbench` present, `streaming-doc-renderer` absent, `enter-effect-preview` absent.
9. Console health SHALL be checked; unrelated Three/WebGL warnings MAY be documented, but app errors SHALL be treated as failures.

## Non-Goals

1. This spec SHALL NOT require hardcoding a five-role brainstorm layout in the frontend.
2. This spec SHALL NOT replace the entire office 3D scene.
3. This spec SHALL NOT remove existing role agents/pets from the scene.
4. This spec SHALL NOT make the wall graph an editable graph editor.
5. This spec SHALL NOT depend on effect preview artifacts to render SPEC Tree reasoning.
6. This spec SHALL NOT require showing every raw runtime log line as a graph node.
7. This spec SHALL NOT change mission-first `/tasks` wall behavior.
8. This spec SHALL NOT introduce a second source of truth for active stage navigation.

## Open Design Questions

1. Should structured Brainstorm_Reasoning_Graph payloads be emitted by the existing agent reasoning event stream, by a new artifact type, or by both?
2. Should graph layout be rendered by the existing CanvasTexture path, by AntV/FlowGraph in a wall Html surface, or by a hybrid where the graph is DOM for readability and rasterized for 3D stability?
3. What is the maximum number of reasoning nodes that should be visible before grouping: 12, 16, or 20?
4. Should Thinking Console lines be generated from existing `agentReasoningEntries` only, or should the runtime emit dedicated Ask/Thinking/Report events?
5. Should the active SPEC Tree node selection drive the wall graph focus, or should the wall always show job-level Stage 2 reasoning?
