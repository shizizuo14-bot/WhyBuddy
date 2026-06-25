"""Runtime tests for Python Blueprint prompt package + preview envelopes.

Covers:
- prompt package success, invalid (schema), degraded, error paths
- preview safe plan/result + degraded/error (safe-failure) paths
- provenance, policy presence, non-masquerading of degraded/error as success
"""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.blueprint_prompt_preview import (  # noqa: E402
    build_prompt_package_envelope,
    build_preview_safe_envelope,
    normalize_prompt_package_response,
    render_prompt_package_content,
    validate_prompt_package,
    DEFAULT_POLICY,
)


def _valid_prompt_package_payload():
    return {
        "title": "Release Dashboard Implementation Pack (Codex)",
        "summary": "Codex-ready prompt package for the tenant-scoped release dashboard.",
        "prompts": [
            {
                "id": "dashboard-root-setup",
                "title": "Dashboard root setup",
                "systemPrompt": "You are a senior web engineer.",
                "userPrompt": "Implement the dashboard root page.",
                "variables": [
                    {"name": "tenantId", "description": "Tenant id", "required": True}
                ],
                "examples": [
                    {"title": "Happy path", "input": "tenant=acme", "output": "<Dashboard/>"}
                ],
            }
        ],
        "sections": [
            {"heading": "Overview", "body": "Use Codex to execute."}
        ],
    }


def test_prompt_package_success_envelope():
    raw = _valid_prompt_package_payload()
    env = build_prompt_package_envelope(raw, target_label="Codex")
    assert env["status"] == "success"
    assert env["generationSource"] == "llm"
    assert env["renderedTitle"]
    assert env["renderedSummary"]
    assert "renderedContent" in env and "# " in env["renderedContent"]
    assert isinstance(env["renderedSections"], list)
    assert isinstance(env["renderedPrompts"], list)
    assert env["promptId"] == "blueprint.prompt-package.v1"
    assert env["provenance"] == "python-blueprint-prompt-preview-runtime"
    assert "policy" in env
    assert env.get("responseDigest", "").startswith("sha256:")
    # must not be error shape
    assert "error" not in env or env.get("error") is None


def test_prompt_package_invalid_envelope_on_bad_schema():
    raw = {"title": "", "summary": "ok", "prompts": [], "sections": []}
    env = build_prompt_package_envelope(raw)
    assert env["status"] in ("invalid", "degraded")
    assert env["generationSource"] == "llm_fallback"
    assert "error" in env and "schema" in env["error"].lower() or "empty" in env.get("error", "").lower()
    assert env["provenance"] == "python-blueprint-prompt-preview-runtime"
    assert env.get("generationSource") != "llm"


def test_prompt_package_degraded_on_bad_input_structure():
    # triggers non-dict path or normalize fail
    env = build_prompt_package_envelope("not-a-dict")
    assert env["status"] in ("invalid", "degraded")
    assert "error" in env
    assert env["generationSource"] == "llm_fallback"
    assert env["provenance"] == "python-blueprint-prompt-preview-runtime"


def test_prompt_package_error_path_via_normalize_error(monkeypatch):
    raw = _valid_prompt_package_payload()
    # force a degrade path by making normalize blow (by patching inside scope)
    def bad_normalize(*a, **k):
        raise RuntimeError("forced normalize fail")
    import services.blueprint_prompt_preview as mod
    monkeypatch.setattr(mod, "normalize_prompt_package_response", bad_normalize)
    env = build_prompt_package_envelope(raw)
    assert env["status"] == "degraded"
    assert "error" in env and "normalize" in env["error"].lower()
    assert env["generationSource"] == "llm_fallback"
    assert env["provenance"] == "python-blueprint-prompt-preview-runtime"


def test_prompt_package_normalize_render_direct():
    raw = _valid_prompt_package_payload()
    val = validate_prompt_package(raw)
    assert val["ok"] is True
    norm = normalize_prompt_package_response(val["data"])
    assert norm["title"].startswith("Release")
    content = render_prompt_package_content(norm, "Codex")
    assert "# Release" in content
    assert "Reusable Prompts" in content
    assert "Target platform" in content


def test_preview_safe_result_envelope():
    env = build_preview_safe_envelope("result", {"summary": "ok preview"})
    assert env["status"] == "result"
    assert env["ok"] is True
    assert env["degraded"] is False
    assert env["provenance"] == "python-blueprint-prompt-preview-runtime"
    assert "policy" in env
    assert "cost" in env


def test_preview_safe_plan_envelope():
    env = build_preview_safe_envelope("plan")
    assert env["status"] == "plan"
    assert env["ok"] is True
    assert env["degraded"] is False


def test_preview_safe_degraded_never_succeeds():
    env = build_preview_safe_envelope("degraded", {"reason": "no_llm"}, error_msg="safe degraded")
    assert env["status"] == "degraded"
    assert env["ok"] is False
    assert env["degraded"] is True
    assert "error" in env
    assert env["provenance"] == "python-blueprint-prompt-preview-runtime"
    # ensure not masquerading
    assert env.get("generationSource") != "llm" or env.get("ok") is False


def test_preview_safe_error_envelope():
    env = build_preview_safe_envelope("error", error_msg="boom")
    assert env["status"] == "error"
    assert env["ok"] is False
    assert env.get("degraded") is False
    assert "error" in env and "boom" in env["error"]


def test_existing_service_tests_compatibility():
    # basic smoke that direct functions do not mutate policy
    assert DEFAULT_POLICY["maxTitleLength"] == 200
    env = build_prompt_package_envelope(_valid_prompt_package_payload())
    assert env["status"] == "success"
