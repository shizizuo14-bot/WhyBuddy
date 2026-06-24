import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { getEffectiveConfig, type AgentLoopConfig } from './settingsConfig';

export function getRepoRoot(): string | null {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders?.length) return null;

  for (const folder of folders) {
    const candidate = path.join(folder.uri.fsPath, 'agent-loop', 'package.json');
    if (existsSync(candidate)) return folder.uri.fsPath;
  }

  return folders[0].uri.fsPath;
}

export function getAgentLoopRoot(repoRoot: string): string {
  return path.join(repoRoot, 'agent-loop');
}

export function latestDir(repoRoot: string): string {
  return path.join(repoRoot, '.agent-loop', 'latest');
}

export function latestStatePath(repoRoot: string): string {
  return path.join(latestDir(repoRoot), 'state.json');
}

export function latestReportPath(repoRoot: string): string {
  return path.join(latestDir(repoRoot), 'final-report.md');
}

export function runsDir(repoRoot: string): string {
  return path.join(repoRoot, '.agent-loop', 'runs');
}

export function isPathWithinWorkspace(workspaceRoot: string, targetPath: string): boolean {
  if (!workspaceRoot || typeof workspaceRoot !== 'string' || !targetPath || typeof targetPath !== 'string') {
    return false;
  }
  const root = path.resolve(workspaceRoot);
  const candidate = path.isAbsolute(targetPath) ? path.resolve(targetPath) : path.resolve(root, targetPath);
  const rel = path.relative(root, candidate);
  return !rel.startsWith('..') && !path.isAbsolute(rel);
}

export function queuePath(repoRoot: string): string {
  const configured = getEffectiveConfig().queuePath;
  if (isPathWithinWorkspace(repoRoot, configured || '')) {
    const root = path.resolve(repoRoot || process.cwd());
    const candidate = path.isAbsolute(configured) ? path.resolve(configured) : path.resolve(root, configured);
    return candidate;
  }
  // reject unsafe (absolute outside, .. traversals, wrong drive); fall back to default relative resolved from workspace root
  const root = path.resolve(repoRoot || process.cwd());
  return path.resolve(root, 'agent-loop/scripts/migration-queue.json');
}

export type { AgentLoopConfig };
export { getEffectiveConfig as getAgentLoopConfig };

function existsSync(filePath: string): boolean {
  try {
    fs.accessSync(filePath);
    return true;
  } catch {
    return false;
  }
}