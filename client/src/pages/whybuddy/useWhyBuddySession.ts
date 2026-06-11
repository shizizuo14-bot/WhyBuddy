import { useState, useMemo, useEffect, useCallback } from "react";
import { REASONING_GRAPH_FIXTURE } from "@/dev-harness/reasoning-graph-fixture";
import type { V5CapabilityId } from "@shared/blueprint/contracts";
import { ALL_V5_CAPABILITIES, CAPABILITY_OUTPUT_KIND } from "@shared/blueprint/contracts";
import type { BrainstormReasoningGraph, BrainstormReasoningNode } from "@shared/blueprint";
import * as WhyBuddyRuntime from "@/lib/whybuddy-runtime";
import type { UserIntervention, V5SessionState } from "@shared/blueprint/v5-reasoning-state";
import type { ChatTurn, WhyArtifact, WhyBuddyExecutorMode } from "./types";

const DEFAULT_GOAL = "做一个权限管理系统（支持 RBAC + 数据范围）";
const DEFAULT_SESSION_ID = "whybuddy-main-proto";

function initialSessionState(goal: string, sessionId: string): V5SessionState {
  const base = WhyBuddyRuntime.createInitialSessionState(goal, sessionId);
  return WhyBuddyRuntime.deriveNodeStatus ? WhyBuddyRuntime.deriveNodeStatus(base) : base;
}

async function persistSession(state: V5SessionState): Promise<V5SessionState> {
  const derived = WhyBuddyRuntime.deriveNodeStatus
    ? WhyBuddyRuntime.deriveNodeStatus(state)
    : state;
  return WhyBuddyRuntime.saveSessionState(derived);
}

function resolveExecutorMode(): WhyBuddyExecutorMode {
  const params = new URLSearchParams(window.location.search);
  if (params.get("executor") === "server-llm") return "server-llm";
  if (params.get("executor") === "default") return "default";
  return "pilot";
}

export type UseWhyBuddySessionOptions = {
  sessionId?: string;
  initialGoal?: string;
  documentTitle?: string;
};

