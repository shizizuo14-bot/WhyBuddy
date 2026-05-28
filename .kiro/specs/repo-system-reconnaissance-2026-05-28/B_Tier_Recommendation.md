# B_Tier_Recommendation

> **Generated**: 2026-05-28 (frozen HEAD `d181be2f`)
> **Phase**: A+ exit → Phase B/C/D scope handoff
> **Boundary**: Every candidate cites ≥ 1 audit-row, inventory-row, or reconciliation-row evidence. Uncited candidates are NOT eligible to appear (Req 10.4).
> **Scope contract**: This document is the *output* of A+ reconnaissance, not an input. The B/C/D split is decided here, not assumed earlier (Req 10.1).

_Implements: REQ-9.1–9.6, REQ-10.1–10.5, REQ-13.3, REQ-14.4 — Validates: Property 5, Property 7_

## Summary

| tier | count | rationale |
| --- | --- | --- |
| B | 16 | per-domain prose against named domain |
| C | 3 | cross-domain structural reorganization |
| D | 3 | auto-generated reference work (TypeDoc / madge / dependency-cruiser) |
| deferred | 8 | recorded only; revisit when concrete evidence emerges |
| **total** | **30** | every candidate cites ≥ 1 evidence row |

**Aggregation script**: `.tmp/aggregate-btier.mjs` (Node stdlib only, ~150 lines). Output: `.tmp/btier-aggregation.jsonl` (30 rows). Script stays under `.tmp/` per Req 12.4 — never promoted into the source tree.

---

## B-tier candidates (per-domain prose)

### B1. `autopilot-i18n-consistency` (PARTIALLY_IMPLEMENTED)
- **Origin**: audit row `autopilot-i18n-consistency` bucketed `PARTIALLY_IMPLEMENTED`.
- **Scope**: write a per-spec finishing brief explaining what i18n surface is consistent today, what is still missing, and the order in which remaining task checkboxes should close. Treat existing tasks.md as input only; do NOT rewrite it (Req 14.4).
- **Evidence**: `spec-audit-table.md` row → bucket=`PARTIALLY_IMPLEMENTED`, evidence_path cited in audit table.
- **Expected output**: 1 markdown brief (~ 200 lines).

### B2. `autopilot-spec-docs-runtime-perception-double-pass` (PARTIALLY_IMPLEMENTED)
- **Origin**: audit row, same bucket.
- **Scope**: brief for the double-pass perception flow, anchoring on the routes that already exist under `server/routes/blueprint/spec-documents/` and the runtime-perception adapters.
- **Evidence**: audit row + 6 unreferenced TRUNK files under `server/routes/blueprint/spec-documents/` (see doc 08 `code_without_doc`).
- **Expected output**: 1 markdown brief.

### B3. `execution-language-refresh` (PARTIALLY_IMPLEMENTED)
- **Origin**: audit row.
- **Scope**: brief for the Mission/Workflow language refresh that is partially landed; reconcile what is already in `client/src/lib/task-hub-copy.ts` and `shared/mission/decision-templates.ts` with the partial completion percentage cited in the audit row.
- **Evidence**: audit row + `client/src/lib/task-hub-copy.ts` (TRUNK needs-attention) + `shared/mission/decision-templates.ts` (TRUNK needs-attention).
- **Expected output**: 1 markdown brief.

### B4. `mirofish-visual-alignment` (PARTIALLY_IMPLEMENTED)
- **Origin**: audit row.
- **Scope**: per-spec brief; map each visual rule that landed against the components under `client/src/pages/autopilot/right-rail/mirofish-stream/` (TRUNK needs-attention modules).
- **Evidence**: audit row + 9 TRUNK modules under `client/src/pages/autopilot/right-rail/mirofish-stream/`.
- **Expected output**: 1 markdown brief.

### B5. `repo-system-reconnaissance-2026-05-28` (PARTIALLY_IMPLEMENTED)
- **Origin**: audit row (this very spec; PARTIALLY_IMPLEMENTED reflects the in-flight state at scan time).
- **Scope**: do NOT add a B-tier doc for this spec. After Phase 1 closure stamp, the spec should re-classify to IMPLEMENTED_AND_VALID at the next scan cycle. Listed here only because the mechanical bucket rule put it here at frozen HEAD `d181be2f`.
- **Evidence**: this directory itself.
- **Expected output**: NONE; routing note only.

