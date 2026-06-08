# Design Document

## Overview

This design upgrades the blueprint 3D wall graph from a stage/process visualization into an LLM-authored multi-role reasoning graph for SPEC Tree and SPEC Document generation.

The current wall can show that multiple roles are active, but the visual unit is still mostly "role" or "stage". The target visual unit is "reasoning contribution": a question, hypothesis, evidence, risk, gap, decision, or synthesis. Roles remain visible as attribution, but they no longer define the graph shape by themselves.

The design intentionally builds on existing wall graph work:

```text
blueprint-wall-process-data-2026-05-31
  deriveBlueprintWallProcessData(...)
        |
        v
blueprint-wall-process-graph-hud-2026-05-31
  FlowGraph / wall HUD / metrics / console
        |
        v
blueprint-wall-brainstorm-reasoning-graph-2026-06-08
  structured reasoning graph payload + fallback + Stage 2 visual focus
```

This spec does not replace the whole 3D scene and does not make the wall graph editable. It changes the graph data model and renderer mapping for Stage 2 so the wall reads like a reasoning board rather than a workflow timeline.

## Architecture

### Target Data Flow

```text
LLM / runtime orchestration
  - role contributions
  - graph nodes
  - graph edges
  - telemetry
        |
        v
BrainstormReasoningGraph artifact/event payload
        |
        v
AutopilotRoutePage / blueprint realtime store
        |
        v
Scene3D blueprint props
        |
        v
deriveBlueprintWallReasoningGraph(...)
        |
        v
Blueprint wall renderer
  - structured graph when available
  - fallback graph for old jobs
```

### Runtime First, Fallback Second

The graph has two input paths:

1. **Structured path**: the backend/runtime emits a `BrainstormReasoningGraph` payload. This is authoritative.
2. **Fallback path**: the frontend derives a limited graph from existing `agentReasoningEntries`, `roleLabels`, `specTree`, current job, and artifacts.

The renderer must prefer the structured path. Fallback exists only so existing jobs are not blank.

### Stage Boundary

The wall chooses graph focus by visible stage:

| Visible Stage | Wall Graph Focus |
| --- | --- |
| Stage 1 clarification / route | existing route or generic process view |
| `spec_tree` | SPEC tree reasoning graph; no effect preview controls |
| `spec_documents` | SPEC document synthesis reasoning graph |
| `effect_preview` | effect preview / projection graph |

This is a visual-stage decision. It must not be overridden just because downstream artifacts already exist on the job.

## Data Model

### `BrainstormReasoningGraph`

Proposed shared type location:

```text
shared/blueprint/brainstorm-reasoning-graph.ts
```

```ts
export interface BrainstormReasoningGraph {
  id: string;
  jobId: string;
  stage: "spec_tree" | "spec_documents" | "effect_preview" | string;
  subStage?: string;
  centralQuestion?: BrainstormCentralQuestion;
  nodes: BrainstormReasoningNode[];
  edges: BrainstormReasoningEdge[];
  telemetry?: BrainstormGraphTelemetry;
  consoleLines?: BrainstormGraphConsoleLine[];
  source: "llm" | "runtime" | "fallback";
  createdAt?: string;
  updatedAt?: string;
}
```

### `BrainstormReasoningNode`

```ts
export type BrainstormReasoningNodeType =
  | "question"
  | "clarification"
  | "hypothesis"
  | "evidence"
  | "constraint"
  | "risk"
  | "gap"
  | "decision"
  | "synthesis";

export type BrainstormReasoningNodeStatus =
  | "open"
  | "active"
  | "supported"
  | "challenged"
  | "resolved"
  | "failed";

export interface BrainstormReasoningNode {
  id: string;
  type: BrainstormReasoningNodeType;
  title: string;
  body?: string;
  roleId?: string;
  roleLabel?: string;
  status: BrainstormReasoningNodeStatus;
  confidence?: number;
  sourceRefs?: BrainstormSourceRef[];
  order?: number;
}
```

