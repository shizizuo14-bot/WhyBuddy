# SlideRule AgentLoop 108: integration inventory

## Execution status
- Status: pending
- Goal: document the exact current AgentLoop and SlideRule Python boundaries before merging product ownership.
- Required gate: `slideruleAgentLoopIntegrationInventory108Gates`

## Context
The 108 wave merges AgentLoop into `slide-rule-python` using a Python control plane and the existing Node AgentLoop runner as an internal worker bridge. This first task prevents blind migration by inventorying the source system and target seams.

## Allowed files
- `slide-rule-python/AGENT_LOOP_INTEGRATION_INVENTORY.md`
- `slide-rule-python/tests/test_agent_loop_integration_inventory.py`
- `agent-loop/tasks/sliderule-agentloop-integration-inventory-108.md`
- This task file

## Do not
- Do not move runtime code.
- Do not edit queue execution logic.
- Do not claim Python owns AgentLoop execution yet.

## Acceptance criteria
- Add a test named `agentloop integration inventory 108 documents source boundaries`.
- Inventory covers Node runner, queue config, run state, artifacts, logs, settings, dashboard, and VS Code-only pieces.
- Inventory names the target Python modules that will own each control-plane concern.
- The document explicitly keeps `agent-loop/src/runQueue.js` and `agent-loop/src/loopEngine.js` as worker-owned for this wave.
