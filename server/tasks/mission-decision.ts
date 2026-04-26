import type {
  DecisionHistoryEntry,
  DecisionType,
  MissionDecisionResolved,
  MissionDecisionSubmission,
  MissionRecord,
  WebAigcHitlAttachmentValue,
  WebAigcHitlFieldValue,
} from '../../shared/mission/contracts.js';
import {
  normalizeWebAigcHitlFormData,
  readWebAigcHitlFieldDefinitions,
} from '../../shared/mission/contracts.js';
import type { LineageCollectorLike } from '../../shared/runtime-agent.js';

// ─── Lineage Collector Integration (module-level, opt-in) ──────────────────

let _decisionLineageCollector: LineageCollectorLike | null = null;

export function setDecisionLineageCollector(collector: LineageCollectorLike | null): void {
  _decisionLineageCollector = collector;
}

export function getDecisionLineageCollector(): LineageCollectorLike | null {
  return _decisionLineageCollector;
}

export function generateDecisionId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 6);
  return `dec_${timestamp}_${random}`;
}

export interface MissionDecisionRuntime {
  getTask(id: string): MissionRecord | undefined;
  resumeMissionFromDecision(
    id: string,
    submission: {
      detail: string;
      progress?: number;
      historyEntry?: DecisionHistoryEntry;
    }
  ): MissionRecord | undefined;
}

export interface SubmitMissionDecisionOptions {
  idempotentIfNotWaiting?: boolean;
}

export interface MissionDecisionSuccess {
  ok: true;
  task: MissionRecord;
  decision: MissionDecisionResolved;
  detail: string;
  alreadyResolved?: boolean;
}

export interface MissionDecisionFailure {
  ok: false;
  statusCode: number;
  error: string;
}

export function formatMissionDecisionDetail(
  optionLabel: string | undefined,
  freeText: string | undefined
): string {
  if (optionLabel && freeText) {
    return `Decision received: ${optionLabel} - ${freeText}`;
  }
  if (optionLabel) return `Decision received: ${optionLabel}`;
  if (freeText) return `Decision received: ${freeText}`;
  return 'Decision received';
}

export function describeMissionDecisionAlreadyProcessed(
  task: MissionRecord,
  decision: MissionDecisionResolved
): string {
  const selected = decision.optionLabel || decision.freeText || decision.optionId;
  if (task.status === 'done') {
    return selected
      ? `Decision already processed (${selected}); mission is complete`
      : 'Decision already processed; mission is complete';
  }
  if (task.status === 'failed') {
    return selected
      ? `Decision already processed (${selected}); mission has ended`
      : 'Decision already processed; mission has ended';
  }
  return selected
    ? `Decision already processed (${selected}); mission has resumed`
    : 'Decision already processed; mission has resumed';
}