### `BrainstormReasoningEdge`

```ts
export type BrainstormReasoningEdgeType =
  | "supports"
  | "refines"
  | "conflicts"
  | "cites"
  | "questions"
  | "depends_on"
  | "synthesizes";

export interface BrainstormReasoningEdge {
  id: string;
  source: string;
  target: string;
  type: BrainstormReasoningEdgeType;
  label?: string;
  confidence?: number;
  source: "llm" | "runtime" | "fallback";
}
```

### Telemetry and Console

Telemetry remains optional. Missing values render as placeholders.

```ts
export interface BrainstormGraphTelemetry {
  tokenBurn?: number | null;
  sourceCount?: number | null;
  elapsedMs?: number | null;
  remainingBudget?: number | null;
  activeRoleCount?: number | null;
}

export interface BrainstormGraphConsoleLine {
  id: string;
  kind: "Ask" | "Thinking" | "Tool" | "Observation" | "Report" | "System";
  text: string;
  roleId?: string;
  timestamp?: string;
}
```

## Derivation Design

### `deriveBlueprintWallReasoningGraph(...)`

Proposed file:

```text
client/src/components/three/scene-fusion/blueprint-wall-reasoning-graph.ts
```

Responsibilities:

- prefer a valid structured graph payload;
- validate current job scope;
- normalize node and edge fields for renderer use;
- build fallback graph for historical jobs;
- cap visible node count;
- expose metadata showing whether graph is structured or fallback-derived.

Non-responsibilities:

- LLM prompting;
- persistence;
- DOM or Three rendering;
- visual layout measurement;
- graph editing.

Input:

```ts
export interface DeriveBlueprintWallReasoningGraphInput {
  job: BlueprintGenerationJob | null | undefined;
  activeSubStage?: "spec_tree" | "spec_documents" | "effect_preview" | string;
  structuredGraphs?: BrainstormReasoningGraph[];
  agentReasoningEntries?: AgentReasoningEntry[];
  roleLabels?: Record<string, string>;
  specTree?: BlueprintSpecTree | null;
  selectedSpecNodeId?: string | null;
  maxVisibleNodes?: number;
  maxConsoleLines?: number;
}
```

Output:

```ts
export interface BlueprintWallReasoningGraphViewModel {
  graph: BrainstormReasoningGraph | null;
  mode: "structured" | "fallback" | "empty";
  emptyReason?: "no-job" | "no-stage-data" | "no-reasoning-data";
  visibleNodes: BrainstormReasoningNode[];
  visibleEdges: BrainstormReasoningEdge[];
  hiddenNodeCount: number;
  consoleLines: BrainstormGraphConsoleLine[];
  telemetry: BrainstormGraphTelemetry;
}
```

### Fallback Rules

Fallback graph is conservative:

- central question comes from selected SPEC node title, job title, route title, or user objective;
- runtime roles come from `roleLabels` and `agentReasoningEntries.roleId`;
- `thinking` entries become `hypothesis` or `clarification` nodes depending on text and stage;
- `observing` entries become `evidence` nodes only when they have observation text;
- failed/error entries become `risk` or `gap` nodes;
- completion/synthesis-looking entries become `decision` or `synthesis` nodes;
- fallback edges are limited to `refines`, `depends_on`, and `synthesizes`;
- fallback edges are marked `source: "fallback"`;
- fallback never creates `conflicts` or `cites` without explicit fields.

## Rendering Design

### Layout

Stage 2 uses a reasoning-board layout:

```text
left                  middle                                  right
Central Question  ->  hypotheses / evidence / risks / gaps -> synthesis
```

Default lanes:

| Lane | Content |
| --- | --- |
| 0 | Central question |
| 1 | clarifications / constraints |
| 2 | hypotheses / role contributions |
| 3 | evidence / risks / gaps |
| 4 | decisions / synthesis |

