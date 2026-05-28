# 06 后端能力地图

_Implements: REQ-2.3, REQ-6.1, REQ-7.2 — Validates: Property 2, Property 7_

## Header

- Frozen HEAD: `d181be2f` (`2026-05-28T02:06:35Z`).
- Filter: `module-inventory.md` rows where `kind ∈ {route, core_module, executor}`. Total: **362** modules (`236` routes, `100` core modules, `26` executors).
- Companion diagram: [`d6-backend-capability-map.svg`](./d6-backend-capability-map.svg) (`manifest:` cites the filtered inventory rows).
- The route count `391` in `.kiro/steering/project-overview.md § 项目规模` is the file-level total; the inventory's `236` reflects deduplicated canonical handlers (per-file dedupe of clusters in `.tmp/duplicate_clusters.jsonl`).

## Distribution

### Routes by domain

| domain | route count |
|---|---|
| mission | 2 |
| workflow | 1 |
| audit | 1 |
| lineage | 1 |
| feishu | 1 |
| interop | 1 |
| infrastructure | 229 |
| **Total** | **236** |

### Core modules by domain

| domain | core_module count |
|---|---|
| mission | 2 |
| workflow | 3 |
| executor | 3 |
| memory | 2 |
| interop | 11 |
| infrastructure | 79 |
| **Total** | **100** |

### Executor modules

Total: `26`. All under `services/lobster-executor/src/`. They form the only executor service today (per `.kiro/steering/project-overview.md § 项目规模`).

## Routes — key handlers per domain

### mission (2 routes)

Anchor handlers: `server/routes/tasks.ts`, `server/routes/planets.ts`.

### workflow (1 routes)

Anchor handlers: `server/routes/workflows.ts`.

### audit (1 routes)

Anchor handlers: `server/routes/audit.ts`.

### lineage (1 routes)

Anchor handlers: `server/routes/lineage.ts`.

### feishu (1 routes)

Anchor handlers: `server/routes/feishu.ts`.

### interop (1 routes)

Anchor handlers: `server/routes/a2a.ts`.

### infrastructure (229 routes)

Anchor handlers: `server/routes/blueprint/`, `server/routes/chat.ts`, `server/routes/config.ts`, `server/routes/reports.ts`, `server/routes/telemetry.ts`, `server/routes/cost.ts`, `server/routes/reputation.ts`, `server/routes/knowledge.ts`, `server/routes/rag.ts`, `server/routes/nl-command.ts`.

Infrastructure routes are heavy on `server/routes/blueprint/` (Web-AIGC node entrypoints) and `server/routes/node-adapters/`. Per `.kiro/steering/project-overview.md § Web-AIGC 主线入口`, these surfaces are the platform's MCP / search / Office / multi-modal / risk-action / host-action node bindings (~58 specs封板 / 238/238 tasks).

## Core modules — key clusters per domain

### mission (2 core modules)

Anchor modules: `server/core/mission-orchestrator.ts`, `server/core/mission-projection.ts`.

### workflow (3 core modules)

Anchor modules: `server/core/workflow-engine.ts`, `server/core/execution-plan-builder.ts`.

### executor (3 core modules)

Anchor modules: `server/core/execution-bridge.ts`, `server/core/executor-client.ts`.

### memory (2 core modules)

Anchor modules: `server/core/memory/`, `server/core/evolution.ts`, `server/core/heartbeat.ts`.

### interop (11 core modules)

Anchor modules: `server/core/a2a-server.ts`, `server/core/a2a-client.ts`, `server/core/swarm-orchestrator.ts`, `server/core/guest-*.ts`.

### infrastructure (79 core modules)

Anchor modules: `server/core/rag/`, `server/core/knowledge-graph/`, `server/core/nl-command/`, `server/core/governance/`, `server/core/reputation/`, `server/core/autonomy/`, `server/core/skills/`, `server/core/roles/`.

## Executor modules

All under `services/lobster-executor/src/`. Anchor specs: `lobster-executor-real`, `secure-sandbox`, `ai-enabled-sandbox`, `sandbox-live-preview`. They expose:

- `POST /api/executor/jobs` — receive an `ExecutionPlan` from `server/core/execution-bridge.ts`.
- `POST /api/executor/events` — HMAC-signed callback from container → server, gated by `EXECUTOR_CALLBACK_SECRET`.
- `services/lobster-executor/src/docker-runner.ts` (real Docker), `mock-runner.ts` (mock fallback), `security-policy.ts` (seccomp / AppArmor), `credential-*.ts` (AI credential injection / redaction).

Enumerated executor modules (26):

- `services/lobster-executor/src/ai-task-presets.ts` — T/B/L: `trunk`
- `services/lobster-executor/src/app.ts` — T/B/L: `trunk`
- `services/lobster-executor/src/callback-sender.ts` — T/B/L: `trunk`
- `services/lobster-executor/src/capabilities.ts` — T/B/L: `trunk`
- `services/lobster-executor/src/concurrency-limiter.ts` — T/B/L: `trunk`
- `services/lobster-executor/src/config.ts` — T/B/L: `trunk`
- `services/lobster-executor/src/credential-injector.ts` — T/B/L: `trunk`
- `services/lobster-executor/src/credential-scrubber.ts` — T/B/L: `trunk`
- `services/lobster-executor/src/docker-runner.ts` — T/B/L: `trunk`
- `services/lobster-executor/src/errors.ts` — T/B/L: `trunk`
- `services/lobster-executor/src/hmac-signer.ts` — T/B/L: `trunk`
- `services/lobster-executor/src/index.ts` — T/B/L: `trunk`
- `services/lobster-executor/src/log-batcher.ts` — T/B/L: `trunk`
- `services/lobster-executor/src/mock-runner.ts` — T/B/L: `trunk`
- `services/lobster-executor/src/native-runner.ts` — T/B/L: `trunk`
- `services/lobster-executor/src/request-schema.ts` — T/B/L: `trunk`
- `services/lobster-executor/src/retry-buffer.ts` — T/B/L: `trunk`
- `services/lobster-executor/src/runner.ts` — T/B/L: `trunk`
- `services/lobster-executor/src/screenshot-utils.ts` — T/B/L: `trunk`
- `services/lobster-executor/src/security-audit.ts` — T/B/L: `trunk`
- `services/lobster-executor/src/security-policy.ts` — T/B/L: `trunk`
- `services/lobster-executor/src/service.ts` — T/B/L: `trunk`
- `services/lobster-executor/src/skill-job.ts` — T/B/L: `trunk`
- `services/lobster-executor/src/skill-registry.ts` — T/B/L: `trunk`
- `services/lobster-executor/src/types.ts` — T/B/L: `trunk`
- `services/lobster-executor/vitest.config.ts` — T/B/L: `trunk`

## Reference

- Inventory: [module-inventory.md](./module-inventory.md)
- Domain map (parent view): [04-domain-map.md](./04-domain-map.md)
- Frontend nav (sibling): [05-frontend-navigation-map.md](./05-frontend-navigation-map.md)
- Companion diagram: [d6-backend-capability-map.svg](./d6-backend-capability-map.svg)
- Audit table: [spec-audit-table.md](./spec-audit-table.md)
- Q3 traceability: this document is a supporting answer to Q3 of the `Five_Control_Recovery_Questions`; primary is `01`, peers are `03`, `04`, `05`, `09`.
