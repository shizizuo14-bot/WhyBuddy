import { performance } from "node:perf_hooks";

export type ExecuteCapabilityLogMeta = {
  provenance?: string;
  error?: string;
  httpStatus?: number;
  model?: string;
};

export function createExecuteCapabilityLogger(capabilityId: string, turnId: string) {
  const started = performance.now();

  return (meta: ExecuteCapabilityLogMeta = {}): void => {
    const payload: Record<string, unknown> = {
      tag: "sliderule.execute-capability",
      capabilityId,
      turnId,
      durationMs: Math.round(performance.now() - started),
      httpStatus: meta.httpStatus ?? 200,
    };
    if (meta.provenance) payload.provenance = meta.provenance;
    if (meta.error) payload.error = meta.error;
    if (meta.model) payload.model = meta.model;
    console.log(JSON.stringify(payload));
  };
}

export function provenanceFromBody(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const p = (body as { provenance?: unknown }).provenance;
  return typeof p === "string" ? p : undefined;
}