export function useWhyBuddySession(options: UseWhyBuddySessionOptions = {}) {
  const sessionId = options.sessionId ?? DEFAULT_SESSION_ID;
  const [goal, setGoal] = useState(options.initialGoal ?? DEFAULT_GOAL);
  const [chatTurns, setChatTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [pinnedArtifact, setPinnedArtifact] = useState<WhyArtifact | null>(null);
  const [nextGateShouldFail, setNextGateShouldFail] = useState(false);
  const [executorMode, setExecutorMode] = useState<WhyBuddyExecutorMode>("pilot");

  const [dynamicGraph, setDynamicGraph] = useState<BrainstormReasoningGraph>(() => ({
    ...REASONING_GRAPH_FIXTURE,
    nodes: [...REASONING_GRAPH_FIXTURE.nodes],
    edges: [...REASONING_GRAPH_FIXTURE.edges],
  }));

  const [sessionState, setSessionState] = useState(() =>
    initialSessionState(options.initialGoal ?? DEFAULT_GOAL, sessionId)
  );

  const availableCapabilities = useMemo(() => ALL_V5_CAPABILITIES, []);

  useEffect(() => {
    const prev = WhyBuddyRuntime.getCapabilityExecutor?.();
    const mode = resolveExecutorMode();
    setExecutorMode(mode);

    if (mode === "server-llm" && WhyBuddyRuntime.useServerLlmCapabilityExecutor) {
      WhyBuddyRuntime.useServerLlmCapabilityExecutor?.();
    } else if (mode === "default") {
      WhyBuddyRuntime.useDefaultExecutor?.();
    } else {
      WhyBuddyRuntime.usePilotRealExecutor?.();
    }

    return () => {
      if (prev && WhyBuddyRuntime.setCapabilityExecutor) {
        WhyBuddyRuntime.setCapabilityExecutor(prev);
      } else {
        WhyBuddyRuntime.useDefaultExecutor?.();
      }
    };
  }, []);

  useEffect(() => {
    if (!options.documentTitle) return;
    const prevTitle = document.title;
    document.title = options.documentTitle;
    return () => {
      document.title = prevTitle;
    };
  }, [options.documentTitle]);

  const applyPersistedState = useCallback((state: V5SessionState) => {
    setSessionState(state);
    if (state.graph) setDynamicGraph(state.graph);
  }, []);

  const challengeDecision = async (decId: string) => {
    const text =
      window.prompt("质疑这条调度决策的原因？", "质疑这条调度决策，请重新考虑") ||
      "质疑这条调度决策，请重新考虑";
    const turnId = `turn-ch-${Date.now()}`;

    const loadedState = await WhyBuddyRuntime.loadOrCreateSessionState(
      sessionState.sessionId || sessionId,
      goal
    );
    const { preparedState, context } = WhyBuddyRuntime.intakeMessage(loadedState, {
      turnId,
      userText: text,
      intervention: { intent: "challenge", targetDecisionId: decId, text } as UserIntervention,
    });

    const { newState: afterOrch } = WhyBuddyRuntime.orchestrateReasoningTurn(preparedState, context);
    const final = await persistSession(WhyBuddyRuntime.markAwaiting(afterOrch, turnId));
    applyPersistedState(final);

    setChatTurns((prev) => [
      ...prev,
      {
        id: turnId,
        user: `[decision challenge on ${decId}] ${text}`,
        selected: [],
        reason: "re-entry from DLEDGER decision challenge (runtime reconsider)",
        artifacts: [],
      },
    ]);
  };

  const waiveGap = async (gapId: string) => {
    const reason = window.prompt("Waive reason?", "user waived (demo)") || "user waived (demo)";
    let working = WhyBuddyRuntime.waiveCoverageGap(sessionState, gapId, reason);
    working = await persistSession(working);
    applyPersistedState(working);
  };

  const commitSelectedArtifacts = async (
    workingState: V5SessionState,
    turnId: string,
    planSelected: Array<{ capabilityId: V5CapabilityId; roleId?: string }>,
    contentPrefix = ""
  ): Promise<{ working: V5SessionState; committed: WhyArtifact[] }> => {
    const rawArtifacts: WhyArtifact[] = planSelected.map((sel, idx) => {
      const cap = sel.capabilityId;
      const outputKind = CAPABILITY_OUTPUT_KIND[cap] ?? "decision";
      let content: string;
      if (cap === "risk.analyze") {
        content = `${contentPrefix}${sel.roleId || "agent"} 通过 risk.analyze 贡献了：\n风险：数据范围越权风险（仅 RBAC 不足以表达跨部门/项目/租户边界）。\n风险：审计风险（权限变更需保留操作者、时间、影响对象）。`;
      } else if (cap === "counter.argue") {
        content = `${contentPrefix}${sel.roleId || "agent"} 通过 counter.argue 贡献了：\n反驳：过早引入 ABAC 会增加策略调试成本。\n建议：MVP 先采用 RBAC + scoped data filter，保留策略接口。`;
      } else {
        content = `${contentPrefix}${sel.roleId || "agent"} 通过 ${cap} 贡献了新洞察/证据/方案`;
      }
      return {
        id: `${turnId}-art-${idx}`,
        kind: outputKind,
        capability: cap,
        role: sel.roleId || "agent",
        content,
        trustLevel: "untrusted",
      };
    });

    let working = workingState;
    const committedArtifacts: WhyArtifact[] = [];

    for (let idx = 0; idx < rawArtifacts.length; idx++) {
      const raw = rawArtifacts[idx];
      const runId = `${turnId}-run-${idx}`;
      const isUpstream = raw.capability.includes("risk") || raw.capability.includes("argue");
      const forceFail = nextGateShouldFail && isUpstream;
      const freshInputs = WhyBuddyRuntime.findInputsForCapability(working, raw.capability);

      const exec = await WhyBuddyRuntime.executeCapability({
        capabilityId: raw.capability,
        state: working,
        inputArtifactIds: freshInputs,
        roleId: raw.role,
        turnId,
      });
      const content = exec ? exec.content : raw.content;

      const { updatedState, committed } = WhyBuddyRuntime.commitArtifact(
        working,
        {
          id: raw.id,
          kind: raw.kind as any,
          provenance: "ai_generated",
          producedBy: {
            capabilityRunId: runId,
            capabilityId: raw.capability,
            roleId: raw.role,
          },
          title: content ? content.split("\n")[0]?.slice(0, 80) : undefined,
          summary: content ? content.slice(0, 200) : undefined,
          content,
        } as any,
        runId,
        forceFail,
        freshInputs
      );

      working = updatedState;
      committedArtifacts.push({
        ...raw,
        content,
        trustLevel: committed ? (committed.trustLevel as WhyArtifact["trustLevel"]) : "untrusted",
      });
    }

    return { working, committed: committedArtifacts };
  };

  const sendMessage = async () => {
    if (!input.trim()) return;

    const userText = input.trim();
    const turnId = `turn-${Date.now()}`;

    const loadedState = await WhyBuddyRuntime.loadOrCreateSessionState(
      sessionState.sessionId || sessionId,
      goal
    );
    const { preparedState, context } = WhyBuddyRuntime.intakeMessage(loadedState, {
      turnId,
      userText,
    });

    const { newState: afterOrch, plan } = WhyBuddyRuntime.orchestrateReasoningTurn(
      preparedState,
      context
    );

    const { working, committed } = await commitSelectedArtifacts(
      afterOrch,
      turnId,
      plan.selected.map((s: any) => ({
        capabilityId: s.capabilityId as V5CapabilityId,
        roleId: s.roleId,
      }))
    );

    const turn: ChatTurn = {
      id: turnId,
      user: userText,
      selected: plan.selected.map((s: any) => ({
        cap: s.capabilityId as V5CapabilityId,
        role: s.roleId || "agent",
      })),
      reason: plan.reason,
      artifacts: committed,
    };

    let final = WhyBuddyRuntime.enrichGraphNodesAfterCommit(working, turnId);
    final = await persistSession(WhyBuddyRuntime.markAwaiting(final, turnId));

    applyPersistedState(final);
    setChatTurns((prev) => [...prev, turn]);
    setInput("");
    setNextGateShouldFail(false);
  };

  const runReentryTurn = async (
    intervention: UserIntervention,
    turnId: string,
    forceFail = false
  ) => {
    const { preparedState, context } = WhyBuddyRuntime.intakeMessage(
      await WhyBuddyRuntime.loadOrCreateSessionState(sessionState.sessionId || sessionId, goal),
      { turnId, userText: intervention.text, intervention }
    );

    const { newState: afterOrch, plan: rePlan } = WhyBuddyRuntime.orchestrateReasoningTurn(
      preparedState,
      context
    ) as any;

    const { working, committed } = await commitSelectedArtifacts(
      afterOrch,
      turnId,
      (rePlan.selected || []).map((sel: any) => ({
        capabilityId: sel.capabilityId as V5CapabilityId,
        roleId: sel.roleId,
      })),
      "【重入】"
    );

    const reentryTurn: ChatTurn = {
      id: turnId,
      user: intervention.text,
      selected: rePlan.selected.map((s: any) => ({
        cap: s.capabilityId as V5CapabilityId,
        role: s.roleId || "agent",
      })),
      reason: "用户干预（卡片或节点）→ 失效/补充 → Orchestrator 重新挑选能力",
      artifacts: committed,
    };

    let final = WhyBuddyRuntime.enrichGraphNodesAfterCommit(working, turnId);
    final = await persistSession(WhyBuddyRuntime.markAwaiting(final, turnId));

    applyPersistedState(final);
    setChatTurns((prev) => [...prev, reentryTurn]);
    void forceFail;
  };

  const challenge = (artifact: WhyArtifact) => {
    const intervention: UserIntervention = {
      targetArtifactId: artifact.id,
      intent: "challenge",
      text: `针对 ${artifact.capability}（${artifact.role}）的结论我不满意，请重新分析或补充证据。`,
    };
    runReentryTurn(intervention, `challenge-${Date.now()}`, nextGateShouldFail);
  };

  const handleGraphNodeClick = (node: BrainstormReasoningNode) => {
    const producedArtifactId = (node as any).producedArtifactId as string | undefined;
    const intervention: UserIntervention = {
      ...(producedArtifactId
        ? { targetArtifactId: producedArtifactId }
        : { targetNodeId: node.id }),
      intent: "challenge",
      text: `针对图中节点「${node.title || (node as any).capabilityId || node.id}」的结论我不满意，请重新分析或补充证据。`,
    };
    runReentryTurn(intervention, `node-challenge-${Date.now()}`, nextGateShouldFail);
  };

  const resetSession = async () => {
    setChatTurns([]);
    setDynamicGraph({
      ...REASONING_GRAPH_FIXTURE,
      nodes: [...REASONING_GRAPH_FIXTURE.nodes],
      edges: [...REASONING_GRAPH_FIXTURE.edges],
    });
    const resetSessionState = await persistSession(
      WhyBuddyRuntime.createInitialSessionState(goal, `whybuddy-reset-${Date.now()}`)
    );
    applyPersistedState(resetSessionState);
    setPinnedArtifact(null);
    setNextGateShouldFail(false);
  };

  const verifyChain = () => {
    const result = WhyBuddyRuntime.verifyV5ClosedLoop(sessionState);
    const phase = sessionState.runtimePhase || "unknown";
    alert(
      `V5 Closed Loop Verify: ${result.passed ? "PASSED ✅" : "FAILED ❌"}\n${result.details}\n\nruntimePhase: ${phase}`
    );
    console.log("[V5 Verify]", result, "phase=", phase);
  };

  const listSessions = async () => {
    let sessions: any[] = [];
    const lister = (WhyBuddyRuntime as any).listWhyBuddySessions;
    if (lister) {
      const res = lister();
      sessions = res && typeof res.then === "function" ? await res : res || [];
    }
    alert(
      `Active V5 sessions: ${sessions.length}\n` +
        sessions
          .map((s: any) => `${s.sessionId} (${s.artifactCount} arts, ${s.phase || "idle"})`)
          .join("\n")
    );
  };

  const refreshDerived = () => {
    const refreshed = WhyBuddyRuntime.deriveNodeStatus
      ? WhyBuddyRuntime.deriveNodeStatus(sessionState)
      : sessionState;
    applyPersistedState(refreshed);
    console.log("[V5] Derived view refreshed from current artifacts/stale");
  };

  const showLedger = () => {
    const ledger = WhyBuddyRuntime.getSessionLedger
      ? WhyBuddyRuntime.getSessionLedger(sessionState)
      : [];
    alert(
      `Ledger entries: ${ledger.length}\n` +
        ledger
          .slice(-5)
          .map((l: any) => `${l.capabilityId} @ ${l.trustLevel} (${l.gateSummary})`)
          .join("\n")
    );
  };

  return {
    goal,
    setGoal,
    chatTurns,
    input,
    setInput,
    pinnedArtifact,
    setPinnedArtifact,
    nextGateShouldFail,
    setNextGateShouldFail,
    sessionState,
    dynamicGraph,
    availableCapabilities,
    executorMode,
    sendMessage,
    challenge,
    challengeDecision,
    waiveGap,
    handleGraphNodeClick,
    resetSession,
    verifyChain,
    listSessions,
    showLedger,
    refreshDerived,
  };
}