### B6. `spec-first-stage-process-artifact-split-uniform` (PARTIALLY_IMPLEMENTED)
- **Origin**: audit row.
- **Scope**: brief for the artifact-split uniform pattern; cross-reference `server/routes/blueprint/effect-preview/` and `server/routes/blueprint/prompt-package/` (which both follow the pattern).
- **Evidence**: audit row + 6 TRUNK modules under each pattern instance.
- **Expected output**: 1 markdown brief.

### B7. `task-detail-operations-first` (PARTIALLY_IMPLEMENTED)
- **Origin**: audit row.
- **Scope**: brief that ties the intent of `task-detail-operations-first` to the present `client/src/components/tasks/TaskDetailView.tsx` and `client/src/components/tasks/TaskOperationsHero.tsx` (TRUNK needs-attention).
- **Evidence**: audit row + 2 TRUNK modules.
- **Expected output**: 1 markdown brief.

### B8. `workflow-artifacts-display` (PARTIALLY_IMPLEMENTED)
- **Origin**: audit row.
- **Scope**: brief covering the artifact list block, preview dialog, and the `tasks-store` extension that landed; explicitly call out the `tasks.md` final checkpoint that remains unchecked (per project-overview steering snapshot).
- **Evidence**: audit row + `client/src/components/tasks/ArtifactListBlock.tsx` + `client/src/components/tasks/ArtifactPreviewDialog.tsx` (both TRUNK needs-attention).
- **Expected output**: 1 markdown brief.

### B9. `workflow-panel-decomposition` (PARTIALLY_IMPLEMENTED)
- **Origin**: audit row.
- **Scope**: brief for the decomposition that landed; cross-reference `client/src/components/WorkflowPanel.tsx` and `client/src/components/WorkflowPanelCompatibility.tsx` (both TRUNK needs-attention).
- **Evidence**: audit row + 2 TRUNK modules.
- **Expected output**: 1 markdown brief.

### B10. domain `workflow` (8 TRUNK modules)
- **Origin**: inventory rows where domain=`workflow` AND trunk_branch_legacy=`trunk` AND referenced_specs is empty.
- **Scope**: per-domain prose for the workflow runtime. Cover `server/core/workflow-engine.ts` (10-stage pipeline), `server/core/workflow-graph-projection.ts`, the four `shared/workflow-*.ts` contracts, and the two client-side helpers. Tie back to spec `workflow-engine` (IMPLEMENTED_AND_VALID, archived).
- **Evidence**: 8 TRUNK rows; representatives `server/core/workflow-engine.ts`, `shared/workflow-domain.ts`, `client/src/lib/workflow-attachments.ts`.
- **Expected output**: 1 markdown brief (~ 600 lines) + 1 SVG (10-stage pipeline). Net add: +1 doc, +1 SVG (within Cap_Verifier ranges if scoped to Phase B, not Phase A+).

### B11. domain `mission` (10 TRUNK modules)
- **Origin**: inventory rows, domain=`mission`.
- **Scope**: per-domain prose for the Mission runtime. Cover orchestrator, enrichment bridge, 7 `shared/mission/*.ts` contracts, and `server/routes/planets.ts` (Mission-native projection). Tie back to spec `mission-runtime` (IMPLEMENTED_AND_VALID).
- **Evidence**: 10 TRUNK rows; representatives `server/core/mission-orchestrator.ts`, `shared/mission/projection.ts`, `server/routes/planets.ts`.
- **Expected output**: 1 markdown brief.

