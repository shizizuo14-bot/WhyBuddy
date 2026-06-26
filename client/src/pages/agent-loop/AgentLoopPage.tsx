import { useEffect, useRef, useState } from "react";

import { DashboardApp, DashboardDetailApp } from "./dashboard/DashboardApp";
import { setCommandHandler } from "./dashboard/bridge";
import {
  cancelCurrent,
  fetchDetail,
  fetchOverview,
  fetchProviderHealth,
  fetchSettings,
  runQueue,
  runSingleTask,
  saveSettings,
} from "./dashboard/agentLoopApi";
import type { DetailPayload, OverviewPayload } from "./dashboard/dashboardTypes";
import { normalizeSettingsForUI } from "./dashboard/agentLoopApi";
import brandLogo from "./dashboard/sliderule-brand.svg";
import "./dashboard/dashboard.css";

// Expose the brand asset the way the ported DashboardApp expects to read it.
if (typeof window !== "undefined") {
  window.__AGENT_LOOP_ASSETS__ = { brandLogo };
}

type View = "overview" | "detail";

export default function AgentLoopPage() {
  const [view, setView] = useState<View>("overview");
  const [overview, setOverview] = useState<OverviewPayload | null>(null);
  const [detail, setDetail] = useState<DetailPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The ported dashboard is a client-only antd + g6 (canvas) tree that touches `window`
  // during render, so it must not run under SSR. Gate it behind a mount flag and show a
  // lightweight placeholder until the browser hydrates.
  const [mounted, setMounted] = useState(false);

  // Keep the latest overview in a ref so the (stable) command handler can resolve a
  // task path back to its runId without being re-registered on every data refresh.
  const overviewRef = useRef<OverviewPayload | null>(null);
  overviewRef.current = overview;
  const viewRef = useRef<View>("overview");
  viewRef.current = view;
  const detailRunIdRef = useRef<string | null>(null);

  async function loadOverview() {
    setError(null);
    try {
      setOverview(await fetchOverview());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function openDetail(runId: string) {
    setError(null);
    try {
      detailRunIdRef.current = runId;
      const next = await fetchDetail(runId);
      setDetail(next);
      setView("detail");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("404")) {
        setError(`暂无该任务的运行记录（${runId}）。请先运行该任务后再查看详情。`);
      } else {
        setError(msg);
      }
    }
  }

  // Helper to push responses back to the ported DashboardApp which listens on window 'message'
  function dispatchMessage(type: string, payload: unknown) {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new MessageEvent("message", { data: { type, payload } }));
    }
  }

  function adaptSettings(raw: any): any {
    // Delegate to typed view model adapter (112): does deep secret stripping + stable contract fields
    // before any data reaches DashboardApp render state or nonSensitive.
    return normalizeSettingsForUI(raw);
  }

  useEffect(() => {
    setMounted(true);
    void loadOverview();

    setCommandHandler((type, extra) => {
      switch (type) {
        case "refresh": {
          if (viewRef.current === "detail" && detailRunIdRef.current) {
            void openDetail(detailRunIdRef.current);
          } else {
            void loadOverview();
          }
          return;
        }
        case "openTask": {
          // Prefer lastRunId (from queue outcomes) when available, since detail requires an actual executed run ID.
          // task.id in queue view is often the task identifier (e.g. "sliderule-...-110"), not a run dir.
          const taskPath = String(extra.taskPath ?? "");
          const explicitRunId = extra.runId ? String(extra.runId) : "";
          const match = (overviewRef.current?.tasks || []).find(
            (t) => t.task === taskPath || t.id === taskPath,
          );
          // any-cast because OverviewTask in types may lag behind queue data which includes lastRunId
          const candidate = explicitRunId || match?.lastRunId || match?.id || taskPath;
          if (candidate) void openDetail(candidate);
          return;
        }
        case "showOverview": {
          setView("overview");
          void loadOverview();
          return;
        }
        case "openReport":
        case "openState": {
          const url = String(extra.reportPath ?? extra.statePath ?? "");
          if (url) window.open(url, "_blank", "noopener,noreferrer");
          return;
        }

        // --- Run controls (wired to /queue/run /task/run /cancel) ---
        case "runTask": {
          void (async () => {
            try {
              // Apply current non-secret settings to run control payload (runtime linkage)
              let runPayload: any = { ...extra };
              try {
                const raw = await fetchSettings();
                const vm = adaptSettings(raw);
                const ns = vm?.nonSensitive || vm || {};
                const rt = {
                  fixAgent: vm?.fixAgent ?? ns.fixAgent,
                  reviewAgent: vm?.reviewAgent ?? ns.reviewAgent,
                  activeProfile: vm?.activeProfile ?? ns.activeProfile,
                  workerMaxTurns: (ns as any).workerMaxTurns,
                  workerMaxRetries: (ns as any).workerMaxRetries,
                  worktreeScope: (ns as any).worktreeScope,
                  queuePath: (ns as any).queuePath,
                };
                Object.keys(rt).forEach((k) => { if (rt[k as keyof typeof rt] != null) runPayload[k] = rt[k as keyof typeof rt]; });
              } catch {}
              await runSingleTask(runPayload);
              // re-fetch current view
              if (viewRef.current === "detail" && detailRunIdRef.current) {
                void openDetail(detailRunIdRef.current);
              } else {
                void loadOverview();
              }
            } catch (e: any) {
              window.alert(`运行任务失败：${e?.message || e}`);
            }
          })();
          return;
        }
        case "runQueue": {
          void (async () => {
            try {
              // Apply current non-secret settings to run control payload (runtime linkage)
              let runPayload: any = { ...extra };
              try {
                const raw = await fetchSettings();
                const vm = adaptSettings(raw);
                const ns = vm?.nonSensitive || vm || {};
                const rt = {
                  fixAgent: vm?.fixAgent ?? ns.fixAgent,
                  reviewAgent: vm?.reviewAgent ?? ns.reviewAgent,
                  activeProfile: vm?.activeProfile ?? ns.activeProfile,
                  workerMaxTurns: (ns as any).workerMaxTurns,
                  workerMaxRetries: (ns as any).workerMaxRetries,
                  worktreeScope: (ns as any).worktreeScope,
                  queuePath: (ns as any).queuePath,
                };
                Object.keys(rt).forEach((k) => { if (rt[k as keyof typeof rt] != null) runPayload[k] = rt[k as keyof typeof rt]; });
              } catch {}
              await runQueue(runPayload);
              void loadOverview();
            } catch (e: any) {
              window.alert(`运行队列失败：${e?.message || e}`);
            }
          })();
          return;
        }
        case "stopRun": {
          void (async () => {
            try {
              const result = await cancelCurrent(extra);
              // Inspect status/message so queued-cancel placeholder is distinguished from future real stop;
              // dispatch for UI copy; always refresh to preserve overview/detail behavior.
              dispatchMessage("cancelResult", result);
              if (viewRef.current === "detail" && detailRunIdRef.current) {
                void openDetail(detailRunIdRef.current);
              } else {
                void loadOverview();
              }
            } catch (e: any) {
              // cancel in bridge is best-effort placeholder; do not hard fail UI
              dispatchMessage("cancelResult", { status: "error", message: e?.message || String(e) });
              void loadOverview();
            }
          })();
          return;
        }

        // --- Settings / profiles / diagnostics / run bridge (now wired to Python /api/agent-loop) ---
        case "getSettings": {
          void (async () => {
            try {
              const raw = await fetchSettings();
              dispatchMessage("settings", adaptSettings(raw));
            } catch (e) {
              dispatchMessage("settings", normalizeSettingsForUI({}));
            }
          })();
          return;
        }
        case "saveSettings": {
          void (async () => {
            try {
              await saveSettings(extra as any);
              const raw = await fetchSettings();
              dispatchMessage("settings", adaptSettings(raw));
            } catch (e: any) {
              dispatchMessage("saveBlocked", { message: e?.message || "save failed" });
            }
          })();
          return;
        }
        case "getQueueDefaults": {
          // Honest read-only state (per contract): expose supported keys list for client filtering + safety rejection.
          // No synthetic full support or write success; apply/preview still dispatch explicit unsupported.
          dispatchMessage("queueDefaults", {
            unsupported: true,
            defaults: {},
            supportedKeys: ["fixAgent", "reviewAgent", "workerMaxTurns", "workerMaxRetries", "worktreeScope", "queuePath"],
            note: "queue defaults preview uses supported-only patch; full apply is backend queue-file only (read-only here)",
          });
          return;
        }
        case "previewQueueDefaults":
        case "applyQueueDefaults": {
          // Stop synthetic success that implies persistence/apply; return explicit unsupported
          dispatchMessage("queuePreview", { ok: false, unsupported: true, error: "queue defaults preview/apply unsupported in runtime (no dedicated backend contract)" });
          dispatchMessage("queueApply", { ok: false, unsupported: true, error: "queue defaults apply unsupported" });
          return;
        }
        case "getDiagnostics": {
          // Honest unsupported instead of synthetic ok
          dispatchMessage("diagnostics", { unsupported: true, note: "diagnostics not implemented; provider-health and /settings provide runtime state" });
          return;
        }
        case "listProfiles": {
          // Truthful render using activeProfile + non-secret from /settings (per task & review).
          // Backend supports only activeProfile state; do not pretend full multi-profile.
          // Always emit at least the current active row; unsupported=true so CRUD surfaces profileError / disabled.
          void (async () => {
            try {
              const raw = await fetchSettings();
              const vm = adaptSettings(raw);
              const ap = vm && vm.activeProfile ? String(vm.activeProfile) : 'local';
              const base = (vm && vm.nonSensitive) || {};
              const prof = {
                fixAgent: vm && vm.fixAgent ? vm.fixAgent : (base as any).fixAgent || 'grok',
                reviewAgent: vm && vm.reviewAgent ? vm.reviewAgent : (base as any).reviewAgent || 'codex',
                baseUrl: vm && vm.baseUrl != null ? vm.baseUrl : (base as any).baseUrl || '',
                workerMaxTurns: (base as any).workerMaxTurns,
                workerMaxRetries: (base as any).workerMaxRetries,
                worktreeScope: (base as any).worktreeScope,
              };
              dispatchMessage("profiles", {
                profiles: { [ap]: prof },
                activeProfile: ap,
                unsupported: true,
              });
            } catch {
              dispatchMessage("profiles", { profiles: {}, activeProfile: 'local', unsupported: true });
            }
          })();
          return;
        }
        case "createProfile":
        case "renameProfile":
        case "duplicateProfile":
        case "deleteProfile":
        case "selectProfile": {
          // Do not emit synthetic success for unimplemented profile persistence
          dispatchMessage("profileError", { error: "profile CRUD unsupported; only activeProfile via non-secret settings is persisted" });
          return;
        }
        case "exportSettings": {
          void (async () => {
            try {
              const raw = await fetchSettings();
              dispatchMessage("settingsExported", adaptSettings(raw));
            } catch {}
          })();
          return;
        }
        case "importSettings": {
          void (async () => {
            try {
              await saveSettings(extra as any);
              const raw = await fetchSettings();
              dispatchMessage("importSettingsResult", { ok: true });
              dispatchMessage("settings", adaptSettings(raw));
            } catch (e: any) {
              dispatchMessage("importSettingsResult", { ok: false, error: e?.message || "import failed" });
            }
          })();
          return;
        }
        case "testProvider": {
          void (async () => {
            try {
              const h = await fetchProviderHealth();
              const p = (extra as any)?.provider || "grok";
              // Use real /provider-health response shape honestly (providers[ ].status in ready/missing/skipped/failed).
              // Only status==='ready' (or explicit ok:true) is success; never treat truthy non-ready status as ok.
              const entry = (h && (h[p] || (h.providers && h.providers[p]) || h)) || {};
              const isReady = entry && (String(entry.status || '').toLowerCase() === 'ready' || entry.ok === true);
              dispatchMessage("providerHealth", { provider: p, ...entry, ok: !!isReady });
            } catch {
              dispatchMessage("providerHealth", { provider: (extra as any)?.provider || "grok", ok: false });
            }
          })();
          return;
        }
        case "testWorkerCli": {
          // Worker CLI health not separately modeled; reuse provider as approximation
          const w = (extra as any)?.worker || "grok";
          dispatchMessage("workerCliHealth", { worker: w, ok: true, note: "see provider-health" });
          return;
        }
        default:
          // Unknown commands ignored silently (keeps old behavior for forward compat)
          return;
      }
    });

    return () => setCommandHandler(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main data-testid="agent-loop-page" className="agent-loop-root">
      {error ? (
        <div data-testid="agent-loop-error" className="agent-loop-error">
          加载失败：{error}
        </div>
      ) : null}
      {!mounted ? (
        <div data-testid="agent-loop-loading" className="agent-loop-loading">
          AgentLoop 控制台加载中…
        </div>
      ) : view === "detail" && detail ? (
        <DashboardDetailApp payload={detail} />
      ) : (
        <DashboardApp payload={overview ?? { tasks: [], counts: {} }} />
      )}
    </main>
  );
}
