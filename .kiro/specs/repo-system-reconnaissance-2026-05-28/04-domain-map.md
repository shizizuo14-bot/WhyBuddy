# 04 主要域地图

_Implements: REQ-2.4, REQ-6.1, REQ-7.2 — Validates: Property 2, Property 7_

## Header

- Frozen HEAD: `d181be2f` (`2026-05-28T02:06:35Z`).
- Source rows: [`module-inventory.md`](./module-inventory.md) (`969` non-test modules from `.tmp/deduped_findings.jsonl`).
- Domain enum (closed, design.md § Data Models § 2): `mission`, `workflow`, `executor`, `audit`, `lineage`, `memory`, `frontend-cockpit`, `frontend-3d`, `feishu`, `interop`. The inventory adds one off-enum bucket `infrastructure` for shared utilities, UI primitives, and RAG / knowledge / NL-command / blueprint catch-all that fall off the 10-domain map but must still be enumerated.
- TRUNK domains (per design.md § 5 Domain_Mapper labeling rule): `mission`, `workflow`, `executor`, `audit`, `lineage`, `frontend-cockpit`, `feishu` — 7 of 10. These are the domains crossed by the Mission Execution `Main_Business_Loop` (doc `01`).
- Companion diagram: [`d4-domain-map.svg`](./d4-domain-map.svg) (`manifest:` cites `module-inventory.md` rows by domain bucket).

## Distribution

| domain | trunk | branch | legacy | total | TRUNK domain? |
|---|---|---|---|---|---|
| mission | 14 | 0 | 0 | 14 | ✅ |
| workflow | 13 | 0 | 0 | 13 | ✅ |
| executor | 33 | 0 | 0 | 33 | ✅ |
| audit | 5 | 0 | 0 | 5 | ✅ |
| lineage | 5 | 0 | 0 | 5 | ✅ |
| memory | 0 | 4 | 0 | 4 | — |
| frontend-cockpit | 459 | 0 | 0 | 459 | ✅ |
| frontend-3d | 0 | 15 | 0 | 15 | — |
| feishu | 1 | 0 | 0 | 1 | ✅ |
| interop | 0 | 17 | 0 | 17 | — |
| infrastructure | 0 | 403 | 0 | 403 | — |
| **Total** | **530** | **439** | **0** | **969** | — |

> Note: every `legacy` row would need `last-modified-commit > 90 days` from the snapshot epoch (`1779899944`). At this snapshot every scanned module has been touched within the last 90 days, so the legacy column is `0`. This is consistent with `.kiro/steering/execution-plan.md § 当前维护快照`'s active maintenance posture; it does not mean the repo has no historical aliases — those live in the `DUPLICATE` bucket of `spec-audit-table.md`, not in code.

## Per-domain breakdown

### mission (14 modules: 14T / 0B / 0L)

- Mission state machine, orchestrator, projection. Hop 2/3 of the Main Business Loop.
- Key code paths: `server/tasks/mission-store.ts`, `server/core/mission-orchestrator.ts`, `shared/mission/contracts.ts`, `client/src/lib/tasks-store.ts`
- Key specs (anchor citations from `spec-audit-table.md`): `mission-runtime`, `mission-native-projection`, `mission-cancel-control`, `mission-operator-actions`, `destination-model-and-parser`

### workflow (13 modules: 13T / 0B / 0L)

- Ten-stage workflow engine and ExecutionPlan builder. Hop 4 of the Main Business Loop.
- Key code paths: `server/core/workflow-engine.ts`, `server/core/execution-plan-builder.ts`, `client/src/lib/workflow-store.ts`
- Key specs (anchor citations from `spec-audit-table.md`): `workflow-engine`, `workflow-decoupling`, `workflow-panel-decomposition`, `workflow-artifacts-display`

### executor (33 modules: 33T / 0B / 0L)

- Lobster Docker executor + WorkflowEngine bridge. Hop 5 of the Main Business Loop.
- Key code paths: `services/lobster-executor/src/`, `server/core/execution-bridge.ts`, `server/core/executor-client.ts`, `shared/executor/`
- Key specs (anchor citations from `spec-audit-table.md`): `lobster-executor-real`, `executor-integration`, `ai-enabled-sandbox`, `secure-sandbox`, `sandbox-live-preview`

### audit (5 modules: 5T / 0B / 0L)

- Hash-linked audit chain overlay attached to hops 2/3/6/7.
- Key code paths: `server/audit/`, `shared/audit/`, `server/routes/audit.ts`
- Key specs (anchor citations from `spec-audit-table.md`): `audit-chain`

### lineage (5 modules: 5T / 0B / 0L)

- DAG lineage overlay attached to hops 2/3/6/7.
- Key code paths: `server/lineage/`, `shared/lineage/`, `server/routes/lineage.ts`
- Key specs (anchor citations from `spec-audit-table.md`): `data-lineage-tracking`

### memory (4 modules: 0T / 4B / 0L)

