/**
 * `autopilot-role-container-loader` spec Task 4：物理容器生命周期管理器。
 *
 * 职责：
 * - 决定本次 provision 走 **real**（真实 Docker 容器 via `ExecutorClient`）
 *   还是 **lite**（进程内逻辑句柄）。
 * - 以 `budget.provisionTimeoutMs` 作为 provision 的硬封顶，超时自动降级。
 * - 提供 `destroyPhysicalContainer(...)` 统一物理释放入口。
 *
 * 硬约束：
 * - `createWithFallback` 永不抛错：任何失败分支都收敛到 lite 路径（需求 11.6）。
 * - `destroyPhysicalContainer`：real 模式调 `cancelJob` 尝试释放，调用失败
 *   会**重新抛出**给上层 loader，由 loader 统计孤儿容器。这是与上面
 *   "永不抛错" 不冲突的边界：loader 的 public API 会自己把 destroy 异常
 *   吞掉并记入 diagnostics（设计注释见 loader §4.10）。
 * - 模块内部不读 `process.env`（唯一的例外是 `envOverride`，由工厂参数透传）。
 *
 * 设计锚点：
 * - design §4.2 / §4.6 Step 5 / §4.10
 * - 需求 4.1 / 4.2 / 4.3 / 4.5 / 4.6 / 4.7
 */

import type {
  ExecutionPlan,
  ExecutorJobRequest,
} from "../../../../shared/executor/contracts.js";
import { EXECUTOR_CONTRACT_VERSION } from "../../../../shared/executor/contracts.js";
import type { ExecutorClient } from "../../../core/executor-client.js";
import type { BlueprintLogger } from "../context.js";
import { resolveContainerImage } from "./capability-package.js";
import type {
  RoleCapabilityPackage,
  RoleResourceBudget,
} from "../../../../shared/blueprint/index.js";

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Role container 状态机主状态。与 design §4.2 一致。
 * 保留为 string union，供 loader 的 `lifecycle.state` 字段使用。
 */
export type RoleContainerLifecycleState =
  | "uninitialized"
  | "provisioning"
  | "ready"
  | "degrading"
  | "tearing_down"
  | "torn_down"
  | "failed";

/**
 * 物理容器句柄。两种互斥形态：
 * - real：持有 `containerId`（= executor dispatch 分配的 jobId）与镜像名。
 * - lite：持有 `fallbackReason`（脱敏后的降级原因）；不占用任何真实资源。
 */
export type PhysicalContainer =
  | {
    mode: "real";
    containerId: string;
    image: string;
    fallbackReason?: never;
  }
  | {
    mode: "lite";
    containerId?: never;
    image?: string;
    fallbackReason: string;
  };

/**
 * Lifecycle manager 工厂参数。
 */
export interface LifecycleManagerDeps {
  /**
   * 真实 executor 客户端。未注入时 `createWithFallback` 自动走 lite 路径。
   */
  executorClient?: ExecutorClient;
  /**
   * Logger 用于 warn / debug；不允许抛错。
   */
  logger: BlueprintLogger;
  /**
   * 单调可读的墙钟，用于超时 race / 构造 request metadata。
   */
  now: () => Date;
  /**
   * 由 composition root 传入的强制模式覆盖；对应环境变量
   * `BLUEPRINT_ROLE_CONTAINER_LOADER_MODE_OVERRIDE`。
   *
   * - `"real"`：依旧要求 `executorClient` 可达，不可达时按原路径 fallback。
   * - `"lite"`：无条件走 lite，连 `assertReachable` 都不调。
   * - `undefined`：按可达性二选一。
   */
  envOverride?: "real" | "lite";
}

/**
 * `createWithFallback` 的入参形态：loader 传进来时已经 mergeBudget 完毕。
 */
