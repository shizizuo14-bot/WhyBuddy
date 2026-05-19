/**
 * Unit tests for createPromptPackageLlmService
 * (autopilot-prompt-package-llm, task 14).
 *
 * Covers task 14.1 – 14.10: 4 hard R9.2 scenarios (happy / malformed /
 * schema-fail / apiKey-missing) + 6 supplementary scenarios (not-enabled /
 * timeout / redaction / per-package isolation / optional examples / logger
 * meta contains targetPlatform).
 *
 * Validates:
 *   - requirements.md 5.3, 9.2, 9.3
 *   - design.md §4.6, §5.1, §6.3
 *   - tasks.md 14.1 – 14.10
 *
 * Every test case is example-based (no PBT in this spec per requirement 9.3).
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  createPromptPackageLlmService,
  type PromptPackageLlmServiceInput,
} from "./service.js";
import { createDefaultPromptPackageLlmPolicy } from "./policy.js";
import type {
  BlueprintServiceContext,
  BlueprintLogger,
  BlueprintLlmDependencies,
} from "../context.js";
import type {
  BlueprintEffectPreview,
  BlueprintGenerationJob,
  BlueprintImplementationPromptTargetPlatform,
  BlueprintSpecDocument,
  BlueprintSpecTree,
  BlueprintSpecTreeNode,
} from "../../../../shared/blueprint/index.js";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

interface FakeLogger extends BlueprintLogger {
  debugCalls: Array<{ message: string; meta?: Record<string, unknown> }>;
  warnCalls: Array<{ message: string; meta?: Record<string, unknown> }>;
}

function createFakeLogger(): FakeLogger {
  const debugCalls: FakeLogger["debugCalls"] = [];
  const warnCalls: FakeLogger["warnCalls"] = [];
  return {
    debug: (message, meta) => {
      debugCalls.push({ message, meta });
    },
    info: () => {},
    warn: (message, meta) => {
      warnCalls.push({ message, meta });
    },
    error: () => {},
    debugCalls,
    warnCalls,
  };
}

interface FakeCtxOverrides {
  callJson?: BlueprintLlmDependencies["callJson"];
  getConfig?: BlueprintLlmDependencies["getConfig"];
  policy?: ReturnType<typeof createDefaultPromptPackageLlmPolicy>;
}

function createFakeCtx(overrides: FakeCtxOverrides = {}): {
  ctx: BlueprintServiceContext;
  logger: FakeLogger;
} {
  const logger = createFakeLogger();
  // Only the fields the service actually reads are wired; the rest of the
  // BlueprintServiceContext surface is intentionally omitted via an `as unknown`
  // cast (mirrors the sibling bridge tests in role-system-architecture).
  const ctx = {
    llm: {
      callJson:
        overrides.callJson ??
        ((async () => ({})) as BlueprintLlmDependencies["callJson"]),
      getConfig:
        overrides.getConfig ??
        (() => ({ model: "gpt-4-turbo", apiKey: "sk-test-key" })),
    },
    logger,
    promptPackageLlmPolicy:
      overrides.policy ?? createDefaultPromptPackageLlmPolicy(),
  } as unknown as BlueprintServiceContext;
  return { ctx, logger };
}

function createMinimalInput(
  overrides: Partial<PromptPackageLlmServiceInput> = {},
): PromptPackageLlmServiceInput {
  const job: BlueprintGenerationJob = {
    id: "job-test-1",
    request: { targetText: "Release dashboard", githubUrls: [] },
  } as unknown as BlueprintGenerationJob;
  const specTree: BlueprintSpecTree = {
    id: "tree-1",
    version: 1,
    nodes: [],
  } as unknown as BlueprintSpecTree;
  const nodes: BlueprintSpecTreeNode[] = [];
  const sourceDocuments: BlueprintSpecDocument[] = [];
  const sourcePreviews: BlueprintEffectPreview[] = [];
  return {
    jobId: "job-test-1",
    job,
    specTree,
    targetPlatform:
      "codex" as BlueprintImplementationPromptTargetPlatform,
    nodes,
    sourceDocuments,
    sourcePreviews,
    includeDrafts: false,
    includePreviewDrafts: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Payload fixtures
// ---------------------------------------------------------------------------

function createValidHappyPayload() {
  return {
    title: "Release Dashboard Implementation Pack (Codex)",
    summary:
      "Codex-ready prompt package for the tenant-scoped release dashboard.",
    prompts: [
      {
        id: "dashboard-root-setup",
        title: "Dashboard root setup",
        systemPrompt:
          "You are a senior web engineer creating the release dashboard root page.",
        userPrompt:
          "Implement the dashboard root page at app/dashboard/page.tsx with tenant scope.",
        variables: [
          { name: "tenantId", description: "Tenant id", required: true },
        ],
        examples: [
          {
            title: "Happy path",
            input: "tenant=acme",
            output: "<DashboardRoot tenantId='acme' />",
          },
        ],
      },
      {
        id: "deploy-feed-widget",
        title: "Deploy feed widget",
        systemPrompt: "You are implementing a realtime deploy feed widget.",
        userPrompt:
          "Create app/dashboard/_components/DeployFeed.tsx with a websocket-backed list.",
        variables: [
          {
            name: "streamEndpoint",
            description: "Webhook stream endpoint",
            required: true,
          },
        ],
      },
    ],
    sections: [
      {
        heading: "Target platform overview",
        body: "Use Codex to execute these prompts.",
      },
      {
        heading: "Source node mapping",
        body: "This package targets release-dashboard nodes.",
      },
      {
        heading: "Verification commands",
        body: "Run `npm test` and `node --run check`.",
      },
    ],
  };
}

function createMinimalValidPrompt(id: string) {
  return {
    id,
    title: `Prompt ${id}`,
    systemPrompt: `System prompt for ${id}.`,
    userPrompt: `User prompt for ${id}.`,
    variables: [
      { name: "tenantId", description: "Tenant id", required: true },
    ],
  };
}

function createMinimalValidSection(heading: string) {
  return { heading, body: `Body for ${heading}.` };
}

// ---------------------------------------------------------------------------
// Tests — env isolation
// ---------------------------------------------------------------------------

describe("createPromptPackageLlmService (task 14)", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // --- 14.1 Happy path (R9.2 happy) ---------------------------------------
  describe("14.1 — happy path (R9.2 happy)", () => {
    beforeEach(() => {
      vi.stubEnv("BLUEPRINT_PROMPT_PACKAGE_LLM_ENABLED", "true");
    });

    it("produces LLM-driven content on valid payload", async () => {
      const payload = createValidHappyPayload();
      const { ctx } = createFakeCtx({
        callJson: async () => payload,
      });
      const service = createPromptPackageLlmService(ctx);
      const result = await service(createMinimalInput());

      expect(result.generationSource).toBe("llm");
      expect(result.renderedTitle).toBe(
        "Release Dashboard Implementation Pack (Codex)",
      );
      expect(result.renderedSummary).toContain("Codex-ready prompt package");
      expect(result.renderedContent).toBeDefined();
      expect(result.renderedContent!.startsWith(`# ${result.renderedTitle!}`)).toBe(
        true,
      );
      expect(result.renderedContent).toContain("## Reusable Prompts");
      expect(result.renderedContent).toContain("dashboard-root-setup");
      expect(result.renderedContent).toContain("deploy-feed-widget");

      expect(result.renderedSections).toBeDefined();
      expect(result.renderedSections!.length).toBe(3);
      expect(result.renderedSections![0].heading).toBe(
        "Target platform overview",
      );
      expect(result.renderedSections![1].heading).toBe("Source node mapping");
      expect(result.renderedSections![2].heading).toBe("Verification commands");

      expect(result.renderedPrompts).toBeDefined();
      expect(result.renderedPrompts!.length).toBe(2);
      expect(result.renderedPrompts![0].id).toBe("dashboard-root-setup");

      expect(result.promptId).toBe("blueprint.prompt-package.v1");
      expect(result.model).toBe("gpt-4-turbo");
      expect(result.responseDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(result.structuredPayloadDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(result.promptFingerprint).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(result.error).toBeUndefined();
    });
  });

  // --- 14.2 Malformed JSON (R9.2 malformed) -------------------------------
  describe("14.2 — malformed JSON (R9.2 malformed)", () => {
    beforeEach(() => {
      vi.stubEnv("BLUEPRINT_PROMPT_PACKAGE_LLM_ENABLED", "true");
    });

    const malformedCases: Array<{
      label: string;
      callJson: BlueprintLlmDependencies["callJson"];
    }> = [
      {
        label: "undefined",
        callJson: (async () => undefined) as BlueprintLlmDependencies["callJson"],
      },
      {
        label: "garbage string",
        callJson: (async () =>
          "garbage string") as unknown as BlueprintLlmDependencies["callJson"],
      },
      {
        label: "numeric 42",
        callJson: (async () => 42) as unknown as BlueprintLlmDependencies["callJson"],
      },
    ];

    for (const { label, callJson } of malformedCases) {
      it(`falls back when callJson returns ${label}`, async () => {
        const { ctx } = createFakeCtx({ callJson });
        const service = createPromptPackageLlmService(ctx);
        const result = await service(createMinimalInput());

        expect(result.generationSource).toBe("llm_fallback");
        expect(result.error).toMatch(/non-json response/);
        expect(result.renderedTitle).toBeUndefined();
        expect(result.renderedSummary).toBeUndefined();
        expect(result.renderedContent).toBeUndefined();
        expect(result.renderedSections).toBeUndefined();
        expect(result.renderedPrompts).toBeUndefined();
        expect(result.promptId).toBe("blueprint.prompt-package.v1");
        expect(result.model).toBe("gpt-4-turbo");
        expect(result.promptFingerprint).toMatch(/^sha256:[a-f0-9]{64}$/);
      });
    }
  });

  // --- 14.3 Schema fails (R9.2 schema-fail, 18 sub-cases) -----------------
  describe("14.3 — schema validation failures (R9.2 schema-fail)", () => {
    beforeEach(() => {
      vi.stubEnv("BLUEPRINT_PROMPT_PACKAGE_LLM_ENABLED", "true");
    });

    function baseValid() {
      return {
        title: "Package title",
        summary: "Package summary.",
        prompts: [createMinimalValidPrompt("main-setup")],
        sections: [createMinimalValidSection("Overview")],
      };
    }

    const schemaCases: Array<{
      label: string;
      buildPayload: () => unknown;
      errorPattern: RegExp;
    }> = [
      {
        label: "(a) missing prompts field",
        buildPayload: () => {
          const payload = baseValid() as Record<string, unknown>;
          delete payload.prompts;
          return payload;
        },
        errorPattern: /schema validation failed|prompts/i,
      },
      {
        label: "(b) prompts array is empty",
        buildPayload: () => ({ ...baseValid(), prompts: [] }),
        errorPattern: /schema validation failed/i,
      },
      {
        label: "(c) sections array is empty",
        buildPayload: () => ({ ...baseValid(), sections: [] }),
        errorPattern: /schema validation failed/i,
      },
      {
        label: "(d) prompts.length = 13",
        buildPayload: () => ({
          ...baseValid(),
          prompts: Array.from({ length: 13 }, (_, i) =>
            createMinimalValidPrompt(`prompt-${i}`),
          ),
        }),
        errorPattern: /schema validation failed/i,
      },
      {
        label: "(e) sections.length = 21",
        buildPayload: () => ({
          ...baseValid(),
          sections: Array.from({ length: 21 }, (_, i) =>
            createMinimalValidSection(`Section ${i}`),
          ),
        }),
        errorPattern: /schema validation failed/i,
      },
      {
        label: "(f) duplicate prompts[*].id",
        buildPayload: () => ({
          ...baseValid(),
          prompts: [
            createMinimalValidPrompt("main-setup"),
            createMinimalValidPrompt("main-setup"),
          ],
        }),
        errorPattern: /duplicated prompt id|schema validation failed/i,
      },
      {
        label: "(g) duplicate variables[*].name within same prompt",
        buildPayload: () => {
          const prompt = createMinimalValidPrompt("main-setup");
          prompt.variables = [
            { name: "tenantId", description: "Tenant id", required: true },
            { name: "tenantId", description: "Duplicate", required: false },
          ];
          return { ...baseValid(), prompts: [prompt] };
        },
        errorPattern: /duplicated variable name|schema validation failed/i,
      },
      {
        label: '(h) variables[*].required = "true" (string)',
        buildPayload: () => {
          const prompt = createMinimalValidPrompt("main-setup");
          (prompt.variables[0] as unknown as Record<string, unknown>).required =
            "true";
          return { ...baseValid(), prompts: [prompt] };
        },
        errorPattern: /schema validation failed/i,
      },
      {
        label: "(i) variables[*].required = 1 (number)",
        buildPayload: () => {
          const prompt = createMinimalValidPrompt("main-setup");
          (prompt.variables[0] as unknown as Record<string, unknown>).required =
            1;
          return { ...baseValid(), prompts: [prompt] };
        },
        errorPattern: /schema validation failed/i,
      },
      {
        label: "(j) systemPrompt > 4000 chars",
        buildPayload: () => {
          const prompt = createMinimalValidPrompt("main-setup");
          prompt.systemPrompt = "a".repeat(4001);
          return { ...baseValid(), prompts: [prompt] };
        },
        errorPattern: /schema validation failed/i,
      },
      {
        label: "(k) userPrompt > 4000 chars",
        buildPayload: () => {
          const prompt = createMinimalValidPrompt("main-setup");
          prompt.userPrompt = "a".repeat(4001);
          return { ...baseValid(), prompts: [prompt] };
        },
        errorPattern: /schema validation failed/i,
      },
      {
        label: "(l) section body > 5000 chars",
        buildPayload: () => ({
          ...baseValid(),
          sections: [
            { heading: "Overview", body: "a".repeat(5001) },
          ],
        }),
        errorPattern: /schema validation failed/i,
      },
      {
        label: "(m) title trims to empty",
        buildPayload: () => ({ ...baseValid(), title: "   " }),
        errorPattern: /must not be empty after trim|schema validation failed/i,
      },
      {
        label: "(n) prompts[0].id trims to empty",
        buildPayload: () => {
          const prompt = createMinimalValidPrompt("main-setup");
          prompt.id = "   ";
          return { ...baseValid(), prompts: [prompt] };
        },
        errorPattern: /must not be empty after trim|schema validation failed/i,
      },
      {
        label: "(o) examples[0] is empty object",
        buildPayload: () => {
          const prompt = createMinimalValidPrompt("main-setup");
          (prompt as unknown as Record<string, unknown>).examples = [{}];
          return { ...baseValid(), prompts: [prompt] };
        },
        errorPattern: /must have at least one non-empty|schema validation failed/i,
      },
      {
        label: "(p) variables.length = 31",
        buildPayload: () => {
          const prompt = createMinimalValidPrompt("main-setup");
          prompt.variables = Array.from({ length: 31 }, (_, i) => ({
            name: `var_${i}`,
            description: `Variable ${i}`,
            required: true,
          }));
          return { ...baseValid(), prompts: [prompt] };
        },
        errorPattern: /schema validation failed/i,
      },
      {
        label: "(q) examples.length = 11",
        buildPayload: () => {
          const prompt = createMinimalValidPrompt("main-setup");
          (prompt as unknown as Record<string, unknown>).examples =
            Array.from({ length: 11 }, (_, i) => ({
              title: `Example ${i}`,
              input: `input-${i}`,
              output: `output-${i}`,
            }));
          return { ...baseValid(), prompts: [prompt] };
        },
        errorPattern: /schema validation failed/i,
      },
      {
        label: "(r) duplicate section headings (case-insensitive)",
        buildPayload: () => ({
          ...baseValid(),
          sections: [
            createMinimalValidSection("Overview"),
            createMinimalValidSection("overview"),
          ],
        }),
        errorPattern: /duplicated section heading|schema validation failed/i,
      },
    ];

    for (const { label, buildPayload, errorPattern } of schemaCases) {
      it(`falls back when schema validation fails: ${label}`, async () => {
        const { ctx } = createFakeCtx({
          callJson: (async () =>
            buildPayload()) as unknown as BlueprintLlmDependencies["callJson"],
        });
        const service = createPromptPackageLlmService(ctx);
        const result = await service(createMinimalInput());

        expect(result.generationSource).toBe("llm_fallback");
        expect(result.error).toBeDefined();
        expect(result.error!).toMatch(errorPattern);
        expect(result.promptId).toBe("blueprint.prompt-package.v1");
        expect(result.model).toBe("gpt-4-turbo");
        expect(result.promptFingerprint).toMatch(/^sha256:[a-f0-9]{64}$/);
        expect(result.renderedTitle).toBeUndefined();
        expect(result.renderedSummary).toBeUndefined();
        expect(result.renderedContent).toBeUndefined();
        expect(result.renderedSections).toBeUndefined();
        expect(result.renderedPrompts).toBeUndefined();
      });
    }
  });

  // --- 14.4 ApiKey missing (R9.2 apiKey-missing) --------------------------
  describe("14.4 — apiKey missing (R9.2 apiKey-missing)", () => {
    beforeEach(() => {
      vi.stubEnv("BLUEPRINT_PROMPT_PACKAGE_LLM_ENABLED", "true");
    });

    it("returns template generationSource without calling callJson", async () => {
      const callJsonSpy = vi.fn(async () => ({}));
      const { ctx } = createFakeCtx({
        callJson: callJsonSpy as unknown as BlueprintLlmDependencies["callJson"],
        getConfig: () => ({ model: "gpt-4-turbo", apiKey: "" }),
      });
      const service = createPromptPackageLlmService(ctx);
      const result = await service(createMinimalInput());

      expect(result.generationSource).toBe("template");
      expect(callJsonSpy).not.toHaveBeenCalled();
      expect(result.error).toBeUndefined();
      expect(result.promptId).toBeUndefined();
      expect(result.model).toBeUndefined();
      expect(result.renderedTitle).toBeUndefined();
      expect(result.renderedSummary).toBeUndefined();
      expect(result.renderedContent).toBeUndefined();
      expect(result.renderedSections).toBeUndefined();
      expect(result.renderedPrompts).toBeUndefined();
      expect(result.promptFingerprint).toBeUndefined();
    });
  });

  // --- 14.5 Not enabled (supplementary) -----------------------------------
  describe("14.5 — not enabled (supplementary)", () => {
    it("returns template generationSource without calling callJson", async () => {
      // Explicitly stub to empty so the check becomes `!== "true"`.
      vi.stubEnv("BLUEPRINT_PROMPT_PACKAGE_LLM_ENABLED", "");
      const callJsonSpy = vi.fn(async () => ({}));
      const { ctx, logger } = createFakeCtx({
        callJson: callJsonSpy as unknown as BlueprintLlmDependencies["callJson"],
      });
      const service = createPromptPackageLlmService(ctx);
      const result = await service(createMinimalInput());

      expect(result.generationSource).toBe("template");
      expect(callJsonSpy).not.toHaveBeenCalled();
      expect(logger.debugCalls.length).toBeGreaterThanOrEqual(1);
      expect(
        logger.debugCalls.some((entry) => entry.message.includes("not enabled")),
      ).toBe(true);
    });
  });

  // --- 14.6 Timeout (supplementary) ---------------------------------------
  describe("14.6 — timeout (supplementary)", () => {
    beforeEach(() => {
      vi.stubEnv("BLUEPRINT_PROMPT_PACKAGE_LLM_ENABLED", "true");
    });

    it("maps timeout/abort errors to the llm_fallback path with 'llm timeout'", async () => {
      const { ctx } = createFakeCtx({
        callJson: (async () => {
          throw new Error("Request aborted due to timeout");
        }) as unknown as BlueprintLlmDependencies["callJson"],
      });
      const service = createPromptPackageLlmService(ctx);
      const result = await service(createMinimalInput());

      expect(result.generationSource).toBe("llm_fallback");
      expect(result.error).toMatch(/llm timeout/);
    });
  });

  // --- 14.7 Redaction E2E (supplementary) ---------------------------------
  describe("14.7 — redaction E2E (supplementary)", () => {
    beforeEach(() => {
      vi.stubEnv("BLUEPRINT_PROMPT_PACKAGE_LLM_ENABLED", "true");
    });

    it("redacts API keys and GitHub PATs from the error message", async () => {
      const sensitive =
        "connection failed to sk-ABCDEFGHIJKLMNOP1234567890 and also ghp_abcdefghijklmnopqrstuvwxyz0123456789";
      const { ctx } = createFakeCtx({
        callJson: (async () => {
          throw new Error(sensitive);
        }) as unknown as BlueprintLlmDependencies["callJson"],
      });
      const service = createPromptPackageLlmService(ctx);
      const result = await service(createMinimalInput());

      expect(result.generationSource).toBe("llm_fallback");
      expect(result.error).toBeDefined();
      expect(result.error!).not.toContain("sk-ABCDEFGHIJKLMNOP1234567890");
      expect(result.error!).not.toContain(
        "ghp_abcdefghijklmnopqrstuvwxyz0123456789",
      );
    });
  });

  // --- 14.8 Per-package isolation (supplementary) -------------------------
  describe("14.8 — per-package isolation (supplementary)", () => {
    beforeEach(() => {
      vi.stubEnv("BLUEPRINT_PROMPT_PACKAGE_LLM_ENABLED", "true");
    });

    it("two sequential calls stay independent across targetPlatforms", async () => {
      const validPayload = createValidHappyPayload();
      const callJson = vi
        .fn()
        .mockImplementationOnce(async () => validPayload)
        .mockImplementationOnce(async () => {
          throw new Error("downstream failure");
        });
      const { ctx } = createFakeCtx({
        callJson: callJson as unknown as BlueprintLlmDependencies["callJson"],
      });
      const service = createPromptPackageLlmService(ctx);

      const first = await service(
        createMinimalInput({
          targetPlatform: "codex",
        }),
      );
      const second = await service(
        createMinimalInput({
          targetPlatform: "claude",
        }),
      );

      expect(first.generationSource).toBe("llm");
      expect(first.error).toBeUndefined();
      expect(first.renderedTitle).toBe(
        "Release Dashboard Implementation Pack (Codex)",
      );

      expect(second.generationSource).toBe("llm_fallback");
      expect(second.error).toBeDefined();
      expect(second.error!).toContain("downstream failure");

      // First result is NOT poisoned by the second failure.
      expect(first.generationSource).toBe("llm");
      expect(first.renderedContent).toBeDefined();
    });
  });

  // --- 14.9 Examples optional (supplementary) -----------------------------
  describe("14.9 — examples optional (supplementary)", () => {
    beforeEach(() => {
      vi.stubEnv("BLUEPRINT_PROMPT_PACKAGE_LLM_ENABLED", "true");
    });

    it("normalizes missing examples field to an empty array", async () => {
      const payload = {
        title: "Title",
        summary: "Summary.",
        prompts: [
          {
            id: "setup",
            title: "Setup prompt",
            systemPrompt: "System prompt content.",
            userPrompt: "User prompt content.",
            variables: [
              { name: "tenantId", description: "Tenant id", required: true },
            ],
            // Intentionally no `examples` field.
          },
        ],
        sections: [
          { heading: "Overview", body: "Overview body." },
        ],
      };
      const { ctx } = createFakeCtx({
        callJson: (async () =>
          payload) as unknown as BlueprintLlmDependencies["callJson"],
      });
      const service = createPromptPackageLlmService(ctx);
      const result = await service(createMinimalInput());

      expect(result.generationSource).toBe("llm");
      expect(result.renderedPrompts).toBeDefined();
      expect(result.renderedPrompts!.length).toBe(1);
      expect(result.renderedPrompts![0].examples).toEqual([]);
    });
  });

  // --- 14.10 Logger meta contains targetPlatform (supplementary) ----------
  describe("14.10 — logger meta contains targetPlatform (supplementary)", () => {
    it("14.10a warn scenarios include targetPlatform + promptId meta", async () => {
      vi.stubEnv("BLUEPRINT_PROMPT_PACKAGE_LLM_ENABLED", "true");
      const { ctx, logger } = createFakeCtx({
        callJson: (async () => {
          throw new Error("Request aborted due to timeout");
        }) as unknown as BlueprintLlmDependencies["callJson"],
      });
      const service = createPromptPackageLlmService(ctx);
      const result = await service(createMinimalInput());

      expect(result.generationSource).toBe("llm_fallback");
      expect(logger.warnCalls.length).toBeGreaterThanOrEqual(1);
      const firstWarn = logger.warnCalls[0];
      expect(firstWarn.meta).toBeDefined();
      expect(firstWarn.meta).toHaveProperty("targetPlatform");
      expect(firstWarn.meta).toHaveProperty("promptId");
    });

    it("14.10b debug scenarios include targetPlatform meta (tier 1)", async () => {
      vi.stubEnv("BLUEPRINT_PROMPT_PACKAGE_LLM_ENABLED", "");
      const { ctx, logger } = createFakeCtx();
      const service = createPromptPackageLlmService(ctx);
      const result = await service(createMinimalInput());

      expect(result.generationSource).toBe("template");
      expect(logger.debugCalls.length).toBeGreaterThanOrEqual(1);
      const firstDebug = logger.debugCalls[0];
      expect(firstDebug.meta).toBeDefined();
      expect(firstDebug.meta).toHaveProperty("targetPlatform");
    });
  });
});
