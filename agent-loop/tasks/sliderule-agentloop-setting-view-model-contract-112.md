# SlideRule AgentLoop 112.02: setting view model contract

## Execution status
- Status: pending
- Goal: create a typed settings view model adapter that normalizes Python settings, queue defaults, diagnostics, profiles, and provider health for the UI.
- Required gate: `slideruleAgentLoopSettingViewModelContract112Gates`

## Reference images
- docs/assets/SlideRuleSetting/ChatGPT Image 2026?6?25? 03_17_06 (1).png
- docs/assets/SlideRuleSetting/ChatGPT Image 2026?6?25? 03_17_06 (2).png
- docs/assets/SlideRuleSetting/ChatGPT Image 2026?6?25? 03_17_06 (3).png
- docs/assets/SlideRuleSetting/ChatGPT Image 2026?6?25? 03_17_06 (4).png
- docs/assets/SlideRuleSetting/ChatGPT Image 2026?6?25? 03_17_06 (5).png

## Context
The visual refactor should not keep spreading raw backend shapes through DashboardApp.tsx. Build a stable typed adapter so the panel tasks can focus on presentation and safety semantics.

## Allowed files
- `client/src/pages/agent-loop/AgentLoopPage.tsx`
- `client/src/pages/agent-loop/AgentLoopPage.test.tsx`
- `client/src/pages/agent-loop/dashboard/DashboardApp.tsx`
- `client/src/pages/agent-loop/dashboard/dashboard.css`
- `client/src/pages/agent-loop/dashboard/agentLoopApi.ts`
- `client/src/pages/agent-loop/dashboard/dashboardTypes.ts`
- `slide-rule-python/routes/agent_loop.py`
- `slide-rule-python/services/agent_loop_settings.py`
- `slide-rule-python/tests/test_agent_loop_settings_runtime.py`
- `agent-loop/tasks/sliderule-agentloop-setting-view-model-contract-112.md`
- `This task file`

## Do not
- Do not reintroduce a second global sidebar inside /agent-loop when the page is already mounted as a standalone route.
- Do not store, echo, or snapshot raw LLM keys. Use configured/unset status only.
- Do not fake green success for unsupported backend capabilities; show an honest unsupported/read-only state.
- Do not replace the existing AntD stack with a CDN or another UI framework.
- Do not remove existing queue overview/detail/run control behavior while changing settings UI.

## Acceptance criteria
- Add a test named `agentloop setting view model 112 normalizes settings without leaking secrets`.
- Introduce a typed view model or adapter for activeProfile, fixAgent, reviewAgent, queuePath, worktreeScope, provider key status, queue defaults, diagnostics, and profiles.
- Raw secret fields are stripped or ignored before data reaches renderable UI state.
- Existing fetchSettings/saveSettings tests remain green and backward compatible.

## Suggested implementation notes
- Prefer AntD primitives already used in `client/src/pages/agent-loop/dashboard/DashboardApp.tsx`: Card, Tabs, Form, Input, Select, Switch, Tag, Button, Descriptions, Table, Alert, Modal, Space, Row/Col.
- Keep the visual language close to `docs/assets/SlideRuleSetting`: white page, pale blue active states, compact summary cards, one clean content card per tab, and restrained borders.
- Use TDD: add or update the named test before production changes, verify it fails for the missing behavior, then implement.
- Keep Chinese visible copy readable and run the mojibake checker on touched AgentLoop files.
