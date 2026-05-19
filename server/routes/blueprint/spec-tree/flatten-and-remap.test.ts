/**
 * Example-based unit tests for flattenAndRemapIds.
 *
 * Validates Requirements 2.6, 3.6:
 * - R2.6: The generator SHALL guarantee the final structure can directly
 *   construct BlueprintSpecTree.nodes / rootNodeId without extra synthesis.
 * - R3.6: After schema validation, normalize fields (trim strings, ensure
 *   arrays, remap IDs) so downstream consumers see valid BlueprintSpecTreeNode[].
 */

import { describe, expect, it } from "vitest";

import type { SpecTreeLlmResponse } from "./schema.js";
import {
  flattenAndRemapIds,
  type FlattenAndRemapInput,
} from "./flatten-and-remap.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeInput(overrides?: Partial<FlattenAndRemapInput>): FlattenAndRemapInput {
  return {
    rootNodeId: "blueprint-spec-node-pre-allocated-root-id",
    primaryRouteId: "route-primary-001",
    ...overrides,
  };
}

function make4NodeResponse(): SpecTreeLlmResponse {
  return {
    nodes: [
      {
        id: "root",
        title: "Project SPEC Tree",
        summary: "Root node for the entire spec tree",
        type: "root",
        status: "seed",
        priority: 0,
        dependencies: [],
        outputs: [],
        children: ["step-1", "step-2"],
      },
      {
        id: "step-1",
        parentId: "root",
        title: "Authentication module",
        summary: "Handles user auth flows",
        type: "route_step",
        status: "draft",
        priority: 1,
        routeStepId: "rs-auth",
        dependencies: [],
        outputs: ["auth-spec"],
        children: ["spec-doc-1"],
      },
      {
        id: "step-2",
        parentId: "root",
        title: "Data layer",
        summary: "Database schema and access patterns",
        type: "route_step",
        status: "seed",
        priority: 2,
        dependencies: [],
        outputs: [],
        children: [],
      },
      {
        id: "spec-doc-1",
        parentId: "step-1",
        title: "Auth specification document",
        summary: "Detailed auth spec",
        type: "spec_document",
        status: "seed",
        priority: 3,
        dependencies: ["step-1"],
        outputs: ["auth-spec-doc"],
        children: [],
      },
    ],
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("flattenAndRemapIds", () => {
  /**
   * 8.1: 4-node payload (root + 2 route_step + 1 spec_document) →
   *   output.rootNodeId === input.rootNodeId, and nodes[0].id === input.rootNodeId
   *
   * **Validates: Requirements 2.6**
   */
  it("8.1 maps rootNodeId from input and places root node first with that id", () => {
    const input = makeInput();
    const response = make4NodeResponse();

    const output = flattenAndRemapIds(response, input);

    expect(output.rootNodeId).toBe(input.rootNodeId);
    expect(output.nodes[0].id).toBe(input.rootNodeId);
    expect(output.nodes).toHaveLength(4);
  });

  /**
   * 8.2: Non-root ids are remapped to createId("blueprint-spec-node") prefix
   *   (assert nodes[i].id.startsWith("blueprint-spec-node"))
   *
   * **Validates: Requirements 3.6**
   */
  it("8.2 remaps non-root node ids to blueprint-spec-node- prefix", () => {
    const input = makeInput();
    const response = make4NodeResponse();

    const output = flattenAndRemapIds(response, input);

    // nodes[0] is root → uses input.rootNodeId (not necessarily the prefix)
    for (let i = 1; i < output.nodes.length; i++) {
      expect(output.nodes[i].id.startsWith("blueprint-spec-node-")).toBe(true);
    }
  });

  /**
   * 8.3: parentId chain is correctly remapped
   *   (assert child node parentId === output.nodes[0].id, i.e. the remapped rootNodeId)
   *
   * **Validates: Requirements 3.6**
   */
  it("8.3 remaps parentId references to use stable platform ids", () => {
    const input = makeInput();
    const response = make4NodeResponse();

    const output = flattenAndRemapIds(response, input);

    // step-1 and step-2 had parentId: "root" → should now point to remapped root id
    const step1 = output.nodes.find((n) => n.title === "Authentication module")!;
    const step2 = output.nodes.find((n) => n.title === "Data layer")!;

    expect(step1.parentId).toBe(output.nodes[0].id);
    expect(step2.parentId).toBe(output.nodes[0].id);

    // spec-doc-1 had parentId: "step-1" → should point to remapped step-1 id
    const specDoc = output.nodes.find((n) => n.title === "Auth specification document")!;
    expect(specDoc.parentId).toBe(step1.id);
  });

  /**
   * 8.4: children array is correctly remapped to stable ids
   *   (assert output.nodes[0].children items all appear in output.nodes[i].id)
   *
   * **Validates: Requirements 3.6**
   */
  it("8.4 remaps children arrays to use stable platform ids", () => {
    const input = makeInput();
    const response = make4NodeResponse();

    const output = flattenAndRemapIds(response, input);

    const allIds = new Set(output.nodes.map((n) => n.id));

    // Root node's children should all be valid node ids in the output
    for (const childId of output.nodes[0].children) {
      expect(allIds.has(childId)).toBe(true);
    }

    // step-1's children should also be valid
    const step1 = output.nodes.find((n) => n.title === "Authentication module")!;
    for (const childId of step1.children) {
      expect(allIds.has(childId)).toBe(true);
    }
  });

  /**
   * 8.5: LLM returns children: ["missing-id"] (not in nodes) →
   *   flatten filters it out, does not crash, does not enter output.nodes[*].children
   *
   * **Validates: Requirements 3.6**
   */
  it("8.5 silently filters children referencing non-existent node ids", () => {
    const input = makeInput();
    const response: SpecTreeLlmResponse = {
      nodes: [
        {
          id: "root",
          title: "Root",
          summary: "Root node",
          type: "root",
          status: "seed",
          priority: 0,
          dependencies: [],
          outputs: [],
          children: ["child-1", "missing-id"],
        },
        {
          id: "child-1",
          parentId: "root",
          title: "Child 1",
          summary: "A valid child",
          type: "route_step",
          status: "draft",
          priority: 1,
          dependencies: [],
          outputs: [],
          children: ["also-missing"],
        },
        {
          id: "child-2",
          parentId: "root",
          title: "Child 2",
          summary: "Another valid child",
          type: "route_step",
          status: "seed",
          priority: 2,
          dependencies: [],
          outputs: [],
          children: [],
        },
      ],
    };

    // Should not throw
    const output = flattenAndRemapIds(response, input);

    // Root's children should only contain the remapped id for "child-1"
    // "missing-id" is not in nodes, so it should be filtered out
    const rootNode = output.nodes[0];
    expect(rootNode.children).toHaveLength(1);

    // The single child in root.children should be the remapped id of "child-1"
    const child1 = output.nodes.find((n) => n.title === "Child 1")!;
    expect(rootNode.children[0]).toBe(child1.id);

    // child-1's children should be empty (["also-missing"] was filtered)
    expect(child1.children).toHaveLength(0);

    // No node in output should have "missing-id" or "also-missing" in its children
    for (const node of output.nodes) {
      for (const childId of node.children) {
        expect(childId).not.toBe("missing-id");
        expect(childId).not.toBe("also-missing");
      }
    }
  });
});
