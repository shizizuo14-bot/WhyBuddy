import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createSpecTreeLlmService, type SpecTreeLlmServiceInput } from "./service.js";
import { createDefaultSpecTreeLlmPolicy } from "./policy.js";
import type { BlueprintServiceContext } from "../context.js";

/**
 * Validates: Requirements 5.3, 9.2
 *
 * 7 sub-tasks:
 *   12.1 Happy path (R9.2 happy)
 *   12.2 Malformed JSON (R9.2 malformed)
 *   12.3 Schema fails (R9.2 schema-fail)
 *   12.4 ApiKey missing (R9.2 apiKey-missing)
 *   12.5 Supplementary: Not enabled
 *   12.6 Supplementary: Timeout
 *   12.7 Supplementary: Redaction E2E
 */

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const validSpecTreePayload = {
  nodes: [
    {
      id: "root",
      title: "SPEC Tree Root",
      summary: "Root node for the spec tree",
      type: "root",
      status: "seed",
      priority: 0,
      dependencies: [],
      outputs: [],
      children: ["step-1", "step-2", "spec-doc"],
    },
    {
      id: "step-1",
      parentId: "root",
      title: "Implement authentication",
      summary: "Set up OAuth2 flow",
      type: "route_step",
      status: "seed",
      priority: 1,
      dependencies: [],
      outputs: ["auth-module"],
      children: [],
    },
    {
      id: "step-2",
      parentId: "root",
      title: "Build dashboard UI",
      summary: "Create React dashboard components",
      type: "route_step",
      status: "seed",
      priority: 2,
      dependencies: ["step-1"],
      outputs: ["dashboard-ui"],
      children: [],
    },
    {
      id: "spec-doc",
      parentId: "root",
      title: "Specification document generation",
      summary: "Generate detailed spec documents",
      type: "spec_document",
      status: "seed",
      priority: 3,
      dependencies: [],
      outputs: [],
      children: [],
    },
  ],
};

function makeInput(overrides?: Partial<SpecTreeLlmServiceInput>): SpecTreeLlmServiceInput {
  return {
    jobId: "job-123",
    job: { id: "job-123", status: "running" } as any,
    request: {
      targetText: "Build a release dashboard",
      githubUrls: ["https://github.com/example/repo"],
      projectId: "proj-1",
      sourceId: "src-1",
    } as any,
    routeSet: {
      id: "routeset-1",
      routes: [
        { id: "route-1", title: "Primary Route", summary: "Main path" },
        { id: "route-2", title: "Alt Route", summary: "Alternative" },
      ],
    } as any,
    primaryRoute: {
      id: "route-1",
      title: "Primary Route",
      summary: "Main execution path",
      steps: [
        { id: "s1", title: "Step 1", description: "First step", role: "planner" },
        { id: "s2", title: "Step 2", description: "Second step", role: "executor" },
      ],
    } as any,
    alternativeRoutes: [
      { id: "route-2", title: "Alt Route", summary: "Alternative" },
    ] as any,
    clarificationSession: {
      id: "cs-1",
      answers: [{ questionId: "q1", answer: "Yes" }],
      locale: "en-US",
    } as any,
    domainContext: { projectId: "proj-1", sourceId: "src-1" },
    createdAt: "2026-05-10T00:00:00.000Z",
    rootNodeId: "pre-allocated-root-id-123",
    ...overrides,
  };
}

