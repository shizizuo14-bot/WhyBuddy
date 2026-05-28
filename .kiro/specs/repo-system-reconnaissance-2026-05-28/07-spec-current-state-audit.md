# 07 Spec 现状审计

_Implements: REQ-6.1, REQ-7.1, REQ-7.2, REQ-14.1 — Validates: Property 2, Property 7_

## Header

- Frozen HEAD: `d181be2f` (`2026-05-28T02:06:35Z`); see `.tmp/scanner-head.txt`.
- Snapshot baseline: `.kiro/steering/project-overview.md § 项目规模` records `287` specs as of `2026-05-28`.
- Total rows in `spec-audit-table.md`: **289** (the `287` baseline plus `2` spec dirs that appeared after the snapshot, recorded as a footnote per Req 11.4 and not used to reopen the baseline).
- Source of truth for this doc: `spec-audit-table.md` (sibling file). This document narrates that table at the bucket level. It does not rewrite or duplicate per-spec rows.
- Manifest reference for SVG `D7`: `manifest: spec-audit-table.md (289 rows)`.

## Distribution

| Bucket | Count | Percent |
|---|---:|---:|
| DUPLICATE | 1 | 0.35% |
| DRIFTED | 0 | 0.00% |
| PARTIALLY_IMPLEMENTED | 9 | 3.11% |
| IMPLEMENTED_AND_VALID | 157 | 54.33% |
| DESIGNED_NEVER_BUILT | 122 | 42.21% |
| **Total** | **289** | **100.00%** |

See `d7-bucket-distribution.svg` for the bar-chart rendering of this distribution.

## Headline finding

> **`122 / 289 (42.21%)` of specs are `DESIGNED_NEVER_BUILT`.**

This is the single dominant signal of the audit. Roughly `5` specs in every `12` carry a `requirements.md` and a `design.md` but reference no source path that resolves in the working tree. The next-largest bucket, `IMPLEMENTED_AND_VALID` (`157` specs / `54.33%`), is what production code is actually built on. The remaining `3.46%` (`PARTIALLY_IMPLEMENTED 9` + `DUPLICATE 1` + `DRIFTED 0`) is small enough that it should not be confused with the headline.

## What this audit reveals

The `287`-spec corpus is a long history of concept exploration, not a manifest of shipped product. Production code lives in the `IMPLEMENTED_AND_VALID` bucket; that bucket is `54.33%` by count but holds the load-bearing modules — `mission-runtime`, `workflow-engine`, `audit-chain`, `data-lineage-tracking`, `executor-integration`, `collaboration-replay`, the `autopilot-*` IMPLEMENTED set — anything the Main_Business_Loop touches.

`DESIGNED_NEVER_BUILT 122` is **not** project failure. A large portion of it is explicitly forward-looking: the L31-L38 platform tier (`production-deployment`, `multi-tenant-architecture`, `k8s-agent-operator`, `multi-region-disaster-recovery`, `edge-brain-deployment`, `multi-user-office`, `agent-marketplace-platform`, `vr-extension`) is gated on environments that do not exist yet, and `execution-plan.md § 第四层` already says so. Treating those `8` specs as "debt" would be a category error. The `DESIGNED_NEVER_BUILT` bucket is the planning surface, not the failure surface.

`DUPLICATE 1` (`office-wall-display-redesign` versus `office-wall-display-redesign-v2`) is **healthy**. The `-v2` versioning convention worked exactly as intended: an earlier draft was superseded by an explicit follow-up, the audit caught it via name normalization, and the older row was demoted to `DUPLICATE` while the canonical newer row was kept. One duplicate cluster across `289` specs is well within tolerance.

`DRIFTED 0` reflects the conservatism of the classifier, not the absence of drift. The classifier requires a spec to both reference an existing source path *and* contradict steering before assigning `DRIFTED`. Nuanced drift (specs whose stated behavior is *partially* incompatible with current steering, but not in a way the keyword check catches) is intentionally left for B-tier, where domain-aware human review can read prose.

`PARTIALLY_IMPLEMENTED 9` is the bucket that earns the most B-tier attention per row. These are live specs with a `tasks.md` between `1%` and `99%` complete and at least one referenced source file present. They are the specs most likely to reward focused work, since the architecture exists and the gap is bounded.

## Per-bucket breakdown

### DUPLICATE — 1 spec

The single duplicate cluster is `office-wall-display-redesign` (older) collapsed into `office-wall-display-redesign-v2` (canonical). Triggered by criterion `name_normalization` (cluster `C-1158`, see `.tmp/duplicate_clusters.jsonl`). No follow-up needed; the convention works.

Worked example for this bucket lives in `design.md § 3. Classifier — DUPLICATE`. Full row in `spec-audit-table.md`.

### DRIFTED — 0 specs

Zero rows. The classifier's keyword-and-path heuristic is conservative by design (see `design.md § 3. Classifier`). The B_Tier_Recommendation should treat "drift detection" as a B-tier task, not an A+ tier one, and should re-scan for drift after domain-aware reviewers have read each domain's IMPLEMENTED specs in B-tier.

### PARTIALLY_IMPLEMENTED — 9 specs

These are the highest-value B-tier inputs row-for-row. The full set, by `task_completion_pct`:

- `workflow-artifacts-display` (96%) — last 1 checkbox; final-verification gate per execution-plan.
- `autopilot-spec-docs-runtime-perception-double-pass` (98%) — 1 checkbox left.
- `autopilot-i18n-consistency` (88%) — 5 checkboxes left.
- `execution-language-refresh` (88%) — 2 checkboxes left.
- `task-detail-operations-first` (87%) — 2 checkboxes left.
- `workflow-panel-decomposition` (85%) — 3 checkboxes left.
- `mirofish-visual-alignment` (70%) — 8 checkboxes left.

