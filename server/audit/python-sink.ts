import {
  isAuditRetentionExportPythonContractResult,
  isAuditProductionSinkPythonContractResult,
  type AuditRetentionExportPythonContractResult,
  type AuditRetentionExportPythonStatus,
  type AuditProductionSinkPythonContractResult,
  type AuditProductionSinkPythonStatus,
} from "../../shared/audit/contracts.js";

export interface AuditSinkCollectorReport {
  success: boolean;
  status: AuditProductionSinkPythonStatus;
  eventId: string;
  error?: {
    code: string;
    message: "Audit production sink failed.";
    retryable: boolean;
  };
}

export interface AuditRetentionExportReport {
  success: boolean;
  status: AuditRetentionExportPythonStatus;
  operation: "retention" | "export";
  eventId: string;
  retentionDecision?: "keep" | "drop";
  manifestId?: string;
  error?: {
    code: string;
    message: "Audit retention/export runtime failed.";
    retryable: boolean;
  };
}

export function validatePythonAuditProductionSinkResult(
  payload: unknown,
): AuditProductionSinkPythonContractResult {
  if (!isAuditProductionSinkPythonContractResult(payload)) {
    throw new Error("Invalid Python audit production sink result");
  }
  return payload;
}

export function validatePythonAuditRetentionExportResult(
  payload: unknown,
): AuditRetentionExportPythonContractResult {
  if (!isAuditRetentionExportPythonContractResult(payload)) {
    throw new Error("Invalid Python audit retention/export result");
  }
  return payload;
}

export function toAuditSinkCollectorReport(
  result: AuditProductionSinkPythonContractResult,
): AuditSinkCollectorReport {
  if (result.ok && result.status === "written") {
    return {
      success: true,
      status: result.status,
      eventId: result.write.eventId,
    };
  }

  return {
    success: false,
    status: result.status,
    eventId: result.write.eventId,
    error: {
      code: result.error?.code ?? "audit_sink_error",
      message: "Audit production sink failed.",
      retryable: result.error?.retryable ?? true,
    },
  };
}

export function toAuditRetentionExportReport(
  result: AuditRetentionExportPythonContractResult,
): AuditRetentionExportReport {
  if (result.ok && result.status === "retained") {
    return {
      success: true,
      status: "retained",
      operation: result.operation,
      eventId: result.event.eventId,
      retentionDecision: result.retention?.decision,
    };
  }

  if (result.ok && result.status === "exported") {
    return {
      success: true,
      status: "exported",
      operation: result.operation,
      eventId: result.event.eventId,
      manifestId: result.export?.manifestId,
    };
  }

  return {
    success: false,
    status: result.status,
    operation: result.operation,
    eventId: result.event.eventId,
    error: {
      code: result.error?.code ?? "audit_retention_export_error",
      message: "Audit retention/export runtime failed.",
      retryable: result.error?.retryable ?? true,
    },
  };
}
