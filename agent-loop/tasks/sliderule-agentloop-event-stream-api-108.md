# SlideRule AgentLoop 108: event stream API

## Execution status
- Status: pending
- Goal: provide normalized event snapshots and a server-sent event stream shape for AgentLoop runs.
- Required gate: `slideruleAgentLoopEventStreamApi108Gates`

## Context
AgentLoop dashboard refresh should be driven by Python-owned event data. This task adds deterministic event formatting and stream framing without requiring a long-running live worker in tests.

## Allowed files
- `tws-ai-slide-rule-python/routes/agent_loop.py`
- `tws-ai-slide-rule-python/services/agent_loop_events.py`
- `tws-ai-slide-rule-python/tests/test_agent_loop_event_stream.py`
- `agent-loop/tasks/sliderule-agentloop-event-stream-api-108.md`
- This task file

## Do not
- Do not create infinite loops in tests.
- Do not depend on wall-clock sleeps longer than a few milliseconds.
- Do not change Node event writing.

## Acceptance criteria
- Add a test named `agentloop event stream 108 formats state changes as sse frames`.
- Event snapshots include status, phase, updated time, active agent, and latest gate summary when present.
- SSE frames use `event:` and `data:` lines with JSON payloads.
- Stream code can be tested with a finite generator or helper.
