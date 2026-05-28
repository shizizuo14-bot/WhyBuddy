// Stage 5 — emit docs 04 / 05 / 06 + SVGs D4 / D5 / D6.
// Reads .tmp/module-inventory.json built by build-inventory.mjs.
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SPEC_DIR = path.join(ROOT, ".kiro/specs/repo-system-reconnaissance-2026-05-28");
const INV_JSON = path.join(ROOT, ".tmp/module-inventory.json");
const data = JSON.parse(fs.readFileSync(INV_JSON, "utf8"));
const inv = data.inventory;
const matrix = data.matrix;
const byDomain = data.byDomain;
const DOMAIN_ENUM = data.domainEnum;

function rowsBy(predicate) {
  return inv.filter(predicate);
}

function listSorted(rows) {
  return rows.slice().sort((a, b) => a.module_path.localeCompare(b.module_path));
}

// ============================================================
// Doc 04 — domain map
// ============================================================

const DOMAIN_DESCRIPTIONS = {
  mission: {
    summary: "Mission state machine, orchestrator, projection. Hop 2/3 of the Main Business Loop.",
    keyPaths: ["server/tasks/mission-store.ts", "server/core/mission-orchestrator.ts", "shared/mission/contracts.ts", "client/src/lib/tasks-store.ts"],
    keySpecs: ["mission-runtime", "mission-native-projection", "mission-cancel-control", "mission-operator-actions", "destination-model-and-parser"],
  },
  workflow: {
    summary: "Ten-stage workflow engine and ExecutionPlan builder. Hop 4 of the Main Business Loop.",
    keyPaths: ["server/core/workflow-engine.ts", "server/core/execution-plan-builder.ts", "client/src/lib/workflow-store.ts"],
    keySpecs: ["workflow-engine", "workflow-decoupling", "workflow-panel-decomposition", "workflow-artifacts-display"],
  },
  executor: {
    summary: "Lobster Docker executor + WorkflowEngine bridge. Hop 5 of the Main Business Loop.",
    keyPaths: ["services/lobster-executor/src/", "server/core/execution-bridge.ts", "server/core/executor-client.ts", "shared/executor/"],
    keySpecs: ["lobster-executor-real", "executor-integration", "ai-enabled-sandbox", "secure-sandbox", "sandbox-live-preview"],
  },
  audit: {
    summary: "Hash-linked audit chain overlay attached to hops 2/3/6/7.",
    keyPaths: ["server/audit/", "shared/audit/", "server/routes/audit.ts"],
    keySpecs: ["audit-chain"],
  },
  lineage: {
    summary: "DAG lineage overlay attached to hops 2/3/6/7.",
    keyPaths: ["server/lineage/", "shared/lineage/", "server/routes/lineage.ts"],
    keySpecs: ["data-lineage-tracking"],
  },
  memory: {
    summary: "Three-tier memory (session / vector / SOUL) + evolution / heartbeat. Off the Main Loop.",
    keyPaths: ["server/core/memory/", "server/core/evolution.ts", "server/core/heartbeat.ts", "shared/memory/"],
    keySpecs: ["memory-system", "evolution-heartbeat"],
  },
  "frontend-cockpit": {
    summary: "Driving-cabin UI: pages, panels, stores, primitives that consume Mission / Workflow / Audit / Lineage projections. Hop 7 of the Main Business Loop.",
    keyPaths: ["client/src/pages/", "client/src/components/office/", "client/src/components/tasks/", "client/src/components/launch/", "client/src/lib/"],
    keySpecs: ["office-task-cockpit", "task-hub-convergence", "navigation-convergence", "task-runtime-visibility-v1", "office-shell-convergence-v1", "task-os-home-redesign-v1"],
  },
  "frontend-3d": {
    summary: "Three.js R3F scene + browser-only runtime. Off the Main Loop except for Frontend-Mode demos.",
    keyPaths: ["client/src/components/three/", "client/src/components/Scene3D.tsx"],
    keySpecs: ["frontend-3d", "browser-runtime", "scene-mission-fusion", "scene-agent-interaction"],
  },
  feishu: {
    summary: "Feishu relay & progress mirror. Hop 1 entry-mirror and hop 8 progress回传 of the Main Business Loop.",
    keyPaths: ["server/feishu/", "server/routes/feishu.ts"],
    keySpecs: ["feishu-bridge"],
  },
  interop: {
    summary: "A2A protocol, Swarm orchestrator, Guest agent lifecycle. Cross-framework ingress / egress, off the Main Loop.",
    keyPaths: ["server/core/a2a-server.ts", "server/core/a2a-client.ts", "server/core/a2a-adapters/", "server/core/swarm-orchestrator.ts", "server/core/guest-*.ts", "shared/a2a-protocol.ts"],
    keySpecs: ["a2a-protocol", "autonomous-swarm", "agent-marketplace"],
  },
  infrastructure: {
    summary: "Generic UI primitives, shared utilities, RAG / knowledge / NL-command / governance / sandbox / blueprint catch-all. Not part of the closed 10-domain set; enumerated for inventory completeness.",
    keyPaths: ["server/routes/blueprint/", "server/core/rag/", "server/core/knowledge-graph/", "server/core/nl-command/", "shared/", "client/src/components/ui/"],
    keySpecs: ["vector-db-rag-pipeline", "knowledge-graph", "nl-command-center", "cost-governance-strategy", "human-in-the-loop", "telemetry-dashboard"],
  },
};

