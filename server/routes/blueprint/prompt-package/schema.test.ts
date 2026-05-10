import { describe, it, expect } from "vitest";
import { PromptPackageLlmResponseSchema } from "./schema.js";

/**
 * Helper: builds a minimal valid payload for reuse across tests.
 * Contains 1 prompt + 1 section + empty variables + no examples.
 */
function buildMinimalValidPayload() {
  return {
    title: "Minimal Package",
    summary: "A minimal valid prompt package for testing.",
    prompts: [
      {
        id: "setup-prompt",
        title: "Setup Prompt",
        systemPrompt: "You are a helpful assistant.",
        userPrompt: "Generate the setup code.",
        variables: [],
      },
    ],
    sections: [
      {
        heading: "Overview",
        body: "This section provides an overview of the package.",
      },
    ],
  };
}

describe("PromptPackageLlmResponseSchema", () => {
  // 4.1 合法最小 payload
  it("4.1 accepts minimal valid payload (1 prompt + 1 section + empty variables + no examples)", () => {
    const payload = buildMinimalValidPayload();
    const result = PromptPackageLlmResponseSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  // 4.2 合法最大 payload
  it("4.2 accepts maximal valid payload (12 prompts + 20 sections + 30 variables + 10 examples each)", () => {
    const prompts = Array.from({ length: 12 }, (_, i) => ({
      id: `prompt-${i}`,
      title: `Prompt ${i}`,
      systemPrompt: "System prompt content.",
      userPrompt: "User prompt content.",
      variables: Array.from({ length: 30 }, (_, j) => ({
        name: `var-${i}-${j}`,
        description: `Description for variable ${j}`,
        required: j % 2 === 0,
      })),
      examples: Array.from({ length: 10 }, (_, k) => ({
        title: `Example ${k}`,
        input: `Input ${k}`,
        output: `Output ${k}`,
      })),
    }));
    const sections = Array.from({ length: 20 }, (_, i) => ({
      heading: `Section ${i}`,
      body: `Body content for section ${i}.`,
    }));
    const payload = {
      title: "Maximal Package",
      summary: "A maximal valid prompt package.",
      prompts,
      sections,
    };
    const result = PromptPackageLlmResponseSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  // 4.3 variables required: true 与 required: false 混合使用
  it("4.3 accepts payload with mixed required: true and required: false variables", () => {
    const payload = buildMinimalValidPayload();
    payload.prompts[0].variables = [
      { name: "apiKey", description: "The API key", required: true },
      { name: "timeout", description: "Timeout in ms", required: false },
      { name: "retries", description: "Number of retries", required: true },
    ];
    const result = PromptPackageLlmResponseSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  // 4.4 缺任一必填字段 → 失败
  describe("4.4 missing required top-level fields", () => {
    it("fails when title is missing", () => {
      const { title, ...rest } = buildMinimalValidPayload();
      const result = PromptPackageLlmResponseSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });

    it("fails when summary is missing", () => {
      const { summary, ...rest } = buildMinimalValidPayload();
      const result = PromptPackageLlmResponseSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });

    it("fails when prompts is missing", () => {
      const { prompts, ...rest } = buildMinimalValidPayload();
      const result = PromptPackageLlmResponseSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });

    it("fails when sections is missing", () => {
      const { sections, ...rest } = buildMinimalValidPayload();
      const result = PromptPackageLlmResponseSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });
  });

  // 4.5 prompts 数组边界
  it("4.5 fails when prompts is empty array", () => {
    const payload = { ...buildMinimalValidPayload(), prompts: [] };
    const result = PromptPackageLlmResponseSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it("4.5 fails when prompts has 13 items (exceeds max 12)", () => {
    const prompts = Array.from({ length: 13 }, (_, i) => ({
      id: `prompt-${i}`,
      title: `Prompt ${i}`,
      systemPrompt: "System.",
      userPrompt: "User.",
      variables: [],
    }));
    const payload = { ...buildMinimalValidPayload(), prompts };
    const result = PromptPackageLlmResponseSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  // 4.6 sections 数组边界
  it("4.6 fails when sections is empty array", () => {
    const payload = { ...buildMinimalValidPayload(), sections: [] };
    const result = PromptPackageLlmResponseSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it("4.6 fails when sections has 21 items (exceeds max 20)", () => {
    const sections = Array.from({ length: 21 }, (_, i) => ({
      heading: `Section ${i}`,
      body: `Body ${i}.`,
    }));
    const payload = { ...buildMinimalValidPayload(), sections };
    const result = PromptPackageLlmResponseSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  // 4.7 variables 和 examples 数组边界
  it("4.7 fails when a single prompt has 31 variables (exceeds max 30)", () => {
    const payload = buildMinimalValidPayload();
    payload.prompts[0].variables = Array.from({ length: 31 }, (_, i) => ({
      name: `var-${i}`,
      description: `Desc ${i}`,
      required: true,
    }));
    const result = PromptPackageLlmResponseSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it("4.7 fails when a single prompt has 11 examples (exceeds max 10)", () => {
    const payload = buildMinimalValidPayload();
    (payload.prompts[0] as any).examples = Array.from({ length: 11 }, (_, i) => ({
      title: `Example ${i}`,
      input: `Input ${i}`,
      output: `Output ${i}`,
    }));
    const result = PromptPackageLlmResponseSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  // 4.8 单个 prompt 缺必填字段
  it("4.8 fails when a prompt is missing id / title / systemPrompt / userPrompt / variables", () => {
    const requiredFields = ["id", "title", "systemPrompt", "userPrompt", "variables"];
    for (const field of requiredFields) {
      const payload = buildMinimalValidPayload();
      delete (payload.prompts[0] as any)[field];
      const result = PromptPackageLlmResponseSchema.safeParse(payload);
      expect(result.success).toBe(false);
    }
  });

  // 4.9 variables[*].required 严格 boolean
  it("4.9 fails when variables[*].required is string \"true\"", () => {
    const payload = buildMinimalValidPayload();
    payload.prompts[0].variables = [
      { name: "key", description: "desc", required: "true" as any },
    ];
    const result = PromptPackageLlmResponseSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it("4.9 fails when variables[*].required is number 1", () => {
    const payload = buildMinimalValidPayload();
    payload.prompts[0].variables = [
      { name: "key", description: "desc", required: 1 as any },
    ];
    const result = PromptPackageLlmResponseSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it("4.9 fails when variables[*].required is null", () => {
    const payload = buildMinimalValidPayload();
    payload.prompts[0].variables = [
      { name: "key", description: "desc", required: null as any },
    ];
    const result = PromptPackageLlmResponseSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  // 4.10 超长字符串
  it("4.10 fails for over-length strings (title 201 / summary 501 / systemPrompt 4001 / userPrompt 4001 / body 5001 / variable.name 65 / variable.description 501 / id 129 / heading 201)", () => {
    const cases: Array<{ modify: (p: any) => void }> = [
      { modify: (p) => { p.title = "a".repeat(201); } },
      { modify: (p) => { p.summary = "a".repeat(501); } },
      { modify: (p) => { p.prompts[0].systemPrompt = "a".repeat(4001); } },
      { modify: (p) => { p.prompts[0].userPrompt = "a".repeat(4001); } },
      { modify: (p) => { p.sections[0].body = "a".repeat(5001); } },
      { modify: (p) => { p.prompts[0].variables = [{ name: "a".repeat(65), description: "d", required: true }]; } },
      { modify: (p) => { p.prompts[0].variables = [{ name: "n", description: "a".repeat(501), required: true }]; } },
      { modify: (p) => { p.prompts[0].id = "a".repeat(129); } },
      { modify: (p) => { p.sections[0].heading = "a".repeat(201); } },
    ];
    for (const { modify } of cases) {
      const payload = buildMinimalValidPayload();
      modify(payload);
      const result = PromptPackageLlmResponseSchema.safeParse(payload);
      expect(result.success).toBe(false);
    }
  });

  // 4.11 trim 后全空格 → superRefine 触发失败
  it("4.11 fails for whitespace-only strings after trim, error includes 'must not be empty after trim'", () => {
    const whitespaceCases: Array<{ modify: (p: any) => void }> = [
      { modify: (p) => { p.title = "   "; } },
      { modify: (p) => { p.summary = "  "; } },
      { modify: (p) => { p.prompts[0].systemPrompt = "\n\t"; } },
      { modify: (p) => { p.sections[0].body = "   "; } },
    ];
    for (const { modify } of whitespaceCases) {
      const payload = buildMinimalValidPayload();
      modify(payload);
      const result = PromptPackageLlmResponseSchema.safeParse(payload);
      expect(result.success).toBe(false);
      if (!result.success) {
        const messages = result.error.issues.map((i) => i.message);
        expect(messages.some((m) => m.includes("must not be empty after trim"))).toBe(true);
      }
    }
  });

  // 4.12 prompts[*].id 重复（大小写不敏感）
  it("4.12 fails for duplicated prompt id (case-insensitive), error includes 'duplicated prompt id'", () => {
    const payload = buildMinimalValidPayload();
    payload.prompts = [
      { id: "setup", title: "A", systemPrompt: "S", userPrompt: "U", variables: [] },
      { id: "Setup", title: "B", systemPrompt: "S", userPrompt: "U", variables: [] },
    ];
    payload.sections = [{ heading: "Overview", body: "Body content." }];
    const result = PromptPackageLlmResponseSchema.safeParse(payload);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages.some((m) => m.includes("duplicated prompt id"))).toBe(true);
    }
  });

  // 4.13 同 prompt 内重复 variables[*].name（trim + 大小写不敏感）
  it("4.13 fails for duplicated variable name within same prompt (trim + case-insensitive), error includes 'duplicated variable name'", () => {
    const payload = buildMinimalValidPayload();
    payload.prompts[0].variables = [
      { name: "tenantId", description: "Tenant ID", required: true },
      { name: " tenantid ", description: "Another", required: false },
    ];
    const result = PromptPackageLlmResponseSchema.safeParse(payload);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages.some((m) => m.includes("duplicated variable name"))).toBe(true);
    }
  });

  // 4.14 不同 prompt 之间同名 variables[*].name → 通过
  it("4.14 passes when different prompts share the same variable name (scope is per-prompt)", () => {
    const payload = {
      title: "Multi Prompt Package",
      summary: "Package with shared variable names across prompts.",
      prompts: [
        { id: "prompt-a", title: "A", systemPrompt: "S", userPrompt: "U", variables: [{ name: "id", description: "ID", required: true }] },
        { id: "prompt-b", title: "B", systemPrompt: "S", userPrompt: "U", variables: [{ name: "id", description: "ID", required: true }] },
      ],
      sections: [{ heading: "Overview", body: "Body." }],
    };
    const result = PromptPackageLlmResponseSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  // 4.15 sections[*].heading 重复（大小写不敏感）
  it("4.15 fails for duplicated section heading (case-insensitive), error includes 'duplicated section heading'", () => {
    const payload = buildMinimalValidPayload();
    payload.sections = [
      { heading: "Overview", body: "Body 1." },
      { heading: "overview", body: "Body 2." },
    ];
    const result = PromptPackageLlmResponseSchema.safeParse(payload);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages.some((m) => m.includes("duplicated section heading"))).toBe(true);
    }
  });

  // 4.16 examples[0] 为空 object 或只有全空白字段
  it("4.16 fails when examples[0] is empty object, error includes 'must have at least one non-empty'", () => {
    const payload = buildMinimalValidPayload();
    (payload.prompts[0] as any).examples = [{}];
    const result = PromptPackageLlmResponseSchema.safeParse(payload);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages.some((m) => m.includes("must have at least one non-empty"))).toBe(true);
    }
  });

  it("4.16 fails when examples[0] only has whitespace-only title, error includes 'must have at least one non-empty'", () => {
    const payload = buildMinimalValidPayload();
    (payload.prompts[0] as any).examples = [{ title: "  " }];
    const result = PromptPackageLlmResponseSchema.safeParse(payload);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages.some((m) => m.includes("must have at least one non-empty"))).toBe(true);
    }
  });

  // 4.17 未知字段 → zod strip 静默丢弃，不影响 safeParse.success
  it("4.17 passes with unknown fields (zod strip silently discards them)", () => {
    const payload = {
      ...buildMinimalValidPayload(),
      author: "alice",
    };
    (payload.prompts[0] as any).extraField = "x";
    (payload.sections[0] as any).tags = [];
    const result = PromptPackageLlmResponseSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  // 4.18 ReDoS 哨兵：超长字符串 → 失败且 safeParse 返回时间 < 100ms
  it("4.18 ReDoS sentinel: over-length prompts[0].id (1000 chars) fails within 100ms", () => {
    const payload = buildMinimalValidPayload();
    payload.prompts[0].id = "a".repeat(1000);
    const start = performance.now();
    const result = PromptPackageLlmResponseSchema.safeParse(payload);
    const elapsed = performance.now() - start;
    expect(result.success).toBe(false);
    expect(elapsed).toBeLessThan(100);
  });

  it("4.18 ReDoS sentinel: over-length systemPrompt (10000 chars) fails within 100ms", () => {
    const payload = buildMinimalValidPayload();
    payload.prompts[0].systemPrompt = "a".repeat(10000);
    const start = performance.now();
    const result = PromptPackageLlmResponseSchema.safeParse(payload);
    const elapsed = performance.now() - start;
    expect(result.success).toBe(false);
    expect(elapsed).toBeLessThan(100);
  });
});
