import * as fs from 'node:fs/promises';
import * as vscode from 'vscode';

export type ProviderId = 'grok' | 'openai' | 'anthropic';

export interface ProviderHealthResult {
  provider: ProviderId;
  status: 'ok' | 'failed' | 'skipped';
  durationMs: number;
  reason: string;
  checkedAt?: string;
  duration?: number;
}

export type WorkerId = 'grok' | 'codex';

export interface WorkerCliHealthResult {
  worker: WorkerId;
  status: 'ok' | 'failed' | 'skipped' | 'timeout';
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
  if (/sk-|Bearer |Authorization|x-api-key|token|-----BEGIN .*PRIVATE KEY/i.test(s)) {
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

function getDefaultWorkerCommand(worker: WorkerId): string {
  if (worker === 'codex') {
    return process.platform === 'win32' ? 'codex.exe' : 'codex';
  }
  return process.platform === 'win32' ? 'grok.exe' : 'grok';
}

function sanitizeCliReason(raw: unknown): string {
  const s = String(raw || '').slice(0, 200);
  // Never include raw env/secrets/headers
  if (/sk-|Bearer |Authorization|x-api-key|token|SECRET|PASSWORD|API_KEY|-----BEGIN .*PRIVATE KEY/i.test(s)) {
    return 'redacted';
  }
  if (/ENOENT|not found|command not found|no such file/i.test(s)) {
    return 'command not found';
  }
  if (/timeout|time out|timed out|ETIMEDOUT/i.test(s)) {
    return 'timeout';
  }
  if (/network|ECONN|spawn/i.test(s)) {
    return 'spawn error';
  }
  const cleaned = s.replace(/\s+/g, ' ').trim().slice(0, 120);
  return cleaned || 'error';
}

export async function testWorkerCliHealth(
  worker: WorkerId,
  options?: {
    timeoutMs?: number;
    spawnFn?: any;
    command?: string;
  }
): Promise<WorkerCliHealthResult> {
  const start = Date.now();
  const timeoutMs = options?.timeoutMs ?? 4000;
  const useSpawn = options?.spawnFn || (typeof require !== 'undefined' ? require('node:child_process').spawn : undefined);
  if (typeof useSpawn !== 'function') {
    return { worker, status: 'failed', durationMs: 0, reason: 'no spawn' };
  }
  const cmd = options?.command || getDefaultWorkerCommand(worker);

  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let finished = false;
    let timedOut = false;

    let child: any;
    try {
      child = useSpawn(cmd, ['--version'], {
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
        windowsHide: true,
      });
    } catch (e: any) {
      const durationMs = Date.now() - start;
      return resolve({ worker, status: 'failed', durationMs, reason: sanitizeCliReason(e) });
    }

    const timer = setTimeout(() => {
      if (finished) return;
      timedOut = true;
      finished = true;
      try { child && child.kill && child.kill('SIGKILL'); } catch {}
      const durationMs = Date.now() - start;
      resolve({ worker, status: 'timeout', durationMs, reason: 'timeout' });
    }, timeoutMs);

    if (child.stdout) {
      child.stdout.on('data', (d: any) => { stdout += String(d); });
    }
    if (child.stderr) {
      child.stderr.on('data', (d: any) => { stderr += String(d); });
    }

    child.on('error', (e: any) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      const durationMs = Date.now() - start;
      const r = sanitizeCliReason(e && e.message);
      const st: any = /not found|ENOENT/i.test(String(e)) ? 'skipped' : 'failed';
      resolve({ worker, status: st, durationMs, reason: r });
    });

    child.on('close', (code: number | null) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      const durationMs = Date.now() - start;
      const combined = (stdout || '') + (stderr || '');
      if (timedOut) {
        return resolve({ worker, status: 'timeout', durationMs, reason: 'timeout' });
      }
      if (code === 0) {
        return resolve({ worker, status: 'ok', durationMs, reason: 'ok' });
      }
      // non-zero but command existed: treat as ok for availability probe only if output hints version-like (avoid auto-ok on errors)
      if (/version|codex|grok|\d+\.\d+/i.test(combined)) {
        return resolve({ worker, status: 'ok', durationMs, reason: 'ok' });
      }
      const r = sanitizeCliReason(stderr || stdout || `exit ${code}`);
      resolve({ worker, status: 'failed', durationMs, reason: r });
    });
  });
}

