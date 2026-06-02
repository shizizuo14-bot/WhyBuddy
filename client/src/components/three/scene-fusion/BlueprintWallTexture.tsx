/**
 * BlueprintWallTexture — dagre 布局 + Canvas2D 绘制流程图纹理。
 *
 * 原理：
 * 1. dagre 纯 JS 计算节点坐标（不需要 DOM）
 * 2. 原生 Canvas2D 直接绘制节点卡片和贝塞尔连线
 * 3. Three.js CanvasTexture 贴到墙面 mesh 上
 *
 * 优势：不需要隐藏 DOM 容器，不依赖 G6 的可见性要求，纯内存操作。
 */

import { useEffect, useRef, useMemo } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import dagre from "dagre";

import type { AgentReasoningEntry } from "@shared/blueprint/agent-reasoning";
import type {
  BlueprintGenerationJob,
  BlueprintRouteSet,
  BlueprintSpecTree,
} from "@shared/blueprint/contracts";
import type { BlueprintEffectPreviewSnapshot } from "@/lib/blueprint-api";
import type { AppLocale } from "@/lib/locale";

import {
  BLUEPRINT_WALL_GRAPH_POSITION,
  BLUEPRINT_WALL_GRAPH_WIDTH,
  BLUEPRINT_WALL_GRAPH_HEIGHT,
  BLUEPRINT_WALL_GRAPH_BACKING_WIDTH,
  BLUEPRINT_WALL_GRAPH_BACKING_HEIGHT,
} from "./blueprint-wall-placement";
import type {
  BlueprintWallArtifactInput,
  CapabilityOwner,
  CapabilityStatus,
  RolePhase,
} from "./blueprint-wall-process-data";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface BlueprintWallTextureProps {
  job: BlueprintGenerationJob | null | undefined;
  routeSet?: BlueprintRouteSet | null;
  specTree?: BlueprintSpecTree | null;
  effectPreviews?: BlueprintEffectPreviewSnapshot[];
  agentReasoningEntries?: AgentReasoningEntry[];
  capabilityStatuses?: Record<string, CapabilityStatus>;
  capabilityOwners?: Record<string, CapabilityOwner>;
  rolePhases?: Record<string, RolePhase>;
  artifacts?: BlueprintWallArtifactInput[];
  locale?: AppLocale;
}

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

const W = BLUEPRINT_WALL_GRAPH_WIDTH;
const H = BLUEPRINT_WALL_GRAPH_HEIGHT;
const NODE_W = 600;
const NODE_H = 100;
const PADDING = 120;

// 节点类型颜色
const TYPE_COLORS: Record<string, string> = {
  route_root: "#0d9488",
  route_step: "#6366f1",
  capability: "#f59e0b",
  preview: "#ec4899",
  final: "#10b981",
  default: "#64748b",
};

// ---------------------------------------------------------------------------
// dagre 布局计算
// ---------------------------------------------------------------------------

interface LayoutNode {
  id: string;
  x: number;
  y: number;
  title: string;
  type: string;
  status: string;
  body: string;
  height: number;
}

interface LayoutEdge {
  from: { x: number; y: number };
  to: { x: number; y: number };
  points: Array<{ x: number; y: number }>;
}

interface LayoutResult {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
}

/** Line height for node title text */
const LINE_H = 36;
/** Vertical padding inside node card */
const NODE_PAD_Y = 20;
/** Font used for node title measurement */
const NODE_FONT = "bold 32px system-ui, sans-serif";
/** Max text lines before ellipsis */
const MAX_TEXT_LINES = 3;
/** Min node height */
const MIN_NODE_H = 56;

/**
 * Measure a node's required height based on its text content.
 * Uses an offscreen canvas for measureText.
 * Includes space for: title lines + type label line + padding.
 */