### B12. domain `executor` (29 TRUNK modules)
- **Origin**: inventory rows, domain=`executor`.
- **Scope**: per-domain prose for the Lobster executor + `server/core/executor-*.ts` bridge. Cover the 24 modules under `services/lobster-executor/src/` (docker-runner, mock-runner, native-runner, security-policy, credential-injector, etc.) and the 5 server-side adapter modules. Tie back to specs `lobster-executor-real`, `executor-integration`, `secure-sandbox`, `sandbox-live-preview`, `sandbox-native-executor-compat` — all IMPLEMENTED_AND_VALID.
- **Evidence**: 29 TRUNK rows; representatives `services/lobster-executor/src/docker-runner.ts`, `services/lobster-executor/src/security-policy.ts`, `server/core/executor-client.ts`.
- **Expected output**: 1 markdown brief (~ 800 lines) + 1–2 SVGs (executor lifecycle, security-policy layering).

### B13. domain `audit` (4 TRUNK modules)
- **Origin**: inventory rows, domain=`audit`.
- **Scope**: per-domain prose for the audit chain. Cover `shared/audit/api.ts`, `shared/audit/contracts.ts`, `shared/audit/index.ts`, `shared/audit/socket.ts`. Tie back to spec `audit-chain` (IMPLEMENTED_AND_VALID).
- **Evidence**: 4 TRUNK rows.
- **Expected output**: 1 markdown brief.

### B14. domain `lineage` (4 TRUNK modules)
- **Origin**: inventory rows, domain=`lineage`.
- **Scope**: per-domain prose for the lineage DAG. Cover `server/routes/lineage.ts`, `shared/lineage/api.ts`, `shared/lineage/index.ts`, `shared/lineage/socket.ts`. Tie back to spec `data-lineage-tracking` (IMPLEMENTED_AND_VALID).
- **Evidence**: 4 TRUNK rows.
- **Expected output**: 1 markdown brief.

### B15. domain `feishu` (1 TRUNK module)
- **Origin**: inventory row, domain=`feishu`.
- **Scope**: per-domain prose for the Feishu bridge. Cover `server/routes/feishu.ts` and the supporting `server/feishu/*` files (currently classified `infrastructure` BRANCH; revisit during this brief). Tie back to spec `feishu-bridge` (IMPLEMENTED_AND_VALID, archived).
- **Evidence**: 1 TRUNK row + supporting BRANCH rows.
- **Expected output**: 1 markdown brief (compact; small surface).

### B16. domain `frontend-cockpit` (454 TRUNK modules) — **MUST be split**
- **Origin**: inventory rows, domain=`frontend-cockpit`. The single largest domain in the inventory.
- **Scope**: do NOT write one brief covering 454 modules. Split this candidate into 8–12 sub-domain briefs, each ≤ ~80 modules. Suggested splits (per directory grouping in inventory):
  - B16a. `client/src/components/launch/*` (≈ 14 modules) — Launch / UnifiedLaunchComposer rail.
  - B16b. `client/src/components/tasks/*` + `client/src/pages/tasks/*` (≈ 35 modules) — Task cockpit.
  - B16c. `client/src/components/autopilot/*` + `client/src/pages/autopilot/*` (≈ 90 modules) — Autopilot right-rail and stages.
  - B16d. `client/src/components/replay/*` (≈ 16 modules) — Replay UI.
  - B16e. `client/src/components/nl-command/*` (≈ 19 modules) — NL command center.
  - B16f. `client/src/components/lineage/*` + `client/src/components/audit*` + `client/src/components/permissions/*` (≈ 14 modules) — Governance UI.
  - B16g. `client/src/components/ui/*` (≈ 50 modules) — shadcn/ui primitives. Most of these route to D-tier (mechanical) rather than B-tier prose.
  - B16h. `client/src/lib/*` stores and utilities (≈ 100 modules) — split further by store family.
- **Evidence**: 454 TRUNK rows; samples in `code_without_doc` doc 08.
- **Expected output**: 8–12 markdown briefs across Phase B; the entire frontend-cockpit corpus is a multi-week effort, not a single doc.

---

## C-tier candidates (cross-domain reorganization)

