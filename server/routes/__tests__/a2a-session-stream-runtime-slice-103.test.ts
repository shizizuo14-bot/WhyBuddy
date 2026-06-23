/**
 * A2A session-stream runtime slice 103 (Node consumption).
 *
 * Verifies:
 * - Python session stream slice is consumable (create/append/cancel)
 * - Bridge correctly surfaces python-owned slice vs node fallback
 * - Never treats slice as production transport takeover (ownership separate)
 * - At least one real path for session, stream, cancel covered
 * - Clear fallback when python slice not wired
 */

import { describe, expect, it, vi } from "vitest";

import {
  validateA2ASessionStreamSliceResult,
  A2A_SESSION_STREAM_SLICE_CONTRACT_VERSION,
  runA2ASessionStreamSlice,
  getA2ASessionStreamSliceOwnership,
  validateA2AProductionTransportOwnership,
} from "../a2a-python-runtime.js";

describe("a2a-session-stream-runtime-slice-103 - node consumption", () => {
  it("validates python session stream slice result and marks python owner", () => {
    const created = validateA2ASessionStreamSliceResult({
      ok: true,
      status: "pending",
      session: { sessionId: "s-103", status: "pending" },
      contractVersion: A2A_SESSION_STREAM_SLICE_CONTRACT_VERSION,
      provenance: "python-a2a-session-stream-runtime-slice-103",
      runtime: { owner: "python", mode: "session_stream_slice" },
    });
    expect(created.ok).toBe(true);
    expect(created.status).toBe("pending");
    expect(created.runtime.owner).toBe("python");
  });

  it("node bridge consumes python slice for create path", async () => {
    const pythonSlice = {
      create: vi.fn(async (p: any) => ({
        ok: true,
        status: "pending",
        session: { sessionId: p?.envelope?.id || "s", status: "pending" },
        contractVersion: A2A_SESSION_STREAM_SLICE_CONTRACT_VERSION,
        provenance: "python-a2a-session-stream-runtime-slice-103",
        runtime: { owner: "python", mode: "session_stream_slice" },
      })),
    };

    const result = await runA2ASessionStreamSlice(pythonSlice as any, "create", { envelope: { id: "slice-test" } });
    expect(result.ok).toBe(true);
    expect(result.runtime.owner).toBe("python");
    expect(pythonSlice.create).toHaveBeenCalled();
  });

  it("falls back to node when no python slice wired, preserving no-takeover", async () => {
    const result = await runA2ASessionStreamSlice(undefined as any, "create", {});
    expect(result.ok).toBe(false);
    expect(result.status).toBe("skipped-live");
    expect(result.runtime.owner).toBe("node");
    const own = validateA2AProductionTransportOwnership({ productionTakeover: false });
    expect(own.productionTakeover).toBe(false);
  });

  it("covers stream append and cancel paths on slice with ownership retained on transport", async () => {
    const pythonSlice = {
      create: vi.fn(async () => ({ ok: true, status: "running", runtime: { owner: "python", mode: "session_stream_slice" } })),
      append: vi.fn(async (sid: string, ch: any) => ({
        ok: true,
        status: "running",
        streamChunk: ch,
        session: { sessionId: sid, status: "running" },
        runtime: { owner: "python", mode: "session_stream_slice" },
      })),
      cancel: vi.fn(async (sid: string) => ({
        ok: false,
        status: "cancelled",
        session: { sessionId: sid, status: "cancelled" },
        runtime: { owner: "python", mode: "session_stream_slice" },
      })),
    };

    const s1 = await runA2ASessionStreamSlice(pythonSlice as any, "create", {});
    expect(getA2ASessionStreamSliceOwnership(s1)).toBe("python");

    const appendRes = await runA2ASessionStreamSlice(pythonSlice as any, "append", { sessionId: "s", chunk: { done: false } });
    expect(appendRes.status).toBe("running");

    const cancelRes = await runA2ASessionStreamSlice(pythonSlice as any, "cancel", { sessionId: "s" });
    expect(cancelRes.status).toBe("cancelled");
    expect(cancelRes.ok).toBe(false);

    // production transport ownership is separate and false
    const transportOwn = validateA2AProductionTransportOwnership({
      productionTakeover: false,
      ownership: { realStreamTransport: "node-retained" },
    });
    expect(transportOwn.productionTakeover).toBe(false);
    expect(transportOwn.ownership.realStreamTransport).toBe("node-retained");
  });
});
