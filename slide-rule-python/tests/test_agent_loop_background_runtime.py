"""
AgentLoop background runtime tests.

These pin the Python control-plane behavior needed by the web workbench:
real run requests submit a background process, return a run id + pid quickly,
and write heartbeat events under the unified AgentLoop event root.
"""

import json
import os
import sys
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.agent_loop import AgentLoopCommandRequest  # noqa: E402
from services.agent_loop_bridge import start_agent_loop_background_command  # noqa: E402
from services.agent_loop_process_registry import (  # noqa: E402
    get_background_runtime_status,
    write_background_run_record,
)


class FakeProcess:
    def __init__(self, pid=43210, exit_code=None):
        self.pid = pid
        self._exit_code = exit_code
        self.terminated = False

    def poll(self):
        return self._exit_code

    def terminate(self):
        self.terminated = True
        self._exit_code = -15


def _read_jsonl(path: Path):
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def test_background_command_returns_started_receipt_and_writes_heartbeat_event(tmp_path, monkeypatch):
    monkeypatch.setenv("AGENT_LOOP_CONTROL_DIR", str(tmp_path / "control"))
    monkeypatch.setenv("AGENT_LOOP_EVENTS_DIR", str(tmp_path / "events"))

    req = AgentLoopCommandRequest(
        command="node",
        args=["agent-loop/scripts/run-queue.mjs"],
        cwd=str(tmp_path),
        timeoutMs=1000,
    )
    fake = FakeProcess(pid=24680)

    with patch("services.agent_loop_bridge.subprocess.Popen", return_value=fake) as popen:
        receipt = start_agent_loop_background_command(req, start_watcher=False)

    assert receipt.status == "started"
    assert receipt.runId
    assert receipt.pid == 24680
    assert receipt.exitCode is None
    assert receipt.endedAt is None
    assert receipt.metadata.get("background") is True
    popen.assert_called_once()

    status = get_background_runtime_status(receipt.runId, stale_after_seconds=60)
    assert status["running"] is True
    assert status["stale"] is False
    assert status["pid"] == 24680

    event_path = tmp_path / "events" / f"{receipt.runId}.jsonl"
    assert event_path.exists()
    events = _read_jsonl(event_path)
    assert [event["type"] for event in events[:2]] == ["RUN_STARTED", "HEARTBEAT"]
    assert all(event["runId"] == receipt.runId for event in events)


def test_background_runtime_status_marks_old_heartbeat_stale(tmp_path, monkeypatch):
    monkeypatch.setenv("AGENT_LOOP_CONTROL_DIR", str(tmp_path / "control"))

    write_background_run_record(
        {
            "runId": "bridge-2026-06-27T00-00-00-000Z",
            "pid": 111,
            "status": "running",
            "startedAt": "2026-06-27T00:00:00.000Z",
            "heartbeatAt": "2000-01-01T00:00:00.000Z",
        }
    )

    status = get_background_runtime_status(
        "bridge-2026-06-27T00-00-00-000Z",
        stale_after_seconds=1,
    )

    assert status["running"] is False
    assert status["stale"] is True
    assert status["status"] == "stale"
