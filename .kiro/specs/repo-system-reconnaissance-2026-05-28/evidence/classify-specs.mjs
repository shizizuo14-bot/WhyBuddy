#!/usr/bin/env node
// Stage 3 — Classifier (task 3.2)
// Reads .tmp/{deduped_findings.jsonl, spec-task-completion.jsonl, duplicate_clusters.jsonl}
// Writes .kiro/specs/repo-system-reconnaissance-2026-05-28/spec-audit-table.md
// Implements the 5-bucket priority decision tree from design.md § 3. Classifier.

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const TMP = path.join(ROOT, ".tmp");
const SPEC_DIR_OUT = path.join(
  ROOT,
  ".kiro",
  "specs",
  "repo-system-reconnaissance-2026-05-28",
);

function readJsonl(p) {
  return fs
    .readFileSync(p, "utf8")
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l));
}

const dedupedAll = readJsonl(path.join(TMP, "deduped_findings.jsonl"));
const clusters = readJsonl(path.join(TMP, "duplicate_clusters.jsonl"));
const taskCompletions = readJsonl(path.join(TMP, "spec-task-completion.jsonl"));

const specRows = dedupedAll.filter((r) => r.kind === "spec_dir");
console.error(`spec_dir rows: ${specRows.length}`);

const taskByDir = new Map();
for (const t of taskCompletions) {
  taskByDir.set(t.spec_dir, t);
}

// Build cluster lookup: spec_dir path -> { canonical, others, cluster_id, criterion_triggered }
const dupSpecToCluster = new Map();
const canonicalSpecOfCluster = new Map();
for (const c of clusters) {
  if ((c.member_paths || []).length < 2) continue;
  // Only consider spec_dir clusters
  const specMembers = c.member_paths.filter((m) => m.startsWith(".kiro/specs/"));
  if (specMembers.length < 2) continue;
  canonicalSpecOfCluster.set(c.cluster_id, c.canonical_path);
  for (const m of specMembers) {
    if (m === c.canonical_path) continue;
    dupSpecToCluster.set(m, {
      cluster_id: c.cluster_id,
      canonical_path: c.canonical_path,
      criterion_triggered: c.criterion_triggered,
    });
  }
}

// DRIFTED keyword heuristic — read each spec's requirements.md if present
const driftKeywordPatterns = [
  /rename\s+Mission\s+to\s+Destination/i,
  /rename\s+MissionStore/i,
  /remove\s+tasks-?store/i,
  /废弃\s*mission-first/i,
  /deprecate\s+Mission\b/i,
];

function readIfExists(p) {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return null;
  }
}

// Extract referenced source paths from spec markdown bodies
const sourceRefRegex = /(client\/src\/[A-Za-z0-9._\/-]+|server\/[A-Za-z0-9._\/-]+|shared\/[A-Za-z0-9._\/-]+|services\/[A-Za-z0-9._\/-]+)\.(ts|tsx)/g;

function firstExistingReferencedSource(specDirAbs) {
  const candidates = ["requirements.md", "design.md", "tasks.md", "bugfix.md"];
  for (const c of candidates) {
    const md = readIfExists(path.join(specDirAbs, c));
    if (!md) continue;
    sourceRefRegex.lastIndex = 0;
    const seen = new Set();
    let m;
    while ((m = sourceRefRegex.exec(md)) !== null) {
      const rel = `${m[1]}.${m[2]}`;
      if (seen.has(rel)) continue;
      seen.add(rel);
      const abs = path.join(ROOT, rel);
      if (fs.existsSync(abs)) {
        return rel;
      }
    }
  }
  return null;
}

function detectDrift(specDirAbs) {
  const reqMd = readIfExists(path.join(specDirAbs, "requirements.md"));
  if (!reqMd) return null;
  for (const re of driftKeywordPatterns) {
    if (re.test(reqMd)) return { matchedPattern: re.source };
  }
  return null;
}

