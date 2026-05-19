import { describe, expect, it, vi } from "vitest";

import {
  createInitialBindingReport,
  type BindingReport,
} from "./mcp-binder.js";

import {
  bindRoleSkills,
  type SkillHandle,
  type SkillRegistryDependency,
} from "./skills-binder.js";

function buildLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function buildHandle(skillId: string, roleId: string): SkillHandle {
  return {
    skillId,
    roleId,
    loadedAt: "2026-05-12T00:00:00Z",
    invoke: async () => ({}),
  };
}

describe("bindRoleSkills", () => {
  it("(a) 正常加载成功进入 map", async () => {
    const registry: SkillRegistryDependency = {
      loadForRole: async ({ skillId, roleId }) => buildHandle(skillId, roleId),
    };
    const report: BindingReport = createInitialBindingReport();
    const result = await bindRoleSkills(
      ["blueprint-architecture", "impl-toolbox"],
      registry,
      "role-x",
      report,
      buildLogger(),
    );
    expect(result.size).toBe(2);
    expect(report.skippedSkills).toHaveLength(0);
    expect(report.boundSkills).toEqual(["blueprint-architecture", "impl-toolbox"]);
  });

  it("(b) registry 缺失时全部跳过", async () => {
    const report = createInitialBindingReport();
    const result = await bindRoleSkills(
      ["a", "b"],
      undefined,
      "role-x",
      report,
      buildLogger(),
    );
    expect(result.size).toBe(0);
    expect(report.skippedSkills).toEqual([
      { id: "a", reason: "skillRegistry missing" },
      { id: "b", reason: "skillRegistry missing" },
    ]);
  });

  it("(c) 单项 null 跳过，其它继续", async () => {
    const registry: SkillRegistryDependency = {
      loadForRole: async ({ skillId, roleId }) =>
        skillId === "missing" ? null : buildHandle(skillId, roleId),
    };
    const report = createInitialBindingReport();
    const logger = buildLogger();
    const result = await bindRoleSkills(
      ["ok", "missing", "ok2"],
      registry,
      "role-x",
      report,
      logger,
    );
    expect([...result.keys()]).toEqual(["ok", "ok2"]);
    expect(report.skippedSkills).toEqual([
      { id: "missing", reason: "skill not registered" },
    ]);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it("(d) 单项 throw 跳过，其它继续", async () => {
    const registry: SkillRegistryDependency = {
      loadForRole: async ({ skillId, roleId }) => {
        if (skillId === "broken") throw new Error("load failed");
        return buildHandle(skillId, roleId);
      },
    };
    const report = createInitialBindingReport();
    const logger = buildLogger();
    const result = await bindRoleSkills(
      ["ok", "broken"],
      registry,
      "role-x",
      report,
      logger,
    );
    expect([...result.keys()]).toEqual(["ok"]);
    expect(report.skippedSkills).toEqual([
      { id: "broken", reason: "load failed" },
    ]);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it("(e) 空列表返回空 map", async () => {
    const registry: SkillRegistryDependency = {
      loadForRole: async () => null,
    };
    const report = createInitialBindingReport();
    const result = await bindRoleSkills([], registry, "role-x", report, buildLogger());
    expect(result.size).toBe(0);
    expect(report.skippedSkills).toHaveLength(0);
  });
});
