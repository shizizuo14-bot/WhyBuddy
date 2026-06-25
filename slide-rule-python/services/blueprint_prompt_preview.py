"""Python runtime for Blueprint prompt package normalize/render/validation envelope
and preview safe plan/result/degraded/error envelopes.

Minimal boundary: implements normalize, render, validation + safe degraded/error semantics.
Node remains thin proxy + owns LLM calls, image, audit, routing and policy application.
No real LLM / image / Docker / external calls performed here.
"""

from __future__ import annotations

import hashlib
import json
import re
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator, model_validator

# ---------------------------------------------------------------------------
# Policy (subset of bounds for envelope processing)
# ---------------------------------------------------------------------------

DEFAULT_POLICY: dict[str, Any] = {
    "maxTitleLength": 200,
    "maxSummaryLength": 500,
    "maxPromptTitleLength": 200,
    "maxSystemPromptLength": 4000,
    "maxUserPromptLength": 4000,
    "maxVariableNameLength": 64,
    "maxVariableDescriptionLength": 500,
    "maxExampleTitleLength": 200,
    "maxExampleInputLength": 4000,
    "maxExampleOutputLength": 4000,
    "maxSectionHeadingLength": 200,
    "maxSectionBodyLength": 5000,
    "maxErrorLength": 400,
}

# ---------------------------------------------------------------------------
# Pydantic validation models (mirrors zod schema invariants at minimum)
# ---------------------------------------------------------------------------

class PromptVariable(BaseModel):
    model_config = ConfigDict(extra="ignore")
    name: str = Field(min_length=1, max_length=64)
    description: str = Field(min_length=1, max_length=500)
    required: bool


class PromptExample(BaseModel):
    model_config = ConfigDict(extra="ignore")
    title: str | None = Field(default=None)
    input: str | None = Field(default=None)
    output: str | None = Field(default=None)


class PromptItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(min_length=1, max_length=128)
    title: str = Field(min_length=1, max_length=200)
    systemPrompt: str = Field(min_length=1, max_length=4000)
    userPrompt: str = Field(min_length=1, max_length=4000)
    variables: list[PromptVariable] = Field(default_factory=list)
    examples: list[PromptExample] | None = None


class SectionItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    heading: str = Field(min_length=1, max_length=200)
    body: str = Field(min_length=1, max_length=5000)


class PromptPackageLlmResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    title: str = Field(min_length=1, max_length=200)
    summary: str = Field(min_length=1, max_length=500)
    prompts: list[PromptItem] = Field(min_length=1, max_length=12)
    sections: list[SectionItem] = Field(min_length=1, max_length=20)

    @model_validator(mode="after")
    def _enforce_core_invariants(self) -> "PromptPackageLlmResponse":
        if not self.title or not self.title.strip():
            raise ValueError("title must not be empty after trim")
        if not self.summary or not self.summary.strip():
            raise ValueError("summary must not be empty after trim")
        seen_ids: set[str] = set()
        for idx, p in enumerate(self.prompts):
            pid = (p.id or "").strip()
            if not pid:
                raise ValueError("prompts[*].id must not be empty after trim")
            n = pid.lower()
            if n in seen_ids:
                raise ValueError(f'duplicated prompt id: "{p.id}"')
            seen_ids.add(n)
            if not (p.title or "").strip():
                raise ValueError("prompts[*].title must not be empty after trim")
            if not (p.systemPrompt or "").strip():
                raise ValueError("prompts[*].systemPrompt must not be empty after trim")
            if not (p.userPrompt or "").strip():
                raise ValueError("prompts[*].userPrompt must not be empty after trim")
        return self


# ---------------------------------------------------------------------------
# Pure helpers
# ---------------------------------------------------------------------------

def _trim(value: Any) -> str:
    if isinstance(value, str):
        return value.strip()
    return ""


def _slugify(value: str) -> str:
    v = _trim(value).lower()
    v = re.sub(r"\s+", "-", v)
    v = re.sub(r"[^a-z0-9-]", "", v)
    return v


def _deduplicate_with_suffix(items: list[str]) -> list[str]:
    seen: dict[str, int] = {}
    result: list[str] = []
    for item in items:
        key = item.lower()
        count = seen.get(key, 0)
        seen[key] = count + 1
        if count == 0:
            result.append(item)
        else:
            result.append(f"{item}-{count + 1}")
    return result


def _truncate(value: str, max_length: int) -> str:
    if len(value) <= max_length:
        return value
    if max_length <= 0:
        return ""
    return value[:max_length]


