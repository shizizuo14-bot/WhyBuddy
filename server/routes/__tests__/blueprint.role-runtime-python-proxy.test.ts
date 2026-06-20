import { afterEach, describe, expect, it, vi } from "vitest";

import type { DelegateInput } from "../../../shared/blueprint/agent-delegator.js";
import { ROLE_RUNTIME_PROXY_CONTRACT_VERSION } from "../../../shared/blueprint/role-container/types.js";
import {
  buildRoleRuntimeInvokeProxyPayload,
  callPythonRoleRuntimeProxy,
} from "../blueprint/role-agent-runtime/python-proxy.js";

const SENSITIVE_MARKER = ["password", "fixture-token"].join("=");
const CALLBACK_MARKER = "callback-marker-value";

function makeInput(overrides: Partial<DelegateInput> = {}): DelegateInput {
  return {
    jobId: "job-role-runtime",
    roleId: "researcher",
    stageId: "spec_tree",
    goal: `inspect without exposing ${SENSITIVE_MARKER}`,
    systemPrompt: `system prompt has ${SENSITIVE_MARKER}`,
    context: {
      stage: "spec_tree",
      toolOutput: `raw tool result ${SENSITIVE_MARKER}`,
    },
    budget: { maxIterations: 2, maxTokens: 512 },
    outputSchema: { type: "object" },
    ...overrides,
  };
}

describe("Blueprint role runtime Python proxy contract", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("delegates invoke with digest-only prompt metadata and sanitizes returned trace", async () => {
    vi.stubEnv("PYTHON_SLIDE_RULE_BASE_URL", "http://python.test/");
    vi.stubEnv("PYTHON_SLIDE_RULE_INTERNAL_KEY", "internal-test");

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          action: "invoke",
          contractVersion: ROLE_RUNTIME_PROXY_CONTRACT_VERSION,
          runtime: {
            owner: "python",
            mode: "proxy_contract",
            agentExecution: "none",
            toolsExecuted: false,
            promptEchoed: false,
          },
          jobId: "job-role-runtime",
          roleId: "researcher",
          stageId: "spec_tree",
          status: "completed",
          output: {
            kind: "blueprint.role_runtime.proxy_contract",
            accepted: true,
          },
          executionMode: "lite",
          iterations: 0,
          totalTokens: 0,
          durationMs: 0,
          trace: [
            {
              iteration: 1,
              phase: "observing",
              timestamp: "2026-06-20T00:00:00.000Z",
              thought: `using ${SENSITIVE_MARKER}`,
              action: {
                toolId: "mcp.github",
                params: { authorization: `Bearer ${SENSITIVE_MARKER}` },
              },
              observation: {
                toolId: "skill.notify",
                result: `tool output password=${SENSITIVE_MARKER}`,
                durationMs: 5,
              },
              tokensUsed: 12,
              error: `failed with ${SENSITIVE_MARKER}`,
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const payload = buildRoleRuntimeInvokeProxyPayload(makeInput(), {
      callbackUrl: "http://node.test/api/blueprint/agent/progress",
      callbackSecret: CALLBACK_MARKER,
    });
    const result = await callPythonRoleRuntimeProxy("invoke", payload);

    expect(result.ok).toBe(true);
    if (!result.ok || result.action !== "invoke") {
      throw new Error("expected invoke success");
    }
    expect(result.runtime).toMatchObject({
      owner: "python",
      mode: "proxy_contract",
      agentExecution: "none",
      toolsExecuted: false,
      promptEchoed: false,
    });
    expect(JSON.stringify(result.trace)).not.toContain(SENSITIVE_MARKER);
    expect(JSON.stringify(result.trace)).toContain("[redacted]");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]?.[0]).toBe(
      "http://python.test/api/blueprint/role-runtime/invoke",
    );
    const request = fetchSpy.mock.calls[0]?.[1] as RequestInit;
    expect(request.headers).toMatchObject({
      "Content-Type": "application/json",
      "X-Internal-Key": "internal-test",
    });
    const body = String(request.body);
    expect(body).not.toContain(makeInput().systemPrompt);
    expect(body).not.toContain(makeInput().goal);
    expect(body).not.toContain(SENSITIVE_MARKER);
    expect(body).not.toContain(CALLBACK_MARKER);
    expect(JSON.parse(body)).toMatchObject({
      action: "invoke",
      contractVersion: ROLE_RUNTIME_PROXY_CONTRACT_VERSION,
      input: {
        jobId: "job-role-runtime",
        roleId: "researcher",
        stageId: "spec_tree",
        systemPromptLength: makeInput().systemPrompt.length,
        goalLength: makeInput().goal.length,
        outputSchemaProvided: true,
      },
      callback: {
        callbackUrlProvided: true,
        callbackSecretProvided: true,
      },
      nodeControl: {
        registryOwner: "node",
        toolExecutionOwner: "node",
        realAgentExecution: "disabled",
      },
    });
  });

  it("accepts progress proxy results without requiring a terminal invoke result", async () => {
    vi.stubEnv("PYTHON_SLIDE_RULE_BASE_URL", "http://python.test");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          action: "progress",
          contractVersion: ROLE_RUNTIME_PROXY_CONTRACT_VERSION,
          event: {
            jobId: "job-role-runtime",
            phase: "observing",
            iteration: 2,
            tokensUsed: 144,
            messageProvided: true,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await callPythonRoleRuntimeProxy("progress", {
      jobId: "job-role-runtime",
      phase: "observing",
      iteration: 2,
      tokensUsed: 144,
      message: `tool output contained ${SENSITIVE_MARKER}`,
    });

    expect(result).toMatchObject({
      ok: true,
      action: "progress",
      event: {
        jobId: "job-role-runtime",
        phase: "observing",
        iteration: 2,
        tokensUsed: 144,
        messageProvided: true,
      },
    });
  });

  it("returns runtime_error when the Python proxy is unreachable", async () => {
    vi.stubEnv("PYTHON_SLIDE_RULE_BASE_URL", "http://python.test");
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));

    const result = await callPythonRoleRuntimeProxy(
      "invoke",
      buildRoleRuntimeInvokeProxyPayload(makeInput()),
    );

    expect(result).toMatchObject({
      ok: false,
      action: "invoke",
      contractVersion: ROLE_RUNTIME_PROXY_CONTRACT_VERSION,
      error: "runtime_error",
      message: "ECONNREFUSED",
      retryable: true,
    });
  });

  it("maps invalid Python success shapes to schema_invalid instead of success", async () => {
    vi.stubEnv("PYTHON_SLIDE_RULE_BASE_URL", "http://python.test");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          action: "invoke",
          contractVersion: ROLE_RUNTIME_PROXY_CONTRACT_VERSION,
          runtime: {
            owner: "python",
            mode: "proxy_contract",
            agentExecution: "none",
            toolsExecuted: false,
            promptEchoed: false,
          },
          jobId: "job-role-runtime",
          roleId: "researcher",
          stageId: "spec_tree",
          status: "completed",
          output: { accepted: true },
          executionMode: "lite",
          iterations: 0,
          totalTokens: 0,
          durationMs: 0,
          trace: "not-an-array",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await callPythonRoleRuntimeProxy(
      "invoke",
      buildRoleRuntimeInvokeProxyPayload(makeInput()),
    );

    expect(result).toMatchObject({
      ok: false,
      action: "invoke",
      contractVersion: ROLE_RUNTIME_PROXY_CONTRACT_VERSION,
      error: "schema_invalid",
    });
    expect(result).not.toMatchObject({ ok: true, status: "completed" });
  });
});
