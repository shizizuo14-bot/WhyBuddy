/**
 * `blueprint-v4-full-alignment` Module D — 业务不变量单元测试。
 *
 * 覆盖：两级匹配、阈值边界（pass/warn/fail）、skip 路径。
 */

import { describe, it, expect } from "vitest";
import {
  checkRequirementCoverage,
  checkNodeEvidence,
} from "./business-invariants.js";
import type { BlueprintSpecTreeNode } from "../../../../shared/blueprint/contracts.js";

function node(
  id: string,
  overrides: Partial<BlueprintSpecTreeNode> = {},
): BlueprintSpecTreeNode {
  return {
    id,
    title: "",
    summary: "",
    type: "route_step",
    status: "draft",
    priority: 0,
    dependencies: [],
    outputs: [],
    children: [],
    ...overrides,
  };
}

describe("checkRequirementCoverage", () => {
  it("skip when no criteria", () => {
    const r = checkRequirementCoverage([], [node("n1")]);
    expect(r.status).toBe("skip");
  });

  it("pass when keyword overlap covers all criteria", () => {
    const nodes = [
      node("n1", { title: "User authentication login", summary: "Handle login flow" }),
      node("n2", { title: "Dashboard rendering", summary: "Render income charts" }),
    ];
    const r = checkRequirementCoverage(
      ["Support user authentication", "Render dashboard charts"],
      nodes,
    );
    expect(r.status).toBe("pass");
    expect(r.offending).toEqual([]);
  });

  it("pass via explicit coversCriteria declaration", () => {
    const nodes = [
      node("n1", {
        title: "totally unrelated words here",
        metadata: { coversCriteria: ["criterion-0"] },
      }),
    ];
    const r = checkRequirementCoverage(["xyzzy plugh frobnicate"], nodes);
    expect(r.status).toBe("pass");
  });

  it("warn when <=50% uncovered", () => {
    const nodes = [
      node("n1", { title: "authentication login session" }),
    ];
    const r = checkRequirementCoverage(
      ["user authentication flow", "completely different payment gateway integration"],
      nodes,
    );
    // 1 covered (auth), 1 uncovered (payment) = 50% → warn
    expect(r.status).toBe("warn");
    expect(r.offending.length).toBe(1);
  });

  it("fail when >50% uncovered", () => {
    const nodes = [node("n1", { title: "authentication" })];
    const r = checkRequirementCoverage(
      [
        "user authentication",
        "payment gateway",
        "notification service",
      ],
      nodes,
    );
    // only auth covered, 2/3 uncovered → fail
    expect(r.status).toBe("fail");
    expect(r.offending.length).toBe(2);
  });
});

describe("checkNodeEvidence", () => {
  it("skip when no non-root nodes", () => {
    const r = checkNodeEvidence([node("root", { type: "root" })]);
    expect(r.status).toBe("skip");
  });

  it("pass when all non-root nodes have outputs", () => {
    const nodes = [
      node("root", { type: "root" }),
      node("n1", { outputs: ["doc.md"] }),
      node("n2", { outputs: ["api.ts"] }),
    ];
    const r = checkNodeEvidence(nodes);
    expect(r.status).toBe("pass");
  });

  it("pass when evidence via metadata.evidenceSources", () => {
    const nodes = [
      node("n1", { outputs: [], metadata: { evidenceSources: ["repo://file.ts"] } }),
    ];
    const r = checkNodeEvidence(nodes);
    expect(r.status).toBe("pass");
  });

  it("warn when <=50% lack evidence", () => {
    const nodes = [
      node("n1", { outputs: ["a"] }),
      node("n2", { outputs: [] }),
    ];
    const r = checkNodeEvidence(nodes);
    expect(r.status).toBe("warn");
    expect(r.offending).toEqual(["n2"]);
  });

  it("fail when >50% lack evidence", () => {
    const nodes = [
      node("n1", { outputs: [] }),
      node("n2", { outputs: [] }),
      node("n3", { outputs: ["a"] }),
    ];
    const r = checkNodeEvidence(nodes);
    expect(r.status).toBe("fail");
    expect(r.offending.length).toBe(2);
  });
});
