/**
 * Agent Crew Stage Activation — Evidence Lookup
 *
 * 纯函数 only。本文件禁止 import 任何运行时 / 业务模块（design §2.D1 硬约束）。
 * 仅 `import type` shared 类型与 policy 类型。
 */

import type {
  BlueprintCapabilityEvidence,
  BlueprintGenerationJob,
} from "../../../../shared/blueprint/index.js";

import type { RoleArchitectureResponse } from "./state-machine.js";
import type { AgentCrewStageActivationPolicy } from "./policy.js";

/**
 * Evidence lookup 结果：real 路径或 fallback 路径。
 */
export type EvidenceLookupResult =
  | {
      status: "real";
      evidence: BlueprintCapabilityEvidence;
      payload: RoleArchitectureResponse;
    }
  | {
      status: "fallback";
      reason: string;
    };

/**
 * 从 job artifacts 中检索 role-system-architecture evidence 并校验。
 *
 * 纯函数：无副作用，不访问外部 store。
 *
 * 检索路径（与 role-bridge design §7.3 契约一致）：
 *   1. job === null → fallback "job not found"
 *   2. filter artifacts by type=capability_evidence and capabilityId=role-system-architecture
 *   3. filter by executionMode=real + routeSetId/primaryRouteId match
 *   4. no real but fallback exists → "role bridge fallback"; no candidates → "role evidence not found"
 *   5. real exists but structuredRoles undefined → "structured roles missing"
 *   6. promptId not in policy.supportedPromptIds → "promptId <v> not supported"
 *   7. all pass → { status: "real", evidence, payload }
 */
export function findRoleArchitectureEvidence(input: {
  job: BlueprintGenerationJob | null;
  routeSetId?: string;
  primaryRouteId?: string;
  policy: AgentCrewStageActivationPolicy;
}): EvidenceLookupResult {
  const { job, routeSetId, primaryRouteId, policy } = input;

  // Gate 1: job not found
  if (job === null) {
    return { status: "fallback", reason: "job not found" };
  }

  // Gate 2: filter capability_evidence artifacts with capabilityId = role-system-architecture
  const candidates = job.artifacts
    .filter((a) => a.type === ("capability_evidence" as string))
    .map((a) => a.payload as BlueprintCapabilityEvidence | undefined)
    .filter(
      (e): e is BlueprintCapabilityEvidence =>
        e !== undefined && e !== null && e.capabilityId === "role-system-architecture"
    );

  if (candidates.length === 0) {
    return { status: "fallback", reason: "role evidence not found" };
  }

  // Gate 3: filter by executionMode=real + triplet match
  const realCandidates = candidates.filter((e) => {
    if (e.provenance?.executionMode !== "real") return false;
    if (routeSetId && e.provenance?.routeSetId !== routeSetId) return false;
    if (primaryRouteId && e.provenance?.routeId !== primaryRouteId) return false;
    return true;
  });

  // Gate 4: no real candidates
  if (realCandidates.length === 0) {
    // Check if there are fallback candidates
    const hasFallback = candidates.some(
      (e) => e.provenance?.executionMode === "simulated_fallback"
    );
    if (hasFallback) {
      return { status: "fallback", reason: "role bridge fallback" };
    }
    return { status: "fallback", reason: "role evidence not found" };
  }

  const evidence = realCandidates[0];

  // Gate 5: structuredRoles missing
  const provenance = evidence.provenance as Record<string, unknown> | undefined;
  const structuredRoles = provenance?.structuredRoles as
    | { payload?: RoleArchitectureResponse }
    | undefined;

  if (!structuredRoles || !structuredRoles.payload) {
    return { status: "fallback", reason: "structured roles missing" };
  }

  // Gate 6: promptId not supported
  const promptId = (provenance?.promptId as string) ?? "missing";
  if (!policy.supportedPromptIds.includes(promptId)) {
    return {
      status: "fallback",
      reason: `promptId ${promptId} not supported`,
    };
  }

  // Gate 7: all pass
  return {
    status: "real",
    evidence,
    payload: structuredRoles.payload,
  };
}
