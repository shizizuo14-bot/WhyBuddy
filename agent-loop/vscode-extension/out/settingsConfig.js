"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.PROFILE_PRESETS = exports.SETTINGS_SCHEMA_VERSION = exports.SUPPORTED_QUEUE_DEFAULT_KEYS = exports.RUNTIME_LOCKED_FIELDS = exports.SETTING_ENUMS = exports.NON_SECRET_SETTING_KEYS = void 0;
exports.getProviderEndpoint = getProviderEndpoint;
exports.testProviderHealth = testProviderHealth;
exports.testWorkerCliHealth = testWorkerCliHealth;
exports.sanitizeSettingsForSave = sanitizeSettingsForSave;
exports.checkProfileRunGuard = checkProfileRunGuard;
exports.readQueueDefaults = readQueueDefaults;
exports.previewQueueDefaults = previewQueueDefaults;
exports.applyQueueDefaults = applyQueueDefaults;
exports.createSettingsExport = createSettingsExport;
exports.validateAndPrepareSettingsImport = validateAndPrepareSettingsImport;
exports.getEffectiveConfig = getEffectiveConfig;
exports.getActiveProfileKey = getActiveProfileKey;
exports.loadProfileStorage = loadProfileStorage;
exports.listProfilePresetKeys = listProfilePresetKeys;
exports.isValidProfileName = isValidProfileName;
exports.sanitizeProfileName = sanitizeProfileName;
exports.applyProfileCreate = applyProfileCreate;
exports.applyProfileRename = applyProfileRename;
exports.applyProfileDuplicate = applyProfileDuplicate;
exports.applyProfileDelete = applyProfileDelete;
const fs = __importStar(require("node:fs/promises"));
const vscode = __importStar(require("vscode"));
const DEFAULT_ENDPOINTS = {
    grok: 'https://api.x.ai/v1/models',
    openai: 'https://api.openai.com/v1/models',
    anthropic: 'https://api.anthropic.com/v1/models',
};
function getProviderEndpoint(provider, baseUrl) {
    if (baseUrl && typeof baseUrl === 'string' && baseUrl.trim()) {
        const base = baseUrl.replace(/\/+$/, '');
        return `${base}/models`;
    }
    return DEFAULT_ENDPOINTS[provider];
}
function sanitizeReason(raw) {
    const s = String(raw || '').slice(0, 200);
    // Never include key-like fragments, headers, or long bodies
    if (/sk-|Bearer |Authorization|x-api-key|token|-----BEGIN .*PRIVATE KEY/i.test(s)) {
        return 'redacted error';
    }
    if (/abort|timeout|time out/i.test(s))
        return 'timeout';
    if (/ENOTFOUND|ECONNREFUSED|fetch failed|network|ECONNRESET/i.test(s))
        return 'network error';
    if (/401|403|unauthorized|forbidden/i.test(s))
        return 'auth error';
    if (/429|rate|too many/i.test(s))
        return 'rate limited';
    return 'error';
}
async function testProviderHealth(provider, secretKey, options) {
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
        const headers = {};
        if (provider === 'anthropic') {
            headers['x-api-key'] = secretKey;
            headers['anthropic-version'] = '2023-06-01';
        }
        else {
            headers['Authorization'] = `Bearer ${secretKey}`;
        }
        // Intentionally do not log or include headers/raw keys anywhere in result
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        let timer = null;
        if (controller) {
            timer = setTimeout(() => controller.abort(), timeoutMs);
        }
        const res = await transport(url, {
            method: 'GET',
            headers,
            signal: controller ? controller.signal : undefined,
        });
        if (timer)
            clearTimeout(timer);
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
    }
    catch (err) {
        const durationMs = Date.now() - start;
        return {
            provider,
            status: 'failed',
            durationMs,
            reason: sanitizeReason(err?.message || err),
        };
    }
}
function getDefaultWorkerCommand(worker) {
    if (worker === 'codex') {
        return process.platform === 'win32' ? 'codex.exe' : 'codex';
    }
    return process.platform === 'win32' ? 'grok.exe' : 'grok';
}
function sanitizeCliReason(raw) {
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
async function testWorkerCliHealth(worker, options) {
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
        let child;
        try {
            child = useSpawn(cmd, ['--version'], {
                stdio: ['ignore', 'pipe', 'pipe'],
                shell: false,
                windowsHide: true,
            });
        }
        catch (e) {
            const durationMs = Date.now() - start;
            return resolve({ worker, status: 'failed', durationMs, reason: sanitizeCliReason(e) });
        }
        const timer = setTimeout(() => {
            if (finished)
                return;
            timedOut = true;
            finished = true;
            try {
                child && child.kill && child.kill('SIGKILL');
            }
            catch { }
            const durationMs = Date.now() - start;
            resolve({ worker, status: 'timeout', durationMs, reason: 'timeout' });
        }, timeoutMs);
        if (child.stdout) {
            child.stdout.on('data', (d) => { stdout += String(d); });
        }
        if (child.stderr) {
            child.stderr.on('data', (d) => { stderr += String(d); });
        }
        child.on('error', (e) => {
            if (finished)
                return;
            finished = true;
            clearTimeout(timer);
            const durationMs = Date.now() - start;
            const r = sanitizeCliReason(e && e.message);
            const st = /not found|ENOENT/i.test(String(e)) ? 'skipped' : 'failed';
            resolve({ worker, status: st, durationMs, reason: r });
        });
        child.on('close', (code) => {
            if (finished)
                return;
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
exports.NON_SECRET_SETTING_KEYS = [
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
];
exports.SETTING_ENUMS = {
    fixAgent: ['grok', 'codex'],
    reviewAgent: ['grok', 'codex', 'none'],
    worktreeScope: ['queue', 'task'],
};
function sanitizeSettingsForSave(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input))
        return {};
    const out = {};
    for (const [k, v] of Object.entries(input)) {
        if (k === 'grokApiKey' || k === 'openaiApiKey' || k === 'anthropicApiKey' || /ApiKey$/i.test(k)) {
            // never allow raw keys into workspace settings
            continue;
        }
        if (k in exports.SETTING_ENUMS) {
            const allowed = exports.SETTING_ENUMS[k];
            if (allowed.includes(String(v))) {
                out[k] = v;
            }
            // else: reject unsupported enum value (do not include)
        }
        else if (exports.NON_SECRET_SETTING_KEYS.includes(k)) {
            out[k] = v;
        }
        else if (k === 'injectToWorker') {
            // normalize alias used in UI payloads
            out['injectKeysToWorker'] = v;
        }
        // ignore unknown keys
    }
    return out;
}
exports.RUNTIME_LOCKED_FIELDS = ['fixAgent', 'reviewAgent', 'queuePath', 'worktreeScope', 'baseUrl'];
function checkProfileRunGuard(queueRunning, payload) {
    if (!queueRunning) {
        return { allowed: true, blockedFields: [] };
    }
    const attempted = Object.keys(payload || {});
    const blocked = exports.RUNTIME_LOCKED_FIELDS.filter((f) => attempted.includes(f) && payload[f] !== undefined);
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
exports.SUPPORTED_QUEUE_DEFAULT_KEYS = [
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
];
function isSupportedQueueKey(k) {
    return exports.SUPPORTED_QUEUE_DEFAULT_KEYS.includes(k);
}
function isSecretLike(value) {
    if (value == null)
        return false;
    const s = String(value);
    if (/sk-|Bearer |Authorization|x-api-key|token/i.test(s))
        return true;
    if (/-----BEGIN (RSA |EC |)PRIVATE KEY/i.test(s))
        return true;
    return false;
}
async function readRawQueueFile(queueFilePath) {
    try {
        const raw = await fs.readFile(queueFilePath, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.defaults && typeof parsed.defaults === 'object') {
            return { ...parsed.defaults };
        }
        return {};
    }
    catch {
        return {};
    }
}
async function readFullQueue(queueFilePath) {
    const raw = await fs.readFile(queueFilePath, 'utf8');
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new Error('invalid queue json structure');
    }
    return { raw, data };
}
function filterToSupportedDefaults(raw) {
    const out = {};
    for (const key of exports.SUPPORTED_QUEUE_DEFAULT_KEYS) {
        if (key in raw) {
            out[key] = raw[key];
        }
    }
    // Explicitly omit workerEnv entirely (do not leak secret values in preview output)
    delete out.workerEnv;
    return out;
}
async function readQueueDefaults(queueFilePath) {
    const raw = await readRawQueueFile(queueFilePath);
    return filterToSupportedDefaults(raw);
}
async function previewQueueDefaults(queueFilePath, proposed) {
    const currentRaw = await readRawQueueFile(queueFilePath);
    const before = filterToSupportedDefaults(currentRaw);
    const prop = (proposed && typeof proposed === 'object' && !Array.isArray(proposed)) ? proposed : {};
    const badKeys = Object.keys(prop).filter((k) => !isSupportedQueueKey(k) || k === 'workerEnv');
    if (badKeys.length > 0) {
        return { ok: false, error: 'redacted error' };
    }
    const after = { ...before };
    for (const [k, v] of Object.entries(prop)) {
        if (isSupportedQueueKey(k) && k !== 'workerEnv') {
            after[k] = v;
        }
    }
    const diff = [];
    for (const key of Object.keys(after)) {
        const b = before[key];
        const a = after[key];
        if (JSON.stringify(b) !== JSON.stringify(a)) {
            diff.push({ key, before: b, after: a });
        }
    }
    return { ok: true, before, after, diff };
}
async function applyQueueDefaults(queueFilePath, proposed) {
    let fullRaw = '';
    let fullData;
    let before = {};
    try {
        const r = await readFullQueue(queueFilePath);
        fullRaw = r.raw;
        fullData = r.data;
        const currentDefaults = (fullData.defaults && typeof fullData.defaults === 'object' && !Array.isArray(fullData.defaults)) ? fullData.defaults : {};
        before = filterToSupportedDefaults(currentDefaults);
    }
    catch {
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
    const updatedDefaults = {
        ...(fullData.defaults && typeof fullData.defaults === 'object' ? fullData.defaults : {})
    };
    const applied = {};
    for (const [k, v] of Object.entries(prop)) {
        if (isSupportedQueueKey(k) && k !== 'workerEnv') {
            updatedDefaults[k] = v;
            applied[k] = v;
        }
    }
    const updatedFull = {
        ...fullData,
        defaults: updatedDefaults,
    };
    // defensive: never overwrite tasks array
    if (Array.isArray(fullData.tasks)) {
        updatedFull.tasks = fullData.tasks;
    }
    let newContent;
    try {
        newContent = JSON.stringify(updatedFull, null, 2);
        // pre-write JSON validation
        JSON.parse(newContent);
    }
    catch {
        return { ok: false, error: 'redacted error' };
    }
    // pre-check task preservation in serialized form
    try {
        const check = JSON.parse(newContent);
        if (Array.isArray(fullData.tasks) && (!Array.isArray(check.tasks) || JSON.stringify(check.tasks) !== JSON.stringify(fullData.tasks))) {
            return { ok: false, error: 'redacted error' };
        }
    }
    catch {
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
        const diff = [];
        const allKeys = new Set([...Object.keys(before), ...Object.keys(afterSupported)]);
        for (const key of allKeys) {
            const b = before[key];
            const a = afterSupported[key];
            if (JSON.stringify(b) !== JSON.stringify(a)) {
                diff.push({ key, before: b, after: a });
            }
        }
        return { ok: true, before, after: afterSupported, diff, applied };
    }
    catch (err) {
        // rollback on any write or post-validation failure
        try {
            await fs.writeFile(queueFilePath, fullRaw, 'utf8');
            rolledBack = true;
        }
        catch {
            // best effort restore
        }
        return { ok: false, error: 'redacted error', rolledBack: rolledBack || undefined };
    }
}
// ===== Settings import/export redaction (Settings 106/107) =====
// Export: schemaVersion + active profile + non-secret settings + key status ONLY (never raw secrets).
// Import: validates schemaVersion, rejects any secret-looking raw values (no raw keys through non-secret path).
exports.SETTINGS_SCHEMA_VERSION = 1;
function createSettingsExport(nonSensitive, keysStatus, activeProfile) {
    const safeKeys = {
        grokApiKey: (keysStatus && keysStatus.grokApiKey === 'configured') ? 'configured' : '',
        openaiApiKey: (keysStatus && keysStatus.openaiApiKey === 'configured') ? 'configured' : '',
        anthropicApiKey: (keysStatus && keysStatus.anthropicApiKey === 'configured') ? 'configured' : '',
    };
    const profiles = {
        fixAgent: nonSensitive?.fixAgent,
        reviewAgent: nonSensitive?.reviewAgent,
    };
    const act = activeProfile || nonSensitive?.activeProfile;
    return {
        schemaVersion: exports.SETTINGS_SCHEMA_VERSION,
        activeProfile: act,
        profiles,
        nonSensitive: { ...(nonSensitive || {}) },
        keys: safeKeys,
    };
}
function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function looksLikeSecret(v) {
    if (v == null)
        return false;
    const s = String(v);
    if (!s || s === 'configured' || s === '')
        return false;
    if (/sk-|Bearer |Authorization|x-api-key|token/i.test(s))
        return true;
    if (/-----BEGIN (RSA |EC |)PRIVATE KEY/i.test(s))
        return true;
    if (/apiKey|secret|password/i.test(s) && s.length > 4)
        return true;
    return false;
}
function validateAndPrepareSettingsImport(input) {
    if (!isRecord(input)) {
        return { ok: false, error: 'malformed input' };
    }
    const data = input;
    if (data.schemaVersion !== exports.SETTINGS_SCHEMA_VERSION) {
        return { ok: false, error: 'unsupported schema version' };
    }
    // Reject if any secret-looking raw key values appear anywhere (protect non-secret import path)
    if (looksLikeSecretIn(data)) {
        return { ok: false, error: 'contains secret-looking keys' };
    }
    const nonSensitive = isRecord(data.nonSensitive) ? { ...data.nonSensitive } : {};
    if (isRecord(data.profiles)) {
        const p = data.profiles;
        if (p.fixAgent !== undefined)
            nonSensitive.fixAgent = p.fixAgent;
        if (p.reviewAgent !== undefined)
            nonSensitive.reviewAgent = p.reviewAgent;
    }
    // Never carry any key fields from import into non-secret payload
    delete nonSensitive.grokApiKey;
    delete nonSensitive.openaiApiKey;
    delete nonSensitive.anthropicApiKey;
    delete nonSensitive.keys;
    return { ok: true, nonSensitive };
}
function looksLikeSecretIn(obj, depth = 0) {
    if (depth > 5 || !obj || typeof obj !== 'object')
        return false;
    if (Array.isArray(obj)) {
        return obj.some((v) => looksLikeSecretIn(v, depth + 1));
    }
    const rec = obj;
    for (const [k, v] of Object.entries(rec)) {
        if (/apiKey|token|secret|password/i.test(k)) {
            if (looksLikeSecret(v))
                return true;
        }
        if (looksLikeSecret(v))
            return true;
        if (isRecord(v) || Array.isArray(v)) {
            if (looksLikeSecretIn(v, depth + 1))
                return true;
        }
    }
    return false;
}
function getEffectiveConfig() {
    const cfg = vscode.workspace.getConfiguration('agentLoop');
    function getValue(key, pkgDefault) {
        const insp = cfg.inspect(key);
        if (insp) {
            if (insp.workspaceFolderValue !== undefined)
                return insp.workspaceFolderValue;
            if (insp.workspaceValue !== undefined)
                return insp.workspaceValue;
            if (insp.globalValue !== undefined)
                return insp.globalValue;
            if (insp.defaultValue !== undefined)
                return insp.defaultValue;
        }
        return pkgDefault;
    }
    const fixAgent = getValue('fixAgent', 'grok');
    const reviewAgent = getValue('reviewAgent', 'codex');
    const fixModel = getValue('fixModel', '') || '';
    const reviewModel = getValue('reviewModel', '') || '';
    return {
        fixAgent: fixAgent || 'grok',
        reviewAgent: reviewAgent || 'codex',
        fixModel,
        reviewModel,
        workerMaxTurns: getValue('workerMaxTurns', 512) ?? 512,
        workerMaxRetries: getValue('workerMaxRetries', 2) ?? 2,
        queuePath: getValue('queuePath', 'agent-loop/scripts/migration-queue.json') || 'agent-loop/scripts/migration-queue.json',
        worktreeScope: getValue('worktreeScope', 'queue') || 'queue',
        baseUrl: getValue('baseUrl', '') || '',
        injectKeysToWorker: getValue('injectKeysToWorker', true) ?? true,
        activeProfile: getValue('activeProfile', 'local') || 'local',
    };
}
exports.PROFILE_PRESETS = {
    local: { fixAgent: 'grok', reviewAgent: 'codex', baseUrl: '' },
    proxy: { fixAgent: 'grok', reviewAgent: 'grok', baseUrl: 'http://127.0.0.1:8080' },
    ci: { fixAgent: 'codex', reviewAgent: 'none', workerMaxTurns: 32 },
    production: { fixAgent: 'grok', reviewAgent: 'codex', workerMaxTurns: 512, baseUrl: '' },
};
function getActiveProfileKey(raw) {
    if (typeof raw === 'string' && raw.trim()) {
        return raw.trim();
    }
    return 'local';
}
function profileValueLooksSecret(v) {
    if (v == null)
        return false;
    const s = String(v);
    if (/sk-|Bearer |Authorization|x-api-key|token/i.test(s))
        return true;
    if (/-----BEGIN (RSA |EC |)PRIVATE KEY/i.test(s))
        return true;
    if (/apiKey|secret|password/i.test(s) && s.length > 4)
        return true;
    return false;
}
function loadProfileStorage(input) {
    const fallbackActive = 'local';
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        return { profiles: {}, activeProfile: fallbackActive, warning: 'redacted warning' };
    }
    try {
        const rec = input;
        let map = rec;
        if (rec.profiles && typeof rec.profiles === 'object' && !Array.isArray(rec.profiles)) {
            map = rec.profiles;
        }
        const profiles = {};
        let hadBad = false;
        for (const [k, v] of Object.entries(map)) {
            if (k === 'activeProfile')
                continue;
            if (!v || typeof v !== 'object' || Array.isArray(v)) {
                hadBad = true;
                continue;
            }
            // reject entire profile entry if any raw value looks secret (even non-key fields)
            const rawVals = Object.values(v);
            if (rawVals.some(profileValueLooksSecret)) {
                hadBad = true;
                continue;
            }
            const sanitized = sanitizeSettingsForSave(v);
            // only keep if has at least one known non-secret
            const p = {};
            for (const ak of ['fixAgent', 'reviewAgent', 'workerMaxTurns', 'workerMaxRetries', 'worktreeScope', 'baseUrl', 'queuePath', 'injectKeysToWorker']) {
                if (ak in sanitized && sanitized[ak] !== undefined) {
                    p[ak] = sanitized[ak];
                }
            }
            if (Object.keys(p).length > 0) {
                profiles[k] = p;
            }
            else {
                hadBad = true;
            }
        }
        const activeRaw = rec.activeProfile ?? map.activeProfile;
        const activeProfile = getActiveProfileKey(activeRaw);
        const out = { profiles, activeProfile };
        if (hadBad) {
            out.warning = 'redacted warning';
        }
        return out;
    }
    catch {
        return { profiles: {}, activeProfile: fallbackActive, warning: 'redacted warning' };
    }
}
// also expose a helper to list preset keys for tests/docs
function listProfilePresetKeys() {
    return Object.keys(exports.PROFILE_PRESETS);
}
// ===== Profile CRUD helpers (Settings 107) =====
// Non-secret only. Name rules: 1-32 alnum _ - , no leading/trailing _-, no empty.
function isValidProfileName(name) {
    if (typeof name !== 'string')
        return false;
    const s = name.trim();
    if (!s || s.length > 32)
        return false;
    if (!/^[a-zA-Z0-9_-]+$/.test(s))
        return false;
    if (/^[-_]/.test(s) || /[-_]$/.test(s))
        return false;
    return true;
}
function sanitizeProfileName(name) {
    if (typeof name !== 'string')
        return '';
    const s = name.trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32);
    // trim leading/trailing _-
    return s.replace(/^[-_]+/, '').replace(/[-_]+$/, '');
}
function applyProfileCreate(current, name, base) {
    const n = sanitizeProfileName(name);
    if (!n || !isValidProfileName(n)) {
        return { ok: false, error: 'invalid profile name' };
    }
    if (current[n]) {
        return { ok: false, error: 'profile exists' };
    }
    const sanitized = sanitizeSettingsForSave(base || {});
    const p = {};
    for (const ak of ['fixAgent', 'reviewAgent', 'workerMaxTurns', 'workerMaxRetries', 'worktreeScope', 'baseUrl', 'queuePath', 'injectKeysToWorker']) {
        if (ak in sanitized && sanitized[ak] !== undefined) {
            p[ak] = sanitized[ak];
        }
    }
    return { ok: true, profiles: { ...current, [n]: p } };
}
function applyProfileRename(current, oldName, newName) {
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
    const next = { ...current };
    next[n] = next[o];
    if (n !== o)
        delete next[o];
    return { ok: true, profiles: next };
}
function applyProfileDuplicate(current, name, newName) {
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
function applyProfileDelete(current, name) {
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
    const next = { ...current };
    delete next[n];
    return { ok: true, profiles: next };
}
//# sourceMappingURL=settingsConfig.js.map