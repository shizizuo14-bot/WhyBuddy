// Stage 7 — B_Tier_Proposer aggregation script.
// Inputs:
//   .kiro/specs/repo-system-reconnaissance-2026-05-28/spec-audit-table.md
//   .kiro/specs/repo-system-reconnaissance-2026-05-28/module-inventory.md
// Output:
//   .tmp/btier-aggregation.jsonl
// Node stdlib only.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const specRoot = path.join(repoRoot, '.kiro', 'specs', 'repo-system-reconnaissance-2026-05-28');

function parseTable(file, headerPrefix) {
  const text = fs.readFileSync(path.join(specRoot, file), 'utf8');
  const lines = text.split('\n');
  const rows = [];
  let inTable = false;
  for (const ln of lines) {
    if (!inTable) {
      if (ln.startsWith(headerPrefix)) inTable = true;
      continue;
    }
    if (!ln.startsWith('|')) {
      if (ln.trim() === '') continue;
      break;
    }
    if (ln.startsWith('|---')) continue;
    rows.push(ln.split('|').slice(1, -1).map((s) => s.trim()));
  }
  return rows;
}

const auditRows = parseTable('spec-audit-table.md', '| spec_dir | bucket |');
const inventoryRows = parseTable('module-inventory.md', '| module_path | kind |');

// Group code_without_doc by domain × tbl
const groups = {};
for (const r of inventoryRows) {
  if (r.length < 5) continue;
  const [mp, kind, domain, tbl, refs] = r;
  if (refs && refs.length > 0) continue;
  if (tbl !== 'trunk' && tbl !== 'branch') continue;
  const key = `${domain}|${tbl}`;
  if (!groups[key]) groups[key] = { domain, tbl, count: 0, examples: [] };
  groups[key].count++;
  if (groups[key].examples.length < 3) groups[key].examples.push(mp);
}

const candidates = [];
// B-tier: PARTIALLY_IMPLEMENTED specs (one candidate per spec)
for (const r of auditRows) {
  if (r.length < 7) continue;
  const [spec_dir, bucket, evidence_path, evidence_note] = r;
  if (bucket === 'PARTIALLY_IMPLEMENTED') {
    candidates.push({
      tier: 'B',
      origin: 'audit-row PARTIALLY_IMPLEMENTED',
      subject: spec_dir,
      evidence: `${evidence_path}; ${evidence_note}`,
      domain_or_scope: spec_dir,
    });
  }
}

// B-tier: TRUNK domain groups (count ≥ 1)
for (const k of Object.keys(groups).sort()) {
  const g = groups[k];
  if (g.tbl !== 'trunk') continue;
  if (g.count < 1) continue;
  candidates.push({
    tier: 'B',
    origin: 'inventory TRUNK code_without_doc',
    subject: `domain=${g.domain}`,
    evidence: `${g.count} TRUNK modules without referenced_specs; examples: ${g.examples.join(', ')}`,
    domain_or_scope: g.domain,
  });
}

// D-tier: auto-generated reference work (3 fixed candidates per Req 9.2/9.3)
candidates.push(
  {
    tier: 'D',
    origin: 'Req 9.2 auto-ref',
    subject: 'TypeDoc / API reference',
    evidence: '969 inventory rows in module-inventory.md; auto-generation deferred to D-tier',
    domain_or_scope: 'all',
  },
  {
    tier: 'D',
    origin: 'Req 9.2 auto-ref',
    subject: 'madge dependency graph',
    evidence: '969 inventory rows; cross-module imports auto-derivable',
    domain_or_scope: 'all',
  },
  {
    tier: 'D',
    origin: 'Req 9.3 auto-ref',
    subject: 'dependency-cruiser report',
    evidence: '969 inventory rows; layering/dependency rules auto-checkable',
    domain_or_scope: 'all',
  },
);

// C-tier: cross-domain reorganizations citing ≥ 2 domains + reconciliation gap
candidates.push(
  {
    tier: 'C',
    origin: 'cross-domain reorg',
    subject: 'blueprint-runtime ↔ executor ↔ role-container loader',
    evidence: 'TRUNK gaps span executor (29) + infrastructure-as-blueprint (360 BRANCH); see doc 06 + spec autopilot-role-container-loader',
    domain_or_scope: 'executor + infrastructure',
  },
  {
    tier: 'C',
    origin: 'cross-domain reorg',
    subject: 'task-autopilot ↔ workflow ↔ mission projection',
    evidence: 'TRUNK gaps in workflow (8) + mission (10) + 30+ task-autopilot IMPLEMENTED specs; see doc 04 + spec task-autopilot-runtime-orchestration',
    domain_or_scope: 'workflow + mission',
  },
  {
    tier: 'C',
    origin: 'cross-domain reorg',
    subject: 'audit ↔ lineage ↔ permission evidence chain',
    evidence: 'TRUNK gaps in audit (4) + lineage (4); related specs audit-chain + data-lineage-tracking + agent-permission-model are IMPLEMENTED',
    domain_or_scope: 'audit + lineage',
  },
);

// Deferred: DESIGNED_NEVER_BUILT specs (one grouped entry per prefix)
const dnbPrefixes = {};
for (const r of auditRows) {
  if (r.length < 7) continue;
  const [spec_dir, bucket] = r;
  if (bucket !== 'DESIGNED_NEVER_BUILT') continue;
  const prefix = spec_dir.split('-').slice(0, 1)[0] + (spec_dir.startsWith('web-aigc') ? '-aigc' : '');
  // Better grouping: take first 2 segments
  const seg = spec_dir.split('-');
  const grp = seg.length >= 2 ? `${seg[0]}-${seg[1]}` : seg[0];
  if (!dnbPrefixes[grp]) dnbPrefixes[grp] = [];
  dnbPrefixes[grp].push(spec_dir);
}
for (const grp of Object.keys(dnbPrefixes).sort()) {
  const list = dnbPrefixes[grp];
  if (list.length < 2) continue; // Skip single-spec prefixes; they fold into the catch-all
  candidates.push({
    tier: 'deferred',
    origin: 'DESIGNED_NEVER_BUILT bucket',
    subject: `prefix=${grp}-* (${list.length} specs)`,
    evidence: `examples: ${list.slice(0, 3).join(', ')}`,
    domain_or_scope: grp,
  });
}

// Deferred catch-all for singletons
const singletons = Object.values(dnbPrefixes).filter((l) => l.length === 1).flat();
if (singletons.length > 0) {
  candidates.push({
    tier: 'deferred',
    origin: 'DESIGNED_NEVER_BUILT bucket (singletons)',
    subject: `singletons (${singletons.length} specs)`,
    evidence: `examples: ${singletons.slice(0, 5).join(', ')}`,
    domain_or_scope: 'mixed',
  });
}

const out = candidates.map((c) => JSON.stringify(c)).join('\n') + '\n';
fs.writeFileSync(path.join(repoRoot, '.tmp', 'btier-aggregation.jsonl'), out);

const tally = { B: 0, C: 0, D: 0, deferred: 0 };
for (const c of candidates) tally[c.tier]++;
console.error(`Total candidates: ${candidates.length}`);
console.error(JSON.stringify(tally, null, 2));
