/**
 * 子域 4：Agent Crew & Runtime Capability 的服务层壳（方案 B）。
 *
 * 提供 `AgentCrewService` 接口，当前只把 artifact 投影里的 agent-crew、role timelines、
 * capability 列表以只读方式暴露出来。真正的 `buildAgentCrew` / `invokeCapability` /
 * `createSandboxDerivationJob` 实现仍在 `server/routes/blueprint.ts`。
 *
 * 对应需求 2.1 子域 4、3.2、5.1、5.2、7.3。
 */

import type {
  BlueprintAgentCrew,
  BlueprintCapabilityEvidence,
  BlueprintCapabilityInvocation,
  BlueprintGenerationJob,
  BlueprintRuntimeCapability,
} from "../../../../shared/blueprint/index.js";

import type { BlueprintServiceContext } from "../context.js";

export interface AgentCrewService {
  getCrew(jobId: string): BlueprintAgentCrew | null;
  listCapabilities(jobId: string): BlueprintRuntimeCapability[];
  listInvocations(jobId: string): BlueprintCapabilityInvocation[];
  listEvidence(jobId: string): BlueprintCapabilityEvidence[];
}

function readLatestArtifactPayload<T>(
  job: BlueprintGenerationJob | null,
  type: string
): T | null {
  if (!job) return null;
  const matches = job.artifacts.filter(artifact => artifact.type === type);
  if (matches.length === 0) return null;
  return (matches[matches.length - 1]?.payload ?? null) as T | null;
}

function readAllArtifactPayloads<T>(
  job: BlueprintGenerationJob | null,
  type: string
): T[] {
  if (!job) return [];
  return job.artifacts
    .filter(artifact => artifact.type === type)
    .map(artifact => artifact.payload as T)
    .filter((payload): payload is T => payload !== undefined && payload !== null);
}

export function createAgentCrewService(
  ctx: BlueprintServiceContext
): AgentCrewService {
  return {
    getCrew(jobId) {
      const job = ctx.jobStore.get(jobId);
      const crew = readLatestArtifactPayload<BlueprintAgentCrew>(job, "agent_crew");
      return crew ?? null;
    },
    listCapabilities(jobId) {
      const job = ctx.jobStore.get(jobId);
      const registry = readLatestArtifactPayload<{
        capabilities: BlueprintRuntimeCapability[];
      }>(job, "capability_registry");
      return registry?.capabilities ?? [];
    },
    listInvocations(jobId) {
      const job = ctx.jobStore.get(jobId);
      return readAllArtifactPayloads<BlueprintCapabilityInvocation>(
        job,
        "capability_invocation"
      );
    },
    listEvidence(jobId) {
      const job = ctx.jobStore.get(jobId);
      return readAllArtifactPayloads<BlueprintCapabilityEvidence>(
        job,
        "capability_evidence"
      );
    },
  };
}
