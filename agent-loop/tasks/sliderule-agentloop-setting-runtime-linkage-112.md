# SlideRule AgentLoop 112.11: settings runtime linkage

## Execution status
- Status: pending
- Goal: wire product settings more completely into AgentLoop task generation and queue execution surfaces where the backend already supports it.
- Required gate: `slideruleAgentLoopSettingRuntimeLinkage112Gates`

## Reference images
- docs/assets/SlideRuleSetting/ChatGPT Image 2026?6?25? 03_17_06 (1).png
- docs/assets/SlideRuleSetting/ChatGPT Image 2026?6?25? 03_17_06 (2).png
- docs/assets/SlideRuleSetting/ChatGPT Image 2026?6?25? 03_17_06 (3).png
- docs/assets/SlideRuleSetting/ChatGPT Image 2026?6?25? 03_17_06 (4).png
- docs/assets/SlideRuleSetting/ChatGPT Image 2026?6?25? 03_17_06 (5).png

## Context
After UI polish, settings should not be decorative. This task verifies that fix/review agents, turns/retries, queue path, worktree scope, profile, provider health, and queue defaults influence displayed and executed behavior where contracts exist.

## Allowed files
- `client/src/pages/agent-loop/AgentLoopPage.tsx`
- `client/src/pages/agent-loop/AgentLoopPage.test.tsx`
- `client/src/pages/agent-loop/dashboard/DashboardApp.tsx`
- `client/src/pages/agent-loop/dashboard/dashboard.css`
- `client/src/pages/agent-loop/dashboard/agentLoopApi.ts`
- `client/src/pages/agent-loop/dashboard/dashboardTypes.ts`
- `slide-rule-python/routes/agent_loop.py`
- `slide-rule-python/services/agent_loop_settings.py`
- `slide-rule-python/services/agent_loop_runs.py`
- `slide-rule-python/tests/test_agent_loop_settings_runtime.py`
- `agent-loop/tasks/sliderule-agentloop-setting-runtime-linkage-112.md`
- `This task file`

## Do not
- Do not reintroduce a second global sidebar inside /agent-loop when the page is already mounted as a standalone route.
- Do not store, echo, or snapshot raw LLM keys. Use configured/unset status only.
- Do not fake green success for unsupported backend capabilities; show an honest unsupported/read-only state.
- Do not replace the existing AntD stack with a CDN or another UI framework.
- Do not remove existing queue overview/detail/run control behavior while changing settings UI.

## Acceptance criteria
- Add or update a test named `agentloop setting runtime linkage 112 applies nonsecret settings to run controls`.
- Overview/detail labels and run controls reflect the active fix/review agents and active profile from settings.
- Queue run/task run payloads include supported non-secret runtime options or intentionally document why the backend owns them.
- Provider health/test buttons use real `/provider-health` response shape where available.
- No settings linkage path transmits raw secret key values.

## Suggested implementation notes
- Prefer AntD primitives already used in `client/src/pages/agent-loop/dashboard/DashboardApp.tsx`: Card, Tabs, Form, Input, Select, Switch, Tag, Button, Descriptions, Table, Alert, Modal, Space, Row/Col.
- Keep the visual language close to `docs/assets/SlideRuleSetting`: white page, pale blue active states, compact summary cards, one clean content card per tab, and restrained borders.
- Use TDD: add or update the named test before production changes, verify it fails for the missing behavior, then implement.
- Keep Chinese visible copy readable and run the mojibake checker on touched AgentLoop files.
