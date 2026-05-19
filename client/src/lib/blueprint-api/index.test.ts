import { describe, expect, it } from "vitest";

import * as intake from "./intake.js";
import * as clarification from "./clarification.js";
import * as jobs from "./jobs.js";
import * as agentCrew from "./agent-crew.js";
import * as routeset from "./routeset.js";
import * as specDocuments from "./spec-documents.js";
import * as downstream from "./downstream.js";
import * as artifactReplay from "./artifact-replay.js";
import * as barrel from "./index.js";

/**
 * wt2 任务 3：SDK 8 个子模块的 happy-path 断言。
 *
 * 只做两件事，example-based：
 * 1. 每个子模块都至少暴露 1 个运行时符号（不是纯类型 re-export），防止整段未生效；
 * 2. barrel (`./index.ts`) 的运行时入口覆盖所有子模块的代表性符号。
 *
 * 不测具体业务行为——业务行为验证仍然由 `server/tests/blueprint-routes.test.ts`（E2E）
 * 与 `client/src/lib/blueprint-api.test.ts`（SDK unit）承担（需求 7.4）。
 */
describe("blueprint-api subdomain SDK shells", () => {
  it("intake 暴露 endpoint 常量与 fetch/create 函数", () => {
    expect(typeof intake.BLUEPRINT_SPECS_ENDPOINT).toBe("string");
    expect(typeof intake.BLUEPRINT_INTAKE_ENDPOINT).toBe("string");
    expect(typeof intake.fetchBlueprintSpecsProgress).toBe("function");
    expect(typeof intake.createBlueprintIntake).toBe("function");
    expect(typeof intake.fetchBlueprintProjectContext).toBe("function");
  });

  it("clarification 暴露 endpoint 常量与 session / answers 函数", () => {
    expect(typeof clarification.BLUEPRINT_CLARIFICATIONS_ENDPOINT).toBe(
      "string"
    );
    expect(typeof clarification.createBlueprintClarificationSession).toBe(
      "function"
    );
    expect(typeof clarification.fetchBlueprintClarificationSession).toBe(
      "function"
    );
    expect(typeof clarification.saveBlueprintClarificationAnswers).toBe(
      "function"
    );
  });

  it("jobs 暴露 endpoint 常量与 latest/event 工具", () => {
    expect(typeof jobs.BLUEPRINT_JOBS_ENDPOINT).toBe("string");
    expect(typeof jobs.BLUEPRINT_GENERATIONS_ENDPOINT).toBe("string");
    expect(typeof jobs.createBlueprintGenerationJob).toBe("function");
    expect(typeof jobs.fetchLatestBlueprintGenerationJob).toBe("function");
    expect(typeof jobs.fetchBlueprintJobEvents).toBe("function");
    expect(typeof jobs.fetchBlueprintJobEventStreamUrl("job-1")).toBe("string");
  });

  it("agent-crew 暴露 capability / invocation / evidence 函数", () => {
    expect(typeof agentCrew.fetchBlueprintJobCapabilities).toBe("function");
    expect(typeof agentCrew.invokeBlueprintCapability).toBe("function");
    expect(typeof agentCrew.fetchBlueprintCapabilityInvocations).toBe(
      "function"
    );
    expect(typeof agentCrew.fetchBlueprintCapabilityEvidence).toBe("function");
    expect(typeof agentCrew.normalizeBlueprintAgentCrew).toBe("function");
  });

  it("routeset 暴露 route / spec tree 函数", () => {
    expect(typeof routeset.selectBlueprintRoute).toBe("function");
    expect(typeof routeset.resetBlueprintRouteSelection).toBe("function");
    expect(typeof routeset.updateBlueprintSpecTreeNode).toBe("function");
    expect(typeof routeset.saveBlueprintSpecTreeVersion).toBe("function");
    expect(typeof routeset.runBlueprintSpecTreeAction).toBe("function");
  });

  it("spec-documents 暴露 review / generate / version 函数", () => {
    expect(typeof specDocuments.fetchBlueprintSpecDocuments).toBe("function");
    expect(typeof specDocuments.generateBlueprintSpecDocuments).toBe(
      "function"
    );
    expect(typeof specDocuments.reviewBlueprintSpecDocument).toBe("function");
    expect(typeof specDocuments.saveBlueprintSpecDocumentVersion).toBe(
      "function"
    );
  });

  it("downstream 暴露 preview / prompt / landing / run 函数", () => {
    expect(typeof downstream.fetchBlueprintEffectPreviews).toBe("function");
    expect(typeof downstream.generateBlueprintEffectPreview).toBe("function");
    expect(typeof downstream.fetchBlueprintPromptPackages).toBe("function");
    expect(typeof downstream.generateBlueprintPromptPackages).toBe("function");
    expect(typeof downstream.fetchBlueprintEngineeringLanding).toBe("function");
    expect(typeof downstream.generateBlueprintEngineeringLanding).toBe(
      "function"
    );
    expect(typeof downstream.fetchBlueprintEngineeringRuns).toBe("function");
  });

  it("artifact-replay 暴露 ledger / replay / feedback 函数", () => {
    expect(typeof artifactReplay.fetchBlueprintArtifactLedger).toBe("function");
    expect(typeof artifactReplay.fetchBlueprintArtifactReplays).toBe(
      "function"
    );
    expect(typeof artifactReplay.recordBlueprintArtifactFeedback).toBe(
      "function"
    );
    expect(typeof artifactReplay.normalizeBlueprintArtifactLedgerEntry).toBe(
      "function"
    );
  });

  it("barrel 汇聚 8 个子域的代表性符号", () => {
    expect(typeof barrel.createBlueprintIntake).toBe("function");
    expect(typeof barrel.createBlueprintClarificationSession).toBe("function");
    expect(typeof barrel.fetchLatestBlueprintGenerationJob).toBe("function");
    expect(typeof barrel.invokeBlueprintCapability).toBe("function");
    expect(typeof barrel.selectBlueprintRoute).toBe("function");
    expect(typeof barrel.reviewBlueprintSpecDocument).toBe("function");
    expect(typeof barrel.generateBlueprintEffectPreview).toBe("function");
    expect(typeof barrel.fetchBlueprintArtifactLedger).toBe("function");
  });
});
