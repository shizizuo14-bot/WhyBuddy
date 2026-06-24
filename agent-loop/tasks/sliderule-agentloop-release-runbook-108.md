# SlideRule AgentLoop 108: release runbook

## Execution status
- Status: pending
- Goal: document how to operate the merged SlideRule + AgentLoop product during the bridge phase.
- Required gate: `slideruleAgentLoopReleaseRunbook108Gates`

## Context
Once AgentLoop is controlled by SlideRule Python, operators need one clear runbook for startup, queue execution, settings, troubleshooting, security, and rollback.

## Allowed files
- `tws-ai-slide-rule-python/AGENT_LOOP_RUNBOOK.md`
- `tws-ai-slide-rule-python/README.md`
- `tws-ai-slide-rule-python/tests/test_agent_loop_release_runbook.py`
- `agent-loop/tasks/sliderule-agentloop-release-runbook-108.md`
- This task file

## Do not
- Do not claim the Node runner has been removed.
- Do not document raw secret storage.
- Do not remove existing SlideRule V5 README sections.

## Acceptance criteria
- Add a test named `agentloop release runbook 108 documents startup queue settings security and rollback`.
- Runbook includes startup commands, API routes, queue execution, settings, provider health, run inspection, security, and rollback.
- README links to the runbook from the development or integration section.
- The runbook states that 108 is a bridge phase with Node runner still present.
