import { memo } from "react";

import { useI18n } from "@/i18n";
import type { MissionTaskDetail, MissionTaskSummary } from "@/lib/tasks-store";
import {
  compactText,
  deriveMissionStepFlow,
  deriveMissionStepFocus,
  missionStatusLabel,
} from "@/components/tasks/task-helpers";
import { FUTURE_OFFICE_COLORS } from "@/lib/scene-theme";

function t(locale: string, zh: string, en: string) {
  return locale === "zh-CN" ? zh : en;
}

function stepFlowStatusLabel(
  locale: string,
  status:
    | "pending"
    | "active"
    | "done"
    | "waiting"
    | "failed"
    | "timeout"
    | "cancelled"
) {
  switch (status) {
    case "done":
      return t(locale, "完成", "Done");
    case "cancelled":
      return t(locale, "已取消", "Cancelled");
    case "failed":
      return t(locale, "失败", "Failed");
    case "timeout":
      return t(locale, "超时", "Timeout");
    case "waiting":
      return t(locale, "等待", "Waiting");
    case "active":
      return t(locale, "进行中", "Active");
    default:
      return t(locale, "待开始", "Pending");
  }
}

function formatClock(locale: string, timestamp: number | null | undefined) {
  if (!timestamp) {
    return locale === "zh-CN" ? "待命" : "Standby";
  }

  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function missionTone(status: MissionTaskSummary["status"] | null) {
  switch (status) {
    case "failed":
      return {
        accent: "#f97373",
        accentSoft: "rgba(249,115,115,0.16)",
        progress: "linear-gradient(90deg, #fb7185, #f87171)",
      };
    case "done":
      return {
        accent: "#4ade80",
        accentSoft: "rgba(74,222,128,0.16)",
        progress: "linear-gradient(90deg, #4ade80, #22c55e)",
      };
    case "waiting":
      return {
        accent: "#60a5fa",
        accentSoft: "rgba(96,165,250,0.16)",
        progress: "linear-gradient(90deg, #60a5fa, #38bdf8)",
      };
    case "running":
      return {
        accent: FUTURE_OFFICE_COLORS.cyan,
        accentSoft: "rgba(56,189,248,0.18)",
        progress: "linear-gradient(90deg, #60a5fa, #38bdf8, #2dd4bf)",
      };
    default:
      return {
        accent: "#94a3b8",
        accentSoft: "rgba(148,163,184,0.16)",
        progress: "linear-gradient(90deg, #64748b, #94a3b8)",
      };
  }
}

export interface MissionWallTaskPanelProps {
  mission: MissionTaskSummary | null;
  detail: MissionTaskDetail | null;
  fullscreen?: boolean;
  onActivate?: () => void;
  onClose?: () => void;
}

function MissionWallTaskPanelInner({
  mission,
  detail,
  fullscreen = false,
  onActivate,
  onClose,
}: MissionWallTaskPanelProps) {
  const { locale } = useI18n();
  const tone = missionTone(mission?.status ?? null);
  const statusLabel = mission
    ? missionStatusLabel(mission.status, locale)
    : t(locale, "待命", "Standby");
  const stepFocus = deriveMissionStepFocus(detail ?? mission, locale, {
    pendingStageLabel: t(locale, "等待任务", "Awaiting mission"),
  });
  const stepFlow = deriveMissionStepFlow(detail ?? mission);
  const stageLabel = stepFocus.stageLabel;
  const title =
    stepFocus.title ||
    t(locale, "办公室后墙监控屏待命中", "Office wall monitor is standing by");
  const wallSummary =
    mission?.status === "waiting" ||
    stepFlow.items.some(item => item.status === "waiting")
      ? t(
          locale,
          "当前任务停留在等待步骤，详细决策与补充说明统一留在辅助区。",
          "The mission is currently paused at a waiting step. Detailed decisions and guidance stay in the support dock."
        )
      : stepFlow.items.some(item => item.status === "timeout")
        ? t(
            locale,
            "当前步骤已进入超时态，排障与后续动作统一留在辅助区与 Runtime。",
            "The current step has timed out. Troubleshooting and follow-up stay in Support and Runtime."
          )
        : stepFlow.items.some(item => item.status === "failed")
          ? t(
              locale,
              "当前步骤已进入失败态，详细失败原因与运行证据统一留在 Runtime。",
              "The current step has failed. Detailed failure evidence stays in Runtime."
            )
          : t(
              locale,
              "当前任务正按步骤流推进，日志与运行细节统一留在 Logs / Runtime。",
              "The mission is progressing through its step flow. Logs and runtime details stay in Logs / Runtime."
            );
  const compactWallView = !fullscreen;
  const signalLine = compactText(wallSummary, compactWallView ? 72 : 96);
  const progress = stepFocus.progress;
  const needsAttention =
    mission?.status === "failed" ||
    mission?.status === "waiting" ||
    (detail?.failureReasons.length ?? 0) > 0;
  const autopilot = detail?.autopilotSummary ?? mission?.autopilotSummary;
  const destinationLabel = autopilot?.destination.goal
    ? compactText(autopilot.destination.goal, fullscreen ? 42 : 18)
    : t(locale, "等待目的地", "Awaiting destination");
  const routeLabel =
    autopilot?.route.selected?.label ||
    autopilot?.route.label ||
    t(locale, "路线待规划", "Route pending");
  const driveStateLabel =
    autopilot?.driveState.label ||
    t(locale, "自动驾驶待命", "Autopilot standby");
  const takeoverLabel =
    autopilot?.takeover.required || mission?.status === "waiting"
      ? t(locale, "需要接管", "Takeover")
      : t(locale, "可自动推进", "Auto-driving");
  const summaryLabels = [statusLabel, stageLabel, driveStateLabel];

  const rootStyle: React.CSSProperties = fullscreen
    ? {
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        padding: 24,
        background:
          "linear-gradient(180deg, rgba(248,251,255,0.96), rgba(226,236,246,0.96))",
      }
    : {
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        borderRadius: 16,
        cursor: onActivate ? "pointer" : "default",
        background: "transparent",
        border: "none",
        boxShadow: "none",
      };

  const mainShellStyle: React.CSSProperties = {
    position: "relative",
    width: "100%",
    height: "100%",
    minHeight: fullscreen ? 0 : "100%",
    borderRadius: fullscreen ? 24 : 14,
    overflow: "hidden",
    background:
      "radial-gradient(circle at top right, rgba(125,211,252,0.13), transparent 24%), linear-gradient(180deg, rgba(26,38,56,0.92), rgba(14,25,41,0.94))",
    border: "1px solid rgba(203, 213, 225, 0.24)",
    boxShadow: fullscreen
      ? "0 18px 48px rgba(3, 8, 16, 0.48)"
      : "inset 0 1px 0 rgba(255,255,255,0.03)",
  };

  const shellPadding = fullscreen ? 28 : 8;

  return (
    <div
      style={rootStyle}
      onClick={!fullscreen ? onActivate : undefined}
      role={!fullscreen && onActivate ? "button" : undefined}
      tabIndex={!fullscreen && onActivate ? 0 : undefined}
      onKeyDown={
        !fullscreen && onActivate
          ? event => {
              if (event.key === "Enter" || event.key === " ") {
                onActivate();
              }
            }
          : undefined
      }
    >
      <div style={mainShellStyle}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "repeating-linear-gradient(180deg, rgba(255,255,255,0.02) 0px, rgba(255,255,255,0.02) 1px, transparent 1px, transparent 4px)",
            opacity: 0.16,
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            boxShadow: `inset 0 0 0 1px ${tone.accentSoft}`,
            pointerEvents: "none",
          }}
        />
        {fullscreen && onClose ? (
          <button
            type="button"
            onClick={event => {
              event.stopPropagation();
              onClose();
            }}
            style={{
              position: "absolute",
              top: 16,
              right: 16,
              zIndex: 3,
              border: "none",
              borderRadius: 999,
              background: "rgba(248,251,255,0.86)",
              color: "#e2e8f0",
              padding: "6px 10px",
              cursor: "pointer",
            }}
          >
            {t(locale, "关闭", "Close")}
          </button>
        ) : null}

        <div
          style={{
            position: "relative",
            zIndex: 2,
            display: "flex",
            flexDirection: "column",
            height: "100%",
            padding: shellPadding,
            transform: compactWallView ? "scale(0.94)" : undefined,
            transformOrigin: "top center",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 10,
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: fullscreen ? 50 : 30,
                  height: fullscreen ? 50 : 30,
                  borderRadius: fullscreen ? 12 : 9,
                  background: "rgba(125,211,252,0.92)",
                  color: "#0f172a",
                  fontSize: fullscreen ? 17 : 13,
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                MC
              </div>
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: fullscreen ? 18 : 10,
                    lineHeight: 1.1,
                    letterSpacing: fullscreen ? "0.18em" : "0.14em",
                    textTransform: "uppercase",
                    color: "rgba(148,163,184,0.88)",
                  }}
                >
                  {t(locale, "执行监控", "Execution Monitor")}
                </div>
                <div
                  style={{
                    marginTop: fullscreen ? 6 : 3,
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    flexWrap: "wrap",
                  }}
                >
                  {summaryLabels.map((label, index) => (
                    <span
                      key={`${label}-${index}`}
                      style={{
                        borderRadius: 999,
                        padding: fullscreen ? "4px 10px" : "2px 7px",
                        fontSize: fullscreen ? 13 : 8,
                        lineHeight: 1.1,
                        color: index === 0 ? tone.accent : "#93c5fd",
                        background:
                          index === 0
                            ? tone.accentSoft
                            : "rgba(96,165,250,0.12)",
                        border:
                          index === 0
                            ? `1px solid ${tone.accentSoft}`
                            : "1px solid rgba(96,165,250,0.16)",
                      }}
                    >
                      {label}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                color: "rgba(148,163,184,0.88)",
                fontSize: fullscreen ? 16 : 10,
                letterSpacing: "0.1em",
                flexShrink: 0,
              }}
            >
              <span>{formatClock(locale, mission?.updatedAt ?? null)}</span>
              <span
                style={{
                  display: "inline-flex",
                  gap: fullscreen ? 6 : 4,
                  alignItems: "center",
                }}
              >
                {[
                  FUTURE_OFFICE_COLORS.green,
                  FUTURE_OFFICE_COLORS.cyan,
                  "#94a3b8",
                ].map(color => (
                  <span
                    key={color}
                    style={{
                      width: fullscreen ? 10 : 6,
                      height: fullscreen ? 10 : 6,
                      borderRadius: 999,
                      background: color,
                      boxShadow: `0 0 12px ${color}`,
                    }}
                  />
                ))}
              </span>
            </div>
          </div>

          <div
            style={{
              marginTop: fullscreen ? 28 : 6,
              fontSize: fullscreen ? 42 : 12,
              lineHeight: fullscreen ? 1.2 : 1.16,
              fontWeight: 700,
              color: "#f8fafc",
              textWrap: "balance",
            }}
          >
            {compactText(title, fullscreen ? 96 : 32)}
          </div>

          <div
            style={{
              marginTop: fullscreen ? 18 : 6,
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
              gap: fullscreen ? 10 : 4,
            }}
          >
            {[
              [t(locale, "目的地", "Destination"), destinationLabel],
              [
                t(locale, "路线", "Route"),
                compactText(routeLabel, fullscreen ? 28 : 14),
              ],
              [
                t(locale, "编队", "Fleet"),
                String(
                  autopilot?.fleet.activeRoleCount ??
                    mission?.activeAgentCount ??
                    0
                ),
              ],
              [t(locale, "接管", "Takeover"), takeoverLabel],
            ].map(([label, value]) => (
              <div
                key={label}
                style={{
                  minWidth: 0,
                  borderRadius: fullscreen ? 14 : 8,
                  border: `1px solid ${tone.accentSoft}`,
                  background: "rgba(15,23,42,0.38)",
                  padding: fullscreen ? "8px 10px" : "4px 5px",
                }}
              >
                <div
                  style={{
                    fontSize: fullscreen ? 11 : 6,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "rgba(148,163,184,0.9)",
                  }}
                >
                  {label}
                </div>
                <div
                  style={{
                    marginTop: fullscreen ? 4 : 2,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    fontSize: fullscreen ? 15 : 8,
                    fontWeight: 700,
                    color: "#e2e8f0",
                  }}
                >
                  {value}
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: fullscreen ? 24 : 6 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                color: "rgba(226,232,240,0.92)",
                fontSize: fullscreen ? 18 : 10,
              }}
            >
              <span>{t(locale, "总体进度", "Overall progress")}</span>
              <span
                style={{
                  fontSize: fullscreen ? 26 : 12,
                  fontWeight: 700,
                  color: tone.accent,
                }}
              >
                {`${Math.round(progress)}%`}
              </span>
            </div>
            <div
              style={{
                marginTop: 6,
                height: fullscreen ? 16 : 7,
                borderRadius: 999,
                background: "rgba(51,65,85,0.72)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${Math.max(6, progress)}%`,
                  height: "100%",
                  borderRadius: 999,
                  background: tone.progress,
                  boxShadow: `0 0 18px ${tone.accent}`,
                }}
              />
            </div>
          </div>

          <div
            style={{
              marginTop: fullscreen ? 16 : 2,
              display: "grid",
              gridTemplateColumns: `repeat(${Math.max(stepFlow.items.length, 1)}, minmax(0, 1fr))`,
              gap: fullscreen ? 10 : 5,
            }}
          >
            {stepFlow.items.map(item => {
              const isCurrent = item.key === stepFlow.currentKey;
              const statusColor =
                item.status === "done"
                  ? "#4ade80"
                  : item.status === "cancelled"
                    ? "#94a3b8"
                    : item.status === "timeout"
                      ? FUTURE_OFFICE_COLORS.cyanSoft
                      : item.status === "failed"
                        ? "#f87171"
                        : item.status === "waiting"
                          ? "#60a5fa"
                          : item.status === "active"
                            ? tone.accent
                            : "rgba(148,163,184,0.52)";
              const barWidth =
                item.progress <= 0
                  ? 0
                  : Math.max(8, Math.min(100, item.progress));

              return (
                <div
                  key={item.key}
                  style={{
                    minWidth: 0,
                    borderRadius: fullscreen ? 14 : 10,
                    padding: fullscreen ? "12px 12px 10px" : "5px 6px 4px",
                    background: isCurrent
                      ? "rgba(15,23,42,0.82)"
                      : "rgba(15,23,42,0.52)",
                    border: `1px solid ${isCurrent ? statusColor : "rgba(71,85,105,0.18)"}`,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8,
                    }}
                  >
                    <span
                      style={{
                        minWidth: 0,
                        fontSize: fullscreen ? 13 : 7,
                        lineHeight: 1.2,
                        color: "rgba(226,232,240,0.92)",
                        fontWeight: isCurrent ? 700 : 600,
                      }}
                    >
                      {compactText(item.label, fullscreen ? 28 : 16)}
                    </span>
                    <span
                      style={{
                        width: fullscreen ? 10 : 6,
                        height: fullscreen ? 10 : 6,
                        borderRadius: 999,
                        background: statusColor,
                        boxShadow: `0 0 12px ${statusColor}`,
                        flexShrink: 0,
                      }}
                    />
                  </div>
                  <div
                    style={{
                      marginTop: fullscreen ? 6 : 3,
                      fontSize: fullscreen ? 11 : 6,
                      lineHeight: 1.1,
                      color: statusColor,
                      fontWeight: 600,
                      letterSpacing: "0.04em",
                      textTransform: "uppercase",
                    }}
                  >
                    {stepFlowStatusLabel(locale, item.status)}
                  </div>
                  <div
                    style={{
                      marginTop: fullscreen ? 8 : 4,
                      height: fullscreen ? 6 : 3,
                      borderRadius: 999,
                      background: "rgba(51,65,85,0.72)",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${barWidth}%`,
                        height: "100%",
                        borderRadius: 999,
                        background: statusColor,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div
            style={{
              marginTop: fullscreen ? 24 : 6,
              borderRadius: 12,
              border: `1px solid ${tone.accentSoft}`,
              background: "rgba(22,30,44,0.72)",
              padding: fullscreen ? "18px 20px" : "6px 8px",
              color: "rgba(203,213,225,0.92)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span
                style={{
                  width: fullscreen ? 12 : 7,
                  height: fullscreen ? 12 : 7,
                  borderRadius: 999,
                  background: needsAttention ? tone.accent : "#60a5fa",
                  boxShadow: `0 0 14px ${needsAttention ? tone.accent : "#60a5fa"}`,
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontSize: fullscreen ? 20 : 10,
                  lineHeight: compactWallView ? 1.22 : 1.45,
                }}
              >
                {signalLine}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export const MissionWallTaskPanel = memo(MissionWallTaskPanelInner);
