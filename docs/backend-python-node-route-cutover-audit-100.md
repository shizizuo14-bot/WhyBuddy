# Backend Python Node Route Cutover Audit 100

## Scope
This is the mandatory final Node route cutover audit executed after 100% candidate code tasks (including runtime closures, provider cutovers, and bridges).

It determines whether remaining Node code in `server/routes`, `server/core`, `server/auth`, `server/tasks`, `server/permission`, `server/audit`, and `server/routes/node-adapters` has degraded to:
- thin proxy (Node only forwards bounded ops to Python with contract tests)
- compat shell (Node preserves production surface/compat for unchanged prod systems)
- production-owned (intentionally retained Node entry points with explicit boundaries)
- or still contains node-owned-gap (large un-migrated business logic that blocks 100%)

This audit does **not** change business code, does **not** count itself toward migration molecules, does **not** promote docs-only/fake/synthetic as production takeover, and does **not** extrapolate SlideRule V5 % to whole backend.

Evidence drawn strictly from:
- `agent-loop/scripts/migration-queue.json`
- `agent-loop/tasks/sliderule-python-migration-status.md`
- `docs/backend-python-node-route-inventory-90.md`
- `docs/backend-python-runtime-depth-audit-90.md`
- `docs/backend-python-production-wiring-reality-95.md`
- Current `server/routes/**`, `server/core/**`, `server/auth/**`, `server/tasks/**`, `server/permission/**`, `server/audit/**`, `server/routes/node-adapters/**`
- `slide-rule-python/services/**` and `tests/**`

## Classification Rules for Cutover 100
| Classification       | Meaning                                                                 | Can support 100%? |
|----------------------|-------------------------------------------------------------------------|-------------------|
| thin-proxy           | Node route is a minimal forwarder (delegation helper + envelope map) to a Python runtime boundary. Node does not own the execution semantics. | Yes (bounded) |
| compat-shell         | Node keeps the public production contract and calls into Python for identity/runtime slices but retains ownership of stores, mailers, or legacy paths for compatibility. | Yes if explicitly bounded |
| production-owned     | Node is the declared production owner of this surface (e.g. durable stores, project/resource auth, main API entry, UI-facing shells). Explicitly retained. | Yes, if documented as retained boundary |
| node-owned-gap       | Substantial business logic (route handlers + state + stores) still lives in Node with no Python contract/proxy/runtime closure. Blocks full 100%. | No |
| intentionally-retained | Production boundary (e.g. top-level Express mounts, session stores, permission enforcement) kept in Node for architectural or external reasons. | Yes if not claimed as migrated |

No "fake/synthetic/degraded/skipped" may be written as production takeover.

## Route and Core Surface (post-100-candidates)

| Surface                  | Classification      | Evidence / Notes |
|--------------------------|---------------------|------------------|
| `server/index.ts` top-level mounts (`/api/*`, health, executor/events, blueprint shell, web-aigc, etc.) | production-owned, intentionally-retained | Still the single Express app mounting all families. Delegates only specific subpaths. Primary production API owner. |
| `/api/sliderule` + python-delegation | thin-proxy | `server/routes/sliderule.ts` + `server/sliderule/python-delegation.ts` (callPythonSlideRule, resolve config to PYTHON_SLIDE_RULE_BASE_URL). `slide-rule-python/app.py` + `routes/sliderule_full.py` and `services/slide_rule_*.py` own the V5 baseline. Contract tests exist. |
| `/api/rag`, vector-*, rag risk | compat-shell + production-wiring (bounded) | Python rag_service/rag_ingestion have runtime contracts; Node rag.ts still owns ingestion pipeline + Qdrant adapter surface. Production wiring docs note fake/synthetic for real external. |
| `/api/mcp`, `/api/skills` | thin-proxy + runtime (bounded) | `server/routes/mcp.ts`; python `mcp_runtime.py`, `skill_runtime.py`. Full external tool auth/orchestration remains Node/mixed. |
| `/api/workflows`, `/api/nl-command` | compat-shell | Contract + runtime bridges; production dispatch stays Node. |
| `/api/telemetry`, `/api/cost` | compat-shell | Contracts + synthetic sink tests; real APM/billing emission not taken over. |
| `/api/health`, persistence-health | production-owned (Node) | Node health + smoke to Python; Python health is thin target. |
| `/api/a2a/*` (except bounded invoke) | node-owned-gap + compat | Registry, sessions, cancel, stream remain Node-led per inventory-90 and 97 status. |
| Other core (agents, chat, reports, analytics, replay, ue, planets, feishu, etc.) | production-owned / node-owned-gap | No Python contracts/proxies for full families. |

