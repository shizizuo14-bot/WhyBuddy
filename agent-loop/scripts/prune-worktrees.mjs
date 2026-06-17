import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { removeAgentLoopWorktrees } from '../src/worktree.js';

const agentLoopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(agentLoopRoot, '..');
const argv = process.argv.slice(2);

function parseKeepNames(args) {
  const keepIndex = args.indexOf('--keep');
  if (keepIndex < 0) return [];
  const value = args[keepIndex + 1];
  if (!value || value.startsWith('--')) return [];
  return value.split(',').map((name) => name.trim()).filter(Boolean);
}

async function main() {
  const keepNames = parseKeepNames(argv);
  const removed = await removeAgentLoopWorktrees({ repoRoot, keepNames });
  process.stderr.write(`[prune-worktrees] removed ${removed.length} agent-loop worktree(s)\n`);
  for (const entry of removed) {
    process.stderr.write(`[prune-worktrees]   - ${entry.name} (${entry.path})\n`);
  }
  process.stdout.write(`${JSON.stringify({ removed }, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});