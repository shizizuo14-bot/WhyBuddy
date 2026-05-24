import express from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";

import {
  createBlueprintRouter,
  createMemoryBlueprintJobStore,
  type BlueprintJobStore,
} from "../../blueprint.js";
import { buildBlueprintServiceContext } from "../context.js";
import {
  buildClarificationRouteContext,
  buildRouteCandidate,
} from "../routeset/route-candidate.js";
import { buildFullChainJob } from "../staleness/__tests__/__fixtures__/build-fixture-job.js";

async function withServer(
  app: express.Express,
  handler: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const server = createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.listen(0, "127.0.0.1", (error?: Error) => {
      if (error) reject(error);
      else resolve();
    });
  });

  const address = server.address() as AddressInfo;
  try {
    await handler(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

function createApp(jobStore: BlueprintJobStore = createMemoryBlueprintJobStore()) {
  const app = express();
  const now = () => new Date("2026-05-23T07:00:00.000Z");
  const generateClarificationQuestions = async (input: any) => ({
    questions: input.templateQuestions,
    source: "template" as const,
  });
  const routeSetLlmGenerator = async (input: any) => {
    const clarificationContext = buildClarificationRouteContext(
      input.request,
      input.clarificationSession,
    );
    return {
      routes: [
        buildRouteCandidate({
          id: input.primaryRouteId,
          kind: "primary",
          title: "Primary SPEC asset route",
          summary: "Primary route for router integration tests.",
          rationale: "Use the primary path.",
          riskLevel: "medium",
          costLevel: "medium",
          complexity: "balanced",
          estimatedEffort: "1 day",
          includeGithubStep: false,
          clarificationContext,
        }),
        buildRouteCandidate({
          id: `${input.routeSetId}:alternative-1`,
          kind: "alternative",
          title: "Documentation-first conservative route",
          summary: "Alternative documentation route.",
          rationale: "Use the documentation-first path.",
          riskLevel: "low",
          costLevel: "low",
          complexity: "light",
          estimatedEffort: "1 day",
          includeGithubStep: false,
          clarificationContext,
        }),
        buildRouteCandidate({
          id: `${input.routeSetId}:alternative-2`,
          kind: "alternative",
          title: "Preview-first exploratory route",
          summary: "Alternative preview route.",
          rationale: "Use the preview-first path.",
          riskLevel: "high",
          costLevel: "medium",
          complexity: "deep",
          estimatedEffort: "2 days",
          includeGithubStep: false,
          clarificationContext,
        }),
      ],
      provenanceExtras: { generationSource: "template" as const },
    };
  };
  const blueprintServiceContext = buildBlueprintServiceContext({
    jobStore,
    now,
    generateClarificationQuestions,
    routeSetLlmGenerator,
    specTreeLlmService: async () => ({ generationSource: "template" }),
  });

  app.use(express.json());
  app.use(
    "/api/blueprint",
    createBlueprintRouter({
      jobStore,
      now,
      generateClarificationQuestions,
      routeSetLlmGenerator,
      blueprintServiceContext,
    }),
  );
  return app;
}

describe("five spec blueprint router integration", () => {
  it("registers replan and family endpoints on the blueprint router", async () => {
    const job = buildFullChainJob();
    job.id = "job-router-replan";
    const app = createApp(createMemoryBlueprintJobStore([job]));

    await withServer(app, async (baseUrl) => {
      const replanResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/${job.id}/replan`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fromStage: "spec_docs",
            mode: "in_place",
            reason: "Regenerate docs after upstream review.",
          }),
        },
      );
      expect(replanResponse.status).toBe(200);
      const replanned = (await replanResponse.json()) as Record<string, any>;
      expect(replanned.mode).toBe("in_place");
      expect(replanned.job.events.at(-1)).toMatchObject({
        type: "replan.triggered",
        family: "job",
        stage: "spec_docs",
      });

      const familyResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/${job.id}/family`,
      );
      expect(familyResponse.status).toBe(200);
      const family = (await familyResponse.json()) as Record<string, any>;
      expect(family.rootJobId).toBe(job.id);
      expect(family.jobs.map((item: any) => item.id)).toEqual([job.id]);
      expect(family.replanEvents.map((event: any) => event.type)).toEqual([
        "replan.triggered",
      ]);
    });
  });

  it("registers intake patch and returns staleEdit for linked jobs", async () => {
    const jobStore = createMemoryBlueprintJobStore();
    const app = createApp(jobStore);

    await withServer(app, async (baseUrl) => {
      const intakeResponse = await fetch(`${baseUrl}/api/blueprint/intake`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetText: "Original target for editable intake.",
        }),
      });
      expect(intakeResponse.status).toBe(201);
      const intakeBody = (await intakeResponse.json()) as Record<string, any>;

      const linkedJob = buildFullChainJob();
      jobStore.save({
        ...linkedJob,
        id: "job-linked-intake-patch",
        request: {
          ...linkedJob.request,
          intakeId: intakeBody.intake.id,
          targetText: intakeBody.intake.targetText,
        },
      });

      const patchResponse = await fetch(
        `${baseUrl}/api/blueprint/intake/${intakeBody.intake.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            targetText: "Updated target for editable intake.",
          }),
        },
      );
      expect(patchResponse.status).toBe(200);
      const patched = (await patchResponse.json()) as Record<string, any>;
      expect(patched.intake.targetText).toBe(
        "Updated target for editable intake.",
      );
      expect(patched.staleEdit).toMatchObject({
        fromStage: "input",
        newlyStaleArtifactCount: expect.any(Number),
      });
      expect(patched.staleEdit.newlyStaleArtifactCount).toBeGreaterThan(0);
    });
  });

  it("adds staleEdit when clarification answers change for a linked job", async () => {
    const jobStore = createMemoryBlueprintJobStore();
    const app = createApp(jobStore);

    await withServer(app, async (baseUrl) => {
      const intakeResponse = await fetch(`${baseUrl}/api/blueprint/intake`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetText: "Target that needs clarification edits.",
        }),
      });
      const intake = ((await intakeResponse.json()) as Record<string, any>)
        .intake;

      const sessionResponse = await fetch(
        `${baseUrl}/api/blueprint/intake/${intake.id}/clarifications`,
        { method: "POST" },
      );
      expect(sessionResponse.status).toBe(201);
      const session = ((await sessionResponse.json()) as Record<string, any>)
        .session;
      const answers = session.questions
        .filter((question: any) => question.required)
        .map((question: any) => ({
          questionId: question.id,
          answer: `Answer for ${question.kind}`,
        }));

      const firstAnswerResponse = await fetch(
        `${baseUrl}/api/blueprint/clarifications/${session.id}/answers`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answers }),
        },
      );
      expect(firstAnswerResponse.status).toBe(200);

      const linkedJob = buildFullChainJob();
      jobStore.save({
        ...linkedJob,
        id: "job-linked-clarification-edit",
        request: {
          ...linkedJob.request,
          intakeId: intake.id,
          clarificationSessionId: session.id,
          targetText: intake.targetText,
        },
      });

      const changedAnswers = answers.map((answer: any, index: number) =>
        index === 0
          ? { ...answer, answer: `${answer.answer} with a changed priority` }
          : answer,
      );
      const changedResponse = await fetch(
        `${baseUrl}/api/blueprint/clarifications/${session.id}/answers`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answers: changedAnswers }),
        },
      );
      expect(changedResponse.status).toBe(200);
      const changed = (await changedResponse.json()) as Record<string, any>;
      expect(changed.staleEdit).toMatchObject({
        fromStage: "clarification",
        newlyStaleArtifactCount: expect.any(Number),
      });
      expect(changed.staleEdit.newlyStaleArtifactCount).toBeGreaterThan(0);
    });
  });

  it("adds staleEdit for route reselection without changing delete semantics", async () => {
    const app = createApp();

    await withServer(app, async (baseUrl) => {
      const createResponse = await fetch(`${baseUrl}/api/blueprint/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetText: "Build a route reselection integration test.",
        }),
      });
      expect(createResponse.status).toBe(201);
      const created = (await createResponse.json()) as Record<string, any>;

      const firstSelectionResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/${created.job.id}/route-selection`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            routeId: created.routeSet.routes[0].id,
          }),
        },
      );
      expect(firstSelectionResponse.status).toBe(201);
      const firstSelection =
        (await firstSelectionResponse.json()) as Record<string, any>;
      expect(firstSelection.staleEdit).toBeUndefined();

      const reselectResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/${created.job.id}/route-selection`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            routeId: created.routeSet.routes[1].id,
            reason: "Try the second route.",
          }),
        },
      );
      expect(reselectResponse.status).toBe(201);
      const reselected = (await reselectResponse.json()) as Record<string, any>;
      expect(reselected.selection.routeId).toBe(created.routeSet.routes[1].id);
      expect(reselected.staleEdit).toMatchObject({
        fromStage: "route_generation",
        newlyStaleArtifactCount: expect.any(Number),
      });

      const resetResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/${created.job.id}/route-selection`,
        { method: "DELETE" },
      );
      expect(resetResponse.status).toBe(200);
      const reset = (await resetResponse.json()) as Record<string, any>;
      expect(reset.staleEdit).toBeUndefined();
      expect(reset.selection).toBeUndefined();
    });
  });
});
