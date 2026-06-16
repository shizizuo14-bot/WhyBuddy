#!/usr/bin/env node
// Deterministic fake Grok for AgentLoop dry-run — NO API call, NO quota.
// Fixes ONE bug in <cwd>/src/calc.js per invocation so the loop runs multiple rounds.
// Invoked exactly like grok.exe (via AGENT_LOOP_GROK_COMMAND_JSON=["node","<this>"]),
// so it reads --cwd from the forwarded args.
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const i = argv.indexOf('--cwd');
const cwd = i >= 0 ? argv[i + 1] : process.cwd();
const calc = path.join(cwd, 'src', 'calc.js');

let src = fs.readFileSync(calc, 'utf8');
const ADD_BUG = 'return a - b; // BUG: should be +';
const MUL_BUG = 'return a + b; // BUG: should be *';

let summary = 'no change';
if (src.includes(ADD_BUG)) {
  src = src.replace(ADD_BUG, 'return a + b;');
  summary = 'fixed add';
} else if (src.includes(MUL_BUG)) {
  src = src.replace(MUL_BUG, 'return a * b;');
  summary = 'fixed mul';
}
fs.writeFileSync(calc, src);

// Mimic grok --output-format json envelope on stdout.
process.stdout.write(`${JSON.stringify({ verdict: 'changed', summary })}\n`);
process.exit(0);
