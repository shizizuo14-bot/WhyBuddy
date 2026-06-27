"""
AgentLoop worker bridge (SlideRule 108).

Python builds and (optionally) executes commands against the existing Node
AgentLoop queue runner / loop. Keeps execution in Node; Python drives.

Supports:
- queue run (via scripts/run-queue.mjs)
- single task run (via --only or direct loop script)
- timeout, cwd, env_overrides
- dry-run receipts (no node/npm assumption, no execution)
- redaction of env and credential-like arguments in receipts
"""

import os
import re
import subprocess
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from config.settings import get_settings
from models.agent_loop import AgentLoopCommandRequest, AgentLoopCommandReceipt

try:
    from services.agent_loop_process_registry import (
        append_background_event,
        heartbeat_background_run,
        read_background_run_record,
        register_background_process,
        unregister_background_process,
        write_background_run_record,
    )
except Exception:  # pragma: no cover - direct module execution fallback
    from agent_loop_process_registry import (  # type: ignore
        append_background_event,
        heartbeat_background_run,
        read_background_run_record,
        register_background_process,
        unregister_background_process,
        write_background_run_record,
    )

# 109: centralized redaction (reused)
try:
    from services.agent_loop_redaction import (
        redact_sensitive as _redact_sensitive_text,
        redact_env_dict,
        redact_command_receipt,
    )
except Exception:
    from agent_loop_redaction import (  # type: ignore
        redact_sensitive as _redact_sensitive_text,
        redact_env_dict,
        redact_command_receipt,
    )


def _resolve_repo_root() -> Path:
    """Resolve repository root containing agent-loop/ and slide-rule-python/."""
    here = Path(__file__).resolve()
    candidates = [
        here.parent.parent,  # services/ -> slide-rule-python/
        here.parent.parent.parent,  # ... -> repo root
    ]
    for cand in candidates:
        if (cand / "agent-loop").is_dir() or (cand / "slide-rule-python").is_dir():
            return cand
    return here.parent.parent


def _resolve_agent_loop_dir(s: Any) -> Path:
    root = Path(getattr(s, "AGENT_LOOP_ROOT", "agent-loop") or "agent-loop")
    if not root.is_absolute():
        root = _resolve_repo_root() / root
    return root.resolve()


def _redact_command(req: AgentLoopCommandRequest) -> str:
    """Build redacted command string using central redaction helper (109)."""
    parts: List[str] = [req.command or ""]
    for a in (req.args or []):
        parts.append(_redact_sensitive_text(a) if a else a)
    joined = " ".join(p for p in parts if p)
    return _redact_sensitive_text(joined)


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _safe_background_run_id(value: Optional[str] = None) -> str:
    text = str(value or "").strip()
    if not text:
        text = "bridge-" + datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    text = re.sub(r"[^A-Za-z0-9._-]+", "-", text).strip("-")
    return text or f"bridge-{int(time.time() * 1000)}"


def _heartbeat_interval_seconds() -> float:
    raw = os.environ.get("AGENT_LOOP_HEARTBEAT_SECONDS")
    try:
        parsed = float(raw) if raw is not None else 5.0
        return parsed if parsed > 0 else 5.0
    except Exception:
        return 5.0


def _command_env(req: AgentLoopCommandRequest) -> Dict[str, str]:
    env = os.environ.copy()
    if req.env:
        for key, value in req.env.items():
            if isinstance(key, str) and isinstance(value, str):
                env[key] = value
    return env


def _watch_background_process(run_id: str, process: Any) -> None:
    interval = _heartbeat_interval_seconds()
    while True:
        try:
            exit_code = process.poll()
        except Exception:
            exit_code = 1
        if exit_code is not None:
            ended = _iso_now()
            status = "exited" if exit_code == 0 else "failed"
            previous = read_background_run_record(run_id) or {}
            write_background_run_record(
                {
                    **previous,
                    "runId": run_id,
                    "pid": getattr(process, "pid", None),
                    "status": status,
                    "exitCode": exit_code,
                    "endedAt": ended,
                    "heartbeatAt": ended,
                }
            )
            append_background_event(
                run_id,
                "RUN_FINALIZED" if exit_code == 0 else "RUN_FAILED",
                {"pid": getattr(process, "pid", None), "exitCode": exit_code},
                status=status,
            )
            unregister_background_process(run_id)
            return
        heartbeat_background_run(run_id)
        time.sleep(interval)


