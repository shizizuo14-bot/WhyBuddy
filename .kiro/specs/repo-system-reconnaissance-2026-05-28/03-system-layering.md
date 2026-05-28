# 03 系统分层图

_Implements: REQ-2.3, REQ-6.1, REQ-7.2 — Validates: Property 2, Property 7_

## Header

- Frozen HEAD: `d181be2f` (`2026-05-28T02:06:35Z`).
- Volumetric source: `.kiro/steering/project-overview.md § 项目规模` and `.kiro/steering/execution-plan.md § 当前维护快照` (2026-05-28). No counts are recomputed; this document only re-cites the snapshot baseline.
- Spec citations are restricted to `IMPLEMENTED_AND_VALID` rows of `spec-audit-table.md` (with one explicit `PARTIALLY_IMPLEMENTED` exception called out inline).
- Companion diagram: `d3-system-layering.svg` (`manifest:` cites the snapshot source-tree summary + audit-table rows referenced inside each layer).

## Layer model

The repo runs as five horizontal layers; the boundary contract sits in `shared/`. The Mission Execution `Main_Business_Loop` (doc 01) crosses **all five layers** in order: `client` initiates, `shared` types the wire, `server` owns the FSM, `services/lobster-executor` runs the work, `.kiro/` pins the spec contracts. No layer is skipped; no layer is owned by a single spec.

### 1. Client layer — `client/src/`

- Snapshot: `916` files / `217K` lines. Sub-counts: `components 342`, `pages 314`, `lib 209`.
- Responsibility: render the Task Autopilot Cockpit (3D scene, HoloDock, task driving cabin, audit / lineage panels, replay timeline) and host the **browser-only runtime** for GitHub Pages mode.
- Key IMPLEMENTED specs: `mission-native-projection` (owns `client/src/lib/tasks-store.ts`), `frontend-3d`, `browser-runtime`, `holographic-ui`, `office-task-cockpit` (where IMPLEMENTED).
- Boundary touch: only consumes wire types declared in `shared/`; no direct import of `server/` is permitted (enforced at build time by Vite path aliases).

### 2. Shared layer — `shared/`

- Snapshot: `139` files / `26K` lines.
- Responsibility: the **boundary contract**. Every type that crosses HTTP, Socket, executor callback, or IndexedDB lives here. `14` shared contract modules per `.kiro/steering/project-overview.md`.
- Key IMPLEMENTED specs: `mission-runtime` (`shared/mission/contracts.ts`), `destination-model-and-parser` and `destination-card-and-goal-summary` (`shared/mission/autopilot.ts`), `audit-chain` (`shared/audit/contracts.ts`), `data-lineage-tracking` (`shared/lineage/contracts.ts`), `collaboration-replay` (`shared/replay/contracts.ts`), `vector-db-rag-pipeline` (`shared/rag/contracts.ts`), `cross-framework-export` (`shared/export-schema.ts`), `a2a-protocol` (`shared/a2a-protocol.ts`).
- Boundary contract rule: a type is "boundary" iff it is imported by both `client/` and `server/`. Adding a field to a boundary type requires updating both consumers in the same change.

### 3. Server layer — `server/`

- Snapshot: `1,004` files / `290K` lines. Sub-counts: `routes 391`, `core 100`, `tests 362`, `feishu 13`, `audit 12`, `lineage 7`, `tasks 7`.
- Responsibility: the canonical truth source for Mission state, the workflow runtime, the audit chain, the lineage DAG, the Feishu bridge, the A2A server, and the executor callback. Owns `data/database.json` and the Mission state machine.
- Key IMPLEMENTED specs (all touch the Main Business Loop): `mission-runtime`, `mission-operator-actions`, `mission-cancel-control`, `workflow-engine`, `executor-integration`, `audit-chain`, `data-lineage-tracking`, `feishu-bridge`, `a2a-protocol`, `autonomous-swarm`, `nl-command-center`, `vector-db-rag-pipeline`, `knowledge-graph`.
- Boundary touch: emits typed Socket events and HTTP responses against `shared/`; ingests executor callbacks against `shared/executor/contracts.ts`.

### 4. Executor layer — `services/lobster-executor/`

- Snapshot: `68` files / `12K` lines (the `services/` total). The Lobster executor is the only service today.
- Responsibility: run untrusted code in **real Docker containers** (with a native fallback when Docker is unreachable, per `.kiro/steering/2026-04-15-runtime-current-state.md`). Owns the security sandbox (seccomp / AppArmor), AI credential injection, and HMAC-signed callbacks back to the server.
- Key IMPLEMENTED specs: `lobster-executor-real`, `secure-sandbox`, `sandbox-live-preview`, `ai-enabled-sandbox`, `executor-integration` (the bridge — the bridge code itself lives in `server/core/`, not here).
- Boundary touch: receives `ExecutionPlan` over HTTP from the server; replies with HMAC-signed events over `/api/executor/events`. Does not import from `shared/` directly — it speaks the contract on the wire.

### 5. Docs layer — `.kiro/`

- Snapshot: `287` spec dirs (`requirements.md 285` / `design.md 286` / `tasks.md 286` / `bugfix.md 3`); `7,887 / 8,806` checkboxes (`89.6%`); `1,074` Markdown files repo-wide. Steering files under `.kiro/steering/` pin the snapshot baselines (project-overview, execution-plan, runtime-current-state, etc.).
- Responsibility: the **versioned contract** for what the system is supposed to do. Every IMPLEMENTED spec is linked to a code path; every DESIGNED_NEVER_BUILT spec is recorded as such in `spec-audit-table.md`.
- Key fact: `.kiro/` is read by humans and by this reconnaissance pipeline — it is not loaded by the runtime. Removing `.kiro/` would leave the runtime intact but the system uninspectable.

## Cross-layer invariants

Three rules hold for every change that crosses a layer boundary:

1. **Boundary types live in `shared/`.** Adding a field to `MissionEvent`, `ExecutionPlan`, or `AuditEntry` is a `shared/` change first; client and server are downstream consumers.
2. **The server is the truth source for Mission state.** `client/src/lib/tasks-store.ts` is a projection (`mission-native-projection`); the browser-only runtime is the *only* exception, and it is explicitly scoped to GitHub Pages mode.
3. **`.kiro/` updates accompany behaviour changes.** Every IMPLEMENTED row of `spec-audit-table.md` links a spec to a working code path; the reverse is checked by Stage 6 Reconciler (see doc `08`, forthcoming).

## Reference

- Companion diagram: [d3-system-layering.svg](./d3-system-layering.svg) (`manifest:` cites snapshot source-tree summary + per-layer audit rows).
- Audit table: [spec-audit-table.md](./spec-audit-table.md)
- Steering: `.kiro/steering/project-overview.md § 项目规模 / § 项目目录结构`, `.kiro/steering/execution-plan.md § 当前维护快照`, `.kiro/steering/2026-04-15-runtime-current-state.md`.
- Q3 traceability: this document is a supporting answer to Q3 of the `Five_Control_Recovery_Questions`; primary is `01`, peers are `05`, `06`, `09`.
