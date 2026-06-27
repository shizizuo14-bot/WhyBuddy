# Backend Python Web AIGC Long-Tail Inventory 89

## Scope

This inventory audits the Web AIGC long-tail routes that still appear
`node-only` after the search, file, vision, and audio bounded runtime bridge
work. It is a planning and evidence document only. It does not implement a
Python runtime, does not add adapters, and does not turn fake-provider runtime
tests into real external production service ownership.

Source evidence is limited to current repository files:

- `docs/backend-python-node-route-inventory-90.md`
- `server/index.ts`
- Web AIGC route files under `server/routes/`
- Web AIGC Node adapters under `server/routes/node-adapters/`
- Node tests under `server/tests/` and `server/routes/__tests__/`
- Existing Python Web AIGC bridge files under `slide-rule-python/`

## Classification Rules

| Tag | Meaning in this inventory |
|---|---|
| `node-only` | Current `HEAD` has Node route/adapter ownership and no Python contract, proxy, or runtime evidence for the named long-tail route. |
| `contract-candidate` | Shared TypeScript contracts or stable Node tests exist, so the next slice can reasonably start with Python request/response parity tests. This is not completed migration evidence. |
| `bounded-runtime-candidate` | The Node adapter is deterministic or dependency-injectable enough that a later bounded Python runtime bridge could be carved out after contract parity. This is not current runtime evidence. |
| `production-gap` | Real external service, storage, permission, audit, artifact, or deployment wiring remains outside the current bounded evidence. |

Current completed Web AIGC bridge evidence remains limited to these existing
slices and is not expanded by this document:

| Existing bridge slice | Current evidence | Boundary |
|---|---|---|
| Search/file/vision/audio bridge group | `server/routes/__tests__/web-aigc.search-python-runtime.test.ts`, `web-aigc.file-python-runtime.test.ts`, `web-aigc.vision-audio-python-runtime.test.ts`; Python services/tests under `slide-rule-python/services/web_aigc_*` and `slide-rule-python/tests/test_web_aigc_*`. | Bounded fake-provider or synthetic runtime evidence only; real external search, OCR, vision, STT, TTS, file persistence, and storage remain production gaps. |

## Long-Tail Route Inventory

