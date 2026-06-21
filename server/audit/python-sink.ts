import {
  isAuditProductionSinkPythonContractResult,
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

export function validatePythonAuditProductionSinkResult(
  payload: unknown,
): AuditProductionSinkPythonContractResult {
  if (!isAuditProductionSinkPythonContractResult(payload)) {
    throw new Error("Invalid Python audit production sink result");
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
