/**
 * Flatten and remap LLM-generated SPEC Tree node IDs to stable platform IDs.
 *
 * This module is a pure transformation layer between the validated LLM response
 * (which uses LLM-assigned placeholder IDs like "root", "step-1", etc.) and
 * the final `BlueprintSpecTreeNode[]` array consumed by `buildSpecTreeFromRouteSet`.
 *
 * Responsibilities:
 * - Build an `idMap: Map<llmId, stableId>` where the root node maps to
 *   `input.rootNodeId` and all other nodes map to `createId("blueprint-spec-node")`.
 * - Produce `BlueprintSpecTreeNode[]` in original array order with `parentId` /
 *   `children` remapped through `idMap`.
 * - Silently filter `children` entries that don't resolve in `idMap` (LLM may
 *   return inconsistent `children` vs `parentId`; flatten uses `parentId` as
 *   the authoritative parent-child relationship).
 * - Defensively ensure `dependencies`, `outputs`, `children` are arrays.
 * - Pass through `metadata` as-is.
 *
 * Only imports:
 * - `randomUUID` from `node:crypto` (for stable ID generation)
 * - Type imports from shared contracts and local schema
 */

import { randomUUID } from "node:crypto";

import type { BlueprintSpecTreeNode } from "../../../../shared/blueprint/contracts.js";
import type { SpecTreeLlmResponse } from "./schema.js";

// ─── Local ID helper (matches codebase pattern) ─────────────────────────────

function createId(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface FlattenAndRemapInput {
  /** The pre-allocated stable ID for the root node */
  rootNodeId: string;
  /** The primary route ID (for potential routeId assignment) */
  primaryRouteId: string;
}

export interface FlattenAndRemapOutput {
  /** Flattened nodes with stable IDs, in original array order */
  nodes: BlueprintSpecTreeNode[];
  /** The stable root node ID (same as input.rootNodeId) */
  rootNodeId: string;
}

// ─── Main function ──────────────────────────────────────────────────────────

/**
 * Flatten the validated LLM response and remap all placeholder IDs to stable
 * platform IDs.
 *
 * @param response - The validated `SpecTreeLlmResponse` (post-zod parse).
 * @param input - Contains `rootNodeId` (pre-allocated) and `primaryRouteId`.
 * @returns `FlattenAndRemapOutput` with remapped nodes and rootNodeId.
 */
export function flattenAndRemapIds(
  response: SpecTreeLlmResponse,
  input: FlattenAndRemapInput,
): FlattenAndRemapOutput {
  const { nodes } = response;

  // Step 1: Build idMap — LLM placeholder id → stable platform id
  const idMap = new Map<string, string>();
  for (const node of nodes) {
    if (node.type === "root") {
      idMap.set(node.id, input.rootNodeId);
    } else {
      idMap.set(node.id, createId("blueprint-spec-node"));
    }
  }

  // Step 2: Produce BlueprintSpecTreeNode[] in original array order
  const outputNodes: BlueprintSpecTreeNode[] = nodes.map((node) => {
    const stableId = idMap.get(node.id)!;

    // Remap parentId through idMap (root has no parentId)
    const remappedParentId = node.parentId
      ? idMap.get(node.parentId)
      : undefined;

    // Remap children through idMap, silently filtering entries not in idMap
    const rawChildren = Array.isArray(node.children) ? node.children : [];
    const remappedChildren = rawChildren
      .map((childId) => idMap.get(childId))
      .filter((id): id is string => id !== undefined);

    // Defensively ensure arrays (schema .default([]) should handle this,
    // but this is a defensive re-confirmation per task 7.3)
    const dependencies = Array.isArray(node.dependencies)
      ? node.dependencies
      : [];
    const outputs = Array.isArray(node.outputs) ? node.outputs : [];

    const result: BlueprintSpecTreeNode = {
      id: stableId,
      title: node.title,
      summary: node.summary,
      type: node.type,
      status: node.status,
      priority: node.priority,
      dependencies,
      outputs,
      children: remappedChildren,
    };

    // Optional fields — only set if present
    if (remappedParentId !== undefined) {
      result.parentId = remappedParentId;
    }
    if (node.routeId !== undefined) {
      result.routeId = node.routeId;
    }
    if (node.routeStepId !== undefined) {
      result.routeStepId = node.routeStepId;
    }
    if (node.metadata !== undefined) {
      result.metadata = node.metadata as Record<
        string,
        string | number | boolean | string[]
      >;
    }

    return result;
  });

  return {
    nodes: outputNodes,
    rootNodeId: input.rootNodeId,
  };
}