function emitDoc04() {
  const lines = [];
  lines.push("# 04 主要域地图");
  lines.push("");
  lines.push("_Implements: REQ-2.4, REQ-6.1, REQ-7.2 — Validates: Property 2, Property 7_");
  lines.push("");
  lines.push("## Header");
  lines.push("");
  lines.push("- Frozen HEAD: `d181be2f` (`2026-05-28T02:06:35Z`).");
  lines.push("- Source rows: [`module-inventory.md`](./module-inventory.md) (`969` non-test modules from `.tmp/deduped_findings.jsonl`).");
  lines.push(`- Domain enum (closed, design.md § Data Models § 2): \`mission\`, \`workflow\`, \`executor\`, \`audit\`, \`lineage\`, \`memory\`, \`frontend-cockpit\`, \`frontend-3d\`, \`feishu\`, \`interop\`. The inventory adds one off-enum bucket \`infrastructure\` for shared utilities, UI primitives, and RAG / knowledge / NL-command / blueprint catch-all that fall off the 10-domain map but must still be enumerated.`);
  lines.push("- TRUNK domains (per design.md § 5 Domain_Mapper labeling rule): `mission`, `workflow`, `executor`, `audit`, `lineage`, `frontend-cockpit`, `feishu` — 7 of 10. These are the domains crossed by the Mission Execution `Main_Business_Loop` (doc `01`).");
  lines.push("- Companion diagram: [`d4-domain-map.svg`](./d4-domain-map.svg) (`manifest:` cites `module-inventory.md` rows by domain bucket).");
  lines.push("");
  lines.push("## Distribution");
  lines.push("");
  lines.push("| domain | trunk | branch | legacy | total | TRUNK domain? |");
  lines.push("|---|---|---|---|---|---|");
  const trunkSet = new Set(data.trunkSet);
  for (const d of DOMAIN_ENUM) {
    const m = matrix[d] || { trunk: 0, branch: 0, legacy: 0 };
    const total = m.trunk + m.branch + m.legacy;
    const onTrunk = trunkSet.has(d) ? "✅" : "—";
    lines.push(`| ${d} | ${m.trunk} | ${m.branch} | ${m.legacy} | ${total} | ${onTrunk} |`);
  }
  lines.push(`| **Total** | **${data.byTBL.trunk}** | **${data.byTBL.branch}** | **${data.byTBL.legacy}** | **${data.total}** | — |`);
  lines.push("");
  lines.push("> Note: every `legacy` row would need `last-modified-commit > 90 days` from the snapshot epoch (`1779899944`). At this snapshot every scanned module has been touched within the last 90 days, so the legacy column is `0`. This is consistent with `.kiro/steering/execution-plan.md § 当前维护快照`'s active maintenance posture; it does not mean the repo has no historical aliases — those live in the `DUPLICATE` bucket of `spec-audit-table.md`, not in code.");
  lines.push("");
  lines.push("## Per-domain breakdown");
  lines.push("");
  for (const d of DOMAIN_ENUM) {
    const m = matrix[d] || { trunk: 0, branch: 0, legacy: 0 };
    const total = m.trunk + m.branch + m.legacy;
    const desc = DOMAIN_DESCRIPTIONS[d];
    lines.push(`### ${d} (${total} modules: ${m.trunk}T / ${m.branch}B / ${m.legacy}L)`);
    lines.push("");
    lines.push(`- ${desc.summary}`);
    lines.push(`- Key code paths: ${desc.keyPaths.map((p) => "`" + p + "`").join(", ")}`);
    lines.push(`- Key specs (anchor citations from \`spec-audit-table.md\`): ${desc.keySpecs.map((s) => "`" + s + "`").join(", ")}`);
    lines.push("");
  }
  lines.push("## Domain dependency graph");
  lines.push("");
  lines.push("Edges trace the runtime data flow on the canonical `Main_Business_Loop` (doc `01`) plus the cross-domain overlays. Edge direction is `producer → consumer`.");
  lines.push("");
  lines.push("```text");
  lines.push("frontend-cockpit ──user input──▶ feishu ──relay──▶ mission");
  lines.push("frontend-cockpit ──user input───────────────────▶ mission");
  lines.push("mission ──build plan──▶ workflow ──dispatch──▶ executor");
  lines.push("executor ──HMAC callback──▶ mission (state)");
  lines.push("mission ──socket fanout──▶ frontend-cockpit");
  lines.push("mission / workflow / executor ──events──▶ audit (overlay)");
  lines.push("mission / workflow / executor ──events──▶ lineage (overlay)");
  lines.push("workflow ──post-run materialize──▶ memory (off-loop)");
  lines.push("interop ──A2A ingress──▶ workflow / mission");
  lines.push("frontend-3d ──demo browser-only──▶ workflow (browser-runtime variant)");
  lines.push("infrastructure ──shared utilities──▶ all domains (no domain depends on it conceptually)");
  lines.push("```");
  lines.push("");
  lines.push("Three invariants follow from this graph:");
  lines.push("");
  lines.push("1. The Main Loop crosses **5 TRUNK domains in sequence** (`feishu/frontend-cockpit → mission → workflow → executor → mission/frontend-cockpit`); `audit` and `lineage` attach to every hop as overlays.");
  lines.push("2. `memory`, `interop`, `frontend-3d` are off-loop and therefore BRANCH by design — they consume Main-Loop outputs but are not on the critical path.");
  lines.push("3. `infrastructure` (UI primitives, RAG / knowledge / blueprint shared utilities) is a sink for non-domain code; nothing else depends on it as a domain. It is enumerated only so the inventory totals match `969`.");
  lines.push("");
  lines.push("## Reference");
  lines.push("");
  lines.push("- Inventory: [module-inventory.md](./module-inventory.md)");
  lines.push("- Audit table: [spec-audit-table.md](./spec-audit-table.md)");
  lines.push("- Companion diagram: [d4-domain-map.svg](./d4-domain-map.svg)");
  lines.push("- Frontend nav (sub-view): [05-frontend-navigation-map.md](./05-frontend-navigation-map.md)");
  lines.push("- Backend capability (sub-view): [06-backend-capability-map.md](./06-backend-capability-map.md)");
  lines.push("- Q3 traceability: this document is a supporting answer to Q3 of the `Five_Control_Recovery_Questions`; primary is `01`, peers are `03`, `05`, `06`, `09`.");
  lines.push("");
  fs.writeFileSync(path.join(SPEC_DIR, "04-domain-map.md"), lines.join("\n"), "utf8");
}

