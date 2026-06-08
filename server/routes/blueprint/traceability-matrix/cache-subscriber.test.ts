import { describe, expect, it, vi } from "vitest";

import type { TraceabilityMatrixService } from "../../../../shared/blueprint/traceability-matrix/types.js";
import { createTraceabilityMatrixCacheWrapper } from "./cache-subscriber.js";

function service(): TraceabilityMatrixService & { generateMatrix: ReturnType<typeof vi.fn> } {
  const generateMatrix = vi.fn((jobId: string) => ({
    jobId,
    generatedAt: new Date().toISOString(),
    entries: [],
    coverage: {
      totalRequirements: 0,
      coveredByDesign: 0,
      coveredByTasks: 0,
      coveredByEvidence: 0,
      coveredByTests: 0,
      coveragePercent: 100,
      gaps: [],
    },
  }));
  return {
    generateMatrix,
    exportJson: generateMatrix,
    exportMarkdown: vi.fn((jobId: string) => `matrix ${jobId}`),
  };
}

describe("traceability matrix cache subscriber", () => {
  it("marks matrix stale on spec.tree.updated and refreshes cache", () => {
    const base = service();
    let listener: ((event: any) => void) | undefined;
    const eventBus = {
      subscribe: vi.fn((fn) => {
        listener = fn;
        return () => undefined;
      }),
    };

    const wrapper = createTraceabilityMatrixCacheWrapper({
      service: base,
      eventBus: eventBus as any,
    });

    expect(eventBus.subscribe).toHaveBeenCalledTimes(1);
    const first = wrapper.generateMatrix("job-1");
    expect(first.stale).toBe(false);

    listener?.({
      type: "spec.tree.updated",
      jobId: "job-1",
      payload: { specTreeId: "tree-1" },
    });

    expect(wrapper.exportJson("job-1").stale).toBe(false);
    expect(base.generateMatrix).toHaveBeenCalledTimes(2);
  });

  it("debounces same-job recompute bursts", () => {
    const base = service();
    let listener: ((event: any) => void) | undefined;
    const wrapper = createTraceabilityMatrixCacheWrapper({
      service: base,
      eventBus: {
        subscribe: vi.fn((fn) => {
          listener = fn;
          return () => undefined;
        }),
      } as any,
    });

    listener?.({ type: "spec.tree.updated", jobId: "job-1", payload: {} });
    listener?.({ type: "spec.tree.updated", jobId: "job-1", payload: {} });
    wrapper.exportJson("job-1");

    expect(base.generateMatrix).toHaveBeenCalledTimes(1);
  });
});
