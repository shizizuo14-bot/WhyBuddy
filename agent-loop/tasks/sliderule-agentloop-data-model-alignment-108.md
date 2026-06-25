# SlideRule AgentLoop 108: data model alignment

## Execution status
- Status: pending
- Goal: add Python Pydantic contracts for AgentLoop runs, tasks, events, artifacts, commands, and settings.
- Required gate: `slideruleAgentLoopDataModelAlignment108Gates`

## Context
The Python control plane needs stable response models before routes and UI can rely on AgentLoop data. This task creates the shared model layer.

## Allowed files
- `slide-rule-python/models/agent_loop.py`
- `slide-rule-python/tests/test_agent_loop_models.py`
- `agent-loop/tasks/sliderule-agentloop-data-model-alignment-108.md`
- This task file

## Do not
- Do not read the filesystem from model classes.
- Do not include raw secret fields in response models.
- Do not modify existing SlideRule V5 state models.

## Acceptance criteria
- Add tests named `agentloop data model 108 validates run summary` and `agentloop data model 108 rejects raw secret fields`.
- Models cover run summary, run detail, task entry, event, artifact, settings status, command request, and command receipt.
- Unknown or optional AgentLoop state fields are preserved in a bounded `metadata` or equivalent field.
- Models serialize with stable camelCase or documented snake_case consistently across tests.
