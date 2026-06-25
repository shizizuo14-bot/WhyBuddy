# SlideRule AgentLoop 108: runtime boundary design

## Execution status
- Status: pending
- Goal: define the stable boundary between the SlideRule Python control plane and the AgentLoop Node worker bridge.
- Required gate: `slideruleAgentLoopRuntimeBoundaryDesign108Gates`

## Context
The merge must make SlideRule the product owner without rewriting the runner in one jump. This task writes the boundary contract that later API, UI, and bridge tasks must follow.

## Allowed files
- `slide-rule-python/AGENT_LOOP_RUNTIME_BOUNDARY.md`
- `slide-rule-python/tests/test_agent_loop_runtime_boundary.py`
- `agent-loop/tasks/sliderule-agentloop-runtime-boundary-design-108.md`
- This task file

## Do not
- Do not implement subprocess execution.
- Do not change existing AgentLoop worker prompts.
- Do not add UI code.

## Acceptance criteria
- Add a test named `agentloop runtime boundary 108 keeps node runner behind python control plane`.
- The boundary document defines Python-owned APIs, settings, run readers, event readers, redaction, path safety, and product UI.
- The boundary document defines Node-owned queue execution, worker process spawning, worktree mutation, gates, diffs, and final reports for this wave.
- The document describes the future Python rewrite path as optional follow-up, not part of 108.