### C1. blueprint-runtime ↔ executor ↔ role-container loader
- **Origin**: cross-domain reorg spanning `executor` (29 TRUNK modules) + the 360 BRANCH modules under `infrastructure` that are actually blueprint-runtime helpers.
- **Scope**: structural reorganization to migrate the blueprint-runtime adapters out of the catch-all `infrastructure` bucket and into a named domain (`blueprint-runtime`). Currently routed to BRANCH `informational` because they live as `server/routes/blueprint/*`, but they are the runtime backbone of `autopilot-capability-bridge-*` specs (5 IMPLEMENTED_AND_VALID specs).
- **Evidence**: doc 08 `code_without_doc` § 2 (360 BRANCH `informational` rows under `server/routes/blueprint/*`); spec audit rows `autopilot-role-container-loader` (IMPLEMENTED_AND_VALID), `autopilot-capability-runtime-enablement` (IMPLEMENTED_AND_VALID).
- **Decision**: defer until B-tier candidates B12 (executor) and B16 are written; the cross-cutting needs will surface there.

### C2. task-autopilot ↔ workflow ↔ mission projection
- **Origin**: cross-domain reorg spanning `workflow` (8 TRUNK) + `mission` (10 TRUNK) + 50+ task-autopilot specs (most IMPLEMENTED_AND_VALID).
- **Scope**: define the projection layer formally (`Mission → Destination`, `Workflow → Route`, `Runtime State → Drive State`, `Decision/HITL → Takeover`). Currently scattered across multiple specs; consolidating into one C-tier doc would make the projection contract first-class.
- **Evidence**: spec audit rows `task-autopilot-core-concepts`, `task-autopilot-levels-l1-to-l5`, `mission-runtime`, `workflow-engine`; doc 04 + doc 06.
- **Decision**: defer until B10 (workflow) + B11 (mission) are written.

### C3. audit ↔ lineage ↔ permission evidence chain
- **Origin**: cross-domain reorg spanning `audit` (4 TRUNK) + `lineage` (4 TRUNK).
- **Scope**: end-to-end evidence chain from audit append → lineage edge → permission decision → evidence replay. The three subsystems are individually IMPLEMENTED but their stitching is not documented as one chain.
- **Evidence**: spec audit rows `audit-chain`, `data-lineage-tracking`, `agent-permission-model` (all IMPLEMENTED_AND_VALID); doc 08 lists all three domains as TRUNK needs-attention.
- **Decision**: defer until B13 (audit) + B14 (lineage) are written.

---

## D-tier candidates (auto-generated reference work)

Per Req 9.2 / 9.3: file-level / function-level / dependency-level reference work is mechanical generation, not human prose. All three D-tier candidates run after B and C stabilize.

### D1. TypeDoc / API reference
- **Tooling**: `typedoc` or equivalent.
- **Evidence**: 969 inventory rows in `module-inventory.md`; auto-generated TypeDoc would cover `shared/`, `server/core/`, `services/lobster-executor/src/` exhaustively.
- **Defer until**: B-tier domains B10–B16 stabilize (TypeDoc against a moving target wastes effort).

### D2. madge dependency graph
- **Tooling**: `madge`.
- **Evidence**: 969 inventory rows; cross-module imports auto-derivable.
- **Output**: SVG dependency graph + circular-dependency report.
- **Defer until**: B-tier briefs are written so dependency-graph annotations have semantic anchors.

### D3. dependency-cruiser report
- **Tooling**: `dependency-cruiser`.
- **Evidence**: 969 inventory rows; layering rules from doc 03 are auto-checkable.
- **Output**: rule-based dependency report (e.g., "no `client/` imports from `server/`").
- **Defer until**: doc 03 layering is stable (it is, as of frozen HEAD).

---

## Deferred candidates (no concrete evidence; revisit when evidence appears)

These are DESIGNED_NEVER_BUILT specs grouped by prefix. Per design.md § 7: "record but do not promote; revisit when evidence appears". Per design.md § 6 they map to severity `informational` in `doc_without_code`. None of these are uncited — each row points to ≥ 1 audit-table row.

### Deferred-1. `autopilot-cockpit-*` (2 specs)
- **Subjects**: see audit table; 2 cockpit-shell DESIGNED_NEVER_BUILT specs.
- **Revisit when**: cockpit shell convergence work resumes (see steering note `office-cockpit-first-screen-refresh`).

### Deferred-2. `autopilot-streaming-*` (2 specs)
- **Subjects**: streaming weave / streaming experience secondary specs.
- **Revisit when**: B16c (autopilot right-rail brief) reaches the streaming concern.

