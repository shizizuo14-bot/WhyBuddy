import type { MissionRecord } from "./contracts.js";

export interface MissionProjectionLinks {
  workflowId?: string;
  instanceId?: string;
  sessionId?: string;
  replayId?: string;
  sourceApp?: string;
}

interface ResolveMissionProjectionInput {
  mission?: Pick<MissionRecord, "topicId" | "projection">;
  workflowId?: string;
  workflowInput?: {
    sourceApp?: unknown;
    sessionId?: unknown;
    projection?: unknown;
  } | null;
  replayId?: string;
}

function normalizeProjectionValue(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized || undefined;
}

export function normalizeMissionProjectionLinks(
  value: unknown
): MissionProjectionLinks | undefined {
  if (!value || typeof value !== "object") return undefined;

  const candidate = value as Partial<MissionProjectionLinks>;
  const workflowId = normalizeProjectionValue(candidate.workflowId);
  const instanceId = normalizeProjectionValue(candidate.instanceId);
  const sessionId = normalizeProjectionValue(candidate.sessionId);
  const replayId = normalizeProjectionValue(candidate.replayId);
  const sourceApp = normalizeProjectionValue(candidate.sourceApp);

  if (!workflowId && !instanceId && !sessionId && !replayId && !sourceApp) {
    return undefined;
  }

  return {
    ...(workflowId ? { workflowId } : {}),
    ...(instanceId ? { instanceId } : {}),
    ...(sessionId ? { sessionId } : {}),
    ...(replayId ? { replayId } : {}),
    ...(sourceApp ? { sourceApp } : {}),
  };
}

export function mergeMissionProjectionLinks(
  current: MissionProjectionLinks | undefined,
  patch: Partial<MissionProjectionLinks> | undefined
): MissionProjectionLinks | undefined {
  const normalizedCurrent = normalizeMissionProjectionLinks(current);
  const normalizedPatch = normalizeMissionProjectionLinks(patch);

  if (!normalizedCurrent && !normalizedPatch) {
    return undefined;
  }

  return normalizeMissionProjectionLinks({
    ...(normalizedCurrent || {}),
    ...(normalizedPatch || {}),
  });
}

export function resolveMissionProjectionLinks(
  input: ResolveMissionProjectionInput
): MissionProjectionLinks {
  const workflowProjection = normalizeMissionProjectionLinks(
    input.workflowInput?.projection
  );
  const merged = mergeMissionProjectionLinks(
    mergeMissionProjectionLinks(workflowProjection, input.mission?.projection),
    {
      workflowId: input.workflowId,
      replayId: input.replayId,
      sessionId: normalizeProjectionValue(input.workflowInput?.sessionId),
      sourceApp: normalizeProjectionValue(input.workflowInput?.sourceApp),
    }
  );

  const workflowId = merged?.workflowId ?? normalizeProjectionValue(input.workflowId);
  const sessionId =
    merged?.sessionId ??
    normalizeProjectionValue(input.workflowInput?.sessionId) ??
    input.mission?.topicId ??
    workflowId;

  return {
    ...(workflowId ? { workflowId } : {}),
    ...(merged?.instanceId || workflowId
      ? { instanceId: merged?.instanceId ?? workflowId }
      : {}),
    ...(sessionId ? { sessionId } : {}),
    ...(merged?.replayId || input.replayId || workflowId
      ? { replayId: merged?.replayId ?? input.replayId ?? workflowId }
      : {}),
    ...(merged?.sourceApp ? { sourceApp: merged.sourceApp } : {}),
  };
}
