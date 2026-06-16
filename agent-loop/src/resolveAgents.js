import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runProcess } from './runProcess.js';

export function pickNewestCodexCandidate(candidates) {
  return [...candidates].sort((a, b) => compareCodexPaths(b, a))[0] ?? null;
}

export async function resolveAgents() {
  const codex = parseCommandOverride(process.env.AGENT_LOOP_CODEX_COMMAND_JSON)
    || process.env.AGENT_LOOP_CODEX_EXE
    || resolveCodexExecutable();
  const grok = parseCommandOverride(process.env.AGENT_LOOP_GROK_COMMAND_JSON)
    || process.env.AGENT_LOOP_GROK_EXE
    || await resolveGrokExecutable();
  return { codex, grok };
}

export function resolveCodexExecutable() {
  const home = os.homedir();
  const roots = [
    path.join(home, '.vscode', 'extensions'),
    path.join(home, '.vscode-insiders', 'extensions'),
  ];
  const candidates = [];

  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const entry of fs.readdirSync(root)) {
      if (!entry.startsWith('openai.chatgpt-')) continue;
      const dir = path.join(root, entry);
      const exe = findFile(dir, 'codex.exe');
      if (exe) candidates.push(exe);
    }
  }

  return pickNewestCodexCandidate(candidates);
}

export async function resolveGrokExecutable() {
  const fromWhere = await runProcess('where.exe', ['grok'], {
    cwd: process.cwd(),
    timeoutMs: 5000,
  });
  if (fromWhere.exitCode === 0) {
    const first = fromWhere.stdout.split(/\r?\n/).map((s) => s.trim()).find(Boolean);
    if (first) return first;
  }

  const exe = path.join(os.homedir(), '.grok', 'bin', process.platform === 'win32' ? 'grok.exe' : 'grok');
  return fs.existsSync(exe) ? exe : null;
}

function findFile(root, fileName) {
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isFile() && entry.name === fileName) return full;
      if (entry.isDirectory()) stack.push(full);
    }
  }
  return null;
}

function compareCodexPaths(a, b) {
  const av = parseCodexVersion(a);
  const bv = parseCodexVersion(b);
  for (let i = 0; i < Math.max(av.length, bv.length); i++) {
    const diff = (av[i] ?? 0) - (bv[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return a.localeCompare(b);
}

function parseCodexVersion(candidate) {
  const match = candidate.match(/openai\.chatgpt-([0-9.]+)/i);
  return match ? match[1].split('.').map((n) => Number.parseInt(n, 10) || 0) : [0];
}

function parseCommandOverride(raw) {
  if (!raw) return null;
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.some((part) => typeof part !== 'string' || part.length === 0)) {
    throw new Error('agent command override must be a non-empty JSON string array');
  }
  return parsed;
}
