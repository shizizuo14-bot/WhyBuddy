import { extractFirstJsonObject } from './json.js';

export function parseAgentReviewOutput(stdout) {
  const outer = extractFirstJsonObject(stdout);
  if (!outer) return null;

  const candidates = [];
  if (typeof outer.text === 'string') {
    candidates.push(outer.text);
  }
  candidates.push(stdout);

  for (const candidate of candidates) {
    const parsed = extractFirstJsonObject(candidate);
    if (parsed?.verdict) return parsed;
    if (outer.verdict) return outer;
  }

  return null;
}

export function reviewVerdictAllowsDone(parsed) {
  return parsed?.verdict === 'pass';
}