/**
 * autopilot-mirofish-stream / Wave 0 — 6 类 MiroFish 卡片组件
 *
 * 每张卡片都是 SSR 友好的纯展示组件,共享 MiroFishCardShell 外壳,只通过
 * primaryRow / secondaryRow / icon / label / dataAttrs 注入差异。
 */

import type { FC } from "react";

import type {
  MiroFishArtifactCreatedEntry,
  MiroFishCapabilityInvocationEntry,
  MiroFishNodeCompletedEntry,
  MiroFishReasoningEntry,
  MiroFishRouteDecisionEntry,
  MiroFishSystemNoteEntry,
} from "../mirofish-stream-types";

import { MiroFishCardShell } from "./card-shell";

// ─── ReasoningCard ───────────────────────────────────────────────────────

const REASONING_PHASE_ICON: Record<string, string> = {
  thinking: "💭",
  acting: "⚡",
  observing: "👁",
  completed: "✓",
  error: "⚠",
};

const REASONING_PHASE_LABEL: Record<string, string> = {
  thinking: "thinking",
  acting: "acting",
  observing: "observing",
  completed: "completed",
  error: "error",
};

export const ReasoningCard: FC<{ entry: MiroFishReasoningEntry }> = ({
  entry,
}) => {
  const icon = REASONING_PHASE_ICON[entry.phase] ?? "·";
  const label = `${REASONING_PHASE_LABEL[entry.phase] ?? entry.phase} · ${entry.iterationLabel}`;

  let primary: string | undefined;
  if (entry.thought) primary = entry.thought;
  else if (entry.actionToolId) primary = `→ ${entry.actionToolId}`;
  else if (entry.observationSummary) {
    const mark = entry.observationSuccess === false ? "✗" : "✓";
    primary = `${mark} ${entry.observationSummary}`;
  } else if (entry.reason) primary = entry.reason;
  else if (entry.error) primary = entry.error;

  return (
    <MiroFishCardShell
      icon={icon}
      label={label}
      tone={entry.tone}
      timestamp={entry.timestamp}
      primaryRow={primary}
      testid="mirofish-card-reasoning"
      dataAttrs={{
        "data-phase": entry.phase,
        "data-iteration": entry.iterationLabel,
      }}
    />
  );
};

// ─── NodeCompletedCard ───────────────────────────────────────────────────

const NODE_SOURCE_LABEL: Record<string, string> = {
  llm: "llm",
  fallback: "fallback",
  template: "template",
};

export const NodeCompletedCard: FC<{ entry: MiroFishNodeCompletedEntry }> = ({
  entry,
}) => {
  const sourceTag = entry.generationSource
    ? `· ${NODE_SOURCE_LABEL[entry.generationSource] ?? entry.generationSource}`
    : "";
  const docs = entry.documentTypes.join(" / ");
  return (
    <MiroFishCardShell
      icon="🌳"
      label="node_completed"
      tone={entry.tone}
      timestamp={entry.timestamp}
      primaryRow={`✓ ${entry.nodeTitle}`}
      secondaryRow={`${docs} ${sourceTag}`.trim()}
      testid="mirofish-card-node-completed"
      dataAttrs={{
        "data-node-id": entry.nodeId,
        "data-source": entry.generationSource ?? "unknown",
      }}
    />
  );
};

// ─── RouteDecisionCard ───────────────────────────────────────────────────

export const RouteDecisionCard: FC<{ entry: MiroFishRouteDecisionEntry }> = ({
  entry,
}) => {
  const kindTag = entry.routeKind ? `· ${entry.routeKind}` : "";
  return (
    <MiroFishCardShell
      icon="🛣"
      label="route_decision"
      tone={entry.tone}
      timestamp={entry.timestamp}
      primaryRow={`选择路线：${entry.routeTitle}`}
      secondaryRow={[entry.reason, kindTag].filter(Boolean).join("  ")}
      testid="mirofish-card-route-decision"
      dataAttrs={{
        "data-route-id": entry.routeId,
        "data-route-kind": entry.routeKind ?? "unknown",
      }}
    />
  );
};

// ─── CapabilityInvocationCard ────────────────────────────────────────────

const CAPABILITY_STATUS_LABEL: Record<string, string> = {
  invoking: "invoking",
  completed: "completed",
  failed: "failed",
};

export const CapabilityInvocationCard: FC<{
  entry: MiroFishCapabilityInvocationEntry;
}> = ({ entry }) => {
  const statusLabel =
    CAPABILITY_STATUS_LABEL[entry.status] ?? entry.status;
  return (
    <MiroFishCardShell
      icon="🔧"
      label={`capability · ${statusLabel}`}
      tone={entry.tone}
      timestamp={entry.timestamp}
      primaryRow={entry.capabilityId}
      testid="mirofish-card-capability"
      dataAttrs={{
        "data-capability-id": entry.capabilityId,
        "data-capability-status": entry.status,
      }}
    />
  );
};

// ─── ArtifactCreatedCard ─────────────────────────────────────────────────

export const ArtifactCreatedCard: FC<{
  entry: MiroFishArtifactCreatedEntry;
}> = ({ entry }) => {
  return (
    <MiroFishCardShell
      icon="📦"
      label={`artifact · ${entry.artifactType}`}
      tone={entry.tone}
      timestamp={entry.timestamp}
      primaryRow={entry.title}
      testid="mirofish-card-artifact"
      dataAttrs={{
        "data-artifact-id": entry.artifactId,
        "data-artifact-type": entry.artifactType,
      }}
    />
  );
};

// ─── SystemNoteCard ───────────────────────────────────────────────────────

export const SystemNoteCard: FC<{ entry: MiroFishSystemNoteEntry }> = ({
  entry,
}) => {
  return (
    <MiroFishCardShell
      icon={entry.tone === "warning" || entry.tone === "danger" ? "⚠" : "ℹ"}
      label="system"
      tone={entry.tone}
      timestamp={entry.timestamp}
      primaryRow={entry.message}
      secondaryRow={entry.hint}
      testid="mirofish-card-system-note"
    />
  );
};

export { MiroFishCardShell, formatTimestampHHMMSS } from "./card-shell";
