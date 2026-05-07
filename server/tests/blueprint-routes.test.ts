import express from "express";
import { createServer } from "node:http";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createBlueprintRouter,
  createFileBlueprintJobStore,
  createMemoryBlueprintJobStore,
  type BlueprintJobStore,
} from "../routes/blueprint.js";

const BLUEPRINT_ROUTE_TEST_COMMAND =
  "node node_modules/vitest/vitest.mjs run --config vitest.config.server.ts server/tests/blueprint-routes.test.ts";

async function withServer(
  specsRoot: string,
  handler: (baseUrl: string) => Promise<void>,
  jobStore: BlueprintJobStore = createMemoryBlueprintJobStore()
): Promise<void> {
  const app = express();
  app.use(express.json());
  app.use(
    "/api/blueprint",
    createBlueprintRouter({
      specsRoot,
      now: () => new Date("2026-05-06T00:00:00.000Z"),
      jobStore,
    })
  );

  const server = createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.listen(0, "127.0.0.1", (error?: Error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });

  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await handler(baseUrl);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close(error => (error ? reject(error) : resolve()));
    });
  }
}

async function writeSpec(
  root: string,
  name: string,
  files: Record<string, string>
): Promise<void> {
  const specRoot = path.join(root, name);
  await mkdir(specRoot, { recursive: true });
  await Promise.all(
    Object.entries(files).map(([fileName, content]) =>
      writeFile(path.join(specRoot, fileName), content, "utf8")
    )
  );
}

