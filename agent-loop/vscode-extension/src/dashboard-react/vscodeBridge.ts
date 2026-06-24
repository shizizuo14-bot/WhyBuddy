import type { VsCodeApi } from './types';

let cachedApi: VsCodeApi | null = null;

export function getVsCodeApi(): VsCodeApi {
  if (!cachedApi) {
    cachedApi = window.__AGENT_LOOP_VSCODE_API__
      ? window.__AGENT_LOOP_VSCODE_API__
      : typeof window.acquireVsCodeApi === 'function'
      ? window.acquireVsCodeApi()
      : { postMessage: () => {} };
  }
  return cachedApi;
}

export function postCommand(type: string, extra: Record<string, unknown> = {}): void {
  getVsCodeApi().postMessage({ type, ...extra });
}
