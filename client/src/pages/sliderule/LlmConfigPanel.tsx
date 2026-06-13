import React from "react";
import { Cpu, Eye, EyeOff, Globe, Key, Plus, Server, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  loadByokPool,
  saveByokPool,
  clearByokPool,
  validateByokPool,
  maskKey,
  PRESET_ENDPOINTS,
  PRESET_MODELS,
  type ByokPresetId,
  type ByokKeyEntry,
  type ByokPoolConfig,
} from "@/lib/sliderule-byok-config";
import { IS_GITHUB_PAGES } from "@/lib/deploy-target";

const PRESET_IDS = Object.keys(PRESET_ENDPOINTS) as ByokPresetId[];

function emptyDraft(): {
  preset: ByokPresetId;
  label: string;
  endpoint: string;
  model: string;
  apiKey: string;
} {
  return { preset: "openai", label: "", endpoint: "", model: PRESET_MODELS.openai, apiKey: "" };
}

function newEntryId(): string {
  return `user-key-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * LLM 配置抽屉（BYOK 多 key 池）。
 * key 只写用户本机 localStorage（sliderule:llm-pool:v1），绝不进会话/导出/遥测。
 * 配了有效 key → 运行时浏览器直连用户端点；清空 → 回退服务端 LLM（localhost）/ 演示（Pages）。
 */
export function LlmConfigPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [entries, setEntries] = React.useState<ByokKeyEntry[]>([]);
  const [dispatch, setDispatch] = React.useState<ByokPoolConfig["dispatch"]>("least-busy");
  const [raceMode, setRaceMode] = React.useState(false);
  const [draft, setDraft] = React.useState(emptyDraft);
  const [showKey, setShowKey] = React.useState(false);

  // (Re)load the persisted pool whenever the drawer opens.
  React.useEffect(() => {
    if (!open) return;
    const pool = loadByokPool();
    setEntries(pool?.entries ?? []);
    setDispatch(pool?.dispatch ?? "least-busy");
    setRaceMode(pool?.raceMode ?? false);
    setDraft(emptyDraft());
    setShowKey(false);
  }, [open]);

  if (!open) return null;

  const isCustom = draft.preset === "custom";

  const onPresetChange = (preset: ByokPresetId) => {
    setDraft((d) => ({
      ...d,
      preset,
      endpoint: preset === "custom" ? d.endpoint : PRESET_ENDPOINTS[preset],
      model: preset === "custom" ? d.model : PRESET_MODELS[preset],
    }));
  };

  const persist = (
    nextEntries: ByokKeyEntry[],
    nextDispatch = dispatch,
    nextRaceMode = raceMode
  ) => {
    if (nextEntries.length === 0) {
      clearByokPool();
    } else {
      const pool: ByokPoolConfig = {
        version: 1,
        entries: nextEntries,
        dispatch: nextDispatch,
        raceMode: nextRaceMode,
      };
      const check = validateByokPool(pool);
      if (!check.ok) {
        toast.error("配置无效", { description: check.reason });
        return false;
      }
      saveByokPool(pool);
    }
    // Notify the session hook to live-switch the executor (browser-llm ↔ server-llm/demo).
    window.dispatchEvent(new CustomEvent("byok-config-changed"));
    return true;
  };

  const addKey = () => {
    const endpoint = isCustom ? draft.endpoint.trim() : PRESET_ENDPOINTS[draft.preset];
    const model = draft.model.trim() || PRESET_MODELS[draft.preset];
    if (!draft.apiKey.trim()) {
      toast.error("请输入 API Key");
      return;
    }
    if (!endpoint) {
      toast.error("custom 预设需要填写 endpoint");
      return;
    }
    const entry: ByokKeyEntry = {
      id: newEntryId(),
      label: draft.label.trim() || draft.preset,
      presetId: draft.preset,
      endpoint,
      model,
      apiKey: draft.apiKey.trim(),
      enabled: true,
    };
    const next = [...entries, entry];
    setEntries(next);
    if (persist(next)) {
      toast.success(`已添加 ${entry.label}`, { description: "下一轮推演将用你的 key 浏览器直连。" });
      setDraft(emptyDraft());
      setShowKey(false);
    }
  };

  const removeKey = (id: string) => {
    const next = entries.filter((e) => e.id !== id);
    setEntries(next);
    persist(next);
  };

  const toggleEnabled = (id: string) => {
    const next = entries.map((e) => (e.id === id ? { ...e, enabled: !e.enabled } : e));
    setEntries(next);
    persist(next);
  };

  const onDispatchChange = (value: ByokPoolConfig["dispatch"]) => {
    setDispatch(value);
    persist(entries, value, raceMode);
  };

  const onRaceModeChange = (value: boolean) => {
    setRaceMode(value);
    persist(entries, dispatch, value);
  };

  const clearAll = () => {
    setEntries([]);
    clearByokPool();
    window.dispatchEvent(new CustomEvent("byok-config-changed"));
    toast.success("已清空 BYOK 配置", {
      description: IS_GITHUB_PAGES ? "回退到演示模式。" : "回退到服务端 LLM。",
    });
  };

  const labelClass = "mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-slate-500";
  const inputClass =
    "w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-800 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100";

  return (
    <>
      {/* click-away scrim */}
      <div className="fixed inset-0 z-[80] bg-slate-900/20 backdrop-blur-[1px]" onClick={onClose} />
      <div
        className="fixed right-0 top-0 z-[81] flex h-full w-[min(100vw,420px)] flex-col border-l border-slate-200 bg-white shadow-2xl"
        data-testid="sliderule-llm-config-panel"
        role="dialog"
        aria-label="LLM 配置"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-white">
              <Cpu className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">LLM 配置 · BYOK</h3>
              <p className="text-[10px] text-slate-500">自带 key 池 · 浏览器直连 · 仅存本机</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            title="关闭"
            data-testid="sliderule-llm-config-close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-500">
            填入有效 key 后，下一轮推演会用<strong className="text-slate-700">你的 key 浏览器直连</strong>对应厂商；
            留空则使用{IS_GITHUB_PAGES ? "内置演示数据" : "服务端 LLM（.env）"}。
            key 只写本机 localStorage，绝不进会话、导出或遥测。
          </p>

          {/* existing keys */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-500">
                已配置 key（{entries.length}/8）
              </span>
              {entries.length > 0 && (
                <button
                  onClick={clearAll}
                  className="text-[10px] text-rose-500 transition hover:text-rose-700 hover:underline"
                >
                  全部清空
                </button>
              )}
            </div>
            {entries.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-[11px] text-slate-400">
                还没有 key — 在下方添加一条开始
              </p>
            ) : (
              <ul className="space-y-1.5" data-testid="sliderule-llm-config-key-list">
                {entries.map((e) => (
                  <li
                    key={e.id}
                    className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2"
                  >
                    <input
                      type="checkbox"
                      checked={e.enabled}
                      onChange={() => toggleEnabled(e.id)}
                      className="h-3.5 w-3.5 shrink-0 accent-indigo-600"
                      title={e.enabled ? "已启用（点击停用）" : "已停用（点击启用）"}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-xs font-medium text-slate-800">{e.label}</span>
                        <span className="shrink-0 rounded bg-slate-100 px-1 py-0.5 font-mono text-[9px] text-slate-500">
                          {e.presetId}
                        </span>
                      </div>
                      <div className="mt-0.5 truncate font-mono text-[10px] text-slate-400">
                        {maskKey(e.apiKey)} · {e.model}
                      </div>
                    </div>
                    <button
                      onClick={() => removeKey(e.id)}
                      className="shrink-0 rounded p-1 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                      title="删除这条 key"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* add new key */}
          <div className="space-y-2.5 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
            <span className="text-[11px] font-semibold text-slate-600">添加 key</span>
            <div>
              <label className={labelClass}>
                <Server className="h-3 w-3" /> 厂商预设
              </label>
              <select
                value={draft.preset}
                onChange={(ev) => onPresetChange(ev.target.value as ByokPresetId)}
                className={inputClass}
                data-testid="sliderule-llm-config-preset"
              >
                {PRESET_IDS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>

            {isCustom && (
              <div>
                <label className={labelClass}>
                  <Globe className="h-3 w-3" /> Endpoint
                </label>
                <input
                  type="text"
                  value={draft.endpoint}
                  onChange={(ev) => setDraft((d) => ({ ...d, endpoint: ev.target.value }))}
                  placeholder="https://your-host/v1/chat/completions"
                  className={`${inputClass} font-mono`}
                />
              </div>
            )}

            <div>
              <label className={labelClass}>
                <Cpu className="h-3 w-3" /> 模型
              </label>
              <input
                type="text"
                value={draft.model}
                onChange={(ev) => setDraft((d) => ({ ...d, model: ev.target.value }))}
                placeholder={PRESET_MODELS[draft.preset]}
                className={`${inputClass} font-mono`}
              />
            </div>

            <div>
              <label className={labelClass}>
                <Key className="h-3 w-3" /> API Key
              </label>
              <div className="relative">
                <input
                  type={showKey ? "text" : "password"}
                  value={draft.apiKey}
                  onChange={(ev) => setDraft((d) => ({ ...d, apiKey: ev.target.value }))}
                  placeholder="sk-..."
                  className={`${inputClass} pr-9 font-mono`}
                  data-testid="sliderule-llm-config-apikey"
                />
                <button
                  onClick={() => setShowKey((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-700"
                  title={showKey ? "隐藏" : "显示"}
                  type="button"
                >
                  {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>

            <div>
              <label className={labelClass}>标签（可选）</label>
              <input
                type="text"
                value={draft.label}
                onChange={(ev) => setDraft((d) => ({ ...d, label: ev.target.value }))}
                placeholder={draft.preset}
                className={inputClass}
              />
            </div>

            <button
              onClick={addKey}
              disabled={entries.length >= 8}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-indigo-500 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
              data-testid="sliderule-llm-config-add"
            >
              <Plus className="h-3.5 w-3.5" />
              {entries.length >= 8 ? "已达 8 条上限" : "添加到池"}
            </button>
          </div>

          {/* pool options */}
          <div className="space-y-2.5 rounded-xl border border-slate-200 p-3">
            <span className="text-[11px] font-semibold text-slate-600">池调度</span>
            <div>
              <label className={labelClass}>分发策略</label>
              <select
                value={dispatch}
                onChange={(ev) => onDispatchChange(ev.target.value as ByokPoolConfig["dispatch"])}
                className={inputClass}
              >
                <option value="least-busy">least-busy（默认 · 选最空闲 key）</option>
                <option value="round-robin">round-robin（轮流）</option>
              </select>
            </div>
            <label className="flex items-center gap-2 text-[11px] text-slate-600">
              <input
                type="checkbox"
                checked={raceMode}
                onChange={(ev) => onRaceModeChange(ev.target.checked)}
                className="h-3.5 w-3.5 accent-indigo-600"
              />
              竞速模式（多 key 并发抢答 · 更快但更费 token）
            </label>
          </div>
        </div>
      </div>
    </>
  );
}
