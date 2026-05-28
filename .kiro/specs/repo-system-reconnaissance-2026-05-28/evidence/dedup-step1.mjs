#!/usr/bin/env node
// dedup-step1.mjs — Stage 2 step 1: criteria 1 (path_equality) + 2 (name_normalization)
// Runs against .tmp/raw_findings.jsonl produced by Stage 1 (.tmp/scan.mjs).
//
// Implements design.md § Components and Interfaces § 2. Deduplicator:
//   Criterion 1: identical `path` → same cluster (defensive; not expected in a single scan).
//   Criterion 2: kind=spec_dir basename normalized via /-(v\d+|\d{4}-\d{2}-\d{2})$/
//                rows sharing the normalized key form one cluster.
//   Criterion 3 (Jaccard ≥ 0.60) is intentionally deferred to Task 2.2.
//
// Canonical-row selection per multi-member cluster:
//   Each row carries a `last_commit` short SHA from `git log -1`. We pre-compute a
//   topo-ordered list of all repository commits with `git log --pretty=format:%h --topo-order`
//   (newest first). The canonical row is the cluster member whose `last_commit` appears
//   earliest in that list (i.e. the newest commit). Tie-breaker: lexicographically last
//   basename. Singleton clusters mark their lone row canonical.
//
// Outputs (kept under .tmp/, never promoted):
//   .tmp/dedup_step1.jsonl  — same rows as raw_findings.jsonl with 3 added fields:
//                              cluster_id, is_cluster_canonical, criterion_triggered.
//   .tmp/clusters_step1.jsonl — one row per cluster:
//                              { cluster_id, member_paths[], criterion_triggered,
//                                canonical_path, member_count }.
//
// Constraints respected:
//   - Reads .tmp/raw_findings.jsonl only; does not modify it.
//   - Outputs go only to .tmp/.
//   - No source-tree modifications. No PBT. Node stdlib only.

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const REPO_ROOT = process.cwd();
const RAW_PATH = path.join(REPO_ROOT, ".tmp", "raw_findings.jsonl");
const OUT_ROWS = path.join(REPO_ROOT, ".tmp", "dedup_step1.jsonl");
const OUT_CLUSTERS = path.join(REPO_ROOT, ".tmp", "clusters_step1.jsonl");

const VERSION_SUFFIX_RE = /-(v\d+|\d{4}-\d{2}-\d{2})$/;

function loadRawRows() {
  const text = fs.readFileSync(RAW_PATH, "utf8");
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue;
    rows.push(JSON.parse(line));
  }
  return rows;
}