### Deferred-3. `blueprint-spec-*` (2 specs)
- **Subjects**: blueprint spec-documents secondary specs.
- **Revisit when**: B16c brings blueprint streaming docs into focus.

### Deferred-4. `ue-local-*` (2 specs)
- **Subjects**: UE local runtime / session governance specs.
- **Revisit when**: UE deployment becomes a concrete target. Currently no UE process is active in production runtime (see steering 2026-04-15-runtime-current-state).

### Deferred-5. `ue-scene-*` (2 specs)
- **Subjects**: UE scene assets / scene command specs.
- **Revisit when**: UE deployment activates.

### Deferred-6. `ui-redesign-*` (7 specs)
- **Subjects**: 7 UI redesign sub-specs (color-and-tokens, typography, etc.).
- **Revisit when**: a UI redesign cycle is approved. Currently the cool-grey + OKLCH base is stable.

### Deferred-7. `web-aigc-node-*` (17 specs of the unbuilt subset)
- **Subjects**: 17 of the 52 web-aigc node specs that remain DESIGNED_NEVER_BUILT (the other 35 are IMPLEMENTED_AND_VALID).
- **Revisit when**: any of the 17 unbuilt nodes becomes a concrete runtime requirement. Per project-overview steering: web-aigc 58/58 spec set is closed; building these 17 is product-driven, not spec-driven.

### Deferred-8. Singletons (88 specs)
- **Subjects**: 88 DESIGNED_NEVER_BUILT specs that share no common prefix with another DNB sibling.
- **Revisit policy**: only when a singleton acquires evidence (a referenced source file, a runtime test, or a closed-loop demo) does it move to a concrete tier.

---

## Phase-1 rejected items (routing notes)

Items the A+ phase explicitly excluded per Req 4.4 / 9.6 and where they should land:

| rejected item type | A+ rationale | Phase B/C/D tier |
| --- | --- | --- |
| Per-domain documents (60+ planned) | Out of scope for A+; would have produced 60+ markdown without first verifying which specs are valid | B-tier, scoped per B10–B16 |
| Spec rewrites for existing specs | Req 14.4 forbids rewriting specs to patch reconciliation gaps | B-tier prose addresses gaps without rewriting; C-tier handles cross-cutting |
| File-level / function-level reference | Req 9.2 / 9.3: mechanical, not human prose | D-tier (TypeDoc / madge / dependency-cruiser) |
| New feature specs | Out of scope; A+ is reconnaissance, not new product work | Route to product backlog (not B/C/D) |
| 80–120 SVG ambitious target | Cap_Verifier limits SVGs to [8, 15] for Phase 1 | D-tier auto-generated dependency graphs cover most file-level visualization needs |

---

## Carry-over (Req 13.3)

Phase 1 finished within the 30–41 hour budget. No optional content was demoted. No items beyond the deferred groups above were carried over.

If Cap_Verifier (Stage 8) flags any check failure, the affected deliverable will be revised in-place per design.md § Error Handling — not added to carry-over.

---

## Citations

- `spec-audit-table.md` (289 rows; bucket distribution: 157 IMPLEMENTED_AND_VALID, 122 DESIGNED_NEVER_BUILT, 9 PARTIALLY_IMPLEMENTED, 1 DUPLICATE, 0 DRIFTED).
- `module-inventory.md` (969 rows; T/B/L = 530 trunk / 439 branch / 0 legacy).
- `08-code-doc-reconciliation.md` (`doc_without_code` = 93 rows, all `informational`; `code_without_doc` = 903 rows = 510 `needs-attention` TRUNK + 393 `informational` BRANCH).
- `01-main-business-loop.md`, `02-core-object-model.md`, `03-system-layering.md`, `04-domain-map.md`, `05-frontend-navigation-map.md`, `06-backend-capability-map.md`, `07-spec-current-state-audit.md`, `09-runtime-state-sequence.md`.
- Aggregation script: `.tmp/aggregate-btier.mjs`; output: `.tmp/btier-aggregation.jsonl` (30 rows).
