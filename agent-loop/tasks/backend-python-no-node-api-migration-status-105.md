# Backend Python No-Node API 105 Migration Status

This file is the shared status ledger for the single-stage backend API no-NodeJS cutover queue. It tracks route ownership during the migration from Node backend APIs to Python FastAPI while keeping React, Vite, pnpm, and Node-based smoke tooling.

## Cutover definition
- Keep Node for frontend development, build, and smoke tooling.
- Remove Node ownership from backend API business semantics.
- Python FastAPI becomes the backend API source of truth.
- Node routes may remain only as PYTHON_FIRST_COMPAT thin shells or deprecated stubs until final retirement.

## Route ownership states
- ACTIVE_NODE_BUSINESS: Node still owns business behavior.
- PYTHON_FIRST_COMPAT: Python owns behavior; Node only proxies or preserves compatibility.
- PYTHON_ONLY: Frontend and tests use Python directly; Node backend route is removed or inert.
- BLOCKED: The task found a concrete blocker and recorded the rescue boundary.

## Queue summary
- Queue: `backend-python-api-cutover-no-node-105-queue`
- Total tasks: 60
- Worktree scope: queue
- Queue worktree name: `backend-python-api-cutover-no-node-105`
- Execution shape: one stage, one queue, one worktree, logical checkpoints by phase.