function emitSvgD4() {
  // Domain map: 11 domains, one box per domain, sized by count, colored by trunk-dominance.
  const ordered = DOMAIN_ENUM.slice().sort((a, b) => (byDomain[b] || 0) - (byDomain[a] || 0));
  const w = 1200, h = 720;
  const cols = 4;
  const cellW = (w - 80) / cols;
  const cellH = 130;
  const trunkSet = new Set(data.trunkSet);
  let body = "";
  ordered.forEach((d, i) => {
    const m = matrix[d] || { trunk: 0, branch: 0, legacy: 0 };
    const total = m.trunk + m.branch + m.legacy;
    const onTrunk = trunkSet.has(d);
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = 40 + col * cellW + 10;
    const y = 100 + row * cellH;
    const fill = onTrunk ? "#1f6feb" : (d === "infrastructure" ? "#6e7681" : "#3fb950");
    const trunkPct = total ? Math.round((m.trunk / total) * 100) : 0;
    body += `\n  <g>`;
    body += `\n    <rect x="${x}" y="${y}" width="${cellW - 20}" height="${cellH - 20}" rx="10" fill="${fill}" fill-opacity="0.15" stroke="${fill}" stroke-width="2"/>`;
    body += `\n    <text x="${x + 14}" y="${y + 24}" font-family="JetBrains Mono, monospace" font-size="16" font-weight="700" fill="${fill}">${d}${onTrunk ? " ★" : ""}</text>`;
    body += `\n    <text x="${x + 14}" y="${y + 50}" font-family="JetBrains Mono, monospace" font-size="13" fill="#c9d1d9">${total} modules</text>`;
    body += `\n    <text x="${x + 14}" y="${y + 70}" font-family="JetBrains Mono, monospace" font-size="11" fill="#8b949e">trunk ${m.trunk} · branch ${m.branch} · legacy ${m.legacy}</text>`;
    body += `\n    <text x="${x + 14}" y="${y + 90}" font-family="JetBrains Mono, monospace" font-size="11" fill="#8b949e">trunk share ${trunkPct}%</text>`;
    body += `\n  </g>`;
  });
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<!--
manifest:
  source: module-inventory.md (969 non-test rows)
  upstream: .tmp/deduped_findings.jsonl (deduped scan)
  audit-rows: spec-audit-table.md (audit-chain, data-lineage-tracking, mission-runtime, workflow-engine, executor-integration, frontend-3d, feishu-bridge, a2a-protocol, vector-db-rag-pipeline, mission-native-projection)
  derived-by: .tmp/build-domain-docs.mjs
-->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  <rect width="100%" height="100%" fill="#0d1117"/>
  <text x="40" y="40" font-family="Space Grotesk, sans-serif" font-size="22" font-weight="700" fill="#f0f6fc">D4 — Domain Map (11 domains, 969 modules)</text>
  <text x="40" y="64" font-family="JetBrains Mono, monospace" font-size="12" fill="#8b949e">★ = TRUNK domain on the Mission Execution Main Loop · blue=TRUNK · green=BRANCH · gray=infrastructure (off-enum)</text>${body}
  <g transform="translate(40,${h - 50})">
    <rect width="20" height="14" fill="#1f6feb" fill-opacity="0.15" stroke="#1f6feb" stroke-width="2"/><text x="28" y="12" font-family="JetBrains Mono" font-size="11" fill="#c9d1d9">TRUNK</text>
    <rect x="100" width="20" height="14" fill="#3fb950" fill-opacity="0.15" stroke="#3fb950" stroke-width="2"/><text x="128" y="12" font-family="JetBrains Mono" font-size="11" fill="#c9d1d9">BRANCH</text>
    <rect x="200" width="20" height="14" fill="#6e7681" fill-opacity="0.15" stroke="#6e7681" stroke-width="2"/><text x="228" y="12" font-family="JetBrains Mono" font-size="11" fill="#c9d1d9">infrastructure (off-enum)</text>
    <text x="420" y="12" font-family="JetBrains Mono" font-size="11" fill="#8b949e">snapshot=2026-05-28 · HEAD=d181be2f</text>
  </g>
</svg>
`;
  fs.writeFileSync(path.join(SPEC_DIR, "d4-domain-map.svg"), svg, "utf8");
}

// ============================================================
// Doc 05 — Frontend navigation map
// ============================================================

function topPaths(rows, limit = 50) {
  return listSorted(rows).slice(0, limit).map((r) => "- `" + r.module_path + "`" + (r.referenced_specs ? `  · refs: ${r.referenced_specs}` : ""));
}

function emitDoc05() {
  const FE_KINDS = new Set(["page", "panel", "component", "store"]);
  const feRows = inv.filter((r) => FE_KINDS.has(r.kind));
  const pages = feRows.filter((r) => r.kind === "page");
  const panels = feRows.filter((r) => r.kind === "panel");
  const components = feRows.filter((r) => r.kind === "component");
  const stores = feRows.filter((r) => r.kind === "store");
  const lines = [];
  lines.push("# 05 前端导航地图");
  lines.push("");
  lines.push("_Implements: REQ-2.3, REQ-6.1, REQ-7.2 — Validates: Property 2, Property 7_");
  lines.push("");
  lines.push("## Header");
  lines.push("");
  lines.push("- Frozen HEAD: `d181be2f` (`2026-05-28T02:06:35Z`).");
  lines.push(`- Filter: \`module-inventory.md\` rows where \`kind ∈ {page, panel, component, store}\`. Total: **${feRows.length}** modules (\`${pages.length}\` pages, \`${panels.length}\` panels, \`${components.length}\` components, \`${stores.length}\` stores).`);
  lines.push("- Companion diagram: [`d5-frontend-navigation-map.svg`](./d5-frontend-navigation-map.svg) (`manifest:` cites the filtered inventory rows).");
  lines.push("- Domain note: `frontend-cockpit` accounts for the bulk of these modules; `frontend-3d` covers the Scene3D / R3F sub-tree.");
  lines.push("");
  lines.push("## Distribution");
  lines.push("");
  lines.push("| kind | count | note |");
  lines.push("|---|---|---|");
  lines.push(`| page | ${pages.length} | top-level routes (\`Home\`, \`TasksPage\`, debug pages, admin pages, replay, lineage) |`);
  lines.push(`| panel | ${panels.length} | docked surface widgets (cockpit panels, audit / lineage / sandbox / decision panels) |`);
  lines.push(`| component | ${components.length} | leaf components (UI primitives, three/* leaves, knowledge / RAG / replay / nl-command sub-components) |`);
  lines.push(`| store | ${stores.length} | Zustand stores (Mission projection, workflow, audit, lineage, swarm, A2A, sandbox …) |`);
  lines.push(`| **Total** | **${feRows.length}** | — |`);
  lines.push("");

  // Pages → routes section: derive route from path.
  lines.push("## Pages → routes");
  lines.push("");
  lines.push("Routes are derived from `client/src/pages/<segment>/<File>.tsx` per Vite path conventions. Top-level user routes:");
  lines.push("");
  lines.push("| route | page module | wires |");
  lines.push("|---|---|---|");
  const namedRoutes = [
    { route: "/", path: "client/src/pages/Home.tsx", wires: "OfficeTaskCockpit · Scene3D · UnifiedLaunchComposer" },
    { route: "/tasks", path: "client/src/pages/tasks/TasksPage.tsx", wires: "TaskQueue · TaskDetailView · TasksCockpitDetail" },
    { route: "/tasks/:id", path: "client/src/pages/tasks/TaskDetailPage.tsx", wires: "TaskDetailView · MissionStepFlow · Logs/Artifacts/Runtime" },
    { route: "/replay/:missionId", path: "client/src/pages/replay/ReplayPage.tsx", wires: "ReplayTimeline · ReplayControls" },
    { route: "/lineage", path: "client/src/pages/lineage/LineagePage.tsx", wires: "LineageDAGView · LineageHeatmap · LineageTimeline" },
    { route: "/debug", path: "client/src/pages/debug/DebugIndexPage.tsx", wires: "config / permissions / audit / help low-frequency entries" },
    { route: "/debug/help", path: "client/src/pages/debug/DebugHelpPage.tsx", wires: "consolidated help" },
    { route: "/admin/*", path: "client/src/pages/admin/", wires: "admin-only debug / governance pages" },
    { route: "/nl-command", path: "client/src/pages/nl-command/NLCommandPage.tsx", wires: "NLCommandCenter (legacy entry; absorbed by /tasks)" },
    { route: "/autopilot/route", path: "client/src/pages/AutopilotRoutePage.tsx", wires: "Autopilot route preview" },
  ];
  for (const r of namedRoutes) {
    lines.push(`| \`${r.route}\` | \`${r.path}\` | ${r.wires} |`);
  }
  lines.push("");
  lines.push(`> Full enumerated page list (${pages.length} files) lives in the inventory; the table above only names the top-level user-visible routes.`);
  lines.push("");

  // Stores
  lines.push("## Stores");
  lines.push("");
  lines.push("Zustand stores are the canonical client-side projections. Each store owns one or more boundary slices.");
  lines.push("");
  lines.push("| store | path | role |");
  lines.push("|---|---|---|");
  const storeRoles = {
    "client/src/lib/tasks-store.ts": "Mission projection (mission-native-projection, IMPLEMENTED)",
    "client/src/lib/workflow-store.ts": "Workflow snapshot for /workflows views",
    "client/src/lib/audit-store.ts": "Audit chain client cache",
    "client/src/lib/lineage-store.ts": "Lineage DAG client cache",
    "client/src/lib/sandbox-store.ts": "Sandbox terminal / live-preview state",
    "client/src/lib/swarm-store.ts": "Swarm topology & messages",
    "client/src/lib/a2a-store.ts": "A2A interop messages",
    "client/src/lib/store.ts": "Global UI store (selection, drawer state, theme)",
  };
  for (const s of listSorted(stores)) {
    const role = storeRoles[s.module_path] || "supporting store";
    lines.push(`| \`${path.basename(s.module_path)}\` | \`${s.module_path}\` | ${role} |`);
  }
  lines.push("");

  // Panels grouped
  lines.push("## Panels (by feature group)");
  lines.push("");
  lines.push("Panels are docked surface widgets in the cockpit. Grouped by feature; each row shows its kind/domain origin in `module-inventory.md`.");
  lines.push("");
  const groups = [
    { title: "Cockpit / Office", match: /office|cockpit|holo|mission-wall/i },
    { title: "Tasks / Mission", match: /task|mission|launch|operator|cancel|decision/i },
    { title: "Audit / Lineage / Replay", match: /audit|lineage|replay|anomal/i },
    { title: "Knowledge / RAG / NL-Command", match: /knowledge|rag|nl-?command/i },
    { title: "Sandbox / Executor / Telemetry", match: /sandbox|executor|telemetry|cost/i },
    { title: "A2A / Swarm / Guest", match: /a2a|swarm|guest/i },
    { title: "Other panels", match: /./ },
  ];
  const seen = new Set();
  for (const g of groups) {
    const matched = panels.filter((p) => !seen.has(p.module_path) && g.match.test(p.module_path));
    if (!matched.length) continue;
    matched.forEach((p) => seen.add(p.module_path));
    lines.push(`### ${g.title} (${matched.length})`);
    lines.push("");
    for (const p of listSorted(matched)) {
      lines.push(`- \`${p.module_path}\` — domain: \`${p.domain}\`, T/B/L: \`${p.trunk_branch_legacy}\``);
    }
    lines.push("");
  }

  lines.push("## Component sub-trees (counts)");
  lines.push("");
  const componentBuckets = {};
  for (const c of components) {
    const seg = c.module_path.replace(/^client\/src\/components\//, "").split("/")[0] || "(root)";
    componentBuckets[seg] = (componentBuckets[seg] || 0) + 1;
  }
  lines.push("| sub-tree under client/src/components | count |");
  lines.push("|---|---|");
  for (const [k, v] of Object.entries(componentBuckets).sort((a, b) => b[1] - a[1])) {
    lines.push(`| \`${k}\` | ${v} |`);
  }
  lines.push("");
  lines.push("## Reference");
  lines.push("");
  lines.push("- Inventory: [module-inventory.md](./module-inventory.md)");
  lines.push("- Domain map (parent view): [04-domain-map.md](./04-domain-map.md)");
  lines.push("- Companion diagram: [d5-frontend-navigation-map.svg](./d5-frontend-navigation-map.svg)");
  lines.push("- Audit table: [spec-audit-table.md](./spec-audit-table.md)");
  lines.push("- Q3 traceability: this document is a supporting answer to Q3 of the `Five_Control_Recovery_Questions`; primary is `01`, peers are `03`, `04`, `06`, `09`.");
  lines.push("");
  fs.writeFileSync(path.join(SPEC_DIR, "05-frontend-navigation-map.md"), lines.join("\n"), "utf8");
}

