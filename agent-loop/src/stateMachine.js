export function decideNextState({ phase, gateOk, autoFix }) {
  if (phase !== 'BASELINE_GATE_RESULT') {
    throw new Error(`unsupported phase: ${phase}`);
  }
  if (gateOk) return 'CODEX_REVIEW';
  return autoFix ? 'GROK_FIX' : 'HALT_HUMAN';
}