| Route surface | Current Node files | Existing tests | Current classification | Suggested next slice |
|---|---|---|---|---|
| `/api/web-qa` | `server/routes/web-qa.ts`; `server/routes/node-adapters/web-qa-node-adapter.ts`; shared `shared/web-qa/contracts.ts`; mounted in `server/index.ts`. | `server/tests/web-qa-routes.test.ts`; `server/tests/web-qa-node-adapter.test.ts`; integration references in `server/tests/static-webpage-read-node-adapter.test.ts` and `server/tests/web-search-routes.test.ts`. | `node-only`; `contract-candidate`; later `bounded-runtime-candidate`. | Start with a Python contract for the Web QA envelope, source/citation metadata, fallback semantics, and error mapping. Runtime should stay bounded to deterministic document/knowledge fixtures before any real search or LLM claim. |
| `/api/dynamic-chart` | `server/routes/dynamic-chart.ts`; `server/routes/node-adapters/dynamic-chart-node-adapter.ts`; shared `shared/web-aigc-dynamic-chart.ts`; mounted in `server/index.ts`. | `server/tests/dynamic-chart-routes.test.ts`; `server/tests/dynamic-chart-node-adapter.test.ts`. | `node-only`; `contract-candidate`; strong `bounded-runtime-candidate`. | Contract slice first for chart spec, series normalization, validation errors, and output artifacts. Then a bounded runtime bridge can cover deterministic chart plan generation without claiming real rendering or dashboard production ownership. |
| `/api/ai-ppt` and `/api/ai-ppt/outputs/:outputId/:filename` | `server/routes/ai-ppt.ts`; `server/routes/node-adapters/ai-ppt-node-adapter.ts`; `server/core/ai-ppt-generation-provider.ts`; shared `shared/web-aigc-ai-ppt.ts`; mounted in `server/index.ts`. | `server/tests/ai-ppt-routes.test.ts`; `server/tests/ai-ppt-node-adapter.test.ts`; `server/tests/ai-ppt-generation-provider.test.ts`. | `node-only`; `contract-candidate`; partial `bounded-runtime-candidate`; `production-gap` for file artifacts and LLM deck generation. | Split into two tasks: first contract for deck outline/output artifact envelope and path validation; later bounded runtime for deterministic deck JSON generation. Do not claim production PPT generation until artifact storage, LLM provider, download path, and cleanup semantics are wired. |
| `/api/transaction-flow` | `server/routes/transaction-flow.ts`; `server/routes/node-adapters/transaction-flow-node-adapter.ts`; shared `shared/web-aigc-transaction-flow.ts`; mounted in `server/index.ts` with permission engine and audit logger dependencies. | `server/tests/transaction-flow-routes.test.ts`; `server/tests/transaction-flow-node-adapter.test.ts`; workflow coverage in `server/tests/workflow-runtime-engine.test.ts`. | `node-only`; `contract-candidate`; cautious `bounded-runtime-candidate`; `production-gap` for permission/audit/approval execution. | Contract slice should lock status mapping (`approved`, `approval_required`, `denied`, `failed`), required identity fields, and audit metadata. Runtime bridge must remain bounded to approval decision envelopes unless permission engine, audit sink, and transaction executor ownership are explicitly migrated. |
| `/api/orchestration-recognition-jump` | `server/routes/orchestration-recognition-jump.ts`; `server/routes/node-adapters/orchestration-recognition-jump-node-adapter.ts`; shared `shared/web-aigc-orchestration-recognition-jump.ts`; mounted in `server/index.ts` with permission and audit dependencies. | `server/tests/orchestration-recognition-jump-routes.test.ts`; `server/tests/orchestration-recognition-jump-node-adapter.test.ts`. | `node-only`; `contract-candidate`; cautious `bounded-runtime-candidate`. | Start with contract parity for candidate ranking, target route shape, denial semantics, and observability. Runtime should be fixture-backed matching only, not full orchestration engine migration. |
| `/api/get-location-info` | `server/routes/get-location-info.ts`; `server/routes/node-adapters/get-location-info-node-adapter.ts`; shared `shared/web-aigc-location-info.ts`; mounted in `server/index.ts`. | `server/tests/get-location-info-routes.test.ts`; `server/tests/get-location-info-node-adapter.test.ts`. | `node-only`; `contract-candidate`; strong `bounded-runtime-candidate`; `production-gap` for real geolocation/IP/provider data. | Contract and bounded runtime can be grouped with device info because the route is small and deterministic under injected input. Keep real browser/IP geolocation provider integration out of the first runtime slice. |
| `/api/get-device-info` | `server/routes/get-device-info.ts`; `server/routes/node-adapters/get-device-info-node-adapter.ts`; shared `shared/web-aigc-device-info.ts`; mounted in `server/index.ts` with process platform/arch/version and client hint handling. | `server/tests/get-device-info-routes.test.ts`; `server/tests/get-device-info-node-adapter.test.ts`. | `node-only`; `contract-candidate`; strong `bounded-runtime-candidate`; `production-gap` for real browser fingerprint/device detection. | Pair with location info for contract/runtime. Preserve header/client-hint normalization and process fallback semantics in contract tests before adding a Python bridge. |
| `/api/open-page` | `server/routes/open-page.ts`; `server/routes/node-adapters/open-page-node-adapter.ts`; mounted in `server/index.ts` through `createOpenPageRouter` with permission engine dependencies. | `server/tests/open-page-routes.test.ts`; `server/tests/open-page-node-adapter.test.ts`. | `node-only`; `contract-candidate`; `bounded-runtime-candidate`; `production-gap` for permission policy and real page registry ownership. | Contract slice should cover target resolution, agent identity requirements, denied status, and target href normalization. Runtime must not bypass Node permission checks unless permission boundary is migrated in the same task. |
| `/api/open-dashboard` and `/api/open-dashboard/targets/:dashboardId` | `server/routes/open-dashboard.ts`; `server/routes/node-adapters/open-dashboard-node-adapter.ts`; mounted in `server/index.ts` with permission engine. | `server/tests/open-dashboard-routes.test.ts`; `server/tests/open-dashboard-node-adapter.test.ts`. | `node-only`; `contract-candidate`; `bounded-runtime-candidate`; `production-gap` for dashboard registry and permission ownership. | Contract slice should include target lookup, `not_found` mapping, permission denial, and `/targets/:dashboardId` response shape. A bounded runtime can resolve fixture dashboards only. |
| `/api/workflows/open-report` | `server/routes/open-report.ts`; `server/routes/node-adapters/open-report-node-adapter.ts`; mounted through `server/routes/workflows.ts` under the workflow router, not as a top-level route in this checkout. | `server/tests/open-report-routes.test.ts`; `server/tests/open-report-node-adapter.test.ts`. | `node-only`; `contract-candidate`; cautious `bounded-runtime-candidate`; `production-gap` for workflow/report registry ownership. | Contract slice should pin report target resolution, workflow/manager/replay identifiers, denied/not-found mapping, and workflow route prefix. Runtime should stay fixture-backed until workflow report generation and authorization are migrated. |

