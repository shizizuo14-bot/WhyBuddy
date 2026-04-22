import { describe, expect, it } from "vitest";

import {
  toCubeWorkflowStatus,
  toWebAigcNodeRunStatus,
  toWebAigcRuntimeStatus,
} from "../workflow-domain.js";

describe("workflow-domain status mapping", () => {
  it("maps cube workflow states into unified runtime states", () => {
    expect(toWebAigcRuntimeStatus("pending")).toBe("PENDING");
    expect(toWebAigcRuntimeStatus("running")).toBe("EXECUTING");
    expect(toWebAigcRuntimeStatus("running", { waitingFor: "approval" })).toBe(
      "WAITING_INPUT",
    );
    expect(toWebAigcRuntimeStatus("completed")).toBe("EXECUTED");
    expect(toWebAigcRuntimeStatus("failed")).toBe("EXCEPTION");
    expect(toWebAigcRuntimeStatus("force_terminated")).toBe("FORCE_TERMINATED");
  });

  it("maps task states into node run states", () => {
    expect(toWebAigcNodeRunStatus("queued")).toBe("PENDING");
    expect(toWebAigcNodeRunStatus("submitted")).toBe("EXECUTING");
    expect(toWebAigcNodeRunStatus("waiting_input")).toBe("WAITING_INPUT");
    expect(toWebAigcNodeRunStatus("passed")).toBe("EXECUTED");
    expect(toWebAigcNodeRunStatus("skipped")).toBe("SKIPPED");
    expect(toWebAigcNodeRunStatus("failed")).toBe("EXCEPTION");
  });

  it("maps unified runtime states back to cube workflow statuses", () => {
    expect(toCubeWorkflowStatus("PENDING")).toBe("pending");
    expect(toCubeWorkflowStatus("EXECUTING")).toBe("running");
    expect(toCubeWorkflowStatus("WAITING_INPUT")).toBe("running");
    expect(toCubeWorkflowStatus("EXECUTED")).toBe("completed");
    expect(toCubeWorkflowStatus("EXCEPTION")).toBe("failed");
    expect(toCubeWorkflowStatus("FORCE_TERMINATED")).toBe("force_terminated");
  });
});
