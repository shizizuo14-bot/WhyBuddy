"""Deterministic Python runtime bridge for task executor envelopes.

This slice does not start Docker, CrewAI, LangGraph, LangChain, a queue worker,
or any external process. Node still owns scheduling, persistence, callbacks,
and artifact storage. Python only projects start/status/cancel/read/error
envelopes into the executor API shapes consumed by the Node executor client.
"""

from __future__ import annotations

from typing import Any, Literal


TASK_EXECUTOR_RUNTIME_CONTRACT_VERSION = "task-executor.runtime.v1"
EXECUTOR_CONTRACT_VERSION = "2026-03-28"
EXECUTOR_NAME = "lobster"
VALID_ACTIONS = {"start", "status", "cancel", "read", "error"}
TERMINAL_STATUSES = {"completed", "failed", "cancelled"}

TaskExecutorAction = Literal["start", "status", "cancel", "read", "error"]


def project_task_executor_runtime(payload: dict[str, Any]) -> dict[str, Any]:
    """Project a task executor runtime action into a stable envelope.

    The function is intentionally side-effect free. Callers pass the current
    Node-owned request/job snapshot, and the bridge normalizes the response that
    would cross the Node/Python boundary.
    """

    if not _is_record(payload):
        return _error_response(
            "TASK_EXECUTOR_VALIDATION_ERROR",
            "Task executor runtime payload must be an object",
        )

    action = _clean_string(payload.get("action"), "read")
    if action not in VALID_ACTIONS:
        return _error_response(
            "TASK_EXECUTOR_VALIDATION_ERROR",
            f"Unsupported task executor runtime action: {action}",
        )

    raw_error = payload.get("error")
    if raw_error is not None or action == "error":
        error = raw_error if _is_record(raw_error) else {}
        return _error_response(
            _clean_string(error.get("code"), "TASK_EXECUTOR_ERROR"),
            _clean_string(error.get("message"), "Task executor runtime failed"),
            hint=_clean_string(
                error.get("hint"),
                "Treat this as unavailable/rejected; do not mark the task completed.",
            ),
        )

    if action == "start":
        request = payload.get("request")
        if not _is_record(request):
            return _error_response(
                "TASK_EXECUTOR_VALIDATION_ERROR",
                "Task executor start requires a request envelope",
            )
        return start_task_executor_runtime(
            request=request,
            received_at=_clean_string(payload.get("receivedAt")),
        )

    job = payload.get("job")
    if not _is_record(job):
        return _error_response(
            "TASK_EXECUTOR_VALIDATION_ERROR",
            "Task executor runtime job payload is required",
        )

    if action == "cancel":
        return cancel_task_executor_runtime(
            job=job,
            reason=_clean_string(payload.get("reason"), "Task executor cancelled."),
            cancelled_at=_clean_string(payload.get("cancelledAt")),
        )

    return read_task_executor_runtime(job)


def start_task_executor_runtime(
    *,
    request: dict[str, Any],
    received_at: str | None = None,
) -> dict[str, Any]:
    """Return an acceptance envelope without starting a worker."""

    return {
        "ok": True,
        "accepted": True,
        "requestId": _request_id(request),
        "missionId": _mission_id(request),
        "jobId": _job_id(request),
        "receivedAt": received_at or _clean_string(
            request.get("createdAt"),
            "1970-01-01T00:00:00.000Z",
        ),
        "runtime": _runtime_meta(),
    }


def read_task_executor_runtime(job: dict[str, Any]) -> dict[str, Any]:
    """Return the current job detail shape used by status/read calls."""

    return {
        "ok": True,
        "runtime": _runtime_meta(),
        "job": _job_detail(job),
    }


def cancel_task_executor_runtime(
    *,
    job: dict[str, Any],
    reason: str = "Task executor cancelled.",
    cancelled_at: str | None = None,
) -> dict[str, Any]:
    """Return a cancellation acknowledgement, never a completed success."""

    request = _job_request(job)
    current_status = _status(job, "running")
    already_final = current_status in TERMINAL_STATUSES
    if current_status == "completed":
        response_status = "completed"
        message = "Job was already completed; cancellation was not requested"
    elif current_status == "cancelled":
        response_status = "cancelled"
        message = "Job was already cancelled"
    elif current_status == "failed":
        response_status = "failed"
        message = "Job had already failed; cancellation was not requested"
    else:
        response_status = "cancelled"
        message = "Cancellation requested"

    response = {
        "ok": True,
        "accepted": True,
        "cancelRequested": not already_final,
        "alreadyFinal": already_final,
        "missionId": _mission_id(request),
        "jobId": _job_id(request),
        "status": response_status,
        "message": message,
        "runtime": _runtime_meta(),
    }
    if cancelled_at:
        response["cancelledAt"] = cancelled_at
    if reason and response_status == "cancelled":
        response["reason"] = reason
    return response


