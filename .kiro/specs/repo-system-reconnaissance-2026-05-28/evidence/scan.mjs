#!/usr/bin/env node
// .tmp/scan.mjs — Stage 1 Scanner for repo-system-reconnaissance-2026-05-28.
// Walks the 6 source roots (client/src, server, shared, services, .kiro/specs,
// .kiro/steering) and emits one JSON line per finding into
// .tmp/raw_findings.jsonl. Per task 1.2, tools are unconstrained (Req 12.1)
// and any Node script lives only under .tmp/.
//
// Frozen HEAD: d181be2f (see .tmp/scanner-head.txt; recorded 2026-05-28).
// Snapshot baseline: .kiro/steering/project-overview.md § 项目规模 (Req 11).
// Last-commit strategy: a single `git log --pretty=format:COMMIT:%h --name-only`
// call builds a path→short-SHA map plus a dir→short-SHA map; entries missing
// from git history fall back to the frozen HEAD short SHA.
// Node stdlib only; this script is NOT promoted into the source tree.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = process.cwd();
const OUT_PATH = path.join(REPO_ROOT, ".tmp", "raw_findings.jsonl");
const FROZEN_HEAD = "d181be2f";

const SNAP = {
  route: "project-overview.md#项目规模:server.routes=391",
  core_module: "project-overview.md#项目规模:server.core=100",
  component: "project-overview.md#项目规模:client.components=342",
  panel: "project-overview.md#项目规模:client.components=342",
  page: "project-overview.md#项目规模:client.pages=314",
  lib: "project-overview.md#项目规模:client.lib=209",
  store: "project-overview.md#项目规模:client.lib=209",
  contract: "project-overview.md#项目规模:shared=139",
  executor: "project-overview.md#项目规模:services=68",
  spec_dir: "project-overview.md#项目规模:specs=287",
  steering_doc: "project-overview.md",
};

function buildCommitMap() {
  const stdout = execFileSync(
    "git",
    ["log", "--pretty=format:COMMIT:%h", "--name-only"],
    { encoding: "utf8", maxBuffer: 1024 * 1024 * 512 },
  );
  const pathMap = new Map();
  const dirMap = new Map();
  let curSha = null;
  for (const raw of stdout.split("\n")) {
    const line = raw.replace(/[\r\n]+$/, "");
    if (line.startsWith("COMMIT:")) {
      curSha = line.slice("COMMIT:".length);
      continue;
    }
    if (!line || !curSha) continue;
    const norm = line.replace(/\\/g, "/");
    if (!pathMap.has(norm)) pathMap.set(norm, curSha);
    let cut = norm.lastIndexOf("/");
    while (cut > 0) {
      const dir = norm.slice(0, cut);
      if (!dirMap.has(dir)) dirMap.set(dir, curSha);
      cut = dir.lastIndexOf("/");
    }
  }
  return { pathMap, dirMap };
}

function isTestPath(rel) {
  const segs = rel.split("/");
  if (segs.includes("tests") || segs.includes("__tests__")) return true;
  if (/\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs)$/.test(rel)) return true;
  return false;
}

function decideKind(rel) {
  if (isTestPath(rel)) return null;
  if (rel.startsWith("client/src/pages/") && rel.endsWith(".tsx")) return "page";
  if (rel.startsWith("client/src/components/") && rel.endsWith(".tsx")) {
    const base = path.basename(rel);
    if (base.includes("Panel") || rel.includes("/panels/")) return "panel";
    return "component";
  }
  if (rel.startsWith("client/src/lib/") && (rel.endsWith(".ts") || rel.endsWith(".tsx"))) {
    const base = path.basename(rel);
    if (base === "store.ts" || /-store\.(ts|tsx)$/.test(base)) return "store";
    return "lib";
  }
  if (rel.startsWith("server/routes/") && rel.endsWith(".ts")) return "route";
  if (rel.startsWith("server/core/") && rel.endsWith(".ts")) return "core_module";
  if (rel.startsWith("shared/") && rel.endsWith(".ts")) return "contract";
  if (rel.startsWith("services/") && rel.endsWith(".ts")) return "executor";
  if (rel.startsWith(".kiro/steering/") && rel.endsWith(".md")) return "steering_doc";
  return null;
}