def _sha256_hex(obj: Any) -> str:
    if isinstance(obj, (dict, list)):
        s = json.dumps(obj, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    else:
        s = str(obj)
    return "sha256:" + hashlib.sha256(s.encode("utf-8")).hexdigest()


# ---------------------------------------------------------------------------
# Validation / normalize / render
# ---------------------------------------------------------------------------

def validate_prompt_package(raw: dict[str, Any] | Any) -> dict[str, Any]:
    if not isinstance(raw, dict):
        return {"ok": False, "error_type": "invalid", "message": "payload must be object"}
    try:
        validated = PromptPackageLlmResponse.model_validate(raw)
        return {"ok": True, "data": validated.model_dump()}
    except ValidationError as ve:
        # compact message similar to zod summary
        msgs = "; ".join([f"{'.'.join(map(str, e['loc']))}: {e['msg']}" for e in ve.errors()][:5])
        return {"ok": False, "error_type": "schema", "message": msgs or "schema validation failed"}
    except Exception as e:
        return {"ok": False, "error_type": "invalid", "message": str(e)[:200]}


def normalize_prompt_package_response(
    validated: dict[str, Any], policy: dict[str, Any] | None = None
) -> dict[str, Any]:
    p = {**DEFAULT_POLICY, **(policy or {})}
    title = _trim(validated.get("title", ""))
    summary = _trim(validated.get("summary", ""))

    raw_prompts = validated.get("prompts", []) or []
    slug_ids = [_slugify(p.get("id", "")) for p in raw_prompts]
    dedup_ids = _deduplicate_with_suffix(slug_ids)

    prompts_out: list[dict[str, Any]] = []
    for i, rp in enumerate(raw_prompts):
        t = _trim(rp.get("title", ""))
        sp = _trim(rp.get("systemPrompt", ""))
        up = _trim(rp.get("userPrompt", ""))
        vnames = [_trim(v.get("name", "")) for v in (rp.get("variables") or [])]
        dedup_v = _deduplicate_with_suffix(vnames)
        variables = []
        for j, v in enumerate(rp.get("variables") or []):
            variables.append(
                {
                    "name": _truncate(dedup_v[j] if j < len(dedup_v) else vnames[j], p["maxVariableNameLength"]),
                    "description": _truncate(_trim(v.get("description", "")), p["maxVariableDescriptionLength"]),
                    "required": bool(v.get("required")),
                }
            )
        exs = rp.get("examples") or []
        examples: list[dict[str, Any]] = []
        for ex in exs:
            ex_o: dict[str, Any] = {}
            if ex.get("title") is not None:
                ex_o["title"] = _truncate(_trim(ex.get("title", "")), p["maxExampleTitleLength"])
            if ex.get("input") is not None:
                ex_o["input"] = _truncate(_trim(ex.get("input", "")), p["maxExampleInputLength"])
            if ex.get("output") is not None:
                ex_o["output"] = _truncate(_trim(ex.get("output", "")), p["maxExampleOutputLength"])
            if ex_o:
                examples.append(ex_o)
        prompts_out.append(
            {
                "id": dedup_ids[i],
                "title": _truncate(t, p["maxPromptTitleLength"]),
                "systemPrompt": _truncate(sp, p["maxSystemPromptLength"]),
                "userPrompt": _truncate(up, p["maxUserPromptLength"]),
                "variables": variables,
                "examples": examples,
            }
        )

    raw_secs = validated.get("sections", []) or []
    heads = [_trim(s.get("heading", "")) for s in raw_secs]
    dedup_h = _deduplicate_with_suffix(heads)
    sections_out = []
    for i, s in enumerate(raw_secs):
        sections_out.append(
            {
                "heading": _truncate(dedup_h[i], p["maxSectionHeadingLength"]),
                "body": _truncate(_trim(s.get("body", "")), p["maxSectionBodyLength"]),
            }
        )

    return {
        "title": _truncate(title, p["maxTitleLength"]),
        "summary": _truncate(summary, p["maxSummaryLength"]),
        "prompts": prompts_out,
        "sections": sections_out,
    }


def render_prompt_package_content(normalized: dict[str, Any], target_label: str) -> str:
    blocks: list[str] = []
    blocks.append(f"# {normalized.get('title', '')}")
    blocks.append(normalized.get("summary", ""))
    blocks.append(f"**Target platform**: {target_label}")
    blocks.append("## Reusable Prompts")
    for pr in normalized.get("prompts", []):
        blocks.append(f"### Prompt: {pr.get('title', '')} (id: {pr.get('id', '')})")
        blocks.append("**System prompt**")
        blocks.append(pr.get("systemPrompt", ""))
        blocks.append("**User prompt**")
        blocks.append(pr.get("userPrompt", ""))
        blocks.append("**Variables**")
        vs = pr.get("variables", []) or []
        if vs:
            vlines = "\n".join(
                [f"- `{v['name']}` (required: {str(v['required']).lower()}): {v['description']}" for v in vs]
            )
            blocks.append(vlines)
        exs = pr.get("examples", []) or []
        if exs:
            blocks.append("**Examples** (optional)")
            exlines: list[str] = []
            for idx, ex in enumerate(exs):
                ttl = ex.get("title") or f"Example {idx + 1}"
                inp = ex.get("input") or "(n/a)"
                outp = ex.get("output") or "(n/a)"
                exlines.append(f"- **{ttl}**\n  - Input: {inp}\n  - Output: {outp}")
            blocks.append("\n".join(exlines))
    for sec in normalized.get("sections", []):
        blocks.append(f"## {sec.get('heading', '')}")
        blocks.append(sec.get("body", ""))
    return "\n\n".join(blocks)


# ---------------------------------------------------------------------------
# Prompt package runtime envelope (success / invalid / degraded / error)
# ---------------------------------------------------------------------------

def build_prompt_package_envelope(
    raw: dict[str, Any] | Any, target_label: str = "Codex", policy: dict[str, Any] | None = None
) -> dict[str, Any]:
    """Validate + normalize + render. Returns safe envelope; degraded/error never succeed."""
    prov = "python-blueprint-prompt-preview-runtime"
    if not isinstance(raw, dict):
        return {
            "status": "invalid",
            "generationSource": "llm_fallback",
            "error": "non-json response",
            "provenance": prov,
        }
    val = validate_prompt_package(raw)
    if not val.get("ok"):
        err_msg = _truncate(
            "schema validation failed: " + str(val.get("message", "invalid")),
            (policy or DEFAULT_POLICY).get("maxErrorLength", 400),
        )
        return {
            "status": "invalid",
            "generationSource": "llm_fallback",
            "error": err_msg,
            "promptId": "blueprint.prompt-package.v1",
            "provenance": prov,
        }
    try:
        norm = normalize_prompt_package_response(val["data"], policy)
        rendered = render_prompt_package_content(norm, target_label)
        resp_digest = _sha256_hex(raw)
        struct_digest = _sha256_hex(norm)
        return {
            "status": "success",
            "generationSource": "llm",
            "renderedTitle": norm["title"],
            "renderedSummary": norm["summary"],
            "renderedContent": rendered,
            "renderedSections": norm["sections"],
            "renderedPrompts": norm["prompts"],
            "promptId": "blueprint.prompt-package.v1",
            "model": "python-runtime",
            "promptFingerprint": "py-" + _sha256_hex(raw)[:20],
            "responseDigest": resp_digest,
            "structuredPayloadDigest": struct_digest,
            "provenance": prov,
            "policy": {"maxErrorLength": (policy or DEFAULT_POLICY).get("maxErrorLength", 400)},
        }
    except Exception as ex:  # safe degradation
        return {
            "status": "degraded",
            "generationSource": "llm_fallback",
            "error": "normalize-or-render failed: " + _truncate(str(ex), 120),
            "provenance": prov,
        }


# ---------------------------------------------------------------------------
# Preview request safe envelopes (plan / result / degraded / error)
# Never allow degraded or error to masquerade as success.
# ---------------------------------------------------------------------------

def build_preview_safe_envelope(
    kind: Literal["plan", "result", "degraded", "error"],
    payload: dict[str, Any] | None = None,
    error_msg: str | None = None,
) -> dict[str, Any]:
    prov = "python-blueprint-prompt-preview-runtime"
    base: dict[str, Any] = {"provenance": prov, "policy": {"source": "python-runtime"}}
    if kind == "result":
        pl = payload or {}
        return {
            "status": "result",
            "ok": True,
            "degraded": False,
            "summary": pl.get("summary", "Python runtime preview result"),
            "architectureNotes": pl.get("architectureNotes", []),
            "prototypeNotes": pl.get("prototypeNotes", []),
            "progressPlan": pl.get("progressPlan", []),
            "renderedHudState": pl.get("renderedHudState"),
            "renderedConsoleLines": pl.get("renderedConsoleLines", []),
            "renderedLogTimeline": pl.get("renderedLogTimeline", []),
            "cost": {"mock": True, "tokens": 42},
            **base,
        }
    if kind == "plan":
        return {
            "status": "plan",
            "ok": True,
            "degraded": False,
            "plan": (payload or {}).get("plan", {"steps": ["validate", "normalize"]}),
            **base,
        }
    if kind == "degraded":
        return {
            "status": "degraded",
            "ok": False,
            "degraded": True,
            "degradedReason": (payload or {}).get("reason", "preview_runtime_degraded"),
            "error": error_msg or "preview degraded",
            **base,
        }
    # error
    return {
        "status": "error",
        "ok": False,
        "degraded": False,
        "error": error_msg or "preview runtime error",
        **base,
    }


__all__ = [
    "DEFAULT_POLICY",
    "build_prompt_package_envelope",
    "build_preview_safe_envelope",
    "normalize_prompt_package_response",
    "render_prompt_package_content",
    "validate_prompt_package",
]