The layout preserves deterministic placement:

```text
x = lane * 360 + offsetX
y = row * 150 + offsetY
```

Structured graph payloads may provide `order`; otherwise the deriver sorts nodes by source event order and type priority.

### Node Styling

| Type | Visual Treatment |
| --- | --- |
| `question` | blue border, root marker |
| `clarification` | teal border |
| `hypothesis` | violet border |
| `evidence` | green/teal border |
| `constraint` | slate border |
| `risk` | amber/red border |
| `gap` | red border |
| `decision` | purple border |
| `synthesis` | dark blue or emerald emphasis |

Cards show:

- type label;
- title;
- one to two body lines;
- role label as secondary metadata;
- status dot.

### Edge Styling

| Edge Type | Style |
| --- | --- |
| `supports` | teal dashed curve |
| `refines` | purple dashed curve |
| `conflicts` | red dashed curve |
| `cites` | green dashed curve |
| `questions` | blue dashed curve |
| `depends_on` | slate dashed curve |
| `synthesizes` | emerald emphasized curve |

Labels render near the edge midpoint when space permits.

### Thinking Console

The console is scoped to the active graph. It renders at the bottom of the wall surface:

```text
> Ask("...")
> Thinking(...)
DONE. Summary...
> Report()
```

If structured graph payload supplies console lines, use them. Otherwise derive from current-job `agentReasoningEntries`.

## Persistence and Runtime Integration

### Artifact Strategy

Structured graphs should be persisted as blueprint job artifacts with a dedicated artifact type:

```text
brainstorm_reasoning_graph
```

Artifact payload:

```ts
{
  type: "brainstorm_reasoning_graph",
  stage: "spec_tree" | "spec_documents" | "effect_preview",
  graph: BrainstormReasoningGraph
}
```

This avoids mixing graph payloads into raw text documents and makes history restore straightforward.

### Event Strategy

Live runtime may emit:

```text
brainstorm.graph.started
brainstorm.node.created
brainstorm.node.updated
brainstorm.edge.created
brainstorm.console.line
brainstorm.graph.completed
```

The UI should not require all live events for the first implementation. Persisted artifact support plus fallback is enough to unblock reliable rendering. Live event support can be incremental.

## Error Handling

- Invalid structured graph payload: ignore it, log a development warning, and use fallback graph.
- Missing job id: render empty graph.
- Graph references unknown node ids: omit invalid edges.
- Too many nodes: render first N prioritized nodes and expose `hiddenNodeCount`.
- Missing telemetry: render placeholders.
- Persistence missing for old job: fallback derivation.

## Testing Strategy

### Unit Tests

Test `deriveBlueprintWallReasoningGraph(...)`:

- structured payload wins over fallback;
- wrong-job structured payload is ignored;
- fallback uses runtime role ids and labels;
- fallback does not create fixed role branches;
- invalid edges are omitted;
- node cap creates `hiddenNodeCount`;
- missing job returns empty state.

Test renderer mapping:

- node type maps to visual tone;
- edge type maps to stroke style and label;
- fallback edges are lower priority;
- Stage 2 layout places question left and synthesis right.

### Browser QA

Playwright checks:

- open `/autopilot?activeJob=<jobId>&sub=spec_tree`;
- assert right rail stage boundary remains correct;
- screenshot wall graph;
- confirm wall shows wide multi-branch graph;
- confirm no vertical single-line waterfall;
- confirm no app console errors.

## Migration Plan

1. Add shared graph types and frontend deriver.
2. Support artifact extraction from existing job artifacts.
3. Add fallback graph for current jobs.
4. Update wall renderer to consume reasoning graph view model during Stage 2.
5. Add persistence/runtime graph payload in backend.
6. Add browser visual QA job fixture.

The order intentionally gives the frontend a useful fallback before backend graph emission is complete, while preserving the final goal that LLM/runtime graph payloads are authoritative.