export interface CreateWithFallbackInput {
  pkg: RoleCapabilityPackage;
  budget: Required<RoleResourceBudget>;
  /**
   * 由 loader 生成的 provision 级别唯一 id，作为
   * `executorClient.dispatchPlan(..., { jobId })` 的参数，也会在 destroy 时
   * 用于 `cancelJob`。
   */
  provisionId: string;
  /**
   * 附加到 `ExecutionPlan.missionId` 上的真实 mission 标识；一般等于
   * `RoleContainerKey.jobId`。
   */
  jobId: string;
}

export interface LifecycleManager {
  /**
   * 按 envOverride + executor 可达性决定模式；real 路径带超时保护。
   * 永不抛错；lite 路径由 `fallbackReason` 解释降级原因。
   */
  createWithFallback(input: CreateWithFallbackInput): Promise<PhysicalContainer>;
  /**
   * 释放 physical container。real 模式下调 `cancelJob`；lite 模式 no-op。
   * 调用失败时 **rethrow** 给 loader 统计孤儿容器。
   */
  destroyPhysicalContainer(container: PhysicalContainer): Promise<void>;
}

// ─── Implementation ─────────────────────────────────────────────────────────

/**
 * 尝试读取 `err.message`；非 Error 对象走 `String(err)`。统一错误字符串形态。
 */
function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * 为 real mode 构造一个最小的 {@link ExecutionPlan}。
 *
 * loader 目前不需要 executor 真的跑起一个业务作业——它只需要一个"容器已分配"
 * 的信号（`dispatchPlan` 返回的 jobId 作为 `physicalContainerId`）。因此 plan
 * 的 steps/jobs 用占位结构，metadata 透传 budget 以便 executor 侧感知资源上限。
 */
function buildRoleContainerExecutionPlan(
  input: CreateWithFallbackInput,
  image: string,
): ExecutionPlan {
  return {
    version: EXECUTOR_CONTRACT_VERSION,
    missionId: input.jobId,
    summary: `Role container provision ${input.provisionId}`,
    objective: "Provision role capability container",
    requestedBy: "brain",
    mode: "managed",
    steps: [
      {
        key: "role_container.provision",
        label: "Provision role container",
        description: "Bring up the per-role composite agent container",
      },
    ],
    jobs: [
      {
        id: `${input.provisionId}-job`,
        key: "role_container.bootstrap",
        label: "Role container bootstrap",
        description: "Bootstrap role container with declared capabilities",
        kind: "execute",
        payload: {
          image,
          // 借用 payload 透传资源预算；executor 若不识别会按默认值处理。
          resources: {
            memoryMiB: input.budget.memoryMiB,
            cpuCores: input.budget.cpuCores,
          },
        },
      } satisfies ExecutionPlan["jobs"][number],
    ],
    metadata: {
      source: "role-container-loader",
      provisionId: input.provisionId,
      budget: input.budget,
      containerImage: image,
    },
  };
}

/**
 * Duck-typed cancelJob 调用：`ExecutorClient` 当前未在类型上声明 `cancelJob`
 * （与 docker-analysis-sandbox 保持同款处理）。未实现时视为 "noop 成功"。
 */
async function invokeCancelJob(
  executorClient: ExecutorClient,
  jobId: string,
): Promise<void> {
  const maybeCancel = (
    executorClient as unknown as {
      cancelJob?: (jobId: string) => Promise<unknown> | unknown;
    }
  ).cancelJob;
  if (typeof maybeCancel !== "function") {
    return;
  }
  await Promise.resolve(maybeCancel.call(executorClient, jobId));
}

/**
 * 把 promise 用 `timeoutMs` 包一层 race；超时抛
 * `new Error("provision timeout")`，便于上层分支识别。
 *
 * 定时器在任一分支确定后都会被清掉，避免未处理计时器在测试进程中积累。
 */
function withProvisionTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error("provision timeout"));
    }, timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }) as Promise<T>;
}

/**
 * 工厂函数：把依赖绑定为一个可重入的 {@link LifecycleManager}。
 */