function readHeadLines(absPath, max = 600) {
  try {
    const buf = fs.readFileSync(absPath, "utf8");
    return buf.split(/\r?\n/).slice(0, max);
  } catch {
    return [];
  }
}

function evidenceForRoute(lines) {
  for (const line of lines) {
    const m = line.match(
      /(?:router|app)\s*\.\s*(get|post|put|delete|patch|options|head|use|all)\s*\(\s*['"`]([^'"`]+)['"`]/,
    );
    if (m) return line.trim().slice(0, 240);
  }
  return evidenceForExport(lines);
}

function evidenceForExport(lines) {
  for (const line of lines) {
    const t = line.trim();
    if (
      /^export\s+(?:default\s+)?(?:async\s+)?(?:abstract\s+)?(?:class|function\*?|const|let|var|interface|type|enum)\b/.test(
        t,
      )
    ) {
      return t.slice(0, 240);
    }
    if (/^export\s+default\b/.test(t)) return t.slice(0, 240);
    if (/^export\s*\{/.test(t)) return t.slice(0, 240);
  }
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    if (t.startsWith("//") || t.startsWith("/*") || t.startsWith("*") || t.startsWith("import ")) continue;
    return t.slice(0, 240);
  }
  return "";
}

function evidenceForSteering(lines) {
  let inFront = false;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (i === 0 && t === "---") {
      inFront = true;
      continue;
    }
    if (inFront) {
      if (t === "---") inFront = false;
      continue;
    }
    if (!t) continue;
    if (t.startsWith("<!--") || t.startsWith("-->") || t.startsWith("*/")) continue;
    return t.slice(0, 240);
  }
  return "";
}

function evidenceForSpecDir(absDir) {
  const reqPath = path.join(absDir, "requirements.md");
  if (fs.existsSync(reqPath)) {
    const lines = readHeadLines(reqPath, 80);
    for (const line of lines) {
      const m = line.match(/^#\s+(.+)$/);
      if (m) return m[1].trim().slice(0, 240);
    }
  }
  return path.basename(absDir);
}

function walk(dir, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "node_modules" || ent.name === ".git") continue;
      walk(abs, out);
    } else if (ent.isFile()) {
      out.push(abs);
    }
  }
}

function relPath(abs) {
  return path.relative(REPO_ROOT, abs).replace(/\\/g, "/");
}

function main() {
  const { pathMap, dirMap } = buildCommitMap();
  const fileRoots = ["client/src", "server", "shared", "services", ".kiro/steering"];
  const allFiles = [];
  for (const r of fileRoots) walk(path.join(REPO_ROOT, r), allFiles);

  const out = fs.openSync(OUT_PATH, "w");
  const counts = {};
  const emit = (row) => {
    counts[row.kind] = (counts[row.kind] ?? 0) + 1;
    fs.writeSync(out, JSON.stringify(row) + "\n");
  };

  for (const abs of allFiles) {
    const rel = relPath(abs);
    const kind = decideKind(rel);
    if (!kind) continue;
    const lines = readHeadLines(abs);
    const evidence =
      kind === "route" ? evidenceForRoute(lines) :
      kind === "steering_doc" ? evidenceForSteering(lines) :
      evidenceForExport(lines);
    emit({
      kind,
      path: rel,
      evidence,
      snapshot_ref: SNAP[kind],
      last_commit: pathMap.get(rel) ?? FROZEN_HEAD,
    });
  }

  const specsRoot = path.join(REPO_ROOT, ".kiro", "specs");
  const specDirs = fs.readdirSync(specsRoot, { withFileTypes: true });
  for (const ent of specDirs) {
    if (!ent.isDirectory()) continue;
    const dirAbs = path.join(specsRoot, ent.name);
    const dirRel = relPath(dirAbs);
    emit({
      kind: "spec_dir",
      path: dirRel,
      evidence: evidenceForSpecDir(dirAbs),
      snapshot_ref: SNAP.spec_dir,
      last_commit: dirMap.get(dirRel) ?? FROZEN_HEAD,
    });
  }

  fs.closeSync(out);
  process.stderr.write(
    "kind counts: " +
      JSON.stringify(counts, Object.keys(counts).sort()) +
      "\n",
  );
}

main();
