import fs from 'node:fs/promises';
import path from 'node:path';
import { runProcess } from './runProcess.js';

export function getWorktreePath({ repoRoot, name }) {
  if (!/^[A-Za-z0-9._-]+$/.test(name || '')) {
    throw new Error('invalid worktree name');
  }
  return path.join(repoRoot, '.worktrees', name);
}

export async function ensureWorktree({
  repoRoot,
  name,
  timeoutMs = 120000,
  run = runProcess,
}) {
  const worktreePath = getWorktreePath({ repoRoot, name });
  await ensureWorktreesIgnored({ repoRoot, run, timeoutMs });

  try {
    const stat = await fs.stat(worktreePath);
    if (stat.isDirectory()) {
      return { path: worktreePath, created: false };
    }
  } catch {
    // create below
  }

  await fs.mkdir(path.dirname(worktreePath), { recursive: true });
  const branch = `agent-loop/${name}`;
  const result = await run('git', ['worktree', 'add', '-b', branch, worktreePath], {
    cwd: repoRoot,
    timeoutMs,
  });
  if (result.exitCode !== 0 || result.timedOut || result.spawnError) {
    throw new Error(`git worktree add failed: ${result.stderr || result.spawnError || result.exitCode}`);
  }
  return { path: worktreePath, created: true, branch };
}

async function ensureWorktreesIgnored({ repoRoot, run, timeoutMs }) {
  const ignored = await run('git', ['check-ignore', '-q', '.worktrees/probe'], {
    cwd: repoRoot,
    timeoutMs,
  });
  if (ignored.exitCode === 0) return;
  throw new Error('.worktrees must be ignored before creating agent-loop worktrees');
}
