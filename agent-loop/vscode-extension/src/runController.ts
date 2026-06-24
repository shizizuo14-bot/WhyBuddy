import { spawn, type ChildProcess } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { getAgentLoopConfig, getAgentLoopRoot, latestStatePath, queuePath } from './paths';

export class RunController implements vscode.Disposable {
  private child: ChildProcess | null = null;

  constructor(
    private readonly repoRoot: string,
    private readonly output: vscode.OutputChannel,
    private readonly secrets: vscode.SecretStorage | undefined,
    private readonly onStarted: () => void,
    private readonly onFinished: (exitCode: number | null) => void,
  ) {}

  get running(): boolean {
    return this.child !== null;
  }

  async runQueue(extraArgs: string[] = []): Promise<void> {
    if (this.child) {
      vscode.window.showWarningMessage('AgentLoop 任务队列已在运行中。');
      return;
    }

    const agentLoopRoot = getAgentLoopRoot(this.repoRoot);
    const scriptPath = path.join(agentLoopRoot, 'scripts', 'run-queue.mjs');
    const qpath = queuePath(this.repoRoot);
    const cfg = getAgentLoopConfig();
    const routingArgs = [];
    if (cfg.fixAgent) {
      routingArgs.push('--fix-agent', cfg.fixAgent);
    }
    if (cfg.reviewAgent === 'none') {
      routingArgs.push('--skip-review');
    } else if (cfg.reviewAgent) {
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

    const child = spawn(process.execPath, scriptArgs, {
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

    child.stdout?.on('data', (chunk: Buffer) => {
      this.output.append(chunk.toString());
    });
    child.stderr?.on('data', (chunk: Buffer) => {
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
  async runScript(scriptFileName: string, args: string[] = []): Promise<number> {
    if (this.child) {
      vscode.window.showWarningMessage('AgentLoop 有运行正在进行，请先等待它结束。');
      return -1;
    }
    const agentLoopRoot = getAgentLoopRoot(this.repoRoot);
    const scriptPath = path.join(agentLoopRoot, 'scripts', scriptFileName);
    this.output.show(true);
    this.output.appendLine(`[${new Date().toLocaleTimeString()}] 运行: node ${[scriptPath, ...args].join(' ')}`);
    const runEnv = await this.getRunEnv();
    return await new Promise<number>((resolve) => {
      const child = spawn(process.execPath, [scriptPath, ...args], {
        cwd: agentLoopRoot,
        env: {
          ...process.env,
          ...runEnv,
          ELECTRON_RUN_AS_NODE: '1',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
      child.stdout?.on('data', (chunk: Buffer) => this.output.append(chunk.toString()));
      child.stderr?.on('data', (chunk: Buffer) => this.output.append(chunk.toString()));
      child.on('close', (code) => resolve(code ?? -1));
      child.on('error', (error) => {
        this.output.appendLine(`运行失败: ${error.message}`);
        resolve(-1);
      });
    });
  }

  stop(): void {
    if (!this.child) {
      vscode.window.showInformationMessage('AgentLoop 当前没有运行中的任务队列。');
      return;
    }
    this.output.appendLine(`[${new Date().toLocaleTimeString()}] 请求停止任务队列`);
    void markLatestStopped(this.repoRoot);
  }

  private async getRunEnv(): Promise<Record<string, string>> {
    const cfg = getAgentLoopConfig();
    const env: Record<string, string> = {};

    // LLM secrets / base only when injection enabled (never expose raw values)
    if (cfg.injectKeysToWorker && this.secrets) {
      try {
        const grokKey = await this.secrets.get('agentLoop.grokApiKey');
        if (grokKey) {
          env.GROK_API_KEY = grokKey;
          env.XAI_API_KEY = grokKey; // common alias
        }

        const openaiKey = await this.secrets.get('agentLoop.openaiApiKey');
        if (openaiKey) env.OPENAI_API_KEY = openaiKey;

        const anthropicKey = await this.secrets.get('agentLoop.anthropicApiKey');
        if (anthropicKey) env.ANTHROPIC_API_KEY = anthropicKey;

        if (cfg.baseUrl) {
          env.OPENAI_BASE_URL = cfg.baseUrl;
          // some CLIs use this
          env.LLM_BASE_URL = cfg.baseUrl;
        }
      } catch (e) {
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

  private async finishRun(exitCode: number | null): Promise<void> {
    this.output.appendLine(`[${new Date().toLocaleTimeString()}] 任务队列结束，exit=${exitCode ?? 'null'}`);
    this.child = null;
    await setQueueRunning(false);
    this.onFinished(exitCode);
  }

  dispose(): void {
    if (this.child) {
      terminateProcessTree(this.child);
      this.child = null;
      void setQueueRunning(false);
    }
  }
}

async function setQueueRunning(running: boolean): Promise<void> {
  await vscode.commands.executeCommand('setContext', 'agentLoop.queueRunning', running);
}

async function markLatestStopped(repoRoot: string): Promise<void> {
  const statePath = latestStatePath(repoRoot);
  try {
    const raw = await fs.readFile(statePath, 'utf8');
    const state = JSON.parse(raw);
    if (typeof state?.status === 'string' && /^(DONE_|HALT_|PAUSED_)/.test(state.status)) {
      return;
    }
    state.status = 'HALT_STOPPED';
    state.stoppedAt = new Date().toISOString();
    await fs.writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  } catch {
    // Best effort only; stopping the process tree is the source of truth.
  }
}

function terminateProcessTree(child: ChildProcess): void {
  if (process.platform === 'win32' && child.pid) {
    const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
      windowsHide: true,
      stdio: 'ignore',
    });
    killer.on('error', () => child.kill('SIGTERM'));
    return;
  }
  child.kill('SIGTERM');
}