async function createSelectedSpecTree(
  baseUrl: string
): Promise<Record<string, any>> {
  const createResponse = await fetch(`${baseUrl}/api/blueprint/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      targetText: "Build an editable SPEC tree workbench.",
    }),
  });
  const created = (await createResponse.json()) as Record<string, any>;

  const selectResponse = await fetch(
    `${baseUrl}/api/blueprint/jobs/${created.job.id}/route-selection`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        routeId: created.routeSet.routes[0].id,
      }),
    }
  );

  expect(selectResponse.status).toBe(201);
  return (await selectResponse.json()) as Record<string, any>;
}

async function createAcceptedRootDocsAndPreview(
  baseUrl: string
): Promise<Record<string, any>> {
  const selected = await createSelectedSpecTree(baseUrl);
  const generateDocumentsResponse = await fetch(
    `${baseUrl}/api/blueprint/jobs/${selected.job.id}/spec-documents`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nodeId: selected.specTree.rootNodeId,
      }),
    }
  );
  expect(generateDocumentsResponse.status).toBe(201);
  const generatedDocuments =
    (await generateDocumentsResponse.json()) as Record<string, any>;

  for (const document of generatedDocuments.documents) {
    const reviewResponse = await fetch(
      `${baseUrl}/api/blueprint/jobs/${selected.job.id}/spec-documents/${document.id}/review`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "accepted",
          reviewedBy: "prompt-reviewer",
        }),
      }
    );
    expect(reviewResponse.status).toBe(200);
  }

  const previewResponse = await fetch(
    `${baseUrl}/api/blueprint/jobs/${selected.job.id}/effect-previews`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nodeId: selected.specTree.rootNodeId,
      }),
    }
  );
  expect(previewResponse.status).toBe(201);
  const preview = (await previewResponse.json()) as Record<string, any>;

  return {
    selected,
    documents: generatedDocuments.documents,
    preview: preview.effectPreviews[0],
  };
}

async function createRootPromptPackages(
  baseUrl: string,
  targetPlatforms: string[] = ["codex"]
): Promise<Record<string, any>> {
  const { selected, documents, preview } =
    await createAcceptedRootDocsAndPreview(baseUrl);
  const packageResponse = await fetch(
    `${baseUrl}/api/blueprint/jobs/${selected.job.id}/prompt-packages`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nodeId: selected.specTree.rootNodeId,
        targetPlatforms,
      }),
    }
  );
  expect(packageResponse.status).toBe(201);
  const packaged = (await packageResponse.json()) as Record<string, any>;

  return {
    selected,
    documents,
    preview,
    packaged,
    promptPackages: packaged.promptPackages,
  };
}

describe("blueprint specs route", () => {
  let tempRoot = "";

  beforeEach(async () => {
    tempRoot = await mkdtemp(
      path.join(process.cwd(), "tmp", "blueprint-specs-")
    );
  });

  afterEach(async () => {
    if (tempRoot) {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("reads blueprint specs, metadata, and top-level task progress", async () => {
    await writeSpec(tempRoot, "blueprint-input-github-ingestion", {
      "requirements.md": [
        "# Requirements Document",
        "",
        "## Introduction",
        "",
        "This spec defines intake behavior.",
        "",
      ].join("\n"),
      "design.md": [
        "# Design Document: Intake Pipeline",
        "",
        "## Overview",
        "",
        "The intake pipeline normalizes inputs.",
        "",
      ].join("\n"),
      "tasks.md": [
        "# Intake Pipeline Task List",
        "",
        "- [x] 1. Capture input",
        "  - [ ] 1.1 Child task should not count",
        "- [ ] 2. Normalize input",
        "",
      ].join("\n"),
      ".config.kiro": JSON.stringify({ generationMode: "requirements-first" }),
    });

    await writeSpec(tempRoot, "blueprint-custom-config", {
      "design.md": "# Design Document: Custom Blueprint\n",
      ".config.kiro": JSON.stringify({
        name: "Custom Blueprint",
        phase: "custom",
        order: 7,
        summary: "From config",
      }),
    });

    await writeSpec(tempRoot, "blueprint-engineering-landing-bridge", {});

    await withServer(tempRoot, async baseUrl => {
      const response = await fetch(`${baseUrl}/api/blueprint/specs`);
      expect(response.status).toBe(200);

      const body = (await response.json()) as Record<string, unknown>;
      expect(body.generatedAt).toBe("2026-05-06T00:00:00.000Z");
      expect(body.root).toContain("blueprint-specs-");
      expect(body.totalSpecs).toBe(3);
      expect(body.totalDocs).toBe(6);
      expect(body.completedTasks).toBe(1);
      expect(body.totalTasks).toBe(2);

      const specs = body.specs as Array<Record<string, unknown>>;
      const intake = specs.find(
        spec => spec.id === "blueprint-input-github-ingestion"
      );
      const custom = specs.find(spec => spec.id === "blueprint-custom-config");
      const empty = specs.find(
        spec => spec.id === "blueprint-engineering-landing-bridge"
      );

      expect(intake).toMatchObject({
        title: "Intake Pipeline",
        phase: "intake",
        order: 1,
        summary: "This spec defines intake behavior.",
        status: "ready",
      });
      expect((intake?.docs as Record<string, unknown>).requirements).toBe(true);
      expect((intake?.docs as Record<string, unknown>).design).toBe(true);
      expect((intake?.docs as Record<string, unknown>).tasks).toBe(true);
      expect((intake?.docs as Record<string, unknown>).config).toBe(true);
      expect(intake?.taskStats).toMatchObject({ completed: 1, total: 2 });

      expect(custom).toMatchObject({
        title: "Custom Blueprint",
        phase: "custom",
        order: 7,
        summary: "From config",
        status: "partial",
      });
      expect((custom?.docs as Record<string, unknown>).requirements).toBe(
        false
      );
      expect((custom?.docs as Record<string, unknown>).design).toBe(true);
      expect((custom?.docs as Record<string, unknown>).tasks).toBe(false);
      expect((custom?.docs as Record<string, unknown>).config).toBe(true);
      expect(custom?.taskStats).toMatchObject({ completed: 0, total: 0 });

      expect(empty).toMatchObject({
        title: "Engineering Landing Bridge",
        phase: "execution",
        status: "empty",
      });
      expect((empty?.docs as Record<string, unknown>).requirements).toBe(false);
      expect((empty?.docs as Record<string, unknown>).design).toBe(false);
      expect((empty?.docs as Record<string, unknown>).tasks).toBe(false);
      expect((empty?.docs as Record<string, unknown>).config).toBe(false);
    });
  });

  it("creates and reads a blueprint generation job with a RouteSet artifact", async () => {
    await withServer(tempRoot, async baseUrl => {
      const createResponse = await fetch(`${baseUrl}/api/blueprint/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: "project-1",
          targetText: "Build a permission management system with RBAC.",
          githubUrls: ["https://github.com/example/permissions"],
        }),
      });

      expect(createResponse.status).toBe(201);
      const created = (await createResponse.json()) as Record<string, any>;
      expect(created.job).toMatchObject({
        status: "completed",
        stage: "route_generation",
        projectId: "project-1",
        completedAt: "2026-05-06T00:00:00.000Z",
      });
      expect(created.job.events.map((event: any) => event.type)).toEqual([
        "job.created",
        "job.stage",
        "job.completed",
      ]);
      expect(created.routeSet).toMatchObject({
        requestId: created.job.id,
        primaryRouteId: expect.any(String),
        nextAsset: {
          type: "spec_tree",
          menu: "deduction",
        },
      });
      expect(created.routeSet.routes).toHaveLength(3);
      expect(created.routeSet.routes[0]).toMatchObject({
        kind: "primary",
        title: "Primary SPEC asset route",
      });
      expect(created.job.artifacts[0]).toMatchObject({
        type: "route_set",
        title: "Autopilot RouteSet",
      });

      const latestResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/latest`
      );
      expect(latestResponse.status).toBe(200);
      const latest = (await latestResponse.json()) as Record<string, any>;
      expect(latest.job.id).toBe(created.job.id);
      expect(latest.routeSet.id).toBe(created.routeSet.id);

      const jobResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/${created.job.id}`
      );
      expect(jobResponse.status).toBe(200);
      const fetched = (await jobResponse.json()) as Record<string, any>;
      expect(fetched.routeSet.routes.map((route: any) => route.kind)).toEqual([
        "primary",
        "alternative",
        "alternative",
      ]);

      const eventsResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/${created.job.id}/events`
      );
      expect(eventsResponse.status).toBe(200);
      const eventsBody = (await eventsResponse.json()) as Record<string, any>;
      expect(eventsBody.job.id).toBe(created.job.id);
      expect(eventsBody.events).toHaveLength(created.job.events.length);
      expect(eventsBody.events.map((event: any) => event.type)).toEqual(
        created.job.events.map((event: any) => event.type)
      );

      const streamResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/${created.job.id}/events/stream`
      );
      expect(streamResponse.status).toBe(200);
      expect(streamResponse.headers.get("content-type")).toContain(
        "text/event-stream"
      );
      const streamText = await streamResponse.text();
      expect(streamText).toContain("event: job.created");
      expect(streamText).toContain("event: job.stage");
      expect(streamText).toContain("event: job.completed");
      expect(streamText).toContain("event: done");
      expect(streamText).toContain(`id: ${created.job.events[0].id}`);

      const selectResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/${created.job.id}/route-selection`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            routeId: created.routeSet.routes[0].id,
            reason: "Use the balanced route as the SPEC tree source.",
            mergedAlternativeRouteIds: [created.routeSet.routes[1].id],
          }),
        }
      );
      expect(selectResponse.status).toBe(201);

      const selected = (await selectResponse.json()) as Record<string, any>;
      expect(selected.job).toMatchObject({
        id: created.job.id,
        stage: "spec_tree",
        status: "reviewing",
      });
      expect(selected.selection).toMatchObject({
        routeSetId: created.routeSet.id,
        routeId: created.routeSet.routes[0].id,
        routeTitle: "Primary SPEC asset route",
        mergedAlternativeRouteIds: [created.routeSet.routes[1].id],
      });
      expect(selected.specTree).toMatchObject({
        routeSetId: created.routeSet.id,
        selectionId: selected.selection.id,
        selectedRouteId: created.routeSet.routes[0].id,
        version: 1,
        status: "draft",
      });
      expect(selected.specTree.nodes[0]).toMatchObject({
        type: "root",
        routeId: created.routeSet.routes[0].id,
      });
      expect(
        selected.specTree.nodes.some(
          (node: any) => node.type === "effect_preview"
        )
      ).toBe(true);
      expect(
        selected.job.artifacts.map((artifact: any) => artifact.type)
      ).toEqual(["route_set", "route_selection", "spec_tree"]);

      const treeResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/${created.job.id}/spec-tree`
      );
      expect(treeResponse.status).toBe(200);
      const treeBody = (await treeResponse.json()) as Record<string, any>;
      expect(treeBody.specTree.id).toBe(selected.specTree.id);

      const resetResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/${created.job.id}/route-selection`,
        {
          method: "DELETE",
        }
      );
      expect(resetResponse.status).toBe(200);
      const reset = (await resetResponse.json()) as Record<string, any>;
      expect(reset.job).toMatchObject({
        id: created.job.id,
        stage: "route_generation",
        status: "completed",
      });
      expect(reset.routeSet.id).toBe(created.routeSet.id);
      expect(reset.job.artifacts.map((artifact: any) => artifact.type)).toEqual([
        "route_set",
      ]);

      const resetDetailsResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/${created.job.id}`
      );
      const resetDetails = (await resetDetailsResponse.json()) as Record<
        string,
        any
      >;
      expect(resetDetails.selection).toBeUndefined();
      expect(resetDetails.specTree).toBeUndefined();

      const reselectResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/${created.job.id}/route-selection`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            routeId: created.routeSet.routes[2].id,
            reason: "Switch to the preview-first route after rollback.",
          }),
        }
      );
      expect(reselectResponse.status).toBe(201);
      const reselected = (await reselectResponse.json()) as Record<string, any>;
      expect(reselected.selection.routeId).toBe(created.routeSet.routes[2].id);
    });
  });

  it("supports compat generation endpoints for create, details, and events", async () => {
    await withServer(tempRoot, async baseUrl => {
      const createResponse = await fetch(
        `${baseUrl}/api/blueprint/generations`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            targetText: "Keep the legacy generation contract working.",
          }),
        }
      );

      expect(createResponse.status).toBe(201);
      const created = (await createResponse.json()) as Record<string, any>;
      expect(created.job.id).toBeTruthy();
      expect(created.routeSet.id).toBeTruthy();

      const detailsResponse = await fetch(
        `${baseUrl}/api/blueprint/generations/${created.job.id}`
      );
      expect(detailsResponse.status).toBe(200);
      const details = (await detailsResponse.json()) as Record<string, any>;
      expect(details.job.id).toBe(created.job.id);
      expect(details.routeSet.id).toBe(created.routeSet.id);

      const eventsResponse = await fetch(
        `${baseUrl}/api/blueprint/generations/${created.job.id}/events`
      );
      expect(eventsResponse.status).toBe(200);
      const events = (await eventsResponse.json()) as Record<string, any>;
      expect(events.job.id).toBe(created.job.id);
      expect(events.events.map((event: any) => event.type)).toEqual([
        "job.created",
        "job.stage",
        "job.completed",
      ]);
    });
  });

  it("captures blueprint intake and normalizes duplicate GitHub URLs", async () => {
    await withServer(tempRoot, async baseUrl => {
      const response = await fetch(`${baseUrl}/api/blueprint/intake`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: "project-intake",
          targetText: "Build an autopilot blueprint intake with GitHub context.",
          githubUrls: [
            "https://github.com/Example/Blueprint.git",
            "https://github.com/example/blueprint/",
            "https://github.com/example/blueprint?tab=readme-ov-file",
          ],
          domainNotes: ["RouteSet should remember reusable domain assets."],
        }),
      });

      expect(response.status).toBe(201);
      const body = (await response.json()) as Record<string, any>;
      expect(body.intake).toMatchObject({
        projectId: "project-intake",
        targetText: "Build an autopilot blueprint intake with GitHub context.",
        githubUrls: ["https://github.com/example/blueprint"],
        readiness: {
          status: "ready",
        },
      });
      expect(body.intake.sources).toHaveLength(1);
      expect(body.intake.sources[0]).toMatchObject({
        id: "blueprint-source-example-blueprint",
        kind: "repository",
        normalizedUrl: "https://github.com/example/blueprint",
        owner: "example",
        repo: "blueprint",
        slug: "example/blueprint",
      });
      expect(body.intake.duplicateGithubUrls).toHaveLength(2);
      expect(
        body.intake.duplicateGithubUrls.every(
          (source: any) =>
            source.duplicateOf === "blueprint-source-example-blueprint"
        )
      ).toBe(true);
      expect(body.intake.assets.map((asset: any) => asset.kind)).toEqual(
        expect.arrayContaining([
          "product_goal",
          "github_repository",
          "domain_note",
        ])
      );

      const fetchedResponse = await fetch(
        `${baseUrl}/api/blueprint/intake/${body.intake.id}`
      );
      expect(fetchedResponse.status).toBe(200);
      const fetched = (await fetchedResponse.json()) as Record<string, any>;
      expect(fetched.intake.id).toBe(body.intake.id);

      const contextResponse = await fetch(
        `${baseUrl}/api/blueprint/projects/project-intake/context`
      );
      expect(contextResponse.status).toBe(200);
      const contextBody = (await contextResponse.json()) as Record<string, any>;
      expect(contextBody.context).toMatchObject({
        projectId: "project-intake",
        intakeIds: [body.intake.id],
        sourceIds: ["blueprint-source-example-blueprint"],
      });
      expect(contextBody.context.assets.map((asset: any) => asset.kind)).toEqual(
        expect.arrayContaining(["github_repository", "product_goal"])
      );
    });
  });

  it("records clarification answers and readiness for an intake", async () => {
    await withServer(tempRoot, async baseUrl => {
      const intakeResponse = await fetch(`${baseUrl}/api/blueprint/intake`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: "project-clarify",
          targetText: "Create a clarification workflow before autopilot.",
          githubUrls: ["https://github.com/example/clarifier"],
        }),
      });
      const intake = ((await intakeResponse.json()) as Record<string, any>)
        .intake;

      const sessionResponse = await fetch(
        `${baseUrl}/api/blueprint/intake/${intake.id}/clarifications`,
        {
          method: "POST",
        }
      );
      expect(sessionResponse.status).toBe(201);
      const sessionBody = (await sessionResponse.json()) as Record<string, any>;
      expect(sessionBody.session.readiness).toMatchObject({
        status: "needs_answers",
        answeredRequired: 0,
        requiredTotal: 4,
      });
      expect(sessionBody.session.questions.map((question: any) => question.kind)).toEqual(
        ["goal", "audience", "constraint", "github", "domain"]
      );

      const answers = sessionBody.session.questions
        .filter((question: any) => question.required)
        .map((question: any) => ({
          questionId: question.id,
          answer: `Answer for ${question.kind}`,
        }));
      const answerResponse = await fetch(
        `${baseUrl}/api/blueprint/clarifications/${sessionBody.session.id}/answers`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answers }),
        }
      );
      expect(answerResponse.status).toBe(200);
      const answered = (await answerResponse.json()) as Record<string, any>;
      expect(answered.session.readiness).toMatchObject({
        status: "ready",
        answeredRequired: 4,
        requiredTotal: 4,
        missingQuestionIds: [],
      });
      expect(answered.session.answers).toHaveLength(4);

      const fetchedResponse = await fetch(
        `${baseUrl}/api/blueprint/clarifications/${sessionBody.session.id}`
      );
      expect(fetchedResponse.status).toBe(200);
      const fetched = (await fetchedResponse.json()) as Record<string, any>;
      expect(fetched.session.readiness.status).toBe("ready");
    });
  });

  it("creates a generation job from intake and clarification context", async () => {
    await withServer(tempRoot, async baseUrl => {
      const intakeResponse = await fetch(`${baseUrl}/api/blueprint/intake`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: "project-context-job",
          sourceId: "source-context-job",
          targetText: "Use intake context to seed the RouteSet.",
          githubUrls: ["https://github.com/example/context-job"],
        }),
      });
      const intake = ((await intakeResponse.json()) as Record<string, any>)
        .intake;

      const sessionResponse = await fetch(
        `${baseUrl}/api/blueprint/intake/${intake.id}/clarifications`,
        { method: "POST" }
      );
      const session = ((await sessionResponse.json()) as Record<string, any>)
        .session;
      const answers = session.questions
        .filter((question: any) => question.required)
        .map((question: any) => ({
          questionId: question.id,
          answer: `Resolved ${question.kind}`,
        }));
      const answerResponse = await fetch(
        `${baseUrl}/api/blueprint/clarifications/${session.id}/answers`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answers }),
        }
      );
      const answered = ((await answerResponse.json()) as Record<string, any>)
        .session;

      const createResponse = await fetch(`${baseUrl}/api/blueprint/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intakeId: intake.id,
          clarificationSessionId: answered.id,
        }),
      });
      expect(createResponse.status).toBe(201);
      const created = (await createResponse.json()) as Record<string, any>;
      expect(created.job.request).toMatchObject({
        intakeId: intake.id,
        clarificationSessionId: answered.id,
        projectId: "project-context-job",
        sourceId: "source-context-job",
        targetText: "Use intake context to seed the RouteSet.",
        githubUrls: ["https://github.com/example/context-job"],
      });
      expect(created.job.request.clarifications).toHaveLength(4);
      expect(created.intake.id).toBe(intake.id);
      expect(created.clarificationSession.id).toBe(answered.id);
      expect(created.projectContext).toMatchObject({
        projectId: "project-context-job",
        sourceIds: ["blueprint-source-example-context-job"],
      });
      expect(created.job.artifacts.map((artifact: any) => artifact.type)).toEqual(
        [
          "intake",
          "github_source",
          "clarification_session",
          "project_context",
          "route_set",
        ]
      );
      expect(
        created.routeSet.routes[0].capabilities.map(
          (capability: any) => capability.id
        )
      ).toContain("mcp-github-source");
      expect(created.routeSet.provenance).toMatchObject({
        projectId: "project-context-job",
        sourceId: "source-context-job",
        githubUrls: ["https://github.com/example/context-job"],
      });
    });
  });

  it("updates SPEC tree nodes and saves version snapshots", async () => {
    await withServer(tempRoot, async baseUrl => {
      const selected = await createSelectedSpecTree(baseUrl);
      const nodeId = selected.specTree.nodes.find(
        (node: Record<string, any>) => node.type === "route_step"
      )?.id;

      expect(nodeId).toBeTruthy();

      const patchResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/${selected.job.id}/spec-tree/nodes/${nodeId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: "Clarify product scope and acceptance",
            summary: "Refine the entry conditions for the first route step.",
            status: "accepted",
            priority: 9,
            outputs: ["scope notes", "acceptance criteria", "scope notes"],
          }),
        }
      );

      expect(patchResponse.status).toBe(200);
      const patched = (await patchResponse.json()) as Record<string, any>;
      expect(patched.node).toMatchObject({
        id: nodeId,
        title: "Clarify product scope and acceptance",
        summary: "Refine the entry conditions for the first route step.",
        status: "accepted",
        priority: 9,
        outputs: ["scope notes", "acceptance criteria"],
      });
      expect(patched.specTree.version).toBe(2);
      expect(
        patched.job.artifacts.find(
          (artifact: any) => artifact.type === "spec_tree"
        )?.payload
      ).toMatchObject({
        version: 2,
        updatedAt: "2026-05-06T00:00:00.000Z",
      });

      const versionResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/${selected.job.id}/spec-tree/versions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: "Baseline snapshot",
            summary: "Saved after node update.",
            savedBy: "tester",
          }),
        }
      );

      expect(versionResponse.status).toBe(201);
      const versioned = (await versionResponse.json()) as Record<string, any>;
      expect(versioned.version).toMatchObject({
        treeId: patched.specTree.id,
        version: patched.specTree.version,
        title: "Baseline snapshot",
        summary: "Saved after node update.",
        savedBy: "tester",
      });
      expect(
        versioned.job.artifacts.some(
          (artifact: any) => artifact.type === "spec_tree_version"
        )
      ).toBe(true);

      const reloaded = await fetch(
        `${baseUrl}/api/blueprint/jobs/${selected.job.id}`
      );
      const reloadedBody = (await reloaded.json()) as Record<string, any>;
      expect(
        reloadedBody.job.artifacts.filter(
          (artifact: any) => artifact.type === "spec_tree_version"
        )
      ).toHaveLength(1);
    });
  });

  it("runs SPEC tree structure actions and restores a saved version", async () => {
    await withServer(tempRoot, async baseUrl => {
      const selected = await createSelectedSpecTree(baseUrl);
      const rootId = selected.specTree.rootNodeId;
      const root = selected.specTree.nodes.find(
        (node: Record<string, any>) => node.id === rootId
      );
      const initialChildCount = root.children.length;

      const baselineResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/${selected.job.id}/spec-tree/versions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: "Structure baseline",
          }),
        }
      );
      expect(baselineResponse.status).toBe(201);
      const baseline = (await baselineResponse.json()) as Record<string, any>;

      const runAction = async (request: Record<string, unknown>) => {
        const response = await fetch(
          `${baseUrl}/api/blueprint/jobs/${selected.job.id}/spec-tree/actions`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(request),
          }
        );
        expect(response.status).toBe(200);
        return (await response.json()) as Record<string, any>;
      };

      const added = await runAction({
        action: "add_node",
        parentId: rootId,
        title: "Workbench structure API",
        summary: "Backend action contract for tree editing.",
        outputs: ["structure endpoint"],
      });
      expect(added.specTree.version).toBe(2);
      expect(added.node).toMatchObject({
        title: "Workbench structure API",
        parentId: rootId,
        status: "draft",
      });
      expect(
        added.specTree.nodes.find((node: any) => node.id === rootId).children
      ).toContain(added.node.id);

      const split = await runAction({
        action: "split_node",
        sourceNodeId: added.node.id,
        title: "Workbench split child",
        placement: "child",
        outputs: ["split output"],
      });
      expect(split.specTree.version).toBe(3);
      expect(split.node).toMatchObject({
        title: "Workbench split child",
        parentId: added.node.id,
        status: "draft",
        outputs: ["split output"],
      });

      const moved = await runAction({
        action: "move_node",
        nodeId: split.node.id,
        parentId: rootId,
        priority: 1,
      });
      expect(moved.specTree.version).toBe(4);
      expect(moved.node).toMatchObject({
        id: split.node.id,
        parentId: rootId,
        priority: 1,
      });
      expect(
        moved.specTree.nodes.find((node: any) => node.id === added.node.id)
          .children
      ).not.toContain(split.node.id);

      const merged = await runAction({
        action: "merge_nodes",
        sourceNodeId: split.node.id,
        targetNodeId: added.node.id,
      });
      expect(merged.specTree.version).toBe(5);
      expect(merged.node.outputs).toEqual(
        expect.arrayContaining(["structure endpoint", "split output"])
      );
      expect(
        merged.specTree.nodes.some((node: any) => node.id === split.node.id)
      ).toBe(false);

      const deleted = await runAction({
        action: "delete_node",
        nodeId: added.node.id,
      });
      expect(deleted.specTree.version).toBe(6);
      expect(
        deleted.specTree.nodes.some((node: any) => node.id === added.node.id)
      ).toBe(false);

      const restored = await runAction({
        action: "set_current_version",
        versionId: baseline.version.id,
      });
      expect(restored.specTree.version).toBe(7);
      expect(restored.version.id).toBe(baseline.version.id);
      expect(
        restored.specTree.nodes.find((node: any) => node.id === rootId).children
      ).toHaveLength(initialChildCount);
      expect(
        restored.specTree.nodes.some((node: any) => node.id === added.node.id)
      ).toBe(false);
      expect(restored.job.events).toHaveLength(selected.job.events.length + 7);
      expect(restored.job.events.at(-1).payload).toMatchObject({
        action: "set_current_version",
        versionId: baseline.version.id,
        version: 7,
      });
    });
  });

  it("generates and reads node-level SPEC documents from a SPEC tree", async () => {
    await withServer(tempRoot, async baseUrl => {
      const selected = await createSelectedSpecTree(baseUrl);

      const generateResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/${selected.job.id}/spec-documents`,
        {
          method: "POST",
        }
      );

      expect(generateResponse.status).toBe(201);
      const generated = (await generateResponse.json()) as Record<string, any>;
      expect(generated.job).toMatchObject({
        id: selected.job.id,
        stage: "spec_docs",
        status: "reviewing",
        updatedAt: "2026-05-06T00:00:00.000Z",
      });
      expect(generated.documents).toHaveLength(
        selected.specTree.nodes.length * 3
      );
      expect(
        generated.documents.map((document: any) => document.type)
      ).toContain("requirements");
      expect(
        generated.documents.map((document: any) => document.type)
      ).toContain("design");
      expect(
        generated.documents.map((document: any) => document.type)
      ).toContain("tasks");

      const requirements = generated.documents.find(
        (document: any) =>
          document.type === "requirements" &&
          document.nodeId === selected.specTree.rootNodeId
      );
      expect(requirements).toMatchObject({
        jobId: selected.job.id,
        treeId: selected.specTree.id,
        nodeId: selected.specTree.rootNodeId,
        status: "draft",
        version: 1,
        sourceDocumentId: requirements.id,
        format: "markdown",
        provenance: {
          treeVersion: selected.specTree.version,
          nodeType: "root",
        },
      });
      expect(requirements.content).toContain("# Requirements:");
      expect(requirements.content).toContain("## Derived Content");

      expect(
        generated.job.artifacts.filter((artifact: any) =>
          ["requirements", "design", "tasks"].includes(artifact.type)
        )
      ).toHaveLength(generated.documents.length);

      const readResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/${selected.job.id}/spec-documents`
      );
      expect(readResponse.status).toBe(200);
      const read = (await readResponse.json()) as Record<string, any>;
      expect(read.specTree.id).toBe(selected.specTree.id);
      expect(read.documents).toHaveLength(generated.documents.length);
      expect(read.documents[0]).toMatchObject({
        jobId: selected.job.id,
        treeId: selected.specTree.id,
      });
    });
  });

  it("saves SPEC document versions and accepts review decisions", async () => {
    await withServer(tempRoot, async baseUrl => {
      const selected = await createSelectedSpecTree(baseUrl);
      const generateResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/${selected.job.id}/spec-documents`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nodeId: selected.specTree.rootNodeId,
            types: ["requirements"],
          }),
        }
      );
      expect(generateResponse.status).toBe(201);
      const generated = (await generateResponse.json()) as Record<string, any>;
      const document = generated.documents[0];

      const versionResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/${selected.job.id}/spec-documents/${document.id}/versions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            savedBy: "reviewer-1",
            reviewNote: "Ready for formal review.",
          }),
        }
      );

      expect(versionResponse.status).toBe(201);
      const versioned = (await versionResponse.json()) as Record<string, any>;
      expect(versioned.document).toMatchObject({
        id: document.id,
        sourceDocumentId: document.id,
        status: "draft",
        version: 2,
        reviewNote: "Ready for formal review.",
      });
      expect(versioned.version).toMatchObject({
        documentId: document.id,
        sourceDocumentId: document.id,
        version: 2,
        status: "draft",
        savedBy: "reviewer-1",
        reviewNote: "Ready for formal review.",
      });

      const acceptResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/${selected.job.id}/spec-documents/${document.id}/review`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: "accepted",
            reviewedBy: "approver-1",
            reviewNote: "Approved for landing.",
          }),
        }
      );

      expect(acceptResponse.status).toBe(200);
      const accepted = (await acceptResponse.json()) as Record<string, any>;
      expect(accepted.document).toMatchObject({
        id: document.id,
        status: "accepted",
        version: 2,
        reviewedAt: "2026-05-06T00:00:00.000Z",
        acceptedAt: "2026-05-06T00:00:00.000Z",
        reviewedBy: "approver-1",
        reviewNote: "Approved for landing.",
      });
      expect(accepted.document.rejectedAt).toBeUndefined();

      const latestResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/latest`
      );
      expect(latestResponse.status).toBe(200);
      const latest = (await latestResponse.json()) as Record<string, any>;
      expect(latest.specDocuments[0]).toMatchObject({
        id: document.id,
        status: "accepted",
        version: 2,
      });
      expect(latest.specDocumentVersions).toHaveLength(1);
      expect(latest.specDocumentVersions[0]).toMatchObject({
        sourceDocumentId: document.id,
        version: 2,
      });
    });
  });

  it("rejects SPEC document reviews with invalid status or missing documents", async () => {
    await withServer(tempRoot, async baseUrl => {
      const selected = await createSelectedSpecTree(baseUrl);
      const generateResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/${selected.job.id}/spec-documents`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nodeId: selected.specTree.rootNodeId,
            types: ["design"],
          }),
        }
      );
      const generated = (await generateResponse.json()) as Record<string, any>;
      const document = generated.documents[0];

      const rejectResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/${selected.job.id}/spec-documents/${document.id}/review`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: "rejected",
            reviewedBy: "reviewer-2",
            reviewNote: "Needs tighter acceptance criteria.",
          }),
        }
      );
      expect(rejectResponse.status).toBe(200);
      const rejected = (await rejectResponse.json()) as Record<string, any>;
      expect(rejected.document).toMatchObject({
        id: document.id,
        status: "rejected",
        rejectedAt: "2026-05-06T00:00:00.000Z",
        reviewedBy: "reviewer-2",
      });
      expect(rejected.document.acceptedAt).toBeUndefined();

      const invalidStatusResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/${selected.job.id}/spec-documents/${document.id}/review`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "published" }),
        }
      );
      expect(invalidStatusResponse.status).toBe(400);

      const missingReviewResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/${selected.job.id}/spec-documents/missing-document/review`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "accepted" }),
        }
      );
      expect(missingReviewResponse.status).toBe(404);

      const missingVersionResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/${selected.job.id}/spec-documents/missing-document/versions`,
        {
          method: "POST",
        }
      );
      expect(missingVersionResponse.status).toBe(404);
    });
  });

  it("generates effect previews from accepted SPEC documents", async () => {
    await withServer(tempRoot, async baseUrl => {
      const selected = await createSelectedSpecTree(baseUrl);
      const generateDocumentsResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/${selected.job.id}/spec-documents`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nodeId: selected.specTree.rootNodeId,
          }),
        }
      );
      expect(generateDocumentsResponse.status).toBe(201);
      const generatedDocuments =
        (await generateDocumentsResponse.json()) as Record<string, any>;

      for (const document of generatedDocuments.documents) {
        const reviewResponse = await fetch(
          `${baseUrl}/api/blueprint/jobs/${selected.job.id}/spec-documents/${document.id}/review`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              status: "accepted",
              reviewedBy: "preview-reviewer",
            }),
          }
        );
        expect(reviewResponse.status).toBe(200);
      }

      const previewResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/${selected.job.id}/effect-previews`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nodeId: selected.specTree.rootNodeId,
          }),
        }
      );

      expect(previewResponse.status).toBe(201);
      const preview = (await previewResponse.json()) as Record<string, any>;
      expect(preview.job).toMatchObject({
        id: selected.job.id,
        stage: "effect_preview",
        status: "reviewing",
      });
      expect(preview.effectPreviews).toHaveLength(1);
      expect(preview.effectPreviews[0]).toMatchObject({
        jobId: selected.job.id,
        treeId: selected.specTree.id,
        nodeId: selected.specTree.rootNodeId,
        status: "completed",
        createdAt: "2026-05-06T00:00:00.000Z",
        provenance: {
          sourceStatus: "accepted",
          includeDrafts: false,
          treeVersion: selected.specTree.version,
          nodeType: "root",
        },
      });
      expect(preview.effectPreviews[0].sourceDocumentIds).toHaveLength(3);
      expect(preview.effectPreviews[0].architectureNotes).toHaveLength(3);
      expect(preview.effectPreviews[0].prototypeNotes).toHaveLength(3);
      expect(preview.effectPreviews[0].progressPlan).toHaveLength(3);
      expect(
        preview.job.artifacts.filter(
          (artifact: any) => artifact.type === "effect_preview"
        )
      ).toHaveLength(1);

      const latestResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/latest`
      );
      const latest = (await latestResponse.json()) as Record<string, any>;
      expect(latest.effectPreviews).toHaveLength(1);
      expect(latest.effectPreviews[0].nodeId).toBe(
        selected.specTree.rootNodeId
      );
    });
  });

  it("generates draft-source effect previews when includeDrafts is enabled", async () => {
    await withServer(tempRoot, async baseUrl => {
      const selected = await createSelectedSpecTree(baseUrl);
      const targetNode = selected.specTree.nodes.find(
        (node: Record<string, any>) => node.type === "effect_preview"
      );
      expect(targetNode).toBeTruthy();

      const generateDocumentsResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/${selected.job.id}/spec-documents`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nodeId: targetNode.id,
            types: ["requirements"],
          }),
        }
      );
      expect(generateDocumentsResponse.status).toBe(201);

      const rejectedDefaultResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/${selected.job.id}/effect-previews`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nodeId: targetNode.id,
          }),
        }
      );
      expect(rejectedDefaultResponse.status).toBe(409);

      const previewResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/${selected.job.id}/effect-previews`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nodeId: targetNode.id,
            includeDrafts: true,
          }),
        }
      );

      expect(previewResponse.status).toBe(201);
      const preview = (await previewResponse.json()) as Record<string, any>;
      expect(preview.effectPreviews).toHaveLength(1);
      expect(preview.effectPreviews[0]).toMatchObject({
        nodeId: targetNode.id,
        status: "preview",
        provenance: {
          sourceStatus: "draft",
          includeDrafts: true,
        },
      });
      expect(
        Object.values(
          preview.effectPreviews[0].provenance.sourceDocumentStatuses
        )
      ).toEqual(["draft"]);
    });
  });

  it("reads and filters effect previews by nodeId", async () => {
    await withServer(tempRoot, async baseUrl => {
      const selected = await createSelectedSpecTree(baseUrl);
      const routeStepNode = selected.specTree.nodes.find(
        (node: Record<string, any>) => node.type === "route_step"
      );
      expect(routeStepNode).toBeTruthy();

      const rootDocumentsResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/${selected.job.id}/spec-documents`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nodeId: selected.specTree.rootNodeId,
            types: ["requirements"],
          }),
        }
      );
      const rootDocuments =
        (await rootDocumentsResponse.json()) as Record<string, any>;
      const routeStepDocumentsResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/${selected.job.id}/spec-documents`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nodeId: routeStepNode.id,
            types: ["design"],
          }),
        }
      );
      const routeStepDocuments =
        (await routeStepDocumentsResponse.json()) as Record<string, any>;

      for (const document of rootDocuments.documents.concat(
        routeStepDocuments.documents
      )) {
        const reviewResponse = await fetch(
          `${baseUrl}/api/blueprint/jobs/${selected.job.id}/spec-documents/${document.id}/review`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "accepted" }),
          }
        );
        expect(reviewResponse.status).toBe(200);
      }

      const generatePreviewsResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/${selected.job.id}/effect-previews`,
        {
          method: "POST",
        }
      );
      expect(generatePreviewsResponse.status).toBe(201);
      const generated = (await generatePreviewsResponse.json()) as Record<
        string,
        any
      >;
      expect(generated.effectPreviews).toHaveLength(2);

      const readResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/${selected.job.id}/effect-previews`
      );
      expect(readResponse.status).toBe(200);
      const read = (await readResponse.json()) as Record<string, any>;
      expect(read.effectPreviews).toHaveLength(2);

      const filteredResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/${selected.job.id}/effect-previews?nodeId=${encodeURIComponent(routeStepNode.id)}`
      );
      expect(filteredResponse.status).toBe(200);
      const filtered = (await filteredResponse.json()) as Record<string, any>;
      expect(filtered.effectPreviews).toHaveLength(1);
      expect(filtered.effectPreviews[0]).toMatchObject({
        nodeId: routeStepNode.id,
        provenance: {
          nodeTitle: routeStepNode.title,
          sourceStatus: "accepted",
        },
      });
    });
  });

  it("generates implementation prompt packages from accepted SPEC documents and previews", async () => {
    await withServer(tempRoot, async baseUrl => {
      const { selected, documents, preview } =
        await createAcceptedRootDocsAndPreview(baseUrl);

      const packageResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/${selected.job.id}/prompt-packages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nodeId: selected.specTree.rootNodeId,
          }),
        }
      );

      expect(packageResponse.status).toBe(201);
      const packaged = (await packageResponse.json()) as Record<string, any>;
      expect(packaged.job).toMatchObject({
        id: selected.job.id,
        stage: "prompt_packaging",
        status: "reviewing",
      });
      expect(packaged.promptPackages).toHaveLength(3);
      expect(
        packaged.promptPackages.map((promptPackage: any) =>
          promptPackage.targetPlatform
        )
      ).toEqual(expect.arrayContaining(["codex", "claude", "cursor"]));

      const codexPackage = packaged.promptPackages.find(
        (promptPackage: any) => promptPackage.targetPlatform === "codex"
      );
      expect(codexPackage).toMatchObject({
        jobId: selected.job.id,
        treeId: selected.specTree.id,
        nodeIds: [selected.specTree.rootNodeId],
        sourceDocumentIds: documents.map((document: any) => document.id),
        sourcePreviewIds: [preview.id],
        targetPlatform: "codex",
        createdAt: "2026-05-06T00:00:00.000Z",
        provenance: {
          sourceDocumentStatus: "accepted",
          sourcePreviewStatus: "accepted",
          includeDrafts: false,
          includePreviewDrafts: false,
        },
      });
      expect(codexPackage.sections.map((section: any) => section.kind)).toEqual(
        ["context", "implementation", "constraints", "verification", "handoff"]
      );
      expect(codexPackage.content).toContain("Effect preview:");
      expect(codexPackage.content).toContain("Source previews:");
      expect(
        packaged.job.artifacts.filter(
          (artifact: any) => artifact.type === "prompt_pack"
        )
      ).toHaveLength(3);

      const latestResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/latest`
      );
      const latest = (await latestResponse.json()) as Record<string, any>;
      expect(latest.promptPackages).toHaveLength(3);
      expect(latest.promptPackages[0]).toHaveProperty("content");
    });
  });

  it("generates multiple implementation prompt platforms and filters GET results", async () => {
    await withServer(tempRoot, async baseUrl => {
      const { selected } = await createAcceptedRootDocsAndPreview(baseUrl);

      const packageResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/${selected.job.id}/prompt-packages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nodeId: selected.specTree.rootNodeId,
            targetPlatforms: ["cursor", "kiro", "windsurf", "cursor"],
          }),
        }
      );
      expect(packageResponse.status).toBe(201);
      const packaged = (await packageResponse.json()) as Record<string, any>;
      expect(packaged.promptPackages).toHaveLength(3);
      expect(
        packaged.promptPackages.map((promptPackage: any) =>
          promptPackage.targetPlatform
        )
      ).toEqual(expect.arrayContaining(["cursor", "kiro", "windsurf"]));

      const kiroResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/${selected.job.id}/prompt-packages?targetPlatform=kiro`
      );
      expect(kiroResponse.status).toBe(200);
      const kiro = (await kiroResponse.json()) as Record<string, any>;
      expect(kiro.promptPackages).toHaveLength(1);
      expect(kiro.promptPackages[0]).toMatchObject({
        targetPlatform: "kiro",
        target: { label: "Kiro" },
      });

      const multiResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/${selected.job.id}/prompt-packages?targetPlatforms=cursor,windsurf`
      );
      expect(multiResponse.status).toBe(200);
      const multi = (await multiResponse.json()) as Record<string, any>;
      expect(multi.promptPackages).toHaveLength(2);
      expect(
        multi.promptPackages.map((promptPackage: any) =>
          promptPackage.targetPlatform
        )
      ).toEqual(expect.arrayContaining(["cursor", "windsurf"]));

      const invalidResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/${selected.job.id}/prompt-packages?targetPlatform=unknown`
      );
      expect(invalidResponse.status).toBe(400);
    });
  });

  it("generates document-only implementation prompt packages with includeDrafts when previews are missing", async () => {
    await withServer(tempRoot, async baseUrl => {
      const selected = await createSelectedSpecTree(baseUrl);
      const generateDocumentsResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/${selected.job.id}/spec-documents`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nodeId: selected.specTree.rootNodeId,
            types: ["requirements", "tasks"],
          }),
        }
      );
      expect(generateDocumentsResponse.status).toBe(201);

      const defaultResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/${selected.job.id}/prompt-packages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nodeId: selected.specTree.rootNodeId,
            targetPlatforms: ["codex"],
          }),
        }
      );
      expect(defaultResponse.status).toBe(409);

      const packageResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/${selected.job.id}/prompt-packages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nodeId: selected.specTree.rootNodeId,
            targetPlatforms: ["codex"],
            includeDrafts: true,
          }),
        }
      );

      expect(packageResponse.status).toBe(201);
      const packaged = (await packageResponse.json()) as Record<string, any>;
      expect(packaged.promptPackages).toHaveLength(1);
      expect(packaged.promptPackages[0]).toMatchObject({
        targetPlatform: "codex",
        sourcePreviewIds: [],
        provenance: {
          sourceDocumentStatus: "draft",
          sourcePreviewStatus: "missing",
          includeDrafts: true,
        },
      });
      expect(packaged.promptPackages[0].content).toContain(
        "Source previews: none"
      );
    });
  });

  it("generates engineering landing plans from prompt packages and exposes latest details", async () => {
    await withServer(tempRoot, async baseUrl => {
      const { selected, promptPackages } = await createRootPromptPackages(
        baseUrl,
        ["codex", "kiro"]
      );
      const codexPackage = promptPackages.find(
        (promptPackage: any) => promptPackage.targetPlatform === "codex"
      );
      expect(codexPackage).toBeTruthy();

      const landingResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/${selected.job.id}/engineering-landing`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            promptPackageId: codexPackage.id,
          }),
        }
      );

      expect(landingResponse.status).toBe(201);
      const landed = (await landingResponse.json()) as Record<string, any>;
      expect(landed.job).toMatchObject({
        id: selected.job.id,
        stage: "engineering_landing",
        status: "reviewing",
      });
      expect(landed.engineeringLandingPlans).toHaveLength(1);

      const plan = landed.engineeringLandingPlans[0];
      expect(plan).toMatchObject({
        jobId: selected.job.id,
        treeId: selected.specTree.id,
        status: "ready",
        title: "Engineering landing plan: Codex",
        promptPackageIds: [codexPackage.id],
        provenance: {
          treeVersion: selected.specTree.version,
          sourceDocumentStatus: "accepted",
          sourcePreviewStatus: "accepted",
        },
      });
      expect(plan.steps.map((step: any) => step.mode)).toEqual([
        "automatic",
        "manual",
        "handoff",
      ]);
      expect(plan.steps[0]).toMatchObject({
        fileScopes: ["shared/blueprint/contracts.ts"],
        riskLevel: "low",
      });
      expect(plan.steps[1]).toMatchObject({
        fileScopes: ["server/routes/blueprint.ts"],
        riskLevel: "medium",
      });
      expect(plan.steps[2]).toMatchObject({
        fileScopes: ["server/tests/blueprint-routes.test.ts"],
        riskLevel: "medium",
      });
      expect(
        plan.steps.every((step: any) =>
          step.verificationCommands.includes(BLUEPRINT_ROUTE_TEST_COMMAND)
        )
      ).toBe(true);
      expect(plan.handoffs).toHaveLength(1);
      expect(plan.handoffs[0]).toMatchObject({
        platform: "codex",
        promptPackageId: codexPackage.id,
        sourceNodeIds: [selected.specTree.rootNodeId],
        verificationCommands: [BLUEPRINT_ROUTE_TEST_COMMAND],
      });
      expect(
        landed.job.artifacts.filter(
          (artifact: any) => artifact.type === "engineering_plan"
        )
      ).toHaveLength(1);

      const readResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/${selected.job.id}/engineering-landing`
      );
      expect(readResponse.status).toBe(200);
      const read = (await readResponse.json()) as Record<string, any>;
      expect(read.engineeringLandingPlans).toHaveLength(1);
      expect(read.engineeringLandingPlans[0].id).toBe(plan.id);

      const latestResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/latest`
      );
      const latest = (await latestResponse.json()) as Record<string, any>;
      expect(latest.engineeringLandingPlans).toHaveLength(1);
      expect(latest.engineeringLandingPlans[0].id).toBe(plan.id);
      expect(latest.engineeringRuns).toEqual([]);
    });
  });

  it("generates platform engineering handoffs with platform filters", async () => {
    await withServer(tempRoot, async baseUrl => {
      const { selected } = await createRootPromptPackages(baseUrl, [
        "cursor",
        "kiro",
        "windsurf",
      ]);

      const landingResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/${selected.job.id}/engineering-landing`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            targetPlatforms: ["kiro", "windsurf"],
          }),
        }
      );

      expect(landingResponse.status).toBe(201);
      const landed = (await landingResponse.json()) as Record<string, any>;
      expect(landed.engineeringLandingPlans).toHaveLength(2);
      const handoffPlatforms = landed.engineeringLandingPlans.map(
        (plan: any) => plan.handoffs[0].platform
      );
      expect(handoffPlatforms).toEqual(
        expect.arrayContaining(["kiro", "windsurf"])
      );
      expect(handoffPlatforms).not.toContain("cursor");

      for (const plan of landed.engineeringLandingPlans) {
        const promptPackageId = plan.promptPackageIds[0];
        const handoff = plan.handoffs[0];
        expect(plan.provenance.promptPackagePlatforms[promptPackageId]).toBe(
          handoff.platform
        );
        expect(handoff.promptPackageId).toBe(promptPackageId);
        expect(handoff.content).toContain("## Landing Steps");
        expect(handoff.content).toContain("## Verification");
        expect(handoff.content).toContain(BLUEPRINT_ROUTE_TEST_COMMAND);
      }

      const readResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/${selected.job.id}/engineering-landing`
      );
      const read = (await readResponse.json()) as Record<string, any>;
      expect(read.engineeringLandingPlans).toHaveLength(2);
    });
  });

  it("records engineering runs against landing plans and reads run artifacts", async () => {
    await withServer(tempRoot, async baseUrl => {
      const { selected, promptPackages } = await createRootPromptPackages(
        baseUrl,
        ["codex"]
      );
      const landingResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/${selected.job.id}/engineering-landing`,
        {
          method: "POST",
        }
      );
      expect(landingResponse.status).toBe(201);
      const landed = (await landingResponse.json()) as Record<string, any>;
      const plan = landed.engineeringLandingPlans[0];

      const runResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/${selected.job.id}/engineering-runs`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            landingPlanId: plan.id,
            status: "passed",
            summary: "Applied the engineering landing bridge.",
            logs: ["Contracts added", "Router endpoints added"],
            verificationResults: [
              {
                command: BLUEPRINT_ROUTE_TEST_COMMAND,
                status: "passed",
                output: "blueprint routes passed",
                durationMs: 1250,
              },
            ],
            changedFiles: [
              "shared/blueprint/contracts.ts",
              "server/routes/blueprint.ts",
              "server/tests/blueprint-routes.test.ts",
            ],
          }),
        }
      );

      expect(runResponse.status).toBe(201);
      const recorded = (await runResponse.json()) as Record<string, any>;
      expect(recorded.job).toMatchObject({
        id: selected.job.id,
        stage: "engineering_landing",
        status: "completed",
      });
      expect(recorded.engineeringLandingPlan.id).toBe(plan.id);
      expect(recorded.engineeringRun).toMatchObject({
        jobId: selected.job.id,
        landingPlanId: plan.id,
        status: "passed",
        startedAt: "2026-05-06T00:00:00.000Z",
        completedAt: "2026-05-06T00:00:00.000Z",
        summary: "Applied the engineering landing bridge.",
        changedFiles: [
          "shared/blueprint/contracts.ts",
          "server/routes/blueprint.ts",
          "server/tests/blueprint-routes.test.ts",
        ],
        promptPackageIds: [promptPackages[0].id],
        provenance: {
          treeId: selected.specTree.id,
          treeVersion: selected.specTree.version,
        },
      });
      expect(recorded.engineeringRun.verificationResults).toEqual([
        {
          command: BLUEPRINT_ROUTE_TEST_COMMAND,
          status: "passed",
          output: "blueprint routes passed",
          durationMs: 1250,
        },
      ]);
      expect(
        recorded.job.artifacts.filter(
          (artifact: any) => artifact.type === "engineering_run"
        )
      ).toHaveLength(1);
      expect(recorded.job.events[recorded.job.events.length - 1]).toMatchObject(
        {
          type: "job.completed",
          stage: "engineering_landing",
          status: "completed",
          payload: {
            landingPlanId: plan.id,
            status: "passed",
          },
        }
      );

      const runsResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/${selected.job.id}/engineering-runs`
      );
      expect(runsResponse.status).toBe(200);
      const runs = (await runsResponse.json()) as Record<string, any>;
      expect(runs.engineeringLandingPlans).toHaveLength(1);
      expect(runs.engineeringRuns).toHaveLength(1);
      expect(runs.engineeringRuns[0].id).toBe(recorded.engineeringRun.id);

      const latestResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/latest`
      );
      const latest = (await latestResponse.json()) as Record<string, any>;
      expect(latest.engineeringRuns).toHaveLength(1);
      expect(latest.engineeringRuns[0].id).toBe(recorded.engineeringRun.id);
    });
  });

  it("builds artifact ledger, replay snapshots, diffs, and feedback backfills", async () => {
    await withServer(tempRoot, async baseUrl => {
      const { selected, promptPackages } = await createRootPromptPackages(
        baseUrl,
        ["codex"]
      );
      const landingResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/${selected.job.id}/engineering-landing`,
        {
          method: "POST",
        }
      );
      expect(landingResponse.status).toBe(201);
      const landed = (await landingResponse.json()) as Record<string, any>;
      const plan = landed.engineeringLandingPlans[0];

      const runResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/${selected.job.id}/engineering-runs`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            landingPlanId: plan.id,
            status: "passed",
            summary: "Artifact memory test run.",
            verificationResults: [
              {
                command: BLUEPRINT_ROUTE_TEST_COMMAND,
                status: "passed",
              },
            ],
            changedFiles: ["server/routes/blueprint.ts"],
          }),
        }
      );
      expect(runResponse.status).toBe(201);
      const recorded = (await runResponse.json()) as Record<string, any>;

      const ledgerResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/${selected.job.id}/artifact-ledger`
      );
      expect(ledgerResponse.status).toBe(200);
      const ledger = (await ledgerResponse.json()) as Record<string, any>;
      const entries = ledger.entries as any[];
      expect(entries.length).toBeGreaterThan(8);
      expect(entries.map(entry => entry.artifactType)).toEqual(
        expect.arrayContaining([
          "route_set",
          "spec_tree",
          "requirements",
          "effect_preview",
          "prompt_pack",
          "engineering_plan",
          "engineering_run",
          "event",
        ])
      );

      const routeEntry = entries.find(entry => entry.artifactType === "route_set");
      const runEntry = entries.find(
        entry => entry.artifactType === "engineering_run"
      );
      expect(routeEntry).toBeTruthy();
      expect(runEntry).toMatchObject({
        stage: "engineering_landing",
        sourceIds: {
          promptPackageIds: [promptPackages[0].id],
          landingPlanIds: [plan.id],
          engineeringRunIds: [recorded.engineeringRun.id],
        },
      });

      const replayResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/${selected.job.id}/artifact-replay`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: "Full artifact replay",
            tags: ["memory-test"],
          }),
        }
      );
      expect(replayResponse.status).toBe(201);
      const replayed = (await replayResponse.json()) as Record<string, any>;
      expect(replayed.replay.timelineEntries).toHaveLength(entries.length);
      expect(replayed.replay.stageCounts.engineering_landing).toBeGreaterThan(0);
      expect(replayed.replay.lineageEdges.length).toBeGreaterThan(0);

      const replaysResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/${selected.job.id}/artifact-replays`
      );
      expect(replaysResponse.status).toBe(200);
      const replays = (await replaysResponse.json()) as Record<string, any>;
      expect(replays.replays).toHaveLength(1);

      const diffResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/${selected.job.id}/artifact-diff`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            leftEntryId: routeEntry.id,
            rightEntryId: runEntry.id,
          }),
        }
      );
      expect(diffResponse.status).toBe(200);
      const diff = (await diffResponse.json()) as Record<string, any>;
      expect(diff.diff).toMatchObject({
        leftEntryId: routeEntry.id,
        rightEntryId: runEntry.id,
      });
      expect(diff.diff.changedFields.length).toBeGreaterThan(0);

      const feedbackResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/${selected.job.id}/artifact-feedback`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entryId: runEntry.id,
            kind: "backfill",
            message: "Execution evidence is ready for future SPEC evolution.",
            createdBy: "artifact-reviewer",
            tags: ["verified"],
            payloadSummary: {
              verified: true,
            },
          }),
        }
      );
      expect(feedbackResponse.status).toBe(201);
      const feedback = (await feedbackResponse.json()) as Record<string, any>;
      expect(feedback.feedback).toMatchObject({
        jobId: selected.job.id,
        entryId: runEntry.id,
        kind: "backfill",
        createdBy: "artifact-reviewer",
        tags: expect.arrayContaining(["verified"]),
        payloadSummary: {
          verified: true,
        },
      });

      const latestResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/latest`
      );
      const latest = (await latestResponse.json()) as Record<string, any>;
      expect(latest.artifactLedgerEntries.length).toBeGreaterThan(
        entries.length
      );
      expect(latest.artifactReplays).toHaveLength(1);
      expect(latest.artifactFeedback).toHaveLength(1);
    });
  });

  it("invokes runtime capabilities and exposes ledger, latest, and run source ids", async () => {
    await withServer(tempRoot, async baseUrl => {
      const { selected, promptPackages } = await createRootPromptPackages(
        baseUrl,
        ["codex"]
      );
      const rootNodeId = selected.specTree.rootNodeId;
      const routeId = selected.selection.routeId;

      const capabilitiesResponse = await fetch(
        `${baseUrl}/api/blueprint/capabilities`
      );
      expect(capabilitiesResponse.status).toBe(200);
      const capabilityRegistry =
        (await capabilitiesResponse.json()) as Record<string, any>;
      expect(capabilityRegistry.capabilities.map((item: any) => item.kind)).toEqual(
        expect.arrayContaining(["docker", "mcp", "skill", "aigc_node", "role"])
      );

      const invokeResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/${selected.job.id}/capability-invocations`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            capabilityId: "skill-svg-architecture",
            routeId,
            nodeId: rootNodeId,
            input: "Create deterministic architecture evidence.",
            requestedBy: "runtime-test",
            evidenceTags: ["focused"],
          }),
        }
      );
      expect(invokeResponse.status).toBe(201);
      const invoked = (await invokeResponse.json()) as Record<string, any>;
      expect(invoked.invocation).toMatchObject({
        capabilityId: "skill-svg-architecture",
        status: "completed",
        nodeId: rootNodeId,
        safetyGate: {
          status: "allowed",
          requiresApproval: false,
        },
      });
      expect(invoked.evidence).toMatchObject({
        invocationId: invoked.invocation.id,
        capabilityId: "skill-svg-architecture",
        kind: "diagram",
        status: "recorded",
      });

      const invocationListResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/${selected.job.id}/capability-invocations?capabilityId=skill-svg-architecture`
      );
      expect(invocationListResponse.status).toBe(200);
      const invocationList =
        (await invocationListResponse.json()) as Record<string, any>;
      expect(invocationList.capabilities).toHaveLength(5);
      expect(invocationList.invocations).toHaveLength(1);

      const evidenceResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/${selected.job.id}/capability-evidence?nodeId=${encodeURIComponent(rootNodeId)}`
      );
      expect(evidenceResponse.status).toBe(200);
      const evidenceList = (await evidenceResponse.json()) as Record<string, any>;
      expect(evidenceList.evidence.map((item: any) => item.id)).toContain(
        invoked.evidence.id
      );

      const landingResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/${selected.job.id}/engineering-landing`,
        {
          method: "POST",
        }
      );
      expect(landingResponse.status).toBe(201);
      const landed = (await landingResponse.json()) as Record<string, any>;
      const plan = landed.engineeringLandingPlans[0];

      const runResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/${selected.job.id}/engineering-runs`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            landingPlanId: plan.id,
            status: "passed",
            summary: "Runtime capability bridge run.",
            promptPackageIds: [promptPackages[0].id],
            capabilityInvocationIds: [invoked.invocation.id],
            capabilityEvidenceIds: [invoked.evidence.id],
          }),
        }
      );
      expect(runResponse.status).toBe(201);
      const recorded = (await runResponse.json()) as Record<string, any>;
      expect(recorded.engineeringRun).toMatchObject({
        capabilityInvocationIds: [invoked.invocation.id],
        capabilityEvidenceIds: [invoked.evidence.id],
        provenance: {
          capabilityInvocationIds: [invoked.invocation.id],
          capabilityEvidenceIds: [invoked.evidence.id],
        },
      });

      const ledgerResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/${selected.job.id}/artifact-ledger`
      );
      expect(ledgerResponse.status).toBe(200);
      const ledger = (await ledgerResponse.json()) as Record<string, any>;
      const entries = ledger.entries as any[];
      expect(entries.map(entry => entry.artifactType)).toEqual(
        expect.arrayContaining([
          "capability_registry",
          "capability_invocation",
          "capability_evidence",
          "engineering_run",
        ])
      );
      const invocationEntry = entries.find(
        entry => entry.artifactType === "capability_invocation"
      );
      const evidenceEntry = entries.find(
        entry => entry.artifactType === "capability_evidence"
      );
      const runEntry = entries.find(
        entry => entry.artifactType === "engineering_run"
      );
      expect(invocationEntry).toMatchObject({
        stage: "runtime_capability",
        sourceIds: {
          capabilityIds: ["skill-svg-architecture"],
          capabilityInvocationIds: [invoked.invocation.id],
        },
      });
      expect(evidenceEntry).toMatchObject({
        stage: "runtime_capability",
        sourceIds: {
          capabilityIds: ["skill-svg-architecture"],
          capabilityInvocationIds: [invoked.invocation.id],
          capabilityEvidenceIds: [invoked.evidence.id],
        },
      });
      expect(runEntry.sourceIds).toMatchObject({
        capabilityInvocationIds: [invoked.invocation.id],
        capabilityEvidenceIds: [invoked.evidence.id],
      });

      const latestResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/latest`
      );
      expect(latestResponse.status).toBe(200);
      const latest = (await latestResponse.json()) as Record<string, any>;
      expect(latest.capabilities).toHaveLength(5);
      expect(latest.capabilityInvocations).toHaveLength(1);
      expect(latest.capabilityEvidence).toHaveLength(1);
      expect(
        latest.artifactLedgerEntries.some(
          (entry: any) => entry.stage === "runtime_capability"
        )
      ).toBe(true);
    });
  });

  it("blocks unsafe runtime capabilities unless explicitly approved", async () => {
    await withServer(tempRoot, async baseUrl => {
      const selected = await createSelectedSpecTree(baseUrl);

      const blockedResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/${selected.job.id}/capability-invocations`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            capabilityId: "mcp-github-source",
            input: "Read external repository context.",
          }),
        }
      );
      expect(blockedResponse.status).toBe(403);
      const blocked = (await blockedResponse.json()) as Record<string, any>;
      expect(blocked.message).toContain("requires approved=true");

      const approvedResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/${selected.job.id}/capability-invocations`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            capabilityId: "mcp-github-source",
            input: "Read external repository context.",
            approved: true,
          }),
        }
      );
      expect(approvedResponse.status).toBe(201);
      const approved = (await approvedResponse.json()) as Record<string, any>;
      expect(approved.invocation).toMatchObject({
        capabilityId: "mcp-github-source",
        securityLevel: "networked",
        safetyGate: {
          status: "allowed",
          requiresApproval: true,
          approved: true,
        },
      });
    });
  });

  it("validates artifact memory not-found and request errors", async () => {
    await withServer(tempRoot, async baseUrl => {
      const missingLedger = await fetch(
        `${baseUrl}/api/blueprint/jobs/missing-job/artifact-ledger`
      );
      expect(missingLedger.status).toBe(404);

      const selected = await createSelectedSpecTree(baseUrl);
      const invalidDiff = await fetch(
        `${baseUrl}/api/blueprint/jobs/${selected.job.id}/artifact-diff`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            leftEntryId: "only-left",
          }),
        }
      );
      expect(invalidDiff.status).toBe(400);

      const unknownFeedback = await fetch(
        `${baseUrl}/api/blueprint/jobs/${selected.job.id}/artifact-feedback`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entryId: "unknown-entry",
            message: "Cannot bind this feedback.",
          }),
        }
      );
      expect(unknownFeedback.status).toBe(404);
    });
  });

  it("fails engineering landing generation when prompt packages are missing", async () => {
    await withServer(tempRoot, async baseUrl => {
      const selected = await createSelectedSpecTree(baseUrl);

      const landingResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/${selected.job.id}/engineering-landing`,
        {
          method: "POST",
        }
      );

      expect(landingResponse.status).toBe(409);
      const body = (await landingResponse.json()) as Record<string, any>;
      expect(body.message).toContain("No implementation prompt packages");
    });
  });

  it("fails implementation prompt package generation without a SPEC tree or usable documents", async () => {
    await withServer(tempRoot, async baseUrl => {
      const createResponse = await fetch(`${baseUrl}/api/blueprint/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetText: "Create prompt packages after the SPEC tree is ready.",
        }),
      });
      const created = (await createResponse.json()) as Record<string, any>;

      const noTreeResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/${created.job.id}/prompt-packages`,
        {
          method: "POST",
        }
      );
      expect(noTreeResponse.status).toBe(404);
      const noTree = (await noTreeResponse.json()) as Record<string, any>;
      expect(noTree.message).toContain("does not have a SPEC tree artifact yet");

      const selectResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/${created.job.id}/route-selection`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            routeId: created.routeSet.routes[0].id,
          }),
        }
      );
      expect(selectResponse.status).toBe(201);

      const noDocumentsResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/${created.job.id}/prompt-packages`,
        {
          method: "POST",
        }
      );
      expect(noDocumentsResponse.status).toBe(409);
      const noDocuments =
        (await noDocumentsResponse.json()) as Record<string, any>;
      expect(noDocuments.message).toContain("No accepted SPEC documents");
    });
  });

  it("fails effect preview generation without a SPEC tree or usable documents", async () => {
    await withServer(tempRoot, async baseUrl => {
      const createResponse = await fetch(`${baseUrl}/api/blueprint/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetText: "Create a route before effect preview generation.",
        }),
      });
      const created = (await createResponse.json()) as Record<string, any>;

      const noTreeResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/${created.job.id}/effect-previews`,
        {
          method: "POST",
        }
      );
      expect(noTreeResponse.status).toBe(404);
      const noTree = (await noTreeResponse.json()) as Record<string, any>;
      expect(noTree.message).toContain("does not have a SPEC tree artifact yet");

      const selectResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/${created.job.id}/route-selection`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            routeId: created.routeSet.routes[0].id,
          }),
        }
      );
      expect(selectResponse.status).toBe(201);

      const noDocumentsResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/${created.job.id}/effect-previews`,
        {
          method: "POST",
        }
      );
      expect(noDocumentsResponse.status).toBe(409);
      const noDocuments =
        (await noDocumentsResponse.json()) as Record<string, any>;
      expect(noDocuments.message).toContain("No accepted SPEC documents");
    });
  });

  it("rejects SPEC document generation when no SPEC tree exists", async () => {
    await withServer(tempRoot, async baseUrl => {
      const createResponse = await fetch(`${baseUrl}/api/blueprint/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetText: "Create a route without selecting a SPEC tree.",
        }),
      });
      const created = (await createResponse.json()) as Record<string, any>;

      const generateResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/${created.job.id}/spec-documents`,
        {
          method: "POST",
        }
      );
      expect(generateResponse.status).toBe(404);
      const body = (await generateResponse.json()) as Record<string, any>;
      expect(body.message).toContain("does not have a SPEC tree artifact yet");
    });
  });

  it("generates SPEC documents for a selected node and type set", async () => {
    await withServer(tempRoot, async baseUrl => {
      const selected = await createSelectedSpecTree(baseUrl);
      const targetNode = selected.specTree.nodes.find(
        (node: Record<string, any>) => node.type === "spec_document"
      );
      expect(targetNode).toBeTruthy();

      const generateResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/${selected.job.id}/spec-documents`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nodeId: targetNode.id,
            types: ["requirements", "tasks"],
          }),
        }
      );

      expect(generateResponse.status).toBe(201);
      const generated = (await generateResponse.json()) as Record<string, any>;
      expect(generated.documents).toHaveLength(2);
      expect(
        generated.documents.every(
          (document: any) => document.nodeId === targetNode.id
        )
      ).toBe(true);
      expect(generated.documents.map((document: any) => document.type)).toEqual(
        ["requirements", "tasks"]
      );

      const readResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/${selected.job.id}/spec-documents?nodeId=${encodeURIComponent(targetNode.id)}`
      );
      const read = (await readResponse.json()) as Record<string, any>;
      expect(read.documents).toHaveLength(2);

      const invalidTypeResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/${selected.job.id}/spec-documents`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nodeId: targetNode.id,
            types: ["preview"],
          }),
        }
      );
      expect(invalidTypeResponse.status).toBe(400);
    });
  });

  it("filters SPEC documents by nodeId and type", async () => {
    await withServer(tempRoot, async baseUrl => {
      const selected = await createSelectedSpecTree(baseUrl);
      const targetNode = selected.specTree.nodes.find(
        (node: Record<string, any>) => node.type === "route_step"
      );
      expect(targetNode).toBeTruthy();

      const generateResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/${selected.job.id}/spec-documents`,
        {
          method: "POST",
        }
      );
      expect(generateResponse.status).toBe(201);

      const filteredResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/${selected.job.id}/spec-documents?nodeId=${encodeURIComponent(targetNode.id)}&type=design`
      );
      expect(filteredResponse.status).toBe(200);
      const filtered = (await filteredResponse.json()) as Record<string, any>;
      expect(filtered.documents).toHaveLength(1);
      expect(filtered.documents[0]).toMatchObject({
        nodeId: targetNode.id,
        type: "design",
        title: `Design: ${targetNode.title}`,
      });

      const typeOnlyResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/${selected.job.id}/spec-documents?type=tasks`
      );
      expect(typeOnlyResponse.status).toBe(200);
      const typeOnly = (await typeOnlyResponse.json()) as Record<string, any>;
      expect(typeOnly.documents).toHaveLength(selected.specTree.nodes.length);
      expect(
        typeOnly.documents.every((document: any) => document.type === "tasks")
      ).toBe(true);

      const invalidTypeResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/${selected.job.id}/spec-documents?type=preview`
      );
      expect(invalidTypeResponse.status).toBe(400);
    });
  });

  it("rejects invalid SPEC tree node and version requests", async () => {
    await withServer(tempRoot, async baseUrl => {
      const missingJobResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/missing/spec-tree/nodes/node-1`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "No job" }),
        }
      );
      expect(missingJobResponse.status).toBe(404);

      const createResponse = await fetch(`${baseUrl}/api/blueprint/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetText: "Create a route without selecting a SPEC tree.",
        }),
      });
      const created = (await createResponse.json()) as Record<string, any>;

      const noTreePatchResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/${created.job.id}/spec-tree/nodes/node-1`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "No tree yet" }),
        }
      );
      expect(noTreePatchResponse.status).toBe(404);

      const selectResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/${created.job.id}/route-selection`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            routeId: created.routeSet.routes[0].id,
          }),
        }
      );
      expect(selectResponse.status).toBe(201);
      const selected = (await selectResponse.json()) as Record<string, any>;

      const invalidPatchResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/${created.job.id}/spec-tree/nodes/${created.routeSet.routes[0].id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ priority: -1 }),
        }
      );
      expect(invalidPatchResponse.status).toBe(400);

      const missingNodeResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/${created.job.id}/spec-tree/nodes/missing-node`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Still missing" }),
        }
      );
      expect(missingNodeResponse.status).toBe(404);

      const badBodyResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/${created.job.id}/spec-tree/nodes/${selected.specTree.rootNodeId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }
      );
      expect(badBodyResponse.status).toBe(400);

      const invalidVersionResponse = await fetch(
        `${baseUrl}/api/blueprint/jobs/${created.job.id}/spec-tree/versions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "[]",
        }
      );
      expect(invalidVersionResponse.status).toBe(400);
    });
  });

  it("rejects generation jobs without target text or GitHub URLs", async () => {
    await withServer(tempRoot, async baseUrl => {
      const response = await fetch(`${baseUrl}/api/blueprint/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: "project-1" }),
      });

      expect(response.status).toBe(400);
      const body = (await response.json()) as Record<string, unknown>;
      expect(body.message).toBe(
        "Provide targetText or at least one GitHub URL."
      );
    });
  });

  it("persists RouteSet selection and derived SPEC tree assets to disk", async () => {
    const storageFile = path.join(tempRoot, "assets", "jobs.json");
    const jobStore = createFileBlueprintJobStore(storageFile);

    await withServer(
      tempRoot,
      async baseUrl => {
        const createResponse = await fetch(`${baseUrl}/api/blueprint/jobs`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            targetText: "Create a future-facing SPEC asset factory.",
          }),
        });
        const created = (await createResponse.json()) as Record<string, any>;

        const selectResponse = await fetch(
          `${baseUrl}/api/blueprint/jobs/${created.job.id}/route-selection`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              routeId: created.routeSet.routes[0].id,
            }),
          }
        );
        expect(selectResponse.status).toBe(201);
      },
      jobStore
    );

    const reloadedStore = createFileBlueprintJobStore(storageFile);
    const latest = reloadedStore.latest();
    expect(latest?.artifacts.map(artifact => artifact.type)).toEqual([
      "route_set",
      "route_selection",
      "spec_tree",
    ]);
    expect(latest?.stage).toBe("spec_tree");
    expect(latest?.status).toBe("reviewing");
  });
});