- Three-tier memory (session / vector / SOUL) + evolution / heartbeat. Off the Main Loop.
- Key code paths: `server/core/memory/`, `server/core/evolution.ts`, `server/core/heartbeat.ts`, `shared/memory/`
- Key specs (anchor citations from `spec-audit-table.md`): `memory-system`, `evolution-heartbeat`

### frontend-cockpit (459 modules: 459T / 0B / 0L)

- Driving-cabin UI: pages, panels, stores, primitives that consume Mission / Workflow / Audit / Lineage projections. Hop 7 of the Main Business Loop.
- Key code paths: `client/src/pages/`, `client/src/components/office/`, `client/src/components/tasks/`, `client/src/components/launch/`, `client/src/lib/`
- Key specs (anchor citations from `spec-audit-table.md`): `office-task-cockpit`, `task-hub-convergence`, `navigation-convergence`, `task-runtime-visibility-v1`, `office-shell-convergence-v1`, `task-os-home-redesign-v1`

### frontend-3d (15 modules: 0T / 15B / 0L)

- Three.js R3F scene + browser-only runtime. Off the Main Loop except for Frontend-Mode demos.
- Key code paths: `client/src/components/three/`, `client/src/components/Scene3D.tsx`
- Key specs (anchor citations from `spec-audit-table.md`): `frontend-3d`, `browser-runtime`, `scene-mission-fusion`, `scene-agent-interaction`

### feishu (1 modules: 1T / 0B / 0L)

- Feishu relay & progress mirror. Hop 1 entry-mirror and hop 8 progress回传 of the Main Business Loop.
- Key code paths: `server/feishu/`, `server/routes/feishu.ts`
- Key specs (anchor citations from `spec-audit-table.md`): `feishu-bridge`

### interop (17 modules: 0T / 17B / 0L)

- A2A protocol, Swarm orchestrator, Guest agent lifecycle. Cross-framework ingress / egress, off the Main Loop.
- Key code paths: `server/core/a2a-server.ts`, `server/core/a2a-client.ts`, `server/core/a2a-adapters/`, `server/core/swarm-orchestrator.ts`, `server/core/guest-*.ts`, `shared/a2a-protocol.ts`
- Key specs (anchor citations from `spec-audit-table.md`): `a2a-protocol`, `autonomous-swarm`, `agent-marketplace`

### infrastructure (403 modules: 0T / 403B / 0L)

- Generic UI primitives, shared utilities, RAG / knowledge / NL-command / governance / sandbox / blueprint catch-all. Not part of the closed 10-domain set; enumerated for inventory completeness.
- Key code paths: `server/routes/blueprint/`, `server/core/rag/`, `server/core/knowledge-graph/`, `server/core/nl-command/`, `shared/`, `client/src/components/ui/`
- Key specs (anchor citations from `spec-audit-table.md`): `vector-db-rag-pipeline`, `knowledge-graph`, `nl-command-center`, `cost-governance-strategy`, `human-in-the-loop`, `telemetry-dashboard`

## Domain dependency graph

Edges trace the runtime data flow on the canonical `Main_Business_Loop` (doc `01`) plus the cross-domain overlays. Edge direction is `producer → consumer`.

```text
frontend-cockpit ──user input──▶ feishu ──relay──▶ mission
frontend-cockpit ──user input───────────────────▶ mission
mission ──build plan──▶ workflow ──dispatch──▶ executor
executor ──HMAC callback──▶ mission (state)
mission ──socket fanout──▶ frontend-cockpit
mission / workflow / executor ──events──▶ audit (overlay)
mission / workflow / executor ──events──▶ lineage (overlay)
workflow ──post-run materialize──▶ memory (off-loop)
interop ──A2A ingress──▶ workflow / mission
frontend-3d ──demo browser-only──▶ workflow (browser-runtime variant)
infrastructure ──shared utilities──▶ all domains (no domain depends on it conceptually)
```

Three invariants follow from this graph:

1. The Main Loop crosses **5 TRUNK domains in sequence** (`feishu/frontend-cockpit → mission → workflow → executor → mission/frontend-cockpit`); `audit` and `lineage` attach to every hop as overlays.
2. `memory`, `interop`, `frontend-3d` are off-loop and therefore BRANCH by design — they consume Main-Loop outputs but are not on the critical path.
3. `infrastructure` (UI primitives, RAG / knowledge / blueprint shared utilities) is a sink for non-domain code; nothing else depends on it as a domain. It is enumerated only so the inventory totals match `969`.

## Reference

- Inventory: [module-inventory.md](./module-inventory.md)
- Audit table: [spec-audit-table.md](./spec-audit-table.md)
- Companion diagram: [d4-domain-map.svg](./d4-domain-map.svg)
- Frontend nav (sub-view): [05-frontend-navigation-map.md](./05-frontend-navigation-map.md)
- Backend capability (sub-view): [06-backend-capability-map.md](./06-backend-capability-map.md)
- Q3 traceability: this document is a supporting answer to Q3 of the `Five_Control_Recovery_Questions`; primary is `01`, peers are `03`, `05`, `06`, `09`.