// ===== Settings schema surface (Settings 107) =====
// Declare non-secret keys and enum constraints. Raw secret keys (grokApiKey etc) must remain SecretStorage-only, never in workspace config or this surface.
export const NON_SECRET_SETTING_KEYS: readonly string[] = [
  'pollIntervalMs',
  'queuePath',
  'openDashboardOnRun',
  'fixAgent',
  'reviewAgent',
  'fixModel',
  'reviewModel',
  'workerMaxTurns',
  'workerMaxRetries',
  'worktreeScope',
  'baseUrl',
  'injectKeysToWorker',
  'activeProfile',
] as const;

export type NonSecretSettingKey = (typeof NON_SECRET_SETTING_KEYS)[number];

export const SETTING_ENUMS: Record<string, readonly string[]> = {
  fixAgent: ['grok', 'codex'],
  reviewAgent: ['grok', 'codex', 'none'],
  worktreeScope: ['queue', 'task'],
};

export function sanitizeSettingsForSave(input: Record<string, unknown>): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (k === 'grokApiKey' || k === 'openaiApiKey' || k === 'anthropicApiKey' || /ApiKey$/i.test(k)) {
      // never allow raw keys into workspace settings
      continue;
    }
    if (k in SETTING_ENUMS) {
      const allowed = SETTING_ENUMS[k];
      if (allowed.includes(String(v))) {
        out[k] = v;
      }
      // else: reject unsupported enum value (do not include)
    } else if (NON_SECRET_SETTING_KEYS.includes(k as NonSecretSettingKey)) {
      out[k] = v;
    } else if (k === 'injectToWorker') {
      // normalize alias used in UI payloads
      out['injectKeysToWorker'] = v;
    }
    // ignore unknown keys
  }
  return out;
}

// ===== Profile run guard (Settings 107) =====
// Structured results for blocked saves during active queue run.
// Runtime (unsafe profile/worker) fields blocked; safe non-runtime (e.g. workerMax*, diagnostics) allowed.
export interface SettingsRunGuardResult {
  allowed: boolean;
  blockedFields: string[];
  reason?: string;
  message?: string;
}

export const RUNTIME_LOCKED_FIELDS: readonly string[] = ['fixAgent', 'reviewAgent', 'queuePath', 'worktreeScope', 'baseUrl'];

