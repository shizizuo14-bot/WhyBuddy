/**
 * Agent Crew Stage Activation — Driver
 *
 * 工厂 `createAgentCrewStageActivationDriver(ctx)` 实现主算法：
 * 消费 role-bridge 的 structuredRoles.payload，按每个 role 的 activationStages
 * 派生 BlueprintRolePresenceState，在 ctx.eventBus 上同步发射 role.* 事件。
 *
 * 硬约束（design §2.D1 + §2.D11）：
 * - SHALL NOT import callLLMJson / getAIConfig
 * - SHALL NOT import/call module-level fetch / node-fetch / got / undici
 * - SHALL NOT hardcode any role id / stage id literal
 * - SHALL NOT import module-level evidence store / event bus / jobStore singleton
 * - All dependencies come from ctx: BlueprintServiceContext
 */

import { randomUUID } from "node:crypto";

import { BlueprintEventName } from "../../../../shared/blueprint/events.js";
import type {
  BlueprintGenerationEvent,
  BlueprintGenerationEventType,
  BlueprintGenerationStage,
  BlueprintRolePresenceState,
  BlueprintGenerationJob,
} from "../../../../shared/blueprint/index.js";

import type { BlueprintServiceContext } from "../context.js";
import type { AgentCrewStageActivationPolicy } from "./policy.js";
import { createDefaultAgentCrewStageActivationPolicy, applyAgentCrewRedaction } from "./policy.js";
import { findRoleArchitectureEvidence } from "./evidence-lookup.js";
import { deriveStageRoleStateMap } from "./state-machine.js";

// ─── Types (§4.2) ───────────────────────────────────────────────────────────

export type AgentCrewStageActivationTransition =
  | "stage_started"
  | "stage_completed"
  | "stage_retry"
  | "manual_override";

export interface AgentCrewStageActivationInput {
  jobId: string;
  stageId: BlueprintGenerationStage;
  transition: AgentCrewStageActivationTransition;
  job: BlueprintGenerationJob;
}

export type AgentCrewStageActivationExecutionMode =
  | "real"
  | "simulated_fallback"
  | "not_determined";

export interface AgentCrewStageActivationDriver {
  /**
   * 外层在 stage lifecycle 钩子处主动调用。
   * 同步调用栈：返回时所有相关 role.* 事件已 emit 到 ctx.eventBus。
   * 如进入 fallback，返回时未发射任何 role.* 事件。
   */
  onStageTransition(input: AgentCrewStageActivationInput): void;

  /**
   * 当前 driver 的执行模式。
   */
  readonly executionMode: AgentCrewStageActivationExecutionMode;

  /**
   * 最近一次 fallback 原因。
   */
  readonly lastFallbackReason?: string;
}

// ─── Internal tracker (§2.D7) ───────────────────────────────────────────────

interface RoleTracker {
  lastEmittedState: BlueprintRolePresenceState | null;
  lastStageId: BlueprintGenerationStage | null;
  stageAttemptByStage: Map<BlueprintGenerationStage, number>;
  /** Key format: "${stageId}:${stageAttempt}:${state}:${roleId}" */
  emittedTriplets: Set<string>;
}

// ─── State → Event mapping (§4.6) ──────────────────────────────────────────

const STATE_TO_EVENT_NAME: Record<
  BlueprintRolePresenceState,
  BlueprintGenerationEventType
> = {
  active: BlueprintEventName.RoleActivated,
  watching: BlueprintEventName.RoleWatching,
  reviewing: BlueprintEventName.RoleReviewStarted,
  sleeping: BlueprintEventName.RoleSleeping,
};

// ─── Local ID helper ────────────────────────────────────────────────────────

