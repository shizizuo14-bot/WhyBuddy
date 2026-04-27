export type FrontendAutopilotLayer = "draft" | "planning" | "projection";

export type FrontendAutopilotDestinationLockState =
  | "unconfirmed"
  | "locked"
  | "modified"
  | "needs-reconfirm";

export type FrontendAutopilotDraftStatus =
  | "empty"
  | "editing"
  | "ready"
  | "blocked";

export type FrontendAutopilotPlanningStatus =
  | "idle"
  | "planning"
  | "route-ready"
  | "locked"
  | "replanning";

export type FrontendAutopilotProjectionStatus =
  | "missing"
  | "pending"
  | "active"
  | "waiting"
  | "blocked"
  | "done";

export type FrontendAutopilotRouteImpactKind =
  | "none"
  | "route-replan"
  | "route-lock-risk"
  | "route-confirmation";

export interface FrontendAutopilotRouteImpactView {
  kind: FrontendAutopilotRouteImpactKind;
  summary: string | null;
  fromRouteId: string | null;
  toRouteId: string | null;
  affectedStageCount: number | null;
  requiresConfirmation: boolean;
}

export interface FrontendAutopilotDraftState {
  layer: "draft";
  status: FrontendAutopilotDraftStatus;
  destinationText: string;
  lockedDestinationText: string | null;
  lockState: FrontendAutopilotDestinationLockState;
  destinationChangedAfterLock: boolean;
  routeImpact: FrontendAutopilotRouteImpactView | null;
  attachments: string[];
  missingFields: string[];
  confirmedAt: string | null;
  modifiedAt: string | null;
  updatedAt: string | null;
}

export interface FrontendAutopilotRouteCandidateView {
  id: string;
  label: string;
  selected: boolean;
  locked: boolean;
  reason: string | null;
}

export interface FrontendAutopilotPlanningState {
  layer: "planning";
  status: FrontendAutopilotPlanningStatus;
  candidates: FrontendAutopilotRouteCandidateView[];
  selectedRouteId: string | null;
  lockedRouteId: string | null;
  replanReason: string | null;
  replanNeeded: boolean;
  routeImpact: FrontendAutopilotRouteImpactView | null;
  warnings: string[];
  updatedAt: string | null;
}

export interface FrontendAutopilotProjectionState {
  layer: "projection";
  status: FrontendAutopilotProjectionStatus;
  taskId: string | null;
  selectedRouteId: string | null;
  progressPercent: number;
  currentStep: string | null;
  waitingFor: string | null;
  updatedAt: string | null;
}

export interface FrontendAutopilotViewModel {
  draft: FrontendAutopilotDraftState;
  planning: FrontendAutopilotPlanningState;
  projection: FrontendAutopilotProjectionState;
  selectedRouteId: string | null;
  sourceLayer: FrontendAutopilotLayer;
  replanNeeded: boolean;
  routeImpact: FrontendAutopilotRouteImpactView | null;
  warnings: string[];
}

export interface FrontendAutopilotDraftInput {
  destinationText?: unknown;
  lockedDestinationText?: unknown;
  confirmedDestinationText?: unknown;
  originalDestinationText?: unknown;
  lockedText?: unknown;
  lockState?: unknown;
  confirmedAt?: unknown;
  lockedAt?: unknown;
  modifiedAt?: unknown;
  routeImpact?: unknown;
  attachments?: unknown;
  missingFields?: unknown;
  status?: unknown;
  updatedAt?: unknown;
}

export interface FrontendAutopilotPlanningInput {
  candidates?: unknown;
  selectedRouteId?: unknown;
  selectedCandidateId?: unknown;
  lockedRouteId?: unknown;
  status?: unknown;
  replanReason?: unknown;
  replanNeeded?: unknown;
  routeImpact?: unknown;
  warnings?: unknown;
  updatedAt?: unknown;
}

export interface FrontendAutopilotProjectionInput {
  taskId?: unknown;
  selectedRouteId?: unknown;
  routeId?: unknown;
  status?: unknown;
  progressPercent?: unknown;
  progress?: unknown;
  currentStep?: unknown;
  waitingFor?: unknown;
  updatedAt?: unknown;
}

export interface FrontendAutopilotViewModelInput {
  draft?: FrontendAutopilotDraftInput | null;
  planning?: FrontendAutopilotPlanningInput | null;
  projection?: FrontendAutopilotProjectionInput | null;
}

