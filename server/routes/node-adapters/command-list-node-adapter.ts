import {
  COMMAND_LIST_NODE_TYPE,
  type CommandListCandidate,
  type CommandListCandidateInput,
  type CommandListEvent,
  type CommandListNodeExecutionRequest,
  type CommandListNodeExecutionResult,
  type CommandListSelectionRequest,
  type CommandListSelectionResult,
  type CommandListSelectionBridge,
  type CommandListSnapshot,
} from "../../../shared/nl-command/command-list.js";
import type { CommandPriority } from "../../../shared/nl-command/contracts.js";
import type { MissionDecision } from "../../../shared/mission/contracts.js";

export interface CommandListEventStore {
  append(event: CommandListEvent): void;
  listByListId(listId: string): CommandListEvent[];
}

export interface CommandListSnapshotStore {
  save(snapshot: CommandListSnapshot): void;
  get(listId: string): CommandListSnapshot | undefined;
}

export interface CommandListNodeAdapterDeps {
  eventStore?: CommandListEventStore;
  snapshotStore?: CommandListSnapshotStore;
}

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim();
  return normalized || undefined;
}

function ensureString(value: unknown, field: string): string {
  const normalized = normalizeString(value);
  if (!normalized) {
    throw new Error(`Command list node input requires ${field}.`);
  }
  return normalized;
}

function normalizePriority(value: unknown): CommandPriority {
  return value === "critical" || value === "high" || value === "low"
    ? value
    : "medium";
}

function normalizeLocale(value: unknown): "zh-CN" | "en-US" {
  return value === "en-US" ? "en-US" : "zh-CN";
}

function nowIso(): string {
  return new Date().toISOString();
}

function createEventId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function defaultCandidates(input: {
  commandText: string;
  userId: string;
  priority: CommandPriority;
  locale: "zh-CN" | "en-US";
}): CommandListCandidateInput[] {
  const locale = input.locale;
  const baseText = input.commandText.trim();
  return [
    {
      candidateId: "candidate-execute",
      label: locale === "zh-CN" ? "直接创建执行指令" : "Create execution command",
      commandText: baseText,
      description:
        locale === "zh-CN"
          ? "将当前需求直接送入 nl-command 指令中心。"
          : "Send the current request directly to the NL command center.",
      recommended: true,
      source: "nl-command",
    },
    {
      candidateId: "candidate-clarify",
      label: locale === "zh-CN" ? "先做澄清提问" : "Clarify first",
      commandText: `${baseText}\n\n${locale === "zh-CN" ? "先输出需要补充确认的问题。" : "First generate clarification questions."}`,
      description:
        locale === "zh-CN"
          ? "适合需求还不够明确、需要用户补充约束条件。"
          : "Use this when the request still needs user clarification.",
      recommended: false,
      source: "heuristic",
    },
    {
      candidateId: "candidate-plan",
      label: locale === "zh-CN" ? "先生成执行计划" : "Plan before execution",
      commandText: `${baseText}\n\n${locale === "zh-CN" ? "先生成执行计划和风险提示。" : "First produce an execution plan and risk notes."}`,
      description:
        locale === "zh-CN"
          ? "适合高风险或跨团队场景，先看计划再决定是否执行。"
          : "Use this for higher-risk or cross-team scenarios.",
      recommended: false,
      source: "heuristic",
    },
  ];
}

function normalizeCandidates(input: {
  candidates: CommandListCandidateInput[];
  userId: string;
  locale: "zh-CN" | "en-US";
  priority: CommandPriority;
}): CommandListCandidate[] {
  return input.candidates.map((candidate, index) => {
    const candidateId =
      normalizeString(candidate.candidateId) || `candidate-${index + 1}`;
    const label =
      normalizeString(candidate.label) ||
      normalizeString(candidate.commandText) ||
      candidateId;
    const commandText = ensureString(candidate.commandText, "candidates[].commandText");
    const description = normalizeString(candidate.description);
    const recommended = candidate.recommended === true;
    const source = candidate.source || "manual";

    const body = {
      commandText,
      userId: input.userId,
      priority: input.priority,
      locale: input.locale,
    };

    return {
      candidateId,
      label,
      commandText,
      ...(description ? { description } : {}),
      recommended,
      source,
      commandTarget: {
        method: "POST",
        href: "/api/nl-command/commands",
        body,
      },
      clarificationPreviewTarget: {
        method: "POST",
        href: "/api/nl-command/clarification-preview",
        body,
      },
    };
  });
}

function buildSelectionDecision(input: {
  listId: string;
  prompt: string;
  candidates: CommandListCandidate[];
}): MissionDecision {
  return {
    prompt: input.prompt,
    options: input.candidates.map(candidate => ({
      id: candidate.candidateId,
      label: candidate.label,
      description: candidate.description,
      action: "custom-action",
      severity: candidate.recommended ? "info" : "warn",
    })),
    allowFreeText: true,
    type: "multi-choice",
    decisionId: `${input.listId}:command-selection`,
    payload: {
      nodeType: "command_list",
      listId: input.listId,
      candidateCount: input.candidates.length,
      recommendedCandidateId:
        input.candidates.find(candidate => candidate.recommended)?.candidateId,
    },
  };
}

