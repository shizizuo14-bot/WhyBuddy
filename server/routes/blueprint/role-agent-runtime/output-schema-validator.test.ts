/**
 * `autopilot-role-autonomous-agent` spec Task 10.3：output schema validator 单测。
 *
 * 覆盖最小 JSON Schema 校验器的关键分支：undefined schema、null/undefined
 * output、各 primitive type、object 结构、required / properties 递归，以及
 * 三类主要产物（BlueprintRouteSet / BlueprintClarificationSession /
 * BlueprintSpecTree）的最小 schema 用例。
 *
 * 禁止 PBT：example-based only。
 */

import { describe, expect, it } from "vitest";

import { validateAgentOutput } from "./output-schema-validator.js";

describe("validateAgentOutput - schema 未提供", () => {
  it("schema 为 undefined → 通过", () => {
    const result = validateAgentOutput({ anything: "goes" }, undefined);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("schema 为 undefined 且 output 为 null → 仍然通过（无 schema 不做任何约束）", () => {
    const result = validateAgentOutput(null, undefined);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });
});

describe("validateAgentOutput - null / undefined output", () => {
  it("output 为 null + schema 存在 → invalid", () => {
    const result = validateAgentOutput(null, { type: "object" });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("output_is_null_or_undefined");
  });

  it("output 为 undefined + schema 存在 → invalid", () => {
    const result = validateAgentOutput(undefined, { type: "object" });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("output_is_null_or_undefined");
  });
});

describe("validateAgentOutput - type: object", () => {
  it("合法 object → 通过", () => {
    const result = validateAgentOutput(
      { id: "r1", name: "route" },
      { type: "object" },
    );
    expect(result.valid).toBe(true);
  });

  it("array 不被视为 object → invalid", () => {
    const result = validateAgentOutput([], { type: "object" });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("expected object"))).toBe(true);
  });

  it("primitive 不被视为 object → invalid", () => {
    const result = validateAgentOutput("hello", { type: "object" });
    expect(result.valid).toBe(false);
  });

  it("required key 缺失 → invalid，错误含 key 名", () => {
    const result = validateAgentOutput(
      { id: "r1" },
      { type: "object", required: ["id", "name"] },
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("name"))).toBe(true);
  });

  it("required key 为 undefined → invalid", () => {
    const result = validateAgentOutput(
      { id: "r1", name: undefined },
      { type: "object", required: ["id", "name"] },
    );
    expect(result.valid).toBe(false);
  });

  it("required keys 全部存在 → 通过", () => {
    const result = validateAgentOutput(
      { id: "r1", name: "route" },
      { type: "object", required: ["id", "name"] },
    );
    expect(result.valid).toBe(true);
  });

  it("required 非数组 → 视为未声明，通过", () => {
    const result = validateAgentOutput(
      { id: "r1" },
      { type: "object", required: "not-an-array" },
    );
    expect(result.valid).toBe(true);
  });
});

describe("validateAgentOutput - type: array", () => {
  it("array 通过", () => {
    expect(validateAgentOutput([1, 2, 3], { type: "array" }).valid).toBe(true);
  });

  it("object 不是 array → invalid", () => {
    const result = validateAgentOutput({}, { type: "array" });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("expected array"))).toBe(true);
  });

  it("空数组 → 通过", () => {
    expect(validateAgentOutput([], { type: "array" }).valid).toBe(true);
  });
});

describe("validateAgentOutput - 基本 primitives", () => {
  it("type: string 成功", () => {
    expect(validateAgentOutput("hello", { type: "string" }).valid).toBe(true);
  });

  it("type: string 但传入 number → invalid", () => {
    const result = validateAgentOutput(42, { type: "string" });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("expected string"))).toBe(
      true,
    );
  });

  it("type: number 成功", () => {
    expect(validateAgentOutput(3.14, { type: "number" }).valid).toBe(true);
  });

  it("type: number 但传入 string → invalid", () => {
    const result = validateAgentOutput("not-a-number", { type: "number" });
    expect(result.valid).toBe(false);
  });

  it("type: boolean 成功", () => {
    expect(validateAgentOutput(true, { type: "boolean" }).valid).toBe(true);
    expect(validateAgentOutput(false, { type: "boolean" }).valid).toBe(true);
  });

  it("type: boolean 但传入 string → invalid", () => {
    const result = validateAgentOutput("true", { type: "boolean" });
    expect(result.valid).toBe(false);
  });
});

describe("validateAgentOutput - 未识别的 type 保守通过", () => {
  it("type: unknown → 通过", () => {
    const result = validateAgentOutput(
      { foo: "bar" },
      { type: "some-future-type" },
    );
    expect(result.valid).toBe(true);
  });

  it("缺失 type → 通过", () => {
    const result = validateAgentOutput({ foo: "bar" }, { required: ["foo"] });
    expect(result.valid).toBe(true);
  });
});

