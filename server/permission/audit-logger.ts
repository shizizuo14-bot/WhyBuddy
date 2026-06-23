/**
 * AuditLogger — 权限审计日志
 *
 * 记录所有权限检查、授予、撤销、提升等操作，
 * 提供审计追踪、使用报告、违规查询和报告导出。
 *
 * Validates: Requirements 11.1–11.5
 */

import { randomUUID } from "node:crypto";
import type {
  GovernanceDecision,
  PermissionAuditEntry,
  PermissionUsageReport,
  ResourceType,
  Action,
} from "../../shared/permission/contracts.js";
import { RESOURCE_TYPES } from "../../shared/permission/contracts.js";
import { AuditEventType } from "../../shared/audit/contracts.js";
import type { AuditLogger as IAuditLogger } from "./check-engine.js";
import type { AuditCollector } from "../audit/audit-collector.js";

// ─── Database interface (subset used by this module) ────────────────────────

export interface AuditLoggerDb {
  getPermissionAudit(): PermissionAuditEntry[];
  addPermissionAudit(entry: PermissionAuditEntry): void;
}

// ─── AuditLogger ────────────────────────────────────────────────────────────

export class AuditLogger implements IAuditLogger {
  constructor(
    private db: AuditLoggerDb,
    private platformAuditCollector?: AuditCollector,
  ) {}

  /**
   * Record an audit entry. Auto-generates id and timestamp.
   */
  log(
    entry: Omit<PermissionAuditEntry, "id" | "timestamp">,
  ): void {
    const full: PermissionAuditEntry = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      ...entry,
    };
    this.db.addPermissionAudit(full);
    this.mirrorToPlatformAudit(full);
  }

  /**
   * Get audit trail for a specific agent, optionally filtered by time range.
   */
  getAuditTrail(
    agentId: string,
    timeRange?: { from: string; to: string },
  ): PermissionAuditEntry[] {
    const all = this.db.getPermissionAudit();
    return all.filter((e) => {
      if (e.agentId !== agentId) return false;
      if (timeRange) {
        if (e.timestamp < timeRange.from) return false;
        if (e.timestamp > timeRange.to) return false;
      }
      return true;
    });
  }

  /**
   * Generate a usage report for an agent within a time range.
   * Aggregates allowed/denied counts overall and per resource type.
   */
  getUsageReport(
    agentId: string,
    timeRange: { from: string; to: string },
  ): PermissionUsageReport {
    const entries = this.getAuditTrail(agentId, timeRange);

    let allowedCount = 0;
    let deniedCount = 0;
    const resourceBreakdown = {} as Record<
      ResourceType,
      { allowed: number; denied: number }
    >;

    // Initialize all resource types to zero
    for (const rt of RESOURCE_TYPES) {
      resourceBreakdown[rt] = { allowed: 0, denied: 0 };
    }

    for (const entry of entries) {
      if (entry.result === "allowed") {
        allowedCount++;
        if (resourceBreakdown[entry.resourceType]) {
          resourceBreakdown[entry.resourceType].allowed++;
        }
      } else if (entry.result === "denied" || entry.result === "approval_required") {
        deniedCount++;
        if (resourceBreakdown[entry.resourceType]) {
          resourceBreakdown[entry.resourceType].denied++;
        }
      }
      // "error" entries are not counted in allowed/denied
    }

    return {
      agentId,
      timeRange,
      totalChecks: entries.length,
      allowedCount,
      deniedCount,
      resourceBreakdown,
    };
  }

  /**
   * Get all denied entries (violations), optionally filtered by time range.
   */
  getViolations(
    timeRange?: { from: string; to: string },
  ): PermissionAuditEntry[] {
    const all = this.db.getPermissionAudit();
    return all.filter((e) => {
      if (e.result !== "denied") return false;
      if (timeRange) {
        if (e.timestamp < timeRange.from) return false;
        if (e.timestamp > timeRange.to) return false;
      }
      return true;
    });
  }

  /**
   * Export audit data as a JSON string.
   */
  exportReport(
    format: "json",
    timeRange?: { from: string; to: string },
  ): string {
    const all = this.db.getPermissionAudit();
    const filtered = timeRange
      ? all.filter(
          (e) => e.timestamp >= timeRange.from && e.timestamp <= timeRange.to,
        )
      : all;

    return JSON.stringify(
      {
        format,
        generatedAt: new Date().toISOString(),
        totalEntries: filtered.length,
        entries: filtered,
      },
      null,
      2,
    );
  }

  private mirrorToPlatformAudit(entry: PermissionAuditEntry): void {
    if (!this.platformAuditCollector) {
      return;
    }

    const eventType = selectPlatformAuditEvent(entry);
    try {
      this.platformAuditCollector.record({
        eventType,
        actor: { type: "agent", id: entry.agentId },
        action: `permission.${entry.operation}`,
        resource: {
          type: entry.resourceType,
          id: entry.resource || `${entry.resourceType}:${entry.action}`,
          name: entry.action,
        },
        result: mapAuditResult(entry.result),
        metadata: {
          permissionAction: entry.action,
          operator: entry.operator,
          reason: entry.reason,
          governance: entry.governance,
          permissionAuditId: entry.id,
          ...entry.metadata,
        },
      });
    } catch {
      // Platform audit mirroring must not break permission audit writes.
    }
  }
}

function mapAuditResult(
  result: PermissionAuditEntry["result"],
): "success" | "failure" | "denied" | "error" {
  switch (result) {
    case "allowed":
      return "success";
    case "denied":
    case "approval_required":
      return "denied";
    case "error":
      return "error";
  }
}

function selectPlatformAuditEvent(entry: PermissionAuditEntry): AuditEventType {
  if (entry.governance && entry.governance.outcome !== "allowed") {
    return AuditEventType.GOVERNANCE_ENFORCED;
  }

  switch (entry.operation) {
    case "grant":
      return AuditEventType.PERMISSION_GRANTED;
    case "revoke":
      return AuditEventType.PERMISSION_REVOKED;
    default:
      return AuditEventType.PERMISSION_CHECKED;
  }
}
