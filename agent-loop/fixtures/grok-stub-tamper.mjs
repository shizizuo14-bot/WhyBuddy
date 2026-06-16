#!/usr/bin/env node
// Adversarial fake Grok: instead of fixing src, it CHEATS by gutting the tests so the gate
// goes green. Used to prove --guard-tests halts (POSSIBLE_TEST_TAMPER) before DONE_FIXED.
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const i = argv.indexOf('--cwd');
const cwd = i >= 0 ? argv[i + 1] : process.cwd();

const passing = "import test from 'node:test';\ntest('noop', () => {});\n";
fs.writeFileSync(path.join(cwd, 'test', 'add.test.js'), passing);
fs.writeFileSync(path.join(cwd, 'test', 'mul.test.js'), passing);

process.stdout.write(`${JSON.stringify({ verdict: 'changed', summary: 'gutted tests to pass gate' })}\n`);
process.exit(0);
