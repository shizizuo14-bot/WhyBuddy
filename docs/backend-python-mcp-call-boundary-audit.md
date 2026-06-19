# Backend Python `mcp.call` boundary audit

This document audits the **current** boundary of the SlideRule V5 `mcp.call` capability on the Node and Python sides. It answers what exists today and what provenance each path returns. It does **not** implement MCP tool runtime migration and does **not** declare `mcp.call` migrated.

## Executive summary

| Question | Answer |
| --- | --- |
| Is `mcp.call` a Python native LLM capability today? | **No.** It is absent from `CAPABILITY_PROMPTS` and `STRUCTURED_JSON_CAPABILITIES` in `tws-ai-slide-rule-python/sliderule_llm/capabilities.py`. |
| Does Node delegate `mcp.call` to Python in default mode? | **Yes.** `SLIDERULE_V5_BACKEND=python` (default) includes `mcp.call` in the Python V5 whitelist in `server/routes/sliderule.ts`. |
| Does Python execute a real MCP tool call for `mcp.call`? | **No.** Python routes through the mapped/stub path and returns keyword-baseline RAG output with `provenance: python-rag`. |
| Does Node execute a real MCP tool call for `mcp.call`? | **No.** Node does not call `McpToolAdapter` for the `mcp.call` capability. Real MCP infrastructure exists elsewhere but is not wired to this capability id. |
| Can `mcp.call` count toward Python native LLM completion? | **No.** Confirmed against code and tests. |

## Runtime classification

### Real runtime (exists, but not on `mcp.call` capability path)

Node has production-grade MCP tool infrastructure that is **not** connected to SlideRule `mcp.call`:

| Component | Path | Role |
| --- | --- | --- |
| MCP tool adapter | `server/tool/api/mcp-tool-adapter.ts` | Permission checks, approval gates, timeout handling, audit logging for `mcp_tool` calls. |
| Internal MCP invoker | `server/tool/api/internal-mcp-tool-invoker.ts` | Dispatches to registered MCP servers/tools. |
| MCP HTTP router | `server/routes/mcp.ts` | Exposes `/api/mcp/nodes/execute`. |
| GitHub source bridge | `server/sliderule/github-mcp-adapter.ts` | Real HTTP fetch for `source.github.inspect` / `evidence.github.collect` only. |

These are **real runtime** for generic MCP tooling and GitHub-specific capabilities. They must not be cited as proof that SlideRule `mcp.call` is migrated.

### Fallback (current `mcp.call` execution path)

When Node delegates `mcp.call` to Python (default mode), Python does **not** use `sliderule_llm.capabilities.execute_capability()`. It falls back to the mapped executor chain:

```
Node server/routes/sliderule.ts
  -> POST /api/sliderule/execute-capability
  -> tws-ai-slide-rule-python/routes/sliderule.py or sliderule_full.py
  -> is_python_native_capability("mcp.call") == False
  -> execute_mapped_capability()
  -> capability_maps.execute_mcp_or_skill()
  -> services/slide_rule_executor.execute_capability()
```

That executor treats `mcp.call` like `skill.invoke` / `evidence.search`: keyword retrieval plus templated generation. This is a **fallback/mapped** path, not native LLM and not real MCP.

In legacy Node mode (`SLIDERULE_V5_BACKEND=legacy`), `mcp.call` is not LLM-backed and is not handled by mapped structure/delivery/visual handlers. The route throws `Server LLM provider does not handle capability: mcp.call` (HTTP 400). Legacy mode therefore has **no working `mcp.call` executor**.

### Simulated / stub (what the fallback actually runs)

| Layer | Path | Behavior |
| --- | --- | --- |
| Keyword retrieval | `tws-ai-slide-rule-python/services/rag_service.py` | `retrieve_evidence()` scores a hard-coded `KNOWLEDGE_BASE` by keyword overlap. No Qdrant, no embeddings, no external tool fetch. |
| Stub generation | `tws-ai-slide-rule-python/services/rag_service.py` | `generate_with_rag()` formats retrieved snippets into prose. It simulates LLM output; it does not call a configured model endpoint for `mcp.call`. |
| Forced provenance | `tws-ai-slide-rule-python/routes/sliderule_full.py` | For `mcp.call`, `skill.invoke`, `evidence.search`, sets `summary = "检索了外部证据"` and `provenance = "python-rag"`. |

Returned shape may include `toolName` from `slide_rule_executor.py`, but that field mirrors the capability id for labeling only. No MCP `serverId`, no tool arguments, no adapter invocation occurs.

## Node path detail

### Default Python-delegation path

File: `server/routes/sliderule.ts`

