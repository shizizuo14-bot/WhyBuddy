import type { V5SessionState } from "@shared/blueprint/v5-reasoning-state";
import { deriveTurnRoute, type TurnRouteFacts } from "@shared/blueprint/sliderule-turn-route";
import type { UiTurn } from "./types";

/**
 * 刷新后内存 `uiTurns` 为空 → 右上角「架构执行记录」(依赖 latestTurn)整块消失,
 * 但画布仍在(来自持久化的 sessionState.graph)。本函数从**已持久化**的
 * decisionLedger / capabilityRuns / goal / runtimePhase / lastTurnId 派生出「最近一轮」的
 * 精简 UiTurn,让执行记录在刷新后可重建。
 *
 * 取舍:多轮折叠的细节(rounds)是运行期 drive 的产物,持久化里没有逐 loop 记录,
 * 故重建为「单轮合并视图」—— deriveTurnRoute 仍能据此渲染 INTAKE→BUDGET→ORCH→C_*→
 * T_GATE→GCOV 的完整站点序列。steps/actions(逐能力叙述)同样是运行期产物,留空不影响站点。
 */
export function deriveLatestTurnFromState(
  state: V5SessionState | null | undefined
): UiTurn | null {
  if (!state) return null;
  const runs = (state.capabilityRuns || []) as Array<{
    capabilityId?: string;
    roleId?: string;
    turnId?: string;
    gateResults?: Array<{ status?: string }>;
  }>;
  const ledger = (state.decisionLedger || []) as Array<{
    id?: string;
    turnId?: string;
    source?: string;
  }>;
  if (runs.length === 0 && ledger.length === 0) return null;

  const turnId =
    state.lastTurnId ||
    runs[runs.length - 1]?.turnId ||
    ledger[ledger.length - 1]?.turnId ||
    "restored-turn";
  const base = String(turnId).split("-r")[0];

  const belongs = (t: unknown) => {
    const s = String(t || "");
    return s === turnId || s === base || s.startsWith(`${base}-r`);
  };

  const turnRuns = runs.filter((r) => belongs(r.turnId));
  const effectiveRuns = turnRuns.length > 0 ? turnRuns : runs;

  let dledger: { id?: string; source?: string } | null = null;
  for (let i = ledger.length - 1; i >= 0; i--) {
    if (belongs(ledger[i].turnId)) {
      dledger = ledger[i];
      break;
    }
  }
  if (!dledger) dledger = ledger[ledger.length - 1] || null;

  const selectedCapabilities = effectiveRuns.map((r) => ({
    capabilityId: String(r.capabilityId),
    roleId: String(r.roleId || "agent"),
  }));
  const trustTotalCount = effectiveRuns.length;
  const trustPassedCount = effectiveRuns.filter((r) => {
    const gates = r.gateResults || [];
    return gates.length === 0 ? true : gates.every((g) => g.status === "passed");
  }).length;

  const routeFacts = {
    turnId: base,
    timestamp: new Date().toISOString(),
    goalStatusBefore: state.goal?.status,
    goalStatusAfter: state.goal?.status,
    planReason: "restored",
    planSelectedCount: selectedCapabilities.length,
    planSource: dledger?.source === "llm" ? "llm" : "local_heuristic",
    dledgerDecisionId: dledger?.id ?? null,
    committedCount: trustPassedCount,
    trustPassedCount,
    trustTotalCount,
    runtimePhase: state.runtimePhase,
    selectedCapabilities,
  } as unknown as TurnRouteFacts;

  return {
    id: base,
    user: "",
    status: "complete",
    steps: [],
    routeFacts,
    routeExpanded: false,
    routeLitCount: deriveTurnRoute(routeFacts).length,
    assistant: "",
    assistantSource: "llm",
    main: null,
    actions: [],
  } as UiTurn;
}