function makeCtx(overrides?: Partial<{
  callJson: (...args: unknown[]) => Promise<unknown>;
  getConfig: () => { model: string; apiKey: string };
}>): BlueprintServiceContext {
  return {
    now: () => new Date("2026-05-10T00:00:01.000Z"),
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    llm: {
      callJson: overrides?.callJson ?? (async () => validSpecTreePayload),
      getConfig: overrides?.getConfig ?? (() => ({ model: "gpt-4-turbo", apiKey: "sk-test-valid-key-1234567890" })),
    },
    specTreeLlmPolicy: createDefaultSpecTreeLlmPolicy(),
  } as unknown as BlueprintServiceContext;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SpecTreeLlmService", () => {
  beforeEach(() => {
    process.env.BLUEPRINT_SPEC_TREE_LLM_ENABLED = "true";
  });

  afterEach(() => {
    delete process.env.BLUEPRINT_SPEC_TREE_LLM_ENABLED;
    vi.unstubAllEnvs();
  });

  // 12.1 Happy path (R9.2 happy)
  it("returns llm generationSource with valid nodes on successful LLM response", async () => {
    const ctx = makeCtx();
    const service = createSpecTreeLlmService(ctx);
    const input = makeInput();

    const result = await service(input);

    expect(result.generationSource).toBe("llm");
    expect(result.nodes!.length).toBe(4);
    expect(result.rootNodeId).toBe(input.rootNodeId);
    expect(result.promptId).toBe("blueprint.spec-tree.v1");
    expect(result.structuredPayloadDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(result.error).toBeUndefined();
  });

  // 12.2 Malformed JSON (R9.2 malformed)
  describe("malformed JSON responses", () => {
    it("falls back when callJson returns undefined", async () => {
      const ctx = makeCtx({ callJson: async () => undefined });
      const service = createSpecTreeLlmService(ctx);
      const result = await service(makeInput());

      expect(result.generationSource).toBe("llm_fallback");
      expect(result.error).toMatch(/non-json response/);
      expect(result.nodes).toBeUndefined();
    });

    it("falls back when callJson returns a garbage string", async () => {
      const ctx = makeCtx({ callJson: async () => "garbage string" });
      const service = createSpecTreeLlmService(ctx);
      const result = await service(makeInput());

      expect(result.generationSource).toBe("llm_fallback");
      expect(result.error).toMatch(/non-json response/);
      expect(result.nodes).toBeUndefined();
    });

    it("falls back when callJson returns a number", async () => {
      const ctx = makeCtx({ callJson: async () => 42 });
      const service = createSpecTreeLlmService(ctx);
      const result = await service(makeInput());

      expect(result.generationSource).toBe("llm_fallback");
      expect(result.error).toMatch(/non-json response/);
      expect(result.nodes).toBeUndefined();
    });
  });

  // 12.3 Schema fails (R9.2 schema-fail)
  describe("schema validation failures", () => {
    it("falls back when no root node exists", async () => {
      const noRoot = {
        nodes: [
          { id: "step-a", parentId: "step-b", title: "A", summary: "A", type: "route_step", status: "seed", priority: 0, dependencies: [], outputs: [], children: [] },
          { id: "step-b", parentId: "step-a", title: "B", summary: "B", type: "route_step", status: "seed", priority: 1, dependencies: [], outputs: [], children: [] },
          { id: "step-c", parentId: "step-a", title: "C", summary: "C", type: "route_step", status: "seed", priority: 2, dependencies: [], outputs: [], children: [] },
        ],
      };
      const ctx = makeCtx({ callJson: async () => noRoot });
      const service = createSpecTreeLlmService(ctx);
      const result = await service(makeInput());

      expect(result.generationSource).toBe("llm_fallback");
      expect(result.error).toContain("schema validation failed");
    });

    it("falls back when multiple root nodes exist", async () => {
      const multiRoot = {
        nodes: [
          { id: "root-a", title: "Root A", summary: "A", type: "root", status: "seed", priority: 0, dependencies: [], outputs: [], children: [] },
          { id: "root-b", title: "Root B", summary: "B", type: "root", status: "seed", priority: 1, dependencies: [], outputs: [], children: [] },
          { id: "child-a", parentId: "root-a", title: "Child", summary: "C", type: "route_step", status: "seed", priority: 2, dependencies: [], outputs: [], children: [] },
        ],
      };
      const ctx = makeCtx({ callJson: async () => multiRoot });
      const service = createSpecTreeLlmService(ctx);
      const result = await service(makeInput());

      expect(result.generationSource).toBe("llm_fallback");
      expect(result.error).toContain("schema validation failed");
    });

    it("falls back when duplicate ids exist", async () => {
      const dupIds = {
        nodes: [
          { id: "root", title: "Root", summary: "R", type: "root", status: "seed", priority: 0, dependencies: [], outputs: [], children: [] },
          { id: "dup", parentId: "root", title: "Dup 1", summary: "D1", type: "route_step", status: "seed", priority: 1, dependencies: [], outputs: [], children: [] },
          { id: "dup", parentId: "root", title: "Dup 2", summary: "D2", type: "route_step", status: "seed", priority: 2, dependencies: [], outputs: [], children: [] },
        ],
      };
      const ctx = makeCtx({ callJson: async () => dupIds });
      const service = createSpecTreeLlmService(ctx);
      const result = await service(makeInput());

      expect(result.generationSource).toBe("llm_fallback");
      expect(result.error).toContain("schema validation failed");
    });

    it("falls back when parentId is unresolvable", async () => {
      const badParent = {
        nodes: [
          { id: "root", title: "Root", summary: "R", type: "root", status: "seed", priority: 0, dependencies: [], outputs: [], children: [] },
          { id: "child-a", parentId: "nonexistent", title: "Child", summary: "C", type: "route_step", status: "seed", priority: 1, dependencies: [], outputs: [], children: [] },
          { id: "child-b", parentId: "root", title: "Child B", summary: "CB", type: "route_step", status: "seed", priority: 2, dependencies: [], outputs: [], children: [] },
        ],
      };
      const ctx = makeCtx({ callJson: async () => badParent });
      const service = createSpecTreeLlmService(ctx);
      const result = await service(makeInput());

      expect(result.generationSource).toBe("llm_fallback");
      expect(result.error).toContain("schema validation failed");
    });

    it("falls back when tree depth exceeds 4", async () => {
      // root -> l2 -> l3 -> l4 -> l5 (depth 5)
      const deepTree = {
        nodes: [
          { id: "root", title: "Root", summary: "R", type: "root", status: "seed", priority: 0, dependencies: [], outputs: [], children: ["l2"] },
          { id: "l2", parentId: "root", title: "L2", summary: "L2", type: "route_step", status: "seed", priority: 1, dependencies: [], outputs: [], children: ["l3"] },
          { id: "l3", parentId: "l2", title: "L3", summary: "L3", type: "route_step", status: "seed", priority: 2, dependencies: [], outputs: [], children: ["l4"] },
          { id: "l4", parentId: "l3", title: "L4", summary: "L4", type: "route_step", status: "seed", priority: 3, dependencies: [], outputs: [], children: ["l5"] },
          { id: "l5", parentId: "l4", title: "L5", summary: "L5", type: "route_step", status: "seed", priority: 4, dependencies: [], outputs: [], children: [] },
        ],
      };
      const ctx = makeCtx({ callJson: async () => deepTree });
      const service = createSpecTreeLlmService(ctx);
      const result = await service(makeInput());

      expect(result.generationSource).toBe("llm_fallback");
      expect(result.error).toContain("schema validation failed");
    });

    it("falls back when parent-child cycle exists", async () => {
      const cycle = {
        nodes: [
          { id: "root", title: "Root", summary: "R", type: "root", status: "seed", priority: 0, dependencies: [], outputs: [], children: ["a"] },
          { id: "a", parentId: "b", title: "A", summary: "A", type: "route_step", status: "seed", priority: 1, dependencies: [], outputs: [], children: ["b"] },
          { id: "b", parentId: "a", title: "B", summary: "B", type: "route_step", status: "seed", priority: 2, dependencies: [], outputs: [], children: ["a"] },
        ],
      };
      const ctx = makeCtx({ callJson: async () => cycle });
      const service = createSpecTreeLlmService(ctx);
      const result = await service(makeInput());

      expect(result.generationSource).toBe("llm_fallback");
      expect(result.error).toContain("schema validation failed");
    });

    it("falls back when nodes count is less than 3", async () => {
      const tooFew = {
        nodes: [
          { id: "root", title: "Root", summary: "R", type: "root", status: "seed", priority: 0, dependencies: [], outputs: [], children: ["a"] },
          { id: "a", parentId: "root", title: "A", summary: "A", type: "route_step", status: "seed", priority: 1, dependencies: [], outputs: [], children: [] },
        ],
      };
      const ctx = makeCtx({ callJson: async () => tooFew });
      const service = createSpecTreeLlmService(ctx);
      const result = await service(makeInput());

      expect(result.generationSource).toBe("llm_fallback");
      expect(result.error).toContain("schema validation failed");
    });

    it("falls back when nodes count exceeds 50", async () => {
      // Generate 51 nodes
      const nodes: any[] = [
        { id: "root", title: "Root", summary: "R", type: "root", status: "seed", priority: 0, dependencies: [], outputs: [], children: [] },
      ];
      for (let i = 1; i <= 50; i++) {
        nodes.push({
          id: `node-${i}`,
          parentId: "root",
          title: `Node ${i}`,
          summary: `Summary ${i}`,
          type: "route_step",
          status: "seed",
          priority: i,
          dependencies: [],
          outputs: [],
          children: [],
        });
      }
      const ctx = makeCtx({ callJson: async () => ({ nodes }) });
      const service = createSpecTreeLlmService(ctx);
      const result = await service(makeInput());

      expect(result.generationSource).toBe("llm_fallback");
      expect(result.error).toContain("schema validation failed");
    });

    it("falls back when node id is not kebab-case", async () => {
      const badId = {
        nodes: [
          { id: "root", title: "Root", summary: "R", type: "root", status: "seed", priority: 0, dependencies: [], outputs: [], children: [] },
          { id: "UPPER_CASE", parentId: "root", title: "Bad", summary: "B", type: "route_step", status: "seed", priority: 1, dependencies: [], outputs: [], children: [] },
          { id: "ok-node", parentId: "root", title: "Ok", summary: "O", type: "route_step", status: "seed", priority: 2, dependencies: [], outputs: [], children: [] },
        ],
      };
      const ctx = makeCtx({ callJson: async () => badId });
      const service = createSpecTreeLlmService(ctx);
      const result = await service(makeInput());

      expect(result.generationSource).toBe("llm_fallback");
      expect(result.error).toContain("schema validation failed");
    });
  });

  // 12.4 ApiKey missing (R9.2 apiKey-missing)
  it("returns template generationSource when apiKey is empty and does not call callJson", async () => {
    const callJsonSpy = vi.fn();
    const ctx = makeCtx({
      callJson: callJsonSpy,
      getConfig: () => ({ model: "gpt-4-turbo", apiKey: "" }),
    });
    const service = createSpecTreeLlmService(ctx);
    const result = await service(makeInput());

    expect(result.generationSource).toBe("template");
    expect(callJsonSpy).not.toHaveBeenCalled();
    expect(result.error).toBeUndefined();
    expect(result.promptId).toBeUndefined();
    expect(result.model).toBeUndefined();
  });

  // 12.5 Supplementary: Not enabled
  it("returns template generationSource when BLUEPRINT_SPEC_TREE_LLM_ENABLED is not set", async () => {
    delete process.env.BLUEPRINT_SPEC_TREE_LLM_ENABLED;
    const callJsonSpy = vi.fn();
    const ctx = makeCtx({ callJson: callJsonSpy });
    const service = createSpecTreeLlmService(ctx);
    const result = await service(makeInput());

    expect(result.generationSource).toBe("template");
    expect(callJsonSpy).not.toHaveBeenCalled();
    expect(ctx.logger.debug).toHaveBeenCalled();
  });

  // 12.6 Supplementary: Timeout
  it("falls back with llm timeout error when callJson throws timeout", async () => {
    const ctx = makeCtx({
      callJson: async () => {
        throw new Error("Request aborted due to timeout");
      },
    });
    const service = createSpecTreeLlmService(ctx);
    const result = await service(makeInput());

    expect(result.generationSource).toBe("llm_fallback");
    expect(result.error).toMatch(/llm timeout/);
  });

  // 12.7 Supplementary: Redaction E2E
  it("redacts sensitive API key from error message", async () => {
    const sensitiveKey = "sk-ABCDEFGHIJKLMNOP1234567890";
    const ctx = makeCtx({
      callJson: async () => {
        throw new Error(`Authentication failed with key ${sensitiveKey}`);
      },
    });
    const service = createSpecTreeLlmService(ctx);
    const result = await service(makeInput());

    expect(result.generationSource).toBe("llm_fallback");
    expect(result.error).toBeDefined();
    expect(result.error).not.toContain(sensitiveKey);
  });
});
