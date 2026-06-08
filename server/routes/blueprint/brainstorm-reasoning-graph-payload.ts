import type {
  BrainstormGraphConsoleLine,
  BrainstormReasoningEdge,
  BrainstormReasoningEdgeType,
  BrainstormReasoningGraph,
  BrainstormReasoningGraphStage,
  BrainstormReasoningNode,
  BrainstormReasoningNodeStatus,
  BrainstormReasoningNodeType,
} from "../../../shared/blueprint/brainstorm-reasoning-graph.js";

export interface ParseBrainstormReasoningGraphInput {
  payload: unknown;
  jobId: string;
  stage: BrainstormReasoningGraphStage;
  subStage?: string;
  fallbackQuestionTitle?: string;
  createdAt?: string;
}

const NODE_TYPES: readonly BrainstormReasoningNodeType[] = [
  "question",
  "clarification",
  "hypothesis",
  "evidence",
  "constraint",
  "risk",
  "gap",
  "decision",
  "synthesis",
];

const NODE_STATUSES: readonly BrainstormReasoningNodeStatus[] = [
  "open",
  "active",
  "supported",
  "challenged",
  "resolved",
  "failed",
];

const EDGE_TYPES: readonly BrainstormReasoningEdgeType[] = [
  "supports",
  "refines",
  "conflicts",
  "cites",
  "questions",
  "depends_on",
  "synthesizes",
];

export function parseBrainstormReasoningGraphPayload(
  input: ParseBrainstormReasoningGraphInput
): BrainstormReasoningGraph | null {
  const graphPayload = readGraphPayload(input.payload);
  const graphRecord = asRecord(graphPayload);
  if (!graphRecord) return null;

  const rawNodes = Array.isArray(graphRecord.nodes) ? graphRecord.nodes : [];
  const nodes = rawNodes
    .map((node, index) => normalizeNode(node, input, index))
    .filter((node): node is BrainstormReasoningNode => node !== null);
  if (nodes.length === 0) return null;

  const nodeIds = new Set(nodes.map(node => node.id));
  const rawEdges = Array.isArray(graphRecord.edges) ? graphRecord.edges : [];
  const edges = rawEdges
    .map((edge, index) => normalizeEdge(edge, index))
    .filter((edge): edge is BrainstormReasoningEdge => {
      return edge !== null && nodeIds.has(edge.source) && nodeIds.has(edge.target);
    });

  const fallbackQuestionTitle = input.fallbackQuestionTitle
    ? (truncate(input.fallbackQuestionTitle, 120) ?? input.fallbackQuestionTitle)
    : undefined;
  const questionNode: BrainstormReasoningNode | null =
    nodes.find(node => node.type === "question") ??
    (fallbackQuestionTitle
      ? {
          id: "central-question",
          type: "question" as const,
          title: fallbackQuestionTitle,
          status: "open" as const,
          order: 0,
          sourceRefs: [{ kind: "job", id: input.jobId }],
        }
      : null);
  const normalizedNodes = questionNode && !nodeIds.has(questionNode.id)
    ? [questionNode, ...nodes]
    : nodes;

  return {
    id: readString(graphRecord.id) ?? `brainstorm-graph-${input.jobId}-${input.stage}`,
    jobId: input.jobId,
    stage: input.stage,
    subStage: input.subStage ?? readString(graphRecord.subStage),
    centralQuestion: questionNode
      ? {
          id: questionNode.id,
          title: questionNode.title,
          body: questionNode.body,
          sourceRefs: questionNode.sourceRefs,
        }
      : undefined,
    nodes: normalizedNodes,
    edges,
    telemetry: asRecord(graphRecord.telemetry) ?? undefined,
    consoleLines: readConsoleLines(graphRecord.consoleLines),
    source: "llm",
    createdAt: input.createdAt,
  };
}

function readGraphPayload(payload: unknown): unknown {
  const record = asRecord(payload);
  if (!record) return null;
  return record.reasoningGraph ?? record.brainstormReasoningGraph ?? record.graph ?? null;
}

function normalizeNode(
  value: unknown,
  input: ParseBrainstormReasoningGraphInput,
  index: number
): BrainstormReasoningNode | null {
  const record = asRecord(value);
  if (!record) return null;
  const id = safeId(readString(record.id) ?? `node-${index + 1}`);
  const title = readString(record.title);
  if (!id || !title) return null;
  const type = oneOf(readString(record.type), NODE_TYPES) ?? "hypothesis";
  const status = oneOf(readString(record.status), NODE_STATUSES) ?? "active";

  return {
    id,
    type,
    title: truncate(title, 120) ?? title,
    body: truncate(readString(record.body), 240),
    roleId: truncate(readString(record.roleId), 96),
    roleLabel: truncate(readString(record.roleLabel), 96),
    status,
    confidence: readNumber(record.confidence),
    order: typeof record.order === "number" && Number.isFinite(record.order)
      ? record.order
      : index + 1,
    sourceRefs: [{ kind: "job", id: input.jobId }],
  };
}

function normalizeEdge(value: unknown, index: number): BrainstormReasoningEdge | null {
  const record = asRecord(value);
  if (!record) return null;
  const source = safeId(readString(record.source));
  const target = safeId(readString(record.target));
  if (!source || !target) return null;
  return {
    id: safeId(readString(record.id)) ?? `edge-${index + 1}`,
    source,
    target,
    type: oneOf(readString(record.type), EDGE_TYPES) ?? "refines",
    label: truncate(readString(record.label), 48),
    confidence: readNumber(record.confidence),
    sourceKind: "llm",
  };
}

function readConsoleLines(value: unknown): BrainstormGraphConsoleLine[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.slice(0, 8).flatMap((line, index) => {
    const record = asRecord(line);
    const text = truncate(readString(record?.text), 160);
    if (!record || !text) return [];
    return [{
      id: safeId(readString(record.id)) ?? `console-${index + 1}`,
      kind: oneOf(readString(record.kind), [
        "Ask",
        "Thinking",
        "Tool",
        "Observation",
        "Report",
        "System",
      ] as const) ?? "Thinking",
      text,
      roleId: truncate(readString(record.roleId), 96),
      timestamp: truncate(readString(record.timestamp), 64),
    }];
  });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function safeId(value: string | undefined): string | undefined {
  const normalized = value
    ?.trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return normalized && normalized.length > 0 ? normalized.slice(0, 96) : undefined;
}

function oneOf<T extends string>(
  value: string | undefined,
  options: readonly T[]
): T | undefined {
  return options.find(option => option === value);
}

function truncate(value: string | undefined, maxLength: number): string | undefined {
  return value && value.length > maxLength
    ? `${value.slice(0, maxLength - 3)}...`
    : value;
}
