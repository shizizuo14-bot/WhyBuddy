import fs from 'node:fs/promises';
import path from 'node:path';

export function queueOutcomesPath(repoRoot) {
  return path.join(repoRoot, '.agent-loop', 'queue-outcomes.json');
}

export async function readQueueOutcomes(repoRoot) {
  const filePath = queueOutcomesPath(repoRoot);
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === 'ENOENT') return { tasks: {} };
    throw error;
  }
}

export async function writeQueueOutcomes(repoRoot, data) {
  const filePath = queueOutcomesPath(repoRoot);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

export function shouldSkipAutoDisabledTask({ entry, outcomes, maxConsecutiveNoChanges = 3 }) {
  const label = entry.id || entry.task;
  const record = outcomes?.tasks?.[label];
  if (!record) return { skip: false, record: null };
  const streak = record.consecutiveNoChanges || 0;
  if (record.autoDisabled || (maxConsecutiveNoChanges > 0 && streak >= maxConsecutiveNoChanges)) {
    return { skip: true, record, reason: 'consecutive-no-changes' };
  }
  return { skip: false, record };
}

export function updateQueueOutcomeRecord({
  record = {},
  status,
  outcome,
  runId = null,
  applyStatus = null,
  applyErrorKind = null,
  applyErrorFiles = null,
  applyError = null,
  maxConsecutiveNoChanges = 3,
  autoDisableOnNoChanges = true,
}) {
  const next = {
    ...record,
    lastStatus: status || record.lastStatus || null,
    lastOutcome: outcome || record.lastOutcome || null,
    lastRunId: runId || record.lastRunId || null,
    lastUpdatedAt: new Date().toISOString(),
    consecutiveNoChanges: record.consecutiveNoChanges || 0,
    autoDisabled: Boolean(record.autoDisabled),
    autoDisabledAt: record.autoDisabledAt || null,
  };

  if (applyStatus) next.applyStatus = applyStatus;
  if (applyErrorKind) next.applyErrorKind = applyErrorKind;
  if (Array.isArray(applyErrorFiles)) next.applyErrorFiles = applyErrorFiles;
  if (applyError) next.applyError = applyError;

  if (status === 'HALT_NO_CHANGES') {
    next.consecutiveNoChanges += 1;
  } else if (status?.startsWith('DONE_')) {
    next.consecutiveNoChanges = 0;
    next.autoDisabled = false;
    next.autoDisabledAt = null;
  } else if (outcome === 'crashed') {
    // Infra failures should not count toward "grok can't do this task" streaks.
    next.consecutiveNoChanges = record.consecutiveNoChanges || 0;
  } else if (outcome === 'failed') {
    next.consecutiveNoChanges = 0;
  }

  if (
    autoDisableOnNoChanges
    && maxConsecutiveNoChanges > 0
    && next.consecutiveNoChanges >= maxConsecutiveNoChanges
  ) {
    next.autoDisabled = true;
    next.autoDisabledAt = next.autoDisabledAt || new Date().toISOString();
  }

  return next;
}

export async function recordQueueTaskOutcome({
  repoRoot,
  entry,
  summary,
  maxConsecutiveNoChanges = 3,
  autoDisableOnNoChanges = true,
}) {
  const label = entry.id || entry.task;
  const outcomes = await readQueueOutcomes(repoRoot);
  outcomes.tasks ||= {};
  outcomes.tasks[label] = updateQueueOutcomeRecord({
    record: outcomes.tasks[label],
    status: summary.status,
    outcome: summary.outcome,
    runId: summary.runId,
    applyStatus: summary.applyStatus,
    applyErrorKind: summary.applyErrorKind,
    applyErrorFiles: summary.applyErrorFiles,
    applyError: summary.applyError,
    maxConsecutiveNoChanges,
    autoDisableOnNoChanges,
  });
  await writeQueueOutcomes(repoRoot, outcomes);
  return outcomes.tasks[label];
}
