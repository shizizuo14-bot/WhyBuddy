/**
 * Unit tests for buildPromptPackagePrompt + PROMPT_PACKAGE_PROMPT_ID
 * (autopilot-prompt-package-llm, task 6).
 *
 * Validates:
 *   - requirements.md 2.3 / 2.4 / 3.1 / 3.2 / 9.2
 *   - design.md §4.5
 *   - tasks.md 6.1–6.10
 *
 * Every test case is example-based (NO property-based testing).
 */

import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import type {
  BlueprintCapabilityEvidence,
  BlueprintCapabilityInvocation,
  BlueprintClarificationSession,
  BlueprintEffectPreview,
  BlueprintGenerationJob,
  BlueprintImplementationPromptTargetPlatform,
  BlueprintRouteCandidate,
  BlueprintSpecDocument,
  BlueprintSpecTree,
  BlueprintSpecTreeNode,
} from "../../../../shared/blueprint/index.js";

import {
  buildPromptPackagePrompt,
  BuildPromptPackagePromptInput,
  PROMPT_PACKAGE_PROMPT_ID,
} from "./prompt.js";

// ─── Minimal Fixtures ───────────────────────────────────────────────────────

function makeJob(overrides?: Partial<BlueprintGenerationJob>): BlueprintGenerationJob {
  return {
    id: "job-1",
    request: {
      targetText: "build a dashboard",
      githubUrls: ["https://github.com/org/repo-a", "https://github.com/org/repo-b"],
      projectId: "proj-1",
      sourceId: "src-1",
    },
    status: "running",
    stage: "implementation_prompts",
    version: "1",
    createdAt: "2026-05-10T00:00:00.000Z",
    updatedAt: "2026-05-10T00:00:00.000Z",
    artifacts: [],
    events: [],
    ...overrides,
  } as BlueprintGenerationJob;
}

function makeSpecTree(): BlueprintSpecTree {
  return {
    id: "tree-1",
    routeSetId: "rs-1",
    selectionId: "sel-1",
    selectedRouteId: "route-1",
    rootNodeId: "node-root",
    version: 1,
    status: "active",
    createdAt: "2026-05-10T00:00:00.000Z",
    updatedAt: "2026-05-10T00:00:00.000Z",
    alternativeRouteIds: [],
    nodes: [],
    provenance: {
      jobId: "job-1",
      githubUrls: [],
    },
  } as BlueprintSpecTree;
}

function makeNode(id: string): BlueprintSpecTreeNode {
  return {
    id,
    title: `Node ${id}`,
    summary: `Summary for ${id}`,
    type: "feature",
    status: "active",
    priority: 1,
    dependencies: [],
    outputs: [],
    children: [],
  } as BlueprintSpecTreeNode;
}

function makeDocument(id: string): BlueprintSpecDocument {
  return {
    id,
    jobId: "job-1",
    treeId: "tree-1",
    nodeId: "node-1",
    type: "requirements",
    title: `Doc ${id}`,
    summary: `Summary for doc ${id}`,
    content: `Content for doc ${id}`,
    format: "markdown",
    createdAt: "2026-05-10T00:00:00.000Z",
    provenance: {
      jobId: "job-1",
      githubUrls: [],
      treeVersion: 1,
      nodeType: "feature",
      nodeTitle: "Node",
      nodeSummary: "Summary",
      dependencies: [],
      outputs: [],
    },
  } as BlueprintSpecDocument;
}

function makePreview(id: string): BlueprintEffectPreview {
  return {
    id,
    jobId: "job-1",
    treeId: "tree-1",
    nodeId: "node-1",
    version: 1,
    versionStatus: "current",
    supersedesPreviewId: undefined,
    previousPreviewIds: [],
    preservedPreviewIds: [],
    refreshedFromSpecTreeVersion: 1,
    refreshedAt: "2026-05-10T00:00:00.000Z",
    sourceSnapshotHash: "abc",
    sourceDocumentIds: [],
    status: "ready",
    createdAt: "2026-05-10T00:00:00.000Z",
    summary: `Preview ${id}`,
    architectureNotes: ["note-1"],
    prototypeNotes: [],
    progressPlan: [],
    nodes: [],
    runtimeProjection: {
      id: "rp-1",
      jobId: "job-1",
      routeSetId: "rs-1",
      specTreeId: "tree-1",
      nodeId: "node-1",
      effectPreviewId: id,
      sceneSnapshotId: "ss-1",
      hudState: { id: "hud-1", status: "ready", stage: "implementation_prompts", title: "T", summary: "S", progressPercent: 50, activeNodeId: "node-1", badges: [] },
      logTimeline: [],
      browserPreviewId: "bp-1",
      browserPreview: { id: "bp-1", title: "BP", summary: "S", nodeId: "node-1", url: "http://localhost" },
      sourceIds: {},
    },
    provenance: {
      jobId: "job-1",
      githubUrls: [],
      treeVersion: 1,
      nodeType: "feature",
      nodeTitle: "Node",
      nodeSummary: "Summary",
      sourceStatus: "ready",
      includeDrafts: false,
      sourceDocumentStatuses: {},
    },
  } as unknown as BlueprintEffectPreview;
}