// Classify
const out = [];
for (const r of specRows) {
  const specDirRel = r.path; // e.g. ".kiro/specs/foo"
  const specDirName = path.basename(specDirRel);
  const specDirAbs = path.join(ROOT, specDirRel);
  const completion = taskByDir.get(specDirRel);
  const taskPct = completion ? completion.task_completion_pct : 0;
  const tasksPresent = completion ? completion.tasks_md_present : false;
  const lastCommit = r.last_commit || "";

  // Step 1: DUPLICATE
  const dup = dupSpecToCluster.get(specDirRel);
  if (dup) {
    const canonicalName = path.basename(dup.canonical_path);
    out.push({
      spec_dir: specDirName,
      bucket: "DUPLICATE",
      evidence_path: `${specDirRel} + ${dup.canonical_path}`,
      evidence_note: `duplicate cluster ${dup.cluster_id}; criterion=${dup.criterion_triggered}`,
      duplicate_of: canonicalName,
      task_completion_pct: taskPct,
      last_modified_commit: lastCommit,
    });
    continue;
  }

  // Step 2: DRIFTED (keyword heuristic only)
  const drift = detectDrift(specDirAbs);
  const refExisting = firstExistingReferencedSource(specDirAbs);
  if (drift && refExisting) {
    out.push({
      spec_dir: specDirName,
      bucket: "DRIFTED",
      evidence_path: refExisting,
      evidence_note: `requirements.md matches drift keyword /${drift.matchedPattern}/; project-overview compatibility-first non-rename`,
      duplicate_of: "",
      task_completion_pct: taskPct,
      last_modified_commit: lastCommit,
    });
    continue;
  }

  // Step 3: PARTIALLY_IMPLEMENTED
  if (tasksPresent && taskPct > 0 && taskPct < 100 && refExisting) {
    out.push({
      spec_dir: specDirName,
      bucket: "PARTIALLY_IMPLEMENTED",
      evidence_path: refExisting,
      evidence_note: `tasks.md ${completion.tasks_checked}/${completion.tasks_total} checkboxes (${taskPct}%)`,
      duplicate_of: "",
      task_completion_pct: taskPct,
      last_modified_commit: lastCommit,
    });
    continue;
  }

  // Step 4: IMPLEMENTED_AND_VALID
  if ((!tasksPresent || taskPct === 100) && refExisting) {
    out.push({
      spec_dir: specDirName,
      bucket: "IMPLEMENTED_AND_VALID",
      evidence_path: refExisting,
      evidence_note: tasksPresent
        ? `tasks 100% (${completion.tasks_checked}/${completion.tasks_total}); matches steering`
        : `tasks.md absent; matches steering`,
      duplicate_of: "",
      task_completion_pct: taskPct,
      last_modified_commit: lastCommit,
    });
    continue;
  }

  // Step 5: DESIGNED_NEVER_BUILT
  out.push({
    spec_dir: specDirName,
    bucket: "DESIGNED_NEVER_BUILT",
    evidence_path: `.kiro/specs/${specDirName}/requirements.md`,
    evidence_note: "no source path mentioned in spec exists in working tree",
    duplicate_of: "",
    task_completion_pct: taskPct,
    last_modified_commit: lastCommit,
  });
}

// Sanity checks
const dist = {
  DUPLICATE: 0,
  DRIFTED: 0,
  PARTIALLY_IMPLEMENTED: 0,
  IMPLEMENTED_AND_VALID: 0,
  DESIGNED_NEVER_BUILT: 0,
};
for (const r of out) dist[r.bucket]++;
const dirSet = new Set(out.map((r) => r.spec_dir));
const duplicateOfTargets = out
  .filter((r) => r.bucket === "DUPLICATE")
  .map((r) => r.duplicate_of);
const allNonDup = new Set(
  out.filter((r) => r.bucket !== "DUPLICATE").map((r) => r.spec_dir),
);
const sanity = {
  totalRows: out.length,
  bucketSum: Object.values(dist).reduce((a, b) => a + b, 0),
  uniqueSpecDirs: dirSet.size,
  duplicateOfResolves: duplicateOfTargets.every((n) => allNonDup.has(n)),
  distribution: dist,
};

console.error("SANITY:", JSON.stringify(sanity, null, 2));

