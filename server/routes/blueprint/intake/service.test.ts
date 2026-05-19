import { describe, expect, it } from "vitest";

import type {
  BlueprintIntake,
  BlueprintProjectDomainContext,
} from "../../../../shared/blueprint/index.js";
import { createMemoryBlueprintJobStore } from "../../blueprint.js";

import { buildBlueprintServiceContext } from "../context.js";
import { createIntakeService } from "./service.js";

/**
 * 子域 1 service 层壳的 co-located 单测。
 *
 * 当前方案 B 的可验证面：
 * 1. `listSpecs` 能基于 `ctx.specsRoot` 扫描一个临时目录并返回结构化响应；
 * 2. `getIntake` 从 `ctx.blueprintStores.intakes` 读出来、并且把 `projectContext` 一并返回；
 * 3. `getProjectContext` 对于未知 projectId 返回空对象并使用 `ctx.now()` 作为时间戳；
 * 4. 尚未接线的 `createIntake / listDefaultCapabilities` 明确抛错，防止误用。
 *
 * 这些断言都是 example-based。
 */

function makeIntake(id: string, projectId?: string): BlueprintIntake {
  const now = "2026-05-07T00:00:00.000Z";
  return {
    id,
    projectId,
    githubUrls: [],
    sources: [],
    duplicateGithubUrls: [],
    domainNotes: [],
    assets: [],
    evidence: [],
    readiness: {
      status: "ready",
      score: 1,
      answeredRequired: 0,
      requiredTotal: 0,
      missingQuestionIds: [],
    },
    createdAt: now,
    updatedAt: now,
  };
}

function makeProjectContext(projectId: string): BlueprintProjectDomainContext {
  return {
    projectId,
    updatedAt: "2026-05-07T00:00:00.000Z",
    intakeIds: [],
    sourceIds: [],
    assets: [],
    evidence: [],
  };
}

describe("createIntakeService (shell)", () => {
  it("listSpecs 返回结构化响应，对空目录给出 totalSpecs === 0", async () => {
    const ctx = buildBlueprintServiceContext({
      jobStore: createMemoryBlueprintJobStore(),
      specsRoot: ".__nonexistent_specs_root_for_intake_service_test",
    });
    const service = createIntakeService(ctx);
    const result = await service.listSpecs();
    expect(result.totalSpecs).toBe(0);
    expect(result.specs).toEqual([]);
  });

  it("getIntake 读取 ctx.blueprintStores.intakes，并带上 projectContext", () => {
    const ctx = buildBlueprintServiceContext({
      jobStore: createMemoryBlueprintJobStore(),
    });
    const intake = makeIntake("intake-1", "project-1");
    const projectContext = makeProjectContext("project-1");
    ctx.blueprintStores.intakes.set(intake.id, intake);
    ctx.blueprintStores.projectContexts.set(projectContext.projectId, projectContext);

    const service = createIntakeService(ctx);
    const result = service.getIntake("intake-1");
    expect(result?.intake).toBe(intake);
    expect(result?.projectContext).toBe(projectContext);
  });

  it("getIntake 返回 null 当 id 未知", () => {
    const ctx = buildBlueprintServiceContext({
      jobStore: createMemoryBlueprintJobStore(),
    });
    const service = createIntakeService(ctx);
    expect(service.getIntake("unknown")).toBeNull();
  });

  it("getProjectContext 对未知 projectId 返回空对象并使用 ctx.now()", () => {
    const fixedNow = () => new Date("2026-06-01T00:00:00.000Z");
    const ctx = buildBlueprintServiceContext({
      jobStore: createMemoryBlueprintJobStore(),
      now: fixedNow,
    });
    const service = createIntakeService(ctx);
    const result = service.getProjectContext("fresh-project");
    expect(result.projectId).toBe("fresh-project");
    expect(result.updatedAt).toBe("2026-06-01T00:00:00.000Z");
    expect(result.assets).toEqual([]);
    expect(result.evidence).toEqual([]);
  });

  it("尚未接线的 createIntake / listDefaultCapabilities 明确抛错", () => {
    const ctx = buildBlueprintServiceContext({
      jobStore: createMemoryBlueprintJobStore(),
    });
    const service = createIntakeService(ctx);
    expect(() => service.listDefaultCapabilities()).toThrowError(
      /not wired yet/i
    );
    expect(() => service.createIntake({})).toThrowError(/not wired yet/i);
  });
});