export function checkProfileRunGuard(queueRunning: boolean, payload: Record<string, unknown>): SettingsRunGuardResult {
  if (!queueRunning) {
    return { allowed: true, blockedFields: [] };
  }
  const attempted = Object.keys(payload || {});
  const blocked = RUNTIME_LOCKED_FIELDS.filter((f) => attempted.includes(f) && (payload as any)[f] !== undefined);
  if (blocked.length > 0) {
    return {
      allowed: false,
      blockedFields: blocked,
      reason: 'queueRunning',
      message: `队列运行中，禁止修改运行时字段: ${blocked.join(', ')}。安全字段（如 workerMax*、诊断刷新）不受此限制。`,
    };
  }
  return { allowed: true, blockedFields: [] };
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

// ===== Settings import/export redaction (Settings 106/107) =====
// Export: schemaVersion + active profile + non-secret settings + key status ONLY (never raw secrets).
// Import: validates schemaVersion, rejects any secret-looking raw values (no raw keys through non-secret path).

export const SETTINGS_SCHEMA_VERSION = 1;

export interface SettingsExport {
  schemaVersion: number;
  activeProfile?: string;
  profiles?: {
    fixAgent?: string;
    reviewAgent?: string;
  };
  nonSensitive?: Record<string, unknown>;
  keys: Record<string, 'configured' | ''>;
}

export function createSettingsExport(
  nonSensitive: Record<string, unknown>,
  keysStatus: Record<string, string>,
  activeProfile?: string
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
  const act = activeProfile || (nonSensitive as any)?.activeProfile;
  return {
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    activeProfile: act,
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

// ===== Effective config runtime reader (Settings 107) =====
// One reader drives overview, detail, diagnostics, run-controller defaults.
// Merges package.json defaults (via inspect defaultValue) with workspace overrides.
// reviewAgent 'none' kept as-is here; label code normalizes to remove reviewer.
export interface AgentLoopConfig {
  fixAgent: string;
  reviewAgent: string;
  fixModel: string;
  reviewModel: string;
  workerMaxTurns: number;
  workerMaxRetries: number;
  queuePath: string;
  worktreeScope: string;
  baseUrl: string;
  injectKeysToWorker: boolean;
  activeProfile: string;
}

export function getEffectiveConfig(): AgentLoopConfig {
  const cfg = vscode.workspace.getConfiguration('agentLoop');

  function getValue<T>(key: string, pkgDefault: T): T {
    const insp = cfg.inspect<T>(key);
    if (insp) {
      if (insp.workspaceFolderValue !== undefined) return insp.workspaceFolderValue;
      if (insp.workspaceValue !== undefined) return insp.workspaceValue;
      if (insp.globalValue !== undefined) return insp.globalValue;
      if (insp.defaultValue !== undefined) return insp.defaultValue;
    }
    return pkgDefault;
  }

  const fixAgent = getValue<string>('fixAgent', 'grok');
  const reviewAgent = getValue<string>('reviewAgent', 'codex');
  const fixModel = getValue<string>('fixModel', '') || '';
  const reviewModel = getValue<string>('reviewModel', '') || '';

  return {
    fixAgent: fixAgent || 'grok',
    reviewAgent: reviewAgent || 'codex',
    fixModel,
    reviewModel,
    workerMaxTurns: getValue<number>('workerMaxTurns', 128) ?? 128,
    workerMaxRetries: getValue<number>('workerMaxRetries', 2) ?? 2,
    queuePath: getValue<string>('queuePath', 'agent-loop/scripts/migration-queue.json') || 'agent-loop/scripts/migration-queue.json',
    worktreeScope: getValue<string>('worktreeScope', 'queue') || 'queue',
    baseUrl: getValue<string>('baseUrl', '') || '',
    injectKeysToWorker: getValue<boolean>('injectKeysToWorker', true) ?? true,
    activeProfile: getValue<string>('activeProfile', 'local') || 'local',
  };
}

// ===== Profile storage schema (Settings 107) =====
// Non-secret only. Never stores raw secrets. Supports presets + stored named profiles + active key fallback + malformed tolerance.

export interface NonSecretProfile {
  fixAgent?: string;
  reviewAgent?: string;
  workerMaxTurns?: number;
  workerMaxRetries?: number;
  worktreeScope?: string;
  baseUrl?: string;
  queuePath?: string;
  injectKeysToWorker?: boolean;
}

export const PROFILE_PRESETS: Record<string, NonSecretProfile> = {
  local: { fixAgent: 'grok', reviewAgent: 'codex', baseUrl: '' },
  proxy: { fixAgent: 'grok', reviewAgent: 'grok', baseUrl: 'http://127.0.0.1:8080' },
  ci: { fixAgent: 'codex', reviewAgent: 'none', workerMaxTurns: 32 },
  production: { fixAgent: 'grok', reviewAgent: 'codex', workerMaxTurns: 128, baseUrl: '' },
};

export function getActiveProfileKey(raw: unknown): string {
  if (typeof raw === 'string' && raw.trim()) {
    return raw.trim();
  }
  return 'local';
}

function profileValueLooksSecret(v: unknown): boolean {
  if (v == null) return false;
  const s = String(v);
  if (/sk-|Bearer |Authorization|x-api-key|token/i.test(s)) return true;
  if (/-----BEGIN (RSA |EC |)PRIVATE KEY/i.test(s)) return true;
  if (/apiKey|secret|password/i.test(s) && s.length > 4) return true;
  return false;
}

export function loadProfileStorage(input: unknown): { profiles: Record<string, NonSecretProfile>; activeProfile: string; warning?: string } {
  const fallbackActive = 'local';
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { profiles: {}, activeProfile: fallbackActive, warning: 'redacted warning' };
  }
  try {
    const rec = input as Record<string, unknown>;
    let map: Record<string, unknown> = rec;
    if (rec.profiles && typeof rec.profiles === 'object' && !Array.isArray(rec.profiles)) {
      map = rec.profiles as Record<string, unknown>;
    }
    const profiles: Record<string, NonSecretProfile> = {};
    let hadBad = false;
    for (const [k, v] of Object.entries(map)) {
      if (k === 'activeProfile') continue;
      if (!v || typeof v !== 'object' || Array.isArray(v)) {
        hadBad = true;
        continue;
      }
      // reject entire profile entry if any raw value looks secret (even non-key fields)
      const rawVals = Object.values(v as Record<string, unknown>);
      if (rawVals.some(profileValueLooksSecret)) {
        hadBad = true;
        continue;
      }
      const sanitized = sanitizeSettingsForSave(v as Record<string, unknown>);
      // only keep if has at least one known non-secret
      const p: NonSecretProfile = {};
      for (const ak of ['fixAgent', 'reviewAgent', 'workerMaxTurns', 'workerMaxRetries', 'worktreeScope', 'baseUrl', 'queuePath', 'injectKeysToWorker'] as const) {
        if (ak in sanitized && (sanitized as any)[ak] !== undefined) {
          (p as any)[ak] = (sanitized as any)[ak];
        }
      }
      if (Object.keys(p).length > 0) {
        profiles[k] = p;
      } else {
        hadBad = true;
      }
    }
    const activeRaw = (rec as any).activeProfile ?? (map as any).activeProfile;
    const activeProfile = getActiveProfileKey(activeRaw);
    const out: { profiles: Record<string, NonSecretProfile>; activeProfile: string; warning?: string } = { profiles, activeProfile };
    if (hadBad) {
      out.warning = 'redacted warning';
    }
    return out;
  } catch {
    return { profiles: {}, activeProfile: fallbackActive, warning: 'redacted warning' };
  }
}

// also expose a helper to list preset keys for tests/docs
export function listProfilePresetKeys(): string[] {
  return Object.keys(PROFILE_PRESETS);
}

// ===== Profile CRUD helpers (Settings 107) =====
// Non-secret only. Name rules: 1-32 alnum _ - , no leading/trailing _-, no empty.
export function isValidProfileName(name: unknown): boolean {
  if (typeof name !== 'string') return false;
  const s = name.trim();
  if (!s || s.length > 32) return false;
  if (!/^[a-zA-Z0-9_-]+$/.test(s)) return false;
  if (/^[-_]/.test(s) || /[-_]$/.test(s)) return false;
  return true;
}

export function sanitizeProfileName(name: unknown): string {
  if (typeof name !== 'string') return '';
  const s = name.trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32);
  // trim leading/trailing _-
  return s.replace(/^[-_]+/, '').replace(/[-_]+$/, '');
}

export interface ProfileCrudResult {
  ok: boolean;
  profiles?: Record<string, NonSecretProfile>;
  activeProfile?: string;
  error?: string;
}

export function applyProfileCreate(current: Record<string, NonSecretProfile>, name: string, base?: Record<string, unknown>): ProfileCrudResult {
  const n = sanitizeProfileName(name);
  if (!n || !isValidProfileName(n)) {
    return { ok: false, error: 'invalid profile name' };
  }
  if (current[n]) {
    return { ok: false, error: 'profile exists' };
  }
  const sanitized = sanitizeSettingsForSave(base || {});
  const p: NonSecretProfile = {};
  for (const ak of ['fixAgent', 'reviewAgent', 'workerMaxTurns', 'workerMaxRetries', 'worktreeScope', 'baseUrl', 'queuePath', 'injectKeysToWorker'] as const) {
    if (ak in sanitized && (sanitized as any)[ak] !== undefined) {
      (p as any)[ak] = (sanitized as any)[ak];
    }
  }
  return { ok: true, profiles: { ...current, [n]: p } };
}

export function applyProfileRename(current: Record<string, NonSecretProfile>, oldName: string, newName: string): ProfileCrudResult {
  const o = sanitizeProfileName(oldName);
  const n = sanitizeProfileName(newName);
  if (!o || !n || !isValidProfileName(n) || !isValidProfileName(o)) {
    return { ok: false, error: 'invalid profile name' };
  }
  if (!current[o]) {
    return { ok: false, error: 'profile not found' };
  }
  if (current[n] && n !== o) {
    return { ok: false, error: 'profile exists' };
  }
  const next: Record<string, NonSecretProfile> = { ...current };
  next[n] = next[o];
  if (n !== o) delete next[o];
  return { ok: true, profiles: next };
}

export function applyProfileDuplicate(current: Record<string, NonSecretProfile>, name: string, newName: string): ProfileCrudResult {
  const o = sanitizeProfileName(name);
  const n = sanitizeProfileName(newName);
  if (!o || !n || !isValidProfileName(n) || !isValidProfileName(o)) {
    return { ok: false, error: 'invalid profile name' };
  }
  if (!current[o]) {
    return { ok: false, error: 'profile not found' };
  }
  if (current[n]) {
    return { ok: false, error: 'profile exists' };
  }
  return { ok: true, profiles: { ...current, [n]: { ...current[o] } } };
}

export function applyProfileDelete(current: Record<string, NonSecretProfile>, name: string): ProfileCrudResult {
  const n = sanitizeProfileName(name);
  if (!n || !isValidProfileName(n)) {
    return { ok: false, error: 'invalid profile name' };
  }
  if (!current[n]) {
    return { ok: false, error: 'profile not found' };
  }
  if (Object.keys(current).length <= 1) {
    return { ok: false, error: 'cannot delete last profile' };
  }
  const next: Record<string, NonSecretProfile> = { ...current };
  delete next[n];
  return { ok: true, profiles: next };
}