## Auth Inventory

| Surface | Classification | Evidence / Notes |
|---------|----------------|------------------|
| `/api/auth/*` (register, login, email-code, me, refresh, logout) | compat-shell | `server/routes/auth.ts` contains explicit "thin python runtime bridge for auth identity (login/register/email-code) without changing prod user system". `server/auth/session-service.ts` defines Python*Contract types. Python `auth_identity_runtime.py`, `auth_session_persistence.py` exist. But production MySQL repos, email-mailer, password policy, full session/token issuance remain Node-owned. |
| Auth persistence + mailer | node-owned-gap | `server/auth/email-mailer.ts`, persistence/repositories still Node. No production mailer or user store takeover. |

## Permission Inventory

| Surface | Classification | Evidence / Notes |
|---------|----------------|------------------|
| `/api/permissions` full (roles, policies, tokens, dynamic, conflict) | node-owned-gap | `server/routes/permissions.ts`, `server/permission/*` (check-engine, dynamic-manager, conflict-detector, role-store, policy-store, token-service). Only bounded check-engine / rate-limiter contracts + python hooks in 97. Full management and enforcement surface is Node. |
| Permission rate limit | compat-shell | Python contract + runtime boundary partial. |
| Permission hooks into open/web-aigc | production-owned | Still wired through Node permCheckEngine + audit in index.ts. |

## Audit Inventory

| Surface | Classification | Evidence / Notes |
|---------|----------------|------------------|
| `/api/audit` (events, query, export, compliance, anomaly, retention) | compat-shell + node-owned-gap | `server/routes/audit.ts` uses thin proxy helpers (`toAuditQueryProxy*`) for some query; `server/audit/*` (collector, chain, retention, export, anomaly, verifier) + python `audit_retention_export.py`, `audit_sink.py`. Full store, retention policy, anomaly, compliance, and web-aigc audit hooks remain Node. |
| Audit hooks in permission/web-aigc | production-owned | Node `audit-logger.ts`, observability. |

## Tasks / Executor / Mission Lifecycle

| Surface | Classification | Evidence / Notes |
|---------|----------------|------------------|
| `/api/tasks`, mission store, project/resource auth, full lifecycle | node-owned-gap | `server/routes/tasks.ts`, `server/tasks/*` (mission-*.ts), db, executor callback still Node primary. Python task_* bridges are executor-client only + mission event replay (bounded). |
| `/api/executor/events` | compat-shell | Callback contract + routing; replay semantics Node. |
| Smoke endpoints in index.ts | production-owned (support) | Not migrated. |

## Blueprint Inventory (largest remaining)

| Surface | Classification | Evidence / Notes |
|---------|----------------|------------------|
| `/api/blueprint` route shell + context + event-bus + job-store + socket-relay + diagnostics + ledger + replan + family + staleness + full handlers | production-owned + node-owned-gap | `server/routes/blueprint.ts` (large), `server/routes/blueprint/*` (hundreds of .ts files for brainstorm, replan, prompt-package, effect-preview, spec-tree, stage-edit, etc.). Node owns durable store, full state machine, event bus transport. |
| Specific bounded slices (job runtime, stage-edit, artifact memory, review/export, role-runtime, prompt-preview, spec-docs, main-runtime-closure) | thin-proxy / compat-shell | Dedicated python services + Node thin bridges (`main-runtime-closure-python.ts`, `review-export-python-runtime.ts`, `python-proxy.ts`, `stage-edit-python-runtime.ts` etc.). Explicitly document "Node retains jobStoreOwner/eventBusOwner/ledgerOwner/promptPackageOwner". |
| spec-documents batch/proxy | thin-proxy | Routed to Python `/api/blueprint/spec-documents`. |

