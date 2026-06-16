export function summarizeGateProgress(gate) {
  const innerFailureCount = extractGateInnerFailureCount(gate);
  return {
    commandFailureCount: gate.failureCount,
    innerFailureCount,
    effectiveFailureCount: innerFailureCount ?? gate.failureCount,
  };
}

export function madeGateProgress(previousGate, currentGate) {
  const previous = summarizeGateProgress(previousGate);
  const current = summarizeGateProgress(currentGate);
  return current.effectiveFailureCount < previous.effectiveFailureCount;
}

export function extractGateInnerFailureCount(gate) {
  let total = 0;
  let found = false;

  for (const run of gate.runs || []) {
    if (run.exitCode === 0 && !run.timedOut && !run.spawnError) continue;
    const count = extractFailureCountFromText(`${run.stdout || ''}\n${run.stderr || ''}`);
    if (count !== null) {
      total += count;
      found = true;
    }
  }

  return found ? total : null;
}

export function extractFailureCountFromText(text) {
  const source = String(text || '');
  const patterns = [
    /\btests?\s*:\s*(\d+)\s+failed\b/i,
    /\b(\d+)\s+failed\b/i,
    /\bfailed\s*[:=]\s*(\d+)\b/i,
    /\bfailures?\s*[:=]\s*(\d+)\b/i,
    /\b(\d+)\s+failures?\b/i,
    /\bfailed\s+(\d+)\b/i,
  ];

  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (match) return Number.parseInt(match[1], 10);
  }

  return null;
}
