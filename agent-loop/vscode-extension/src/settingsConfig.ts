import * as fs from 'node:fs/promises';

export type ProviderId = 'grok' | 'openai' | 'anthropic';

export interface ProviderHealthResult {
  provider: ProviderId;
  status: 'ok' | 'failed' | 'skipped';
  durationMs: number;
  reason: string;
}

const DEFAULT_ENDPOINTS: Record<ProviderId, string> = {
  grok: 'https://api.x.ai/v1/models',
  openai: 'https://api.openai.com/v1/models',
  anthropic: 'https://api.anthropic.com/v1/models',
};

export function getProviderEndpoint(provider: ProviderId, baseUrl?: string): string {
  if (baseUrl && typeof baseUrl === 'string' && baseUrl.trim()) {
    const base = baseUrl.replace(/\/+$/, '');
    return `${base}/models`;
  }
  return DEFAULT_ENDPOINTS[provider];
}

function sanitizeReason(raw: unknown): string {
  const s = String(raw || '').slice(0, 200);
  // Never include key-like fragments, headers, or long bodies
  if (/sk-|Bearer |Authorization|x-api-key|token/i.test(s)) {
    return 'redacted error';
  }
  if (/abort|timeout|time out/i.test(s)) return 'timeout';
  if (/ENOTFOUND|ECONNREFUSED|fetch failed|network|ECONNRESET/i.test(s)) return 'network error';
  if (/401|403|unauthorized|forbidden/i.test(s)) return 'auth error';
  if (/429|rate|too many/i.test(s)) return 'rate limited';
  return 'error';
}

export async function testProviderHealth(
  provider: ProviderId,
  secretKey: string | null | undefined,
  options?: {
    transport?: (input: any, init?: any) => Promise<any>;
    baseUrl?: string;
    timeoutMs?: number;
  }
): Promise<ProviderHealthResult> {
  const start = Date.now();
  if (!secretKey || typeof secretKey !== 'string' || secretKey.trim() === '') {
    return {
      provider,
      status: 'skipped',
      durationMs: 0,
      reason: 'missing key',
    };
  }

  const transport = options?.transport || (typeof fetch === 'function' ? fetch : undefined);
  if (typeof transport !== 'function') {
    return {
      provider,
      status: 'failed',
      durationMs: Date.now() - start,
      reason: 'no transport',
    };
  }

  const url = getProviderEndpoint(provider, options?.baseUrl);
  const timeoutMs = options?.timeoutMs ?? 7000;

  try {
    const headers: Record<string, string> = {};
    if (provider === 'anthropic') {
      headers['x-api-key'] = secretKey;
      headers['anthropic-version'] = '2023-06-01';
    } else {
      headers['Authorization'] = `Bearer ${secretKey}`;
    }
    // Intentionally do not log or include headers/raw keys anywhere in result

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    let timer: any = null;
    if (controller) {
      timer = setTimeout(() => controller.abort(), timeoutMs);
    }

    const res = await transport(url, {
      method: 'GET',
      headers,
      signal: controller ? controller.signal : undefined,
    });

    if (timer) clearTimeout(timer);

    const durationMs = Date.now() - start;
    if (res && (res.ok || (res.status >= 200 && res.status < 300))) {
      return { provider, status: 'ok', durationMs, reason: 'ok' };
    }
    const statusCode = res && res.status ? res.status : 'unknown';
    return {
      provider,
      status: 'failed',
      durationMs,
      reason: `http ${statusCode}`,
    };
  } catch (err: any) {
    const durationMs = Date.now() - start;
    return {
      provider,
      status: 'failed',
      durationMs,
      reason: sanitizeReason(err?.message || err),
    };
  }
}

// ===== Queue defaults preview (Settings 106, read + dry-run only) =====
// Supported keys only; workerEnv never included in read/preview output (secret redaction).
// Preview never writes; rejects unsupported with redacted error.

