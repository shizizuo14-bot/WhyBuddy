import { describe, it, expect } from "vitest";
import type { V5SessionState } from "@shared/blueprint/v5-reasoning-state";
import { deriveTurnRoute } from "@shared/blueprint/sliderule-turn-route";
import { deriveLatestTurnFromState } from "../derive-persisted-turn";

/**
 * 修复:刷新后 uiTurns 为空 → 右上角架构执行记录消失。
 * 验证从持久化 sessionState 能重建出可渲染的「最近一轮」routeFacts(站点序列非空)。
 */
describe("deriveLatestTurnFromState (执行记录刷新后重建)", () => {
  it("returns null when no runs/ledger", () => {
    expect(deriveLatestTurnFromState({ capabilityRuns: [], decisionLedger: [] } as any)).toBeNull();
    expect(deriveLatestTurnFromState(null)).toBeNull();
  });

  it("rebuilds latest turn routeFacts from persisted runs + ledger", () => {
    const state = {
      goal: { text: "二手置换", status: "clear" },
      runtimePhase: "done",
      lastTurnId: "t1",
      capabilityRuns: [
        { id: "t1-run-0", capabilityId: "evidence.search", roleId: "接地", turnId: "t1", gateResults: [{ status: "passed" }] },
        { id: "t1-run-1", capabilityId: "synthesis.merge", roleId: "综合", turnId: "t1", gateResults: [{ status: "passed" }] },
        { id: "t1-run-2", capabilityId: "report.write", roleId: "综合", turnId: "t1-r2", gateResults: [{ status: "failed" }] },
      ],
      decisionLedger: [{ id: "t1-dledger", turnId: "t1", source: "llm" }],
    } as unknown as V5SessionState;

    const turn = deriveLatestTurnFromState(state);
    expect(turn).toBeTruthy();
    expect(turn!.id).toBe("t1");
    expect(turn!.status).toBe("complete");
    // 跨 t1 + t1-r2 的运行都归并到本轮
    expect(turn!.routeFacts.selectedCapabilities?.map((c) => c.capabilityId)).toEqual(
      expect.arrayContaining(["evidence.search", "synthesis.merge", "report.write"])
    );
    expect(turn!.routeFacts.trustTotalCount).toBe(3);
    expect(turn!.routeFacts.trustPassedCount).toBe(2); // 第三个 gate failed
    expect(turn!.routeFacts.planSource).toBe("llm");
    // 关键:能据此渲染出非空站点序列(执行记录可见)
    expect(deriveTurnRoute(turn!.routeFacts).length).toBeGreaterThan(0);
  });
});
