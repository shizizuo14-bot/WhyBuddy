import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveAgents } from './resolveAgents.js';
import { runProcess } from './runProcess.js';
import { extractFirstJsonObject } from './json.js';
import { buildCodexReviewArgs, buildGrokJsonArgs } from './commands.js';
import { buildProbeReport } from './report.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

async function main() {
  const runId = timestamp();
  const probeDir = path.join(root, 'probes', runId);
  const latestDir = path.join(root, 'probes', 'latest');
  const tmpRepo = path.join(root, 'tmp', `probe-repo-${runId}`);
  await fs.mkdir(probeDir, { recursive: true });
  await fs.rm(latestDir, { recursive: true, force: true });
  await fs.mkdir(latestDir, { recursive: true });

  const agents = await resolveAgents();
  await writeJsonBoth(probeDir, latestDir, 'agents.json', agents);

  if (!agents.codex || !agents.grok) {
    const report = [];
    report.push('# AgentLoop Phase 0 探测报告 / Probe Report');
    report.push('');
    report.push(`运行 ID / Run ID: \`${runId}\``);
    report.push('');
    report.push('## 代理 / Agents');
    report.push('');
    report.push(`- Codex: ${agents.codex ? `\`${agents.codex}\`` : '**NOT FOUND**'}`);
    report.push(`- Grok: ${agents.grok ? `\`${agents.grok}\`` : '**NOT FOUND**'}`);
    report.push('');
    report.push('## Verdict');
    report.push('');
    report.push('HALT_AGENT_NOT_FOUND. 一个或多个必需的代理可执行文件未找到。');
    await writeTextBoth(probeDir, latestDir, 'probe-report.md', report.join('\n'));
    console.log(path.join(latestDir, 'probe-report.md'));
    process.exitCode = 2;
    return;
  }

  await createProbeRepo(tmpRepo);

  const codexHelp = await runAndRecord('codex-review-help', agents.codex, ['review', '--help'], root, probeDir, latestDir, 60000);
  const codexReview = await runAndRecord(
    'codex-review',
    agents.codex,
    buildCodexReviewArgs(),
    tmpRepo,
    probeDir,
    latestDir,
    180000
  );

  const grokPromptPath = path.join(probeDir, 'grok-probe-prompt.md');
  const grokPrompt = [
    'Return exactly one JSON object and no markdown fences.',
    '{"verdict":"ok","message":"hello from grok probe"}',
    'Do not modify files.',
  ].join('\n');
  await fs.writeFile(grokPromptPath, grokPrompt, 'utf8');
  await fs.copyFile(grokPromptPath, path.join(latestDir, 'grok-probe-prompt.md'));

  const grokProbe = await runAndRecord(
    'grok-json',
    agents.grok,
    buildGrokJsonArgs({ promptFile: grokPromptPath, cwd: tmpRepo }),
    tmpRepo,
    probeDir,
    latestDir,
    180000
  );

  const codexParsed = extractFirstJsonObject(codexReview.stdout);
  const grokParsed = extractFirstJsonObject(grokProbe.stdout);
  const grokTextParsed = typeof grokParsed?.text === 'string'
    ? extractFirstJsonObject(grokParsed.text)
    : null;
  await writeJsonBoth(probeDir, latestDir, 'parsed-summary.json', {
    codexReview: summarizeRun(codexReview, codexParsed),
    grokJson: {
      ...summarizeRun(grokProbe, grokParsed),
      parsedTextJson: grokTextParsed,
    },
  });

  const report = buildProbeReport({
    runId,
    agents,
    tmpRepo,
    commandResults: [
      { label: 'codex review --help', result: codexHelp, parsed: null },
      { label: 'codex review --uncommitted in <probe-repo cwd>', result: codexReview, parsed: codexParsed },
      { label: 'grok --prompt-file ... --output-format json', result: grokProbe, parsed: grokParsed },
    ],
    parserRecommendation: {
      codexParsed,
      grokParsed,
      grokTextParsed,
    },
  });

  await writeTextBoth(probeDir, latestDir, 'probe-report.md', report);
  console.log(path.join(latestDir, 'probe-report.md'));
}

async function createProbeRepo(repoDir) {
  await fs.rm(repoDir, { recursive: true, force: true });
  await fs.mkdir(repoDir, { recursive: true });
  await runProcess('git', ['init'], { cwd: repoDir, timeoutMs: 30000 });
  await runProcess('git', ['config', 'user.email', 'agent-loop-probe@example.local'], { cwd: repoDir, timeoutMs: 30000 });
  await runProcess('git', ['config', 'user.name', 'AgentLoop Probe'], { cwd: repoDir, timeoutMs: 30000 });
  await fs.writeFile(path.join(repoDir, 'README.md'), '# Probe\n\nOriginal line.\n', 'utf8');
  await runProcess('git', ['add', 'README.md'], { cwd: repoDir, timeoutMs: 30000 });
  await runProcess('git', ['commit', '-m', 'Initial probe commit'], { cwd: repoDir, timeoutMs: 30000 });
  await fs.writeFile(path.join(repoDir, 'README.md'), '# Probe\n\nChanged line for review.\n', 'utf8');
}

async function runAndRecord(name, command, args, cwd, probeDir, latestDir, timeoutMs) {
  const result = await runProcess(command, args, { cwd, timeoutMs });
  await writeTextBoth(probeDir, latestDir, `${name}.stdout.log`, result.stdout);
  await writeTextBoth(probeDir, latestDir, `${name}.stderr.log`, result.stderr);
  await writeJsonBoth(probeDir, latestDir, `${name}.exit.json`, {
    command,
    args,
    cwd,
    exitCode: result.exitCode,
    signal: result.signal,
    timedOut: result.timedOut,
    spawnError: result.spawnError ?? null,
    startedAt: result.startedAt,
    endedAt: result.endedAt,
  });
  return result;
}

function summarizeRun(result, parsed) {
  return {
    exitCode: result.exitCode,
    timedOut: result.timedOut,
    stdoutBytes: Buffer.byteLength(result.stdout, 'utf8'),
    stderrBytes: Buffer.byteLength(result.stderr, 'utf8'),
    parsedJson: parsed ?? null,
    spawnError: result.spawnError ?? null,
  };
}

async function writeTextBoth(probeDir, latestDir, fileName, content) {
  await fs.writeFile(path.join(probeDir, fileName), content, 'utf8');
  await fs.writeFile(path.join(latestDir, fileName), content, 'utf8');
}

async function writeJsonBoth(probeDir, latestDir, fileName, value) {
  await writeTextBoth(probeDir, latestDir, fileName, `${JSON.stringify(value, null, 2)}\n`);
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