export const SUPPORTED_QUEUE_DEFAULT_KEYS: readonly string[] = [
  'useWorktree',
  'worktreeScope',
  'queueWorktreeName',
  'autoFix',
  'skipReview',
  'fixAgent',
  'fixModel',
  'reviewAgent',
  'reviewModel',
  'scopedReview',
  'workerMaxTurns',
  'workerMaxRetries',
  'grokMaxTurns',
  'grokMaxRetries',
  'reviewMaxTurns',
  'guardTests',
  'maxIterations',
  'agentIdleTimeoutMs',
  'agentTimeoutMs',
  'noSyncTaskStatus',
  'cleanupWorktree',
  'autoDisableOnNoChanges',
  'maxConsecutiveNoChanges',
  'timeoutMs',
  'lang',
  'pythonExe',
] as const;

export type SupportedQueueKey = (typeof SUPPORTED_QUEUE_DEFAULT_KEYS)[number];

function isSupportedQueueKey(k: string): k is SupportedQueueKey {
  return (SUPPORTED_QUEUE_DEFAULT_KEYS as readonly string[]).includes(k);
}

function isSecretLike(value: unknown): boolean {
  if (value == null) return false;
  const s = String(value);
  if (/sk-|Bearer |Authorization|x-api-key|token/i.test(s)) return true;
  if (/-----BEGIN (RSA |EC |)PRIVATE KEY/i.test(s)) return true;
  return false;
}

async function readRawQueueFile(queueFilePath: string): Promise<Record<string, unknown>> {
  try {
    const raw = await fs.readFile(queueFilePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.defaults && typeof parsed.defaults === 'object') {
      return { ...parsed.defaults };
    }
    return {};
  } catch {
    return {};
  }
}

async function readFullQueue(queueFilePath: string): Promise<{ raw: string; data: any }> {
  const raw = await fs.readFile(queueFilePath, 'utf8');
  const data = JSON.parse(raw);
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('invalid queue json structure');
  }
  return { raw, data };
}

function filterToSupportedDefaults(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of SUPPORTED_QUEUE_DEFAULT_KEYS) {
    if (key in raw) {
      out[key] = raw[key];
    }
  }
  // Explicitly omit workerEnv entirely (do not leak secret values in preview output)
  delete (out as any).workerEnv;
  return out;
}

export interface QueueDefaultsPreviewResult {
  ok: boolean;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  diff?: Array<{ key: string; before: unknown; after: unknown }>;
  error?: string;
  applied?: Record<string, unknown>;
  rolledBack?: boolean;
}

export async function readQueueDefaults(queueFilePath: string): Promise<Record<string, unknown>> {
  const raw = await readRawQueueFile(queueFilePath);
  return filterToSupportedDefaults(raw);
}

export async function previewQueueDefaults(
  queueFilePath: string,
  proposed: Record<string, unknown> | null | undefined
): Promise<QueueDefaultsPreviewResult> {
  const currentRaw = await readRawQueueFile(queueFilePath);
  const before = filterToSupportedDefaults(currentRaw);

  const prop = (proposed && typeof proposed === 'object' && !Array.isArray(proposed)) ? proposed : {};
  const badKeys = Object.keys(prop).filter((k) => !isSupportedQueueKey(k) || k === 'workerEnv');
  if (badKeys.length > 0) {
    return { ok: false, error: 'redacted error' };
  }

  const after: Record<string, unknown> = { ...before };
  for (const [k, v] of Object.entries(prop)) {
    if (isSupportedQueueKey(k) && k !== 'workerEnv') {
      after[k] = v;
    }
  }

  const diff: Array<{ key: string; before: unknown; after: unknown }> = [];
  for (const key of Object.keys(after)) {
    const b = (before as any)[key];
    const a = (after as any)[key];
    if (JSON.stringify(b) !== JSON.stringify(a)) {
      diff.push({ key, before: b, after: a });
    }
  }

  return { ok: true, before, after, diff };
}

