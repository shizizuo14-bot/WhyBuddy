/**
 * Zod schemas for validating LLM-generated SPEC Tree responses.
 *
 * See `.kiro/specs/autopilot-spec-tree-llm/design.md` §4.4 for the strict
 * schema contract. These schemas are consumed by the SPEC Tree LLM service
 * and its unit tests.
 *
 * Notes:
 * - Only `import { z } from "zod"` is allowed; no runtime/business imports.
 * - No `.strict()` — zod default strip behavior silently discards unknown
 *   fields (design §2.D8).
 * - No `.transform()`, `z.coerce.*`, or `z.preprocess()` coerce chains
 *   (requirement 3.2).
 * - `.superRefine()` implements 6 tree-level invariants; each violation calls
 *   `ctx.addIssue()` then returns to avoid cascading errors.
 */

import { z } from "zod";

export const NODE_ID_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;

export const SpecTreeLlmNodeSchema = z.object({
  id: z.string().min(1).max(64).regex(NODE_ID_PATTERN),
  parentId: z.string().min(1).max(64).regex(NODE_ID_PATTERN).optional(),
  title: z.string().min(1).max(120),
  summary: z.string().min(1).max(400),
  type: z.enum([
    "root",
    "route_step",
    "alternative_route",
    "spec_document",
    "effect_preview",
    "prompt_package",
    "engineering_plan",
  ]),
  status: z.enum(["seed", "draft", "ready", "accepted"]),
  priority: z.number().int().min(0).max(999),
  routeId: z.string().max(128).optional(),
  routeStepId: z.string().max(128).optional(),
  dependencies: z.array(z.string().max(64)).max(10).default([]),
  outputs: z.array(z.string().min(1).max(200)).max(10).default([]),
  children: z.array(z.string().max(64)).max(50).default([]),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const SpecTreeLlmResponseSchema = z
  .object({
    nodes: z.array(SpecTreeLlmNodeSchema).min(3).max(50),
  })
  .superRefine((data, ctx) => {
    const nodes = data.nodes;

    // 1) All node ids must be unique
    const seen = new Set<string>();
    for (let i = 0; i < nodes.length; i++) {
      if (seen.has(nodes[i].id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["nodes", i, "id"],
          message: `duplicated id="${nodes[i].id}"`,
        });
        return;
      }
      seen.add(nodes[i].id);
    }

    // 2) Exactly 1 root node (type === "root")
    const roots = nodes.filter((n) => n.type === "root");
    if (roots.length !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["nodes"],
        message: `must have exactly 1 root node, found ${roots.length}`,
      });
      return;
    }
    const rootNode = roots[0];
    const rootId = rootNode.id;

    // 3) Non-root nodes must have parentId that resolves to another node
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (n.type === "root") continue;
      if (!n.parentId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["nodes", i, "parentId"],
          message: "non-root node must have parentId",
        });
        return;
      }
      if (!nodeMap.has(n.parentId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["nodes", i, "parentId"],
          message: `parentId="${n.parentId}" does not resolve`,
        });
        return;
      }
    }

    // 4) No self-referencing parentId (no self-loops)
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (n.parentId === n.id) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["nodes", i, "parentId"],
          message: "node cannot be its own parent",
        });
        return;
      }
    }

    // 5) BFS depth from root ≤ 4
    const childrenIndex = new Map<string, string[]>();
    for (const n of nodes) {
      if (n.type === "root") continue;
      if (!n.parentId) continue;
      const list = childrenIndex.get(n.parentId) ?? [];
      list.push(n.id);
      childrenIndex.set(n.parentId, list);
    }

    const queue: Array<{ id: string; depth: number }> = [
      { id: rootId, depth: 1 },
    ];
    const visited = new Set<string>();
    while (queue.length > 0) {
      const { id, depth } = queue.shift()!;
      visited.add(id);
      if (depth > 4) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["nodes"],
          message: `tree depth exceeds 4 at id="${id}"`,
        });
        return;
      }
      for (const childId of childrenIndex.get(id) ?? []) {
        queue.push({ id: childId, depth: depth + 1 });
      }
    }

    // 6) All nodes reachable from root (no disconnected subtrees)
    for (const n of nodes) {
      if (!visited.has(n.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["nodes"],
          message: `node id="${n.id}" not reachable from root`,
        });
        return;
      }
    }
  });

export type SpecTreeLlmResponse = z.infer<typeof SpecTreeLlmResponseSchema>;
export type SpecTreeLlmNode = z.infer<typeof SpecTreeLlmNodeSchema>;