function buildCommitOrderIndex() {
  // Newest-first topo-ordered short SHA list. Map sha → ordinal (lower = newer).
  const out = execFileSync("git", ["log", "--pretty=format:%h", "--topo-order"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const order = new Map();
  let i = 0;
  for (const sha of out.split(/\r?\n/)) {
    if (!sha) continue;
    if (!order.has(sha)) order.set(sha, i++);
  }
  return order;
}

function specDirBasename(p) {
  const segs = p.split("/").filter(Boolean);
  return segs[segs.length - 1];
}

function clusterRows(rows) {
  // Criterion 1: path equality. Build a map path → row indices.
  const byPath = new Map();
  rows.forEach((r, idx) => {
    if (!byPath.has(r.path)) byPath.set(r.path, []);
    byPath.get(r.path).push(idx);
  });
  const pathDuplicates = [...byPath.entries()].filter(([, idxs]) => idxs.length > 1);
  if (pathDuplicates.length > 0) {
    console.error(
      `[criterion 1] WARNING: ${pathDuplicates.length} path(s) appear more than once in raw_findings.jsonl:`
    );
    for (const [p, idxs] of pathDuplicates.slice(0, 10)) {
      console.error(`  - ${p} (${idxs.length} rows)`);
    }
  }

  // Each row's initial cluster key: its own path (criterion 1).
  // For kind=spec_dir we may merge into a normalized key (criterion 2).
  // We use a simple Union-Find rooted on row index.
  const parent = rows.map((_, i) => i);
  const rank = rows.map(() => 0);
  const find = (x) => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  const union = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return;
    if (rank[ra] < rank[rb]) parent[ra] = rb;
    else if (rank[ra] > rank[rb]) parent[rb] = ra;
    else {
      parent[rb] = ra;
      rank[ra]++;
    }
  };

  // Criterion 1: union all rows with identical path.
  for (const [, idxs] of byPath) {
    for (let i = 1; i < idxs.length; i++) union(idxs[0], idxs[i]);
  }

  // Criterion 2: union spec_dir rows with the same normalized basename key.
  const byNormKey = new Map();
  rows.forEach((r, idx) => {
    if (r.kind !== "spec_dir") return;
    const base = specDirBasename(r.path);
    const key = base.replace(VERSION_SUFFIX_RE, "");
    if (!byNormKey.has(key)) byNormKey.set(key, []);
    byNormKey.get(key).push(idx);
  });
  let crit2Hits = 0;
  for (const [, idxs] of byNormKey) {
    if (idxs.length < 2) continue;
    crit2Hits++;
    for (let i = 1; i < idxs.length; i++) union(idxs[0], idxs[i]);
  }

  // Group rows by their representative.
  const groups = new Map();
  rows.forEach((r, idx) => {
    const root = find(idx);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(idx);
  });

  // Decide criterion_triggered per cluster.
  const clusters = [];
  let cIdx = 0;
  // Stable cluster ordering by smallest member index in the cluster.
  const sortedRoots = [...groups.keys()].sort((a, b) => {
    const ma = Math.min(...groups.get(a));
    const mb = Math.min(...groups.get(b));
    return ma - mb;
  });
  for (const root of sortedRoots) {
    const members = groups.get(root);
    let criterion = "none";
    if (members.length >= 2) {
      // Determine which criterion fired. Path-equality wins if any pair shares a path.
      const pathSet = new Set();
      let pathCollision = false;
      for (const idx of members) {
        const p = rows[idx].path;
        if (pathSet.has(p)) {
          pathCollision = true;
          break;
        }
        pathSet.add(p);
      }
      if (pathCollision) criterion = "path_equality";
      else criterion = "name_normalization";
    }
    clusters.push({
      cluster_id: `C-${String(cIdx).padStart(4, "0")}`,
      member_indices: members,
      criterion_triggered: criterion,
    });
    cIdx++;
  }

  console.error(
    `[criterion 2] ${crit2Hits} normalized-key group(s) merged ≥ 2 spec_dir rows.`
  );
  return clusters;
}

function pickCanonical(memberIndices, rows, commitOrder) {
  // Newest commit wins; commits absent from the topo list (shouldn't happen) sort last.
  let best = memberIndices[0];
  for (const idx of memberIndices) {
    if (idx === best) continue;
    const a = rows[best];
    const b = rows[idx];
    const ordA = commitOrder.has(a.last_commit) ? commitOrder.get(a.last_commit) : Infinity;
    const ordB = commitOrder.has(b.last_commit) ? commitOrder.get(b.last_commit) : Infinity;
    if (ordB < ordA) {
      best = idx;
    } else if (ordB === ordA) {
      // Tie-breaker: lexicographically last basename.
      const baseA = specDirBasename(a.path);
      const baseB = specDirBasename(b.path);
      if (baseB.localeCompare(baseA) > 0) best = idx;
    }
  }
  return best;
}

function main() {
  const rows = loadRawRows();
  console.error(`[input] loaded ${rows.length} rows from ${path.relative(REPO_ROOT, RAW_PATH)}`);

  const commitOrder = buildCommitOrderIndex();
  console.error(`[git] indexed ${commitOrder.size} commits via topo-order short SHA list`);

  const clusters = clusterRows(rows);

  // Annotate each row.
  const enriched = rows.map((r) => ({ ...r }));
  let multiCount = 0;
  const triggerCounts = { path_equality: 0, name_normalization: 0, content_overlap: 0, none: 0 };
  const clusterRecords = [];

  for (const c of clusters) {
    const canonicalIdx = c.member_indices.length === 1
      ? c.member_indices[0]
      : pickCanonical(c.member_indices, rows, commitOrder);
    if (c.member_indices.length >= 2) multiCount++;
    triggerCounts[c.criterion_triggered] = (triggerCounts[c.criterion_triggered] || 0) + 1;

    for (const idx of c.member_indices) {
      enriched[idx].cluster_id = c.cluster_id;
      enriched[idx].is_cluster_canonical = idx === canonicalIdx;
      enriched[idx].criterion_triggered = c.criterion_triggered;
    }
    clusterRecords.push({
      cluster_id: c.cluster_id,
      member_paths: c.member_indices.map((i) => rows[i].path),
      criterion_triggered: c.criterion_triggered,
      canonical_path: rows[canonicalIdx].path,
      member_count: c.member_indices.length,
    });
  }

  fs.writeFileSync(OUT_ROWS, enriched.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf8");
  fs.writeFileSync(
    OUT_CLUSTERS,
    clusterRecords.map((r) => JSON.stringify(r)).join("\n") + "\n",
    "utf8"
  );

  console.error(`[output] wrote ${path.relative(REPO_ROOT, OUT_ROWS)} (${enriched.length} rows)`);
  console.error(
    `[output] wrote ${path.relative(REPO_ROOT, OUT_CLUSTERS)} (${clusterRecords.length} clusters)`
  );
  console.error(`[summary] total clusters: ${clusterRecords.length}`);
  console.error(`[summary] multi-member clusters: ${multiCount}`);
  console.error(`[summary] criterion_triggered counts: ${JSON.stringify(triggerCounts)}`);

  // Emit a sample of multi-member clusters to stderr for the report.
  const multi = clusterRecords.filter((c) => c.member_count >= 2);
  console.error(`[sample] up to 10 multi-member clusters:`);
  for (const c of multi.slice(0, 10)) {
    console.error(
      `  ${c.cluster_id} [${c.criterion_triggered}] canonical=${c.canonical_path}; members=${JSON.stringify(c.member_paths)}`
    );
  }
}

main();
