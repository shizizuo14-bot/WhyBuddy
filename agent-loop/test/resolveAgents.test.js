import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { resolveAgents, pickNewestCodexCandidate } from '../src/resolveAgents.js';

test('picks highest semver-like Codex extension candidate', () => {
  const candidates = [
    path.join('C:', 'Users', 'me', '.vscode', 'extensions', 'openai.chatgpt-1.2.0-win32-x64', 'bin', 'windows-x86_64', 'codex.exe'),
    path.join('C:', 'Users', 'me', '.vscode', 'extensions', 'openai.chatgpt-26.5609.30741-win32-x64', 'bin', 'windows-x86_64', 'codex.exe'),
    path.join('C:', 'Users', 'me', '.vscode', 'extensions', 'openai.chatgpt-3.0.0-win32-x64', 'bin', 'windows-x86_64', 'codex.exe'),
  ];

  assert.equal(pickNewestCodexCandidate(candidates), candidates[1]);
});

test('resolveAgents accepts explicit executable overrides from env', async () => {
  const previousCodex = process.env.AGENT_LOOP_CODEX_EXE;
  const previousGrok = process.env.AGENT_LOOP_GROK_EXE;
  process.env.AGENT_LOOP_CODEX_EXE = 'C:\\tools\\codex-stub.cmd';
  process.env.AGENT_LOOP_GROK_EXE = 'C:\\tools\\grok-stub.cmd';
  try {
    assert.deepEqual(await resolveAgents(), {
      codex: 'C:\\tools\\codex-stub.cmd',
      grok: 'C:\\tools\\grok-stub.cmd',
    });
  } finally {
    restoreEnv('AGENT_LOOP_CODEX_EXE', previousCodex);
    restoreEnv('AGENT_LOOP_GROK_EXE', previousGrok);
  }
});

test('resolveAgents accepts explicit command argv overrides from env', async () => {
  const previousCodex = process.env.AGENT_LOOP_CODEX_COMMAND_JSON;
  const previousGrok = process.env.AGENT_LOOP_GROK_COMMAND_JSON;
  process.env.AGENT_LOOP_CODEX_COMMAND_JSON = JSON.stringify(['node.exe', 'codex-stub.mjs']);
  process.env.AGENT_LOOP_GROK_COMMAND_JSON = JSON.stringify(['node.exe', 'grok-stub.mjs']);
  try {
    assert.deepEqual(await resolveAgents(), {
      codex: ['node.exe', 'codex-stub.mjs'],
      grok: ['node.exe', 'grok-stub.mjs'],
    });
  } finally {
    restoreEnv('AGENT_LOOP_CODEX_COMMAND_JSON', previousCodex);
    restoreEnv('AGENT_LOOP_GROK_COMMAND_JSON', previousGrok);
  }
});

function restoreEnv(name, value) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
