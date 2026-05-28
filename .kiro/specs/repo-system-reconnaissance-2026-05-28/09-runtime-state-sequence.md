# 09 运行时主链路 — Mission 状态序列

_Implements: REQ-2.3, REQ-6.1, REQ-7.2 — Validates: Property 2, Property 7_

## Header

- Frozen HEAD: `d181be2f` (`2026-05-28T02:06:35Z`).
- Loop traced: the canonical `Main_Business_Loop` selected in doc `01` — the **Mission Execution chain**.
- Truth source for state values: `shared/mission/contracts.ts`, `MISSION_STATUSES` (lines 15–22):
  - `queued` · `running` · `waiting` · `done` · `failed` · `cancelled`.
  - Operator overlay: `MISSION_OPERATOR_STATES` = `active` · `paused` · `blocked` · `terminating` (lines 27–31).
  - Operator actions: `MISSION_OPERATOR_ACTION_TYPES` = `pause` · `resume` · `retry` · `escalate` · `mark-blocked` · `terminate` (lines 36–43).
- Companion diagram: `d8-runtime-state-sequence.svg` (`manifest:` cites `mission-runtime`, `mission-cancel-control`, `mission-operator-actions`, `audit-chain`, `data-lineage-tracking`).

## What this document is

Doc `01` describes the *spatial* path of one Mission across `client → shared → server → executor`. This document describes the *temporal* path: a single Mission's state journey from creation to completion. Both views derive from the same IMPLEMENTED_AND_VALID rows; they are different projections of the same loop.

## State enum (verbatim from code)

The Mission Runtime uses **6 terminal/non-terminal states** plus a **4-state operator overlay**. The two are orthogonal: a Mission is always in one `MissionStatus` *and* one `MissionOperatorState` simultaneously. The names below are exactly those exported by `shared/mission/contracts.ts`; this document does not introduce synonyms.

| Status | Terminal? | Reachable from | Reaches |
|---|---|---|---|
| `queued` | no | initial state on `MissionStore.create()` | `running` |
| `running` | no | `queued`, `waiting` (resume) | `waiting`, `done`, `failed`, `cancelled` |
| `waiting` | no (HITL gate) | `running` | `running` (resume), `cancelled` |
| `done` | yes | `running` | — |
| `failed` | yes | `running` | (operator may retry → `running` per `mission-operator-actions`) |
| `cancelled` | yes | `running`, `waiting` | — (`mission-cancel-control` writes the terminal cancel) |

Operator overlay (independent of status):

| Operator state | Trigger | Notes |
|---|---|---|
| `active` | default | mission proceeds under runtime FSM control |
| `paused` | `pause` action | runtime stops driving; status is unchanged |
| `blocked` | `mark-blocked` action | externally signalled blocker; HITL must clear |
| `terminating` | `terminate` action (or `cancel`) | one-shot transition into `cancelled` |

## State journey of one Mission

The journey below is the canonical happy path with each branching point spelled out. Each step lists the **emitter**, the **socket event** (typed via `MISSION_EVENT_TYPES`), the **store(s) updated**, the **HITL gate** (where applicable), and the **audit row** that is appended.

### Step 1 — `queued`

- Emitter: `MissionStore.create()` (`server/tasks/mission-store.ts`, owned by `mission-runtime`).
- Socket event: `mission_event` with `type=created`.
- Stores updated: server `MissionStore` (truth source); client `tasks-store` ingests via `mission-native-projection`.
- HITL gate: none.
- Audit row: `AuditChain.append({ type: "mission.created", missionId, ... })` per `audit-chain`.
- Lineage: `LineageStore.addNode({ kind: "mission", id })` per `data-lineage-tracking`.
- UI surface: task queue card appears in cockpit (`TasksCockpitDetail`).

### Step 2 — `queued → running`

- Emitter: `MissionOrchestrator.startMission()` (`server/core/mission-orchestrator.ts`).
- Socket event: `mission_event` with `type=progress` (`progress=0`, `currentStageKey="planning"`).
- Stores updated: server FSM advances; `tasks-store` reflects `status=running`.
- HITL gate: none. The autopilot summary is parsed at this step via `shared/mission/autopilot.ts`.
- Audit row: `mission.started`.
- Lineage: edge added from Mission node to the new ExecutionPlan node.

### Step 3 — `running` (the long step)

