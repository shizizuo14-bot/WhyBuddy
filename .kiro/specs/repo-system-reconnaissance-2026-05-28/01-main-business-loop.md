# 01 主业务闭环

_Implements: REQ-2.1, REQ-3.2, REQ-3.4, REQ-6.1, REQ-7.2 — Validates: Property 2, Property 7_

## Header

- Frozen HEAD: `d181be2f` (`2026-05-28T02:06:35Z`).
- Selection rule: the canonical `Main_Business_Loop` is the candidate flow that touches the most TRUNK-labeled domains (design.md § 4. Main_Loop_Identifier). Tie-breaker: most `IMPLEMENTED_AND_VALID` specs cited from `spec-audit-table.md`.
- Provisional TRUNK domain set (to be finalized by Stage 5 Domain_Mapper): `mission`, `workflow`, `executor`, `audit`, `lineage`, `frontend-cockpit`. Source: `.kiro/steering/project-overview.md § 系统架构` plus the audit table's IMPLEMENTED rows.
- Companion diagram: `d1-main-business-loop.svg` (`manifest:` block cites `spec-audit-table.md` rows + `.tmp/deduped_findings.jsonl`).

## Result

The canonical `Main_Business_Loop` selected for this snapshot is the **Mission Execution chain** (`.kiro/steering/project-overview.md § 核心数据流 § Mission 执行链路`). It is the only candidate that simultaneously touches `mission`, `workflow`, `executor`, `audit`, `lineage`, `frontend-cockpit`, *and* `feishu` — `7` of the `10` enumerated domains, and `6` of the `6` provisional TRUNK domains. No other candidate clears even `5` TRUNK domains.

## Why Mission Execution wins

The 6 candidate flows from `.kiro/steering/project-overview.md § 核心数据流`, scored by provisional TRUNK touch:

| # | Candidate | TRUNK domains touched | IMPLEMENTED_AND_VALID specs cited |
|---|---|---|---|
| 1 | Frontend Mode (browser-only) | `frontend-cockpit` (1) | `browser-runtime`, `frontend-3d` (2) |
| 2 | Advanced Mode (workflow) | `workflow`, `frontend-cockpit` (2) | `workflow-engine`, `dynamic-organization` (2) |
| 3 | **Mission Execution** | `mission`, `workflow`, `executor`, `audit`, `lineage`, `frontend-cockpit` (**6**) | **`mission-runtime`, `executor-integration`, `workflow-engine`, `audit-chain`, `data-lineage-tracking`, `feishu-bridge`, `mission-native-projection`, `mission-operator-actions`, `mission-cancel-control` (9)** |
| 4 | Memory & Evolution | `memory` (1; not TRUNK in provisional set) | `memory-system`, `evolution-heartbeat` (2) |
| 5 | Audit & Lineage | `audit`, `lineage` (2) | `audit-chain`, `data-lineage-tracking` (2) |
| 6 | A2A / Swarm | `interop` (1; not TRUNK) | `a2a-protocol`, `autonomous-swarm`, `agent-marketplace` (3) |

Mission Execution wins on the primary criterion (6 TRUNK domains vs. ≤ 2 for any other candidate); the tie-breaker is not needed but would also favour it (`9` IMPLEMENTED_AND_VALID specs cited vs. ≤ 3 for any other candidate). Both checks are reproducible against `spec-audit-table.md`.

## The 8-stage Mission Execution path

The chain below is the exact text from `.kiro/steering/project-overview.md § 核心数据流 § Mission 执行链路`, expanded with the IMPLEMENTED specs and code paths that own each stage.

1. **User / Feishu → `POST /api/tasks`**
   The entry boundary. The HTTP route is owned by `server/routes/tasks.ts`; the Feishu mirror is `server/feishu/bridge.ts` (`feishu-bridge`, IMPLEMENTED). The autopilot destination summary is parsed at this hop via `shared/mission/autopilot.ts` (`destination-model-and-parser`, IMPLEMENTED).
2. **`MissionStore.create()`**
   Persists the new Mission to `data/database.json` and emits `mission_event` (`created`). Owner: `server/tasks/mission-store.ts` (`mission-runtime`, IMPLEMENTED, `74/74` tasks).
3. **`MissionOrchestrator.startMission()`**
   The state-machine driver. Owner: `server/core/mission-orchestrator.ts`, behind `mission-runtime` (IMPLEMENTED). The orchestrator is also the reference point for `mission-cancel-control` (IMPLEMENTED) and `mission-operator-actions` (IMPLEMENTED) when the operator pauses, resumes, retries, marks-blocked or terminates a Run.
