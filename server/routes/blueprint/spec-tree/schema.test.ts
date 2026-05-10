/**
 * Example-based unit tests for SpecTreeLlmResponseSchema.
 *
 * Validates Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 9.2
 */

import { describe, it, expect } from "vitest";
import { SpecTreeLlmResponseSchema, NODE_ID_PATTERN } from "./schema.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Creates a minimal valid node. Override fields as needed. */
function makeNode(overrides: Record<string, unknown> = {}) {
  return {
    id: "node-a",
    parentId: undefined,
    title: "A node",
    summary: "Summary of node A",
    type: "route_step" as const,
    status: "seed" as const,
    priority: 1,
    dependencies: [],
    outputs: [],
    children: [],
    ...overrides,
  };
}

/** Creates a minimal valid payload: root + 1 route_step + 1 spec_document. */
function makeMinimalPayload() {
  return {
    nodes: [
      makeNode({ id: "root", type: "root", title: "Root node", summary: "Root summary" }),
      makeNode({ id: "step-one", parentId: "root", type: "route_step", title: "Step 1", summary: "Step 1 summary" }),
      makeNode({ id: "spec-doc", parentId: "root", type: "spec_document", title: "Spec doc", summary: "Spec doc summary" }),
    ],
  };
}

// ---------------------------------------------------------------------------
// 4.1 合法 minimal payload（3 节点：root + 1 route_step + 1 spec_document）
// ---------------------------------------------------------------------------

