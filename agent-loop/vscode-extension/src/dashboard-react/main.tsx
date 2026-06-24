import { createRoot, type Root } from 'react-dom/client';
import { DashboardApp } from './DashboardApp';
import type { OverviewPayload } from './types';

let root: Root | null = null;

function ensureRoot(): Root | null {
  const host = document.getElementById('app');
  if (!host) return null;
  if (!root) root = createRoot(host);
  return root;
}

function renderOverview(payload: OverviewPayload): void {
  const target = ensureRoot();
  if (!target) return;
  target.render(<DashboardApp payload={payload} />);
}

window.AgentLoopReactDashboard = { renderOverview };
