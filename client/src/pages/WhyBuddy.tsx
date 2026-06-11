/**
 * WhyBuddy — 产品视图（/whybuddy）
 *
 * 三层递进披露：
 * 1. 默认：对话流 + 目标 + 单一结论徽章（goal.status 投影）
 * 2. 产物卡片：provenance / 证据链 / 质疑
 * 3. 审计抽屉：graph、DLEDGER、coverage 等工程内脏（默认关闭）
 *
 * Runtime 逻辑经 useWhyBuddySession；本文件仅负责表现层。
 * 工程驾驶舱见 /whybuddy/dev（WhyBuddyDev.tsx）。
 */

import React from "react";
import { ReasoningFlowSurface } from "@/components/autopilot/ReasoningFlowSurface";
import * as WhyBuddyRuntime from "@/lib/whybuddy-runtime";
import { useWhyBuddySession } from "./whybuddy/useWhyBuddySession";
import { projectConclusionBadge } from "./whybuddy/conclusion-badge";
import type { WhyArtifact } from "./whybuddy/types";

const HINT_CHIPS = [
  "路线对比一下",
  "澄清权限边界",
  "分析安全风险",
  "拆解成 SPEC Tree",
  "生成可行性报告",
  "效果预览",
];

function kindLabel(kind: string): string {
  const map: Record<string, string> = {
    report: "报告",
    risk: "风险",
    synthesis: "综合",
    evidence: "证据",
    decision: "决策",
  };
  return map[kind] || kind;
}

function ArtifactCard({
  art,
  isStale,
  executorLabel,
  onChallenge,
  onVerify,
}: {
  art: WhyArtifact;
  isStale: boolean;
  executorLabel: string;
  onChallenge: () => void;
  onVerify: () => void;
}) {
  const trusted = art.trustLevel === "gated_pass" || art.trustLevel === "audited";

  return (
    <details className="group rounded-lg border border-zinc-700/80 bg-zinc-800/60 p-3 text-sm open:pb-3">
      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="font-medium text-zinc-100">
              {kindLabel(art.kind)} · {art.capability}
            </div>
            <div className="mt-1 flex flex-wrap gap-1.5 text-[10px]">
              <span className="rounded-full bg-zinc-900 px-2 py-0.5 text-zinc-400 ring-1 ring-inset ring-zinc-700">
                {executorLabel}
              </span>
              {isStale ? (
                <span className="rounded-full bg-amber-950/50 px-2 py-0.5 text-amber-300 ring-1 ring-inset ring-amber-700/40">
                  已失效
                </span>
              ) : trusted ? (
                <span className="rounded-full bg-emerald-950/50 px-2 py-0.5 text-emerald-300 ring-1 ring-inset ring-emerald-700/40">
                  可信
                </span>
              ) : (
                <span className="rounded-full bg-rose-950/50 px-2 py-0.5 text-rose-300 ring-1 ring-inset ring-rose-700/40">
                  未通过验真
                </span>
              )}
            </div>
          </div>
          <span className="text-[11px] text-zinc-400 group-open:hidden">展开</span>
          <span className="hidden text-[11px] text-zinc-400 group-open:inline">收起</span>
        </div>
      </summary>

      <div className="mt-3 whitespace-pre-wrap text-xs leading-relaxed text-zinc-300">
        {art.content}
      </div>

      <div className="mt-3 flex flex-wrap gap-3 text-[11px]">
        <button
          type="button"
          onClick={onVerify}
          className="text-emerald-400 hover:text-emerald-300 hover:underline"
        >
          查看证据链
        </button>
        <button
          type="button"
          onClick={onChallenge}
          className="text-amber-400 hover:text-amber-300 hover:underline"
        >
          质疑此结论
        </button>
      </div>
    </details>
  );
}