export interface FrontendAutopilotSpecProgress {
  slug: string;
  done: number;
  total: number;
  expectedTotal: number;
  missing: boolean;
  percent: number;
}

export interface FrontendAutopilotProgressSummary {
  done: number;
  total: number;
  expectedTotal: number;
  percent: number;
  completedSpecs: number;
  totalSpecs: number;
  specs: FrontendAutopilotSpecProgress[];
}

export const FRONTEND_AUTOPILOT_PROGRESS_SPECS = [
  "autopilot-cockpit-three-column-layout",
  "autopilot-destination-card-and-goal-lock",
  "autopilot-drive-state-timeline-and-replan",
  "autopilot-empty-state-and-onboarding",
  "autopilot-evidence-driving-recorder",
  "autopilot-fleet-live-visualization",
  "autopilot-frontend-state-model-and-store",
  "autopilot-launch-destination-input",
  "autopilot-mobile-and-responsive-cockpit",
  "autopilot-route-planning-overlay",
  "autopilot-takeover-control-panel",
  "autopilot-visual-language-and-motion-system",
] as const;

export const FRONTEND_AUTOPILOT_TASKS_PER_SPEC = 12;

const CHECKED_TASK_PATTERN = /-\s*\[x\]/gi;
const TASK_PATTERN = /-\s*\[[ x]\]/gi;

function readText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readBoolean(value: unknown, fallback = false): boolean {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return fallback;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(value.map(readText).filter((item): item is string => item !== null))
  );
}

function readPercent(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number.NaN;
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function readPositiveInteger(value: unknown): number | null {
  const numeric = typeof value === "number" ? value : Number.NaN;
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return Math.round(numeric);
}

function readDestinationLockState(
  value: unknown
): FrontendAutopilotDestinationLockState | null {
  return value === "locked" ||
    value === "modified" ||
    value === "needs-reconfirm" ||
    value === "unconfirmed"
    ? value
    : null;
}

function readRouteImpactKind(
  value: unknown
): FrontendAutopilotRouteImpactKind | null {
  return value === "route-replan" ||
    value === "route-lock-risk" ||
    value === "route-confirmation" ||
    value === "none"
    ? value
    : null;
}

function readDraftStatus(value: unknown): FrontendAutopilotDraftStatus {
  return value === "editing" ||
    value === "ready" ||
    value === "blocked" ||
    value === "empty"
    ? value
    : "empty";
}

function readPlanningStatus(value: unknown): FrontendAutopilotPlanningStatus {
  return value === "planning" ||
    value === "route-ready" ||
    value === "locked" ||
    value === "replanning" ||
    value === "idle"
    ? value
    : "idle";
}

function readProjectionStatus(
  value: unknown
): FrontendAutopilotProjectionStatus {
  return value === "pending" ||
    value === "active" ||
    value === "waiting" ||
    value === "blocked" ||
    value === "done" ||
    value === "missing"
    ? value
    : "missing";
}

function readCandidate(
  value: unknown
): FrontendAutopilotRouteCandidateView | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const id = readText(record.id);
  if (!id) return null;
  return {
    id,
    label: readText(record.label) ?? id,
    selected: record.selected === true,
    locked: record.locked === true,
    reason: readText(record.reason),
  };
}

function readRouteImpact(
  value: unknown
): FrontendAutopilotRouteImpactView | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const kind = readRouteImpactKind(record.kind);
  if (!kind || kind === "none") return null;

  return {
    kind,
    summary: readText(record.summary),
    fromRouteId: readText(record.fromRouteId),
    toRouteId: readText(record.toRouteId),
    affectedStageCount: readPositiveInteger(record.affectedStageCount),
    requiresConfirmation: readBoolean(record.requiresConfirmation, false),
  };
}

