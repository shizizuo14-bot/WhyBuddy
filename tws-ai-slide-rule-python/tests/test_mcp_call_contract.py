import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.v5_state import V5SessionState  # noqa: E402
from services.capability_maps import execute_mapped_capability  # noqa: E402


def _state() -> V5SessionState:
    return V5SessionState(
        sessionId="mcp-contract",
        goal={"text": "Collect grounding evidence for migration boundaries"},
        artifacts=[],
    )


def test_mcp_call_contract_marks_current_path_as_python_rag_fallback_not_real_mcp():
    result = execute_mapped_capability(
        "mcp.call",
        _state(),
        ["goal-1"],
        "grounding",
        "turn-mcp",
    )

    assert result["toolName"] == "mcp.call"
    assert result["provenance"] == "python-rag"
    assert not result["provenance"].startswith("mcp:")
    assert result.get("degraded") in (False, None)
    assert isinstance(result.get("sources"), list)
    assert result["sources"], "fallback path should expose its keyword/RAG sources honestly"


def test_mcp_call_contract_does_not_invent_server_or_tool_runtime_fields():
    result = execute_mapped_capability(
        "mcp.call",
        _state(),
        ["goal-1"],
        "grounding",
        "turn-mcp",
    )

    assert "serverId" not in result
    assert "arguments" not in result
    assert "toolResult" not in result
