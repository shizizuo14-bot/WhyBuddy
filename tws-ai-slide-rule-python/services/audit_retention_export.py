"""Synthetic audit retention/export runtime boundary for the migration queue.

This module deliberately does not call an external audit platform or change the
production retention policy defaults. It validates a minimal runtime envelope so
Node can map retained, exported, denied, degraded, and error outcomes without
claiming that anomaly or compliance ownership moved to Python.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


AUDIT_RETENTION_EXPORT_CONTRACT_VERSION = "audit-retention-export.runtime.v1"
MS_PER_DAY = 24 * 60 * 60 * 1000

AuditRetentionExportOperation = Literal["retention", "export"]
AuditRetentionExportScenario = Literal["retained", "exported", "denied", "degraded", "error"]
AuditRetentionExportStatus = Literal["retained", "exported", "denied", "degraded", "error"]
AuditExportFormat = Literal["json", "csv"]
AuditRetentionDecision = Literal["keep", "drop"]


def _non_empty(value: str) -> str:
    if not value.strip():
        raise ValueError("must be a non-empty string")
    return value


class AuditRetentionExportActor(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["user", "agent", "system"]
    id: str
    name: Optional[str] = None

    @field_validator("id")
    @classmethod
    def _validate_id(cls, value: str) -> str:
        return _non_empty(value)


class AuditRetentionExportResource(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: str
    id: str
    name: Optional[str] = None

    @field_validator("type", "id")
    @classmethod
    def _validate_non_empty(cls, value: str) -> str:
        return _non_empty(value)


class AuditRetentionExportEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    eventId: str
    eventType: str
    timestamp: int = Field(ge=0)
    source: Literal["python-audit-retention-export"] = "python-audit-retention-export"
    actor: AuditRetentionExportActor
    action: str
    resource: AuditRetentionExportResource
    result: Literal["success", "failure", "denied", "error"]
    context: Dict[str, str] = Field(default_factory=dict)
    metadata: Optional[Dict[str, Any]] = None
    lineageId: Optional[str] = None

    @field_validator("eventId", "eventType", "action")
    @classmethod
    def _validate_event_strings(cls, value: str) -> str:
        return _non_empty(value)

    @field_validator("context")
    @classmethod
    def _validate_context(cls, value: Dict[str, str]) -> Dict[str, str]:
        for key, item in value.items():
            _non_empty(key)
            if not isinstance(item, str):
                raise ValueError("context values must be strings")
        return value


class AuditRetentionExportPage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    pageSize: int = Field(ge=1)
    pageNum: int = Field(ge=1)


class AuditRetentionExportQueryEnvelope(BaseModel):
    model_config = ConfigDict(extra="forbid")

    filters: Dict[str, Any] = Field(default_factory=dict)
    page: AuditRetentionExportPage = Field(
        default_factory=lambda: AuditRetentionExportPage(pageSize=50, pageNum=1)
    )
    total: int = Field(ge=0)


class AuditRetentionPolicyEnvelope(BaseModel):
    model_config = ConfigDict(extra="forbid")

    severity: Literal["INFO", "WARNING", "CRITICAL"]
    retentionDays: int = Field(ge=0)
    archiveAfterDays: int = Field(ge=0)
    deleteAfterDays: int = Field(ge=0)


class AuditRetentionDecisionEnvelope(BaseModel):
    model_config = ConfigDict(extra="forbid")

    decision: AuditRetentionDecision
    reason: Literal["within_retention", "retention_expired"]
    eventId: str
    externalDelete: Literal[False] = False

    @field_validator("eventId")
    @classmethod
    def _validate_event_id(cls, value: str) -> str:
        return _non_empty(value)


class AuditExportManifest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    manifestId: str
    format: AuditExportFormat
    entryCount: int = Field(ge=0)
    eventIds: List[str]
    externalEmit: Literal[False] = False
    hash: str

    @field_validator("manifestId", "hash")
    @classmethod
    def _validate_non_empty(cls, value: str) -> str:
        return _non_empty(value)

    @field_validator("eventIds")
    @classmethod
    def _validate_event_ids(cls, value: List[str]) -> List[str]:
        for item in value:
            _non_empty(item)
        return value

    @model_validator(mode="after")
    def _validate_manifest(self) -> "AuditExportManifest":
        if self.entryCount != len(self.eventIds):
            raise ValueError("export manifest entry count must match event ids")
        return self


class AuditRetentionExportError(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str
    message: str
    retryable: bool

    @field_validator("code", "message")
    @classmethod
    def _validate_non_empty(cls, value: str) -> str:
        return _non_empty(value)


class AuditRetentionExportProvenance(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source: Literal["python-audit-retention-export"] = "python-audit-retention-export"
    synthetic: Literal[True] = True
    externalAuditPlatform: Literal[False] = False
    boundary: Literal["runtime"] = "runtime"
    nodeOwnedCapabilities: List[Literal["anomaly", "compliance"]] = Field(
        default_factory=lambda: ["anomaly", "compliance"]
    )

    @field_validator("nodeOwnedCapabilities")
    @classmethod
    def _validate_node_owned_capabilities(
        cls, value: List[Literal["anomaly", "compliance"]]
    ) -> List[Literal["anomaly", "compliance"]]:
        if value != ["anomaly", "compliance"]:
            raise ValueError("only anomaly and compliance remain Node-owned")
        return value


class AuditRetentionExportResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    contractVersion: Literal[AUDIT_RETENTION_EXPORT_CONTRACT_VERSION] = (
        AUDIT_RETENTION_EXPORT_CONTRACT_VERSION
    )
    runtime: Literal["python-audit-retention-export"] = "python-audit-retention-export"
    ok: bool
    operation: AuditRetentionExportOperation
    status: AuditRetentionExportStatus
    query: AuditRetentionExportQueryEnvelope
    event: AuditRetentionExportEvent
    retention: Optional[AuditRetentionDecisionEnvelope] = None
    export: Optional[AuditExportManifest] = None
    provenance: AuditRetentionExportProvenance = Field(
        default_factory=AuditRetentionExportProvenance
    )
    error: Optional[AuditRetentionExportError] = None

    @model_validator(mode="after")
    def _validate_status(self) -> "AuditRetentionExportResult":
        if self.status == "retained":
            if self.ok is not True or self.operation != "retention":
                raise ValueError("retained result must be a successful retention operation")
            if self.retention is None or self.retention.eventId != self.event.eventId:
                raise ValueError("retained result requires a matching retention decision")
            if self.export is not None or self.error is not None:
                raise ValueError("retained result must not include export or error envelopes")
            return self

        if self.status == "exported":
            if self.ok is not True or self.operation != "export":
                raise ValueError("exported result must be a successful export operation")
            if self.export is None or self.error is not None:
                raise ValueError("exported result requires a manifest without an error")
            if self.event.eventId not in self.export.eventIds:
                raise ValueError("exported manifest must include the primary event id")
            return self

        if self.ok is not False:
            raise ValueError("denied, degraded, and error results must not be ok")
        if self.error is None:
            raise ValueError("denied, degraded, and error results require an error")
        if self.export is not None:
            raise ValueError("denied, degraded, and error results must not include export manifests")
        return self


def execute_audit_retention_export(payload: Dict[str, Any]) -> AuditRetentionExportResult:
    """Return a synthetic retention/export runtime result without external IO."""

    if not isinstance(payload, dict):
        raise ValueError("payload must be an object")

    operation = _read_operation(payload.get("operation"))
    scenario = _read_scenario(payload.get("scenario"), operation)
    entries = _read_entries(payload, operation)
    if not entries:
        raise ValueError("at least one audit entry is required")

    event = _event_from_entry(entries[0])
    query = _read_query(payload.get("query"), len(entries))

    if scenario in {"denied", "degraded", "error"}:
        return AuditRetentionExportResult(
            ok=False,
            operation=operation,
            status=scenario,
            query=query,
            event=event,
            error=_error_for_scenario(operation, scenario),
        )

    if operation == "retention":
        retention_payload = _read_record(payload.get("retention"))
        policy = AuditRetentionPolicyEnvelope(**_read_record(retention_payload.get("policy")))
        now = _read_non_negative_int(retention_payload.get("now"), event.timestamp)
        decision = _retention_decision(event, policy, now)
        return AuditRetentionExportResult(
            ok=True,
            operation="retention",
            status="retained",
            query=query,
            event=event,
            retention=decision,
        )

    export_payload = _read_record(payload.get("export"))
    export_format = _read_export_format(export_payload.get("format"))
    manifest = _export_manifest(export_format, entries)
    return AuditRetentionExportResult(
        ok=True,
        operation="export",
        status="exported",
        query=query,
        event=event,
        export=manifest,
    )


def _read_operation(value: Any) -> AuditRetentionExportOperation:
    if value in {"retention", "export"}:
        return value
    raise ValueError("operation must be retention or export")


def _read_scenario(
    value: Any,
    operation: AuditRetentionExportOperation,
) -> AuditRetentionExportScenario:
    if value is None:
        return "retained" if operation == "retention" else "exported"
    if value in {"retained", "exported", "denied", "degraded", "error"}:
        if operation == "retention" and value == "exported":
            raise ValueError("retention operation cannot use exported scenario")
        if operation == "export" and value == "retained":
            raise ValueError("export operation cannot use retained scenario")
        return value
    raise ValueError("scenario must be retained, exported, denied, degraded, or error")


def _read_entries(payload: Dict[str, Any], operation: AuditRetentionExportOperation) -> List[Dict[str, Any]]:
    if operation == "retention":
        retention_payload = _read_record(payload.get("retention"))
        return [_read_record(retention_payload.get("entry"))]

    export_payload = _read_record(payload.get("export"))
    raw_entries = export_payload.get("entries")
    if not isinstance(raw_entries, list):
        raise ValueError("export.entries must be an array")
    return [_read_record(item) for item in raw_entries]


def _event_from_entry(entry: Dict[str, Any]) -> AuditRetentionExportEvent:
    event = _read_record(entry.get("event"))
    return AuditRetentionExportEvent(**{**event, "source": "python-audit-retention-export"})


def _read_query(value: Any, total: int) -> AuditRetentionExportQueryEnvelope:
    if value is None:
        return AuditRetentionExportQueryEnvelope(filters={}, total=total)
    query = _read_record(value)
    filters = query.get("filters", {})
    if not isinstance(filters, dict):
        raise ValueError("query.filters must be an object")
    page_value = query.get("page")
    page = (
        AuditRetentionExportPage(pageSize=50, pageNum=1)
        if page_value is None
        else AuditRetentionExportPage(**_read_record(page_value))
    )
    return AuditRetentionExportQueryEnvelope(filters=filters, page=page, total=total)


def _read_export_format(value: Any) -> AuditExportFormat:
    if value in {"json", "csv"}:
        return value
    raise ValueError("export.format must be json or csv")


def _read_record(value: Any) -> Dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError("value must be an object")
    return value


def _read_non_negative_int(value: Any, default: int) -> int:
    if value is None:
        return default
    if isinstance(value, int) and value >= 0:
        return value
    raise ValueError("value must be a non-negative integer")


def _retention_decision(
    event: AuditRetentionExportEvent,
    policy: AuditRetentionPolicyEnvelope,
    now: int,
) -> AuditRetentionDecisionEnvelope:
    age_days = max(0, (now - event.timestamp) // MS_PER_DAY)
    if age_days > policy.deleteAfterDays:
        return AuditRetentionDecisionEnvelope(
            decision="drop",
            reason="retention_expired",
            eventId=event.eventId,
        )
    return AuditRetentionDecisionEnvelope(
        decision="keep",
        reason="within_retention",
        eventId=event.eventId,
    )


def _export_manifest(format_: AuditExportFormat, entries: List[Dict[str, Any]]) -> AuditExportManifest:
    event_ids = [_event_from_entry(entry).eventId for entry in entries]
    body = json.dumps(entries, sort_keys=True, separators=(",", ":"))
    digest = hashlib.sha256(body.encode("utf-8")).hexdigest()
    return AuditExportManifest(
        manifestId=f"audit-export-{format_}-{len(entries)}",
        format=format_,
        entryCount=len(entries),
        eventIds=event_ids,
        hash=digest,
    )


def _error_for_scenario(
    operation: AuditRetentionExportOperation,
    scenario: Literal["denied", "degraded", "error"],
) -> AuditRetentionExportError:
    prefix = "audit_retention" if operation == "retention" else "audit_export"
    return AuditRetentionExportError(
        code={
            "denied": f"{prefix}_denied",
            "degraded": f"{prefix}_degraded",
            "error": f"{prefix}_error",
        }[scenario],
        message="Audit retention/export runtime did not export.",
        retryable=scenario != "denied",
    )
