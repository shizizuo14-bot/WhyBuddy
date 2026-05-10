import { afterEach, describe, expect, it, vi } from "vitest";

import type { AIConfig } from "../../../core/ai-config.js";
import type {
  BlueprintClarificationSession,
  BlueprintGenerationArtifact,
  BlueprintGenerationJob,
  BlueprintGenerationRequest,
  BlueprintSpecDocument,
  BlueprintSpecDocumentVersionSnapshot,
  BlueprintSpecTreeNode,
} from "../../../../shared/blueprint/index.js";
import { createMemoryBlueprintJobStore } from "../../blueprint.js";

import type { BlueprintLlmDependencies } from "../context.js";
import { buildBlueprintServiceContext } from "../context.js";
import { createSpecDocumentService, createSpecDocumentsLlmService } from "./service.js";
import type { SpecDocumentsLlmServiceInput } from "./service.js";

function makeJob(artifacts: BlueprintGenerationArtifact[]): BlueprintGenerationJob {
  return {
    id: "job-1",
    request: {},
    status: "pending",
    stage: "input",
    version: "v1",
    createdAt: "2026-05-07T00:00:00.000Z",
    updatedAt: "2026-05-07T00:00:00.000Z",
    artifacts,
    events: [],
  };
}

function artifact(
  id: string,
  type: BlueprintGenerationArtifact["type"],
  payload: unknown
): BlueprintGenerationArtifact {
  return {
    id,
    type,
    title: id,
    summary: "",
    createdAt: "2026-05-07T00:00:00.000Z",
    payload,
  };
}

describe("createSpecDocumentService (shell)", () => {
  it("listDocuments 取 requirements / design / tasks 三类 artifact", () => {
    const req = { id: "d-1", type: "requirements" } as unknown as BlueprintSpecDocument;
    const des = { id: "d-2", type: "design" } as unknown as BlueprintSpecDocument;
    const job = makeJob([
      artifact("a-1", "requirements", req),
      artifact("a-2", "design", des),
    ]);
    const jobStore = createMemoryBlueprintJobStore([job]);
    const ctx = buildBlueprintServiceContext({ jobStore });
    const service = createSpecDocumentService(ctx);
    expect(service.listDocuments("job-1").map(d => d.id)).toEqual([
      "d-1",
      "d-2",
    ]);
    expect(service.listDocuments("missing")).toEqual([]);
  });

  it("listVersions 只取 spec_document_version artifact", () => {
    const v = { id: "v-1" } as BlueprintSpecDocumentVersionSnapshot;
    const job = makeJob([artifact("a-1", "spec_document_version", v)]);
    const jobStore = createMemoryBlueprintJobStore([job]);
    const ctx = buildBlueprintServiceContext({ jobStore });
    const service = createSpecDocumentService(ctx);
    expect(service.listVersions("job-1").map(item => item.id)).toEqual(["v-1"]);
  });
});

// ─── createSpecDocumentsLlmService (task 12) ─────────────────────────────────

const ENV_ENABLED = "BLUEPRINT_SPEC_DOCUMENTS_LLM_ENABLED";
const FIXED_TIMESTAMP = "2026-05-07T00:00:00.000Z";

function makeAIConfig(overrides: Partial<AIConfig> = {}): AIConfig {
  return {
    apiKey: "test-key",
    baseUrl: "https://example.test",
    model: "gpt-4-turbo",
    modelReasoningEffort: "medium",
    maxContext: 128000,
    providerName: "example.test",
    wireApi: "chat_completions",
    timeoutMs: 30000,
    stream: false,
    ...overrides,
  };
}

function makeSpyLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function makeRequest(
  overrides: Partial<BlueprintGenerationRequest> = {}
): BlueprintGenerationRequest {
  return {
    projectId: "project-1",
    sourceId: "source-1",
    targetText: "Ship a balanced autopilot planner",
    githubUrls: ["https://github.com/example/repo"],
    clarificationSessionId: "session-1",
    ...overrides,
  };
}

function makeSession(): BlueprintClarificationSession {
  return {
    id: "session-1",
    intakeId: "intake-1",
    projectId: "project-1",
    strategyId: "target_first",
    templateId: "template-1",
    questions: [],
    answers: [],
    readiness: {
      status: "ready",
      score: 1,
      answeredRequired: 1,
      requiredTotal: 1,
      missingQuestionIds: [],
    },
    createdAt: FIXED_TIMESTAMP,
    updatedAt: FIXED_TIMESTAMP,
  };
}

function makeNode(
  overrides: Partial<BlueprintSpecTreeNode> = {}
): BlueprintSpecTreeNode {
  return {
    id: "node-1",
    title: "Autopilot planner",
    summary: "Plan and validate routes for the autopilot system.",
    type: "route_step",
    status: "draft",
    priority: 1,
    dependencies: [],
    outputs: [],
    children: [],
    ...overrides,
  };
}

