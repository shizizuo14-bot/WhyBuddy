import { describe, expect, it } from "vitest";

import {
  buildBlueprintServiceContext,
  createAgentCrewService,
  createArtifactMemoryService,
  createBlueprintEventBus,
  createBlueprintRouter,
  createClarificationService,
  createDownstreamService,
  createIntakeService,
  createJobService,
  createMemoryBlueprintJobStore,
  createSpecDocumentService,
  projectHandoffOntoJob,
} from "./index.js";

/**
 * `server/routes/blueprint/index.ts` barrel 的 smoke 测试。
 *
 * 只验证两件事：
 * 1. barrel 能导出 8 个子域 service 工厂、`buildBlueprintServiceContext`、`createBlueprintEventBus`、
 *    `projectHandoffOntoJob`，且向后兼容导出 `createBlueprintRouter` 与 jobStore 工厂；
 * 2. barrel 导出的符号之间互相可装配（不出现循环依赖）。
 */
describe("server/routes/blueprint barrel", () => {
  it("exports every subdomain factory and the legacy router entry", () => {
    expect(typeof buildBlueprintServiceContext).toBe("function");
    expect(typeof createBlueprintEventBus).toBe("function");
    expect(typeof projectHandoffOntoJob).toBe("function");
    expect(typeof createIntakeService).toBe("function");
    expect(typeof createClarificationService).toBe("function");
    expect(typeof createJobService).toBe("function");
    expect(typeof createAgentCrewService).toBe("function");
    expect(typeof createSpecDocumentService).toBe("function");
    expect(typeof createDownstreamService).toBe("function");
    expect(typeof createArtifactMemoryService).toBe("function");
    expect(typeof createBlueprintRouter).toBe("function");
    expect(typeof createMemoryBlueprintJobStore).toBe("function");
  });

  it("end-to-end wiring: context + services + router can all be assembled in one go", () => {
    const jobStore = createMemoryBlueprintJobStore();
    const ctx = buildBlueprintServiceContext({ jobStore });
    expect(() => createIntakeService(ctx)).not.toThrow();
    expect(() => createClarificationService(ctx)).not.toThrow();
    expect(() => createJobService(ctx)).not.toThrow();
    expect(() => createAgentCrewService(ctx)).not.toThrow();
    expect(() => createSpecDocumentService(ctx)).not.toThrow();
    expect(() => createDownstreamService(ctx)).not.toThrow();
    expect(() => createArtifactMemoryService(ctx)).not.toThrow();
    expect(() => createBlueprintRouter({ jobStore })).not.toThrow();
  });
});
