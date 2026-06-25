"""Deterministic telemetry route contract boundary.

This migration slice locks the telemetry/cost/monitoring response envelopes.
It does not read billing systems, send monitoring requests, or migrate the full
observability runtime.
"""

from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional, Union

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


TELEMETRY_ROUTE_CONTRACT_VERSION = "telemetry-route.runtime.v1"
TELEMETRY_ROUTE_RUNTIME_NAME = "python-contract"

TelemetryRouteOperation = Literal["metrics", "events", "cost", "error"]
TelemetryRouteName = Literal["telemetry", "cost", "monitoring"]
TelemetryRouteStatus = Literal["completed", "failed"]
TelemetryDataSource = Literal["synthetic", "estimated", "actual"]


def _non_empty(value: str) -> str:
    if not value.strip():
        raise ValueError("must be a non-empty string")
    return value


class TelemetryRouteProvenance(BaseModel):
    model_config = ConfigDict(extra="allow")

    source: str = "python-contract"
    synthetic: bool = True
    externalMonitoringRequest: bool = False

    @field_validator("source")
    @classmethod
    def _validate_source(cls, value: str) -> str:
        return _non_empty(value)

    @model_validator(mode="after")
    def _validate_no_external_monitoring(self) -> "TelemetryRouteProvenance":
        if self.externalMonitoringRequest:
            raise ValueError("telemetry contract must not send external monitoring requests")
        return self


class TelemetryRouteTokens(BaseModel):
    model_config = ConfigDict(extra="forbid")

    promptTokens: int = Field(ge=0)
    completionTokens: int = Field(ge=0)
    totalTokens: int = Field(ge=0)
    source: TelemetryDataSource

    @model_validator(mode="after")
    def _validate_total(self) -> "TelemetryRouteTokens":
        if self.totalTokens != self.promptTokens + self.completionTokens:
            raise ValueError("totalTokens must equal promptTokens + completionTokens")
        return self