export async function applyQueueDefaults(
  queueFilePath: string,
  proposed: Record<string, unknown> | null | undefined
): Promise<QueueDefaultsPreviewResult> {
  let fullRaw = '';
  let fullData: any;
  let before: Record<string, unknown> = {};
  try {
    const r = await readFullQueue(queueFilePath);
    fullRaw = r.raw;
    fullData = r.data;
    const currentDefaults = (fullData.defaults && typeof fullData.defaults === 'object' && !Array.isArray(fullData.defaults)) ? fullData.defaults : {};
    before = filterToSupportedDefaults(currentDefaults);
  } catch {
    return { ok: false, error: 'redacted error' };
  }

  const prop = (proposed && typeof proposed === 'object' && !Array.isArray(proposed)) ? proposed : {};
  const badKeys = Object.keys(prop).filter((k) => !isSupportedQueueKey(k) || k === 'workerEnv');
  if (badKeys.length > 0) {
    return { ok: false, error: 'redacted error' };
  }

  // reject Authorization-like / secret values even on supported keys
  for (const [k, v] of Object.entries(prop)) {
    if (isSupportedQueueKey(k) && k !== 'workerEnv' && isSecretLike(v)) {
      return { ok: false, error: 'redacted error' };
    }
  }

  // update only supported in defaults; preserve workerEnv and all other keys/sections including tasks
  const updatedDefaults: Record<string, unknown> = {
    ...(fullData.defaults && typeof fullData.defaults === 'object' ? fullData.defaults : {})
  };
  const applied: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(prop)) {
    if (isSupportedQueueKey(k) && k !== 'workerEnv') {
      updatedDefaults[k] = v;
      applied[k] = v;
    }
  }

  const updatedFull: any = {
    ...fullData,
    defaults: updatedDefaults,
  };
  // defensive: never overwrite tasks array
  if (Array.isArray(fullData.tasks)) {
    updatedFull.tasks = fullData.tasks;
  }

  let newContent: string;
  try {
    newContent = JSON.stringify(updatedFull, null, 2);
    // pre-write JSON validation
    JSON.parse(newContent);
  } catch {
    return { ok: false, error: 'redacted error' };
  }

  // pre-check task preservation in serialized form
  try {
    const check = JSON.parse(newContent);
    if (Array.isArray(fullData.tasks) && (!Array.isArray(check.tasks) || JSON.stringify(check.tasks) !== JSON.stringify(fullData.tasks))) {
      return { ok: false, error: 'redacted error' };
    }
  } catch {
    return { ok: false, error: 'redacted error' };
  }

  let rolledBack = false;
  try {
    await fs.writeFile(queueFilePath, newContent, 'utf8');

    // mandatory post-write JSON validation + task preservation
    const postRaw = await fs.readFile(queueFilePath, 'utf8');
    const postParsed = JSON.parse(postRaw);
    if (!postParsed || typeof postParsed !== 'object' || Array.isArray(postParsed)) {
      throw new Error('post-write parse invalid');
    }
    if (Array.isArray(fullData.tasks)) {
      if (!Array.isArray(postParsed.tasks) || JSON.stringify(postParsed.tasks) !== JSON.stringify(fullData.tasks)) {
        throw new Error('tasks array not preserved after write');
      }
    }

    const afterSupported = filterToSupportedDefaults((postParsed.defaults || {}));
    const diff: Array<{ key: string; before: unknown; after: unknown }> = [];
    const allKeys = new Set([...Object.keys(before), ...Object.keys(afterSupported)]);
    for (const key of allKeys) {
      const b = (before as any)[key];
      const a = (afterSupported as any)[key];
      if (JSON.stringify(b) !== JSON.stringify(a)) {
        diff.push({ key, before: b, after: a });
      }
    }

    return { ok: true, before, after: afterSupported, diff, applied };
  } catch (err: any) {
    // rollback on any write or post-validation failure
    try {
      await fs.writeFile(queueFilePath, fullRaw, 'utf8');
      rolledBack = true;
    } catch {
      // best effort restore
    }
    return { ok: false, error: 'redacted error', rolledBack: rolledBack || undefined };
  }
}