function normalizeDestinationForComparison(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function destinationChangedAfterLock(
  destinationText: string,
  lockedDestinationText: string | null
): boolean {
  if (!destinationText || !lockedDestinationText) return false;
  return (
    normalizeDestinationForComparison(destinationText) !==
    normalizeDestinationForComparison(lockedDestinationText)
  );
}

function routeImpactRequiresReplan(
  impact: FrontendAutopilotRouteImpactView | null
): boolean {
  return impact?.kind === "route-replan";
}

function routeImpactSummary(impact: FrontendAutopilotRouteImpactView): string {
  if (impact.summary) return impact.summary;
  if (impact.kind === "route-replan") {
    return "Destination change requires route replanning before continuing.";
  }
  if (impact.kind === "route-lock-risk") {
    return "Destination lock may affect the selected route.";
  }
  return "Route confirmation is needed after the destination update.";
}

function buildDestinationChangeRouteImpact(
  routeId: string
): FrontendAutopilotRouteImpactView {
  return {
    kind: "route-replan",
    summary:
      "Destination changed after route lock; route replan is needed before continuing.",
    fromRouteId: routeId,
    toRouteId: null,
    affectedStageCount: null,
    requiresConfirmation: true,
  };
}

function warningForRouteImpact(
  impact: FrontendAutopilotRouteImpactView
): string | null {
  if (impact.kind === "route-replan") {
    return routeImpactSummary(impact);
  }
  if (impact.requiresConfirmation) {
    return routeImpactSummary(impact);
  }
  return null;
}

export function normalizeFrontendAutopilotDraft(
  input: FrontendAutopilotDraftInput | null | undefined
): FrontendAutopilotDraftState {
  const destinationText = readText(input?.destinationText) ?? "";
  const lockedDestinationText =
    readText(input?.lockedDestinationText) ??
    readText(input?.confirmedDestinationText) ??
    readText(input?.originalDestinationText) ??
    readText(input?.lockedText);
  const missingFields = readStringArray(input?.missingFields);
  const changedAfterLock = destinationChangedAfterLock(
    destinationText,
    lockedDestinationText
  );
  const confirmedAt = readText(input?.confirmedAt) ?? readText(input?.lockedAt);
  const modifiedAt = readText(input?.modifiedAt);
  const routeImpact = readRouteImpact(input?.routeImpact);
  const lockState =
    readDestinationLockState(input?.lockState) ??
    (changedAfterLock
      ? "modified"
      : missingFields.length > 0
        ? "needs-reconfirm"
        : lockedDestinationText || confirmedAt
          ? "locked"
          : "unconfirmed");
  const status =
    input?.status === undefined
      ? destinationText
        ? "editing"
        : "empty"
      : readDraftStatus(input.status);

  return {
    layer: "draft",
    status,
    destinationText,
    lockedDestinationText,
    lockState,
    destinationChangedAfterLock: changedAfterLock,
    routeImpact,
    attachments: readStringArray(input?.attachments),
    missingFields,
    confirmedAt,
    modifiedAt,
    updatedAt: readText(input?.updatedAt),
  };
}

export function normalizeFrontendAutopilotPlanning(
  input: FrontendAutopilotPlanningInput | null | undefined
): FrontendAutopilotPlanningState {
  const candidates = Array.isArray(input?.candidates)
    ? input.candidates
        .map(readCandidate)
        .filter(
          (candidate): candidate is FrontendAutopilotRouteCandidateView =>
            candidate !== null
        )
    : [];
  const selectedRouteId =
    readText(input?.selectedRouteId) ??
    readText(input?.selectedCandidateId) ??
    candidates.find(candidate => candidate.selected)?.id ??
    null;
  const lockedRouteId =
    readText(input?.lockedRouteId) ??
    candidates.find(candidate => candidate.locked)?.id ??
    null;
  const routeImpact = readRouteImpact(input?.routeImpact);
  const replanNeeded =
    readBoolean(input?.replanNeeded, false) ||
    Boolean(readText(input?.replanReason)) ||
    routeImpactRequiresReplan(routeImpact);

  return {
    layer: "planning",
    status:
      input?.status === undefined
        ? lockedRouteId
          ? "locked"
          : selectedRouteId
            ? "route-ready"
            : "idle"
        : readPlanningStatus(input.status),
    candidates: candidates.map(candidate => ({
      ...candidate,
      selected: candidate.id === selectedRouteId || candidate.selected,
      locked: candidate.id === lockedRouteId || candidate.locked,
    })),
    selectedRouteId,
    lockedRouteId,
    replanReason: readText(input?.replanReason),
    replanNeeded,
    routeImpact,
    warnings: readStringArray(input?.warnings),
    updatedAt: readText(input?.updatedAt),
  };
}

function derivePlanningReplanState(
  draft: FrontendAutopilotDraftState,
  planning: FrontendAutopilotPlanningState
): FrontendAutopilotPlanningState {
  const routeId = planning.lockedRouteId ?? planning.selectedRouteId;
  const derivedImpact =
    planning.routeImpact ??
    draft.routeImpact ??
    (draft.destinationChangedAfterLock && planning.lockedRouteId
      ? buildDestinationChangeRouteImpact(planning.lockedRouteId)
      : null);
  const replanNeeded =
    planning.replanNeeded || routeImpactRequiresReplan(derivedImpact);
  const impactWarning = derivedImpact
    ? warningForRouteImpact(derivedImpact)
    : null;
  const warnings = Array.from(
    new Set(
      [
        ...planning.warnings,
        ...(impactWarning && routeId ? [impactWarning] : []),
      ].filter((item): item is string => Boolean(item))
    )
  );

  return {
    ...planning,
    status:
      replanNeeded && planning.status !== "replanning"
        ? "replanning"
        : planning.status,
    replanNeeded,
    routeImpact: derivedImpact,
    replanReason:
      planning.replanReason ??
      (derivedImpact ? routeImpactSummary(derivedImpact) : null),
    warnings,
  };
}

export function normalizeFrontendAutopilotProjection(
  input: FrontendAutopilotProjectionInput | null | undefined,
  planning?: FrontendAutopilotPlanningState
): FrontendAutopilotProjectionState {
  const selectedRouteId =
    readText(input?.selectedRouteId) ??
    readText(input?.routeId) ??
    planning?.lockedRouteId ??
    planning?.selectedRouteId ??
    null;
  const progressSource =
    typeof input?.progressPercent === "number"
      ? input.progressPercent
      : input?.progress;

  return {
    layer: "projection",
    status:
      input?.status === undefined
        ? input?.taskId
          ? "pending"
          : "missing"
        : readProjectionStatus(input.status),
    taskId: readText(input?.taskId),
    selectedRouteId,
    progressPercent: readPercent(progressSource),
    currentStep: readText(input?.currentStep),
    waitingFor: readText(input?.waitingFor),
    updatedAt: readText(input?.updatedAt),
  };
}

export function normalizeFrontendAutopilotViewModel(
  input: FrontendAutopilotViewModelInput
): FrontendAutopilotViewModel {
  const draft = normalizeFrontendAutopilotDraft(input.draft);
  const planning = derivePlanningReplanState(
    draft,
    normalizeFrontendAutopilotPlanning(input.planning)
  );
  const projection = normalizeFrontendAutopilotProjection(
    input.projection,
    planning
  );
  const selectedRouteId =
    projection.selectedRouteId ??
    planning.lockedRouteId ??
    planning.selectedRouteId;
  const hasProjectionHandoff =
    projection.taskId !== null || projection.status !== "missing";
  const sourceLayer: FrontendAutopilotLayer = hasProjectionHandoff
    ? "projection"
    : planning.lockedRouteId || planning.selectedRouteId
      ? "planning"
      : "draft";

  return {
    draft,
    planning,
    projection,
    selectedRouteId,
    sourceLayer,
    replanNeeded: planning.replanNeeded,
    routeImpact: planning.routeImpact ?? draft.routeImpact,
    warnings: planning.warnings,
  };
}

export function summarizeFrontendAutopilotProgress(
  taskFiles: ReadonlyMap<string, string> | Record<string, string>,
  specs: readonly string[] = FRONTEND_AUTOPILOT_PROGRESS_SPECS,
  expectedTasksPerSpec = FRONTEND_AUTOPILOT_TASKS_PER_SPEC
): FrontendAutopilotProgressSummary {
  const readFile = (slug: string): string | undefined =>
    typeof (taskFiles as ReadonlyMap<string, string>).get === "function"
      ? (taskFiles as ReadonlyMap<string, string>).get(slug)
      : (taskFiles as Record<string, string>)[slug];

  const specProgress = specs.map(slug => {
    const content = readFile(slug);
    const done = content
      ? (content.match(CHECKED_TASK_PATTERN) ?? []).length
      : 0;
    const foundTotal = content ? (content.match(TASK_PATTERN) ?? []).length : 0;
    const total = Math.max(foundTotal, expectedTasksPerSpec);
    return {
      slug,
      done,
      total,
      expectedTotal: expectedTasksPerSpec,
      missing: content === undefined,
      percent: total === 0 ? 0 : Math.round((done / total) * 100),
    };
  });
  const done = specProgress.reduce((sum, spec) => sum + spec.done, 0);
  const total = specProgress.reduce((sum, spec) => sum + spec.total, 0);
  const expectedTotal = specs.length * expectedTasksPerSpec;

  return {
    done,
    total,
    expectedTotal,
    percent: total === 0 ? 0 : Math.round((done / total) * 100),
    completedSpecs: specProgress.filter(spec => spec.done >= spec.total).length,
    totalSpecs: specs.length,
    specs: specProgress,
  };
}