class TelemetryRouteCost(BaseModel):
    model_config = ConfigDict(extra="forbid")

    amountUsd: float = Field(ge=0)
    source: TelemetryDataSource
    billingSource: str
    isEstimate: bool
    estimatedUsd: Optional[float] = Field(default=None, ge=0)
    syntheticUsd: Optional[float] = Field(default=None, ge=0)
    actualUsd: Optional[float] = Field(default=None, ge=0)
    currency: Literal["USD"] = "USD"
    pricingSource: Optional[str] = None

    @field_validator("billingSource", "pricingSource")
    @classmethod
    def _validate_optional_non_empty(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        return _non_empty(value)

    @model_validator(mode="after")
    def _validate_source_fields(self) -> "TelemetryRouteCost":
        if self.source == "actual":
            if self.actualUsd is None or self.isEstimate:
                raise ValueError("actual cost source requires non-estimated actual cost data")
            if self.estimatedUsd is not None or self.syntheticUsd is not None:
                raise ValueError("actual cost source cannot include estimated or synthetic cost")
            return self

        if self.actualUsd is not None:
            raise ValueError("estimated or synthetic cost must not include actual cost")
        if not self.isEstimate:
            raise ValueError("estimated or synthetic cost must be marked as estimate")
        if self.source == "estimated" and self.estimatedUsd is None:
            raise ValueError("estimated cost source requires estimatedUsd")
        if self.source == "synthetic" and self.syntheticUsd is None:
            raise ValueError("synthetic cost source requires syntheticUsd")
        return self


class TelemetryRouteLatency(BaseModel):
    model_config = ConfigDict(extra="forbid")

    average: float = Field(ge=0)
    p95: float = Field(ge=0)


class TelemetryRouteMetrics(BaseModel):
    model_config = ConfigDict(extra="forbid")

    totalCalls: int = Field(ge=0)
    errorCount: int = Field(ge=0)
    latencyMs: TelemetryRouteLatency
    tokens: TelemetryRouteTokens
    cost: TelemetryRouteCost
    updatedAt: int = Field(ge=0)


class TelemetryRouteEvent(BaseModel):
    model_config = ConfigDict(extra="allow")

    eventId: str
    type: str
    timestamp: int = Field(ge=0)
    severity: Literal["info", "warning", "error"]
    message: str
    source: TelemetryDataSource

    @field_validator("eventId", "type", "message")
    @classmethod
    def _validate_non_empty(cls, value: str) -> str:
        return _non_empty(value)


class TelemetryRouteError(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str
    message: str
    retryable: bool

    @field_validator("code", "message")
    @classmethod
    def _validate_non_empty(cls, value: str) -> str:
        return _non_empty(value)


class TelemetryRouteBusinessOutcome(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ok: Literal[True] = True
    telemetryErrorIgnored: Literal[True] = True


class TelemetryRouteBaseResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    contractVersion: Literal[TELEMETRY_ROUTE_CONTRACT_VERSION] = (
        TELEMETRY_ROUTE_CONTRACT_VERSION
    )
    runtime: Literal[TELEMETRY_ROUTE_RUNTIME_NAME] = TELEMETRY_ROUTE_RUNTIME_NAME
    operation: TelemetryRouteOperation
    route: TelemetryRouteName
    ok: bool
    status: TelemetryRouteStatus
    generatedAt: str
    provenance: TelemetryRouteProvenance

    @field_validator("generatedAt")
    @classmethod
    def _validate_generated_at(cls, value: str) -> str:
        return _non_empty(value)


class TelemetryRouteMetricsResult(TelemetryRouteBaseResult):
    operation: Literal["metrics"] = "metrics"
    ok: Literal[True] = True
    status: Literal["completed"] = "completed"
    metrics: TelemetryRouteMetrics

    @model_validator(mode="after")
    def _validate_synthetic_sources(self) -> "TelemetryRouteMetricsResult":
        _reject_synthetic_actual(self.provenance, self.metrics.tokens.source)
        _reject_synthetic_actual(self.provenance, self.metrics.cost.source)
        return self


class TelemetryRouteEventsResult(TelemetryRouteBaseResult):
    operation: Literal["events"] = "events"
    ok: Literal[True] = True
    status: Literal["completed"] = "completed"
    events: List[TelemetryRouteEvent]
    eventCount: int = Field(ge=0)

    @model_validator(mode="after")
    def _validate_event_count(self) -> "TelemetryRouteEventsResult":
        if self.eventCount != len(self.events):
            raise ValueError("eventCount must equal events length")
        for event in self.events:
            _reject_synthetic_actual(self.provenance, event.source)
        return self


class TelemetryRouteCostResult(TelemetryRouteBaseResult):
    operation: Literal["cost"] = "cost"
    ok: Literal[True] = True
    status: Literal["completed"] = "completed"
    cost: TelemetryRouteCost
    tokens: TelemetryRouteTokens

    @model_validator(mode="after")
    def _validate_sources(self) -> "TelemetryRouteCostResult":
        _reject_synthetic_actual(self.provenance, self.cost.source)
        _reject_synthetic_actual(self.provenance, self.tokens.source)
        return self


class TelemetryRouteErrorResult(TelemetryRouteBaseResult):
    operation: Literal["error"] = "error"
    ok: Literal[False] = False
    status: Literal["failed"] = "failed"
    error: TelemetryRouteError
    businessOutcome: TelemetryRouteBusinessOutcome


TelemetryRouteResult = Union[
    TelemetryRouteMetricsResult,
    TelemetryRouteEventsResult,
    TelemetryRouteCostResult,
    TelemetryRouteErrorResult,
]


def execute_telemetry_route_contract(payload: Dict[str, Any]) -> TelemetryRouteResult:
    """Project a telemetry/cost/monitoring contract result.

    The projection is deterministic and contract-only. It may classify fields
    as synthetic or estimated, but it never fabricates actual billing data.
    """

    if not isinstance(payload, dict):
        raise ValueError("payload must be an object")

    operation = _read_operation(payload.get("operation"))
    route = _read_route(payload.get("route"))
    provenance = TelemetryRouteProvenance(**_read_record(payload.get("provenance"), default={}))
    generated_at = str(payload.get("generatedAt") or "2026-06-20T00:00:00.000Z")

    base = {
        "route": route,
        "generatedAt": generated_at,
        "provenance": provenance,
    }

    if operation == "metrics":
        return TelemetryRouteMetricsResult(
            **base,
            metrics=_build_metrics(payload.get("snapshot") or payload.get("metrics")),
        )
    if operation == "events":
        events = _build_events(payload.get("events"))
        return TelemetryRouteEventsResult(
            **base,
            events=events,
            eventCount=len(events),
        )
    if operation == "cost":
        return TelemetryRouteCostResult(
            **{**base, "route": "cost"},
            cost=TelemetryRouteCost(**_read_record(payload.get("cost"))),
            tokens=TelemetryRouteTokens(**_read_record(payload.get("tokens"))),
        )

    return TelemetryRouteErrorResult(
        **base,
        error=TelemetryRouteError(**_read_record(payload.get("error"))),
        businessOutcome=TelemetryRouteBusinessOutcome(
            **_read_record(payload.get("businessOutcome"), default={})
        ),
    )


def _reject_synthetic_actual(
    provenance: TelemetryRouteProvenance,
    source: TelemetryDataSource,
) -> None:
    if provenance.synthetic and source == "actual":
        raise ValueError("synthetic contract data must not be marked as actual")


def _read_operation(value: Any) -> TelemetryRouteOperation:
    if value in {"metrics", "events", "cost", "error"}:
        return value
    raise ValueError("operation must be metrics, events, cost, or error")


def _read_route(value: Any) -> TelemetryRouteName:
    if value in {"telemetry", "cost", "monitoring"}:
        return value
    raise ValueError("route must be telemetry, cost, or monitoring")


def _read_record(
    value: Any,
    *,
    default: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    if value is None and default is not None:
        return default
    if not isinstance(value, dict):
        raise ValueError("value must be an object")
    return value


def _build_metrics(value: Any) -> TelemetryRouteMetrics:
    snapshot = _read_record(value)
    prompt_tokens = int(snapshot.get("totalTokensIn") or 0)
    completion_tokens = int(snapshot.get("totalTokensOut") or 0)
    amount_usd = float(snapshot.get("totalCost") or 0)
    return TelemetryRouteMetrics(
        totalCalls=int(snapshot.get("totalCalls") or 0),
        errorCount=int(snapshot.get("errorCount") or 0),
        latencyMs=TelemetryRouteLatency(
            **_read_record(
                snapshot.get("latencyMs"),
                default={"average": 0, "p95": 0},
            )
        ),
        tokens=TelemetryRouteTokens(
            promptTokens=prompt_tokens,
            completionTokens=completion_tokens,
            totalTokens=prompt_tokens + completion_tokens,
            source="synthetic",
        ),
        cost=TelemetryRouteCost(
            amountUsd=amount_usd,
            estimatedUsd=amount_usd,
            actualUsd=None,
            source="estimated",
            billingSource="static_pricing_table",
            isEstimate=True,
            pricingSource="contract_static_fixture",
        ),
        updatedAt=int(snapshot.get("updatedAt") or 0),
    )


def _build_events(value: Any) -> List[TelemetryRouteEvent]:
    if value is None:
        return []
    if not isinstance(value, list):
        raise ValueError("events must be an array")
    events: List[TelemetryRouteEvent] = []
    for event in value:
        data = _read_record(event)
        events.append(
            TelemetryRouteEvent(
                eventId=str(data.get("eventId") or data.get("id") or "event-contract"),
                type=str(data.get("type") or "telemetry:contract_event"),
                timestamp=int(data.get("timestamp") or 0),
                severity=data.get("severity") or "info",
                message=str(data.get("message") or "Telemetry contract event."),
                source=data.get("source") or "synthetic",
            )
        )
    return events
