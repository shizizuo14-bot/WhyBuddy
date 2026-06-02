/**
 * BrainstormWallGraph — dagre 布局 + Canvas2D 绘制多智能体协作思维导图纹理。
 *
 * 与 BlueprintWallTexture 遵循同一模式：
 * 1. dagre 纯 JS 计算节点坐标（LR 方向）
 * 2. Canvas2D 绘制节点卡片（type→color）和贝塞尔虚线连线
 * 3. Three.js CanvasTexture 贴到墙面 mesh 上
 * 4. 新节点 fade-in 动画（300ms opacity 0→1）
 *
 * @see .kiro/specs/autopilot-multi-agent-brainstorm/design.md §8
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7
 */

import { useEffect, useRef, useMemo } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import dagre from "dagre";

import type { BranchNode, BranchEdge } from "@/lib/brainstorm-graph-store";
import type { BrainstormSessionStatus } from "@/lib/brainstorm-graph-store";
import { useBrainstormGraphStore } from "@/lib/brainstorm-graph-store";

import {
  BLUEPRINT_WALL_GRAPH_POSITION,
  BLUEPRINT_WALL_GRAPH_BACKING_WIDTH,
  BLUEPRINT_WALL_GRAPH_BACKING_HEIGHT,
} from "./blueprint-wall-placement";

import {
  CANVAS_W,
  CANVAS_H,
  BRAINSTORM_NODE_W,
  BRAINSTORM_NODE_H,
  BRAINSTORM_PADDING,
  computeAdaptiveScale,
  drawBrainstormGraph,
} from "./brainstorm-wall-graph-logic";
import type { LayoutNode, LayoutEdge, LayoutResult } from "./brainstorm-wall-graph-logic";

// Re-export from logic module for backward compatibility
export {
  truncateTitle,
  computeAdaptiveScale,
  BRAINSTORM_NODE_COLORS,
  BRAINSTORM_NODE_W,
  BRAINSTORM_NODE_H,
  BRAINSTORM_PADDING,
  MAX_TITLE_LENGTH,
  CANVAS_W,
  CANVAS_H,
  drawBrainstormGraph,
} from "./brainstorm-wall-graph-logic";
export type { LayoutNode, LayoutEdge, LayoutResult } from "./brainstorm-wall-graph-logic";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface BrainstormWallGraphProps {
  nodes: BranchNode[];
  edges: BranchEdge[];
  sessionStatus: BrainstormSessionStatus;
}

// ---------------------------------------------------------------------------
// dagre Layout Computation
// ---------------------------------------------------------------------------

export function computeBrainstormLayout(
  nodes: BranchNode[],
  edges: BranchEdge[],
  canvasWidth: number = CANVAS_W,
  canvasHeight: number = CANVAS_H
): LayoutResult | null {
  if (nodes.length === 0) return null;

  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: "LR",
    nodesep: 150,
    ranksep: 420,
    marginx: BRAINSTORM_PADDING,
    marginy: BRAINSTORM_PADDING,
  });
  g.setDefaultEdgeLabel(() => ({}));

  for (const node of nodes) {
    g.setNode(node.id, { width: BRAINSTORM_NODE_W, height: BRAINSTORM_NODE_H });
  }

  for (const edge of edges) {
    if (g.hasNode(edge.sourceNodeId) && g.hasNode(edge.targetNodeId)) {
      g.setEdge(edge.sourceNodeId, edge.targetNodeId);
    }
  }

  dagre.layout(g);

  const graphInfo = g.graph();
  const graphWidth = (graphInfo.width ?? canvasWidth) + BRAINSTORM_PADDING * 2;
  const graphHeight = (graphInfo.height ?? canvasHeight) + BRAINSTORM_PADDING * 2;

  const scale = computeAdaptiveScale(
    graphWidth,
    graphHeight,
    canvasWidth,
    canvasHeight,
    BRAINSTORM_PADDING
  );

  const offsetX = (canvasWidth - graphWidth * scale) / 2 + BRAINSTORM_PADDING * scale;
  const offsetY = (canvasHeight - graphHeight * scale) / 2 + BRAINSTORM_PADDING * scale;

  const layoutNodes: LayoutNode[] = nodes.map((node) => {
    const pos = g.node(node.id);
    return {
      id: node.id,
      x: (pos?.x ?? 0) * scale + offsetX,
      y: (pos?.y ?? 0) * scale + offsetY,
      title: node.title,
      type: node.type,
      status: node.status,
      roleId: node.roleId,
      confidence: node.confidence,
      opacity: 1,
    };
  });

  const nodeMap = new Map(layoutNodes.map((n) => [n.id, n]));
  const layoutEdges: LayoutEdge[] = edges
    .filter((e) => nodeMap.has(e.sourceNodeId) && nodeMap.has(e.targetNodeId))
    .map((e) => ({
      from: { x: nodeMap.get(e.sourceNodeId)!.x, y: nodeMap.get(e.sourceNodeId)!.y },
      to: { x: nodeMap.get(e.targetNodeId)!.x, y: nodeMap.get(e.targetNodeId)!.y },
    }));

  return { nodes: layoutNodes, edges: layoutEdges, scale };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * BrainstormWallGraph renders the multi-agent brainstorm session as a
 * dagre-laid-out mind map on a Three.js wall surface.
 */