- `mcp.call` is in `isPythonV5Cap` alongside native LLM caps.
- Delegation target: `POST /api/sliderule/execute-capability` on the Python service.
- On Python failure: returns HTTP 502 with `provenance: python-delegated-failed` (explicit degraded shape, not fake success).
- Node never invokes `mcpToolAdapter.execute()` for this capability id.

### Separate real MCP surfaces (not `mcp.call`)

- `/api/mcp` routes mount when the server starts (`server/index.ts`).
- `source.github.inspect` / `evidence.github.collect` bypass LLM and call `executeGithubMcpCapability()` before the Python whitelist branch.
- UI labels in `shared/blueprint/capability-process-labels.ts` describe `mcp.call` as an external tool action (`toolName`), but the executor does not perform that action today.

## Python path detail

### Native LLM gate (rejects `mcp.call`)

File: `tws-ai-slide-rule-python/sliderule_llm/capabilities.py`

```python
def is_python_native_capability(capability_id: str) -> bool:
    return capability_id in CAPABILITY_PROMPTS or capability_id in STRUCTURED_JSON_CAPABILITIES
```

`mcp.call` is in neither set. `execute_capability()` raises `UnsupportedCapability` if called directly.

Test evidence: `tws-ai-slide-rule-python/tests/test_capabilities.py` asserts native coverage for 18 capabilities and does **not** include `mcp.call`.

### Mapped executor (actual handler)

Files:

- `tws-ai-slide-rule-python/services/capability_maps.py` — maps `"mcp.call": execute_mcp_or_skill`
- `tws-ai-slide-rule-python/services/slide_rule_executor.py` — shared stub for `mcp.call`, `skill.invoke`, `evidence.search`

Output contract today:

| Field | Value | Meaning |
| --- | --- | --- |
| `title` | `{capability_id} via stable RAG` | Label only |
| `summary` | `检索了外部证据` | Marketing-stable summary, not proof of MCP |
| `content` | RAG-formatted text | From stub generator |
| `provenance` | `python-rag` | Keyword/stub baseline, **not** `python-llm`, **not** `mcp:*` |
| `sources` | keyword hits | From in-memory knowledge base |
| `toolName` | `mcp.call` when cap is `mcp.call` | Display metadata only |

### Route surfaces

| Route module | Behavior for `mcp.call` |
| --- | --- |
| `routes/sliderule.py` | Non-native -> `execute_mapped_capability()` |
| `routes/sliderule_full.py` | Same, plus explicit provenance rewrite for tool/evidence caps |

Both routes are thin proxies; neither adds MCP client code.

## Provenance matrix

| Path | Trigger | Provenance | Real MCP? | Count as `python-llm`? |
| --- | --- | --- | --- | --- |
| Python mapped stub | Default Node delegation | `python-rag` | No | No |
| Python native LLM | Not reachable for `mcp.call` | N/A | No | No |
| Node MCP adapter | Other APIs / workflows | adapter-specific | Yes (for those APIs) | No |
| GitHub MCP capabilities | `source.github.inspect`, `evidence.github.collect` | `mcp:github` | Partial (HTTP fetch bridge) | No |
| Node legacy mode | `SLIDERULE_V5_BACKEND=legacy` | error / none | No | No |
| Python delegation failure | Python down | `python-delegated-failed` | No | No |

## Risks

1. **False completion signal:** Node delegation plus `python-rag` provenance can look like migration progress even though no MCP server or tool is invoked.
2. **README drift:** `tws-ai-slide-rule-python/README.md` claims "real tool/skill execution" for `mcp.call` / `skill.invoke`. Code evidence contradicts that for `mcp.call`.
3. **UI label mismatch:** `capability-process-labels.ts` shows live tool-call wording while the backend returns stub evidence.
4. **Coverage gate pressure:** `slide_rule_coverage.py` and shared coverage gates still require `mcp.call`, so sessions can mark coverage satisfied without external tool evidence.
5. **Conflation with GitHub MCP:** `mcp:github` capabilities are real fetch paths but are different capability ids; they must not be rolled into `mcp.call` completion metrics.

## What is done vs pending

### Done (narrow, honest)

- Node thin proxy can forward `mcp.call` to Python execute-capability.
- Python returns a stable V5-shaped payload so sessions do not hard-fail on picker/coverage requirements.
- Python native LLM registry **explicitly excludes** `mcp.call` (test-locked).
- Node generic MCP adapter stack exists for non-SlideRule-capability use cases.

### Not done (must stay out of native LLM counts)