def _job_detail(job: dict[str, Any]) -> dict[str, Any]:
    request = _job_request(job)
    plan_job = _plan_job(request)
    status = _status(job, "running")
    error = job.get("error") if _is_record(job.get("error")) else {}
    error_code = _clean_string(error.get("code"))
    error_message = _clean_string(error.get("message"))
    received_at = _clean_string(
        job.get("receivedAt"),
        _clean_string(request.get("createdAt"), "1970-01-01T00:00:00.000Z"),
    )
    updated_at = _clean_string(job.get("updatedAt"), received_at)
    finished_at = _clean_string(job.get("finishedAt"))
    if status in TERMINAL_STATUSES and not finished_at:
        finished_at = updated_at

    detail = {
        "requestId": _request_id(request),
        "missionId": _mission_id(request),
        "jobId": _job_id(request),
        "jobKey": _clean_string(plan_job.get("key"), _job_id(request)),
        "jobLabel": _clean_string(plan_job.get("label"), "Execute task"),
        "kind": _clean_string(plan_job.get("kind"), "execute"),
        "status": status,
        "progress": _progress(job, status),
        "message": _message(job, status),
        "receivedAt": received_at,
        "callbackMode": "pending",
        "artifactCount": 0,
        "artifacts": [],
        "events": [_event(job, status, occurred_at=finished_at or updated_at)],
        "dataDirectory": _data_directory(request),
        "logFile": f"{_data_directory(request)}/executor.log",
    }
    if finished_at:
        detail["finishedAt"] = finished_at
    if status == "failed" and error_code:
        detail["errorCode"] = error_code
    if status == "failed" and error_message:
        detail["errorMessage"] = error_message
    if status == "completed":
        summary = _clean_string(job.get("summary"))
        if summary:
            detail["summary"] = summary
    return detail


def _event(
    job: dict[str, Any],
    status: str,
    *,
    occurred_at: str,
) -> dict[str, Any]:
    request = _job_request(job)
    error = job.get("error") if _is_record(job.get("error")) else {}
    event = {
        "version": _clean_string(request.get("version"), EXECUTOR_CONTRACT_VERSION),
        "eventId": f"event-{_job_id(request)}-{status}",
        "missionId": _mission_id(request),
        "jobId": _job_id(request),
        "executor": _clean_string(request.get("executor"), EXECUTOR_NAME),
        "type": _event_type(status),
        "status": status,
        "occurredAt": occurred_at,
        "message": _message(job, status),
    }
    error_code = _clean_string(error.get("code"))
    if status == "failed" and error_code:
        event["errorCode"] = error_code
    return event


def _event_type(status: str) -> str:
    return {
        "queued": "job.accepted",
        "running": "job.progress",
        "waiting": "job.waiting",
        "completed": "job.completed",
        "failed": "job.failed",
        "cancelled": "job.cancelled",
    }.get(status, "job.progress")


def _error_response(
    code: str,
    message: str,
    *,
    hint: str = "Treat this as unavailable/rejected; do not mark the task completed.",
) -> dict[str, Any]:
    return {
        "ok": False,
        "error": message,
        "code": code,
        "hint": hint,
        "runtime": _runtime_meta(),
    }


def _runtime_meta() -> dict[str, str]:
    return {
        "contractVersion": TASK_EXECUTOR_RUNTIME_CONTRACT_VERSION,
        "owner": "python",
        "worker": "not_started",
        "persistenceOwner": "node",
    }


def _job_request(job: dict[str, Any]) -> dict[str, Any]:
    request = job.get("request")
    return request if _is_record(request) else {}


def _plan_job(request: dict[str, Any]) -> dict[str, Any]:
    plan = request.get("plan")
    if not _is_record(plan):
        return {}
    jobs = plan.get("jobs")
    if not isinstance(jobs, list) or not jobs:
        return {}
    first = jobs[0]
    return first if _is_record(first) else {}


def _request_id(request: dict[str, Any]) -> str:
    return _clean_string(request.get("requestId"), "request-python-runtime")


def _mission_id(request: dict[str, Any]) -> str:
    plan = request.get("plan")
    return _clean_string(
        request.get("missionId"),
        _clean_string(plan.get("missionId") if _is_record(plan) else None, "mission-python-runtime"),
    )


def _job_id(request: dict[str, Any]) -> str:
    plan_job = _plan_job(request)
    return _clean_string(
        request.get("jobId"),
        _clean_string(plan_job.get("id"), "job-python-runtime"),
    )


def _status(job: dict[str, Any], fallback: str) -> str:
    status = _clean_string(job.get("status"), fallback)
    if status in {"queued", "running", "waiting", "completed", "failed", "cancelled"}:
        return status
    return fallback


def _progress(job: dict[str, Any], status: str) -> int | float:
    value = job.get("progress")
    if isinstance(value, (int, float)):
        return value
    return 100 if status in TERMINAL_STATUSES else 0


def _message(job: dict[str, Any], status: str) -> str:
    message = _clean_string(job.get("message"))
    if message:
        return message
    return {
        "queued": "Job accepted",
        "running": "Job is running",
        "waiting": "Job is waiting for input",
        "completed": "Job completed",
        "failed": "Job failed",
        "cancelled": "Job cancelled",
    }.get(status, "Job is running")


def _data_directory(request: dict[str, Any]) -> str:
    return f"executor-data/jobs/{_mission_id(request)}/{_job_id(request)}"


def _clean_string(value: Any, fallback: str = "") -> str:
    text = str(value or "").strip()
    return text or fallback


def _is_record(value: Any) -> bool:
    return isinstance(value, dict)

