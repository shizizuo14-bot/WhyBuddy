/**
 * Brainstorm Graph Store — manages the brainstorm session state for the
 * frontend realtime Wall Graph visualization.
 *
 * Handles brainstorm.* events from the Socket.IO relay:
 * - brainstorm.session.started → reset state, set sessionId/status
 * - brainstorm.node.created → append node, add edge if parentNodeId exists
 * - brainstorm.node.updated → update node status/content/confidence
 * - brainstorm.session.completed → freeze session
 *
 * Enforces bounded queue invariant: max 500 nodes per session (FIFO drop).
 *
 * @see .kiro/specs/autopilot-multi-agent-brainstorm/design.md §7
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6
 */

import { create } from "zustand";

import type {
  BranchNode,
  BranchEdge,
  BranchNodeStatus,
  BranchNodeType,
  BrainstormRoleId,
  CollaborationMode,
} from "@shared/blueprint/brainstorm-contracts";

// Re-export for convenience
export type { BranchNode, BranchEdge };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum number of nodes per active session (FIFO drop). */
export const MAX_BRAINSTORM_NODES = 500;

// ---------------------------------------------------------------------------
// State Shape
// ---------------------------------------------------------------------------

export interface BrainstormSessionMetadata {
  mode: CollaborationMode | null;
  roles: BrainstormRoleId[];
  startedAt: string | null;
  completedAt: string | null;
  totalTokenUsage: number;
}

export type BrainstormSessionStatus =
  | "idle"
  | "active"
  | "synthesizing"
  | "completed"
  | "failed";