4. **`ExecutionPlanBuilder.build()`**
   Translates the Mission into a structured `ExecutionPlan`. Owner: `server/core/workflow-engine.ts` (`workflow-engine`, IMPLEMENTED, `61/61` tasks). This is the bridge from the mission-side state machine to the workflow-side ten-stage pipeline.
5. **`ExecutorClient.dispatchPlan()` → `POST /api/executor/jobs`**
   Hands the plan to the Lobster executor. Owner: `server/core/execution-bridge.ts` (`executor-integration`, IMPLEMENTED, `29/29` tasks). When Docker is reachable the call lands at `services/lobster-executor/`; when not, it falls back to native per `.kiro/steering/2026-04-15-runtime-current-state.md`.
6. **`/api/executor/events` (HMAC-signed callback)**
   Executor → server callback. The HMAC verification and event ingestion live in the executor route under `server/routes/executor*.ts`, gated by `EXECUTOR_CALLBACK_SECRET`. Each callback row writes:
   - a `MissionStore` state update (back to step 2's store),
   - an audit-chain entry via `AuditCollector` → `AuditChain.append()` (`audit-chain`, IMPLEMENTED, `123/123` tasks),
   - a lineage event via `LineageCollector.track()` → `LineageStore.addNode/addEdge()` (`data-lineage-tracking`, IMPLEMENTED, `82/82` tasks).
7. **Socket `mission_event` → frontend cockpit**
   The server fans the updated Mission state out to subscribers. The client side projects it into `client/src/lib/tasks-store.ts` (`mission-native-projection`, IMPLEMENTED, `33/33` tasks); the cockpit panes consume that store. The `Logs / Artifacts / Runtime` evidence rail is owned by `task-runtime-visibility-v1` and reads from the same store.
8. **`FeishuProgressBridge` → ACK / progress / completion / failure回传**
   Mirrors the user-visible state back to the Feishu thread that opened the Mission. Owner: `server/feishu/bridge.ts` (`feishu-bridge`, IMPLEMENTED, `26/26` tasks). On completion/failure the bridge also drives the relay into `POST /api/feishu/relay`.

The 8 hops are covered by 9 distinct `IMPLEMENTED_AND_VALID` specs; no hop is sourced from `DESIGNED_NEVER_BUILT` or `PARTIALLY_IMPLEMENTED` rows.

## Cross-cutting overlays (not separate hops)

Two cross-cutting subsystems attach to *every* hop above and are intentionally drawn as overlays in `D1` rather than as additional sequential boxes:

- **Audit chain overlay** — `audit-chain` writes a hash-linked row for every state transition emitted by hops 2 / 3 / 6 / 7. Anomaly detection hangs off the same write path.
- **Lineage DAG overlay** — `data-lineage-tracking` records nodes for Mission, ExecutionPlan, ExecutorJob, Artifact, and edges for every transition between them.

Together these guarantee the chain is replayable end-to-end via `collaboration-replay` (`IMPLEMENTED`) without re-executing hop 5.

## Provisional T/B/L tagging (Task 4.1)

Per the user instruction this stage does not produce a standalone deliverable; the labels below feed Stage 5 Domain_Mapper, where the inventory is finalized.

- TRUNK (provisional): every code path on hops 1–8 above.
- BRANCH (provisional): records executed only in Frontend Mode (`browser-runtime`, `frontend-3d`), Memory & Evolution (`memory-system`, `evolution-heartbeat`), and A2A / Swarm (`a2a-protocol`, `autonomous-swarm`, `agent-marketplace`).
- LEGACY (provisional): none from the candidate set; LEGACY tagging needs the 90-day commit cutoff applied module-by-module in Task 5.1.

Stage 5 may revise these labels; this pass exists only so Task 4.2's selection rule has well-defined inputs.

## Reference

- Companion diagram: [d1-main-business-loop.svg](./d1-main-business-loop.svg) (`manifest:` cites 9 IMPLEMENTED audit rows + 1 deduped scan row).
- Audit table: [spec-audit-table.md](./spec-audit-table.md)
- Steering: `.kiro/steering/project-overview.md § 系统架构 / § 核心数据流`
- Q3 traceability: this document is the primary answer to Q3 of the `Five_Control_Recovery_Questions`; supporting documents are `03`, `05`, `06`, `09`.
