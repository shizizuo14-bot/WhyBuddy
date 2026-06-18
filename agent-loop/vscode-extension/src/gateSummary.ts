import type { GateSummary, LoopState } from './types';

export interface DisplayGate {
  ok: boolean | null;
  text: string;
  source: 'post-fix' | 'baseline' | 'none';
  failureCount: number | null;
}

export function resolveDisplayGate(state: LoopState | null): DisplayGate {
  const postFixGate = findLatestPostFixGate(state);
  if (postFixGate) {
    return formatGate(postFixGate, 'post-fix');
  }
  if (state?.baselineGate) {
    return formatGate(state.baselineGate, 'baseline');
  }
  return {
    ok: null,
    text: '未运行',
    source: 'none',
    failureCount: null,
  };
}

function findLatestPostFixGate(state: LoopState | null): GateSummary | null {
  const iterations = state?.iterations;
  if (!Array.isArray(iterations)) return null;
  for (let index = iterations.length - 1; index >= 0; index -= 1) {
    const gate = iterations[index]?.gate;
    if (gate && typeof gate.ok === 'boolean') return gate;
  }
  return null;
}

function formatGate(gate: GateSummary, source: DisplayGate['source']): DisplayGate {
  const label = source === 'post-fix' ? '修复 Gate' : '基线 Gate';
  const failureCount = gate.failureCount ?? null;
  if (gate.ok === true) {
    return {
      ok: true,
      text: `${label} 绿`,
      source,
      failureCount,
    };
  }
  if (gate.ok === false) {
    const count = failureCount ?? '?';
    return {
      ok: false,
      text: `${label} 红 (${count})`,
      source,
      failureCount,
    };
  }
  return {
    ok: null,
    text: `${label} 未知`,
    source,
    failureCount,
  };
}
