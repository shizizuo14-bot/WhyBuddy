/**
 * BrainstormWallGraph — pure logic module (no dagre / Three.js dependencies).
 *
 * Exports the testable rendering logic:
 * - Title truncation
 * - Adaptive scaling
 * - Node type → color mapping
 * - Canvas2D drawing (operates on pre-computed layout)
 *
 * This module is separated from BrainstormWallGraph.tsx to enable testing
 * without dagre/Three.js dependencies in the test environment.
 *
 * @see .kiro/specs/autopilot-multi-agent-brainstorm/design.md §8
 * Requirements: 7.1, 7.3, 7.5, 7.7
 */

import type { BranchNodeType } from "@shared/blueprint/brainstorm-contracts";
import type {
  ChallengeEdge,
  VoteOutcomeView,
} from "@/lib/brainstorm-graph-store";

// ---------------------------------------------------------------------------
// Constants (exported for testing)
// ---------------------------------------------------------------------------

/** Canvas resolution width */
export const CANVAS_W = 3840;
/** Canvas resolution height */
export const CANVAS_H = 1740;

/** Node card width in layout units */
export const BRAINSTORM_NODE_W = 540;
/** Node card height in layout units */
export const BRAINSTORM_NODE_H = 168;
/** Canvas padding */
export const BRAINSTORM_PADDING = 90;

/** Node type → color mapping (6 distinct colors for 6 types) */
export const BRAINSTORM_NODE_COLORS: Record<BranchNodeType, string> = {
  decision: "#0d9488",    // teal
  thinking: "#6366f1",    // indigo
  action: "#f59e0b",      // amber
  observation: "#ec4899", // pink
  synthesis: "#10b981",   // emerald
  error: "#ef4444",       // red
};

/** Maximum title length before truncation */
export const MAX_TITLE_LENGTH = 22;

// ---------------------------------------------------------------------------
// Layout Types
// ---------------------------------------------------------------------------

export interface LayoutNode {
  id: string;
  x: number;
  y: number;
  title: string;
  type: string;
  status: string;
  roleId: string;
  confidence?: number;
  opacity: number;
}

export interface LayoutEdge {
  from: { x: number; y: number };
  to: { x: number; y: number };
}

export interface LayoutResult {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  scale: number;
}

export interface BrainstormDeliberationOverlay {
  currentRound?: number | null;
  convergenceScore?: number | null;
  challengeEdges?: ChallengeEdge[];
  voteOutcome?: VoteOutcomeView | null;
}

// ---------------------------------------------------------------------------
// Title Truncation
// ---------------------------------------------------------------------------

/**
 * Truncates a title to MAX_TITLE_LENGTH characters, adding ellipsis if needed.
 */
export function truncateTitle(title: string): string {
  if (title.length <= MAX_TITLE_LENGTH) return title;
  return title.slice(0, MAX_TITLE_LENGTH) + "…";
}

// ---------------------------------------------------------------------------
// Adaptive Scaling
// ---------------------------------------------------------------------------

/**
 * Compute adaptive scale factor to fit the graph within wall bounds.
 */
export function computeAdaptiveScale(
  graphWidth: number,
  graphHeight: number,
  canvasWidth: number,
  canvasHeight: number,
  padding: number
): number {
  const availableWidth = canvasWidth - padding * 2;
  const availableHeight = canvasHeight - padding * 2;

  if (graphWidth <= 0 || graphHeight <= 0) return 1;

  const scaleX = availableWidth / graphWidth;
  const scaleY = availableHeight / graphHeight;
  // Don't scale up beyond 1.5x, and don't scale below 0.2x
  return Math.max(0.2, Math.min(scaleX, scaleY, 1.5));
}

// ---------------------------------------------------------------------------
// Canvas2D Rendering
// ---------------------------------------------------------------------------

