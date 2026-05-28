// Stage 6 — Reconciler.
// Inputs:
//   .kiro/specs/repo-system-reconnaissance-2026-05-28/spec-audit-table.md (289 rows)
//   .kiro/specs/repo-system-reconnaissance-2026-05-28/module-inventory.md (969 rows)
// Outputs:
//   .tmp/doc_without_code.jsonl
//   .tmp/code_without_doc.jsonl
// Node stdlib only.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const specRoot = path.join(repoRoot, '.kiro', 'specs', 'repo-system-reconnaissance-2026-05-28');

// ---------- doc_without_code ----------
function parseAuditTable() {
  const text = fs.readFileSync(path.join(specRoot, 'spec-audit-table.md'), 'utf8');
  const lines = text.split('\n');
  const rows = [];
  let inTable = false;
  for (const ln of lines) {
    if (!inTable) {
      if (ln.startsWith('| spec_dir | bucket |')) {
        inTable = true;
      }
      continue;
    }
    if (!ln.startsWith('|')) {
      if (ln.trim() === '') continue;
      break;
    }
    if (ln.startsWith('|---')) continue;
    const cells = ln.split('|').slice(1, -1).map((s) => s.trim());
    if (cells.length < 7) continue;
    const [spec_dir, bucket, evidence_path, evidence_note, duplicate_of, task_completion_pct, last_modified_commit] = cells;
    rows.push({ spec_dir, bucket, evidence_path, evidence_note, duplicate_of, task_completion_pct, last_modified_commit });
  }
  return rows;
}

const ownDocs = new Set(['tasks.md', 'requirements.md', 'design.md', 'bugfix.md']);
// Order matters: tsx before ts and jsx before js so the regex matches the
// longer extension first (alternation tries left to right). The original
// design.md spec says: rg -o '[a-zA-Z0-9._/-]+\.(ts|tsx|js|jsx|md)' — but in
// practice ripgrep's regex engine handles longest match for character classes
// only; literal alternations are left-to-right too. Reordering preserves the
// intended semantic ("any of these five extensions") without dropping the x.
const PATH_RE = /[a-zA-Z0-9._/-]+\.(?:tsx|ts|jsx|js|md)\b/g;

function extractMentionedPaths(specDir) {
  const candidates = ['requirements.md', 'design.md', 'tasks.md', 'bugfix.md'];
  const allPaths = new Set();
  for (const fname of candidates) {
    const fpath = path.join('.kiro', 'specs', specDir, fname);
    const abs = path.join(repoRoot, fpath);
    if (!fs.existsSync(abs)) continue;
    const text = fs.readFileSync(abs, 'utf8');
    const matches = text.match(PATH_RE) || [];
    for (const m of matches) allPaths.add(m);
  }
  return [...allPaths];
}

function isSelfRef(p, specDir) {
  // Self-reference: any path under the spec's own dir
  if (p.includes(`.kiro/specs/${specDir}/`)) return true;
  // Standalone mention of own doc files (no slash, just the doc name)
  if (ownDocs.has(p)) return true;
  return false;
}

