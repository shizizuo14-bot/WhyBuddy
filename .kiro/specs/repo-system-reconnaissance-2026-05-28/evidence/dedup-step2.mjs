#!/usr/bin/env node
// dedup-step2.mjs — Stage 2 step 2: criterion 3 (content_overlap, Jaccard ≥ 0.60).
//
// Inputs (read-only):
//   .tmp/dedup_step1.jsonl    — 1,294 rows from Task 2.1 (path + name normalization).
//   .tmp/clusters_step1.jsonl — 1,293 cluster rows from Task 2.1.
//
// Algorithm (design.md § 2. Deduplicator, criterion 3):
//   * Restrict to kind ∈ {spec_dir, contract, core_module} to bound cost.
//   * Skip pairs already clustered by criterion 1 or 2 (i.e. step1 cluster
//     criterion_triggered ≠ "none" — those rows are duplicate-locked).
//   * Tokenize representative content into a Set of "non-blank, non-comment lines":
//       - drop blank, JS-style line/block comment markers, import lines,
//         export-aggregator lines (export { … }, export * …);
//       - trim + lowercase the rest.
//   * Direct line-set Jaccard with size guards: skip pair if either side has
//     < 30 or > 5,000 surviving tokens (perf hint).
//   * Pair threshold: exact Jaccard ≥ 0.60 → union-find merge.
//   * Canonical row per merged cluster: newest commit by topo order
//     (git log --pretty=format:%h --topo-order). Tie-breaker: lexicographically
//     last basename. Singletons keep their step1 canonical.
//   * New step2 clusters get fresh cluster_id "C-S2-####".
//   * Tag merged-by-step2 clusters with criterion_triggered = "content_overlap".
//
// Outputs:
//   .tmp/deduped_findings.jsonl  — final Stage 2 row file (1,294 rows).
//   .tmp/duplicate_clusters.jsonl — final Stage 2 cluster file. One row per
//                                   cluster across both steps; each row has
//                                   { cluster_id, member_paths[], criterion_triggered,
//                                     canonical_path, member_count, step }.
//
// Constraints respected:
//   * Reads dedup_step1.jsonl + clusters_step1.jsonl + spec markdown + .ts files only.
//   * Output goes only to .tmp/.
//   * Does NOT modify any pre-existing .tmp file or anything outside .tmp/.
//   * Node stdlib only.

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const REPO_ROOT = process.cwd();
const STEP1_ROWS = path.join(REPO_ROOT, ".tmp", "dedup_step1.jsonl");
const STEP1_CLUSTERS = path.join(REPO_ROOT, ".tmp", "clusters_step1.jsonl");
const OUT_ROWS = path.join(REPO_ROOT, ".tmp", "deduped_findings.jsonl");
const OUT_CLUSTERS = path.join(REPO_ROOT, ".tmp", "duplicate_clusters.jsonl");

const TARGET_KINDS = new Set(["spec_dir", "contract", "core_module"]);
const JACCARD_THRESHOLD = 0.6;
const MIN_TOKENS = 30;
const MAX_TOKENS = 5000;

// Time guard: bail out if total wall-clock exceeds this many ms.
const TIME_BUDGET_MS = 5 * 60 * 1000;
const startedAt = Date.now();

function loadJsonl(p) {
  const text = fs.readFileSync(p, "utf8");
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue;
    out.push(JSON.parse(line));
  }
  return out;
}

