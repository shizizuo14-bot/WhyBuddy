import { describe, expect, it } from "vitest";

import type { PermissionAuditEntry } from "../../shared/permission/contracts.js";
import { AuditLogger } from "../permission/audit-logger.js";
import {
  toPermissionAuditFromPythonHook,
} from "../permission/check-engine.js";

function createInMemAuditDb() {
  const entries: PermissionAuditEntry[] = [];
  return {
    getPermissionAudit: () => entries,
    addPermissionAudit: (e: PermissionAuditEntry) => {
      entries.push(e);
    },
  };
}

describe("permission audit hooks python runtime", () => {
  it("maps python allowed audit hook result and records via audit logger", () => {
    const db = createInMemAuditDb();
    const logger = new AuditLogger(db as any);

    const pythonHook = {
      contractVersion: "permission-audit-hook.v1",
      source: "python_runtime",
      result: "allowed",
      actor: "agent-py",
      resourceType: "filesystem",
      action: "read",
      resource: "/sandbox/py/file.txt",
      reason: "Allowed by explicit allow rule for filesystem:read",
      policy: { resourceType: "filesystem", action: "read", effect: "allow" },
      risk: "low",
    };

    const mapped = toPermissionAuditFromPythonHook(pythonHook);
    expect(mapped).not.toBeNull();
    expect(mapped!.result).toBe("allowed");

    logger.log(mapped!);

    expect(db.getPermissionAudit().length).toBe(1);
    expect(db.getPermissionAudit()[0].result).toBe("allowed");
    expect(db.getPermissionAudit()[0].agentId).toBe("agent-py");
  });

  it("maps python denied hook result, records, and does not become allowed", () => {
    const db = createInMemAuditDb();
    const logger = new AuditLogger(db as any);

    const pythonHook = {
      source: "python_runtime",
      result: "denied",
      actor: "agent-deny",
      resourceType: "mcp_tool",
      action: "call",
      resource: "internal.risky",
      reason: "Denied by explicit deny rule for mcp_tool:call",
      error: { code: "explicit_deny", message: "..." },
    };

    const mapped = toPermissionAuditFromPythonHook(pythonHook);
    expect(mapped!.result).toBe("denied");
    expect(mapped!.result).not.toBe("allowed");

    logger.log(mapped!);

    const all = db.getPermissionAudit();
    expect(all.length).toBe(1);
    expect(all[0].result).toBe("denied");
  });

  it("maps python approval_required from governance hook and records as blocked", () => {
    const db = createInMemAuditDb();
    const logger = new AuditLogger(db as any);

    const pythonHook = {
      source: "python_runtime",
      result: "approval_required",
      actor: "agent-approval",
      resourceType: "api",
      action: "execute",
      resource: "/highrisk",
      reason: "Governance requires approval",
      governance: {
        outcome: "approval_required",
        riskLevel: "critical",
        policyId: "p-99",
        rationale: "requires human",
        requiresAudit: true,
      },
    };

    const mapped = toPermissionAuditFromPythonHook(pythonHook);
    expect(mapped!.result).toBe("approval_required");

    logger.log(mapped!);

    expect(db.getPermissionAudit()[0].result).toBe("approval_required");
  });

  it("maps python error hook result and records without turning into allowed", () => {
    const db = createInMemAuditDb();
    const logger = new AuditLogger(db as any);

    const pythonHook = {
      source: "python_runtime",
      result: "error",
      actor: "agent-err",
      resourceType: "database",
      action: "select",
      resource: "db.users",
      reason: "Invalid permission policy",
      error: { code: "invalid_policy", message: "bad matrix" },
    };

    const mapped = toPermissionAuditFromPythonHook(pythonHook);
    expect(mapped!.result).toBe("error");
    expect(mapped!.result).not.toBe("allowed");

    logger.log(mapped!);

    expect(db.getPermissionAudit()[0].result).toBe("error");
  });

  it("permission engine style audit log accepts python provenance metadata", () => {
    const db = createInMemAuditDb();
    const logger = new AuditLogger(db as any);

    // simulate engine using python result directly (as would be wired)
    logger.log({
      agentId: "agent-engine",
      operation: "check",
      resourceType: "network",
      action: "connect",
      resource: "10.0.0.1",
      result: "denied",
      reason: "from python hook",
      metadata: { pythonSource: "python_runtime", fromHook: true },
    });

    const entry = db.getPermissionAudit()[0];
    expect(entry.result).toBe("denied");
    expect(entry.metadata?.fromHook).toBe(true);
  });
});