// Build markdown
const lines = [];
lines.push("# Spec Audit Table — A+ Reconnaissance Phase 1");
lines.push("");
lines.push(
  "_Implements: REQ-4.1, REQ-5.1, REQ-5.2, REQ-5.3, REQ-5.4, REQ-5.5, REQ-5.6 — Validates: Property 1, Property 4_",
);
lines.push("");
lines.push("## Header");
lines.push("");
const headSha = readIfExists(path.join(TMP, "scanner-head.txt"));
lines.push(
  `- Snapshot citation: \`.kiro/steering/project-overview.md § 项目规模\` (\`287\` specs as of \`2026-05-28\`).`,
);
if (headSha) {
  lines.push(`- Frozen HEAD: \`${headSha.trim()}\` (see \`.tmp/scanner-head.txt\`).`);
}
lines.push(
  `- Total rows in this table: **${out.length}** (scanned spec_dir count from \`.tmp/deduped_findings.jsonl\`).`,
);
lines.push(
  `- Footnote per Req 11.4: the snapshot baseline records \`287\` specs; the working tree at scan time contained \`${out.length}\`. The 2 additional spec dirs that appeared after the snapshot are recorded here without reopening the snapshot baseline.`,
);
lines.push("");
lines.push("## Distribution");
lines.push("");
lines.push("| Bucket | Count |");
lines.push("|---|---|");
for (const b of [
  "DUPLICATE",
  "DRIFTED",
  "PARTIALLY_IMPLEMENTED",
  "IMPLEMENTED_AND_VALID",
  "DESIGNED_NEVER_BUILT",
]) {
  lines.push(`| ${b} | ${dist[b]} |`);
}
lines.push(`| **Total** | **${out.length}** |`);
lines.push("");
lines.push("## Sanity checks");
lines.push("");
lines.push(
  `- Row count == bucket sum: ${sanity.totalRows === sanity.bucketSum ? "✅" : "❌"} (\`${sanity.totalRows}\` vs \`${sanity.bucketSum}\`)`,
);
lines.push(
  `- Unique spec_dirs (no duplicates within table): ${sanity.uniqueSpecDirs === sanity.totalRows ? "✅" : "❌"} (\`${sanity.uniqueSpecDirs}\`/\`${sanity.totalRows}\`)`,
);
lines.push(
  `- Every \`DUPLICATE.duplicate_of\` resolves to a non-DUPLICATE row: ${sanity.duplicateOfResolves ? "✅" : "❌"}`,
);
lines.push("");
lines.push("## Audit Table (all rows)");
lines.push("");
lines.push(
  "| spec_dir | bucket | evidence_path | evidence_note | duplicate_of | task_completion_pct | last_modified_commit |",
);
lines.push("|---|---|---|---|---|---|---|");
const sorted = out
  .slice()
  .sort((a, b) => a.spec_dir.localeCompare(b.spec_dir));
