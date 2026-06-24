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
exports.DashboardPanel = void 0;
exports.computeActiveProfileName = computeActiveProfileName;
exports.shouldRejectProfileChangeWhileRunning = shouldRejectProfileChangeWhileRunning;
exports.getProfileRunGuardResult = getProfileRunGuardResult;
exports.enrichProviderHealthResult = enrichProviderHealthResult;
exports.shouldClearProviderHealthOnSettingsChange = shouldClearProviderHealthOnSettingsChange;
const fs = __importStar(require("node:fs/promises"));
const path = __importStar(require("node:path"));
const vscode = __importStar(require("vscode"));
const phaseLabels_1 = require("./phaseLabels");
const settingsMessages_1 = require("./settingsMessages");
const stateReader_1 = require("./stateReader");
const settingsConfig_1 = require("./settingsConfig");
const paths_1 = require("./paths");
function computeActiveProfileName(snapshot) {
    if (!snapshot)
        return null;
    const parts = [snapshot.fixAgent, snapshot.reviewAgent].filter((x) => Boolean(x && String(x).trim()));
    return parts.length ? parts.join(' / ') : null;
}
function shouldRejectProfileChangeWhileRunning(queueRunning, payload) {
    return !(0, settingsConfig_1.checkProfileRunGuard)(queueRunning, payload).allowed;
}
function getProfileRunGuardResult(queueRunning, payload) {
    return (0, settingsConfig_1.checkProfileRunGuard)(queueRunning, payload);
}
class DashboardPanel {
    static current;
    view = 'overview';
    panel;
    secrets;
    disposables = [];
    lastMessage = null;
    lastQueueRunning = false;
    lastActiveProfile = null;
    providerHealthCache = {};
    post(message) {
        this.lastMessage = message;
        void this.panel.webview.postMessage(message);
    }
    constructor(panel, extensionUri, secrets) {
        this.panel = panel;
        this.secrets = secrets;
        this.panel.webview.html = this.getHtml(extensionUri);
        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
        this.panel.webview.onDidReceiveMessage((message) => {
            switch (message?.type) {
                case 'runQueue':
                    void vscode.commands.executeCommand('agentLoop.runQueue');
                    return;
                case 'stopRun':
                    void vscode.commands.executeCommand('agentLoop.stopRun');
                    return;
                case 'refresh':
                    void vscode.commands.executeCommand('agentLoop.refresh');
                    return;
                case 'showOverview':
                    this.view = 'overview';
                    void vscode.commands.executeCommand('agentLoop.showOverview');
                    return;
                case 'openTask':
                    if (message.taskPath) {
                        void vscode.commands.executeCommand('agentLoop.openQueueTask', { taskPath: message.taskPath });
                    }
                    return;
                case 'reEnable':
                    if (message.taskId) {
                        void vscode.commands.executeCommand('agentLoop.reEnableTask', { taskId: message.taskId });
                    }
                    return;
                case 'runTask':
                    if (message.task) {
                        void vscode.commands.executeCommand('agentLoop.runTask', { task: message.task });
                    }
                    return;
                case 'previewLanding':
                    void vscode.commands.executeCommand('agentLoop.previewLanding');
                    return;
                case 'applyLanding':
                    void vscode.commands.executeCommand('agentLoop.applyLanding');
                    return;
                case 'openReport':
                    void vscode.commands.executeCommand('agentLoop.openFile', message.reportPath);
                    return;
                case 'openState':
                    void vscode.commands.executeCommand('agentLoop.openFile', message.statePath);
                    return;
                case 'getSettings':
                    void this.sendSettings();
                    return;
                case 'saveSettings':
                    void this.handleSaveSettings((0, settingsMessages_1.normalizeSaveSettingsPayload)(message));
                    return;
                case 'testProvider':
                    void this.handleTestProvider(message);
                    return;
                case 'testWorkerCli':
                    void this.handleTestWorkerCli(message);
                    return;
                case 'getQueueDefaults':
                    void this.sendQueueDefaults();
                    return;
                case 'previewQueueDefaults':
                    void this.handlePreviewQueueDefaults(message);
                    return;
                case 'applyQueueDefaults':
                    void this.handleApplyQueueDefaults(message);
                    return;
                case 'exportSettings':
                    void this.sendSettingsExport();
                    return;
                case 'importSettings':
                    void this.handleImportSettings(message && (message.payload || message));
                    return;
                case 'getDiagnostics':
                    void this.sendDiagnostics();
                    return;
                case 'listProfiles':
                    void this.sendProfiles();
                    return;
                case 'createProfile':
                    void this.handleCreateProfile(message);
                    return;
                case 'renameProfile':
                    void this.handleRenameProfile(message);
                    return;
                case 'duplicateProfile':
                    void this.handleDuplicateProfile(message);
                    return;
                case 'deleteProfile':
                    void this.handleDeleteProfile(message);
                    return;
                case 'selectProfile':
                    void this.handleSelectProfile(message);
                    return;
                default:
            }
        }, null, this.disposables);
    }
    static show(extensionUri, secrets) {
        if (DashboardPanel.current) {
            DashboardPanel.current.panel.reveal(vscode.ViewColumn.Beside);
            return DashboardPanel.current;
        }
        const panel = vscode.window.createWebviewPanel('agentLoopDashboard', 'AgentLoop 面板', vscode.ViewColumn.Beside, {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
        });
        DashboardPanel.current = new DashboardPanel(panel, extensionUri, secrets);
        return DashboardPanel.current;
    }
    showOverview(overview, current) {
        this.view = 'overview';
        this.lastQueueRunning = Boolean(overview.queueRunning);
        this.lastActiveProfile = computeActiveProfileName(current ? { fixAgent: current.fixAgent, reviewAgent: current.reviewAgent } : null);
        this.panel.webview.postMessage({
            type: 'overview',
            payload: {
                counts: overview.counts,
                queueRunning: overview.queueRunning,
                landing: overview.landing ?? null,
                tasks: overview.tasks.map((task) => ({
                    ...task,
                    taskLabel: shortTaskLabel(task.task),
                    statusLabel: task.status ? (0, phaseLabels_1.phaseLabel)(task.status) : null,
                    badge: badgeFor(task),
                    applyErrorFiles: task.applyErrorFiles ?? [],
                    applyErrorKind: task.applyErrorKind ?? null,
                    applyError: task.applyError ?? null,
                    worktreeErrorFiles: task.worktreeErrorFiles ?? [],
                })),
                current: current?.state
                    ? {
                        taskLabel: current.taskLabel,
                        status: current.displayStatus ?? current.state.status ?? null,
                        phaseLabel: current.phaseLabel,
                        elapsedText: (0, phaseLabels_1.formatElapsed)(current.elapsedMs),
                        staleRun: current.staleRun,
                        profileName: this.lastActiveProfile,
                    }
                    : null,
            },
        });
    }
    async sendSettings() {
        const eff = (0, settingsConfig_1.getEffectiveConfig)();
        const nonSensitive = {
            fixAgent: eff.fixAgent,
            reviewAgent: eff.reviewAgent,
            workerMaxTurns: eff.workerMaxTurns,
            workerMaxRetries: eff.workerMaxRetries,
            queuePath: eff.queuePath,
            worktreeScope: eff.worktreeScope,
        };
        const keysStatus = {
            grokApiKey: '',
            openaiApiKey: '',
            anthropicApiKey: '',
        };
        if (this.secrets) {
            keysStatus.grokApiKey = (await this.secrets.get('agentLoop.grokApiKey')) ? 'configured' : '';
            keysStatus.openaiApiKey = (await this.secrets.get('agentLoop.openaiApiKey')) ? 'configured' : '';
            keysStatus.anthropicApiKey = (await this.secrets.get('agentLoop.anthropicApiKey')) ? 'configured' : '';
        }
        this.post({
            type: 'settings',
            payload: {
                nonSensitive,
                keys: keysStatus,
                baseUrl: eff.baseUrl,
                injectToWorker: eff.injectKeysToWorker,
                queueRunning: this.lastQueueRunning,
                activeProfile: this.lastActiveProfile,
            },
        });
        // re-emit last cached provider health (session memory) so getSettings/refresh does not drop latest status (Settings 107)
        for (const h of Object.values(this.providerHealthCache)) {
            if (h)
                this.post({ type: 'providerHealth', payload: h });
        }
    }
    async handleSaveSettings(payload) {
        const guard = getProfileRunGuardResult(this.lastQueueRunning, payload);
        if (!guard.allowed) {
            this.post({
                type: 'saveBlocked',
                payload: { reason: guard.reason || 'queueRunning', blockedFields: guard.blockedFields, message: guard.message || '队列运行中，禁止修改运行时字段。' },
            });
            // do not sendSettings() here to avoid overwriting client form edits (per 107 do-not-discard)
            return;
        }
        const config = vscode.workspace.getConfiguration('agentLoop');
        const promises = [];
        // Sanitize: reject unsupported enum values and ensure raw keys never enter workspace config (Settings 107)
        const sanitized = (0, settingsConfig_1.sanitizeSettingsForSave)(payload);
        // Non-sensitive settings -> workspace configuration
        const nonSecretKeys = ['fixAgent', 'reviewAgent', 'workerMaxTurns', 'workerMaxRetries', 'queuePath', 'worktreeScope', 'baseUrl', 'activeProfile'];
        for (const key of nonSecretKeys) {
            if (sanitized[key] !== undefined) {
                if (key === 'queuePath') {
                    const r = (0, paths_1.getRepoRoot)() || process.cwd();
                    if (!(0, paths_1.isPathWithinWorkspace)(r, String(sanitized[key]))) {
                        // do not allow absolute outside or traversal writes from dashboard save
                        continue;
                    }
                }
                const target = key === 'queuePath' || key === 'baseUrl' ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Workspace;
                promises.push(config.update(key, sanitized[key], target));
            }
        }
        if (sanitized.injectToWorker !== undefined || sanitized.injectKeysToWorker !== undefined) {
            const inj = sanitized.injectToWorker !== undefined ? sanitized.injectToWorker : sanitized.injectKeysToWorker;
            promises.push(config.update('injectKeysToWorker', inj, vscode.ConfigurationTarget.Workspace));
        }
        // Sensitive keys -> SecretStorage (never log plaintext)
        if (this.secrets) {
            if (typeof payload.grokApiKey === 'string' && payload.grokApiKey) {
                promises.push(this.secrets.store('agentLoop.grokApiKey', payload.grokApiKey));
            }
            if (typeof payload.openaiApiKey === 'string' && payload.openaiApiKey) {
                promises.push(this.secrets.store('agentLoop.openaiApiKey', payload.openaiApiKey));
            }
            if (typeof payload.anthropicApiKey === 'string' && payload.anthropicApiKey) {
                promises.push(this.secrets.store('agentLoop.anthropicApiKey', payload.anthropicApiKey));
            }
            // Support explicit clear with empty string
            if (payload.grokApiKey === '') {
                promises.push(this.secrets.delete('agentLoop.grokApiKey'));
            }
            if (payload.openaiApiKey === '') {
                promises.push(this.secrets.delete('agentLoop.openaiApiKey'));
            }
            if (payload.anthropicApiKey === '') {
                promises.push(this.secrets.delete('agentLoop.anthropicApiKey'));
            }
        }
        await Promise.all(promises);
        if (shouldClearProviderHealthOnSettingsChange(payload)) {
            this.providerHealthCache = {};
        }
        // Refresh UI with latest
        await this.sendSettings();
    }
    async handleTestProvider(message) {
        const provider = (message?.provider ?? message?.payload?.provider);
        if (!provider || !['grok', 'openai', 'anthropic'].includes(provider)) {
            return;
        }
        const start = Date.now();
        let payload;
        try {
            let key;
            if (this.secrets) {
                key = (await this.secrets.get(`agentLoop.${provider}ApiKey`)) || undefined;
            }
            const eff = (0, settingsConfig_1.getEffectiveConfig)();
            const baseUrl = eff.baseUrl;
            const res = await (0, settingsConfig_1.testProviderHealth)(provider, key, { baseUrl: baseUrl || undefined });
            payload = enrichProviderHealthResult(res);
        }
        catch (e) {
            payload = enrichProviderHealthResult({
                provider,
                status: 'failed',
                durationMs: Date.now() - start,
                reason: 'error',
            });
        }
        this.providerHealthCache[provider] = payload;
        this.post({ type: 'providerHealth', payload });
    }
    async handleTestWorkerCli(message) {
        const worker = (message?.worker ?? message?.payload?.worker);
        if (!worker || !['grok', 'codex'].includes(worker)) {
            return;
        }
        const start = Date.now();
        let payload;
        try {
            const res = await (0, settingsConfig_1.testWorkerCliHealth)(worker);
            payload = res;
        }
        catch (e) {
            payload = {
                worker,
                status: 'failed',
                durationMs: Date.now() - start,
                reason: 'error',
            };
        }
        this.post({ type: 'workerCliHealth', payload });
    }
    async sendQueueDefaults() {
        const repo = (0, paths_1.getRepoRoot)() || process.cwd();
        const qpath = (0, paths_1.queuePath)(repo);
        let defaults = {};
        try {
            defaults = await (0, settingsConfig_1.readQueueDefaults)(qpath);
        }
        catch {
            defaults = {};
        }
        this.post({
            type: 'queueDefaults',
            payload: {
                defaults,
                supportedKeys: [...settingsConfig_1.SUPPORTED_QUEUE_DEFAULT_KEYS],
                queuePath: qpath,
            },
        });
    }
    async handlePreviewQueueDefaults(message) {
        const proposed = (message && (message.proposed || (message.payload && message.payload.proposed))) || {};
        const repo = (0, paths_1.getRepoRoot)() || process.cwd();
        const qpath = (0, paths_1.queuePath)(repo);
        let result;
        try {
            result = await (0, settingsConfig_1.previewQueueDefaults)(qpath, proposed);
        }
        catch {
            result = { ok: false, error: 'redacted error' };
        }
        this.post({ type: 'queuePreview', payload: result });
    }
    async handleApplyQueueDefaults(message) {
        const proposed = (message && (message.proposed || (message.payload && message.payload.proposed))) || {};
        const repo = (0, paths_1.getRepoRoot)() || process.cwd();
        const qpath = (0, paths_1.queuePath)(repo);
        let result;
        try {
            result = await (0, settingsConfig_1.applyQueueDefaults)(qpath, proposed);
        }
        catch {
            result = { ok: false, error: 'redacted error' };
        }
        this.post({ type: 'queueApply', payload: result });
        if (result && result.ok) {
            // refresh current defaults after successful apply
            void this.sendQueueDefaults();
        }
    }
    async sendSettingsExport() {
        const eff = (0, settingsConfig_1.getEffectiveConfig)();
        const nonSensitive = {
            fixAgent: eff.fixAgent,
            reviewAgent: eff.reviewAgent,
            workerMaxTurns: eff.workerMaxTurns,
            workerMaxRetries: eff.workerMaxRetries,
            queuePath: eff.queuePath,
            worktreeScope: eff.worktreeScope,
            baseUrl: eff.baseUrl,
            injectToWorker: eff.injectKeysToWorker,
            activeProfile: eff.activeProfile,
        };
        const keysStatus = {
            grokApiKey: '',
            openaiApiKey: '',
            anthropicApiKey: '',
        };
        if (this.secrets) {
            keysStatus.grokApiKey = (await this.secrets.get('agentLoop.grokApiKey')) ? 'configured' : '';
            keysStatus.openaiApiKey = (await this.secrets.get('agentLoop.openaiApiKey')) ? 'configured' : '';
            keysStatus.anthropicApiKey = (await this.secrets.get('agentLoop.anthropicApiKey')) ? 'configured' : '';
        }
        const exportPayload = (0, settingsConfig_1.createSettingsExport)(nonSensitive, keysStatus, eff.activeProfile);
        this.post({
            type: 'settingsExported',
            payload: exportPayload,
        });
    }
    async sendDiagnostics() {
        const repo = (0, paths_1.getRepoRoot)() || process.cwd();
        const qpath = (0, paths_1.queuePath)(repo);
        const eff = (0, settingsConfig_1.getEffectiveConfig)();
        const configuredQ = eff.queuePath || '';
        const pathRejected = !(0, paths_1.isPathWithinWorkspace)(repo, configuredQ);
        const effectiveConfig = {
            fixAgent: eff.fixAgent,
            reviewAgent: eff.reviewAgent,
            workerMaxTurns: eff.workerMaxTurns,
            workerMaxRetries: eff.workerMaxRetries,
            queuePath: eff.queuePath,
            worktreeScope: eff.worktreeScope,
            baseUrl: eff.baseUrl,
            injectToWorker: eff.injectKeysToWorker,
        };
        const config = vscode.workspace.getConfiguration('agentLoop');
        const configSources = {};
        const sourceKeys = ['fixAgent', 'reviewAgent', 'workerMaxTurns', 'workerMaxRetries', 'queuePath', 'worktreeScope', 'baseUrl', 'injectKeysToWorker'];
        for (const k of sourceKeys) {
            const insp = config.inspect(k);
            let src = 'default';
            if (insp) {
                if (insp.workspaceFolderValue !== undefined)
                    src = 'workspaceFolder';
                else if (insp.workspaceValue !== undefined)
                    src = 'workspace';
                else if (insp.globalValue !== undefined)
                    src = 'user';
            }
            configSources[k] = src;
        }
        const keysStatus = {
            grokApiKey: '',
            openaiApiKey: '',
            anthropicApiKey: '',
        };
        if (this.secrets) {
            keysStatus.grokApiKey = (await this.secrets.get('agentLoop.grokApiKey')) ? 'configured' : '';
            keysStatus.openaiApiKey = (await this.secrets.get('agentLoop.openaiApiKey')) ? 'configured' : '';
            keysStatus.anthropicApiKey = (await this.secrets.get('agentLoop.anthropicApiKey')) ? 'configured' : '';
        }
        let queueFileExists = false;
        try {
            await fs.access(qpath);
            queueFileExists = true;
        }
        catch { }
        let lastRunState = null;
        try {
            const latestStatePath = path.join(repo, '.agent-loop', 'latest', 'state.json');
            lastRunState = await (0, stateReader_1.readJsonFile)(latestStatePath);
        }
        catch { }
        const lastStateSummary = lastRunState ? {
            runId: lastRunState.runId ?? null,
            status: lastRunState.status ?? null,
            task: lastRunState.options?.task ?? null,
        } : null;
        const warnings = [];
        const anyKeyConfigured = Object.values(keysStatus).some((v) => v === 'configured');
        warnings.push({
            category: anyKeyConfigured ? 'ready' : 'skipped',
            message: anyKeyConfigured ? 'provider key(s) configured' : 'no provider keys configured',
        });
        warnings.push({
            category: effectiveConfig.injectToWorker ? 'ready' : 'skipped',
            message: effectiveConfig.injectToWorker ? 'key injection enabled' : 'key injection disabled',
        });
        warnings.push({
            category: queueFileExists ? 'ready' : 'failed',
            message: queueFileExists ? 'queue file present at resolved path' : 'queue file missing',
        });
        if (pathRejected) {
            // Diagnostics reports rejected paths with redacted errors
            warnings.push({
                category: 'failed',
                message: 'redacted error',
            });
        }
        const ls = (lastStateSummary && lastStateSummary.status) || 'unknown';
        let lastCat = 'unknown';
        if (/DONE|applied|reviewed/i.test(ls))
            lastCat = 'ready';
        else if (/HALT|fail|error|crash/i.test(ls))
            lastCat = 'failed';
        else if (!lastStateSummary)
            lastCat = 'skipped';
        warnings.push({ category: lastCat, message: `last run state: ${ls}` });
        const payload = {
            generatedAt: new Date().toISOString(),
            effectiveConfig,
            configSources,
            keys: keysStatus,
            queuePath: qpath,
            repoRoot: repo,
            lastRunState: lastStateSummary,
            lastRunStatus: lastStateSummary,
            providerHealth: { ...this.providerHealthCache },
            warnings,
        };
        this.post({ type: 'diagnostics', payload: (0, settingsMessages_1.redactSettingsMessageForLog)(payload) });
    }
    async handleImportSettings(raw) {
        let result;
        try {
            result = (0, settingsConfig_1.validateAndPrepareSettingsImport)(raw);
        }
        catch {
            result = { ok: false, error: 'malformed JSON' };
        }
        if (!result.ok || !result.nonSensitive) {
            this.post({ type: 'importSettingsResult', payload: { ok: false, error: result.error || 'invalid import' } });
            return;
        }
        // Apply ONLY non-secret parts (never secrets/raw keys)
        const payload = { ...result.nonSensitive };
        // strip any accidental secret fields defensively
        delete payload.grokApiKey;
        delete payload.openaiApiKey;
        delete payload.anthropicApiKey;
        // Sanitize for enum constraints and secret exclusion before save (Settings 107)
        const sanitized = (0, settingsConfig_1.sanitizeSettingsForSave)(payload);
        const config = vscode.workspace.getConfiguration('agentLoop');
        const promises = [];
        const nonSecretKeys = ['fixAgent', 'reviewAgent', 'workerMaxTurns', 'workerMaxRetries', 'queuePath', 'worktreeScope', 'baseUrl', 'activeProfile'];
        for (const key of nonSecretKeys) {
            if (sanitized[key] !== undefined) {
                if (key === 'queuePath') {
                    const r = (0, paths_1.getRepoRoot)() || process.cwd();
                    if (!(0, paths_1.isPathWithinWorkspace)(r, String(sanitized[key]))) {
                        // do not allow absolute outside or traversal writes from dashboard import
                        continue;
                    }
                }
                const target = (key === 'queuePath' || key === 'baseUrl') ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Workspace;
                promises.push(config.update(key, sanitized[key], target));
            }
        }
        if (sanitized.injectKeysToWorker !== undefined) {
            promises.push(config.update('injectKeysToWorker', sanitized.injectKeysToWorker, vscode.ConfigurationTarget.Workspace));
        }
        else if (sanitized.injectToWorker !== undefined) {
            promises.push(config.update('injectKeysToWorker', sanitized.injectToWorker, vscode.ConfigurationTarget.Workspace));
        }
        await Promise.all(promises);
        this.post({ type: 'importSettingsResult', payload: { ok: true } });
        await this.sendSettings();
    }
    async sendProfiles() {
        const config = vscode.workspace.getConfiguration('agentLoop');
        const activeRaw = config.get('activeProfile') || 'local';
        let stored = {};
        try {
            const p = config.get('profiles');
            if (p && typeof p === 'object' && !Array.isArray(p))
                stored = p;
        }
        catch { }
        // seed presets if no stored profiles
        const base = Object.keys(stored).length > 0 ? stored : { ...settingsConfig_1.PROFILE_PRESETS };
        const loaded = (0, settingsConfig_1.loadProfileStorage)({ ...base, activeProfile: activeRaw });
        this.post({
            type: 'profiles',
            payload: {
                profiles: loaded.profiles,
                activeProfile: loaded.activeProfile || 'local',
            },
        });
    }
    async handleCreateProfile(message) {
        const name = (message && (message.name || (message.payload && message.payload.name))) || '';
        const values = (message && (message.values || (message.payload && message.payload.values))) || {};
        const config = vscode.workspace.getConfiguration('agentLoop');
        let current = {};
        try {
            const p = config.get('profiles');
            if (p && typeof p === 'object' && !Array.isArray(p))
                current = p;
        }
        catch { }
        if (Object.keys(current).length === 0)
            current = { ...settingsConfig_1.PROFILE_PRESETS };
        const res = (0, settingsConfig_1.applyProfileCreate)(current, name, values);
        if (!res.ok) {
            this.post({ type: 'profileError', payload: { error: res.error || 'invalid' } });
            await this.sendProfiles();
            return;
        }
        await config.update('profiles', res.profiles, vscode.ConfigurationTarget.Workspace);
        await this.sendProfiles();
    }
    async handleRenameProfile(message) {
        const oldName = (message && (message.oldName || (message.payload && message.payload.oldName))) || '';
        const newName = (message && (message.newName || (message.payload && message.payload.newName))) || '';
        const config = vscode.workspace.getConfiguration('agentLoop');
        let current = {};
        try {
            const p = config.get('profiles');
            if (p && typeof p === 'object' && !Array.isArray(p))
                current = p;
        }
        catch { }
        if (Object.keys(current).length === 0)
            current = { ...settingsConfig_1.PROFILE_PRESETS };
        const res = (0, settingsConfig_1.applyProfileRename)(current, oldName, newName);
        if (!res.ok) {
            this.post({ type: 'profileError', payload: { error: res.error || 'invalid' } });
            await this.sendProfiles();
            return;
        }
        const next = res.profiles || current;
        // if active was old, update active too
        const active = config.get('activeProfile') || '';
        if ((0, settingsConfig_1.sanitizeProfileName)(active) === (0, settingsConfig_1.sanitizeProfileName)(oldName)) {
            await config.update('activeProfile', (0, settingsConfig_1.sanitizeProfileName)(newName), vscode.ConfigurationTarget.Workspace);
        }
        await config.update('profiles', next, vscode.ConfigurationTarget.Workspace);
        await this.sendProfiles();
        await this.sendSettings();
    }
    async handleDuplicateProfile(message) {
        const name = (message && (message.name || (message.payload && message.payload.name))) || '';
        const newName = (message && (message.newName || (message.payload && message.payload.newName))) || '';
        const config = vscode.workspace.getConfiguration('agentLoop');
        let current = {};
        try {
            const p = config.get('profiles');
            if (p && typeof p === 'object' && !Array.isArray(p))
                current = p;
        }
        catch { }
        if (Object.keys(current).length === 0)
            current = { ...settingsConfig_1.PROFILE_PRESETS };
        const res = (0, settingsConfig_1.applyProfileDuplicate)(current, name, newName);
        if (!res.ok) {
            this.post({ type: 'profileError', payload: { error: res.error || 'invalid' } });
            await this.sendProfiles();
            return;
        }
        await config.update('profiles', res.profiles, vscode.ConfigurationTarget.Workspace);
        await this.sendProfiles();
    }
    async handleDeleteProfile(message) {
        const name = (message && (message.name || (message.payload && message.payload.name))) || '';
        const config = vscode.workspace.getConfiguration('agentLoop');
        let current = {};
        try {
            const p = config.get('profiles');
            if (p && typeof p === 'object' && !Array.isArray(p))
                current = p;
        }
        catch { }
        if (Object.keys(current).length === 0)
            current = { ...settingsConfig_1.PROFILE_PRESETS };
        const res = (0, settingsConfig_1.applyProfileDelete)(current, name);
        if (!res.ok) {
            this.post({ type: 'profileError', payload: { error: res.error || 'invalid' } });
            await this.sendProfiles();
            return;
        }
        const next = res.profiles || {};
        const active = config.get('activeProfile') || 'local';
        if ((0, settingsConfig_1.sanitizeProfileName)(active) === (0, settingsConfig_1.sanitizeProfileName)(name)) {
            const remaining = Object.keys(next)[0] || 'local';
            await config.update('activeProfile', remaining, vscode.ConfigurationTarget.Workspace);
        }
        await config.update('profiles', next, vscode.ConfigurationTarget.Workspace);
        await this.sendProfiles();
        await this.sendSettings();
    }
    async handleSelectProfile(message) {
        const name = (message && (message.name || (message.payload && message.payload.name))) || '';
        const n = (0, settingsConfig_1.sanitizeProfileName)(name);
        if (!n || !(0, settingsConfig_1.isValidProfileName)(n)) {
            this.post({ type: 'profileError', payload: { error: 'invalid profile name' } });
            return;
        }
        if (this.lastQueueRunning) {
            this.post({
                type: 'saveBlocked',
                payload: { reason: 'queueRunning', blockedFields: ['activeProfile'], message: '队列运行中，禁止切换 profile。' },
            });
            await this.sendProfiles();
            return;
        }
        const config = vscode.workspace.getConfiguration('agentLoop');
        await config.update('activeProfile', n, vscode.ConfigurationTarget.Workspace);
        // also apply the profile values to flat non-secret to make select effective
        let current = {};
        try {
            const p = config.get('profiles');
            if (p && typeof p === 'object' && !Array.isArray(p))
                current = p;
        }
        catch { }
        if (Object.keys(current).length === 0)
            current = { ...settingsConfig_1.PROFILE_PRESETS };
        const loaded = (0, settingsConfig_1.loadProfileStorage)({ ...current, activeProfile: n });
        const prof = loaded.profiles[n] || {};
        const flatKeys = ['fixAgent', 'reviewAgent', 'workerMaxTurns', 'workerMaxRetries', 'queuePath', 'worktreeScope', 'baseUrl'];
        const promises = [];
        for (const k of flatKeys) {
            if (prof[k] !== undefined) {
                promises.push(config.update(k, prof[k], vscode.ConfigurationTarget.Workspace));
            }
        }
        if (prof.injectKeysToWorker !== undefined) {
            promises.push(config.update('injectKeysToWorker', prof.injectKeysToWorker, vscode.ConfigurationTarget.Workspace));
        }
        await Promise.all(promises);
        await this.sendProfiles();
        await this.sendSettings();
    }
    update(snapshot) {
        this.view = 'detail';
        const state = snapshot.state;
        const displayStatus = snapshot.displayStatus ?? state?.status ?? null;
        const agentText = (0, phaseLabels_1.activeAgentLabel)(displayStatus ?? undefined, state, {
            fixAgent: snapshot.fixAgent,
            reviewAgent: snapshot.reviewAgent,
        });
        const runDir = state?.artifacts?.runDir || null;
        const evidence = (0, stateReader_1.extractRunEvidence)(state);
        this.panel.webview.postMessage({
            type: 'detail',
            payload: {
                taskPath: state?.options?.task ?? null,
                diffText: evidence.diffText,
                diffTruncated: evidence.diffTruncated,
                hasDiff: evidence.hasDiff,
                gateFailure: evidence.gateFailure,
                gateFailureTruncated: evidence.gateFailureTruncated,
                taskLabel: snapshot.taskLabel,
                runId: state?.runId ?? null,
                status: displayStatus,
                rawStatus: state?.status ?? null,
                phaseLabel: snapshot.phaseLabel,
                elapsedText: (0, phaseLabels_1.formatElapsed)(snapshot.elapsedMs),
                gateText: snapshot.displayGate.text,
                gateOk: snapshot.displayGate.ok,
                agentText,
                agentLogKb: snapshot.agentLogBytes ? Math.max(1, Math.round(snapshot.agentLogBytes / 1024)) : 0,
                roleText: `${snapshot.fixAgent}修${snapshot.reviewAgent ? ` + ${snapshot.reviewAgent}审` : ''}`,
                fixAgent: snapshot.fixAgent,
                reviewAgent: snapshot.reviewAgent,
                profileName: computeActiveProfileName({ fixAgent: snapshot.fixAgent, reviewAgent: snapshot.reviewAgent }),
                runMode: snapshot.runMode,
                pipelineSteps: snapshot.pipelineSteps,
                agentTail: snapshot.agentTail,
                details: snapshot.details,
                staleRun: snapshot.staleRun,
                iterations: summarizeIterations(state),
                reviewRounds: (state?.reviewRounds ?? []).map((round) => ({
                    round: round.round ?? null,
                    verdict: round.verdict ?? null,
                    decision: round.decision ?? null,
                    summary: round.summary ?? null,
                    riskLevel: round.riskLevel ?? null,
                    applyRecommendation: round.applyRecommendation ?? null,
                    verifiedBoundaries: Array.isArray(round.verifiedBoundaries) ? round.verifiedBoundaries : [],
                    findings: Array.isArray(round.findings) ? round.findings : [],
                })),
                halt: buildHaltInfo(state),
                events: (snapshot.events ?? []).map((event) => ({
                    status: event.status,
                    label: (0, phaseLabels_1.phaseLabel)(event.status),
                    timeText: formatClock(event.ts),
                    iteration: event.iteration,
                })),
                landing: snapshot.landing,
                finalReport: snapshot.finalReport,
                guardPolicy: snapshot.guardPolicy,
                statePath: snapshot.statePath ?? null,
                reportPath: runDir ? path.join(runDir, 'final-report.md') : null,
                reportJsonPath: runDir ? path.join(runDir, 'final-report.json') : null,
                landingPath: runDir ? path.join(runDir, 'landing.json') : null,
            },
        });
    }
    getHtml(extensionUri) {
        const styleUri = this.panel.webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'dashboard.css'));
        const bundleStyleUri = this.panel.webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'dashboard.bundle.css'));
        const bundleScriptUri = this.panel.webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'dashboard.bundle.js'));
        const scriptUri = this.panel.webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'dashboard.js'));
        const brandUri = this.panel.webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'sliderule-brand.svg'));
        const nonce = String(Date.now());
        return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${this.panel.webview.cspSource} data:; style-src ${this.panel.webview.cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="stylesheet" href="${styleUri}">
  <link rel="stylesheet" href="${bundleStyleUri}">
  <title>AgentLoop</title>
</head>
<body>
  <div id="app"></div>
  <script nonce="${nonce}">window.__AGENT_LOOP_ASSETS__ = { brandLogo: ${JSON.stringify(String(brandUri))} }; window.__AGENT_LOOP_CSP_NONCE__ = ${JSON.stringify(nonce)};</script>
  <script nonce="${nonce}" src="${bundleScriptUri}"></script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
  <!-- Theme sync for robust --vscode-* variable bridging.
       VS Code updates body classes on theme change, so main CSS rules (body.vscode-*) react automatically.
       The data attr is a small helper for attribute-based rules. A full MutationObserver is overkill for now. -->
  <script nonce="${nonce}">(function(){try{var k=document.body.className.match(/vscode-(light|dark|high-contrast)/);if(k)document.documentElement.setAttribute('data-vscode-theme-kind',k[0]);}catch(e){}})();</script>
</body>
</html>`;
    }
    dispose() {
        DashboardPanel.current = undefined;
        while (this.disposables.length) {
            this.disposables.pop()?.dispose();
        }
        this.panel.dispose();
    }
}
exports.DashboardPanel = DashboardPanel;
function summarizeIterations(state) {
    const iterations = Array.isArray(state?.iterations) ? state.iterations : [];
    return iterations.map((iteration) => ({
        iteration: iteration.iteration,
        gateOk: iteration.gate ? iteration.gate.ok ?? null : null,
        failureCount: iteration.gate?.failureCount ?? null,
        diffBytes: iteration.diff?.bytes ?? 0,
        guard: Boolean(iteration.diffGuard?.hasFindings),
        attempts: Array.isArray(iteration.attempts) ? iteration.attempts.length : 0,
    }));
}
function buildHaltInfo(state) {
    const status = state?.status;
    if (!status || !status.startsWith('HALT_'))
        return null;
    let reason = null;
    if (status === 'HALT_NO_SUCCESS_CRITERIA')
        reason = state?.admission?.reason ?? 'NO_SUCCESS_CRITERIA';
    else if (state?.guardReason)
        reason = state.guardReason;
    else if (state?.reviewVerdict)
        reason = `review: ${state.reviewVerdict}`;
    return { status, reason };
}
function formatClock(ts) {
    if (!ts)
        return '';
    const date = new Date(ts);
    if (Number.isNaN(date.getTime()))
        return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
function shortTaskLabel(taskPath) {
    return (taskPath.split('/').pop() || taskPath).replace(/\.md$/, '');
}
function badgeFor(task) {
    if (task.running)
        return 'running';
    if (!task.enabled)
        return 'disabled';
    if (task.autoDisabled)
        return 'disabled';
    if (task.outcomeGroup)
        return task.outcomeGroup;
    if (task.outcome)
        return task.outcome;
    return 'pending';
}
// Settings 107: exported for test surface + used internally for enriching cached health entries
function enrichProviderHealthResult(res) {
    if (!res || typeof res !== 'object')
        return res;
    const checkedAt = new Date().toISOString();
    const durationMs = (res.durationMs ?? res.duration ?? 0);
    return {
        ...res,
        durationMs,
        duration: durationMs,
        checkedAt,
    };
}
function shouldClearProviderHealthOnSettingsChange(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload))
        return false;
    const keys = Object.keys(payload);
    if (keys.some((k) => ['grokApiKey', 'openaiApiKey', 'anthropicApiKey'].includes(k)))
        return true;
    if ('baseUrl' in payload)
        return true;
    return false;
}
//# sourceMappingURL=dashboardPanel.js.map