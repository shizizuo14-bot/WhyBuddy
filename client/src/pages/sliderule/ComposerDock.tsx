import React from "react";
import { autopilotTheme } from "./autopilot-theme";
import { Brain, Check, ChevronDown, RefreshCw } from "lucide-react";

/** Compact token budget label: 89000 → "89k", 12500 → "12.5k", 800 → "800". */
function formatBudgetTokens(n: number): string {
  if (n < 1000) return String(n);
  const k = n / 1000;
  return Number.isInteger(k) ? `${k}k` : `${k.toFixed(1)}k`;
}

export function ComposerDock({
  input,
  setInput,
  sendMessage,
  isRunning,
  goal,
  latestUserText,
  // driveMode/set from parent (M2); for demo fall back to local if not wired in all splits
  driveMode: outerDriveMode,
  setDriveMode: outerSetDriveMode,
  marathonBudget: outerMarathonBudget,
  // optional setter if parent wants live sync (future)
  onBudgetChange,
  stop,
}: {
  input: string;
  setInput: (v: string) => void;
  sendMessage: () => void;
  isRunning: boolean;
  goal: string;
  latestUserText?: string;
  hintChips?: string[]; // kept in props for parent compatibility (no longer rendered)
  driveMode?: "single" | "marathon";
  setDriveMode?: (m: "single" | "marathon") => void;
  marathonBudget?: { maxTokens: number; declaredAt: string };
  onBudgetChange?: (b: { maxTokens: number; declaredAt: string }) => void;
  stop?: () => void;
}) {
  const [localMode, setLocalMode] = React.useState<"single" | "marathon">("single");
  const driveMode = outerDriveMode || localMode;
  const setDriveMode = outerSetDriveMode || setLocalMode;
  let marathonBudget = outerMarathonBudget || (() => {
    try { return JSON.parse(localStorage.getItem("sliderule:marathonBudget") || "null"); } catch { return null; }
  })();
  // prefer outer if present
  if (outerMarathonBudget) marathonBudget = outerMarathonBudget;

  const [isModeOpen, setIsModeOpen] = React.useState(false);
  const modeRef = React.useRef(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  const selectMode = (mode: "single" | "marathon") => {
    if (mode === "marathon") {
      // M5 强制 UI: marathon 开时弹预算
      let budget = { maxTokens: 12000, declaredAt: new Date().toISOString() };
      try {
        const raw = localStorage.getItem("sliderule:marathonBudget");
        if (raw) budget = JSON.parse(raw);
      } catch {}
      const ans = window.prompt("M5 强制预算（marathon 开启）\n输入本 session 最大 token 上限（默认 12000）:", String(budget.maxTokens));
      if (ans) {
        const n = Math.max(2000, Math.min(80000, parseInt(ans, 10) || 12000));
        budget = { maxTokens: n, declaredAt: new Date().toISOString() };
        try { localStorage.setItem("sliderule:marathonBudget", JSON.stringify(budget)); } catch {}
        if (onBudgetChange) onBudgetChange(budget);
      }
      try { (window as any).__slideruleMarathonBudget = budget; } catch {}
    }
    setDriveMode(mode);
    setIsModeOpen(false);
  };

  // Close dropdown on outside click (Grok-like behavior)
  React.useEffect(() => {
    const handleClickOutside = (event: any) => {
      const refEl: any = modeRef.current;
      if (refEl && !refEl.contains(event && event.target)) {
        setIsModeOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Auto-grow textarea (optimization: comfortable multi-line without fixed rows)
  const adjustTextareaHeight = React.useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    if (!ta.value.trim()) {
      ta.style.height = "44px";
      return;
    }
    ta.style.height = "auto";
    const max = 110;
    ta.style.height = Math.min(ta.scrollHeight, max) + "px";
  }, []);

  React.useEffect(() => {
    adjustTextareaHeight();
  }, [input, adjustTextareaHeight]);

  const placeholderText =
    driveMode === "marathon"
      ? "输入新种子继续推演，或质疑当前结果...（Shift+Enter 换行）"
      : goal
        ? "继续补充想法，或质疑图上节点...（Shift+Enter 换行）"
        : "描述你想推演的问题...（Shift+Enter 换行）";

  // chips no longer rendered (user requested removal of bottom bubbles)
  // const chips = hintChips?.length ? hintChips : DEFAULT_HINT_CHIPS;
  return (
    <div className={`pointer-events-none flex ${autopilotTheme.composerDockWidth} flex-col items-center gap-2`}>
      {latestUserText && (
        <div
          className={
            driveMode === "marathon"
              ? autopilotTheme.latestUserBubbleMarathon
              : autopilotTheme.latestUserBubble
          }
        >
          本轮 · {latestUserText.slice(0, 72)}
          {latestUserText.length > 72 ? "…" : ""}
        </div>
      )}
      <div
        className="pointer-events-auto w-full bg-transparent p-0"
        data-testid="sliderule-composer-dock"
        data-mode={driveMode}
      >
        {/* Grok-style input bar with integrated left mode prefix (like Grok model selector).
            The mode pill is now a compact left prefix inside the bar.
            Icons: 🧠 for deep think, 🔄 for marathon/continuous.
            Dropdown improves: better left positioning, fixed width, smooth scale/fade animation, current selection check. */}
        <div
          className={`${
            driveMode === "marathon"
              ? autopilotTheme.grokInputBarMarathon
              : autopilotTheme.grokInputBar
          } border-0 ${
            driveMode === "marathon"
              ? "shadow-[0_12px_40px_rgb(79_70_229/0.08)]"
              : ""
          }`}
        >
          {/* Left mode selector prefix - integrated like Grok (pure SVG icons, smaller pill with hover scale) */}
          <div className="relative flex w-[100px] shrink-0 items-center sm:w-[132px]" ref={modeRef}>
            <button
              type="button"
              onClick={() => setIsModeOpen(!isModeOpen)}
              disabled={isRunning}
              className={`flex h-11 w-full items-center gap-2 rounded-full px-3 text-[11px] font-semibold transition-all duration-150 active:scale-[0.985] ${
                driveMode === "marathon"
                  ? "bg-indigo-50 text-indigo-700 hover:bg-indigo-100/70"
                  : "bg-slate-50/80 text-slate-600 hover:bg-slate-100/80"
              } ${isRunning ? "opacity-50 cursor-not-allowed" : ""}`}
              title="切换推演模式（Grok 风格前缀下拉）"
            >
              {driveMode === "marathon" ? (
                <RefreshCw className="h-4 w-4 shrink-0" strokeWidth={2.2} />
              ) : (
                <Brain className="h-4 w-4 shrink-0" strokeWidth={2.2} />
              )}
              <span className="min-w-0 truncate leading-none">
                {driveMode === "marathon" ? "持续推演" : "深思一轮"}
              </span>
              {driveMode === "marathon" && (
                <span className="font-mono text-[8px] tabular-nums text-indigo-400/80">
                  ·{formatBudgetTokens(marathonBudget?.maxTokens || 12000)}
                </span>
              )}
              <ChevronDown className="ml-auto h-3 w-3 shrink-0 text-current/50" strokeWidth={2.2} />
            </button>

            {/* Mode menu */}
            <div
              data-testid="sliderule-mode-menu"
              className={`absolute bottom-full left-0 z-[60] mb-2 w-[218px] origin-bottom-left overflow-hidden rounded-[18px] border border-white/80 bg-white/95 p-1.5 text-sm shadow-[0_18px_48px_rgb(15_23_42/0.16)] ring-1 ring-slate-200/70 backdrop-blur-xl transition-all duration-150 ease-out ${
                isModeOpen
                  ? "opacity-100 scale-100 translate-y-0"
                  : "opacity-0 scale-95 translate-y-2 pointer-events-none"
              }`}
            >
              <button
                type="button"
                onClick={() => selectMode("single")}
                className={`flex w-full items-center gap-2 rounded-[14px] px-2.5 py-2 text-left transition-colors hover:bg-slate-50 ${driveMode === "single" ? "bg-emerald-50/80" : ""}`}
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                  <Brain className="h-3.5 w-3.5" strokeWidth={2.2} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                    深思一轮
                    {driveMode === "single" && <Check className="h-3 w-3 text-emerald-500" strokeWidth={2.4} />}
                  </div>
                  <div className="mt-0.5 truncate text-[10px] leading-4 text-slate-500">想清楚一个问题后停下</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => selectMode("marathon")}
                className={`mt-1 flex w-full items-center gap-2 rounded-[14px] px-2.5 py-2 text-left transition-colors hover:bg-slate-50 ${driveMode === "marathon" ? "bg-indigo-50/80" : ""}`}
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
                  <RefreshCw className="h-3.5 w-3.5" strokeWidth={2.2} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                    持续推演
                    {driveMode === "marathon" && <Check className="h-3 w-3 text-indigo-500" strokeWidth={2.4} />}
                  </div>
                  <div className="mt-0.5 truncate text-[10px] leading-4 text-slate-500">自动推进到需要确认</div>
                </div>
              </button>
            </div>
          </div>

          {/* subtle divider between prefix and input */}
          <div className="mx-2 h-7 w-px flex-shrink-0 bg-slate-200/70 sm:mx-4" />

          <div className="relative h-11 min-w-0 flex-1">
            {!input && (
              <div className="pointer-events-none absolute left-4 right-2 top-1/2 -translate-y-1/2 truncate text-[14px] leading-[22px] text-slate-400">
                {placeholderText}
              </div>
            )}
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                // trigger height adjust immediately for responsive feel
                // (the effect also catches it for external changes)
                requestAnimationFrame(adjustTextareaHeight);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder=""
              aria-label={placeholderText}
              rows={1}
              disabled={isRunning}
              className={autopilotTheme.grokInput}
              style={{ minHeight: "44px" }}
              data-testid="sliderule-composer-input"
            />
          </div>
          <button
            type="button"
            onClick={isRunning ? (stop || (() => {})) : sendMessage}
            disabled={!isRunning && !input.trim()}
            className={
              !isRunning && driveMode === "marathon"
                ? autopilotTheme.grokSendBtnMarathon
                : autopilotTheme.grokSendBtn
            }
          >
            {isRunning ? "停止" : "发送"}
          </button>
        </div>
      </div>
    </div>
  );
}