describe("validateAgentOutput - properties 递归", () => {
  const nestedSchema: Record<string, unknown> = {
    type: "object",
    required: ["meta"],
    properties: {
      meta: {
        type: "object",
        required: ["version"],
        properties: {
          version: { type: "number" },
          label: { type: "string" },
        },
      },
    },
  };

  it("嵌套结构合法 → 通过", () => {
    const result = validateAgentOutput(
      { meta: { version: 1, label: "alpha" } },
      nestedSchema,
    );
    expect(result.valid).toBe(true);
  });

  it("嵌套 required 缺失 → invalid", () => {
    const result = validateAgentOutput(
      { meta: { label: "alpha" } },
      nestedSchema,
    );
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.includes("meta.version")),
    ).toBe(true);
  });

  it("嵌套 property 类型错误 → invalid", () => {
    const result = validateAgentOutput(
      { meta: { version: "v1" } },
      nestedSchema,
    );
    expect(result.valid).toBe(false);
    expect(
      result.errors.some(
        (e) =>
          e.includes("meta.version") && e.includes("expected number"),
      ),
    ).toBe(true);
  });

  it("未声明的 extra property → 不校验（保守通过）", () => {
    const result = validateAgentOutput(
      { meta: { version: 1 }, extra: "ignored" },
      nestedSchema,
    );
    expect(result.valid).toBe(true);
  });
});

describe("validateAgentOutput - BlueprintRouteSet-like schema", () => {
  const routeSetSchema: Record<string, unknown> = {
    type: "object",
    required: ["id", "name", "routes"],
    properties: {
      id: { type: "string" },
      name: { type: "string" },
      routes: { type: "array" },
    },
  };

  it("合法 RouteSet 输出 → 通过", () => {
    const result = validateAgentOutput(
      {
        id: "rs-1",
        name: "demo routes",
        routes: [
          { id: "r-1", steps: [] },
          { id: "r-2", steps: [] },
        ],
      },
      routeSetSchema,
    );
    expect(result.valid).toBe(true);
  });

  it("缺失 routes → invalid", () => {
    const result = validateAgentOutput(
      { id: "rs-1", name: "demo" },
      routeSetSchema,
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("routes"))).toBe(true);
  });

  it("routes 传入 object 而非 array → invalid", () => {
    const result = validateAgentOutput(
      { id: "rs-1", name: "demo", routes: { wrong: "shape" } },
      routeSetSchema,
    );
    expect(result.valid).toBe(false);
    expect(
      result.errors.some(
        (e) => e.includes("routes") && e.includes("expected array"),
      ),
    ).toBe(true);
  });
});

describe("validateAgentOutput - BlueprintClarificationSession-like schema", () => {
  const clarificationSchema: Record<string, unknown> = {
    type: "object",
    required: ["id", "intakeId", "questions", "answers"],
    properties: {
      id: { type: "string" },
      intakeId: { type: "string" },
      questions: { type: "array" },
      answers: { type: "array" },
    },
  };

  it("合法 ClarificationSession → 通过", () => {
    const result = validateAgentOutput(
      {
        id: "sess-1",
        intakeId: "intake-1",
        questions: [{ id: "q1" }],
        answers: [],
      },
      clarificationSchema,
    );
    expect(result.valid).toBe(true);
  });

  it("answers 缺失 → invalid", () => {
    const result = validateAgentOutput(
      {
        id: "sess-1",
        intakeId: "intake-1",
        questions: [],
      },
      clarificationSchema,
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("answers"))).toBe(true);
  });
});

describe("validateAgentOutput - BlueprintSpecTree-like schema", () => {
  const specTreeSchema: Record<string, unknown> = {
    type: "object",
    required: ["id", "rootNodeId", "version", "nodes"],
    properties: {
      id: { type: "string" },
      rootNodeId: { type: "string" },
      version: { type: "number" },
      nodes: { type: "array" },
    },
  };

  it("合法 SpecTree → 通过", () => {
    const result = validateAgentOutput(
      {
        id: "tree-1",
        rootNodeId: "root",
        version: 1,
        nodes: [{ id: "root" }],
      },
      specTreeSchema,
    );
    expect(result.valid).toBe(true);
  });

  it("version 传成 string → invalid（类型错误）", () => {
    const result = validateAgentOutput(
      {
        id: "tree-1",
        rootNodeId: "root",
        version: "1",
        nodes: [],
      },
      specTreeSchema,
    );
    expect(result.valid).toBe(false);
    expect(
      result.errors.some(
        (e) => e.includes("version") && e.includes("expected number"),
      ),
    ).toBe(true);
  });
});