- Real MCP server selection, tool argument parsing, permission/approval flow inside `mcp.call`.
- Python MCP client or bridge to Node `McpToolAdapter`.
- Provenance that honestly reports `mcp:{server}/{tool}` on success or structured tool failure.
- Contract tests proving tool invocation boundaries.
- Vector/real external retrieval backing tool evidence.

## Can `mcp.call` count toward Python native LLM completion?

**No.** Rationale with code evidence:

1. `is_python_native_capability("mcp.call")` is `False` (`capabilities.py`).
2. `test_capabilities.py` native matrix covers 18 caps and omits `mcp.call`.
3. Actual execution uses `python-rag` stub retrieval/generation, not `sliderule_llm` model calls.
4. `docs/backend-python-rag-inventory.md` and `docs/sliderule-python-native-capability-audit.md` already classify `mcp.call` as delegated-but-not-native; this audit **confirms** that judgment.

Delegating to Python is transport migration, not MCP runtime migration.

## Recommended next steps (no implementation in this task)

1. **Contract first:** Add a narrow `mcp.call` contract doc/test defining required inputs (`toolName`, `serverId`, arguments), success provenance (`mcp:*`), and allowed degraded shapes.
2. **Bridge design:** Decide whether Python calls Node `McpToolAdapter` over internal HTTP or whether Node keeps tool execution and Python only synthesizes evidence summaries.
3. **Provenance honesty:** Stop rewriting tool caps to `python-rag` once a real or explicit-fallback path exists.
4. **Separate metrics:** Track `mcp.call` under tool-runtime migration, not `python-llm` or `python-rag` completion percentages.
5. **Do not expand scope here:** Do not modify `orchestrate-plan.ts`, `pool-json-llm.ts`, or `capabilities.py` in the same slice as runtime implementation.

## Code evidence index

| Claim | Primary evidence |
| --- | --- |
| Node delegates `mcp.call` in default Python mode | `server/routes/sliderule.ts` (`isPythonV5Cap`, `v5Backend === 'python'`) |
| Not Python native LLM | `tws-ai-slide-rule-python/sliderule_llm/capabilities.py` (`is_python_native_capability`), `tws-ai-slide-rule-python/tests/test_capabilities.py` (18-cap matrix omits `mcp.call`) |
| Mapped fallback handler | `tws-ai-slide-rule-python/services/capability_maps.py` (`"mcp.call": execute_mcp_or_skill`), `tws-ai-slide-rule-python/routes/sliderule.py` (`execute_mapped_capability`) |
| Stub RAG execution (no MCP client) | `tws-ai-slide-rule-python/services/slide_rule_executor.py`, `tws-ai-slide-rule-python/services/rag_service.py` |
| Forced `python-rag` provenance on tool caps | `tws-ai-slide-rule-python/routes/sliderule_full.py` (lines 80–82) |
| Node does not call `McpToolAdapter` for `mcp.call` | `server/routes/sliderule.ts` (delegation branch only; no `mcpToolAdapter` import/use on this cap) |
| Real MCP stack exists elsewhere | `server/tool/api/mcp-tool-adapter.ts`, `server/tool/api/internal-mcp-tool-invoker.ts`, `server/routes/mcp.ts` |
| GitHub MCP is a separate capability path | `server/sliderule/github-mcp-adapter.ts`, `server/routes/sliderule.ts` (pre-whitelist branch for `source.github.inspect` / `evidence.github.collect`) |
| Legacy Node mode has no `mcp.call` executor | `server/routes/sliderule.ts` (non-delegated path throws for unhandled caps) |
| Python delegation failure shape | `server/routes/sliderule.ts` (`provenance: 'python-delegated-failed'`, HTTP 502) |
| Coverage still requires `mcp.call` | `tws-ai-slide-rule-python/services/slide_rule_coverage.py` |
| README overclaims real tool execution | `tws-ai-slide-rule-python/README.md` (contradicted by stub path above) |
| UI labels imply live tool call | `shared/blueprint/capability-process-labels.ts` (`mcp.call` process labels) |
| Prior inventory agrees: not native LLM | `docs/backend-python-rag-inventory.md`, `docs/sliderule-python-native-capability-audit.md` |

## Verification

Migration queue gate `mcpBoundaryAuditGates`:

```powershell
if (!(Test-Path docs/backend-python-mcp-call-boundary-audit.md)) { throw 'missing docs/backend-python-mcp-call-boundary-audit.md' }
node agent-loop/src/check-mojibake.js agent-loop/tasks/backend-python-mcp-call-boundary-audit.md docs/backend-python-mcp-call-boundary-audit.md
```

This audit documents boundaries only. It does **not** declare `mcp.call` fully migrated to Python or to real MCP runtime.