function buildCommitOrderIndex() {
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

function safeReadFile(absPath) {
  try {
    return fs.readFileSync(absPath, "utf8");
  } catch {
    return "";
  }
}

function representativeText(row) {
  if (row.kind === "spec_dir") {
    const req = safeReadFile(path.join(REPO_ROOT, row.path, "requirements.md"));
    const des = safeReadFile(path.join(REPO_ROOT, row.path, "design.md"));
    return req + "\n" + des;
  }
  return safeReadFile(path.join(REPO_ROOT, row.path));
}

function tokenize(text) {
  const tokens = new Set();
  if (!text) return tokens;
  for (const raw of text.split(/\r?\n/)) {
    let line = raw.trim();
    if (!line) continue;
    if (/^\/\//.test(line)) continue;
    if (/^\/\*/.test(line)) continue;
    if (/^\*\//.test(line)) continue;
    if (/^\*/.test(line)) continue;
    if (/^import\s/.test(line)) continue;
    if (/^export\s*\{/.test(line)) continue;
    if (/^export\s*\*/.test(line)) continue;
    line = line.toLowerCase();
    tokens.add(line);
  }
  return tokens;
}

function jaccard(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  const [small, big] = a.size < b.size ? [a, b] : [b, a];
  let inter = 0;
  for (const t of small) if (big.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

class UF {
  constructor(n) {
    this.parent = Array.from({ length: n }, (_, i) => i);
    this.rank = new Array(n).fill(0);
  }
  find(x) {
    while (this.parent[x] !== x) {
      this.parent[x] = this.parent[this.parent[x]];
      x = this.parent[x];
    }
    return x;
  }
  union(a, b) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return false;
    if (this.rank[ra] < this.rank[rb]) this.parent[ra] = rb;
    else if (this.rank[ra] > this.rank[rb]) this.parent[rb] = ra;
    else {
      this.parent[rb] = ra;
      this.rank[ra]++;
    }
    return true;
  }
}

function pickCanonical(memberIndices, rows, commitOrder) {
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
      const baseA = a.path.split("/").pop();
      const baseB = b.path.split("/").pop();
      if (baseB.localeCompare(baseA) > 0) best = idx;
    }
  }
  return best;
}

function timeUp() {
  return Date.now() - startedAt > TIME_BUDGET_MS;
}

function main() {
  const rows = loadJsonl(STEP1_ROWS);
  const step1Clusters = loadJsonl(STEP1_CLUSTERS);
  console.error(`[input] step1 rows=${rows.length}, step1 clusters=${step1Clusters.length}`);

  const commitOrder = buildCommitOrderIndex();
  console.error(`[git] indexed ${commitOrder.size} commits`);

  // Index step1 cluster info by cluster_id.
  const clusterById = new Map();
  for (const c of step1Clusters) clusterById.set(c.cluster_id, c);

  // Eligibility: row's kind must be in TARGET_KINDS AND its cluster must have
  // criterion_triggered === "none" (i.e., not already clustered by criterion 1/2).
  const eligibleByKind = { spec_dir: [], contract: [], core_module: [] };
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!TARGET_KINDS.has(r.kind)) continue;
    if (r.criterion_triggered !== "none") continue;
    eligibleByKind[r.kind].push(i);
  }
  console.error(
    `[scope] eligible rows: spec_dir=${eligibleByKind.spec_dir.length}, contract=${eligibleByKind.contract.length}, core_module=${eligibleByKind.core_module.length}`
  );

  // Tokenize once per eligible row.
  const tokens = new Map(); // idx → Set
  for (const kind of Object.keys(eligibleByKind)) {
    for (const idx of eligibleByKind[kind]) {
      const text = representativeText(rows[idx]);
      const t = tokenize(text);
      tokens.set(idx, t);
    }
  }
  console.error(`[tokens] built ${tokens.size} token sets`);

  // Diagnostic: how many rows fall outside the token-size window.
  let skipSmall = 0;
  let skipBig = 0;
  for (const [, t] of tokens) {
    if (t.size < MIN_TOKENS) skipSmall++;
    else if (t.size > MAX_TOKENS) skipBig++;
  }
  console.error(`[tokens] outside [${MIN_TOKENS}, ${MAX_TOKENS}]: small=${skipSmall}, big=${skipBig}`);

  // Pairwise Jaccard within each kind.
  const uf = new UF(rows.length);
  const newPairs = []; // { i, j, jaccard }
  let pairsCompared = 0;
  let pairsAccepted = 0;

  for (const kind of Object.keys(eligibleByKind)) {
    const list = eligibleByKind[kind];
    for (let a = 0; a < list.length; a++) {
      if (timeUp()) {
        console.error("[time] budget exceeded; stopping pairwise comparison");
        break;
      }
      const i = list[a];
      const ti = tokens.get(i);
      if (!ti || ti.size < MIN_TOKENS || ti.size > MAX_TOKENS) continue;
      for (let b = a + 1; b < list.length; b++) {
        const j = list[b];
        const tj = tokens.get(j);
        if (!tj || tj.size < MIN_TOKENS || tj.size > MAX_TOKENS) continue;
        pairsCompared++;
        const J = jaccard(ti, tj);
        if (J >= JACCARD_THRESHOLD) {
          if (uf.union(i, j)) {
            pairsAccepted++;
            newPairs.push({ i, j, jaccard: J });
          }
        }
      }
      if (timeUp()) break;
    }
  }
  console.error(`[pairs] compared=${pairsCompared}, accepted (J ≥ ${JACCARD_THRESHOLD})=${pairsAccepted}`);

  // Group eligible rows by their UF root to identify step2 clusters.
  const groups = new Map();
  for (const kind of Object.keys(eligibleByKind)) {
    for (const idx of eligibleByKind[kind]) {
      const root = uf.find(idx);
      if (!groups.has(root)) groups.set(root, []);
      groups.get(root).push(idx);
    }
  }

  // Build step2 cluster mapping: for any group with size ≥ 2 we mint a fresh
  // C-S2-#### id; rows in that group also override their step1 cluster
  // assignment (since the step1 ids only made sense per-row pre-merge).
  const step2ClusterByRow = new Map(); // rowIdx → step2 cluster_id
  const step2ClusterMembers = new Map(); // step2 cluster_id → [rowIdx]
  let s2Idx = 0;
  for (const [, members] of groups) {
    if (members.length < 2) continue;
    const cid = `C-S2-${String(s2Idx).padStart(4, "0")}`;
    s2Idx++;
    step2ClusterMembers.set(cid, members);
    for (const m of members) step2ClusterByRow.set(m, cid);
  }
  console.error(`[clusters] new content_overlap clusters: ${step2ClusterMembers.size}`);

  // Compose final per-row records: rows in a step2 cluster get the new
  // cluster_id + criterion_triggered=content_overlap; everyone else keeps
  // their step1 fields.
  const enriched = rows.map((r) => ({ ...r }));
  for (const [cid, members] of step2ClusterMembers) {
    const canonical = pickCanonical(members, rows, commitOrder);
    for (const idx of members) {
      enriched[idx].cluster_id = cid;
      enriched[idx].is_cluster_canonical = idx === canonical;
      enriched[idx].criterion_triggered = "content_overlap";
    }
  }

  // Build the final cluster file (across both steps).
  // 1. Step1 clusters that survived (i.e., none of their members got reassigned
  //    to a step2 cluster). All step1 rows we touched were singletons (since we
  //    skipped already-clustered rows), so step1 clusters with multiple members
  //    cannot lose members in step2; check defensively anyway.
  const finalClusters = [];
  for (const c of step1Clusters) {
    const allRowsInThisCluster = rows
      .map((r, idx) => ({ r, idx }))
      .filter(({ r }) => r.cluster_id === c.cluster_id)
      .map(({ idx }) => idx);
    const survivors = allRowsInThisCluster.filter((idx) => !step2ClusterByRow.has(idx));
    if (survivors.length === 0) continue; // every member promoted into a step2 cluster
    if (survivors.length === allRowsInThisCluster.length) {
      // Unchanged — emit step1 cluster as-is, marked step=1.
      finalClusters.push({
        cluster_id: c.cluster_id,
        member_paths: c.member_paths,
        criterion_triggered: c.criterion_triggered,
        canonical_path: c.canonical_path,
        member_count: c.member_count,
        step: 1,
      });
    } else {
      // Partial survival — recompute the step1 cluster with surviving members.
      const canonicalIdx = pickCanonical(survivors, rows, commitOrder);
      finalClusters.push({
        cluster_id: c.cluster_id,
        member_paths: survivors.map((idx) => rows[idx].path),
        criterion_triggered: survivors.length >= 2 ? c.criterion_triggered : "none",
        canonical_path: rows[canonicalIdx].path,
        member_count: survivors.length,
        step: 1,
      });
    }
  }
  // 2. New step2 clusters.
  for (const [cid, members] of step2ClusterMembers) {
    const canonicalIdx = pickCanonical(members, rows, commitOrder);
    finalClusters.push({
      cluster_id: cid,
      member_paths: members.map((idx) => rows[idx].path),
      criterion_triggered: "content_overlap",
      canonical_path: rows[canonicalIdx].path,
      member_count: members.length,
      step: 2,
    });
  }

  // Sanity sweep: cross-reference enriched rows vs final clusters.
  const enrichedClusterIds = new Set(enriched.map((r) => r.cluster_id));
  const declaredClusterIds = new Set(finalClusters.map((c) => c.cluster_id));
  for (const cid of enrichedClusterIds) {
    if (!declaredClusterIds.has(cid)) {
      console.error(`[sanity] WARNING: cluster_id ${cid} present in rows but missing from clusters file`);
    }
  }

  // Final integrity checks.
  if (enriched.length !== rows.length) {
    throw new Error(`row count drift: ${enriched.length} vs ${rows.length}`);
  }
  for (const r of enriched) {
    if (!r.cluster_id || typeof r.is_cluster_canonical !== "boolean" || !r.criterion_triggered) {
      throw new Error(`row missing dedup fields: ${JSON.stringify(r)}`);
    }
  }
  // Exactly one canonical per cluster.
  const canonicalsByCluster = new Map();
  const memberCountsByCluster = new Map();
  for (const r of enriched) {
    memberCountsByCluster.set(r.cluster_id, (memberCountsByCluster.get(r.cluster_id) || 0) + 1);
    if (r.is_cluster_canonical) {
      canonicalsByCluster.set(r.cluster_id, (canonicalsByCluster.get(r.cluster_id) || 0) + 1);
    }
  }
  for (const [cid, n] of canonicalsByCluster) {
    if (n !== 1) throw new Error(`cluster ${cid} has ${n} canonical rows`);
  }
  // Every multi-member cluster has criterion_triggered ∈ {path_equality, name_normalization, content_overlap}.
  for (const c of finalClusters) {
    if (c.member_count >= 2) {
      const allowed = ["path_equality", "name_normalization", "content_overlap"];
      if (!allowed.includes(c.criterion_triggered)) {
        throw new Error(`cluster ${c.cluster_id} multi-member but criterion=${c.criterion_triggered}`);
      }
    }
  }

  // Write outputs.
  fs.writeFileSync(OUT_ROWS, enriched.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf8");
  fs.writeFileSync(
    OUT_CLUSTERS,
    finalClusters.map((c) => JSON.stringify(c)).join("\n") + "\n",
    "utf8"
  );
  console.error(`[output] wrote ${path.relative(REPO_ROOT, OUT_ROWS)} (${enriched.length} rows)`);
  console.error(
    `[output] wrote ${path.relative(REPO_ROOT, OUT_CLUSTERS)} (${finalClusters.length} clusters)`
  );

  // Summary report.
  const triggerCounts = { path_equality: 0, name_normalization: 0, content_overlap: 0, none: 0 };
  for (const c of finalClusters) triggerCounts[c.criterion_triggered] = (triggerCounts[c.criterion_triggered] || 0) + 1;
  const multi = finalClusters.filter((c) => c.member_count >= 2);
  console.error(`[summary] total clusters=${finalClusters.length}`);
  console.error(`[summary] multi-member clusters=${multi.length}`);
  console.error(`[summary] criterion_triggered counts (across all clusters): ${JSON.stringify(triggerCounts)}`);

  // New step2 cluster details for the report.
  for (const c of finalClusters.filter((c) => c.step === 2)) {
    console.error(
      `[step2 cluster] ${c.cluster_id} canonical=${c.canonical_path} members=${JSON.stringify(c.member_paths)}`
    );
  }
  for (const p of newPairs) {
    console.error(
      `[pair] J=${p.jaccard.toFixed(3)} ${rows[p.i].path}  <->  ${rows[p.j].path}`
    );
  }
}

main();