function createId(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

// ─── Factory (§4.6 7-step algorithm) ────────────────────────────────────────

export function createAgentCrewStageActivationDriver(
  ctx: BlueprintServiceContext
): AgentCrewStageActivationDriver {
  const policy: AgentCrewStageActivationPolicy =
    ctx.agentCrewStageActivationPolicy ??
    createDefaultAgentCrewStageActivationPolicy();

  const trackers = new Map<string, RoleTracker>();
  let executionMode: AgentCrewStageActivationExecutionMode = "not_determined";
  let lastFallbackReason: string | undefined;
  let jobCompleted = false;

  // ── enterFallback (§D8) ─────────────────────────────────────────────────

  function enterFallback(reason: string): void {
    executionMode = "simulated_fallback";
    lastFallbackReason = applyAgentCrewRedaction(
      reason.slice(0, policy.maxErrorBytes),
      policy
    );
    const isAnomaly =
      reason.includes("structured roles missing") ||
      reason.includes("not supported");
    const level = isAnomaly ? "warn" : "debug";
    ctx.logger[level]("agent-crew stage-activation driver: fallback", {
      reason: lastFallbackReason,
    });
  }

  // ── getTracker ──────────────────────────────────────────────────────────

  function getTracker(roleId: string): RoleTracker {
    let tracker = trackers.get(roleId);
    if (!tracker) {
      tracker = {
        lastEmittedState: null,
        lastStageId: null,
        stageAttemptByStage: new Map(),
        emittedTriplets: new Set(),
      };
      trackers.set(roleId, tracker);
    }
    return tracker;
  }

  // ── Driver instance ─────────────────────────────────────────────────────

  return {
    get executionMode() {
      return executionMode;
    },
    get lastFallbackReason() {
      return lastFallbackReason;
    },

    onStageTransition(input: AgentCrewStageActivationInput): void {
      // Step 1: Environment variable gate
      if (
        process.env.BLUEPRINT_AGENT_CREW_STAGE_ACTIVATION_ENABLED !== "true"
      ) {
        enterFallback("driver not enabled");
        return;
      }

      // Step 2: Job terminal gate (R8.5)
      if (jobCompleted) {
        ctx.logger.debug(
          "driver: onStageTransition after job completed, skipping"
        );
        return;
      }
      if (
        input.job.status === "completed" ||
        input.job.status === "failed"
      ) {
        jobCompleted = true;
        ctx.logger.debug("driver: job completed/failed, skipping");
        return;
      }

      // Step 3: Only process stage_started
      if (input.transition !== "stage_started") {
        ctx.logger.debug(
          "driver: non-start transition not handled in current version",
          { transition: input.transition }
        );
        return;
      }

      // Step 4: Evidence lookup (5 gates)
      const routeSetId =
        (input.job.request as Record<string, unknown> | undefined)
          ?.routeSetId as string | undefined;
      const primaryRouteId =
        (
          (input.job as Record<string, unknown>).stageState as
            | Record<string, unknown>
            | undefined
        )?.nextAction
          ? ((
              (input.job as Record<string, unknown>).stageState as Record<
                string,
                unknown
              >
            ).nextAction as Record<string, unknown>).routeId as
              | string
              | undefined
          : undefined;

      const lookup = findRoleArchitectureEvidence({
        job: input.job,
        routeSetId,
        primaryRouteId,
        policy,
      });

      if (lookup.status === "fallback") {
        enterFallback(lookup.reason);
        return;
      }

      executionMode = "real";
      const { evidence, payload } = lookup;

      // Step 5: Parse primaryRoute
      const routeSet = (input.job as Record<string, unknown>).routeSet as
        | { routes: Array<{ id: string; stages?: BlueprintGenerationStage[] }> }
        | undefined;

      const primaryRoute = routeSet?.routes.find(
        (r) => r.id === primaryRouteId
      ) ?? routeSet?.routes[0];

      if (!primaryRoute) {
        enterFallback("primary route not resolvable");
        return;
      }

      const primaryRouteStages: BlueprintGenerationStage[] =
        primaryRoute.stages ?? [];
      if (primaryRouteStages.length === 0) {
        enterFallback("primary route has no stages");
        return;
      }

      // Step 6: Derive state map
      const stateMap = deriveStageRoleStateMap({
        roles: payload.roles,
        primaryRouteStages,
        currentStageId: input.stageId,
      });

      // Step 7: Emit events per role (stable role-first order R3.6)
      for (const role of payload.roles) {
        const tracker = getTracker(role.id);
        const newState = stateMap.get(role.id) ?? "sleeping";

        // 7a: Compute stageAttempt
        const stageKey = input.stageId;
        let stageAttempt = tracker.stageAttemptByStage.get(stageKey);
        if (stageAttempt === undefined) {
          stageAttempt = 1;
          tracker.stageAttemptByStage.set(stageKey, 1);
        }

        // 7b: Triplet idempotence check (R8.2)
        const tripletKey = `${stageKey}:${stageAttempt}:${newState}:${role.id}`;
        if (tracker.emittedTriplets.has(tripletKey)) {
          continue;
        }

        // 7c: State suppression (D5 / R3.7)
        if (
          policy.suppressRepeatedStates &&
          tracker.lastEmittedState === newState &&
          tracker.lastStageId !== stageKey
        ) {
          tracker.lastStageId = stageKey;
          continue;
        }

        // 7d: Construct and emit event (§D6)
        const eventType = STATE_TO_EVENT_NAME[newState];
        const event = {
          id: createId("blueprint-role-event"),
          type: eventType,
          family: "role",
          jobId: input.jobId,
          projectId: input.job.projectId,
          stage: input.stageId,
          status: input.job.status,
          message: applyAgentCrewRedaction(
            `${role.label} transitioned to ${newState} at ${input.stageId}`,
            policy
          ),
          occurredAt: ctx.now().toISOString(),
          roleId: role.id,
          presenceState: newState,
          evidenceId: evidence.id,
          // Driver-specific optional fields
          activationDriverExecutionMode: "real" as const,
          stageAttempt,
          triggeredBy: input.transition,
          roleLabel: role.label,
          sourceEvidenceId: evidence.id,
        } as BlueprintGenerationEvent;

        ctx.eventBus.emit(event);

        // 7e: Update tracker
        tracker.emittedTriplets.add(tripletKey);
        tracker.lastEmittedState = newState;
        tracker.lastStageId = stageKey;
      }

      // `autopilot-role-container-loader` spec Task 15：env-gated hook。
      //
      // driver 主体已完成 role.* 事件序列 emit；此处做一次 fire-and-forget
      // 调用，把 stageRoleStateMap 转给 loader，由 loader 决定 provision /
      // teardown。
      //
      // 硬约束（需求 10.5 / 10.7）：
      // - 仅在 `BLUEPRINT_ROLE_CONTAINER_LOADER_ENABLED === "true"` 且 ctx 已
      //   注入 loader 时触发。未注入或 Tier 1 off 时短路，保证原有 driver 行为
      //   对 Tier 1 off 测试透明。
      // - hook 抛错必须被吞掉，不影响 driver 自身的返回值与事件序列。
      // - ctx 上 `roleContainerLoader` 字段由 `autopilot-role-container-loader`
      //   spec Task 12 在 `BlueprintServiceContext` 类型上追加；此处使用
      //   duck-typed 访问保持与 Task 12 合并顺序解耦。
      const loader = (
        ctx as unknown as {
          roleContainerLoader?: {
            onStageTransitionHook: (
              input: {
                jobId: string;
                stageId: BlueprintGenerationStage;
              },
              stateMap: ReadonlyMap<string, BlueprintRolePresenceState>,
            ) => void;
          };
        }
      ).roleContainerLoader;
      if (
        loader !== undefined &&
        process.env.BLUEPRINT_ROLE_CONTAINER_LOADER_ENABLED === "true"
      ) {
        try {
          loader.onStageTransitionHook(
            { jobId: input.jobId, stageId: input.stageId },
            stateMap,
          );
        } catch (err) {
          ctx.logger.warn("role container loader hook threw, ignored", {
            err:
              err instanceof Error ? err.message.slice(0, 400) : String(err).slice(0, 400),
          });
        }
      }
    },
  };
}