function makeGenJob(
  request: BlueprintGenerationRequest
): BlueprintGenerationJob {
  return {
    id: "job-1",
    request,
    status: "pending",
    stage: "input",
    version: "v1",
    createdAt: FIXED_TIMESTAMP,
    updatedAt: FIXED_TIMESTAMP,
    artifacts: [],
    events: [],
  };
}

function makeInput(
  overrides: Partial<SpecDocumentsLlmServiceInput> = {}
): SpecDocumentsLlmServiceInput {
  const request = makeRequest();
  return {
    jobId: "job-1",
    job: makeGenJob(request),
    request,
    specTreeNode: makeNode(),
    targetDocumentType: "requirements",
    clarificationSession: makeSession(),
    createdAt: FIXED_TIMESTAMP,
    ...overrides,
  };
}

function makeValidLlmPayload() {
  return {
    title: "Requirements: Autopilot planner",
    summary: "Describes the core requirements for the autopilot planner node.",
    sections: [
      {
        id: "overview",
        title: "Overview",
        summary: "High level context for the planner.",
        body: "The planner coordinates ingestion, scoring, and route selection.",
      },
      {
        id: "functional-requirements",
        title: "Functional Requirements",
        summary: "What the planner must do.",
        body: "It must produce primary and alternative routes on each invocation.",
      },
      {
        id: "acceptance-criteria",
        title: "Acceptance Criteria",
        summary: "How we verify the planner.",
        body: "All routes must include rationale, risk, and cost fields.",
      },
    ],
  };
}

function makeCtx(options: {
  callJson?: BlueprintLlmDependencies["callJson"];
  getConfig?: () => AIConfig;
  logger?: ReturnType<typeof makeSpyLogger>;
}) {
  const callJson =
    options.callJson ??
    (vi.fn() as unknown as BlueprintLlmDependencies["callJson"]);
  const getConfig = options.getConfig ?? (() => makeAIConfig());
  const logger = options.logger ?? makeSpyLogger();
  const ctx = buildBlueprintServiceContext({
    jobStore: createMemoryBlueprintJobStore(),
    llm: { callJson, getConfig },
    logger,
  });
  return { ctx, callJson, getConfig, logger };
}

