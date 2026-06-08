import type { BlueprintEventBus } from "../context.js";
import type {
  TraceabilityMatrix,
  TraceabilityMatrixService,
} from "../../../../shared/blueprint/traceability-matrix/types.js";

export interface TraceabilityMatrixCacheWrapperInput {
  service: TraceabilityMatrixService;
  eventBus?: Pick<BlueprintEventBus, "subscribe">;
}

interface CacheEntry {
  matrix: TraceabilityMatrix;
  stale: boolean;
  recomputedFromEvent: boolean;
}

export function createTraceabilityMatrixCacheWrapper(
  input: TraceabilityMatrixCacheWrapperInput,
): TraceabilityMatrixService {
  const cache = new Map<string, CacheEntry>();
  const recomputing = new Set<string>();

  function generateAndCache(jobId: string): TraceabilityMatrix {
    if (recomputing.has(jobId)) {
      const cached = cache.get(jobId);
      if (cached) return { ...cached.matrix, stale: cached.stale };
    }
    recomputing.add(jobId);
    try {
      const matrix = input.service.generateMatrix(jobId);
      cache.set(jobId, { matrix, stale: false, recomputedFromEvent: false });
      return { ...matrix, stale: false };
    } finally {
      recomputing.delete(jobId);
    }
  }

  input.eventBus?.subscribe((event) => {
    if (event.type !== "spec.tree.updated") return;
    const jobId = event.jobId;
    const cached = cache.get(jobId);
    if (cached) {
      if (!cached.recomputedFromEvent) {
        cache.set(jobId, { ...cached, stale: true, recomputedFromEvent: false });
      }
    } else {
      cache.set(jobId, {
        matrix: input.service.generateMatrix(jobId),
        stale: false,
        recomputedFromEvent: true,
      });
    }
  });

  return {
    generateMatrix: generateAndCache,
    exportJson(jobId: string): TraceabilityMatrix {
      const cached = cache.get(jobId);
      if (!cached || cached.stale) return generateAndCache(jobId);
      return { ...cached.matrix, stale: false };
    },
    exportMarkdown(jobId: string): string {
      return input.service.exportMarkdown(jobId);
    },
  };
}
