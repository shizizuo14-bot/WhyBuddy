# SlideRule AgentLoop 112.07: diagnostics panel

## Execution status
- Status: pending
- Goal: rebuild the Diagnostics tab to match reference image 4 with repo/queue/key status, config JSON cards, run state, and warning categories.
- Required gate: `slideruleAgentLoopSettingDiagnosticsPanel112Gates`

## Reference images
- docs/assets/SlideRuleSetting/ChatGPT Image 2026?6?25? 03_17_06 (1).png
- docs/assets/SlideRuleSetting/ChatGPT Image 2026?6?25? 03_17_06 (2).png
- docs/assets/SlideRuleSetting/ChatGPT Image 2026?6?25? 03_17_06 (3).png
- docs/assets/SlideRuleSetting/ChatGPT Image 2026?6?25? 03_17_06 (4).png
- docs/assets/SlideRuleSetting/ChatGPT Image 2026?6?25? 03_17_06 (5).png

## Context
Diagnostics should be read-only and trust-building. It should make it obvious what data source the UI is using and whether provider/key/run state is healthy.

## Allowed files
- `client/src/pages/agent-loop/AgentLoopPage.tsx`
- `client/src/pages/agent-loop/AgentLoopPage.test.tsx`
- `client/src/pages/agent-loop/dashboard/DashboardApp.tsx`
- `client/src/pages/agent-loop/dashboard/dashboard.css`
- `client/src/pages/agent-loop/dashboard/agentLoopApi.ts`
- `client/src/pages/agent-loop/dashboard/dashboardTypes.ts`
- `slide-rule-python/services/agent_loop_runs.py`
- `slide-rule-python/tests/test_agent_loop_queue_overview.py`
- `agent-loop/tasks/sliderule-agentloop-setting-diagnostics-panel-112.md`
- `This task file`

## Do not
- Do not reintroduce a second global sidebar inside /agent-loop when the page is already mounted as a standalone route.
- Do not store, echo, or snapshot raw LLM keys. Use configured/unset status only.
- Do not fake green success for unsupported backend capabilities; show an honest unsupported/read-only state.
- Do not replace the existing AntD stack with a CDN or another UI framework.
- Do not remove existing queue overview/detail/run control behavior while changing settings UI.

## Acceptance criteria
- Add or update a test named `agentloop setting diagnostics 112 renders redacted runtime evidence`.
- Diagnostics tab shows Repo root, Queue path, Key status, Effective config, Config sources, Last run state, and Warnings sections.
- Warnings are categorized with tags such as ready, skipped, failed, unknown, or unsupported.
- All JSON/code previews use the shared code block styling with copy controls and redaction.
- If diagnostics backend is unsupported, the tab shows an honest read-only unsupported state instead of fake sample success.

## Suggested implementation notes
- Prefer AntD primitives already used in `client/src/pages/agent-loop/dashboard/DashboardApp.tsx`: Card, Tabs, Form, Input, Select, Switch, Tag, Button, Descriptions, Table, Alert, Modal, Space, Row/Col.
- Keep the visual language close to `docs/assets/SlideRuleSetting`: white page, pale blue active states, compact summary cards, one clean content card per tab, and restrained borders.
- Use TDD: add or update the named test before production changes, verify it fails for the missing behavior, then implement.
- Keep Chinese visible copy readable and run the mojibake checker on touched AgentLoop files.
