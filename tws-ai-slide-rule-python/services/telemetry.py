"""Production telemetry sink smoke contracts.

This module is intentionally side-effect free. It models production sink wiring
states so smoke tests can prove degraded, unknown, timeout, and missing config
remain visible without sending telemetry to an external service.
"""

from __future__ import annotations

from typing import Any, Dict, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


TELEMETRY_PRODUCTION_SINK_CONTRACT_VERSION = "telemetry-production-sink.runtime.v1"

TelemetrySinkScenario = Literal[
    "delivered",
    "missing_config",
    "timeout",
    "unhealthy",
    "unknown",
]
TelemetrySinkKind = Literal["otlp", "datadog", "prometheus", "console", "memory"]
TelemetrySinkStatus = Literal["delivered", "misconfigured", "degraded", "unknown"]


def _non_empty(value: str) -> str:
    if not value.strip():
        raise ValueError("must be a non-empty string")
    return value


class TelemetryProductionSinkProvenance(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source: Literal["python-telemetry-production-sink"] = "python-telemetry-production-sink"
    synthetic: Literal[True] = True
    externalMonitoringRequest: Literal[False] = False
    externalSink: Literal[False] = False


class TelemetryProductionSinkConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: TelemetrySinkKind
    configured: bool = False
    endpoint: Optional[str] = None
    externalEmit: Literal[False] = False

    @field_validator("endpoint")
    @classmethod
    def _validate_endpoint(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        return _non_empty(value)


class TelemetryProductionEvent(BaseModel):
    model_config = ConfigDict(extra="allow")

    eventId: str
    type: str
    severity: Literal["info", "warning", "error"] = "info"
    message: str
    timestamp: int = Field(ge=0)

    @field_validator("eventId", "type", "message")
    @classmethod
    def _validate_non_empty(cls, value: str) -> str:
        return _non_empty(value)


class TelemetryProductionDelivery(BaseModel):
    model_config = ConfigDict(extra="forbid")

    attempted: bool
    emitted: Literal[False] = False
    eventId: str

    @field_validator("eventId")
    @classmethod
    def _validate_event_id(cls, value: str) -> str:
        return _non_empty(value)


class TelemetryProductionSinkError(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str
    message: str
    retryable: bool

    @field_validator("code", "message")
    @classmethod
    def _validate_non_empty(cls, value: str) -> str:
        return _non_empty(value)


class TelemetryProductionSinkResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    contractVersion: Literal[TELEMETRY_PRODUCTION_SINK_CONTRACT_VERSION] = (
        TELEMETRY_PRODUCTION_SINK_CONTRACT_VERSION
    )
    runtime: Literal["python-telemetry-production-sink"] = (
        "python-telemetry-production-sink"
    )
    ok: bool
    status: TelemetrySinkStatus
    sink: TelemetryProductionSinkConfig
    event: TelemetryProductionEvent
    delivery: TelemetryProductionDelivery
    provenance: TelemetryProductionSinkProvenance = Field(
        default_factory=TelemetryProductionSinkProvenance
    )
    error: Optional[TelemetryProductionSinkError] = None

    @model_validator(mode="after")
    def _validate_status(self) -> "TelemetryProductionSinkResult":
        if self.status == "delivered":
            if self.ok is not True or self.error is not None:
                raise ValueError("delivered sink smoke must be ok without error")
            if not self.delivery.attempted or self.delivery.emitted:
                raise ValueError("delivered sink smoke is synthetic and must not emit")
            if not self.sink.configured:
                raise ValueError("delivered sink smoke requires configured sink")
            return self

        if self.ok is not False:
            raise ValueError("non-delivered sink smoke must not be ok")
        if self.error is None:
            raise ValueError("non-delivered sink smoke requires an error envelope")
        if self.delivery.emitted:
            raise ValueError("telemetry sink smoke must never emit externally")
        return self


def execute_telemetry_production_sink(
    payload: Dict[str, Any],
) -> TelemetryProductionSinkResult:
    """Return a synthetic production sink smoke result without external IO."""

    if not isinstance(payload, dict):
        raise ValueError("payload must be an object")

    sink = TelemetryProductionSinkConfig(**_read_record(payload.get("sink")))
    event = TelemetryProductionEvent(**_read_record(payload.get("event")))
    scenario = _read_scenario(payload.get("scenario"), sink)
    status = _status_for_scenario(scenario)
    error = _error_for_scenario(scenario)

    return TelemetryProductionSinkResult(
        ok=status == "delivered",
        status=status,
        sink=sink,
        event=event,
        delivery=TelemetryProductionDelivery(
            attempted=scenario != "missing_config",
            emitted=False,
            eventId=event.eventId,
        ),
        error=error,
    )


def _read_record(value: Any) -> Dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError("value must be an object")
    return value


def _read_scenario(value: Any, sink: TelemetryProductionSinkConfig) -> TelemetrySinkScenario:
    if value is None:
        return "delivered" if sink.configured else "missing_config"
    if value in {"delivered", "missing_config", "timeout", "unhealthy", "unknown"}:
        return value
    raise ValueError("scenario must be delivered, missing_config, timeout, unhealthy, or unknown")


def _status_for_scenario(scenario: TelemetrySinkScenario) -> TelemetrySinkStatus:
    return {
        "delivered": "delivered",
        "missing_config": "misconfigured",
        "timeout": "degraded",
        "unhealthy": "degraded",
        "unknown": "unknown",
    }[scenario]


def _error_for_scenario(
    scenario: TelemetrySinkScenario,
) -> Optional[TelemetryProductionSinkError]:
    if scenario == "delivered":
        return None
    code = {
        "missing_config": "telemetry_sink_missing_config",
        "timeout": "telemetry_sink_timeout",
        "unhealthy": "telemetry_sink_unhealthy",
        "unknown": "telemetry_sink_unknown",
    }[scenario]
    retryable = scenario in {"timeout", "unhealthy", "unknown"}
    message = {
        "missing_config": "Telemetry production sink is not configured.",
        "timeout": "Telemetry production sink timed out.",
        "unhealthy": "Telemetry production sink reported unhealthy.",
        "unknown": "Telemetry production sink state is unknown.",
    }[scenario]
    return TelemetryProductionSinkError(
        code=code,
        message=message,
        retryable=retryable,
    )
