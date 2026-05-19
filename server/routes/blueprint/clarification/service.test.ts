import { describe, expect, it } from "vitest";

import type { BlueprintClarificationSession } from "../../../../shared/blueprint/index.js";
import { createMemoryBlueprintJobStore } from "../../blueprint.js";

import { buildBlueprintServiceContext } from "../context.js";
import { createClarificationService } from "./service.js";

function makeSession(id: string): BlueprintClarificationSession {
  const now = "2026-05-07T00:00:00.000Z";
  return {
    id,
    intakeId: "intake-1",
    questions: [],
    answers: [],
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

describe("createClarificationService (shell)", () => {
  it("getSession 从 ctx.blueprintStores 读取", () => {
    const ctx = buildBlueprintServiceContext({
      jobStore: createMemoryBlueprintJobStore(),
    });
    const session = makeSession("s-1");
    ctx.blueprintStores.clarificationSessions.set(session.id, session);

    const service = createClarificationService(ctx);
    expect(service.getSession("s-1")).toBe(session);
  });

  it("getSession 返回 null 当 id 未知", () => {
    const ctx = buildBlueprintServiceContext({
      jobStore: createMemoryBlueprintJobStore(),
    });
    const service = createClarificationService(ctx);
    expect(service.getSession("unknown")).toBeNull();
  });

  it("未接线的方法明确抛错", async () => {
    const ctx = buildBlueprintServiceContext({
      jobStore: createMemoryBlueprintJobStore(),
    });
    const service = createClarificationService(ctx);
    await expect(
      service.createSession("intake-1", {})
    ).rejects.toThrow(/not wired yet/i);
    expect(() =>
      service.saveAnswers("s-1", { answers: [] })
    ).toThrowError(/not wired yet/i);
  });
});