export function BrainstormWallGraph({
  nodes,
  edges,
  sessionStatus,
}: BrainstormWallGraphProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textureRef = useRef<THREE.CanvasTexture | null>(null);
  const needsRedrawRef = useRef(true);
  const lastRenderTimeRef = useRef<number>(Date.now());
  const fadeNodesRef = useRef<Map<string, { startTime: number }>>(new Map());

  // Compute layout
  const layout = useMemo<LayoutResult | null>(() => {
    if (nodes.length === 0) return null;
    try {
      return computeBrainstormLayout(nodes, edges);
    } catch {
      return null;
    }
  }, [nodes, edges]);

  // Create canvas + texture (once)
  useEffect(() => {
    const canvas = document.createElement("canvas");
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;
    canvasRef.current = canvas;

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    textureRef.current = texture;

    // Initial empty draw
    const ctx = canvas.getContext("2d");
    if (ctx) drawBrainstormGraph(ctx, null);
    texture.needsUpdate = true;

    return () => {
      texture.dispose();
      textureRef.current = null;
      canvasRef.current = null;
    };
  }, []);

  // Mark redraw on layout change
  useEffect(() => {
    needsRedrawRef.current = true;

    // Track new nodes for fade-in
    const now = Date.now();
    for (const node of nodes) {
      const createdAt = new Date(node.createdAt).getTime();
      // Nodes created within the last 500ms are "new"
      if (now - createdAt < 500 && !fadeNodesRef.current.has(node.id)) {
        fadeNodesRef.current.set(node.id, { startTime: now });
      }
    }
    lastRenderTimeRef.current = now;
  }, [layout, nodes]);

  // Per-frame render
  useFrame(() => {
    const canvas = canvasRef.current;
    const texture = textureRef.current;
    if (!canvas || !texture) return;

    // Check if any fade animations are active
    const now = Date.now();
    let hasFading = false;
    for (const [nodeId, fade] of fadeNodesRef.current.entries()) {
      const elapsed = now - fade.startTime;
      if (elapsed < 300) {
        hasFading = true;
      } else {
        fadeNodesRef.current.delete(nodeId);
      }
    }

    if (!needsRedrawRef.current && !hasFading) return;
    needsRedrawRef.current = false;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Apply fade-in opacity to layout nodes
    let drawLayout = layout;
    if (drawLayout && fadeNodesRef.current.size > 0) {
      const fadedNodes = drawLayout.nodes.map((n) => {
        const fade = fadeNodesRef.current.get(n.id);
        if (fade) {
          const elapsed = now - fade.startTime;
          const opacity = Math.min(elapsed / 300, 1);
          return { ...n, opacity };
        }
        return n;
      });
      drawLayout = { ...drawLayout, nodes: fadedNodes };
    }

    drawBrainstormGraph(ctx, drawLayout);
    texture.needsUpdate = true;

    // Ensure mesh material has the texture bound
    if (meshRef.current) {
      const mat = meshRef.current.material as THREE.MeshBasicMaterial;
      if (!mat.map) {
        mat.map = texture;
        mat.needsUpdate = true;
      }
    }
  });

  // Only render when session is active or completed
  if (sessionStatus === "idle") return null;

  return (
    <mesh
      ref={meshRef}
      position={BLUEPRINT_WALL_GRAPH_POSITION}
      receiveShadow
    >
      <planeGeometry
        args={[BLUEPRINT_WALL_GRAPH_BACKING_WIDTH, BLUEPRINT_WALL_GRAPH_BACKING_HEIGHT]}
      />
      <meshBasicMaterial />
    </mesh>
  );
}

/**
 * Connected version that reads from the brainstormGraph store.
 */
export function BrainstormWallGraphConnected() {
  const { nodes, edges, sessionStatus } = useBrainstormGraphStore();
  return (
    <BrainstormWallGraph
      nodes={nodes}
      edges={edges}
      sessionStatus={sessionStatus}
    />
  );
}

export default BrainstormWallGraph;