describe("SpecTreeLlmResponseSchema", () => {
  describe("4.1 valid minimal payload (3 nodes)", () => {
    it("should pass safeParse with success: true", () => {
      const payload = makeMinimalPayload();
      const result = SpecTreeLlmResponseSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // 4.2 合法 full payload（25 节点，深度 3，涵盖所有 7 种 type 枚举值）
  // -------------------------------------------------------------------------

  describe("4.2 valid full payload (25 nodes, depth 3, all 7 type values)", () => {
    it("should pass safeParse", () => {
      const types = [
        "route_step",
        "alternative_route",
        "spec_document",
        "effect_preview",
        "prompt_package",
        "engineering_plan",
      ] as const;

      // root (depth 1)
      const nodes: Array<Record<string, unknown>> = [
        makeNode({ id: "root", type: "root", title: "Root", summary: "Root summary" }),
      ];

      // 6 children of root (depth 2) — one per non-root type
      for (let i = 0; i < types.length; i++) {
        nodes.push(
          makeNode({
            id: `child-${i}`,
            parentId: "root",
            type: types[i],
            title: `Child ${i}`,
            summary: `Summary ${i}`,
            priority: i * 10,
          })
        );
      }

      // 18 grandchildren (depth 3) — distributed among the 6 children
      for (let i = 0; i < 18; i++) {
        const parentIdx = i % 6;
        nodes.push(
          makeNode({
            id: `grandchild-${i}`,
            parentId: `child-${parentIdx}`,
            type: types[i % types.length],
            title: `Grandchild ${i}`,
            summary: `Summary gc ${i}`,
            priority: 100 + i,
          })
        );
      }

      expect(nodes.length).toBe(25);
      const result = SpecTreeLlmResponseSchema.safeParse({ nodes });
      expect(result.success).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // 4.3 `nodes` 缺失或非数组 → 失败
  // -------------------------------------------------------------------------

  describe("4.3 nodes missing or not an array", () => {
    it("should fail when nodes is missing", () => {
      const result = SpecTreeLlmResponseSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it("should fail when nodes is not an array", () => {
      const result = SpecTreeLlmResponseSchema.safeParse({ nodes: "not-an-array" });
      expect(result.success).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // 4.4 nodes.length < 3 → 失败；nodes.length > 50 → 失败
  // -------------------------------------------------------------------------

  describe("4.4 nodes count boundaries", () => {
    it("should fail when nodes.length < 3 (2 nodes)", () => {
      const payload = {
        nodes: [
          makeNode({ id: "root", type: "root", title: "Root", summary: "Root" }),
          makeNode({ id: "child-a", parentId: "root", type: "route_step", title: "A", summary: "A" }),
        ],
      };
      const result = SpecTreeLlmResponseSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it("should fail when nodes.length > 50 (51 nodes)", () => {
      const nodes: Array<Record<string, unknown>> = [
        makeNode({ id: "root", type: "root", title: "Root", summary: "Root" }),
      ];
      for (let i = 0; i < 50; i++) {
        nodes.push(
          makeNode({
            id: `n-${i}`,
            parentId: "root",
            type: "route_step",
            title: `Node ${i}`,
            summary: `Summary ${i}`,
          })
        );
      }
      expect(nodes.length).toBe(51);
      const result = SpecTreeLlmResponseSchema.safeParse({ nodes });
      expect(result.success).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // 4.5 id 非 kebab-case → 失败
  // -------------------------------------------------------------------------

  describe("4.5 id not kebab-case", () => {
    const invalidIds = [
      { id: "ROOT", reason: "uppercase" },
      { id: "root_1", reason: "underscore" },
      { id: "1root", reason: "starts with digit" },
      { id: "", reason: "empty string" },
      { id: "a".repeat(65), reason: "65 characters (exceeds 64)" },
    ];

    for (const { id, reason } of invalidIds) {
      it(`should fail when id is "${id}" (${reason})`, () => {
        const payload = {
          nodes: [
            makeNode({ id: "root", type: "root", title: "Root", summary: "Root" }),
            makeNode({ id, parentId: "root", type: "route_step", title: "X", summary: "X" }),
            makeNode({ id: "valid-c", parentId: "root", type: "spec_document", title: "C", summary: "C" }),
          ],
        };
        const result = SpecTreeLlmResponseSchema.safeParse(payload);
        expect(result.success).toBe(false);
      });
    }
  });

  // -------------------------------------------------------------------------
  // 4.6 id 在数组内重复 → .superRefine 触发失败，错误消息包含 "duplicated"
  // -------------------------------------------------------------------------

  describe("4.6 duplicated id", () => {
    it("should fail with error message containing 'duplicated'", () => {
      const payload = {
        nodes: [
          makeNode({ id: "root", type: "root", title: "Root", summary: "Root" }),
          makeNode({ id: "step-1", parentId: "root", type: "route_step", title: "S1", summary: "S1" }),
          makeNode({ id: "step-1", parentId: "root", type: "spec_document", title: "S2", summary: "S2" }),
        ],
      };
      const result = SpecTreeLlmResponseSchema.safeParse(payload);
      expect(result.success).toBe(false);
      if (!result.success) {
        const messages = result.error.issues.map((i) => i.message);
        expect(messages.some((m) => m.includes("duplicated"))).toBe(true);
      }
    });
  });

  // -------------------------------------------------------------------------
  // 4.7 0 个 root → 失败；2 个 root → 失败
  // -------------------------------------------------------------------------

  describe("4.7 root count must be exactly 1", () => {
    it("should fail with 0 root nodes, error contains 'must have exactly 1 root'", () => {
      const payload = {
        nodes: [
          makeNode({ id: "step-a", parentId: "step-b", type: "route_step", title: "A", summary: "A" }),
          makeNode({ id: "step-b", parentId: "step-a", type: "route_step", title: "B", summary: "B" }),
          makeNode({ id: "step-c", parentId: "step-a", type: "spec_document", title: "C", summary: "C" }),
        ],
      };
      const result = SpecTreeLlmResponseSchema.safeParse(payload);
      expect(result.success).toBe(false);
      if (!result.success) {
        const messages = result.error.issues.map((i) => i.message);
        expect(messages.some((m) => m.includes("must have exactly 1 root"))).toBe(true);
      }
    });

    it("should fail with 2 root nodes, error contains 'must have exactly 1 root'", () => {
      const payload = {
        nodes: [
          makeNode({ id: "root-a", type: "root", title: "Root A", summary: "A" }),
          makeNode({ id: "root-b", type: "root", title: "Root B", summary: "B" }),
          makeNode({ id: "child-x", parentId: "root-a", type: "route_step", title: "X", summary: "X" }),
        ],
      };
      const result = SpecTreeLlmResponseSchema.safeParse(payload);
      expect(result.success).toBe(false);
      if (!result.success) {
        const messages = result.error.issues.map((i) => i.message);
        expect(messages.some((m) => m.includes("must have exactly 1 root"))).toBe(true);
      }
    });
  });

  // -------------------------------------------------------------------------
  // 4.8 非 root 节点缺 parentId → 失败
  // -------------------------------------------------------------------------

  describe("4.8 non-root node missing parentId", () => {
    it("should fail with error containing 'non-root node must have parentId'", () => {
      const payload = {
        nodes: [
          makeNode({ id: "root", type: "root", title: "Root", summary: "Root" }),
          makeNode({ id: "orphan", parentId: undefined, type: "route_step", title: "Orphan", summary: "Orphan" }),
          makeNode({ id: "child-ok", parentId: "root", type: "spec_document", title: "OK", summary: "OK" }),
        ],
      };
      const result = SpecTreeLlmResponseSchema.safeParse(payload);
      expect(result.success).toBe(false);
      if (!result.success) {
        const messages = result.error.issues.map((i) => i.message);
        expect(messages.some((m) => m.includes("non-root node must have parentId"))).toBe(true);
      }
    });
  });

  // -------------------------------------------------------------------------
  // 4.9 parentId 不可解析（指向不存在的 id）→ 失败
  // -------------------------------------------------------------------------

  describe("4.9 parentId does not resolve", () => {
    it("should fail with error containing 'does not resolve'", () => {
      const payload = {
        nodes: [
          makeNode({ id: "root", type: "root", title: "Root", summary: "Root" }),
          makeNode({ id: "child-a", parentId: "nonexistent", type: "route_step", title: "A", summary: "A" }),
          makeNode({ id: "child-b", parentId: "root", type: "spec_document", title: "B", summary: "B" }),
        ],
      };
      const result = SpecTreeLlmResponseSchema.safeParse(payload);
      expect(result.success).toBe(false);
      if (!result.success) {
        const messages = result.error.issues.map((i) => i.message);
        expect(messages.some((m) => m.includes("does not resolve"))).toBe(true);
      }
    });
  });

  // -------------------------------------------------------------------------
  // 4.10 父子循环 → 失败
  // -------------------------------------------------------------------------

  describe("4.10 parent-child cycle", () => {
    it("should fail when two nodes form a cycle (no root)", () => {
      // This also triggers "must have exactly 1 root" since there's no root node,
      // but the cycle itself is also invalid. The schema returns early on root check.
      const payload = {
        nodes: [
          makeNode({ id: "a", parentId: "b", type: "route_step", title: "A", summary: "A" }),
          makeNode({ id: "b", parentId: "a", type: "route_step", title: "B", summary: "B" }),
          makeNode({ id: "c", parentId: "a", type: "spec_document", title: "C", summary: "C" }),
        ],
      };
      const result = SpecTreeLlmResponseSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it("should fail when tree contains a cycle (a -> b -> a with root present)", () => {
      // root is present, but a and b form a cycle that's disconnected from root
      const payload = {
        nodes: [
          makeNode({ id: "root", type: "root", title: "Root", summary: "Root" }),
          makeNode({ id: "a", parentId: "b", type: "route_step", title: "A", summary: "A" }),
          makeNode({ id: "b", parentId: "a", type: "route_step", title: "B", summary: "B" }),
        ],
      };
      const result = SpecTreeLlmResponseSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // 4.11 树深度 = 5 → 失败
  // -------------------------------------------------------------------------

  describe("4.11 tree depth exceeds 4", () => {
    it("should fail with error containing 'depth exceeds 4'", () => {
      // root (depth 1) -> l1 (depth 2) -> l2 (depth 3) -> l3 (depth 4) -> l4 (depth 5)
      const payload = {
        nodes: [
          makeNode({ id: "root", type: "root", title: "Root", summary: "Root" }),
          makeNode({ id: "l-one", parentId: "root", type: "route_step", title: "L1", summary: "L1" }),
          makeNode({ id: "l-two", parentId: "l-one", type: "route_step", title: "L2", summary: "L2" }),
          makeNode({ id: "l-three", parentId: "l-two", type: "route_step", title: "L3", summary: "L3" }),
          makeNode({ id: "l-four", parentId: "l-three", type: "route_step", title: "L4", summary: "L4" }),
        ],
      };
      const result = SpecTreeLlmResponseSchema.safeParse(payload);
      expect(result.success).toBe(false);
      if (!result.success) {
        const messages = result.error.issues.map((i) => i.message);
        expect(messages.some((m) => m.includes("depth exceeds 4"))).toBe(true);
      }
    });
  });

  // -------------------------------------------------------------------------
  // 4.12 节点不连通于 root → 失败；未知顶层字段 → zod strip 静默丢弃
  // -------------------------------------------------------------------------

  describe("4.12 disconnected subtree and unknown top-level fields", () => {
    it("should fail when a node is not reachable from root (isolated subtree)", () => {
      const payload = {
        nodes: [
          makeNode({ id: "root", type: "root", title: "Root", summary: "Root" }),
          makeNode({ id: "child-a", parentId: "root", type: "route_step", title: "A", summary: "A" }),
          // isolated-b's parentId points to isolated-c, and isolated-c points to isolated-b
          // But let's just make a simple disconnected node whose parent exists but isn't reachable from root
          makeNode({ id: "isolated-b", parentId: "isolated-c", type: "spec_document", title: "B", summary: "B" }),
          makeNode({ id: "isolated-c", parentId: "isolated-b", type: "spec_document", title: "C", summary: "C" }),
        ],
      };
      const result = SpecTreeLlmResponseSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it("should silently strip unknown top-level fields without affecting success", () => {
      const payload = {
        ...makeMinimalPayload(),
        author: "alice",
        extraField: 42,
      };
      const result = SpecTreeLlmResponseSchema.safeParse(payload);
      expect(result.success).toBe(true);
      if (result.success) {
        // The unknown fields should not appear in the parsed data
        expect((result.data as Record<string, unknown>)["author"]).toBeUndefined();
      }
    });
  });
});