export interface BrainstormGraphState {
  sessionId: string | null;
  sessionStatus: BrainstormSessionStatus;
  nodes: BranchNode[];
  edges: BranchEdge[];
  sessionMetadata: BrainstormSessionMetadata;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export interface BrainstormGraphActions {
  /** Handle brainstorm.session.started event */
  handleSessionStarted(payload: {
    sessionId: string;
    mode?: CollaborationMode;
    roles?: BrainstormRoleId[];
  }): void;

  /** Handle brainstorm.node.created event */
  handleNodeCreated(payload: {
    sessionId: string;
    nodeId: string;
    parentNodeId: string | null;
    roleId: BrainstormRoleId;
    nodeType: BranchNodeType;
    status: BranchNodeStatus;
    title?: string;
    sequenceNumber?: number;
  }): void;

  /** Handle brainstorm.node.updated event */
  handleNodeUpdated(payload: {
    sessionId: string;
    nodeId: string;
    status?: BranchNodeStatus;
    content?: string;
    confidence?: number;
    tokenUsage?: number;
  }): void;

  /** Handle brainstorm.session.completed event */
  handleSessionCompleted(payload: {
    sessionId: string;
    tokenUsed?: number;
  }): void;

  /** Handle brainstorm.session.failed event */
  handleSessionFailed(payload: { sessionId: string }): void;

  /** Reset the entire store */
  reset(): void;
}

// ---------------------------------------------------------------------------
// Selectors (standalone functions for external consumption)
// ---------------------------------------------------------------------------

export function selectAllNodes(state: BrainstormGraphState): BranchNode[] {
  return state.nodes;
}

export function selectNodesByRole(
  state: BrainstormGraphState,
  roleId: BrainstormRoleId
): BranchNode[] {
  return state.nodes.filter((n) => n.roleId === roleId);
}

export function selectNodesByStatus(
  state: BrainstormGraphState,
  status: BranchNodeStatus
): BranchNode[] {
  return state.nodes.filter((n) => n.status === status);
}

export function selectSessionMetadata(
  state: BrainstormGraphState
): BrainstormSessionMetadata {
  return state.sessionMetadata;
}

export function selectIsActive(state: BrainstormGraphState): boolean {
  return state.sessionStatus === "active" || state.sessionStatus === "synthesizing";
}

// ---------------------------------------------------------------------------
// Initial State
// ---------------------------------------------------------------------------

export const INITIAL_BRAINSTORM_GRAPH: BrainstormGraphState = {
  sessionId: null,
  sessionStatus: "idle",
  nodes: [],
  edges: [],
  sessionMetadata: {
    mode: null,
    roles: [],
    startedAt: null,
    completedAt: null,
    totalTokenUsage: 0,
  },
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useBrainstormGraphStore = create<
  BrainstormGraphState & BrainstormGraphActions
>((set, get) => ({
  ...INITIAL_BRAINSTORM_GRAPH,

  handleSessionStarted(payload) {
    set({
      sessionId: payload.sessionId,
      sessionStatus: "active",
      nodes: [],
      edges: [],
      sessionMetadata: {
        mode: payload.mode ?? null,
        roles: payload.roles ?? [],
        startedAt: new Date().toISOString(),
        completedAt: null,
        totalTokenUsage: 0,
      },
    });
  },

  handleNodeCreated(payload) {
    const state = get();

    // Reject if session is completed/failed (freeze invariant)
    if (
      state.sessionStatus === "completed" ||
      state.sessionStatus === "failed"
    ) {
      return;
    }

    // Reject if sessionId doesn't match
    if (state.sessionId && payload.sessionId !== state.sessionId) {
      return;
    }

    const now = new Date().toISOString();
    const node: BranchNode = {
      id: payload.nodeId,
      sessionId: payload.sessionId,
      parentNodeId: payload.parentNodeId,
      roleId: payload.roleId,
      type: payload.nodeType,
      status: payload.status ?? "active",
      title: payload.title ?? "",
      createdAt: now,
      updatedAt: now,
      sequenceNumber: payload.sequenceNumber ?? state.nodes.length + 1,
    };

    let nextNodes = [...state.nodes];
    let nextEdges = [...state.edges];

    // Bounded queue enforcement: drop oldest (FIFO)
    if (nextNodes.length >= MAX_BRAINSTORM_NODES) {
      const droppedNode = nextNodes[0];
      nextNodes = nextNodes.slice(1);
      // Remove edges referencing the dropped node
      nextEdges = nextEdges.filter(
        (e) =>
          e.sourceNodeId !== droppedNode.id &&
          e.targetNodeId !== droppedNode.id
      );
    }

    nextNodes.push(node);

    // Add edge if parentNodeId is non-null
    if (payload.parentNodeId) {
      nextEdges.push({
        sourceNodeId: payload.parentNodeId,
        targetNodeId: payload.nodeId,
      });
    }

    set({ nodes: nextNodes, edges: nextEdges });
  },

  handleNodeUpdated(payload) {
    const state = get();

    // Reject if session is completed/failed (freeze invariant)
    if (
      state.sessionStatus === "completed" ||
      state.sessionStatus === "failed"
    ) {
      return;
    }

    // Reject if sessionId doesn't match
    if (state.sessionId && payload.sessionId !== state.sessionId) {
      return;
    }

    const nodeIndex = state.nodes.findIndex((n) => n.id === payload.nodeId);
    if (nodeIndex === -1) return;

    const updatedNode = { ...state.nodes[nodeIndex] };
    if (payload.status !== undefined) updatedNode.status = payload.status;
    if (payload.content !== undefined) updatedNode.content = payload.content;
    if (payload.confidence !== undefined)
      updatedNode.confidence = payload.confidence;
    if (payload.tokenUsage !== undefined)
      updatedNode.tokenUsage = payload.tokenUsage;
    updatedNode.updatedAt = new Date().toISOString();

    const nextNodes = [...state.nodes];
    nextNodes[nodeIndex] = updatedNode;
    set({ nodes: nextNodes });
  },

  handleSessionCompleted(payload) {
    const state = get();
    if (state.sessionId && payload.sessionId !== state.sessionId) return;

    set({
      sessionStatus: "completed",
      sessionMetadata: {
        ...state.sessionMetadata,
        completedAt: new Date().toISOString(),
        totalTokenUsage: payload.tokenUsed ?? state.sessionMetadata.totalTokenUsage,
      },
    });
  },

  handleSessionFailed(payload) {
    const state = get();
    if (state.sessionId && payload.sessionId !== state.sessionId) return;
    set({ sessionStatus: "failed" });
  },

  reset() {
    set(INITIAL_BRAINSTORM_GRAPH);
  },
}));