export function drawBrainstormGraph(
  ctx: CanvasRenderingContext2D,
  layout: LayoutResult | null,
  canvasWidth: number = CANVAS_W,
  canvasHeight: number = CANVAS_H,
  deliberation: BrainstormDeliberationOverlay = {},
): void {
  // Background
  const gradient = ctx.createLinearGradient(0, 0, 0, canvasHeight);
  gradient.addColorStop(0, "#f0fdf9");
  gradient.addColorStop(1, "#ecfdf5");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // Grid decoration dots
  ctx.fillStyle = "rgba(148, 163, 184, 0.12)";
  for (let x = 90; x < canvasWidth; x += 150) {
    for (let y = 90; y < canvasHeight; y += 150) {
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (!layout || layout.nodes.length === 0) {
    // Empty state
    ctx.fillStyle = "#94a3b8";
    ctx.font = "bold 54px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Brainstorm 协作图", canvasWidth / 2, canvasHeight / 2 - 36);
    ctx.font = "39px system-ui, sans-serif";
    ctx.fillStyle = "#64748b";
    ctx.fillText("等待协作会话…", canvasWidth / 2, canvasHeight / 2 + 42);
    return;
  }

  if (deliberation.currentRound !== null && deliberation.currentRound !== undefined) {
    ctx.fillStyle = "rgba(15, 23, 42, 0.82)";
    ctx.font = "bold 30px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    const score = typeof deliberation.convergenceScore === "number"
      ? ` · ${(deliberation.convergenceScore * 100).toFixed(0)}%`
      : "";
    ctx.fillText(`Round ${deliberation.currentRound}${score}`, 96, 42);
  }

  // Draw edges (bezier dashed lines)
  ctx.lineWidth = 5;
  ctx.setLineDash([18, 12]);

  for (const edge of layout.edges) {
    const fromX = edge.from.x + BRAINSTORM_NODE_W / 2;
    const fromY = edge.from.y;
    const toX = edge.to.x - BRAINSTORM_NODE_W / 2;
    const toY = edge.to.y;

    const cpOffset = Math.abs(toX - fromX) * 0.4;

    ctx.strokeStyle = "rgba(45, 212, 191, 0.55)";
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.bezierCurveTo(
      fromX + cpOffset, fromY,
      toX - cpOffset, toY,
      toX, toY
    );
    ctx.stroke();

    // Arrow dot
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(45, 212, 191, 0.7)";
    ctx.beginPath();
    ctx.arc(toX, toY, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.setLineDash([18, 12]);
  }

  ctx.setLineDash([]);

  const nodeByRole = new Map(layout.nodes.map((node) => [node.roleId, node]));
  const challengeEdges = deliberation.challengeEdges ?? [];
  for (const challenge of challengeEdges) {
    const from = nodeByRole.get(challenge.challengerRoleId);
    const to = nodeByRole.get(challenge.targetRoleId);
    if (!from || !to) continue;
    ctx.strokeStyle = "rgba(244, 63, 94, 0.78)";
    ctx.lineWidth = 4;
    ctx.setLineDash([10, 10]);
    ctx.beginPath();
    ctx.moveTo(from.x + BRAINSTORM_NODE_W / 2, from.y + BRAINSTORM_NODE_H / 2);
    ctx.bezierCurveTo(
      from.x + 200,
      from.y + 80,
      to.x - 200,
      to.y - 80,
      to.x - BRAINSTORM_NODE_W / 2,
      to.y - BRAINSTORM_NODE_H / 2,
    );
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#be123c";
    ctx.font = "bold 22px system-ui, sans-serif";
    ctx.fillText(challenge.summary, (from.x + to.x) / 2 - 90, (from.y + to.y) / 2 - 34);
  }

  // Draw nodes
  for (const node of layout.nodes) {
    const x = node.x - BRAINSTORM_NODE_W / 2;
    const y = node.y - BRAINSTORM_NODE_H / 2;
    const typeColor = BRAINSTORM_NODE_COLORS[node.type as BranchNodeType] ?? "#64748b";

    // Apply opacity for fade-in animation
    ctx.globalAlpha = node.opacity;

    // Shadow
    ctx.shadowColor = "rgba(0,0,0,0.06)";
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 6;

    // Card background
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.roundRect(x, y, BRAINSTORM_NODE_W, BRAINSTORM_NODE_H, 18);
    ctx.fill();

    // Border
    ctx.shadowColor = "transparent";
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 3;
    ctx.stroke();

    // Left color bar
    ctx.fillStyle = typeColor;
    ctx.beginPath();
    ctx.roundRect(x, y, 12, BRAINSTORM_NODE_H, [18, 0, 0, 18]);
    ctx.fill();

    // Status dot
    const statusColor =
      node.status === "completed" ? "#10b981" :
      node.status === "active" ? "#3b82f6" :
      node.status === "failed" ? "#ef4444" : "#94a3b8";
    ctx.fillStyle = statusColor;
    ctx.beginPath();
    ctx.arc(x + BRAINSTORM_NODE_W - 36, y + 36, 12, 0, Math.PI * 2);
    ctx.fill();

    // Title (truncated to 22 chars)
    ctx.fillStyle = "#1e293b";
    ctx.font = "bold 33px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(truncateTitle(node.title), x + 36, y + 30);

    // Role label
    ctx.fillStyle = typeColor;
    ctx.font = "bold 24px system-ui, sans-serif";
    ctx.fillText(node.roleId.toUpperCase().replace(/_/g, " "), x + 36, y + 84);

    // Confidence indicator (if present)
    if (node.confidence !== undefined) {
      ctx.fillStyle = "#64748b";
      ctx.font = "27px system-ui, sans-serif";
      ctx.fillText(`conf: ${(node.confidence * 100).toFixed(0)}%`, x + 36, y + 126);
    }

    // Reset opacity
    ctx.globalAlpha = 1;
  }

  if (deliberation.voteOutcome) {
    const vote = deliberation.voteOutcome;
    const x = canvasWidth - 720;
    const y = 42;
    ctx.fillStyle = "rgba(255, 255, 255, 0.94)";
    ctx.beginPath();
    ctx.roundRect(x, y, 620, vote.isNarrow ? 166 : 126, 18);
    ctx.fill();
    ctx.strokeStyle = vote.isNarrow ? "#f43f5e" : "#14b8a6";
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.fillStyle = "#0f172a";
    ctx.font = "bold 30px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(`Vote: ${vote.winningOption}`, x + 28, y + 24);
    ctx.fillStyle = "#475569";
    ctx.font = "24px system-ui, sans-serif";
    ctx.fillText(`Margin ${(vote.margin * 100).toFixed(0)}%`, x + 28, y + 72);
    if (vote.isNarrow) {
      ctx.fillStyle = "#be123c";
      ctx.font = "bold 22px system-ui, sans-serif";
      const minority = vote.minority?.join(", ") ?? "minority noted";
      ctx.fillText(`Dissent: ${minority}`, x + 28, y + 112);
    }
  }
}