function makeRoute(): BlueprintRouteCandidate {
  return {
    id: "route-primary",
    kind: "primary",
    title: "Primary route",
    summary: "Main route",
    rationale: "Best approach",
    riskLevel: "medium",
    costLevel: "medium",
    complexity: "balanced",
    estimatedEffort: "2 weeks",
    capabilities: [{ id: "cap-1", label: "Cap 1" }],
    steps: [
      { id: "step-c", title: "Step C", description: "Third", role: "engineer", status: "pending" },
      { id: "step-a", title: "Step A", description: "First", role: "planner", status: "ready" },
      { id: "step-b", title: "Step B", description: "Second", role: "reviewer", status: "blocked" },
    ],
    outputs: [],
  } as BlueprintRouteCandidate;
}

function makeClarificationSession(
  answers: Array<{ questionId: string; answer: string }>,
): BlueprintClarificationSession {
  return {
    id: "sess-1",
    intakeId: "intake-1",
    strategyId: "target_first",
    templateId: "target-first-v1",
    questions: [],
    answers: answers.map((a) => ({ questionId: a.questionId, answer: a.answer })),
    readiness: {
      status: "ready",
      score: 1,
      answeredRequired: answers.length,
      requiredTotal: answers.length,
      missingQuestionIds: [],
    },
    createdAt: "2026-05-10T00:00:00.000Z",
    updatedAt: "2026-05-10T00:00:00.000Z",
  } as BlueprintClarificationSession;
}

function makeInvocation(id: string): BlueprintCapabilityInvocation {
  return {
    id,
    jobId: "job-1",
    capabilityId: "cap-1",
    capabilityLabel: `Capability ${id}`,
    kind: "tool",
    status: "completed",
    securityLevel: "standard",
    safetyGate: { approved: true, reason: "auto" },
    requestedAt: "2026-05-10T00:00:00.000Z",
    outputSummary: "Done",
    logs: [],
    evidenceIds: [],
    durationMs: 100,
    provenance: { jobId: "job-1", githubUrls: [] },
  } as unknown as BlueprintCapabilityInvocation;
}

function makeEvidence(id: string): BlueprintCapabilityEvidence {
  return {
    id,
    jobId: "job-1",
    invocationId: "inv-1",
    capabilityId: "cap-1",
    capabilityLabel: `Evidence ${id}`,
    kind: "artifact",
    status: "confirmed",
    title: `Evidence ${id}`,
    summary: `Summary ${id}`,
    createdAt: "2026-05-10T00:00:00.000Z",
    artifacts: [],
    logs: [],
    tags: [],
    payloadSummary: { digest: "abc", byteSize: 100, summary: "payload" },
    provenance: { jobId: "job-1", githubUrls: [] },
  } as unknown as BlueprintCapabilityEvidence;
}