describe("createSpecDocumentsLlmService", () => {
  afterEach(() => {
    delete process.env[ENV_ENABLED];
    vi.restoreAllMocks();
  });

  // 12.1 Happy path
  it("12.1 happy：generationSource='llm' + digests + content 以 '# {title}' 开头并包含 '## {sectionTitle}'", async () => {
    process.env[ENV_ENABLED] = "true";
    const payload = makeValidLlmPayload();
    const callJson = vi.fn().mockResolvedValue(payload);
    const { ctx } = makeCtx({
      callJson: callJson as unknown as BlueprintLlmDependencies["callJson"],
    });
    const service = createSpecDocumentsLlmService(ctx);

    const result = await service(makeInput());

    expect(result.generationSource).toBe("llm");
    expect(result.title).toBe(payload.title);
    expect(result.summary).toBe(payload.summary);
    expect(result.content).toBeDefined();
    expect(result.content!.startsWith(`# ${payload.title}`)).toBe(true);
    expect(result.content).toContain("## Overview");
    expect(result.content).toContain("## Functional Requirements");
    expect(result.content).toContain("## Acceptance Criteria");
    expect(result.promptId).toBe("blueprint.spec-documents.v1");
    expect(result.responseDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(result.structuredPayloadDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(result.error).toBeUndefined();
    expect(callJson).toHaveBeenCalledTimes(1);
  });

  // 12.2 Malformed JSON
  describe("12.2 malformed：非 JSON / undefined / null / 非 object → llm_fallback + error=/non-json response/", () => {
    it.each([
      ["undefined", undefined],
      ["garbage string", "garbage string" as unknown],
      ["number 42", 42 as unknown],
    ])("fake callJson returns %s → llm_fallback", async (_name, value) => {
      process.env[ENV_ENABLED] = "true";
      const callJson = vi
        .fn()
        .mockResolvedValue(value);
      const { ctx } = makeCtx({
        callJson: callJson as unknown as BlueprintLlmDependencies["callJson"],
      });
      const service = createSpecDocumentsLlmService(ctx);

      const result = await service(makeInput());

      expect(result.generationSource).toBe("llm_fallback");
      expect(result.error).toMatch(/non-json response/);
      expect(result.title).toBeUndefined();
      expect(result.content).toBeUndefined();
      expect(result.promptId).toBe("blueprint.spec-documents.v1");
    });
  });

  // 12.3 Schema fails
  describe("12.3 schema-fail：各类违反 → llm_fallback + error 包含 schema validation failed", () => {
    const mkPayload = (override: Partial<ReturnType<typeof makeValidLlmPayload>>) => ({
      ...makeValidLlmPayload(),
      ...override,
    });

    const cases: Array<{ name: string; payload: unknown }> = [
      { name: "empty sections", payload: mkPayload({ sections: [] }) },
      {
        name: "single section",
        payload: mkPayload({
          sections: [makeValidLlmPayload().sections[0]],
        }),
      },
      {
        name: "21 sections",
        payload: mkPayload({
          sections: Array.from({ length: 21 }, (_, i) => ({
            id: `section-${i}`,
            title: `Section ${i}`,
            summary: `Summary ${i}`,
            body: `Body ${i}`,
          })),
        }),
      },
      {
        name: "empty body",
        payload: mkPayload({
          sections: makeValidLlmPayload().sections.map((s, i) =>
            i === 0 ? { ...s, body: "" } : s
          ),
        }),
      },
      {
        name: "trim-empty body",
        payload: mkPayload({
          sections: makeValidLlmPayload().sections.map((s, i) =>
            i === 0 ? { ...s, body: "   \t\n   " } : s
          ),
        }),
      },
      {
        name: "trim-empty title",
        payload: mkPayload({ title: "   " }),
      },
      {
        name: "duplicated section id (case-insensitive)",
        payload: mkPayload({
          sections: [
            { ...makeValidLlmPayload().sections[0], id: "overview" },
            { ...makeValidLlmPayload().sections[1], id: "overview" },
            makeValidLlmPayload().sections[2],
          ],
        }),
      },
      {
        name: "non-kebab-case id",
        payload: mkPayload({
          sections: makeValidLlmPayload().sections.map((s, i) =>
            i === 0 ? { ...s, id: "SECTION_ONE" } : s
          ),
        }),
      },
      {
        name: "section.body > 8000 chars",
        payload: mkPayload({
          sections: makeValidLlmPayload().sections.map((s, i) =>
            i === 0 ? { ...s, body: "a".repeat(8_001) } : s
          ),
        }),
      },
      {
        name: "unsupported status",
        payload: {
          ...makeValidLlmPayload(),
          status: "archived" as unknown,
        },
      },
      {
        name: "title > 200 chars",
        payload: mkPayload({ title: "t".repeat(201) }),
      },
    ];

    for (const { name, payload } of cases) {
      it(`${name} → llm_fallback`, async () => {
        process.env[ENV_ENABLED] = "true";
        const callJson = vi.fn().mockResolvedValue(payload);
        const { ctx } = makeCtx({
          callJson: callJson as unknown as BlueprintLlmDependencies["callJson"],
        });
        const service = createSpecDocumentsLlmService(ctx);

        const result = await service(makeInput());

        expect(result.generationSource).toBe("llm_fallback");
        expect(result.error).toBeDefined();
        expect(result.error).toMatch(/schema validation failed/i);
        expect(result.title).toBeUndefined();
        expect(result.content).toBeUndefined();
      });
    }
  });

  // 12.4 ApiKey missing
  it("12.4 apiKey-missing：返回 template + callJson 未被调用 + error/promptId/model 均 undefined", async () => {
    process.env[ENV_ENABLED] = "true";
    const callJson = vi.fn();
    const { ctx } = makeCtx({
      callJson: callJson as unknown as BlueprintLlmDependencies["callJson"],
      getConfig: () => makeAIConfig({ apiKey: "" }),
    });
    const service = createSpecDocumentsLlmService(ctx);

    const result = await service(makeInput());

    expect(result.generationSource).toBe("template");
    expect(callJson).not.toHaveBeenCalled();
    expect(result.error).toBeUndefined();
    expect(result.promptId).toBeUndefined();
    expect(result.model).toBeUndefined();
    expect(result.title).toBeUndefined();
    expect(result.content).toBeUndefined();
  });

  // 12.5 Not enabled
  it("12.5 not-enabled：未设 BLUEPRINT_SPEC_DOCUMENTS_LLM_ENABLED → template + callJson 未调用 + logger.debug 被调用", async () => {
    // 不设置 env
    const callJson = vi.fn();
    const logger = makeSpyLogger();
    const { ctx } = makeCtx({
      callJson: callJson as unknown as BlueprintLlmDependencies["callJson"],
      logger,
    });
    const service = createSpecDocumentsLlmService(ctx);

    const result = await service(makeInput());

    expect(result.generationSource).toBe("template");
    expect(callJson).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalled();
  });

  // 12.6 Timeout
  it("12.6 timeout：callJson 抛 '... aborted due to timeout' → llm_fallback + error=/llm timeout/", async () => {
    process.env[ENV_ENABLED] = "true";
    const callJson = vi
      .fn()
      .mockRejectedValue(new Error("Request aborted due to timeout"));
    const { ctx } = makeCtx({
      callJson: callJson as unknown as BlueprintLlmDependencies["callJson"],
    });
    const service = createSpecDocumentsLlmService(ctx);

    const result = await service(makeInput());

    expect(result.generationSource).toBe("llm_fallback");
    expect(result.error).toMatch(/llm timeout/);
  });

  // 12.7 Redaction
  it("12.7 redaction：error 不包含原 sk-... API key 或 email 子串", async () => {
    process.env[ENV_ENABLED] = "true";
    const apiKey = "sk-ABCDEFGHIJKLMNOP1234567890";
    const email = "alice@example.com";
    const callJson = vi
      .fn()
      .mockRejectedValue(
        new Error(`leaked ${apiKey} and ${email} in message`)
      );
    const { ctx } = makeCtx({
      callJson: callJson as unknown as BlueprintLlmDependencies["callJson"],
    });
    const service = createSpecDocumentsLlmService(ctx);

    const result = await service(makeInput());

    expect(result.generationSource).toBe("llm_fallback");
    expect(result.error).toBeDefined();
    expect(result.error).not.toContain(apiKey);
    expect(result.error).not.toContain(email);
  });

  // 12.8 Per-document isolation
  it("12.8 per-document isolation：同一 service 两次调用互不影响 + promptFingerprint 各自独立", async () => {
    process.env[ENV_ENABLED] = "true";
    const callJson = vi
      .fn()
      .mockResolvedValueOnce(makeValidLlmPayload())
      .mockRejectedValueOnce(new Error("second call boom"));
    const { ctx } = makeCtx({
      callJson: callJson as unknown as BlueprintLlmDependencies["callJson"],
    });
    const service = createSpecDocumentsLlmService(ctx);

    const first = await service(makeInput());
    // 第二次使用不同节点确保 promptFingerprint 必然不同（不共享）
    const second = await service(
      makeInput({
        specTreeNode: makeNode({ id: "node-2", title: "Second node" }),
      })
    );

    expect(first.generationSource).toBe("llm");
    expect(second.generationSource).toBe("llm_fallback");
    expect(first.promptFingerprint).toBeDefined();
    expect(second.promptFingerprint).toBeDefined();
    expect(first.promptFingerprint).not.toBe(second.promptFingerprint);
    expect(callJson).toHaveBeenCalledTimes(2);
  });

  // 12.9 Status normalization
  describe("12.9 status normalization", () => {
    it("callJson 返回 status='accepted' → result.status='accepted'", async () => {
      process.env[ENV_ENABLED] = "true";
      const callJson = vi
        .fn()
        .mockResolvedValue({ ...makeValidLlmPayload(), status: "accepted" });
      const { ctx } = makeCtx({
        callJson: callJson as unknown as BlueprintLlmDependencies["callJson"],
      });
      const service = createSpecDocumentsLlmService(ctx);

      const result = await service(makeInput());

      expect(result.generationSource).toBe("llm");
      expect(result.status).toBe("accepted");
    });

    it("callJson 返回无 status 字段 → result.status=undefined", async () => {
      process.env[ENV_ENABLED] = "true";
      const callJson = vi.fn().mockResolvedValue(makeValidLlmPayload());
      const { ctx } = makeCtx({
        callJson: callJson as unknown as BlueprintLlmDependencies["callJson"],
      });
      const service = createSpecDocumentsLlmService(ctx);

      const result = await service(makeInput());

      expect(result.generationSource).toBe("llm");
      expect(result.status).toBeUndefined();
    });
  });

  // 12.10 Logger meta
  it("12.10 logger meta：callJson 抛错 → logger.warn 被调用，meta 含 { promptId, error, nodeId, type }", async () => {
    process.env[ENV_ENABLED] = "true";
    const callJson = vi.fn().mockRejectedValue(new Error("provider fell over"));
    const logger = makeSpyLogger();
    const { ctx } = makeCtx({
      callJson: callJson as unknown as BlueprintLlmDependencies["callJson"],
      logger,
    });
    const service = createSpecDocumentsLlmService(ctx);

    await service(
      makeInput({
        specTreeNode: makeNode({ id: "node-xyz", title: "Observable node" }),
        targetDocumentType: "design",
      })
    );

    expect(logger.warn).toHaveBeenCalled();
    const [, meta] = logger.warn.mock.calls[0];
    expect(meta).toMatchObject({
      promptId: "blueprint.spec-documents.v1",
      nodeId: "node-xyz",
      type: "design",
    });
    expect(typeof (meta as { error?: unknown }).error).toBe("string");
  });
});
