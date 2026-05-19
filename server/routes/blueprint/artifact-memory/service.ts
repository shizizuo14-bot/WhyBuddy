/**
 * 子域 8：Artifact Memory / Replay 的服务层壳（方案 B）。
 *
 * 关键约束（需求 5.3）：Artifact Replay **只**通过 `ctx.replayStore` 消费 `ctx.eventBus`
 * 产生的同一条事件流，不再单独维护旁路源。下面 service 层的读取函数也遵循这个约束：
 * 只从 `ctx.jobStore` 与 `ctx.replayStore` 读数据，不直接访问其它状态容器。
 *
 * 对应需求 3.2、3.6、5.3、7.3。
 */

import type {
  BlueprintArtifactFeedback,
  BlueprintArtifactMemoryEntry,
  BlueprintArtifactReplaySnapshot,
  BlueprintGenerationEvent,
  BlueprintGenerationJob,
} from "../../../../shared/blueprint/index.js";

import type { BlueprintServiceContext } from "../context.js";

export interface ArtifactMemoryService {
  listLedger(jobId: string): BlueprintArtifactMemoryEntry[];
  listReplays(jobId: string): BlueprintArtifactReplaySnapshot[];
  listFeedback(jobId: string): BlueprintArtifactFeedback[];
  /** 对 replay store 的只读投影，等价于 `ctx.replayStore.listEvents(jobId)`。 */
  listEvents(jobId: string): BlueprintGenerationEvent[];
}

function readArtifactPayloads<T>(
  job: BlueprintGenerationJob | null,
  type: string
): T[] {
  if (!job) return [];
  return job.artifacts
    .filter(artifact => artifact.type === type)
    .map(artifact => artifact.payload as T)
    .filter((payload): payload is T => payload !== undefined && payload !== null);
}

export function createArtifactMemoryService(
  ctx: BlueprintServiceContext
): ArtifactMemoryService {
  return {
    listLedger(jobId) {
      return readArtifactPayloads<BlueprintArtifactMemoryEntry>(
        ctx.jobStore.get(jobId),
        "replay"
      );
    },
    listReplays(jobId) {
      return readArtifactPayloads<BlueprintArtifactReplaySnapshot>(
        ctx.jobStore.get(jobId),
        "replay"
      );
    },
    listFeedback(jobId) {
      return readArtifactPayloads<BlueprintArtifactFeedback>(
        ctx.jobStore.get(jobId),
        "feedback"
      );
    },
    listEvents(jobId) {
      return ctx.replayStore.listEvents(jobId);
    },
  };
}