(Two additional rows complete the count of 9; see `spec-audit-table.md` for the canonical list.)

Worked example: `office-task-cockpit` in `design.md § 3. Classifier — PARTIALLY_IMPLEMENTED`. Note that `office-task-cockpit` itself is bucketed `DESIGNED_NEVER_BUILT` in this scan because its `requirements.md` references no resolvable source path, even though closely related code exists; the worked example illustrates the rule, not this specific spec's final assignment.

### IMPLEMENTED_AND_VALID — 157 specs (54.33%)

This is what the project actually runs on. Anchors include the trunk modules called out in `execution-plan.md`:

- Workflow / mission backbone: `workflow-engine`, `workflow-decoupling`, `mission-runtime`, `mission-native-projection`, `mission-cancel-control`, `mission-operator-actions`.
- Executor: `lobster-executor-real`, `executor-integration`, `ai-enabled-sandbox`, `secure-sandbox`, `sandbox-live-preview`, `agent-permission-model`, `docker-executor-capabilities-contract`.
- Audit / lineage / governance: `audit-chain`, `data-lineage-tracking`, `cost-observability`, `cost-governance-strategy`.
- Replay & memory: `collaboration-replay`, `memory-system`, `evolution-heartbeat`, `knowledge-graph`, `vector-db-rag-pipeline`.
- Autopilot product surface (numerous `autopilot-*` IMPLEMENTED rows touching `shared/blueprint/contracts.ts`, `server/routes/blueprint.ts`, `client/src/pages/autopilot/right-rail/*`).
- Project-first: `project-domain-model`, `project-evidence-artifact-replay`.

Full list: `spec-audit-table.md`. The Main_Business_Loop in `01 主业务闭环` is selected by counting which loop touches the most TRUNK domains anchored by these IMPLEMENTED specs.

### DESIGNED_NEVER_BUILT — 122 specs (42.21%)

The dominant bucket. To make it actionable, the `122` rows cluster by spec_dir prefix into the following families. Each cluster total was counted by hand from `spec-audit-table.md`:

| Cluster | Count | Character |
|---|---:|---|
| `autopilot-*` (forward-looking cockpit / runtime extensions not yet built) | 23 | concept exploration on top of an already-implemented autopilot core |
| `ue-*` (Unreal Engine integration: scene, runtime, replay, mobile viewer, etc.) | 19 | a parallel runtime track gated on engine work; not on the current Main_Business_Loop |
| `web-aigc-node-*` (specific node specs: condition, dialogue, excel_read, flow_jump, etc.) | 17 | from the closed `web-aigc 58/58` corpus; node-level specs that did not need code beyond the shared platform layer |
| `blueprint-*` (blueprint workbench, generation API, GitHub ingestion, asset store, etc.) | 13 | concept layer; superseded by the `autopilot-*` blueprint route in IMPLEMENTED |
| `project-*` (`project-first` family: cockpit-home, clarification-conversation, fsd-route-planner, etc.) | 8 | per `project-first-spec-roadmap-2026-04-30.md` the family is `10/10` written; only `project-domain-model` and `project-evidence-artifact-replay` reference resolvable code |
| L31-L38 platform tier (`production-deployment`, `multi-tenant-architecture`, `k8s-agent-operator`, `multi-region-disaster-recovery`, `edge-brain-deployment`, `multi-user-office`, `agent-marketplace-platform`, `vr-extension`) | 8 | environment-gated by design; `execution-plan.md § 第四层` defers them explicitly |
| `ui-redesign-*` (color tokens, sidebar nav, status indicators, task-detail cards, etc.) | 7 | proposal-stage UI specs whose intent landed in IMPLEMENTED specs under different names |
| `office-*` (cockpit-first-screen-refresh, home-performance-stability, task-cockpit, wall-display-redesign-v2) | 4 | live UX directions whose code is being tracked by sibling IMPLEMENTED specs |
| `admin-*` | 2 | unbuilt admin-console direction |
| `launch-*` (operator-surface-convergence, panel-visual-overhaul) | 2 | proposals not yet implemented |
| `task-*` (`task-os-home-redesign-v1`, `task-autopilot-platform-positioning`) | 2 | positioning + redesign specs without code |
| Misc individual specs | 17 | each unique; see `spec-audit-table.md` for the full enumeration |
| **Total** | **122** | |

Two observations follow directly from this clustering:

1. The L31-L38 cluster (`8` specs) is environment-gated and should be excluded from B-tier "real debt" counts. After this exclusion the *actionable* DESIGNED_NEVER_BUILT bucket is `114` specs, not `122`.
2. The largest single follow-up cluster is `autopilot-*` (`23` specs). These are concept extensions on top of an already-implemented core. Whether each one becomes B-tier work or is explicitly retired is the highest-leverage question the B_Tier_Recommendation has to answer.

Worked example for this bucket (`production-deployment`) lives in `design.md § 3. Classifier — DESIGNED_NEVER_BUILT`.

## Reference

- Full per-row table: [spec-audit-table.md](./spec-audit-table.md)
- Bucket distribution diagram: [d7-bucket-distribution.svg](./d7-bucket-distribution.svg) (`manifest: spec-audit-table.md (289 rows)`)
- Decision tree producing these buckets: `design.md § Components and Interfaces § 3. Classifier`
- Snapshot authority: `.kiro/steering/project-overview.md § 项目规模`
