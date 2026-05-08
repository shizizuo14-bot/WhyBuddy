import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

function clarificationSessionPayload() {
  return {
    session: {
      id: "clarification-session-1",
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
      createdAt: "2026-05-08T00:00:00.000Z",
      updatedAt: "2026-05-08T00:00:00.000Z",
    },
  };
}

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("blueprint clarification API paths", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(jsonResponse(clarificationSessionPayload()));
  });

  it("creates clarification sessions under the intake route", async () => {
    const { createBlueprintClarificationSession } = await import(
      "./blueprint-api"
    );

    await createBlueprintClarificationSession("intake-1", {
      projectId: "project-1",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/blueprint/intake/intake-1/clarifications",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("fetches clarification sessions from the top-level clarification route", async () => {
    const { fetchBlueprintClarificationSession } = await import(
      "./blueprint-api"
    );

    await fetchBlueprintClarificationSession("clarification-session-1");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/blueprint/clarifications/clarification-session-1",
      undefined
    );
  });

  it("submits clarification answers to the top-level clarification route", async () => {
    const { saveBlueprintClarificationAnswers } = await import(
      "./blueprint-api"
    );

    await saveBlueprintClarificationAnswers("clarification-session-1", {
      answeredBy: "autopilot",
      answers: [{ questionId: "q1", answer: "Use the architecture route." }],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/blueprint/clarifications/clarification-session-1/answers",
      expect.objectContaining({ method: "POST" })
    );
  });
});