def build_agent_loop_command(
    *,
    queue_run: bool = True,
    task: Optional[str] = None,
    timeout_ms: Optional[int] = None,
    cwd: Optional[str] = None,
    env_overrides: Optional[Dict[str, str]] = None,
    queue_path: Optional[str] = None,
) -> AgentLoopCommandRequest:
    """Build a command request for the Node AgentLoop queue runner.

    - queue_run=True: use scripts/run-queue.mjs (supports --only for single-task run)
    - queue_run=False: use src/loop.js directly (single task run with full flags)
    - cwd here is used as spawn cwd for the node process; also injected as --cwd for loop mode
    - env_overrides go into request env (for subprocess) and as --worker-env in loop mode
    - queue_path allows overriding the queue script (validated at endpoint)
    """
    s = get_settings()
    al_dir = _resolve_agent_loop_dir(s)
    node_cmd: str = getattr(s, "AGENT_LOOP_NODE_COMMAND", "node") or "node"

    args: List[str] = []
    if queue_run:
        q_name = getattr(s, "AGENT_LOOP_RUN_QUEUE", "scripts/run-queue.mjs") or "scripts/run-queue.mjs"
        script = Path(q_name)
        if not script.is_absolute():
            script = al_dir / script
        args = [str(script)]
        if queue_path:
            queue_file = Path(queue_path)
            if not queue_file.is_absolute():
                queue_file = (_resolve_repo_root() / queue_path).resolve()
            args.extend(["--queue", str(queue_file)])
        if task:
            args.extend(["--only", task])
    else:
        script = al_dir / (getattr(s, "AGENT_LOOP_LOOP_SCRIPT", "src/loop.js") or "src/loop.js")
        args = [str(script)]
        if cwd:
            args.extend(["--cwd", cwd])
        if task:
            args.extend(["--task", task])
        tms = timeout_ms if timeout_ms is not None else getattr(s, "AGENT_LOOP_DEFAULT_TIMEOUT_MS", 1800000)
        args.extend(["--timeout-ms", str(tms)])
        for k, v in (env_overrides or {}).items():
            args.extend(["--worker-env", f"{k}={v}"])

    # spawn cwd: prefer explicit, fall back to agent-loop dir (stable for queue scripts)
    spawn_cwd = cwd if cwd else str(al_dir)
    # ensure relative/absolute safe; resolve only if looks relative to avoid breaking tests
    spawn_path = Path(spawn_cwd)
    if not spawn_path.is_absolute():
        spawn_path = (al_dir / spawn_cwd).resolve() if cwd else al_dir
    else:
        spawn_path = spawn_path.resolve()

    tmo = timeout_ms if timeout_ms is not None else getattr(s, "AGENT_LOOP_DEFAULT_TIMEOUT_MS", 1800000)

    env_dict = dict(env_overrides) if env_overrides else None

    return AgentLoopCommandRequest(
        command=node_cmd,
        args=args,
        cwd=str(spawn_path),
        timeoutMs=tmo,
        env=env_dict,
    )


