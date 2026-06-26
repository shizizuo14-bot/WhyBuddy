"""
Test for SlideRule AgentLoop 111 settings profile runtime.

Verifies no fake profile/queue default success stubs in runtime surfaces.
"""

import os
import sys
from pathlib import Path

# Ensure services can be imported when running pytest from slide-rule-python/
ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from services.agent_loop_settings import (
    load_agent_loop_settings,
    save_agent_loop_settings,
)


def test_agentloop_settings_profile_runtime_111_avoids_fake_profile_and_queue_default_success(tmp_path, monkeypatch):
    """agentloop settings profile runtime 111 avoids fake profile and queue default success"""
    monkeypatch.setenv("AGENT_LOOP_SETTINGS_FILE", str(tmp_path / "agent-loop-settings.json"))

    # load must return real non-secret state; never synthetic profile collections
    data = load_agent_loop_settings()
    assert isinstance(data, dict)
    # explicitly avoid fakes that would pretend full profile/queue persistence
    assert "profiles" not in data
    assert "queueDefaults" not in data
    assert "diagnostics" not in data
    assert "queueApply" not in data
    # activeProfile and other non-secrets are the real persisted surface
    assert "activeProfile" in data
    assert data.get("activeProfile") in (None, "") or isinstance(data.get("activeProfile"), str)

    # save must persist only allowed; never inject fake profile structures
    saved = save_agent_loop_settings({
        "activeProfile": "runtime111",
        "workerMaxTurns": 64,
    })
    assert isinstance(saved, dict)
    assert saved.get("activeProfile") == "runtime111"
    assert "profiles" not in saved
    assert "queueDefaults" not in saved
    assert "diagnostics" not in saved

    # roundtrip via load after save (persistence truth)
    reloaded = load_agent_loop_settings()
    assert reloaded.get("activeProfile") == "runtime111"
    assert "profiles" not in reloaded


def test_agentloop_setting_runtime_linkage_112_applies_nonsecret_settings_to_run_controls(monkeypatch, tmp_path):
    """agentloop setting runtime linkage 112 applies nonsecret settings to run controls"""
    # Verifies CommandRequest accepts non-secret runtime fields (no drop), queuePath maps to queue_path in handler.
    # Does not leak secrets. Documents backend ownership of some fields.
    # Uses direct import of route model + handler simulation (no full http to avoid server dep).
    monkeypatch.setenv("AGENT_LOOP_SETTINGS_FILE", str(tmp_path / "agent-loop-settings.json"))
    from routes.agent_loop import CommandRequest

    # accepts the full set of non-secret linkage fields
    req = CommandRequest(
        queue="agent-loop/scripts/migration-queue.json",
        fixAgent="codex",
        reviewAgent="grok",
        workerMaxTurns=64,
        workerMaxRetries=3,
        worktreeScope="task",
        activeProfile="team",
        queuePath="agent-loop/scripts/migration-queue.json",  # also present
        mode="queue",
    )
    assert req.queue == "agent-loop/scripts/migration-queue.json"
    assert req.fixAgent == "codex"
    assert req.reviewAgent == "grok"
    assert req.workerMaxTurns == 64
    assert req.activeProfile == "team"
    assert req.queuePath == "agent-loop/scripts/migration-queue.json"

    # effective queue mapping logic exercised by handler (simulate the effective line)
    eff_q = req.queue or req.queuePath
    assert eff_q == "agent-loop/scripts/migration-queue.json"

    # secrets must never be part of model surface for runtime (no attr for them)
    assert not hasattr(req, "grokApiKey")

    # empty / partial still valid
    req2 = CommandRequest(task="agent-loop/tasks/x.md", mode="single")
    assert req2.task is not None
    assert req2.fixAgent is None  # omitted ok, backend owns defaults

    # also load settings still works for linkage
    from services.agent_loop_settings import load_agent_loop_settings
    s = load_agent_loop_settings()
    assert "fixAgent" in s and "queuePath" in s
