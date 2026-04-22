import type { KnowledgeService } from "../../knowledge/knowledge-service.js";
import type {
  UnifiedKnowledgeResult,
  UnifiedQueryOptions,
} from "../../../shared/knowledge/types.js";

export type KnowledgeNodeType = "knowledge_qa";

export interface KnowledgeNodeInput {
  question?: string;
  projectId?: string;
  options?: Partial<UnifiedQueryOptions>;
}

export interface KnowledgeNodeExecutionRequest {
  nodeType: KnowledgeNodeType;
  input?: KnowledgeNodeInput;
}

export interface KnowledgeNodeExecutionResult {
  ok: true;
  nodeType: KnowledgeNodeType;
  output: {
    answer: string;
    reply: {
      role: "assistant";
      content: string;
    };
    evidence: {
      structuredEntityCount: number;
      relationCount: number;
      semanticHitCount: number;
    };
    result: UnifiedKnowledgeResult;
  };
}

function normalizeMode(value: unknown): UnifiedQueryOptions["mode"] {
  if (
    value === "preferStructured" ||
    value === "preferSemantic" ||
    value === "balanced"
  ) {
    return value;
  }
  return "balanced";
}

export function isKnowledgeNodeType(value: unknown): value is KnowledgeNodeType {
  return value === "knowledge_qa";
}

export async function executeKnowledgeNode(
  request: KnowledgeNodeExecutionRequest,
  deps: {
    knowledgeService: KnowledgeService;
  },
): Promise<KnowledgeNodeExecutionResult> {
  if (!isKnowledgeNodeType(request.nodeType)) {
    throw new Error("Unsupported knowledge node type.");
  }

  const input = request.input ?? {};
  const question =
    typeof input.question === "string" ? input.question.trim() : "";
  const projectId =
    typeof input.projectId === "string" ? input.projectId.trim() : "";

  if (!question) {
    throw new Error("Knowledge node input requires question.");
  }

  if (!projectId) {
    throw new Error("Knowledge node input requires projectId.");
  }

  const result = await deps.knowledgeService.query(question, projectId, {
    mode: normalizeMode(input.options?.mode),
  });

  const answer = result.mergedSummary;

  return {
    ok: true,
    nodeType: request.nodeType,
    output: {
      answer,
      reply: {
        role: "assistant",
        content: answer,
      },
      evidence: {
        structuredEntityCount: result.structuredResults.entities.length,
        relationCount: result.structuredResults.relations.length,
        semanticHitCount: result.semanticResults.length,
      },
      result,
    },
  };
}