def execute_agent_loop_command(
    req: AgentLoopCommandRequest, *, dry_run: bool = False
) -> AgentLoopCommandReceipt:
    """Execute (or dry-run) the bridged AgentLoop command.

    Returns redacted receipt. In dry_run: never shells out, never assumes node/npm exists.
    """
    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    redacted = _redact_command(req)

    if dry_run or getattr(get_settings(), "AGENT_LOOP_BRIDGE_DRY_RUN", False):
        rec = {
            "command": redacted,
            "exitCode": None,
            "stdout": None,
            "stderr": None,
            "timedOut": False,
            "startedAt": now,
            "endedAt": now,
            "metadata": {"dryRun": True, "wouldExecute": False},
        }
        red_rec = redact_command_receipt(rec)
        return AgentLoopCommandReceipt(**red_rec)

    try:
        result = subprocess.run(
            [req.command] + (req.args or []),
            cwd=req.cwd,
            env=_command_env(req),
            capture_output=True,
            text=True,
            timeout=max(0.1, req.timeoutMs / 1000.0) if req.timeoutMs is not None else None,
        )
        ended = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        rec = {
            "command": redacted,
            "exitCode": result.returncode,
            "stdout": _redact_sensitive_text(result.stdout or ""),
            "stderr": _redact_sensitive_text(result.stderr or ""),
            "timedOut": False,
            "startedAt": now,
            "endedAt": ended,
            "metadata": {},
        }
        red_rec = redact_command_receipt(rec)
        return AgentLoopCommandReceipt(**red_rec)
    except subprocess.TimeoutExpired as te:
        ended = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        stdout_raw = te.stdout if isinstance(getattr(te, "stdout", None), str) else ""
        stderr_raw = te.stderr if isinstance(getattr(te, "stderr", None), str) else ""
        rec = {
            "command": redacted,
            "exitCode": None,
            "stdout": _redact_sensitive_text(stdout_raw) if stdout_raw else None,
            "stderr": _redact_sensitive_text(stderr_raw),
            "timedOut": True,
            "startedAt": now,
            "endedAt": ended,
            "metadata": {"reason": "timeout"},
        }
        red_rec = redact_command_receipt(rec)
        return AgentLoopCommandReceipt(**red_rec)
    except Exception as exc:
        ended = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        rec = {
            "command": redacted,
            "exitCode": 1,
            "stdout": None,
            "stderr": _redact_sensitive_text(str(exc)),
            "timedOut": False,
            "startedAt": now,
            "endedAt": ended,
            "metadata": {"error": "spawn_failed"},
        }
        red_rec = redact_command_receipt(rec)
        return AgentLoopCommandReceipt(**red_rec)


def start_agent_loop_background_command(
    req: AgentLoopCommandRequest,
    *,
    start_watcher: bool = True,
) -> AgentLoopCommandReceipt:
    """Start the bridged AgentLoop command in the background and return immediately."""
    started = _iso_now()
    redacted = _redact_command(req)
    run_id = _safe_background_run_id(req.runId)

    if getattr(get_settings(), "AGENT_LOOP_BRIDGE_DRY_RUN", False):
        rec = {
            "command": redacted,
            "status": "dry-run",
            "runId": run_id,
            "pid": None,
            "exitCode": None,
            "stdout": None,
            "stderr": None,
            "timedOut": False,
            "startedAt": started,
            "endedAt": started,
            "metadata": {"dryRun": True, "background": False, "wouldExecute": False},
        }
        red_rec = redact_command_receipt(rec)
        return AgentLoopCommandReceipt(**red_rec)

    try:
        process = subprocess.Popen(
            [req.command] + (req.args or []),
            cwd=req.cwd,
            env=_command_env(req),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            text=True,
        )
    except Exception as exc:
        ended = _iso_now()
        rec = {
            "command": redacted,
            "status": "failed",
            "runId": run_id,
            "pid": None,
            "exitCode": 1,
            "stdout": None,
            "stderr": _redact_sensitive_text(str(exc)),
            "timedOut": False,
            "startedAt": started,
            "endedAt": ended,
            "metadata": {"error": "spawn_failed", "background": False},
        }
        red_rec = redact_command_receipt(rec)
        return AgentLoopCommandReceipt(**red_rec)

    pid = getattr(process, "pid", None)
    record = {
        "runId": run_id,
        "pid": pid,
        "status": "running",
        "command": redacted,
        "cwd": req.cwd,
        "startedAt": started,
        "heartbeatAt": started,
        "exitCode": None,
        "endedAt": None,
    }
    write_background_run_record(record)
    register_background_process(run_id, process)
    append_background_event(run_id, "RUN_STARTED", {"pid": pid, "command": redacted}, status="running")
    append_background_event(run_id, "HEARTBEAT", {"pid": pid}, status="running")

    if start_watcher:
        watcher = threading.Thread(target=_watch_background_process, args=(run_id, process), daemon=True)
        watcher.start()

    rec = {
        "command": redacted,
        "status": "started",
        "runId": run_id,
        "pid": pid,
        "exitCode": None,
        "stdout": None,
        "stderr": None,
        "timedOut": False,
        "startedAt": started,
        "endedAt": None,
        "metadata": {"background": True},
    }
    red_rec = redact_command_receipt(rec)
    return AgentLoopCommandReceipt(**red_rec)