function measureNodeHeight(text: string, measureCtx: CanvasRenderingContext2D): number {
  measureCtx.font = NODE_FONT;
  const lines = wrapTextSimple(text, NODE_W - 60, measureCtx);
  const lineCount = Math.min(lines.length, MAX_TEXT_LINES);
  // title lines + type label row (28px) + status dot row included in top padding
  return Math.max(MIN_NODE_H, lineCount * LINE_H + NODE_PAD_Y * 2 + 32);
}

/**
 * Simple word-wrap without needing the full canvas wrapText (used pre-layout).
 */
function wrapTextSimple(text: string, maxWidth: number, ctx: CanvasRenderingContext2D): string[] {
  const lines: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    let end = remaining.length;
    while (ctx.measureText(remaining.slice(0, end)).width > maxWidth && end > 1) {
      end--;
    }
    lines.push(remaining.slice(0, end));
    remaining = remaining.slice(end);
  }
  return lines.length > 0 ? lines : [""];
}

function computeLayout(
  graphData: { nodes: Array<{ id: string; data?: Record<string, unknown> }>; edges: Array<{ source: string; target: string }> }
): LayoutResult {
  // Create a measurement canvas for text width calculation
  const measureCanvas = document.createElement("canvas");
  const measureCtx = measureCanvas.getContext("2d")!;

  // Pre-compute each node's height
  const nodeHeights = new Map<string, number>();
  for (const node of graphData.nodes) {
    const title = (node.data?.title as string) ?? node.id;
    const body = (node.data?.body as string) ?? "";
    const fullText = body ? `${title} — ${body}` : title;
    const h = measureNodeHeight(fullText, measureCtx);
    nodeHeights.set(node.id, h);
  }

  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: "LR",
    nodesep: 180,
    ranksep: 540,
    marginx: PADDING,
    marginy: PADDING,
    align: "UL",
  });
  g.setDefaultEdgeLabel(() => ({}));

  for (const node of graphData.nodes) {
    g.setNode(node.id, { width: NODE_W, height: nodeHeights.get(node.id) ?? MIN_NODE_H });
  }
  for (const edge of graphData.edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  const graphInfo = g.graph();
  const graphWidth = (graphInfo.width ?? W - PADDING * 2) + PADDING * 2;
  const graphHeight = (graphInfo.height ?? H - PADDING * 2) + PADDING * 2;
  const scaleX = (W - PADDING * 2) / (graphWidth - PADDING * 2);
  const scaleY = (H - PADDING * 2) / (graphHeight - PADDING * 2);
  const scale = Math.min(scaleX, scaleY, 1.5);
  const offsetX = (W - (graphWidth - PADDING * 2) * scale) / 2;
  const offsetY = (H - (graphHeight - PADDING * 2) * scale) / 2;

  const nodes: LayoutNode[] = graphData.nodes.map(n => {
    const pos = g.node(n.id);
    const rawX = (pos?.x ?? 0) - PADDING;
    const rawY = (pos?.y ?? 0) - PADDING;
    return {
      id: n.id,
      x: rawX * scale + offsetX,
      y: rawY * scale + offsetY,
      title: (n.data?.title as string) ?? n.id,
      type: (n.data?.type as string) ?? "default",
      status: (n.data?.status as string) ?? "pending",
      body: (n.data?.body as string) ?? "",
      height: nodeHeights.get(n.id) ?? MIN_NODE_H,
    };
  });

  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const edges: LayoutEdge[] = graphData.edges.map(e => {
    const from = nodeMap.get(e.source);
    const to = nodeMap.get(e.target);
    const edgeData = g.edge(e.source, e.target);
    const points = (edgeData?.points ?? []).map((p: { x: number; y: number }) => ({
      x: (p.x - PADDING) * scale + offsetX,
      y: (p.y - PADDING) * scale + offsetY,
    }));
    return {
      from: { x: from?.x ?? 0, y: from?.y ?? 0 },
      to: { x: to?.x ?? 0, y: to?.y ?? 0 },
      points,
    };
  });

  return { nodes, edges };
}

