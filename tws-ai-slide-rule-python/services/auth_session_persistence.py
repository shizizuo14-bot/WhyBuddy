"""Minimal auth session persistence boundary for migration evidence.

This module intentionally uses a configured JSON store instead of introducing a
database schema or connecting OAuth/IAM providers. It proves the production
boundary can be configured, can fail diagnostically, and never returns secrets
as authenticated session data.
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional, Tuple, Union

from middlewares.auth import validate_session_contract


AUTH_SESSION_STORE_FILE_ENV = "AUTH_SESSION_STORE_FILE"

StorePath = Union[str, os.PathLike[str]]
AuthSessionRecord = Dict[str, Any]
AuthSessionResult = Dict[str, Any]


def _auth_error(error: str) -> AuthSessionResult:
    return validate_session_contract({"error": error})


def _mutation_auth_error(error: str) -> AuthSessionResult:
    result = dict(_auth_error(error))
    result.pop("valid", None)
    return result


def _mutation_store_error(operation: str, error: AuthSessionResult) -> AuthSessionResult:
    result = dict(error)
    result["ok"] = False
    result["operation"] = operation
    result["state"] = "error"
    result.pop("valid", None)
    return result


def _configured_store_missing() -> AuthSessionResult:
    return {
        "ok": False,
        "status": 503,
        "error": {
            "code": "auth_session_store_missing_config",
            "message": "Auth session persistence store is not configured.",
            "retryable": False,
        },
        "message": "Auth session persistence is not configured.",
    }


def _store_failure(reason: str, message: str) -> AuthSessionResult:
    return {
        "ok": False,
        "status": 503,
        "error": {
            "code": "auth_session_store_failure",
            "reason": reason,
            "message": message,
            "retryable": True,
        },
        "message": "Auth session persistence failed.",
    }


def _resolve_store_file(store_file: Optional[StorePath] = None) -> Tuple[Optional[Path], Optional[AuthSessionResult]]:
    if store_file is not None:
        return Path(store_file), None
    configured = os.getenv(AUTH_SESSION_STORE_FILE_ENV)
    if not configured:
        return None, _configured_store_missing()
    return Path(configured), None


def _read_store(store_file: Optional[StorePath] = None) -> Tuple[Dict[str, AuthSessionRecord], Optional[AuthSessionResult]]:
    path, error = _resolve_store_file(store_file)
    if error:
        return {}, error
    assert path is not None

    if not path.exists():
        return {}, None

    try:
        raw = path.read_text(encoding="utf-8")
        data = json.loads(raw) if raw.strip() else []
    except json.JSONDecodeError as error:
        return {}, _store_failure("invalid_json", error.msg)
    except OSError as error:
        return {}, _store_failure("read_failed", str(error))

    sessions: Dict[str, AuthSessionRecord] = {}
    if isinstance(data, list):
        for entry in data:
            if not isinstance(entry, list) or len(entry) != 2 or not isinstance(entry[0], str):
                return {}, _store_failure("invalid_shape", "expected [sessionId, session] entries")
            if not isinstance(entry[1], dict):
                return {}, _store_failure("invalid_session", f"session {entry[0]} is not an object")
            sessions[entry[0]] = {**entry[1], "sessionId": entry[1].get("sessionId") or entry[0]}
        return sessions, None

    if isinstance(data, dict):
        for session_id, record in data.items():
            if not isinstance(session_id, str) or not isinstance(record, dict):
                return {}, _store_failure("invalid_shape", "expected string session ids mapped to objects")
            sessions[session_id] = {**record, "sessionId": record.get("sessionId") or session_id}
        return sessions, None

    return {}, _store_failure("invalid_shape", "expected array entries or mapping")


def _write_store(sessions: Dict[str, AuthSessionRecord], store_file: Optional[StorePath] = None) -> AuthSessionResult:
    path, error = _resolve_store_file(store_file)
    if error:
        return error
    assert path is not None

    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_name(f"{path.name}.tmp")
        payload = [[session_id, session] for session_id, session in sessions.items()]
        tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        os.replace(tmp, path)
    except OSError as error:
        return _store_failure("write_failed", str(error))
    return {"ok": True, "count": len(sessions)}


def _parse_instant(value: Any) -> Optional[datetime]:
    if not isinstance(value, str) or not value:
        return None
    normalized = value.replace("Z", "+00:00")
    try:
        instant = datetime.fromisoformat(normalized)
    except ValueError:
        return None
    if instant.tzinfo is None:
        return instant.replace(tzinfo=timezone.utc)
    return instant.astimezone(timezone.utc)


def _now(value: Optional[str] = None) -> datetime:
    return _parse_instant(value) or datetime.now(timezone.utc)


def _is_expired(record: AuthSessionRecord, now: datetime) -> bool:
    expires_at = _parse_instant(record.get("expiresAt"))
    return expires_at is not None and expires_at <= now


def _public_session(record: AuthSessionRecord, now: Optional[str] = None) -> AuthSessionResult:
    if record.get("revokedAt"):
        return _auth_error("invalid")
    if _is_expired(record, _now(now)):
        return _auth_error("expired")
    return validate_session_contract(
        {
            "sessionId": record.get("sessionId"),
            "user": record.get("user"),
        }
    )


def write_auth_session_record(session: AuthSessionRecord, store_file: Optional[StorePath] = None) -> AuthSessionResult:
    session_id = session.get("sessionId") if isinstance(session, dict) else None
    if not isinstance(session_id, str) or not session_id:
        return {
            "ok": False,
            "operation": "write",
            **_auth_error("invalid"),
        }

    sessions, error = _read_store(store_file)
    if error:
        return error
    sessions[session_id] = dict(session)

    result = _write_store(sessions, store_file)
    if not result.get("ok"):
        return result
    return {"ok": True, "operation": "write", "sessionId": session_id}


def read_auth_session_record(
    session_id: str,
    store_file: Optional[StorePath] = None,
    now: Optional[str] = None,
) -> AuthSessionResult:
    sessions, error = _read_store(store_file)
    if error:
        return error
    record = sessions.get(session_id)
    if record is None:
        return _auth_error("missing")
    return _public_session(record, now=now)


def refresh_auth_session_record(
    session_id: str,
    store_file: Optional[StorePath] = None,
    expires_at: Optional[str] = None,
    now: Optional[str] = None,
) -> AuthSessionResult:
    sessions, error = _read_store(store_file)
    if error:
        return _mutation_store_error("refresh", error)
    record = sessions.get(session_id)
    if record is None:
        return {"ok": False, "operation": "refresh", **_mutation_auth_error("missing")}
    current = _public_session(record, now=now)
    if not current.get("valid"):
        mutation_error = dict(current)
        mutation_error.pop("valid", None)
        state = mutation_error.get("error") if mutation_error.get("error") in {"expired", "invalid"} else "invalid"
        return {"ok": False, "operation": "refresh", "state": state, **mutation_error}

    record["lastSeenAt"] = now or datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    if expires_at is not None:
        record["expiresAt"] = expires_at
    sessions[session_id] = record

    result = _write_store(sessions, store_file)
    if not result.get("ok"):
        return _mutation_store_error("refresh", result)
    return {"ok": True, "operation": "refresh", "state": "refreshed", "sessionId": session_id}


def logout_auth_session_record(
    session_id: str,
    store_file: Optional[StorePath] = None,
    now: Optional[str] = None,
) -> AuthSessionResult:
    sessions, error = _read_store(store_file)
    if error:
        return _mutation_store_error("logout", error)
    record = sessions.get(session_id)
    if record is None:
        return {"ok": False, "operation": "logout", **_mutation_auth_error("missing")}

    record["revokedAt"] = now or datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    sessions[session_id] = record

    result = _write_store(sessions, store_file)
    if not result.get("ok"):
        return _mutation_store_error("logout", result)
    return {"ok": True, "operation": "logout", "state": "logged_out", "sessionId": session_id}


def delete_auth_session_record(session_id: str, store_file: Optional[StorePath] = None) -> AuthSessionResult:
    sessions, error = _read_store(store_file)
    if error:
        return error
    sessions.pop(session_id, None)
    result = _write_store(sessions, store_file)
    if not result.get("ok"):
        return result
    return {"ok": True, "operation": "delete", "sessionId": session_id}


def execute_auth_session_runtime_boundary(
    payload: Dict[str, Any],
    store_file: Optional[StorePath] = None,
    now: Optional[str] = None,
) -> AuthSessionResult:
    if not isinstance(payload, dict):
        return _auth_error("invalid")

    operation = payload.get("operation")
    session_id = payload.get("sessionId")
    if operation == "write":
        session = payload.get("session")
        if not isinstance(session, dict):
            return {"ok": False, "operation": "write", **_auth_error("invalid")}
        return write_auth_session_record(session, store_file=store_file)
    if not isinstance(session_id, str) or not session_id:
        return _auth_error("missing")
    if operation == "read":
        return read_auth_session_record(session_id, store_file=store_file, now=now or payload.get("now"))
    if operation == "refresh":
        return refresh_auth_session_record(
            session_id,
            store_file=store_file,
            expires_at=payload.get("expiresAt"),
            now=now or payload.get("now"),
        )
    if operation == "logout":
        return logout_auth_session_record(session_id, store_file=store_file, now=now or payload.get("now"))
    if operation == "delete":
        return delete_auth_session_record(session_id, store_file=store_file)
    return _auth_error("invalid")