## Current Node-Only Summary

These long-tail route families remain `node-only` in current `HEAD`:

- `web-qa`
- `dynamic-chart`
- `ai-ppt`
- `transaction-flow`
- `orchestration-recognition-jump`
- `get-location-info`
- `get-device-info`
- `open-page`
- `open-dashboard`
- `open-report` under `/api/workflows/open-report`

No current Python service/test path was found for these route families that is
equivalent to the existing `web_aigc_search_adapter`, `web_aigc_file_adapter`,
or `web_aigc_vision_audio_adapter` bridge evidence.

## Recommended Next Batches

| Priority | Batch | Why this boundary is safe | Gate shape for a future implementation task |
|---|---|---|---|
| 1 | Location/device info contract plus bounded runtime | Small deterministic routes with shared contracts and focused route/adapter tests. | Python service/tests for normalized request/output; Node proxy/runtime tests for the two route adapters; mojibake scan. |
| 2 | Dynamic chart contract plus bounded runtime | Deterministic chart-plan behavior is a good fit for Python parity before production rendering. | Shared contract parity, Python chart-plan service tests, Node bridge tests preserving existing error semantics. |
| 3 | Open-page/open-dashboard/open-report contract | These are similar open-target adapters but include permission and registry boundaries. Contract first avoids bypassing Node authorization. | Contract tests only at first; no runtime count until permission/target registry behavior is bounded and tested. |
| 4 | Web QA contract | It touches document search, knowledge fallback, source citations, and optional LLM behavior. Contract should precede runtime. | Python envelope/citation/fallback contract tests using fixtures; no real search/LLM production claim. |
| 5 | Transaction-flow/orchestration-recognition-jump contract | These involve permission, audit, approval, and orchestration semantics. They need explicit status and audit contracts before runtime. | Contract tests for decision/status envelope and audit metadata; runtime only after permission/audit dependency boundary is scoped. |
| 6 | AI PPT contract, then bounded runtime | It has artifact download, filesystem path validation, and LLM deck generation concerns. | First contract for deck/output path envelope; later bounded runtime with generated fixture artifacts, not production PPT service ownership. |

## Counting Rules

- Do not count this inventory as implementation completion.
- Do not count a long-tail route as `runtime` until current `HEAD` has Python
  runtime service/tests plus Node bridge tests for that exact route family.
- Do not count shared TypeScript contract files or Node adapter tests as Python
  migration by themselves.
- Do not count existing search/file/vision/audio fake runtime bridges as real
  external service production wiring.
- Do not update the overall migration percentage from this document.

## Gate

Required gate from `webAigcLongtailInventory89Gates`:

```powershell
node agent-loop/src/check-mojibake.js agent-loop/tasks/backend-python-web-aigc-longtail-inventory-89.md docs/backend-python-web-aigc-longtail-inventory-89.md docs/backend-python-node-route-inventory-90.md agent-loop/tasks/000-nodejs-to-python-migration-status.md
```
