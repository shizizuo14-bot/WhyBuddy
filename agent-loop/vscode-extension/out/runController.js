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
exports.RunController = void 0;
const node_child_process_1 = require("node:child_process");
const fs = __importStar(require("node:fs/promises"));
const path = __importStar(require("node:path"));
const vscode = __importStar(require("vscode"));
const paths_1 = require("./paths");
class RunController {
    repoRoot;
    output;
    secrets;
    onStarted;
    onFinished;
    child = null;
    constructor(repoRoot, output, secrets, onStarted, onFinished) {
        this.repoRoot = repoRoot;
        this.output = output;
        this.secrets = secrets;
        this.onStarted = onStarted;
        this.onFinished = onFinished;
    }
    get running() {
        return this.child !== null;
    }
    async runQueue(extraArgs = []) {
        if (this.child) {
            vscode.window.showWarningMessage('AgentLoop 任务队列已在运行中。');
            return;
        }
        const agentLoopRoot = (0, paths_1.getAgentLoopRoot)(this.repoRoot);
        const scriptPath = path.join(agentLoopRoot, 'scripts', 'run-queue.mjs');
        const qpath = (0, paths_1.queuePath)(this.repoRoot);
        const cfg = (0, paths_1.getAgentLoopConfig)();
        const routingArgs = [];
        if (cfg.fixAgent) {
            routingArgs.push('--fix-agent', cfg.fixAgent);
        }
        if (cfg.reviewAgent === 'none') {
            routingArgs.push('--skip-review');
        }
        else if (cfg.reviewAgent) {
            routingArgs.push('--review-agent', cfg.reviewAgent);
        }
        if (cfg.fixModel) {
            routingArgs.push('--fix-model', cfg.fixModel);
        }
        if (cfg.reviewAgent && cfg.reviewAgent !== 'none' && cfg.reviewModel) {
            routingArgs.push('--review-model', cfg.reviewModel);
        }
        if (typeof cfg.workerMaxTurns === 'number' && cfg.workerMaxTurns > 0) {
            routingArgs.push('--worker-max-turns', String(cfg.workerMaxTurns));
        }
        if (typeof cfg.workerMaxRetries === 'number' && cfg.workerMaxRetries >= 0) {
            routingArgs.push('--worker-max-retries', String(cfg.workerMaxRetries));
        }
        // routing from global settings first; extraArgs (e.g. --only) appended so selection wins, queue entry overrides inside queue win over these
        const scriptArgs = [scriptPath, '--queue', qpath, ...routingArgs, ...extraArgs];
        this.output.show(true);
        this.output.appendLine(`[${new Date().toLocaleTimeString()}] 启动任务队列: node ${scriptArgs.join(' ')}`);
        await setQueueRunning(true);
        this.onStarted();
        const runEnv = await this.getRunEnv();
        const child = (0, node_child_process_1.spawn)(process.execPath, scriptArgs, {
            cwd: agentLoopRoot,
            env: {
                ...process.env,
                ...runEnv,
                // In the VS Code extension host, process.execPath is the Electron (Code.exe) binary,
                // NOT node. Without this flag spawning it would launch VS Code instead of running the
                // queue script. ELECTRON_RUN_AS_NODE makes the same binary behave as node, and it
                // propagates to the loop.js child processes run-queue.mjs spawns (also via execPath).
                ELECTRON_RUN_AS_NODE: '1',
                AGENT_LOOP_PROGRESS: '1',
            },
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsHide: true,
        });
        this.child = child;
        child.stdout?.on('data', (chunk) => {
            this.output.append(chunk.toString());
        });
        child.stderr?.on('data', (chunk) => {
            this.output.append(chunk.toString());
        });
        child.on('close', (code) => {
            void this.finishRun(code);
        });
        child.on('error', (error) => {
            this.output.appendLine(`任务队列启动失败: ${error.message}`);
            void this.finishRun(null);
        });
    }
    // Run a one-shot helper script (e.g. landing) to completion and resolve its exit
    // code. Refuses while a queue run is active; does not set the queue-running flag.
    async runScript(scriptFileName, args = []) {
        if (this.child) {
            vscode.window.showWarningMessage('AgentLoop 有运行正在进行，请先等待它结束。');
            return -1;
        }
        const agentLoopRoot = (0, paths_1.getAgentLoopRoot)(this.repoRoot);
        const scriptPath = path.join(agentLoopRoot, 'scripts', scriptFileName);
        this.output.show(true);
        this.output.appendLine(`[${new Date().toLocaleTimeString()}] 运行: node ${[scriptPath, ...args].join(' ')}`);
        const runEnv = await this.getRunEnv();
        return await new Promise((resolve) => {
            const child = (0, node_child_process_1.spawn)(process.execPath, [scriptPath, ...args], {
                cwd: agentLoopRoot,
                env: {
                    ...process.env,
                    ...runEnv,
                    ELECTRON_RUN_AS_NODE: '1',
                },
                stdio: ['ignore', 'pipe', 'pipe'],
                windowsHide: true,
            });
            child.stdout?.on('data', (chunk) => this.output.append(chunk.toString()));
            child.stderr?.on('data', (chunk) => this.output.append(chunk.toString()));
            child.on('close', (code) => resolve(code ?? -1));
            child.on('error', (error) => {
                this.output.appendLine(`运行失败: ${error.message}`);
                resolve(-1);
            });
        });
    }
    stop() {
        if (!this.child) {
            vscode.window.showInformationMessage('AgentLoop 当前没有运行中的任务队列。');
            return;
        }
        this.output.appendLine(`[${new Date().toLocaleTimeString()}] 请求停止任务队列`);
        void markLatestStopped(this.repoRoot);
    }
    async getRunEnv() {
        const cfg = (0, paths_1.getAgentLoopConfig)();
        const env = {};
        // LLM secrets / base only when injection enabled (never expose raw values)
        if (cfg.injectKeysToWorker && this.secrets) {
            try {
                const grokKey = await this.secrets.get('agentLoop.grokApiKey');
                if (grokKey) {
                    env.GROK_API_KEY = grokKey;
                    env.XAI_API_KEY = grokKey; // common alias
                }
                const openaiKey = await this.secrets.get('agentLoop.openaiApiKey');
                if (openaiKey)
                    env.OPENAI_API_KEY = openaiKey;
                const anthropicKey = await this.secrets.get('agentLoop.anthropicApiKey');
                if (anthropicKey)
                    env.ANTHROPIC_API_KEY = anthropicKey;
                if (cfg.baseUrl) {
                    env.OPENAI_BASE_URL = cfg.baseUrl;
                    // some CLIs use this
                    env.LLM_BASE_URL = cfg.baseUrl;
                }
            }
            catch (e) {
                this.output.appendLine(`读取 LLM Keys 时出错: redacted error`);
            }
        }
        // Apply effective config runtime defaults into the run env/execution
        // (queuePath is also applied via --queue; this ensures diagnostics effectiveConfig
        // drives run execution, and reviewAgent:none etc are fed to actual queue run)
        env.AGENT_LOOP_FIX_AGENT = cfg.fixAgent;
        env.AGENT_LOOP_REVIEW_AGENT = cfg.reviewAgent;
        env.AGENT_LOOP_WORKER_MAX_TURNS = String(cfg.workerMaxTurns);
        env.AGENT_LOOP_WORKER_MAX_RETRIES = String(cfg.workerMaxRetries);
        env.AGENT_LOOP_WORKTREE_SCOPE = cfg.worktreeScope;
        if (cfg.queuePath) {
            env.AGENT_LOOP_QUEUE_PATH = cfg.queuePath;
        }
        env.AGENT_LOOP_INJECT_KEYS = cfg.injectKeysToWorker ? '1' : '0';
        return env;
    }
    async finishRun(exitCode) {
        this.output.appendLine(`[${new Date().toLocaleTimeString()}] 任务队列结束，exit=${exitCode ?? 'null'}`);
        this.child = null;
        await setQueueRunning(false);
        this.onFinished(exitCode);
    }
    dispose() {
        if (this.child) {
            terminateProcessTree(this.child);
            this.child = null;
            void setQueueRunning(false);
        }
    }
}
exports.RunController = RunController;
async function setQueueRunning(running) {
    await vscode.commands.executeCommand('setContext', 'agentLoop.queueRunning', running);
}
async function markLatestStopped(repoRoot) {
    const statePath = (0, paths_1.latestStatePath)(repoRoot);
    try {
        const raw = await fs.readFile(statePath, 'utf8');
        const state = JSON.parse(raw);
        if (typeof state?.status === 'string' && /^(DONE_|HALT_|PAUSED_)/.test(state.status)) {
            return;
        }
        state.status = 'HALT_STOPPED';
        state.stoppedAt = new Date().toISOString();
        await fs.writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    }
    catch {
        // Best effort only; stopping the process tree is the source of truth.
    }
}
function terminateProcessTree(child) {
    if (process.platform === 'win32' && child.pid) {
        const killer = (0, node_child_process_1.spawn)('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
            windowsHide: true,
            stdio: 'ignore',
        });
        killer.on('error', () => child.kill('SIGTERM'));
        return;
    }
    child.kill('SIGTERM');
}
//# sourceMappingURL=runController.js.map