// ---------------------------------------------------------------------------
/**
 * Wrap text into multiple lines that fit within maxWidth.
 */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    let end = remaining.length;
    while (ctx.measureText(remaining.slice(0, end)).width > maxWidth && end > 1) {
      end--;
    }
    lines.push(remaining.slice(0, end));
    remaining = remaining.slice(end);
  }
  return lines.length > 0 ? lines : [""];
}

// Canvas2D 绘制
// ---------------------------------------------------------------------------

function drawWall(ctx: CanvasRenderingContext2D, layout: LayoutResult | null) {
  // 背景
  const gradient = ctx.createLinearGradient(0, 0, 0, H);
  gradient.addColorStop(0, "#f0fdf9");
  gradient.addColorStop(1, "#ecfdf5");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, W, H);

  // 网格装饰点
  ctx.fillStyle = "rgba(148, 163, 184, 0.12)";
  for (let x = 90; x < W; x += 150) {
    for (let y = 90; y < H; y += 150) {
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (!layout || layout.nodes.length === 0) {
    // 空态
    ctx.fillStyle = "#94a3b8";
    ctx.font = "bold 54px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("蓝图流程图", W / 2, H / 2 - 36);
    ctx.font = "39px system-ui, sans-serif";
    ctx.fillStyle = "#64748b";
    ctx.fillText("等待执行数据…", W / 2, H / 2 + 42);
    return;
  }

  // 绘制连线（贝塞尔曲线虚线）
  ctx.lineWidth = 5;
  ctx.setLineDash([18, 12]);

  for (const edge of layout.edges) {
    // 使用水平贝塞尔曲线（从右侧出发到左侧到达）
    const fromX = edge.from.x + NODE_W / 2;
    const fromY = edge.from.y;
    const toX = edge.to.x - NODE_W / 2;
    const toY = edge.to.y;

    // 曲线控制点偏移量（水平距离的 40%）
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

    // 箭头圆点
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(45, 212, 191, 0.7)";
    ctx.beginPath();
    ctx.arc(toX, toY, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.setLineDash([18, 12]);
  }

  ctx.setLineDash([]);

  // 绘制节点卡片
  for (const node of layout.nodes) {
    const x = node.x - NODE_W / 2;
    const y = node.y - node.height / 2;
    const typeColor = TYPE_COLORS[node.type] ?? TYPE_COLORS.default;

    // 阴影
    ctx.shadowColor = "rgba(0,0,0,0.06)";
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 6;

    // 卡片背景
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.roundRect(x, y, NODE_W, node.height, 18);
    ctx.fill();

    // 边框
    ctx.shadowColor = "transparent";
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 3;
    ctx.stroke();

    // 左侧颜色条
    ctx.fillStyle = typeColor;
    ctx.beginPath();
    ctx.roundRect(x, y, 12, node.height, [18, 0, 0, 18]);
    ctx.fill();

    // 状态圆点
    const statusColor =
      node.status === "completed" ? "#10b981" :
      node.status === "running" ? "#3b82f6" :
      node.status === "failed" ? "#ef4444" : "#94a3b8";
    ctx.fillStyle = statusColor;
    ctx.beginPath();
    ctx.arc(x + NODE_W - 30, y + 28, 10, 0, Math.PI * 2);
    ctx.fill();

    // 标题 — 动态行数，最多3行，超出省略号
    ctx.fillStyle = "#1e293b";
    ctx.font = NODE_FONT;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    const fullText = node.body ? `${node.title} — ${node.body}` : node.title;
    const allLines = wrapText(ctx, fullText, NODE_W - 60);
    for (let i = 0; i < Math.min(allLines.length, MAX_TEXT_LINES); i++) {
      let line = allLines[i];
      if (i === MAX_TEXT_LINES - 1 && allLines.length > MAX_TEXT_LINES) {
        while (ctx.measureText(line + "…").width > NODE_W - 60 && line.length > 1) {
          line = line.slice(0, -1);
        }
        line += "…";
      }
      ctx.fillText(line, x + 30, y + NODE_PAD_Y + i * LINE_H);
    }

    // 类型标签（底部左侧）
    ctx.fillStyle = typeColor;
    ctx.font = "bold 22px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(node.type.toUpperCase().replace(/_/g, " "), x + 30, y + node.height - 32);
  }
}

// ---------------------------------------------------------------------------
// 组件
// ---------------------------------------------------------------------------

export function BlueprintWallTexture({
  job,
  routeSet,
  specTree,
  effectPreviews,
  agentReasoningEntries,
  capabilityStatuses,
  capabilityOwners,
  rolePhases,
  artifacts,
  locale,
}: BlueprintWallTextureProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textureRef = useRef<THREE.CanvasTexture | null>(null);
  const needsRedrawRef = useRef(true);

  // 直接从 agentReasoningEntries 构建思维导图节点
  // 按 stageId 分组为不同分支，形成多分支树形结构（类似参考图的思维导图）
  const graphData = useMemo(() => {
    const entries = agentReasoningEntries ?? [];
    if (entries.length === 0) return { nodes: [], edges: [] };

    const nodes: Array<{ id: string; data: Record<string, unknown> }> = [];
    const edges: Array<{ source: string; target: string }> = [];

    // 根节点
    const rootId = "root";
    nodes.push({
      id: rootId,
      data: {
        title: (job as unknown as { title?: string })?.title ?? "Blueprint 执行",
        type: "route_root",
        status: job?.status ?? "running",
        body: "",
      },
    });

    // 按 stageId 分组（每个 stage 是一个主分支）
    const stageMap = new Map<string, typeof entries>();
    for (const entry of entries) {
      if (entry.phase === "iteration_started" || entry.phase === "iteration_completed") continue;
      const stage = entry.stageId ?? "unknown";
      if (!stageMap.has(stage)) stageMap.set(stage, []);
      stageMap.get(stage)!.push(entry);
    }

    // 每个 stage 作为一级分支
    for (const [stageId, stageEntries] of stageMap) {
      const stageNodeId = `stage-${stageId}`;
      nodes.push({
        id: stageNodeId,
        data: {
          title: stageId.replace(/_/g, " "),
          type: "capability",
          status: stageEntries.some(e => e.phase === "completed") ? "completed" : "running",
          body: `${stageEntries.length} 步骤`,
        },
      });
      edges.push({ source: rootId, target: stageNodeId });

      // 在每个 stage 内，按 iteration 再分组为子分支
      const iterMap = new Map<number, typeof entries>();
      for (const entry of stageEntries) {
        const iter = entry.iteration ?? 1;
        if (!iterMap.has(iter)) iterMap.set(iter, []);
        iterMap.get(iter)!.push(entry);
      }

      for (const [iterNum, iterEntries] of iterMap) {
        // 如果只有一个迭代，直接把 entries 挂在 stage 下
        const parentId = iterMap.size > 1 ? `${stageNodeId}-iter-${iterNum}` : stageNodeId;

        if (iterMap.size > 1) {
          nodes.push({
            id: parentId,
            data: {
              title: `迭代 #${iterNum}`,
              type: "route_step",
              status: iterEntries.some(e => e.phase === "completed") ? "completed" : "running",
              body: "",
            },
          });
          edges.push({ source: stageNodeId, target: parentId });
        }

        // 每个 entry 按 phase 类型分组为子分支
        const thinkingEntries = iterEntries.filter(e => e.phase === "thinking");
        const actingEntries = iterEntries.filter(e => e.phase === "acting");
        const observingEntries = iterEntries.filter(e => e.phase === "observing");
        const completedEntries = iterEntries.filter(e => e.phase === "completed" || e.phase === "error");

        // thinking 分支
        for (const entry of thinkingEntries) {
          nodes.push({
            id: entry.id,
            data: {
              title: entry.thought?.slice(0, 50) ?? "思考中…",
              type: "route_step",
              status: "completed",
              body: entry.iterationLabel ?? "",
            },
          });
          edges.push({ source: parentId, target: entry.id });
        }

        // acting 分支
        for (const entry of actingEntries) {
          nodes.push({
            id: entry.id,
            data: {
              title: entry.actionToolId ?? "执行动作",
              type: "capability",
              status: "completed",
              body: entry.thought?.slice(0, 30) ?? "",
            },
          });
          edges.push({ source: parentId, target: entry.id });
        }

        // observing 分支
        for (const entry of observingEntries) {
          nodes.push({
            id: entry.id,
            data: {
              title: entry.observationSummary?.slice(0, 50) ?? "观察结果",
              type: "preview",
              status: entry.observationSuccess === false ? "failed" : "completed",
              body: "",
            },
          });
          // observing 连接到对应的 acting（如果有的话）
          const lastActing = actingEntries[actingEntries.length - 1];
          edges.push({ source: lastActing?.id ?? parentId, target: entry.id });
        }

        // completed/error 分支
        for (const entry of completedEntries) {
          nodes.push({
            id: entry.id,
            data: {
              title: entry.phase === "error"
                ? (entry.error?.slice(0, 40) ?? "错误")
                : (entry.reason?.slice(0, 40) ?? "完成"),
              type: "final",
              status: entry.phase === "error" ? "failed" : "completed",
              body: "",
            },
          });
          // completed 连接到最后一个 observing（如果有的话）
          const lastObserving = observingEntries[observingEntries.length - 1];
          edges.push({ source: lastObserving?.id ?? parentId, target: entry.id });
        }
      }
    }

    return { nodes, edges };
  }, [agentReasoningEntries, job]);

  const isEmpty = graphData.nodes.length === 0;

  // dagre 布局计算
  const layout = useMemo<LayoutResult | null>(() => {
    if (isEmpty) return null;
    try {
      return computeLayout(graphData as {
        nodes: Array<{ id: string; data?: Record<string, unknown> }>;
        edges: Array<{ source: string; target: string }>;
      });
    } catch {
      return null;
    }
  }, [graphData, isEmpty]);

  // 创建 canvas + texture（一次性）
  useEffect(() => {
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    canvasRef.current = canvas;

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    textureRef.current = texture;

    // 立即绘制初始状态
    const ctx = canvas.getContext("2d");
    if (ctx) drawWall(ctx, null);
    texture.needsUpdate = true;

    return () => {
      texture.dispose();
      textureRef.current = null;
      canvasRef.current = null;
    };
  }, []);

  // 数据变化时标记需要重绘
  useEffect(() => {
    needsRedrawRef.current = true;
  }, [layout]);

  // 每帧检查是否需要重绘
  useFrame(() => {
    if (!needsRedrawRef.current) return;
    needsRedrawRef.current = false;

    const canvas = canvasRef.current;
    const texture = textureRef.current;
    if (!canvas || !texture) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    drawWall(ctx, layout);
    texture.needsUpdate = true;

    // 确保 mesh 材质绑定了纹理
    if (meshRef.current) {
      const mat = meshRef.current.material as THREE.MeshBasicMaterial;
      if (!mat.map) {
        mat.map = texture;
        mat.needsUpdate = true;
      }
    }
  });

  return (
    <mesh ref={meshRef} position={BLUEPRINT_WALL_GRAPH_POSITION} receiveShadow>
      <planeGeometry args={[BLUEPRINT_WALL_GRAPH_BACKING_WIDTH, BLUEPRINT_WALL_GRAPH_BACKING_HEIGHT]} />
      <meshBasicMaterial />
    </mesh>
  );
}

export default BlueprintWallTexture;
