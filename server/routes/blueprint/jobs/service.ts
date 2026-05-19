/**
 * 子域 3：Job Lifecycle & Events 的服务层壳（方案 B）。
 *
 * 对外提供 `JobService` 接口，当前实现是对 `ctx.jobStore` 的 thin wrapper。
 * 真正的作业创建 / 事件流 / SSE 仍走 `server/routes/blueprint.ts`；后续物理迁移时
 * 把 `createGenerationJob` / `handleJobEventStream` 搬进来并通过 ctx 订阅 eventBus。
 *
 * 对应需求 2.1 子域 3、2.2、3.2、5.1、7.3。
 */

import type {
  BlueprintGenerationEvent,
  BlueprintGenerationJob,
} from "../../../../shared/blueprint/index.js";

import type { BlueprintServiceContext } from "../context.js";

export interface JobService {
  listJobs(): BlueprintGenerationJob[];
  getJob(jobId: string): BlueprintGenerationJob | null;
  getLatestJob(): BlueprintGenerationJob | null;
  emitJobEvent(event: BlueprintGenerationEvent): void;
}

export function createJobService(ctx: BlueprintServiceContext): JobService {
  return {
    listJobs() {
      return ctx.jobStore.list();
    },
    getJob(jobId) {
      return ctx.jobStore.get(jobId);
    },
    getLatestJob() {
      return ctx.jobStore.latest();
    },
    emitJobEvent(event) {
      ctx.eventBus.emit(event);
    },
  };
}