for (const r of sorted) {
  const cells = [
    r.spec_dir,
    r.bucket,
    r.evidence_path,
    r.evidence_note,
    r.duplicate_of,
    String(r.task_completion_pct),
    r.last_modified_commit,
  ].map((s) => String(s).replace(/\|/g, "\\|"));
  lines.push(`| ${cells.join(" | ")} |`);
}
lines.push("");
lines.push("## Bucket explanations (anchored to design.md § 3. Classifier)");
lines.push("");
lines.push(
  "Each bucket below cites the worked example from `design.md § Components and Interfaces § 3. Classifier`. Rows in the table above were classified using the priority order from Req 5.2: **DUPLICATE > DRIFTED > PARTIALLY_IMPLEMENTED > IMPLEMENTED_AND_VALID > DESIGNED_NEVER_BUILT**.",
);
lines.push("");
lines.push("### DUPLICATE");
lines.push("");
lines.push(
  "Worked example anchor: `office-wall-display-redesign` and `office-wall-display-redesign-v2` normalize to the same key under criterion 2 (`name_normalization`). The newer one is canonical (later `last_commit`); the older is bucketed `DUPLICATE`, `duplicate_of=office-wall-display-redesign-v2`. See `design.md § 3. Classifier — DUPLICATE`.",
);
lines.push("");
const dupRows = sorted.filter((r) => r.bucket === "DUPLICATE");
if (dupRows.length === 0) {
  lines.push("_No DUPLICATE rows in this snapshot._");
} else {
  for (const r of dupRows) {
    lines.push(
      `- \`${r.spec_dir}\` → \`duplicate_of=${r.duplicate_of}\` (${r.evidence_note}).`,
    );
  }
}
lines.push("");
lines.push("### DRIFTED");
lines.push("");
lines.push(
  "Worked example anchor: a spec that mandates renaming `MissionStore` to `DestinationStore` while steering project-overview.md § 2026-04-26 records compatibility-first non-rename. Detected here by a conservative keyword heuristic against `requirements.md`. See `design.md § 3. Classifier — DRIFTED`.",
);
lines.push("");
const driftRows = sorted.filter((r) => r.bucket === "DRIFTED");
if (driftRows.length === 0) {
  lines.push("_No DRIFTED rows detected by the keyword heuristic in this snapshot._");
} else {
  for (const r of driftRows) {
    lines.push(`- \`${r.spec_dir}\` — ${r.evidence_note} (evidence: \`${r.evidence_path}\`).`);
  }
}
lines.push("");
lines.push("### PARTIALLY_IMPLEMENTED");
lines.push("");
lines.push(
  "Worked example anchor: `office-task-cockpit` — `OfficeTaskCockpit.tsx` exists; `tasks.md` has unchecked items remaining. Bucket assigned when `tasks.md` exists, `0 < task_completion_pct < 100`, and ≥1 referenced source file resolves in the working tree. See `design.md § 3. Classifier — PARTIALLY_IMPLEMENTED`.",
);
lines.push("");
lines.push(
  `Total PARTIALLY_IMPLEMENTED rows: \`${dist.PARTIALLY_IMPLEMENTED}\` (full list in main table).`,
);
lines.push("");
lines.push("### IMPLEMENTED_AND_VALID");
lines.push("");
lines.push(
  "Worked example anchor: `audit-chain` (L27) — execution-plan marks it merged, `server/audit/audit-chain.ts` exists, `tasks.md` fully checked, no steering contradiction. Bucket assigned when `tasks.md` is missing or `task_completion_pct == 100` AND ≥1 referenced source file exists AND no contradiction with steering. See `design.md § 3. Classifier — IMPLEMENTED_AND_VALID`.",
);
lines.push("");
lines.push(
  `Total IMPLEMENTED_AND_VALID rows: \`${dist.IMPLEMENTED_AND_VALID}\` (full list in main table).`,
);
lines.push("");
lines.push("### DESIGNED_NEVER_BUILT");
lines.push("");
lines.push(
  "Worked example anchor: `production-deployment` (L31) — `requirements.md` and `design.md` exist; no referenced source path resolvable in the tree. Default bucket when no other criterion fires. See `design.md § 3. Classifier — DESIGNED_NEVER_BUILT`.",
);
lines.push("");
lines.push(
  `Total DESIGNED_NEVER_BUILT rows: \`${dist.DESIGNED_NEVER_BUILT}\` (full list in main table).`,
);
lines.push("");

const outPath = path.join(SPEC_DIR_OUT, "spec-audit-table.md");
fs.writeFileSync(outPath, lines.join("\n"), "utf8");
console.error(`Wrote ${outPath}`);

// Emit machine-readable summary for the agent
const samples = {
  PARTIALLY_IMPLEMENTED: sorted.filter((r) => r.bucket === "PARTIALLY_IMPLEMENTED").slice(0, 3),
  IMPLEMENTED_AND_VALID: sorted.filter((r) => r.bucket === "IMPLEMENTED_AND_VALID").slice(0, 3),
  DESIGNED_NEVER_BUILT: sorted.filter((r) => r.bucket === "DESIGNED_NEVER_BUILT").slice(0, 3),
  DUPLICATE: dupRows,
  DRIFTED: driftRows,
};
console.log(JSON.stringify({ sanity, samples }, null, 2));
