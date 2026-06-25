export type DashboardMessage =
  | { type: 'overview'; payload: OverviewPayload }
  | { type: 'detail'; payload: DetailPayload };

export type OverviewTask = {
  id?: string | null;
  task: string;
  taskLabel?: string | null;
  statusLabel?: string | null;
  badge?: string | null;
  outcome?: string | null;
  outcomeGroup?: string | null;
  enabled?: boolean;
  autoDisabled?: boolean;
  running?: boolean;
  category?: string | null;
  agent?: string | null;
  fixAgent?: string | null;
  reviewAgent?: string | null;
  branch?: string | null;
  lastUpdatedAt?: string | null;
  diffBytes?: number | null;
  lastUpdatedText?: string | null;
  applyErrorKind?: string | null;
  applyError?: string | null;
  applyErrorFiles?: string[];
};

export type OverviewPayload = {
  counts?: Record<string, number | undefined>;
  queueRunning?: boolean;
  landing?: unknown;
  current?: {
    taskLabel?: string | null;
    phaseLabel?: string | null;
    status?: string | null;
    elapsedText?: string | null;
    staleRun?: unknown;
  } | null;
  tasks?: OverviewTask[];
};

export type DetailPayload = {
  taskLabel?: string | null;
  taskPath?: string | null;
  runId?: string | null;
  status?: string | null;
  phaseLabel?: string | null;
  elapsedText?: string | null;
  gateText?: string | null;
  gateOk?: boolean;
  agentText?: string | null;
  fixAgent?: string | null;
  reviewAgent?: string | null;
  repo?: string | null;
  commit?: string | null;
  activeTab?: string | null;
  activeEventFilter?: string | null;
  eventSearchQuery?: string | null;
  pipelineSteps?: Array<{ key?: string | null; label?: string | null; done?: boolean; active?: boolean }>;
  details?: string[];
  iterations?: Array<Record<string, unknown>>;
  reviewRounds?: Array<Record<string, unknown>>;
  events?: Array<Record<string, unknown>>;
  agentTail?: string | null;
  diffText?: string | null;
  failingGateText?: string | null;
  reportPath?: string | null;
  reportJsonPath?: string | null;
  landingPath?: string | null;
  statePath?: string | null;
  landing?: Record<string, unknown> | null;
};

export type VsCodeApi = {
  postMessage(message: unknown): void;
};

declare global {
  interface Window {
    acquireVsCodeApi?: () => VsCodeApi;
    __AGENT_LOOP_VSCODE_API__?: VsCodeApi;
    __AGENT_LOOP_ASSETS__?: { brandLogo?: string };
    __AGENT_LOOP_CSP_NONCE__?: string;
    AgentLoopReactDashboard?: {
      renderOverview(payload: OverviewPayload): void;
      renderDetail(payload: DetailPayload): void;
    };
  }
}