function makeBaseInput(overrides?: Partial<BuildPromptPackagePromptInput>): BuildPromptPackagePromptInput {
  return {
    job: makeJob(),
    specTree: makeSpecTree(),
    targetPlatform: "kiro",
    nodes: [makeNode("node-b"), makeNode("node-a")],
    sourceDocuments: [makeDocument("doc-b"), makeDocument("doc-a")],
    sourcePreviews: [makePreview("prev-b"), makePreview("prev-a")],
    primaryRoute: makeRoute(),
    clarificationSession: makeClarificationSession([
      { questionId: "q-c", answer: "C" },
      { questionId: "q-a", answer: "A" },
      { questionId: "q-b", answer: "B" },
    ]),
    includeDrafts: false,
    includePreviewDrafts: false,
    locale: "en-US",
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("6.1 determinism: identical inputs produce byte-identical output", () => {
  it("produces byte-identical userMessage and promptFingerprint for same inputs", () => {
    const input = makeBaseInput();
    const a = buildPromptPackagePrompt(input);
    const b = buildPromptPackagePrompt(input);

    expect(a.userMessage).toBe(b.userMessage);
    expect(a.promptFingerprint).toBe(b.promptFingerprint);
    expect(a.systemMessage).toBe(b.systemMessage);
  });
});

describe("6.2 input sensitivity: changes in any input cause output changes", () => {
  const baseline = buildPromptPackagePrompt(makeBaseInput());

  it("changes when a node id changes", () => {
    const input = makeBaseInput({ nodes: [makeNode("node-x"), makeNode("node-a")] });
    const result = buildPromptPackagePrompt(input);
    expect(result.userMessage).not.toBe(baseline.userMessage);
    expect(result.promptFingerprint).not.toBe(baseline.promptFingerprint);
  });

  it("changes when a clarification answer changes", () => {
    const input = makeBaseInput({
      clarificationSession: makeClarificationSession([
        { questionId: "q-c", answer: "CHANGED" },
        { questionId: "q-a", answer: "A" },
        { questionId: "q-b", answer: "B" },
      ]),
    });
    const result = buildPromptPackagePrompt(input);
    expect(result.userMessage).not.toBe(baseline.userMessage);
    expect(result.promptFingerprint).not.toBe(baseline.promptFingerprint);
  });

  it("changes when targetPlatform switches", () => {
    const input = makeBaseInput({ targetPlatform: "codex" as BlueprintImplementationPromptTargetPlatform });
    const result = buildPromptPackagePrompt(input);
    expect(result.userMessage).not.toBe(baseline.userMessage);
    expect(result.promptFingerprint).not.toBe(baseline.promptFingerprint);
  });
});

describe("6.3 clarification.answers sorted by questionId lexicographic", () => {
  it("sorts answers [q-c, q-a, q-b] → [q-a, q-b, q-c]", () => {
    const input = makeBaseInput();
    const result = buildPromptPackagePrompt(input);
    const clarification = (result.userPayload as { clarification?: { answers: Array<{ questionId: string }> } }).clarification;
    expect(clarification).toBeDefined();
    expect(clarification!.answers.map((a) => a.questionId)).toEqual(["q-a", "q-b", "q-c"]);
  });
});

describe("6.4 nodes / sourceDocuments / sourcePreviews sorted by id lexicographic", () => {
  it("sorts nodes by id", () => {
    const input = makeBaseInput();
    const result = buildPromptPackagePrompt(input);
    const nodes = (result.userPayload as { nodes: Array<{ id: string }> }).nodes;
    expect(nodes.map((n) => n.id)).toEqual(["node-a", "node-b"]);
  });

  it("sorts sourceDocuments by id", () => {
    const input = makeBaseInput();
    const result = buildPromptPackagePrompt(input);
    const docs = (result.userPayload as { sourceDocuments: Array<{ id: string }> }).sourceDocuments;
    expect(docs.map((d) => d.id)).toEqual(["doc-a", "doc-b"]);
  });

  it("sorts sourcePreviews by id", () => {
    const input = makeBaseInput();
    const result = buildPromptPackagePrompt(input);
    const previews = (result.userPayload as { sourcePreviews: Array<{ id: string }> }).sourcePreviews;
    expect(previews.map((p) => p.id)).toEqual(["prev-a", "prev-b"]);
  });
});

describe("6.5 capabilityInvocations / capabilityEvidence sorted by id lexicographic", () => {
  it("sorts capabilityInvocations by id", () => {
    const input = makeBaseInput({
      capabilityInvocations: [makeInvocation("inv-c"), makeInvocation("inv-a"), makeInvocation("inv-b")],
      capabilityEvidence: [makeEvidence("ev-1")],
    });
    const result = buildPromptPackagePrompt(input);
    const evidence = (result.userPayload as { upstreamEvidence?: { capabilityInvocations?: Array<{ id: string }> } }).upstreamEvidence;
    expect(evidence).toBeDefined();
    expect(evidence!.capabilityInvocations!.map((i) => i.id)).toEqual(["inv-a", "inv-b", "inv-c"]);
  });

  it("sorts capabilityEvidence by id", () => {
    const input = makeBaseInput({
      capabilityInvocations: [makeInvocation("inv-1")],
      capabilityEvidence: [makeEvidence("ev-z"), makeEvidence("ev-a"), makeEvidence("ev-m")],
    });
    const result = buildPromptPackagePrompt(input);
    const evidence = (result.userPayload as { upstreamEvidence?: { capabilityEvidence?: Array<{ id: string }> } }).upstreamEvidence;
    expect(evidence).toBeDefined();
    expect(evidence!.capabilityEvidence!.map((e) => e.id)).toEqual(["ev-a", "ev-m", "ev-z"]);
  });
});

describe("6.6 locale-aware systemMessage", () => {
  it("zh-CN systemMessage contains CJK characters", () => {
    const input = makeBaseInput({ locale: "zh-CN" });
    const result = buildPromptPackagePrompt(input);
    expect(result.systemMessage).toMatch(/[\u4e00-\u9fff]/);
  });

  it("en-US systemMessage does not contain CJK and starts with English", () => {
    const input = makeBaseInput({ locale: "en-US" });
    const result = buildPromptPackagePrompt(input);
    expect(result.systemMessage).not.toMatch(/[\u4e00-\u9fff]/);
    expect(result.systemMessage).toMatch(/^[A-Z]/);
  });
});

describe("6.7 PROMPT_PACKAGE_PROMPT_ID consistency", () => {
  it("PROMPT_PACKAGE_PROMPT_ID equals 'blueprint.prompt-package.v1'", () => {
    expect(PROMPT_PACKAGE_PROMPT_ID).toBe("blueprint.prompt-package.v1");
  });

  it("userPayload.promptId matches PROMPT_PACKAGE_PROMPT_ID", () => {
    const input = makeBaseInput();
    const result = buildPromptPackagePrompt(input);
    expect((result.userPayload as { promptId: string }).promptId).toBe(PROMPT_PACKAGE_PROMPT_ID);
  });
});

describe("6.8 primaryRoute.steps preserve original order; githubUrls preserve input order", () => {
  it("steps in userPayload preserve original order (not sorted)", () => {
    const input = makeBaseInput();
    const result = buildPromptPackagePrompt(input);
    const route = (result.userPayload as { primaryRoute?: { steps: Array<{ id: string }> } }).primaryRoute;
    expect(route).toBeDefined();
    // Original order: step-c, step-a, step-b
    expect(route!.steps.map((s) => s.id)).toEqual(["step-c", "step-a", "step-b"]);
  });

  it("githubUrls preserve input order", () => {
    const input = makeBaseInput();
    const result = buildPromptPackagePrompt(input);
    const intake = (result.userPayload as { intake?: { githubUrls: string[] } }).intake;
    expect(intake).toBeDefined();
    expect(intake!.githubUrls).toEqual([
      "https://github.com/org/repo-a",
      "https://github.com/org/repo-b",
    ]);
  });
});

describe("6.9 missing capabilityInvocations/capabilityEvidence → upstreamEvidence is undefined", () => {
  it("upstreamEvidence is undefined when both are absent", () => {
    const input = makeBaseInput({
      capabilityInvocations: undefined,
      capabilityEvidence: undefined,
    });
    const result = buildPromptPackagePrompt(input);
    expect((result.userPayload as Record<string, unknown>).upstreamEvidence).toBeUndefined();
  });

  it("upstreamEvidence is not an empty object", () => {
    const input = makeBaseInput({
      capabilityInvocations: undefined,
      capabilityEvidence: undefined,
    });
    const result = buildPromptPackagePrompt(input);
    expect(result.userMessage).not.toContain('"upstreamEvidence"');
  });
});

describe("6.10 outputSchema describes prompts length 1..12, sections length 1..20, variables.required: boolean", () => {
  it("outputSchema text mentions prompts length constraints", () => {
    const input = makeBaseInput();
    const result = buildPromptPackagePrompt(input);
    const schema = (result.userPayload as { outputSchema: Record<string, string> }).outputSchema;
    expect(schema.prompts).toContain("1..12");
  });

  it("outputSchema text mentions sections length constraints", () => {
    const input = makeBaseInput();
    const result = buildPromptPackagePrompt(input);
    const schema = (result.userPayload as { outputSchema: Record<string, string> }).outputSchema;
    expect(schema.sections).toContain("1..20");
  });

  it("outputSchema text mentions variables.required: boolean", () => {
    const input = makeBaseInput();
    const result = buildPromptPackagePrompt(input);
    const schema = (result.userPayload as { outputSchema: Record<string, string> }).outputSchema;
    expect(schema.variables).toContain("required");
    expect(schema.variables).toMatch(/boolean/i);
  });

  it("outputSchema text mentions field length upper bounds", () => {
    const input = makeBaseInput();
    const result = buildPromptPackagePrompt(input);
    const schemaStr = JSON.stringify((result.userPayload as { outputSchema: unknown }).outputSchema);
    // Should mention various length bounds
    expect(schemaStr).toContain("1..200");
    expect(schemaStr).toContain("1..500");
    expect(schemaStr).toContain("1..4000");
    expect(schemaStr).toContain("1..5000");
  });
});