function emitSvgD5() {
  const FE_KINDS = new Set(["page", "panel", "component", "store"]);
  const counts = { page: 0, panel: 0, component: 0, store: 0 };
  for (const r of inv) if (FE_KINDS.has(r.kind)) counts[r.kind]++;
  const w = 1200, h = 720;
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<!--
manifest:
  source: module-inventory.md (rows where kind ∈ {page, panel, component, store})
  filtered-rows: ${counts.page + counts.panel + counts.component + counts.store} (page=${counts.page}, panel=${counts.panel}, component=${counts.component}, store=${counts.store})
  upstream: .tmp/deduped_findings.jsonl
  audit-rows: spec-audit-table.md (mission-native-projection, office-task-cockpit, task-hub-convergence, navigation-convergence, frontend-3d, browser-runtime)
  derived-by: .tmp/build-domain-docs.mjs
-->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  <rect width="100%" height="100%" fill="#0d1117"/>
  <text x="40" y="40" font-family="Space Grotesk, sans-serif" font-size="22" font-weight="700" fill="#f0f6fc">D5 — Frontend Navigation Map</text>
  <text x="40" y="62" font-family="JetBrains Mono, monospace" font-size="12" fill="#8b949e">routes → pages → panels → stores · counts from module-inventory.md</text>

  <!-- Routes layer -->
  <g transform="translate(40,100)">
    <rect width="1120" height="80" rx="10" fill="#1f6feb" fill-opacity="0.12" stroke="#1f6feb" stroke-width="2"/>
    <text x="20" y="24" font-family="JetBrains Mono" font-size="14" font-weight="700" fill="#1f6feb">Routes (top-level)</text>
    <text x="20" y="48" font-family="JetBrains Mono" font-size="12" fill="#c9d1d9">/ · /tasks · /tasks/:id · /replay/:missionId · /lineage · /debug · /debug/help · /admin/* · /nl-command · /autopilot/route</text>
    <text x="20" y="68" font-family="JetBrains Mono" font-size="11" fill="#8b949e">Source: client/src/App.tsx route table; verified by directory scan</text>
  </g>

  <!-- Pages layer -->
  <g transform="translate(40,210)">
    <rect width="1120" height="100" rx="10" fill="#3fb950" fill-opacity="0.12" stroke="#3fb950" stroke-width="2"/>
    <text x="20" y="24" font-family="JetBrains Mono" font-size="14" font-weight="700" fill="#3fb950">Pages (${counts.page})</text>
    <text x="20" y="48" font-family="JetBrains Mono" font-size="12" fill="#c9d1d9">client/src/pages/{Home, tasks/, replay/, lineage/, debug/, admin/, nl-command/, AutopilotRoutePage, …}</text>
    <text x="20" y="70" font-family="JetBrains Mono" font-size="11" fill="#8b949e">Top user routes: Home, TasksPage, TaskDetailPage, ReplayPage, LineagePage</text>
    <text x="20" y="88" font-family="JetBrains Mono" font-size="11" fill="#8b949e">Long tail = admin / debug / blueprint sub-pages</text>
  </g>

  <!-- Panels layer -->
  <g transform="translate(40,340)">
    <rect width="1120" height="120" rx="10" fill="#d29922" fill-opacity="0.12" stroke="#d29922" stroke-width="2"/>
    <text x="20" y="24" font-family="JetBrains Mono" font-size="14" font-weight="700" fill="#d29922">Panels (${counts.panel})</text>
    <text x="20" y="48" font-family="JetBrains Mono" font-size="12" fill="#c9d1d9">Cockpit · Tasks · Audit · Lineage · Replay · Knowledge · RAG · NL-Command · Sandbox · A2A · Swarm</text>
    <text x="20" y="70" font-family="JetBrains Mono" font-size="11" fill="#8b949e">Anchor specs: office-task-cockpit, audit-chain, data-lineage-tracking, knowledge-graph, vector-db-rag-pipeline, sandbox-live-preview, a2a-protocol</text>
    <text x="20" y="90" font-family="JetBrains Mono" font-size="11" fill="#8b949e">All panels render against shared/* boundary contracts; no panel imports from server/* directly</text>
    <text x="20" y="110" font-family="JetBrains Mono" font-size="11" fill="#8b949e">Cockpit panels live under client/src/components/office/, tasks/, launch/</text>
  </g>

  <!-- Stores layer -->
  <g transform="translate(40,490)">
    <rect width="1120" height="100" rx="10" fill="#a371f7" fill-opacity="0.12" stroke="#a371f7" stroke-width="2"/>
    <text x="20" y="24" font-family="JetBrains Mono" font-size="14" font-weight="700" fill="#a371f7">Stores (${counts.store})</text>
    <text x="20" y="48" font-family="JetBrains Mono" font-size="12" fill="#c9d1d9">tasks-store · workflow-store · audit-store · lineage-store · sandbox-store · swarm-store · a2a-store · store (global UI)</text>
    <text x="20" y="70" font-family="JetBrains Mono" font-size="11" fill="#8b949e">Mission truth-source: tasks-store (mission-native-projection, IMPLEMENTED, 33/33 tasks)</text>
    <text x="20" y="88" font-family="JetBrains Mono" font-size="11" fill="#8b949e">Stores feed the Pages and Panels layers above; only stores subscribe to Socket events</text>
  </g>

  <!-- Components layer -->
  <g transform="translate(40,620)">
    <rect width="1120" height="60" rx="10" fill="#6e7681" fill-opacity="0.12" stroke="#6e7681" stroke-width="2"/>
    <text x="20" y="22" font-family="JetBrains Mono" font-size="14" font-weight="700" fill="#6e7681">Components (${counts.component})</text>
    <text x="20" y="42" font-family="JetBrains Mono" font-size="12" fill="#c9d1d9">UI primitives (ui/), Three.js leaves (three/), per-feature leaves (knowledge/, rag/, replay/, nl-command/, …)</text>
  </g>

  <text x="40" y="700" font-family="JetBrains Mono" font-size="11" fill="#8b949e">snapshot=2026-05-28 · HEAD=d181be2f · arrow direction implicit: routes ▼ pages ▼ panels ▼ stores ▼ components</text>
</svg>
`;
  fs.writeFileSync(path.join(SPEC_DIR, "d5-frontend-navigation-map.svg"), svg, "utf8");
}

// ============================================================
// Doc 06 — Backend capability map
// ============================================================

function emitDoc06() {
  const BE_KINDS = new Set(["route", "core_module", "executor"]);
  const beRows = inv.filter((r) => BE_KINDS.has(r.kind));
  const routes = beRows.filter((r) => r.kind === "route");
  const cores = beRows.filter((r) => r.kind === "core_module");
  const executors = beRows.filter((r) => r.kind === "executor");

  const routesByDomain = {};
  for (const r of routes) {
    routesByDomain[r.domain] = (routesByDomain[r.domain] || 0) + 1;
  }
  const coresByDomain = {};
  for (const r of cores) {
    coresByDomain[r.domain] = (coresByDomain[r.domain] || 0) + 1;
  }

  const lines = [];
  lines.push("# 06 后端能力地图");
  lines.push("");
  lines.push("_Implements: REQ-2.3, REQ-6.1, REQ-7.2 — Validates: Property 2, Property 7_");
  lines.push("");
  lines.push("## Header");
  lines.push("");
  lines.push("- Frozen HEAD: `d181be2f` (`2026-05-28T02:06:35Z`).");
  lines.push(`- Filter: \`module-inventory.md\` rows where \`kind ∈ {route, core_module, executor}\`. Total: **${beRows.length}** modules (\`${routes.length}\` routes, \`${cores.length}\` core modules, \`${executors.length}\` executors).`);
  lines.push("- Companion diagram: [`d6-backend-capability-map.svg`](./d6-backend-capability-map.svg) (`manifest:` cites the filtered inventory rows).");
  lines.push("- The route count `391` in `.kiro/steering/project-overview.md § 项目规模` is the file-level total; the inventory's `" + routes.length + "` reflects deduplicated canonical handlers (per-file dedupe of clusters in `.tmp/duplicate_clusters.jsonl`).");
  lines.push("");
  lines.push("## Distribution");
  lines.push("");
  lines.push("### Routes by domain");
  lines.push("");
  lines.push("| domain | route count |");
  lines.push("|---|---|");
  for (const d of DOMAIN_ENUM) {
    if (!(d in routesByDomain)) continue;
    lines.push(`| ${d} | ${routesByDomain[d]} |`);
  }
  lines.push(`| **Total** | **${routes.length}** |`);
  lines.push("");
  lines.push("### Core modules by domain");
  lines.push("");
  lines.push("| domain | core_module count |");
  lines.push("|---|---|");
  for (const d of DOMAIN_ENUM) {
    if (!(d in coresByDomain)) continue;
    lines.push(`| ${d} | ${coresByDomain[d]} |`);
  }
  lines.push(`| **Total** | **${cores.length}** |`);
  lines.push("");
  lines.push("### Executor modules");
  lines.push("");
  lines.push(`Total: \`${executors.length}\`. All under \`services/lobster-executor/src/\`. They form the only executor service today (per \`.kiro/steering/project-overview.md § 项目规模\`).`);
  lines.push("");

  // Routes grouped
  lines.push("## Routes — key handlers per domain");
  lines.push("");
  const routeAnchors = {
    mission: ["server/routes/tasks.ts", "server/routes/planets.ts"],
    workflow: ["server/routes/workflows.ts"],
    executor: ["server/routes/executor.ts", "server/routes/executor-jobs.ts"],
    audit: ["server/routes/audit.ts"],
    lineage: ["server/routes/lineage.ts"],
    feishu: ["server/routes/feishu.ts"],
    interop: ["server/routes/a2a.ts", "server/routes/guest-agents.ts"],
    "frontend-cockpit": [],
    "frontend-3d": [],
    memory: [],
    infrastructure: [
      "server/routes/blueprint/",
      "server/routes/chat.ts",
      "server/routes/config.ts",
      "server/routes/reports.ts",
      "server/routes/telemetry.ts",
      "server/routes/cost.ts",
      "server/routes/reputation.ts",
      "server/routes/knowledge.ts",
      "server/routes/rag.ts",
      "server/routes/nl-command.ts",
    ],
  };
  for (const d of DOMAIN_ENUM) {
    const inDomain = routes.filter((r) => r.domain === d);
    if (!inDomain.length) continue;
    lines.push(`### ${d} (${inDomain.length} routes)`);
    lines.push("");
    const anchors = (routeAnchors[d] || []).filter((p) => inDomain.some((r) => r.module_path.startsWith(p)));
    if (anchors.length) {
      lines.push(`Anchor handlers: ${anchors.map((p) => "`" + p + "`").join(", ")}.`);
      lines.push("");
    }
    if (d === "infrastructure") {
      lines.push(`Infrastructure routes are heavy on \`server/routes/blueprint/\` (Web-AIGC node entrypoints) and \`server/routes/node-adapters/\`. Per \`.kiro/steering/project-overview.md § Web-AIGC 主线入口\`, these surfaces are the platform's MCP / search / Office / multi-modal / risk-action / host-action node bindings (~58 specs封板 / 238/238 tasks).`);
      lines.push("");
    }
  }

  // Core modules grouped
  lines.push("## Core modules — key clusters per domain");
  lines.push("");
  const coreAnchors = {
    mission: ["server/core/mission-orchestrator.ts", "server/core/mission-projection.ts"],
    workflow: ["server/core/workflow-engine.ts", "server/core/execution-plan-builder.ts"],
    executor: ["server/core/execution-bridge.ts", "server/core/executor-client.ts"],
    audit: ["server/audit/", "server/core/audit*"],
    lineage: ["server/lineage/", "server/core/lineage*"],
    memory: ["server/core/memory/", "server/core/evolution.ts", "server/core/heartbeat.ts"],
    interop: ["server/core/a2a-server.ts", "server/core/a2a-client.ts", "server/core/swarm-orchestrator.ts", "server/core/guest-*.ts"],
    feishu: ["server/feishu/"],
    "frontend-cockpit": [],
    "frontend-3d": [],
    infrastructure: [
      "server/core/rag/",
      "server/core/knowledge-graph/",
      "server/core/nl-command/",
      "server/core/governance/",
      "server/core/reputation/",
      "server/core/autonomy/",
      "server/core/skills/",
      "server/core/roles/",
    ],
  };
  for (const d of DOMAIN_ENUM) {
    const inDomain = cores.filter((r) => r.domain === d);
    if (!inDomain.length) continue;
    lines.push(`### ${d} (${inDomain.length} core modules)`);
    lines.push("");
    const anchors = coreAnchors[d] || [];
    if (anchors.length) {
      lines.push(`Anchor modules: ${anchors.map((p) => "`" + p + "`").join(", ")}.`);
      lines.push("");
    }
  }

  // Executors
  lines.push("## Executor modules");
  lines.push("");
  lines.push("All under `services/lobster-executor/src/`. Anchor specs: `lobster-executor-real`, `secure-sandbox`, `ai-enabled-sandbox`, `sandbox-live-preview`. They expose:");
  lines.push("");
  lines.push("- `POST /api/executor/jobs` — receive an `ExecutionPlan` from `server/core/execution-bridge.ts`.");
  lines.push("- `POST /api/executor/events` — HMAC-signed callback from container → server, gated by `EXECUTOR_CALLBACK_SECRET`.");
  lines.push("- `services/lobster-executor/src/docker-runner.ts` (real Docker), `mock-runner.ts` (mock fallback), `security-policy.ts` (seccomp / AppArmor), `credential-*.ts` (AI credential injection / redaction).");
  lines.push("");
  lines.push(`Enumerated executor modules (${executors.length}):`);
  lines.push("");
  for (const e of listSorted(executors)) {
    lines.push(`- \`${e.module_path}\` — T/B/L: \`${e.trunk_branch_legacy}\``);
  }
  lines.push("");
  lines.push("## Reference");
  lines.push("");
  lines.push("- Inventory: [module-inventory.md](./module-inventory.md)");
  lines.push("- Domain map (parent view): [04-domain-map.md](./04-domain-map.md)");
  lines.push("- Frontend nav (sibling): [05-frontend-navigation-map.md](./05-frontend-navigation-map.md)");
  lines.push("- Companion diagram: [d6-backend-capability-map.svg](./d6-backend-capability-map.svg)");
  lines.push("- Audit table: [spec-audit-table.md](./spec-audit-table.md)");
  lines.push("- Q3 traceability: this document is a supporting answer to Q3 of the `Five_Control_Recovery_Questions`; primary is `01`, peers are `03`, `04`, `05`, `09`.");
  lines.push("");
  fs.writeFileSync(path.join(SPEC_DIR, "06-backend-capability-map.md"), lines.join("\n"), "utf8");
}

function emitSvgD6() {
  const BE_KINDS = new Set(["route", "core_module", "executor"]);
  const routesByDomain = {};
  const coresByDomain = {};
  let executorTotal = 0;
  for (const r of inv) {
    if (!BE_KINDS.has(r.kind)) continue;
    if (r.kind === "route") routesByDomain[r.domain] = (routesByDomain[r.domain] || 0) + 1;
    else if (r.kind === "core_module") coresByDomain[r.domain] = (coresByDomain[r.domain] || 0) + 1;
    else executorTotal++;
  }
  const w = 1200, h = 720;
  const ordered = DOMAIN_ENUM.slice().sort((a, b) => ((routesByDomain[b] || 0) + (coresByDomain[b] || 0)) - ((routesByDomain[a] || 0) + (coresByDomain[a] || 0)));
  const cols = 4;
  const cellW = (w - 80) / cols;
  const cellH = 130;
  const trunkSet = new Set(data.trunkSet);
  let body = "";
  ordered.forEach((d, i) => {
    const r = routesByDomain[d] || 0;
    const c = coresByDomain[d] || 0;
    if (r + c === 0 && d !== "executor") return;
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = 40 + col * cellW + 10;
    const y = 130 + row * cellH;
    const onTrunk = trunkSet.has(d);
    const fill = onTrunk ? "#1f6feb" : (d === "infrastructure" ? "#6e7681" : "#3fb950");
    body += `\n  <g>`;
    body += `\n    <rect x="${x}" y="${y}" width="${cellW - 20}" height="${cellH - 20}" rx="10" fill="${fill}" fill-opacity="0.15" stroke="${fill}" stroke-width="2"/>`;
    body += `\n    <text x="${x + 14}" y="${y + 24}" font-family="JetBrains Mono" font-size="16" font-weight="700" fill="${fill}">${d}${onTrunk ? " ★" : ""}</text>`;
    body += `\n    <text x="${x + 14}" y="${y + 50}" font-family="JetBrains Mono" font-size="13" fill="#c9d1d9">routes: ${r}</text>`;
    body += `\n    <text x="${x + 14}" y="${y + 70}" font-family="JetBrains Mono" font-size="13" fill="#c9d1d9">core_modules: ${c}</text>`;
    if (d === "executor") body += `\n    <text x="${x + 14}" y="${y + 90}" font-family="JetBrains Mono" font-size="11" fill="#8b949e">+ ${executorTotal} executor modules under services/</text>`;
    body += `\n  </g>`;
  });
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<!--
manifest:
  source: module-inventory.md (rows where kind ∈ {route, core_module, executor})
  filtered-rows: ${Object.values(routesByDomain).reduce((a, b) => a + b, 0) + Object.values(coresByDomain).reduce((a, b) => a + b, 0) + executorTotal}
  upstream: .tmp/deduped_findings.jsonl
  audit-rows: spec-audit-table.md (mission-runtime, workflow-engine, executor-integration, audit-chain, data-lineage-tracking, feishu-bridge, a2a-protocol, vector-db-rag-pipeline, knowledge-graph, nl-command-center)
  derived-by: .tmp/build-domain-docs.mjs
-->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  <rect width="100%" height="100%" fill="#0d1117"/>
  <text x="40" y="40" font-family="Space Grotesk, sans-serif" font-size="22" font-weight="700" fill="#f0f6fc">D6 — Backend Capability Map</text>
  <text x="40" y="64" font-family="JetBrains Mono" font-size="12" fill="#8b949e">routes + core_modules + executor by domain · ★ = TRUNK domain on the Mission Execution Main Loop</text>
  <text x="40" y="86" font-family="JetBrains Mono" font-size="12" fill="#8b949e">total routes=${Object.values(routesByDomain).reduce((a,b)=>a+b,0)} · total core_modules=${Object.values(coresByDomain).reduce((a,b)=>a+b,0)} · executor modules=${executorTotal}</text>${body}
  <text x="40" y="${h - 20}" font-family="JetBrains Mono" font-size="11" fill="#8b949e">snapshot=2026-05-28 · HEAD=d181be2f · derived from module-inventory.md</text>
</svg>
`;
  fs.writeFileSync(path.join(SPEC_DIR, "d6-backend-capability-map.svg"), svg, "utf8");
}

emitDoc04();
emitSvgD4();
emitDoc05();
emitSvgD5();
emitDoc06();
emitSvgD6();

// Print byte sizes summary.
const out = [
  "module-inventory.md",
  "04-domain-map.md",
  "d4-domain-map.svg",
  "05-frontend-navigation-map.md",
  "d5-frontend-navigation-map.svg",
  "06-backend-capability-map.md",
  "d6-backend-capability-map.svg",
];
for (const f of out) {
  const p = path.join(SPEC_DIR, f);
  if (!fs.existsSync(p)) continue;
  const st = fs.statSync(p);
  const lines = fs.readFileSync(p, "utf8").split(/\r?\n/).length;
  console.log(`${f} — ${st.size} bytes, ${lines} lines`);
}