function resolvesInTree(p) {
  // Reject obvious noise (e.g., paths inside node_modules or fenced code blocks
  // are unlikely to be part of the working tree we care about).
  if (!p || p.length < 3) return false;
  // Strip leading './'
  const norm = p.replace(/^\.\//, '');
  // Try absolute resolution from repo root
  try {
    const abs = path.resolve(repoRoot, norm);
    // Guard against escaping the repo
    if (!abs.startsWith(repoRoot)) return false;
    return fs.existsSync(abs);
  } catch {
    return false;
  }
}

function computeDocWithoutCode(rows) {
  const out = [];
  for (const row of rows) {
    if (row.bucket === 'DUPLICATE') continue;
    const mentioned = extractMentionedPaths(row.spec_dir).filter((p) => !isSelfRef(p, row.spec_dir));
    if (mentioned.length === 0) {
      // No real mentions => spec mentions nothing => fails check.
      const severity = bucketToSeverity(row.bucket);
      if (!severity) continue;
      out.push({ subject: row.spec_dir, evidence: '(no concrete file paths mentioned)', severity });
      continue;
    }
    let anyResolves = false;
    const unresolved = [];
    for (const p of mentioned) {
      if (resolvesInTree(p)) {
        anyResolves = true;
        break;
      } else {
        unresolved.push(p);
      }
    }
    if (anyResolves) continue;
    const severity = bucketToSeverity(row.bucket);
    if (!severity) continue;
    const evidencePaths = unresolved.slice(0, 3).join('; ');
    out.push({ subject: row.spec_dir, evidence: evidencePaths || '(no resolvable paths)', severity });
  }
  return out;
}

function bucketToSeverity(bucket) {
  switch (bucket) {
    case 'IMPLEMENTED_AND_VALID':
    case 'PARTIALLY_IMPLEMENTED':
    case 'DRIFTED':
      return 'broken-promise';
    case 'DESIGNED_NEVER_BUILT':
      return 'informational';
    default:
      return null;
  }
}

// ---------- code_without_doc ----------
function parseModuleInventory() {
  const text = fs.readFileSync(path.join(specRoot, 'module-inventory.md'), 'utf8');
  const lines = text.split('\n');
  const rows = [];
  let inTable = false;
  for (const ln of lines) {
    if (!inTable) {
      if (ln.startsWith('| module_path | kind |')) {
        inTable = true;
      }
      continue;
    }
    if (!ln.startsWith('|')) {
      if (ln.trim() === '') continue;
      break;
    }
    if (ln.startsWith('|---')) continue;
    const cells = ln.split('|').slice(1, -1).map((s) => s.trim());
    if (cells.length < 5) continue;
    const [module_path, kind, domain, trunk_branch_legacy, referenced_specs] = cells;
    rows.push({ module_path, kind, domain, trunk_branch_legacy, referenced_specs });
  }
  return rows;
}

function computeCodeWithoutDoc(rows) {
  const out = [];
  for (const row of rows) {
    if (row.referenced_specs && row.referenced_specs.trim().length > 0) continue;
    const t = row.trunk_branch_legacy;
    if (t !== 'trunk' && t !== 'branch') continue;
    const severity = t === 'trunk' ? 'needs-attention' : 'informational';
    out.push({
      subject: row.module_path,
      evidence: `kind=${row.kind}; domain=${row.domain}`,
      severity,
    });
  }
  return out;
}

// ---------- main ----------
const auditRows = parseAuditTable();
console.error(`audit rows parsed: ${auditRows.length}`);
const docWithoutCode = computeDocWithoutCode(auditRows);
console.error(`doc_without_code entries: ${docWithoutCode.length}`);

const inventoryRows = parseModuleInventory();
console.error(`inventory rows parsed: ${inventoryRows.length}`);
const codeWithoutDoc = computeCodeWithoutDoc(inventoryRows);
console.error(`code_without_doc entries: ${codeWithoutDoc.length}`);

fs.writeFileSync(
  path.join(repoRoot, '.tmp', 'doc_without_code.jsonl'),
  docWithoutCode.map((o) => JSON.stringify(o)).join('\n') + '\n',
);
fs.writeFileSync(
  path.join(repoRoot, '.tmp', 'code_without_doc.jsonl'),
  codeWithoutDoc.map((o) => JSON.stringify(o)).join('\n') + '\n',
);

// Severity breakdowns
const dwcBySev = { 'broken-promise': 0, 'needs-attention': 0, informational: 0 };
for (const e of docWithoutCode) dwcBySev[e.severity]++;
const cwdBySev = { 'broken-promise': 0, 'needs-attention': 0, informational: 0 };
for (const e of codeWithoutDoc) cwdBySev[e.severity]++;

console.error(JSON.stringify({ docWithoutCode: dwcBySev, codeWithoutDoc: cwdBySev }, null, 2));
