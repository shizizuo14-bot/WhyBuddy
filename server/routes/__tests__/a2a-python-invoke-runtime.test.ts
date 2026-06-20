import { describe, expect, it } from "vitest";

import {
  A2A_ERROR_CODES,
  A2A_PYTHON_RUNTIME_CONTRACT_VERSION,
  type A2AEnvelope,
  isA2APythonRuntimeResult,
} from "../../../shared/a2a-protocol.js";

function envelope(method: A2AEnvelope["method"] = "a2a.invoke"): A2AEnvelope {
  return {
    jsonrpc: "2.0",
    method,
    id: "a2a-bridge-1",
    params: {
      targetAgent: "bridge-agent",
      task: "Bridge the A2A invoke result",
      context: "Runtime bridge test.",
      capabilities: ["summarize"],
      streamMode: method === "a2a.stream",
    },
    auth: "bridge-token",
  };
}

function baseRuntime(operation: string, payload: Record<string, unknown>) {
  return {
    contractVersion: A2A_PYTHON_RUNTIME_CONTRACT_VERSION,
    runtime: "python-contract",
    operation,
    ...payload,
  };
}

describe("A2A Python invoke runtime bridge", () => {
  it("accepts completed invoke runtime output from Python", () => {
    const response = {
      jsonrpc: "2.0" as const,
      id: "a2a-bridge-1",
      result: {
        output: "Bridge response.",
        artifacts: [],
        metadata: { source: "bridge-test" },
      },
    };
    const result = baseRuntime("invoke", {
      ok: true,
      status: "completed",
      envelope: envelope(),
      response,
      session: {
        sessionId: "a2a-bridge-1",
        requestEnvelope: envelope(),
        status: "completed",
        frameworkType: "custom",
        startedAt: 1710000000000,
        completedAt: 1710000000001,
        response,
        streamChunks: [],
      },
    });

    expect(isA2APythonRuntimeResult(result)).toBe(true);
  });

  it("rejects cancelled and failed runtime outputs that masquerade as completed", () => {
    const failed = baseRuntime("invoke", {
      ok: false,
      status: "failed",
      envelope: envelope(),
      error: {
        code: A2A_ERROR_CODES.FRAMEWORK_ERROR,
        message: "Python A2A bridge failed.",
      },
      response: {
        jsonrpc: "2.0",
        id: "a2a-bridge-1",
        error: {
          code: A2A_ERROR_CODES.FRAMEWORK_ERROR,
          message: "Python A2A bridge failed.",
        },
      },
      session: {
        sessionId: "a2a-bridge-1",
        requestEnvelope: envelope(),
        status: "failed",
        frameworkType: "custom",
        startedAt: 1710000000000,
        completedAt: 1710000000001,
        response: {
          jsonrpc: "2.0",
          id: "a2a-bridge-1",
          error: {
            code: A2A_ERROR_CODES.FRAMEWORK_ERROR,
            message: "Python A2A bridge failed.",
          },
        },
        streamChunks: [],
      },
    });
    const failedAsCompleted = {
      ...failed,
      ok: true,
      status: "completed",
      response: {
        jsonrpc: "2.0",
        id: "a2a-bridge-1",
        result: { output: "not allowed", artifacts: [], metadata: {} },
      },
    };
    const cancelledAsCompleted = baseRuntime("cancel", {
      ok: true,
      status: "completed",
      envelope: envelope("a2a.cancel"),
      error: {
        code: A2A_ERROR_CODES.CANCELLED,
        message: "A2A session cancelled.",
      },
      response: {
        jsonrpc: "2.0",
        id: "a2a-bridge-1",
        result: { output: "cancelled as success", artifacts: [], metadata: {} },
      },
      session: {
        sessionId: "a2a-bridge-1",
        requestEnvelope: envelope("a2a.cancel"),
        status: "cancelled",
        frameworkType: "custom",
        startedAt: 1710000000000,
        completedAt: 1710000000001,
        streamChunks: [],
      },
    });

    expect(isA2APythonRuntimeResult(failed)).toBe(true);
    expect(isA2APythonRuntimeResult(failedAsCompleted)).toBe(false);
    expect(isA2APythonRuntimeResult(cancelledAsCompleted)).toBe(false);
  });
});
