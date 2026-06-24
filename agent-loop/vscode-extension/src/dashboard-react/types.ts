export type DashboardMessage =
  | { type: 'overview'; payload: OverviewPayload }
  | { type: 'detail'; payload: unknown };

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
    };
  }
}