export function describeMissionDecisionTimedOut(task: MissionRecord): string {
  const timeoutAt = task.waitingTimedOutAt ?? task.decision?.timeoutAt;
  if (typeof timeoutAt === 'number' && Number.isFinite(timeoutAt)) {
    return `Decision window timed out at ${new Date(timeoutAt).toISOString()}`;
  }
  return 'Decision window timed out';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function includesRouteSelectionHint(value: string | undefined): boolean {
  const raw = value?.trim() || '';
  if (!raw) return false;

  const normalized = raw.toLowerCase();
  return (
    normalized.includes('route') ||
    normalized.includes('path') ||
    raw.includes('路线') ||
    raw.includes('路径') ||
    raw.includes('路由') ||
    raw.includes('改线')
  );
}

function isRouteSelectionDecision(task: MissionRecord): boolean {
  const payload = task.decision?.payload;
  if (isRecord(payload)) {
    if (Array.isArray(payload.candidateRoutes) || Array.isArray(payload.routeIds)) {
      return true;
    }
    if (
      typeof payload.recommendedRouteId === 'string' ||
      typeof payload.selectedRouteId === 'string' ||
      isRecord(payload.routeMap)
    ) {
      return true;
    }
  }

  return (
    includesRouteSelectionHint(task.decision?.prompt) ||
    includesRouteSelectionHint(task.waitingFor)
  );
}

function resolveRouteSelectionId(
  payload: Record<string, unknown> | undefined,
  optionId: string,
  optionLabel: string | undefined,
): string | undefined {
  if (!payload) return undefined;

  const routeMap = payload.routeMap;
  if (isRecord(routeMap)) {
    const mappedRouteId = routeMap[optionId];
    if (typeof mappedRouteId === 'string' && mappedRouteId.trim()) {
      return mappedRouteId.trim();
    }
  }

  const candidateRoutes = Array.isArray(payload.candidateRoutes)
    ? payload.candidateRoutes
    : [];

  for (const candidate of candidateRoutes) {
    if (!isRecord(candidate)) continue;

    const candidateOptionId =
      typeof candidate.optionId === 'string'
        ? candidate.optionId.trim()
        : typeof candidate.optionValue === 'string'
          ? candidate.optionValue.trim()
          : undefined;
    const candidateLabel =
      typeof candidate.optionLabel === 'string'
        ? candidate.optionLabel.trim()
        : typeof candidate.label === 'string'
          ? candidate.label.trim()
          : undefined;
    const candidateRouteId =
      typeof candidate.routeId === 'string'
        ? candidate.routeId.trim()
        : typeof candidate.id === 'string'
          ? candidate.id.trim()
          : typeof candidate.value === 'string'
            ? candidate.value.trim()
            : undefined;

    if (!candidateRouteId) continue;
    if (candidateOptionId && candidateOptionId === optionId) {
      return candidateRouteId;
    }
    if (optionLabel && candidateLabel && candidateLabel === optionLabel) {
      return candidateRouteId;
    }
  }

  return undefined;
}

function resolveRecommendedRouteId(
  payload: Record<string, unknown> | undefined,
): string | undefined {
  if (!payload) return undefined;

  if (typeof payload.recommendedRouteId === 'string' && payload.recommendedRouteId.trim()) {
    return payload.recommendedRouteId.trim();
  }

  const candidateRoutes = Array.isArray(payload.candidateRoutes)
    ? payload.candidateRoutes
    : [];

  for (const candidate of candidateRoutes) {
    if (!isRecord(candidate) || candidate.recommended !== true) continue;

    const candidateRouteId =
      typeof candidate.routeId === 'string'
        ? candidate.routeId.trim()
        : typeof candidate.id === 'string'
          ? candidate.id.trim()
          : typeof candidate.value === 'string'
            ? candidate.value.trim()
            : undefined;

    if (candidateRouteId) {
      return candidateRouteId;
    }
  }

  return undefined;
}

function enrichRouteSelectionMetadata(
  task: MissionRecord,
  metadata: MissionDecisionSubmission['metadata'] | undefined,
  optionId: string | undefined,
  optionLabel: string | undefined,
  freeText: string | undefined,
): MissionDecisionSubmission['metadata'] | undefined {
  if (!optionId || !isRouteSelectionDecision(task)) {
    return metadata;
  }

  // Keep route-choice semantics inside formData so we can preserve them in
  // resolved/history without widening the shared submission metadata contract.
  const formData: Record<string, WebAigcHitlFieldValue> = {
    ...(metadata?.formData ?? {}),
    selectedRouteOptionId: optionId,
  };

  if (optionLabel) {
    formData.selectedRouteLabel = optionLabel;
  }

  const payload = isRecord(task.decision?.payload) ? task.decision.payload : undefined;
  const selectedRouteId = resolveRouteSelectionId(
    payload,
    optionId,
    optionLabel,
  );
  if (selectedRouteId) {
    formData.selectedRouteId = selectedRouteId;
  }

  const recommendedRouteId = resolveRecommendedRouteId(payload);
  if (recommendedRouteId) {
    formData.recommendedRouteId = recommendedRouteId;
  }

  if (freeText) {
    formData.changedReason = freeText;
  }

  if (
    selectedRouteId &&
    recommendedRouteId &&
    selectedRouteId !== recommendedRouteId
  ) {
    formData.replanRequested = true;
  }

  return {
    ...metadata,
    formData,
  };
}

export function submitMissionDecision(
  runtime: MissionDecisionRuntime,
  taskId: string,
  request: MissionDecisionSubmission,
  options: SubmitMissionDecisionOptions = {}
): MissionDecisionSuccess | MissionDecisionFailure {
  const task = runtime.getTask(taskId);
  if (!task) {
    return {
      ok: false,
      statusCode: 404,
      error: 'Task not found',
    };
  }

  const optionId = request.optionId?.trim() || undefined;
  const freeText = request.freeText?.trim() || undefined;
  const submittedBy = request.submittedBy?.trim() || undefined;
  const metadata = request.metadata;
  const prompt = task.decision;
  const fieldDefinitions = readWebAigcHitlFieldDefinitions(prompt?.payload);
  const normalizedFormData =
    metadata?.nodeType === 'param_collection' && fieldDefinitions.length > 0
      ? normalizeWebAigcHitlFormData(fieldDefinitions, metadata?.formData)
      : null;

  if (normalizedFormData && normalizedFormData.errors.length > 0) {
    return {
      ok: false,
      statusCode: 400,
      error: normalizedFormData.errors[0] || 'Invalid param_collection form data',
    };
  }

  const normalizedMetadata =
    metadata && normalizedFormData
      ? {
          ...metadata,
          formData: normalizedFormData.value,
        }
      : metadata;

  const decision: MissionDecisionResolved = {
    optionId,
    freeText,
    metadata: normalizedMetadata,
  };

  if (task.status !== 'waiting') {
    if (task.waitingTimedOutAt) {
      return {
        ok: false,
        statusCode: 409,
        error: describeMissionDecisionTimedOut(task),
      };
    }

    if (!options.idempotentIfNotWaiting) {
      return {
        ok: false,
        statusCode: 409,
        error: 'Task is not waiting for a decision',
      };
    }

    return {
      ok: true,
      task,
      decision,
      detail: describeMissionDecisionAlreadyProcessed(task, decision),
      alreadyResolved: true,
    };
  }

  if (typeof prompt?.timeoutAt === 'number' && prompt.timeoutAt <= Date.now()) {
    return {
      ok: false,
      statusCode: 409,
      error: describeMissionDecisionTimedOut(task),
    };
  }
  const selectedOption = optionId
    ? prompt?.options.find(option => option.id === optionId)
    : undefined;

  if (optionId && !selectedOption) {
    return {
      ok: false,
      statusCode: 400,
      error: 'Invalid decision option',
    };
  }

  if (selectedOption?.requiresComment && !freeText) {
    return {
      ok: false,
      statusCode: 400,
      error: 'This option requires a comment',
    };
  }

  if (!optionId && !freeText) {
    return {
      ok: false,
      statusCode: 400,
      error: 'optionId or freeText is required',
    };
  }

  if (freeText && prompt && prompt.allowFreeText !== true && !optionId) {
    return {
      ok: false,
      statusCode: 400,
      error: 'This decision does not allow free text only submissions',
    };
  }

  if (freeText && prompt && prompt.allowFreeText !== true && optionId && !selectedOption?.requiresComment) {
    return {
      ok: false,
      statusCode: 400,
      error: 'This decision does not allow free text notes',
    };
  }

  const resolvedDecision: MissionDecisionResolved = {
    optionId: selectedOption?.id,
    optionLabel: selectedOption?.label,
    freeText,
    metadata: enrichRouteSelectionMetadata(
      task,
      normalizedMetadata,
      selectedOption?.id,
      selectedOption?.label,
      freeText,
    ),
  };

  const normalizedFormDataSummary = Object.fromEntries(
    Object.entries(resolvedDecision.metadata?.formData ?? {}).map(([key, value]) => [
      key,
      typeof value === 'object' && value !== null && 'kind' in value
        ? {
            kind: (value as WebAigcHitlAttachmentValue).kind,
            ref: (value as WebAigcHitlAttachmentValue).ref,
            name: (value as WebAigcHitlAttachmentValue).name,
            url: (value as WebAigcHitlAttachmentValue).url,
            mimeType: (value as WebAigcHitlAttachmentValue).mimeType,
            size: (value as WebAigcHitlAttachmentValue).size,
            source: (value as WebAigcHitlAttachmentValue).source,
          }
        : (value as WebAigcHitlFieldValue),
    ]),
  );

  const detail =
    request.detail?.trim() ||
    formatMissionDecisionDetail(selectedOption?.label, freeText);

  // Build DecisionHistoryEntry and persist it through the runtime/store update.
  const historyEntry: DecisionHistoryEntry = {
    decisionId: prompt?.decisionId || generateDecisionId(),
    type: (prompt?.type ?? 'custom-action') as DecisionType,
    prompt: prompt?.prompt ?? '',
    options: prompt?.options ?? [],
    templateId: prompt?.templateId,
    payload: prompt?.payload,
    resolved: resolvedDecision,
    submittedBy,
    submittedAt: Date.now(),
    reason: freeText,
    stageKey: task.currentStageKey,
    nodeId: normalizedMetadata?.nodeId,
    sessionId: normalizedMetadata?.sessionId,
    nodeType: normalizedMetadata?.nodeType,
    interactionId: normalizedMetadata?.interactionId,
    branchKey: normalizedMetadata?.branchKey,
  };

  const updated = runtime.resumeMissionFromDecision(task.id, {
    detail,
    progress: request.progress ?? task.progress,
    historyEntry,
  });

  if (!updated) {
    return {
      ok: false,
      statusCode: 409,
      error: 'Task decision could not be applied',
    };
  }

  // Lineage hook: record decision lineage after successful submission
  try {
    const collector = _decisionLineageCollector;
    if (collector?.recordDecision) {
      collector.recordDecision({
        decisionId: historyEntry.decisionId,
        agentId: undefined,
        inputLineageIds: [],
        result: optionId ?? freeText ?? 'unknown',
        context: { missionId: taskId },
        metadata: {
          optionId,
          optionLabel: selectedOption?.label,
          freeText,
          type: historyEntry.type,
          sessionId: normalizedMetadata?.sessionId,
          nodeType: normalizedMetadata?.nodeType,
          interactionId: normalizedMetadata?.interactionId,
          branchKey: normalizedMetadata?.branchKey,
          formData: normalizedFormDataSummary,
        },
      });
    }
  } catch {
    // Graceful degradation: lineage failure must not affect decision submission
  }

  return {
    ok: true,
    task: updated,
    detail,
    decision: resolvedDecision,
  };
}
