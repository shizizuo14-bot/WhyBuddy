import express from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createBlueprintRouter,
  createMemoryBlueprintJobStore,
  type BlueprintJobStore,
} from "../blueprint.js";
import type { BlueprintGenerationJob } from "../../../shared/blueprint/contracts.js";

const NOW = "2026-06-08T00:00:00.000Z";

function makeJob(): BlueprintGenerationJob {
  return {
    id: "job-v4",
    request: { targetText: "Build v4", githubUrls: [] },
    status: "completed",
    stage: "effect_preview",
    version: "1",
    createdAt: NOW,
    updatedAt: NOW,
    artifacts: [],
    events: [
      {
        id: "evt-companion-start",
        jobId: "job-v4",
        family: "checks",
        type: "companion.challenge.started" as any,
        stage: "spec_docs",
        status: "running",
        message: "challenge started",
        occurredAt: NOW,
        payload: { challengeId: "challenge-1" },
      },
      {
        id: "evt-gate-failed",
        jobId: "job-v4",
        family: "checks",
        type: "checks.gate.failed" as any,
        stage: "effect_preview",
        status: "failed",
        message: "gate failed",
        occurredAt: NOW,
        payload: { reasons: ["fake_success"] },
      },
    ],
    checksLedger: [
      {
        id: "ledger-brainstorm",
        sequence: 1,
        jobId: "job-v4",
        stage: "spec_docs",
        checkType: "brainstorm_deliberation",
        checkName: "brainstorm:evidence:sess-1",
        status: "pass",
        validator: "brainstorm/orchestrator.ts",
        output: "passed",
        triggeredAt: NOW,
        metadata: { sessionId: "sess-1" },
      } as any,
      {
        id: "ledger-preview",
        sequence: 2,
        jobId: "job-v4",
        stage: "effect_preview",
        checkType: "preview_audit",
        checkName: "preview_audit_batch",
        status: "fail",
        validator: "preview-audit/service.ts",
        output: "fake success",
        triggeredAt: NOW,
      } as any,
      {
        id: "ledger-matrix",
        sequence: 3,
        jobId: "job-v4",
        stage: "spec_docs",
        checkType: "traceability_matrix",
        checkName: "matrix:coverage_check",
        status: "warn",
        validator: "traceability-matrix/ledger-integration.ts",
        output: "coverage warning",
        triggeredAt: NOW,
      } as any,
    ],
    companionFindings: [
      {
        id: "finding-1",
        role: "grounding",
        stage: "spec_docs",
        targetArtifactId: "job-v4",
        findings: ["missing citation"],
        severity: "warn",
        suggestedActions: [],
        citations: [],
        timestamp: NOW,
      },
    ],
  };
}

describe("Blueprint v4 sub-resource routes", () => {
  let server: ReturnType<typeof createServer> | undefined;
  let baseUrl = "";

  beforeEach(async () => {
    const jobStore: BlueprintJobStore = createMemoryBlueprintJobStore();
    jobStore.save(makeJob());
    const app = express();
    app.use(
      "/api/blueprint",
      createBlueprintRouter({
        jobStore,
        now: () => new Date(NOW),
      }),
    );
    server = createServer(app);
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}/api/blueprint`;
  });

  afterEach(async () => {
    if (!server) return;
    await new Promise<void>((resolve, reject) => {
      server!.close((error) => (error ? reject(error) : resolve()));
    });
    server = undefined;
  });

  it("returns persisted brainstorm evidence, companion challenges, preview audit trail, and diagnostics health", async () => {
    const evidence = await fetch(`${baseUrl}/jobs/job-v4/brainstorm-evidence`);
    expect(evidence.status).toBe(200);
    expect(await evidence.json()).toMatchObject({
      jobId: "job-v4",
      evidence: [
        {
          source: "checks_ledger",
          checkName: "brainstorm:evidence:sess-1",
          status: "pass",
        },
      ],
    });

    const companion = await fetch(`${baseUrl}/jobs/job-v4/companion-challenges`);
    expect(companion.status).toBe(200);
    const companionPayload = await companion.json();
    expect(companionPayload.findings).toHaveLength(1);
    expect(companionPayload.challengeEvents).toHaveLength(1);

    const audit = await fetch(`${baseUrl}/jobs/job-v4/preview-audit-trail`);
    expect(audit.status).toBe(200);
    const auditPayload = await audit.json();
    expect(auditPayload.auditChecks).toHaveLength(1);
    expect(auditPayload.auditEvents).toHaveLength(1);

    const diagnostics = await fetch(`${baseUrl}/diagnostics`);
    expect(diagnostics.status).toBe(200);
    expect(await diagnostics.json()).toMatchObject({
      companion: { findingCount: 1 },
      preview: { auditCheckCount: 1, healthy: false },
      matrix: { ledgerEntryCount: 1, healthy: true },
    });
  });
});