- Emitter: `ExecutionPlanBuilder` and `ExecutorClient` (`workflow-engine` + `executor-integration`).
- Socket events: a stream of `mission_event` with `type=progress` and `type=log`. Stage transitions emit `type=role_switch`.
- Stores updated: `MissionStore` writes per-stage progress; `tasks-store` updates the cockpit step flow; `SandboxMonitor` re-attaches to the active mission per `release-stability-guardrails-v2` recovery rule.
- HITL gate: none yet.
- Audit row: every executor callback writes one row (HMAC-verified at `/api/executor/events`).
- Lineage: nodes added for each Artifact emitted; edges added for stage transitions.

### Step 4 — `running → waiting` (HITL gate, optional)

- Trigger: any decision point that requires human review — covered by `human-in-the-loop` (IMPLEMENTED) and surfaced in `DecisionPanel` / `DecisionHistory`.
- Socket event: `mission_event` with `type=waiting` (level `info`).
- Stores updated: `MissionStore` flips status to `waiting`; cockpit highlights the open decision in the `Logs / Artifacts / Runtime` rail.
- UI surface: `DecisionPanel` opens; user submits a decision via `POST /api/tasks/:id/decision` (idempotent).
- Audit row: `mission.waiting` plus the decision payload (hash-linked to the mission row).
- Resolution: on decision the mission transitions back to `running` (Step 3 resumes) or to `cancelled` (Step 6).

### Step 5 — Operator interventions (overlay, any time)

- Owner: `mission-operator-actions` (IMPLEMENTED, `33/33` tasks). Code: `server/tasks/mission-operator-service.ts`.
- Action types: `pause`, `resume`, `retry`, `escalate`, `mark-blocked`, `terminate`.
- Effect on status: only `terminate` (and the separate `mission-cancel-control` cancel path) reaches a terminal status. `pause` / `resume` / `mark-blocked` toggle the operator overlay without changing `MissionStatus`. `retry` is allowed only from `failed` and re-enters `running`.
- Audit row: every action writes one row, regardless of acceptance / rejection / completion (per `MISSION_OPERATOR_ACTION_RESULTS`).
- UI surface: action bar in `TasksCockpitDetail`, plus toast feedback driven by `mission-ui-polish` work.

### Step 6 — Terminal: `done` / `failed` / `cancelled`

- Emitter: `MissionOrchestrator` on stage completion (`done`), unhandled error (`failed`), or operator/cancel path (`cancelled`).
- Socket events: `mission_event` with `type=done` / `type=failed` / `type=cancelled` accordingly.
- Stores updated: `MissionStore` writes the terminal status; `tasks-store` clears the active-focus when appropriate; persistence-recovery hooks ensure the focus is re-attached after a reconnect (`release-stability-guardrails-v2`).
- Audit row: `mission.done` / `mission.failed` / `mission.cancelled`. The hash chain is **not** rewound — terminal rows are append-only by `audit-chain` invariant.
- Lineage: terminal node attribute set; the DAG remains queryable via `/api/lineage/*`.
- UI surface: cockpit moves the mission to the appropriate filter; Feishu thread receives the matching ACK / completion / failure mirror via `feishu-bridge`.

## Cancel-specific path (`mission-cancel-control`)

Cancel is a separate spec because it has end-to-end coverage: user gesture → server confirm → executor abort → callback → terminal `cancelled`. Per `mission-cancel-control` (IMPLEMENTED, `35/35` tasks), the cancel path:

1. Front-end gesture writes operator state `terminating` (overlay-only at first).
2. Server marks the mission for cancel and signals the executor.
3. Executor aborts the running container and returns a final HMAC callback.
4. `MissionOrchestrator` writes terminal status `cancelled` + audit row + lineage close.
5. Cockpit and Feishu surfaces both reflect `cancelled` (not `failed`).

## Reference

- Companion diagram: [d8-runtime-state-sequence.svg](./d8-runtime-state-sequence.svg) (`manifest:` cites mission-runtime + cancel-control + operator-actions + audit-chain + data-lineage-tracking).
- Audit table: [spec-audit-table.md](./spec-audit-table.md)
- Code anchors: `shared/mission/contracts.ts` (lines 15–66), `server/tasks/mission-store.ts`, `server/core/mission-orchestrator.ts`, `server/tasks/mission-operator-service.ts`.
- Q3 traceability: this document is a supporting answer to Q3 of the `Five_Control_Recovery_Questions`; primary is `01`, peers are `03`, `05`, `06`.