## Task ledger
| # | Phase | Task | Status | Goal |
|---:|---|---|---|---|
| 1 | Foundation | backend-python-no-node-foundation-route-inventory-105 | pending | Inventory all Node backend API routes and classify their Python cutover status. |
| 2 | Foundation | backend-python-no-node-foundation-callsite-inventory-105 | pending | Inventory frontend and script callsites that hit Node backend APIs. |
| 3 | Foundation | backend-python-no-node-foundation-contract-registry-105 | pending | Create or update a Python API contract registry for migrated /api surfaces. |
| 4 | Foundation | backend-python-no-node-foundation-health-readiness-105 | pending | Unify backend health and readiness probes around Python as the backend API source. |
| 5 | Foundation | backend-python-no-node-foundation-vite-proxy-default-105 | pending | Make Vite development routing prefer Python backend APIs while preserving frontend Node tooling. |
| 6 | Foundation | backend-python-no-node-foundation-deprecation-state-model-105 | pending | Introduce a route state model for ACTIVE_NODE_BUSINESS, PYTHON_FIRST_COMPAT, and PYTHON_ONLY. |
| 7 | Foundation | backend-python-no-node-foundation-provenance-contract-105 | pending | Standardize Python provenance fields used by browser smokes and contract tests. |
| 8 | Foundation | backend-python-no-node-foundation-smoke-harness-105 | pending | Create a shared smoke harness that fails when frontend success is backed by Node-only APIs. |
| 9 | SlideRule | backend-python-no-node-sliderule-route-inventory-105 | pending | Inventory /api/sliderule routes and identify Node-owned business semantics. |
| 10 | SlideRule | backend-python-no-node-sliderule-route-map-105 | pending | Map every /api/sliderule frontend call to its Python target route and tests. |
| 11 | SlideRule | backend-python-no-node-sliderule-orchestrate-contract-105 | pending | Harden orchestrate-plan as a Python-owned contract including frontend wrapper state. |
| 12 | SlideRule | backend-python-no-node-sliderule-execute-capability-contract-105 | pending | Move execute-capability semantics to Python and keep Node as explicit compat only. |
| 13 | SlideRule | backend-python-no-node-sliderule-evidence-contract-105 | pending | Make evidence and source provenance Python-owned for SlideRule results. |
| 14 | SlideRule | backend-python-no-node-sliderule-delivery-contract-105 | pending | Move delivery capability execution contracts to Python. |
| 15 | SlideRule | backend-python-no-node-sliderule-visual-contract-105 | pending | Move visual capability execution contracts to Python. |
| 16 | SlideRule | backend-python-no-node-sliderule-degraded-error-contract-105 | pending | Ensure timeout, degraded, and error states are returned by Python and visible in UI. |
| 17 | SlideRule | backend-python-no-node-sliderule-result-rendering-contract-105 | pending | Align Python result payloads with frontend rendering and report artifacts. |
| 18 | SlideRule | backend-python-no-node-sliderule-node-compat-thin-proxy-105 | pending | Reduce server/routes/sliderule.ts to an explicit thin compatibility shell. |
| 19 | SlideRule | backend-python-no-node-sliderule-browser-happy-smoke-105 | pending | Make the happy browser smoke prove real Python-backed SlideRule success. |
| 20 | SlideRule | backend-python-no-node-sliderule-route-retirement-readiness-105 | pending | Decide whether Node SlideRule routes can be deleted or kept as deprecated stubs. |
| 21 | AgentLoop | backend-python-no-node-agentloop-route-inventory-105 | pending | Inventory Node AgentLoop API routes, workbench data, run details, and queue controls. |
| 22 | AgentLoop | backend-python-no-node-agentloop-ledger-source-of-truth-105 | pending | Implement or specify Python merged ledger as the single AgentLoop truth source. |
| 23 | AgentLoop | backend-python-no-node-agentloop-queue-outcomes-reader-105 | pending | Move queue-outcomes reading and status projection to Python. |
| 24 | AgentLoop | backend-python-no-node-agentloop-queue-landing-reader-105 | pending | Move queue-landing manual applied state reading to Python. |
| 25 | AgentLoop | backend-python-no-node-agentloop-run-history-reader-105 | pending | Move AgentLoop run history list reading to Python. |
| 26 | AgentLoop | backend-python-no-node-agentloop-run-detail-reader-105 | pending | Move AgentLoop run detail and log summary reading to Python. |
| 27 | AgentLoop | backend-python-no-node-agentloop-status-merge-priority-105 | pending | Lock status merge priority so clean DONE_REVIEWED is not overwritten by older quarantined records. |
| 28 | AgentLoop | backend-python-no-node-agentloop-workbench-list-api-105 | pending | Cut Workbench list data to Python API. |
| 29 | AgentLoop | backend-python-no-node-agentloop-workbench-detail-api-105 | pending | Cut Workbench run detail data to Python API. |
| 30 | AgentLoop | backend-python-no-node-agentloop-resume-preflight-105 | pending | Ensure resume-unfinished preflight reads the same Python authoritative ledger as Workbench. |
| 31 | AgentLoop | backend-python-no-node-agentloop-manual-landed-display-105 | pending | Display APPLIED_TO_MAIN_MANUAL as landed instead of pending queue landing. |
| 32 | AgentLoop | backend-python-no-node-agentloop-queue-count-smoke-105 | pending | Add a smoke guard for queue count consistency such as 48 versus 56 task drift. |
| 33 | AgentLoop | backend-python-no-node-agentloop-node-compat-thin-proxy-105 | pending | Reduce Node AgentLoop API to a thin compatibility shell over Python. |
| 34 | AgentLoop | backend-python-no-node-agentloop-workbench-browser-smoke-105 | pending | Verify Workbench browser data is sourced from Python authoritative APIs. |
| 35 | RAG | backend-python-no-node-rag-route-inventory-105 | pending | Inventory Node RAG routes and frontend/script callers. |
| 36 | RAG | backend-python-no-node-rag-api-contract-105 | pending | Define Python-owned RAG API contract and response shapes. |
| 37 | RAG | backend-python-no-node-rag-query-contract-105 | pending | Move RAG query/search behavior to Python. |
| 38 | RAG | backend-python-no-node-rag-source-evidence-contract-105 | pending | Move RAG source evidence and citation payloads to Python. |
| 39 | RAG | backend-python-no-node-rag-degraded-empty-result-105 | pending | Make empty result, timeout, and degraded RAG states Python-owned and visible. |
| 40 | RAG | backend-python-no-node-rag-frontend-callsite-cutover-105 | pending | Cut RAG frontend callsites from Node-owned endpoints to Python APIs. |
| 41 | RAG | backend-python-no-node-rag-node-compat-thin-proxy-105 | pending | Reduce Node RAG route to a compatibility shell or remove it where safe. |
| 42 | RAG | backend-python-no-node-rag-api-smoke-python-only-105 | pending | Add API or browser smoke proving RAG uses Python backend. |
| 43 | A2A | backend-python-no-node-a2a-route-inventory-105 | pending | Inventory Node A2A routes, core server responsibilities, and callers. |
| 44 | A2A | backend-python-no-node-a2a-message-contract-105 | pending | Define Python-owned A2A message contract. |
| 45 | A2A | backend-python-no-node-a2a-agent-session-contract-105 | pending | Move A2A agent session semantics to Python. |
| 46 | A2A | backend-python-no-node-a2a-task-lifecycle-contract-105 | pending | Move A2A task lifecycle and state transitions to Python. |
| 47 | A2A | backend-python-no-node-a2a-stream-event-contract-105 | pending | Move A2A stream and event transport semantics to Python. |
| 48 | A2A | backend-python-no-node-a2a-error-retry-cancel-105 | pending | Move A2A error, retry, and cancel semantics to Python. |
| 49 | A2A | backend-python-no-node-a2a-frontend-callsite-cutover-105 | pending | Cut A2A frontend callsites to Python APIs. |
| 50 | A2A | backend-python-no-node-a2a-node-compat-thin-proxy-105 | pending | Reduce Node A2A route and core server to compatibility shell. |
| 51 | A2A | backend-python-no-node-a2a-api-smoke-python-only-105 | pending | Add an API smoke proving A2A uses Python backend. |
| 52 | Retirement | backend-python-no-node-final-residual-usage-audit-105 | pending | Audit all remaining frontend and scripts for Node-only backend API usage. |
| 53 | Retirement | backend-python-no-node-final-contract-test-suite-105 | pending | Create a consolidated Python backend API contract test suite. |
| 54 | Retirement | backend-python-no-node-final-browser-smoke-suite-105 | pending | Create a consolidated browser smoke suite for Python-only backend APIs. |
| 55 | Retirement | backend-python-no-node-final-server-index-retirement-plan-105 | pending | Plan or implement server/index.ts retirement for backend API responsibilities. |
| 56 | Retirement | backend-python-no-node-final-routing-docs-105 | pending | Document development and production routing after Node backend API retirement. |
| 57 | Retirement | backend-python-no-node-final-deprecated-stub-cleanup-105 | pending | Remove deprecated Node backend stubs that are proven unused. |
| 58 | Retirement | backend-python-no-node-final-observability-readiness-105 | pending | Ensure Python API observability covers health, provenance, degraded states, and errors. |
| 59 | Retirement | backend-python-no-node-final-regression-guard-105 | pending | Add a guard that fails when new Node-owned backend APIs are introduced. |
| 60 | Retirement | backend-python-no-node-final-cutover-review-105 | pending | Run final review of the no-Node backend API cutover and update status. |

## Checkpoint policy
- Checkpoint after Foundation, SlideRule, AgentLoop, RAG, A2A, and Retirement groups.
- Before each checkpoint, verify git status, route ownership notes, Python tests, relevant Node/Vitest compatibility tests, and browser/API smoke when applicable.
- Do not commit runtime files under `.agent-loop/`, worktree folders, temporary screenshots, logs, or unrelated generated artifacts.