export function createInMemoryCommandListEventStore(): CommandListEventStore {
  const events: CommandListEvent[] = [];
  return {
    append(event) {
      events.push(structuredClone(event));
    },
    listByListId(listId) {
      return events
        .filter(event => event.listId === listId)
        .map(event => structuredClone(event));
    },
  };
}

export function createInMemoryCommandListSnapshotStore(): CommandListSnapshotStore {
  const snapshots = new Map<string, CommandListSnapshot>();
  return {
    save(snapshot) {
      snapshots.set(snapshot.listId, structuredClone(snapshot));
    },
    get(listId) {
      const snapshot = snapshots.get(listId);
      return snapshot ? structuredClone(snapshot) : undefined;
    },
  };
}

export function isCommandListNodeType(value: unknown): value is "command_list" {
  return value === COMMAND_LIST_NODE_TYPE;
}

export async function executeCommandListNode(
  request: CommandListNodeExecutionRequest,
  deps: CommandListNodeAdapterDeps = {},
): Promise<CommandListNodeExecutionResult> {
  if (!isCommandListNodeType(request.nodeType)) {
    throw new Error("Unsupported command_list node type.");
  }

  const input = request.input ?? {};
  const commandText = ensureString(input.commandText, "commandText");
  const userId = ensureString(input.userId, "userId");
  const locale = normalizeLocale(input.locale);
  const priority = normalizePriority(input.priority);
  const listId =
    normalizeString(input.listId) || `command-list-${Date.now()}`;
  const candidates = normalizeCandidates({
    candidates:
      Array.isArray(input.candidates) && input.candidates.length > 0
        ? input.candidates
        : defaultCandidates({ commandText, userId, priority, locale }),
    userId,
    locale,
    priority,
  });
  const prompt =
    normalizeString(input.prompt) ||
    (locale === "zh-CN"
      ? "请选择下一步要采用的命令动作"
      : "Choose the next command action");
  const selectionDecision = buildSelectionDecision({
    listId,
    prompt,
    candidates,
  });
  const recommendedCandidateId = candidates.find(candidate => candidate.recommended)?.candidateId;
  const selectionBridge: CommandListSelectionBridge = {
    nodeType: "selection" as const,
    decision: selectionDecision,
    ...(recommendedCandidateId
      ? {
          recommendedSubmission: {
            optionId: recommendedCandidateId,
            metadata: {
              nodeType: "command_list",
              interactionId: `${listId}:recommended`,
              formData: {
                recommendedCandidateId,
              },
            },
          },
        }
      : {}),
  };

  const snapshot: CommandListSnapshot = {
    listId,
    nodeType: COMMAND_LIST_NODE_TYPE,
    commandText,
    userId,
    locale,
    priority,
    generatedAt: nowIso(),
    candidates,
    ...(recommendedCandidateId ? { recommendedCandidateId } : {}),
    selectionBridge,
    ...(input.context && typeof input.context === "object" && !Array.isArray(input.context)
      ? { context: { ...input.context } }
      : {}),
  };

  deps.snapshotStore?.save(snapshot);

  const generatedEvent: CommandListEvent = {
    eventId: createEventId("cmdlist_generated"),
    listId,
    type: "generated",
    timestamp: Date.now(),
    userId,
    metadata: {
      candidateCount: candidates.length,
      recommendedCandidateId,
    },
  };
  deps.eventStore?.append(generatedEvent);

  return {
    ok: true,
    nodeType: COMMAND_LIST_NODE_TYPE,
    output: {
      status: "completed",
      commandList: snapshot,
      selectionBridge,
      generatedEvent,
    },
  };
}

export async function selectCommandListCandidate(
  request: CommandListSelectionRequest,
  deps: CommandListNodeAdapterDeps = {},
): Promise<CommandListSelectionResult> {
  const listId = ensureString(request.listId, "listId");
  const candidateId = ensureString(request.candidateId, "candidateId");
  const snapshot = deps.snapshotStore?.get(listId);
  if (!snapshot) {
    throw new Error(`Command list snapshot not found: ${listId}`);
  }

  const candidate = snapshot.candidates.find(item => item.candidateId === candidateId);
  if (!candidate) {
    throw new Error(`Command list candidate not found: ${candidateId}`);
  }

  const event: CommandListEvent = {
    eventId: createEventId("cmdlist_selected"),
    listId,
    type: "selected",
    timestamp: Date.now(),
    userId: snapshot.userId,
    candidateId: candidate.candidateId,
    candidateLabel: candidate.label,
    commandText: candidate.commandText,
    submittedBy: normalizeString(request.submittedBy),
    metadata: request.metadata ? structuredClone(request.metadata) : undefined,
  };
  deps.eventStore?.append(event);

  return {
    ok: true,
    listId,
    selection: {
      optionId: candidate.candidateId,
      commandText: candidate.commandText,
      label: candidate.label,
      metadata: {
        nodeType: "command_list",
        interactionId: `${listId}:selection`,
        branchKey: candidate.candidateId,
        formData: {
          selectedCandidateId: candidate.candidateId,
        },
      },
    },
    event,
  };
}