// ===== Settings import/export redaction (Settings 106) =====
// Export: schemaVersion + profiles + non-secret settings + key status ONLY (never raw secrets).
// Import: validates schemaVersion, rejects any secret-looking raw values (no raw keys through non-secret path).

export const SETTINGS_SCHEMA_VERSION = 1;

export interface SettingsExport {
  schemaVersion: number;
  profiles?: {
    fixAgent?: string;
    reviewAgent?: string;
  };
  nonSensitive?: Record<string, unknown>;
  keys: Record<string, 'configured' | ''>;
}

export function createSettingsExport(
  nonSensitive: Record<string, unknown>,
  keysStatus: Record<string, string>
): SettingsExport {
  const safeKeys: Record<string, 'configured' | ''> = {
    grokApiKey: (keysStatus && keysStatus.grokApiKey === 'configured') ? 'configured' : '',
    openaiApiKey: (keysStatus && keysStatus.openaiApiKey === 'configured') ? 'configured' : '',
    anthropicApiKey: (keysStatus && keysStatus.anthropicApiKey === 'configured') ? 'configured' : '',
  };
  const profiles = {
    fixAgent: (nonSensitive as any)?.fixAgent,
    reviewAgent: (nonSensitive as any)?.reviewAgent,
  };
  return {
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    profiles,
    nonSensitive: { ...(nonSensitive || {}) },
    keys: safeKeys,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function looksLikeSecret(v: unknown): boolean {
  if (v == null) return false;
  const s = String(v);
  if (!s || s === 'configured' || s === '') return false;
  if (/sk-|Bearer |Authorization|x-api-key|token/i.test(s)) return true;
  if (/-----BEGIN (RSA |EC |)PRIVATE KEY/i.test(s)) return true;
  if (/apiKey|secret|password/i.test(s) && s.length > 4) return true;
  return false;
}

export function validateAndPrepareSettingsImport(input: unknown): { ok: boolean; nonSensitive?: Record<string, unknown>; error?: string } {
  if (!isRecord(input)) {
    return { ok: false, error: 'malformed input' };
  }
  const data = input as Record<string, unknown>;
  if (data.schemaVersion !== SETTINGS_SCHEMA_VERSION) {
    return { ok: false, error: 'unsupported schema version' };
  }
  // Reject if any secret-looking raw key values appear anywhere (protect non-secret import path)
  if (looksLikeSecretIn(data)) {
    return { ok: false, error: 'contains secret-looking keys' };
  }
  const nonSensitive: Record<string, unknown> = isRecord(data.nonSensitive) ? { ...data.nonSensitive } : {};
  if (isRecord(data.profiles)) {
    const p = data.profiles as Record<string, unknown>;
    if (p.fixAgent !== undefined) nonSensitive.fixAgent = p.fixAgent;
    if (p.reviewAgent !== undefined) nonSensitive.reviewAgent = p.reviewAgent;
  }
  // Never carry any key fields from import into non-secret payload
  delete (nonSensitive as any).grokApiKey;
  delete (nonSensitive as any).openaiApiKey;
  delete (nonSensitive as any).anthropicApiKey;
  delete (nonSensitive as any).keys;
  return { ok: true, nonSensitive };
}

function looksLikeSecretIn(obj: unknown, depth = 0): boolean {
  if (depth > 5 || !obj || typeof obj !== 'object') return false;
  if (Array.isArray(obj)) {
    return obj.some((v) => looksLikeSecretIn(v, depth + 1));
  }
  const rec = obj as Record<string, unknown>;
  for (const [k, v] of Object.entries(rec)) {
    if (/apiKey|token|secret|password/i.test(k)) {
      if (looksLikeSecret(v)) return true;
    }
    if (looksLikeSecret(v)) return true;
    if (isRecord(v) || Array.isArray(v)) {
      if (looksLikeSecretIn(v, depth + 1)) return true;
    }
  }
  return false;
}