export default function WhyBuddy() {
  const {
    goal,
    chatTurns,
    input,
    setInput,
    pinnedArtifact,
    setPinnedArtifact,
    nextGateShouldFail,
    setNextGateShouldFail,
    sessionState,
    dynamicGraph,
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
  } = useWhyBuddySession({
    sessionId: "whybuddy-main-proto",
    documentTitle: "WhyBuddy",
  });

  const badge = projectConclusionBadge(sessionState);
  const executorLabel = executorMode === "server-llm" ? "真实推演" : "模拟推演";
  const currentGraph = dynamicGraph;

  const verifyArtifactChain = (art: WhyArtifact) => {
    const runs = sessionState.capabilityRuns || [];
    const run = runs.find((r) => r.id === (art as any).producedBy?.capabilityRunId);
    const inputs = run?.inputs || [];
    const upstreams = (sessionState.artifacts || []).filter((a) => inputs.includes(a.id));
    const lines = [
      `产物: ${art.id} (${art.capability})`,
      `信任: ${art.trustLevel}`,
      `上游: ${inputs.join(", ") || "(无)"}`,
      ...upstreams.map(
        (u) => `  - ${u.id} [${u.trustLevel}] ${(u.title || u.summary || "").slice(0, 60)}`
      ),
    ];
    const loop = WhyBuddyRuntime.verifyV5ClosedLoop(sessionState);
    alert(`${lines.join("\n")}\n\n闭环验真: ${loop.passed ? "通过" : "未通过"}`);
  };

  return (
    <div className="relative flex h-screen flex-col bg-zinc-950 text-zinc-200">
      {/* Layer 1 — 顶栏：目标 + 单一结论徽章 */}
      <header className="flex items-center justify-between border-b border-zinc-800 bg-zinc-950 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500">我的想法</div>
          <div className="truncate text-sm font-medium text-zinc-100">{goal}</div>
        </div>
        <div className="flex items-center gap-3 pl-4">
          <div
            data-testid="whybuddy-conclusion-badge"
            className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${badge.className}`}
          >
            {badge.label}
          </div>
          <a
            href="#whybuddy-audit"
            className="rounded border border-zinc-700 px-2.5 py-1 text-[11px] text-zinc-300 hover:bg-zinc-800"
          >
            审计
          </a>
          <a
            href="/whybuddy/dev"
            className="text-[10px] text-zinc-500 hover:text-zinc-300 hover:underline"
            title="打开工程驾驶舱"
          >
            Dev
          </a>
        </div>
      </header>

      {/* Layer 1 — 对话流（默认主界面） */}
      <main className="flex-1 overflow-auto px-4 py-6">
        <div className="mx-auto max-w-2xl space-y-6">
          {chatTurns.length === 0 && (
            <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-900/40 px-6 py-12 text-center text-sm text-zinc-500">
              描述你的想法，WhyBuddy 会推演结论并告诉你能否信任。
              <div className="mt-4 text-xs text-zinc-600">
                例如：「分析权限方案风险并生成可行性报告」
              </div>
            </div>
          )}

          {chatTurns.map((turn) => (
            <div key={turn.id} className="space-y-3">
              <div className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-md bg-violet-600/20 px-4 py-2.5 text-sm text-zinc-100 ring-1 ring-inset ring-violet-500/20">
                  {turn.user}
                </div>
              </div>

              {turn.artifacts.length > 0 && (
                <div className="space-y-2 pl-1">
                  {turn.artifacts.map((art) => (
                    <ArtifactCard
                      key={art.id}
                      art={art}
                      isStale={sessionState.staleArtifactIds.includes(art.id)}
                      executorLabel={executorLabel}
                      onChallenge={() => challenge(art)}
                      onVerify={() => verifyArtifactChain(art)}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </main>

      {/* 输入区 */}
      <footer className="border-t border-zinc-800 bg-zinc-950 px-4 py-3">
        <div className="mx-auto flex max-w-2xl gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            placeholder="继续补充想法，或质疑上一轮结论…"
            className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
          />
          <button
            type="button"
            onClick={sendMessage}
            className="rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-violet-700"
          >
            发送
          </button>
        </div>
        <div className="mx-auto mt-2 flex max-w-2xl flex-wrap gap-1.5">
          {HINT_CHIPS.map((hint) => (
            <button
              key={hint}
              type="button"
              onClick={() => setInput(hint)}
              className="rounded-full border border-zinc-800 px-2 py-0.5 text-[10px] text-zinc-500 hover:border-zinc-600 hover:text-zinc-300"
            >
              {hint}
            </button>
          ))}
        </div>
      </footer>

      {/* Layer 3 — 审计抽屉（:target 打开，无 useState，SSR 友好） */}
      <div id="whybuddy-audit" className="pointer-events-none fixed inset-0 z-50 flex opacity-0 target:pointer-events-auto target:opacity-100 transition-opacity">
        <a
          href="#"
          className="flex-1 bg-black/50"
          aria-label="关闭审计抽屉"
        />
        <aside className="flex h-full w-full max-w-xl flex-col border-l border-zinc-800 bg-zinc-950 shadow-2xl">
          <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
            <div>
              <div className="text-sm font-semibold text-zinc-100">审计视图</div>
              <div className="text-[10px] text-zinc-500">DLEDGER · coverage · graph · 演示工具</div>
            </div>
            <a href="#" className="text-zinc-400 hover:text-zinc-200">
              关闭
            </a>
          </div>

            <div className="flex-1 overflow-auto p-4 space-y-4 text-[11px]">
              <div className="flex flex-wrap gap-2 text-[10px] text-zinc-400">
                <span className="rounded bg-zinc-900 px-2 py-0.5 font-mono">
                  session: {sessionState.sessionId}
                </span>
                <span className="rounded bg-zinc-900 px-2 py-0.5 font-mono">
                  phase: {sessionState.runtimePhase || "idle"}
                </span>
                <span className="rounded bg-zinc-900 px-2 py-0.5 font-mono">
                  executor: {executorMode}
                </span>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={verifyChain}
                  className="rounded border border-zinc-700 px-2 py-1 text-emerald-400 hover:bg-emerald-950/40"
                >
                  Verify Chain
                </button>
                <button type="button" onClick={listSessions} className="rounded border border-zinc-700 px-2 py-1 hover:bg-zinc-800">
                  sessions
                </button>
                <button type="button" onClick={showLedger} className="rounded border border-zinc-700 px-2 py-1 hover:bg-zinc-800">
                  ledger
                </button>
                <button type="button" onClick={resetSession} className="rounded border border-zinc-700 px-2 py-1 hover:bg-zinc-800">
                  重置会话
                </button>
                <button
                  type="button"
                  onClick={() => setNextGateShouldFail(true)}
                  className="rounded border border-rose-900 px-2 py-1 text-rose-400 hover:bg-rose-950/40"
                >
                  下次让上游失败
                </button>
                <a
                  href={`/whybuddy/dev?session=${encodeURIComponent(sessionState.sessionId || "")}`}
                  className="rounded border border-violet-900/60 px-2 py-1 text-violet-400 hover:bg-violet-950/40"
                >
                  在工程视图中打开 →
                </a>
              </div>

              {(() => {
                const gate: any = sessionState.coverageGate;
                const covGaps: any[] = sessionState.coverageGaps || [];
                const open = covGaps.filter((g) => g.status === "open").length;
                const wvd = covGaps.filter((g) => g.status === "waived").length;
                const covTxt = gate
                  ? `${gate.passed ? "passed" : "blocked"} · open ${open} · waived ${wvd}`
                  : "n/a";
                const csts: any[] = sessionState.costLedger || [];
                const tok = csts.reduce((s: number, c: any) => s + (c.estimatedTokens || 0), 0);
                const decs = WhyBuddyRuntime.getDecisionLedger
                  ? WhyBuddyRuntime.getDecisionLedger(sessionState)
                  : [];
                return (
                  <>
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full bg-zinc-900 px-2 py-0.5 font-mono text-zinc-400">
                        coverage <span className="text-zinc-100">{covTxt}</span>
                      </span>
                      <span className="rounded-full bg-zinc-900 px-2 py-0.5 font-mono text-zinc-400">
                        cost <span className="text-zinc-100">{tok} tok</span>
                      </span>
                      <span className="rounded-full bg-zinc-900 px-2 py-0.5 font-mono text-zinc-400">
                        decisions <span className="text-zinc-100">{decs.length}</span>
                      </span>
                    </div>

                    <div>
                      <div className="mb-1 font-medium text-zinc-400">Recent DLEDGER</div>
                      {decs.slice(-3).reverse().map((d: any, i: number) => (
                        <div
                          key={i}
                          className="mb-1.5 border-l border-zinc-700 pl-2 text-[10px] text-zinc-400"
                        >
                          <div className="font-mono">{d.id}</div>
                          <div className="truncate">chose: {(d.chose || []).join(", ")}</div>
                          <button
                            type="button"
                            onClick={() => challengeDecision(d.id)}
                            className="mt-0.5 text-blue-400 hover:underline"
                          >
                            challenge
                          </button>
                        </div>
                      ))}
                    </div>

                    <div>
                      <div className="mb-1 font-medium text-zinc-400">Coverage Gaps</div>
                      {covGaps.map((g: any, i: number) => (
                        <div key={i} className="mb-1 flex items-center gap-2 text-[10px]">
                          <span className="truncate text-zinc-300">
                            {g.label} [{g.status}]
                          </span>
                          {g.status === "open" && (
                            <button
                              type="button"
                              onClick={() => waiveGap(g.id)}
                              className="text-amber-400 hover:underline"
                            >
                              waive
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                );
              })()}

              <div className="rounded border border-zinc-800 bg-zinc-900 p-2" style={{ height: 280 }}>
                <div className="mb-1 text-[10px] font-medium text-zinc-500">Reasoning Graph</div>
                <ReasoningFlowSurface
                  graph={currentGraph}
                  initialScale={0.7}
                  className="h-[240px] w-full"
                  showChrome={false}
                  dark
                  onNodeClick={handleGraphNodeClick}
                />
              </div>

              {pinnedArtifact && (
                <div className="rounded border border-zinc-800 bg-zinc-900 p-2 text-[10px]">
                  <div className="font-medium text-zinc-300">Pinned artifact</div>
                  <div className="text-zinc-500">{pinnedArtifact.id}</div>
                  <button
                    type="button"
                    onClick={() => setPinnedArtifact(null)}
                    className="mt-1 text-rose-400 hover:underline"
                  >
                    取消 Pin
                  </button>
                </div>
              )}

              {nextGateShouldFail && (
                <div className="text-[10px] text-rose-400">演示模式：下次上游将强制 gate fail</div>
              )}
            </div>
          </aside>
      </div>
    </div>
  );
}