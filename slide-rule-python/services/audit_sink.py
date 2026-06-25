"""Minimal audit production sink evidence for the migration queue.

The sink is synthetic and side-effect free. It proves write success, store
failure, degraded, and missing-config envelopes without connecting to any
external audit platform or migrating Node-owned retention/export/anomaly/
compliance flows.
"""

from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


AUDIT_PRODUCTION_SINK_CONTRACT_VERSION = "audit-production-sink.runtime.v1"
NODE_OWNED_AUDIT_CAPABILITIES = ["retention", "export", "anomaly", "compliance"]

AuditSinkScenario = Literal["written", "missing_config", "store_failure", "degraded"]
AuditSinkKind = Literal["node-audit-store", "memory"]
AuditSinkStatus = Literal["written", "misconfigured", "failed", "degraded"]


def _non_empty(value: str) -> str:
    if not value.strip():
        raise ValueError("must be a non-empty string")
    return value


class AuditProductionSinkConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: AuditSinkKind
    configured: bool = False
    storeId: Optional[str] = None
    externalEmit: Literal[False] = False

    @field_validator("storeId")
    @classmethod
    def _validate_store_id(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        return _non_empty(value)


class AuditProductionSinkActor(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["user", "agent", "system"]
    id: str
    name: Optional[str] = None

    @field_validator("id")
    @classmethod
    def _validate_id(cls, value: str) -> str:
        return _non_empty(value)


class AuditProductionSinkResource(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: str
    id: str
    name: Optional[str] = None

    @field_validator("type", "id")
    @classmethod
    def _validate_non_empty(cls, value: str) -> str:
        return _non_empty(value)


class AuditProductionEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    eventId: str
    eventType: str
    timestamp: int = Field(ge=0)
    source: Literal["python-audit-production-sink"] = "python-audit-production-sink"
    actor: AuditProductionSinkActor
    action: str
    resource: AuditProductionSinkResource
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


class AuditProductionSinkWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")

    attempted: bool
    stored: bool
    eventId: str

    @field_validator("eventId")
    @classmethod
    def _validate_event_id(cls, value: str) -> str:
        return _non_empty(value)


class AuditProductionSinkError(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str
    message: str
    retryable: bool

    @field_validator("code", "message")
    @classmethod
    def _validate_non_empty(cls, value: str) -> str:
        return _non_empty(value)


class AuditProductionSinkProvenance(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source: Literal["python-audit-production-sink"] = "python-audit-production-sink"
    synthetic: Literal[True] = True
    externalAuditPlatform: Literal[False] = False
    nodeOwnedCapabilities: List[Literal["retention", "export", "anomaly", "compliance"]] = Field(
        default_factory=lambda: list(NODE_OWNED_AUDIT_CAPABILITIES)
    )


class AuditProductionSinkResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    contractVersion: Literal[AUDIT_PRODUCTION_SINK_CONTRACT_VERSION] = (
        AUDIT_PRODUCTION_SINK_CONTRACT_VERSION
    )
    runtime: Literal["python-audit-production-sink"] = "python-audit-production-sink"
    ok: bool
    status: AuditSinkStatus
    sink: AuditProductionSinkConfig
    event: AuditProductionEvent
    write: AuditProductionSinkWrite
    provenance: AuditProductionSinkProvenance = Field(default_factory=AuditProductionSinkProvenance)
    degradedCapabilities: Dict[
        Literal["retention", "export", "anomaly", "compliance"],
        Literal["node-owned"],
    ] = Field(default_factory=lambda: {key: "node-owned" for key in NODE_OWNED_AUDIT_CAPABILITIES})
    error: Optional[AuditProductionSinkError] = None

    @model_validator(mode="after")
    def _validate_status(self) -> "AuditProductionSinkResult":
        if self.write.eventId != self.event.eventId:
            raise ValueError("write event id must match event id")

        if self.provenance.nodeOwnedCapabilities != NODE_OWNED_AUDIT_CAPABILITIES:
            raise ValueError("audit retention/export/anomaly/compliance remain Node-owned")

        if self.degradedCapabilities != {key: "node-owned" for key in NODE_OWNED_AUDIT_CAPABILITIES}:
            raise ValueError("degraded audit capabilities must remain Node-owned")

        if self.status == "written":
            if self.ok is not True or self.error is not None:
                raise ValueError("written sink result must be ok without an error")
            if not self.sink.configured:
                raise ValueError("written sink result requires configured sink")
            if not self.write.attempted or not self.write.stored:
                raise ValueError("written sink result must attempt and store")
            return self

        if self.ok is not False:
            raise ValueError("non-written sink result must not be ok")
        if self.error is None:
            raise ValueError("non-written sink result requires an error envelope")
        if self.write.stored:
            raise ValueError("non-written sink result must not be stored")
        if self.status == "misconfigured" and self.write.attempted:
            raise ValueError("misconfigured sink must not attempt a write")
        return self


def execute_audit_production_sink(payload: Dict[str, Any]) -> AuditProductionSinkResult:
    """Return a synthetic audit sink result without external IO."""

    if not isinstance(payload, dict):
        raise ValueError("payload must be an object")

    sink = AuditProductionSinkConfig(**_read_record(payload.get("sink")))
    event = AuditProductionEvent(**_read_record(payload.get("event")))
    scenario = _read_scenario(payload.get("scenario"), sink)
    status = _status_for_scenario(scenario)
    error = _error_for_scenario(scenario)

    return AuditProductionSinkResult(
        ok=status == "written",
        status=status,
        sink=sink,
        event=event,
        write=AuditProductionSinkWrite(
            attempted=scenario != "missing_config",
            stored=scenario == "written",
            eventId=event.eventId,
        ),
        error=error,
    )


def _read_record(value: Any) -> Dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError("value must be an object")
    return value


def _read_scenario(value: Any, sink: AuditProductionSinkConfig) -> AuditSinkScenario:
    if value is None:
        return "written" if sink.configured else "missing_config"
    if value in {"written", "missing_config", "store_failure", "degraded"}:
        return value
    raise ValueError("scenario must be written, missing_config, store_failure, or degraded")


def _status_for_scenario(scenario: AuditSinkScenario) -> AuditSinkStatus:
    return {
        "written": "written",
        "missing_config": "misconfigured",
        "store_failure": "failed",
        "degraded": "degraded",
    }[scenario]


def _error_for_scenario(scenario: AuditSinkScenario) -> Optional[AuditProductionSinkError]:
    if scenario == "written":
        return None
    return AuditProductionSinkError(
        code={
            "missing_config": "audit_sink_missing_config",
            "store_failure": "audit_sink_store_failure",
            "degraded": "audit_sink_degraded",
        }[scenario],
        message={
            "missing_config": "Audit production sink is not configured.",
            "store_failure": "Audit production sink store write failed.",
            "degraded": "Audit production sink is degraded.",
        }[scenario],
        retryable=scenario != "missing_config",
    )