export function createLifecycleManager(
  deps: LifecycleManagerDeps,
): LifecycleManager {
  return {
    async createWithFallback(
      input: CreateWithFallbackInput,
    ): Promise<PhysicalContainer> {
      const image = resolveContainerImage(input.pkg);

      // override=lite：最强路径，无视 executor 可达性。
      if (deps.envOverride === "lite") {
        return {
          mode: "lite",
          image,
          fallbackReason: "mode override=lite",
        };
      }

      // 没有 executorClient：直接 lite，不 warn（dev 默认路径）。
      if (!deps.executorClient) {
        return {
          mode: "lite",
          image,
          fallbackReason: "executorClient missing",
        };
      }

      // Reachability 探测。
      const executorClient = deps.executorClient;
      try {
        await withProvisionTimeout(
          executorClient.assertReachable(),
          input.budget.provisionTimeoutMs,
        );
      } catch (err) {
        const reason = `executor unreachable: ${errorMessage(err)}`;
        deps.logger.warn(
          "role container loader: executor unreachable, falling back to lite",
          { reason, provisionId: input.provisionId },
        );
        return {
          mode: "lite",
          image,
          fallbackReason: reason,
        };
      }

      // Dispatch：real 路径主 call；失败 / 超时 → lite + best-effort cancel。
      const plan = buildRoleContainerExecutionPlan(input, image);
      try {
        const dispatched = await withProvisionTimeout(
          executorClient.dispatchPlan(plan, {
            jobId: input.provisionId,
            requestId: `role-container:${input.provisionId}`,
            idempotencyKey: `role-container:${input.provisionId}`,
          }),
          input.budget.provisionTimeoutMs,
        );
        const containerId = extractContainerId(dispatched.response, input.provisionId);
        return {
          mode: "real",
          containerId,
          image,
        };
      } catch (err) {
        const reason = errorMessage(err);
        const fallbackReason = reason === "provision timeout"
          ? "provision timeout"
          : `dispatch failed: ${reason}`;
        deps.logger.warn(
          "role container loader: dispatch failed, falling back to lite",
          { reason: fallbackReason, provisionId: input.provisionId },
        );
        // Best-effort cancel：不阻塞返回。
        try {
          await invokeCancelJob(executorClient, input.provisionId);
        } catch (cancelErr) {
          deps.logger.debug(
            "role container loader: best-effort cancelJob after dispatch failure threw",
            { error: errorMessage(cancelErr), provisionId: input.provisionId },
          );
        }
        return {
          mode: "lite",
          image,
          fallbackReason,
        };
      }
    },

    async destroyPhysicalContainer(container: PhysicalContainer): Promise<void> {
      if (container.mode === "lite") {
        return;
      }
      // real mode
      if (!deps.executorClient) {
        // 没有 executor 可用（例如 ctx 之后被替换）：真实容器无法 cancel，
        // 上层应记为孤儿。抛 Error 让 loader teardown 分支走 orphan 统计。
        throw new Error(
          `lifecycle-manager: executorClient missing, cannot cancel containerId=${container.containerId}`,
        );
      }
      try {
        await invokeCancelJob(deps.executorClient, container.containerId);
      } catch (err) {
        deps.logger.warn(
          "role container loader: destroyPhysicalContainer failed",
          {
            error: errorMessage(err),
            containerId: container.containerId,
          },
        );
        // rethrow：loader 会在 catch 中调用 noteOrphanContainer。
        throw err instanceof Error ? err : new Error(errorMessage(err));
      }
    },
  };
}

/**
 * 从 `dispatchPlan` 响应里推导 containerId。当响应结构未提供具体容器 id 时
 * 回退到 provisionId（此时 executor 侧会以 provisionId 作为 job 主键，cancel
 * 也用它）。防御式实现：不 assert、不抛错。
 */
function extractContainerId(
  response: unknown,
  fallbackProvisionId: string,
): string {
  if (response && typeof response === "object") {
    const candidate = (response as { jobId?: unknown }).jobId;
    if (typeof candidate === "string" && candidate.length > 0) {
      return candidate;
    }
  }
  return fallbackProvisionId;
}

// Re-export for test convenience: 避免测试直接依赖 shared types 的相对路径。
export type { ExecutorJobRequest };
