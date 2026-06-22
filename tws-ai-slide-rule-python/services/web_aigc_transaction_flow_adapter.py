"""Python runtime bridge for the Web AIGC transaction-flow decision envelope.

This module intentionally does not execute transactions, payments, orders,
database writes, or external workflows. It only analyzes the requested action,
preserves permission/audit metadata, and returns a decision envelope for Node.
"""

from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


TRANSACTION_FLOW_CONTRACT_VERSION = "web_aigc.transaction_flow_runtime.v1"

TransactionFlowStatus = Literal["approved", "rejected", "degraded", "error"]
RiskLevel = Literal["low", "medium", "high", "critical"]
AuditEventKey = Literal[
    "node.waiting_input",
    "human.approved",
    "human.rejected",
    "node.failed",
]


class TransactionFlowRuntimeMetadata(BaseModel):
    model_config = ConfigDict(extra="forbid")

    backend: Literal["python"] = "python"
    provider: Literal["fake"] = "fake"
    source: Literal["python-transaction-flow-runtime"] = "python-transaction-flow-runtime"
    externalCalls: Literal[False] = False
    executedTransaction: Literal[False] = False
    persisted: Literal[False] = False


class TransactionFlowRuntimeError(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str
    message: str

    @field_validator("code", "message")
    @classmethod
    def _validate_non_empty(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("must be a non-empty string")
        return value


class TransactionFlowPermission(BaseModel):
    model_config = ConfigDict(extra="allow")

    allowed: bool = True
    resource: str
    reason: Optional[str] = None
    suggestion: Optional[str] = None
    governance: Optional[Dict[str, Any]] = None

    @field_validator("resource")
    @classmethod
    def _validate_resource(cls, value: str) -> str:
        return _non_empty(value, "permission.resource")


class TransactionFlowAudit(BaseModel):
    model_config = ConfigDict(extra="allow")

    logged: bool = False
    auditEntryId: str
    operation: Literal["transaction_flow"] = "transaction_flow"
    eventKey: AuditEventKey
    summary: Optional[str] = None
    timestamp: str
    decisionId: str

    @field_validator("auditEntryId", "timestamp", "decisionId")
    @classmethod
    def _validate_non_empty(cls, value: str) -> str:
        return _non_empty(value, "audit field")


class TransactionFlowAnalysis(BaseModel):
    model_config = ConfigDict(extra="forbid")

    transactionId: str
    service: str
    action: str
    resource: str
    targetId: Optional[str] = None
    riskLevel: RiskLevel = "critical"
    sideEffectCount: int
    summary: str


class TransactionFlowDecision(BaseModel):
    model_config = ConfigDict(extra="forbid")

    approved: bool
    reason: str
    decisionId: str
    actorId: Optional[str] = None
    ticketId: Optional[str] = None


class TransactionFlowRuntimeResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    contractVersion: Literal[TRANSACTION_FLOW_CONTRACT_VERSION] = TRANSACTION_FLOW_CONTRACT_VERSION
    ok: bool
    status: TransactionFlowStatus
    analysis: TransactionFlowAnalysis
    decision: TransactionFlowDecision
    permission: TransactionFlowPermission
    audit: TransactionFlowAudit
    warnings: List[str] = Field(default_factory=list)
    error: Optional[TransactionFlowRuntimeError] = None
    runtime: TransactionFlowRuntimeMetadata = Field(default_factory=TransactionFlowRuntimeMetadata)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class TransactionFlowValidationError(ValueError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def execute_transaction_flow_runtime_bridge(payload: Dict[str, Any]) -> TransactionFlowRuntimeResponse:
    """Return a side-effect-free transaction-flow decision envelope."""

    if not isinstance(payload, dict):
        raise TransactionFlowValidationError("invalid_payload", "payload must be an object")

    metadata = _read_object(payload.get("metadata"))
    transaction = _read_transaction(payload.get("transaction"))
    permission = _read_permission(payload.get("permission"), transaction)
    audit = _read_audit(payload.get("audit"), payload, transaction)
    analysis = _build_analysis(transaction, permission)
    approval = _read_object(payload.get("approval"))
    decision_id = _read_optional_string(approval.get("decisionId")) or audit.decisionId
    actor_id = _read_optional_string(approval.get("actorId"))
    ticket_id = _read_optional_string(approval.get("ticketId"))

    scenario = payload.get("scenario")
    if scenario == "degraded":
        return _failure(
            "degraded",
            "runtime_degraded",
            "Transaction flow runtime is degraded.",
            analysis,
            permission,
            audit,
            decision_id,
            actor_id=actor_id,
            ticket_id=ticket_id,
            warnings=["Transaction flow runtime is degraded."],
            metadata=metadata,
        )

    if scenario == "error":
        return _failure(
            "error",
            "runtime_error",
            "Transaction flow runtime failed.",
            analysis,
            permission,
            audit,
            decision_id,
            actor_id=actor_id,
            ticket_id=ticket_id,
            metadata=metadata,
        )

    if not permission.allowed:
        return _failure(
            "rejected",
            "permission_denied",
            permission.reason or "Transaction flow permission denied.",
            analysis,
            permission,
            audit,
            decision_id,
            actor_id=actor_id,
            ticket_id=ticket_id,
            metadata=metadata,
        )

    if approval.get("decision") == "rejected":
        return _failure(
            "rejected",
            "approval_rejected",
            _read_optional_string(approval.get("comment")) or "Rejected by approver.",
            analysis,
            permission,
            audit,
            decision_id,
            actor_id=actor_id,
            ticket_id=ticket_id,
            metadata=metadata,
        )

    if approval.get("decision") != "approved":
        return _failure(
            "rejected",
            "approval_missing",
            "Transaction flow requires an approved decision envelope.",
            analysis,
            permission,
            audit,
            decision_id,
            actor_id=actor_id,
            ticket_id=ticket_id,
            metadata=metadata,
        )

    return TransactionFlowRuntimeResponse(
        ok=True,
        status="approved",
        analysis=analysis,
        decision=TransactionFlowDecision(
            approved=True,
            reason=_read_optional_string(approval.get("comment")) or "Approved by decision envelope.",
            decisionId=decision_id,
            actorId=actor_id,
            ticketId=ticket_id,
        ),
        permission=permission,
        audit=audit,
        metadata=metadata,
    )


def _failure(
    status: Literal["rejected", "degraded", "error"],
    code: str,
    message: str,
    analysis: TransactionFlowAnalysis,
    permission: TransactionFlowPermission,
    audit: TransactionFlowAudit,
    decision_id: str,
    *,
    actor_id: Optional[str] = None,
    ticket_id: Optional[str] = None,
    warnings: Optional[List[str]] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> TransactionFlowRuntimeResponse:
    return TransactionFlowRuntimeResponse(
        ok=False,
        status=status,
        analysis=analysis,
        decision=TransactionFlowDecision(
            approved=False,
            reason=message,
            decisionId=decision_id,
            actorId=actor_id,
            ticketId=ticket_id,
        ),
        permission=permission,
        audit=audit,
        warnings=warnings or [],
        error=TransactionFlowRuntimeError(code=code, message=message),
        metadata=metadata or {},
    )


def _read_transaction(value: Any) -> Dict[str, Any]:
    if not isinstance(value, dict):
        raise TransactionFlowValidationError("invalid_transaction", "transaction must be an object")

    transaction_id = _read_optional_string(value.get("transactionId")) or "txn_python_boundary"
    service = _non_empty(value.get("service"), "transaction.service")
    action = _non_empty(value.get("action"), "transaction.action")
    resource = _non_empty(value.get("resource"), "transaction.resource")
    return {
        **value,
        "transactionId": transaction_id,
        "service": service,
        "action": action,
        "resource": resource,
    }


def _read_permission(value: Any, transaction: Dict[str, Any]) -> TransactionFlowPermission:
    fallback_resource = (
        f"transaction_flow:{transaction['service']}:{transaction['action']}:{transaction['resource']}"
    )
    if value is None:
        return TransactionFlowPermission(allowed=True, resource=fallback_resource)
    if not isinstance(value, dict):
        raise TransactionFlowValidationError("invalid_permission", "permission must be an object")
    data = {"resource": fallback_resource, **value}
    return TransactionFlowPermission(**data)


def _read_audit(
    value: Any,
    payload: Dict[str, Any],
    transaction: Dict[str, Any],
) -> TransactionFlowAudit:
    if value is not None and not isinstance(value, dict):
        raise TransactionFlowValidationError("invalid_audit", "audit must be an object")

    audit_data = dict(value or {})
    approval = _read_object(payload.get("approval"))
    decision_id = (
        _read_optional_string(audit_data.get("decisionId"))
        or _read_optional_string(approval.get("decisionId"))
        or f"decision_{transaction['transactionId']}"
    )
    event_key = audit_data.get("eventKey")
    if event_key not in {"node.waiting_input", "human.approved", "human.rejected", "node.failed"}:
        event_key = "human.approved" if approval.get("decision") == "approved" else "human.rejected"
    return TransactionFlowAudit(
        logged=bool(audit_data.get("logged", False)),
        auditEntryId=_read_optional_string(audit_data.get("auditEntryId"))
        or f"audit_{transaction['transactionId']}",
        operation="transaction_flow",
        eventKey=event_key,
        summary=_read_optional_string(audit_data.get("summary")),
        timestamp=_read_optional_string(audit_data.get("timestamp")) or "1970-01-01T00:00:00.000Z",
        decisionId=decision_id,
    )


def _build_analysis(
    transaction: Dict[str, Any],
    permission: TransactionFlowPermission,
) -> TransactionFlowAnalysis:
    side_effects = transaction.get("sideEffects")
    side_effect_count = len(side_effects) if isinstance(side_effects, list) else 0
    governance = permission.governance if isinstance(permission.governance, dict) else {}
    risk_level = governance.get("riskLevel")
    if risk_level not in {"low", "medium", "high", "critical"}:
        risk_level = "critical"
    return TransactionFlowAnalysis(
        transactionId=transaction["transactionId"],
        service=transaction["service"],
        action=transaction["action"],
        resource=transaction["resource"],
        targetId=_read_optional_string(transaction.get("targetId")),
        riskLevel=risk_level,
        sideEffectCount=side_effect_count,
        summary=_read_optional_string(transaction.get("summary"))
        or f"{transaction['service']}.{transaction['action']} on {transaction['resource']}",
    )


def _read_object(value: Any) -> Dict[str, Any]:
    return dict(value) if isinstance(value, dict) else {}


def _read_optional_string(value: Any) -> Optional[str]:
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    return normalized or None


def _non_empty(value: Any, field: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise TransactionFlowValidationError("invalid_input", f"{field} must be a non-empty string")
    return value.strip()