## Web AIGC + node-adapters Inventory

| Surface | Classification | Evidence / Notes |
|---------|----------------|------------------|
| node-adapters/* (most long-tail: web-qa, open-*, get-*, transaction, orchestration, robot-reply, similarity, intent, etc.) | node-owned-gap | `server/routes/node-adapters/*.ts` implement full logic or legacy adapters. |
| Delegated ones (ai-ppt, dynamic-chart, file-*, vision-audio, search, ocr-static, transaction) | thin-proxy + compat (bounded) | Node adapters call Python services (`web_aigc_*_adapter.py`) and map envelopes. Tests mark `provider: fake`, `externalCalls: false`. Production external providers remain gaps per production-wiring-95. |
| Vector adapters, risk actions | production-wiring (Node side) | Still Node adapters calling into Python RAG boundaries. |

## Python Ownership Reality (100-candidate baseline)
- Python (slide-rule-python) owns:
  - V5 SlideRule baseline: sessions, orchestrate-plan, execute-capability (via maps), drive-full, spec-docs proxy.
  - Bounded runtime slices: rag, telemetry, mcp/skill, workflow/nl, auth-identity, permission-audit-hooks, task-executor/mission-replay, blueprint closures (job/event/prompt/artifact/review/role/stage), web-aigc selected, external smoke diagnostics.
- Python does **not** own: main Express surface, full Blueprint state machine + stores, task/mission full lifecycle, auth prod stores+mail, permission policy engine, audit durable platform, most web-aigc longtail, external production providers (real Qdrant, search, OCR, vision, billing, etc.).

## 100-Stage Blocking Gaps (cannot announce 100%)
- Blueprint main route shell, job-store, event-bus, diagnostics, ledger, replan, prompt-package, preview full chain, and many sub-routes remain node-owned-gap / production-owned Node.
- Task lifecycle (store, project auth, scheduler, full cancel/replay beyond replay projection) node-owned-gap.
- Auth production persistence, email, token issuance node-owned-gap (only identity runtime thin).
- Permission full management + enforcement node-owned-gap.
- Audit full retention/export/anomaly + hooks node-owned-gap.
- Web AIGC long-tail (web-qa, many opens, device/location, most adapters) + real external providers node-owned-gap.
- A2A registry/sessions/cancel/stream node-owned-gap.
- Core non-delegated routes (chat, reports, analytics, replay, feishu, ue, etc.) production-owned or gap.
- No evidence that "100% candidate" tasks replaced the large Node denominators; they added bounded slices only.

Explicit conclusion: After all 100% candidate tasks, Node side has not been reduced to "only thin proxy / compat shell / retained boundaries". Substantial node-owned-gap surfaces persist that block overall 100% declaration. Report must not claim production takeover for any slice whose tests or wiring use fake/synthetic/degraded paths.

## Gate Verification Notes
- This document contains required wording: 100, thin proxy, compat shell, node-owned, production.
- Mojibake scan target: this file + migration status.
- All classifications avoid inflating docs-only, fake smoke, or V5 sub-% into whole backend 100%.

## References
- Prior 90/95 inventories and production wiring reality explicitly preserved as source of truth for gaps.
- `sliderule-python-migration-status.md` (97 refresh) states ~92-94% with explicit remaining blockers in Blueprint main, task lifecycle, auth prod, etc.
- No change to business code performed by this audit.

(End of audit. 100% candidate cutover status: blockers remain; do not announce overall 100%.)
