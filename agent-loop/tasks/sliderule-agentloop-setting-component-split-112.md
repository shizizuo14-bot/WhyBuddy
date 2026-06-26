# SlideRule AgentLoop 112.10: settings component split

## Execution status
- Status: pending
- Goal: split the settings center out of the oversized DashboardApp.tsx into focused components without changing behavior.
- Required gate: `slideruleAgentLoopSettingComponentSplit112Gates`

## Reference images
- docs/assets/SlideRuleSetting/ChatGPT Image 2026?6?25? 03_17_06 (1).png
- docs/assets/SlideRuleSetting/ChatGPT Image 2026?6?25? 03_17_06 (2).png
- docs/assets/SlideRuleSetting/ChatGPT Image 2026?6?25? 03_17_06 (3).png
- docs/assets/SlideRuleSetting/ChatGPT Image 2026?6?25? 03_17_06 (4).png
- docs/assets/SlideRuleSetting/ChatGPT Image 2026?6?25? 03_17_06 (5).png

## Context
DashboardApp.tsx is large and hard for future AgentLoop workers to modify safely. After the panels are stable, extract setting-specific components/types/helpers into focused files under the dashboard folder.

## Allowed files
- `client/src/pages/agent-loop/AgentLoopPage.tsx`
- `client/src/pages/agent-loop/AgentLoopPage.test.tsx`
- `client/src/pages/agent-loop/dashboard/DashboardApp.tsx`
- `client/src/pages/agent-loop/dashboard/dashboard.css`
- `client/src/pages/agent-loop/dashboard/agentLoopApi.ts`
- `client/src/pages/agent-loop/dashboard/dashboardTypes.ts`
- `client/src/pages/agent-loop/dashboard/settings/SettingsView.tsx`
- `client/src/pages/agent-loop/dashboard/settings/SettingsLayout.tsx`
- `client/src/pages/agent-loop/dashboard/settings/CliConfigPanel.tsx`
- `client/src/pages/agent-loop/dashboard/settings/LlmKeysPanel.tsx`
- `client/src/pages/agent-loop/dashboard/settings/QueueDefaultsPanel.tsx`
- `client/src/pages/agent-loop/dashboard/settings/DiagnosticsPanel.tsx`
- `client/src/pages/agent-loop/dashboard/settings/ProfilesPanel.tsx`
- `client/src/pages/agent-loop/dashboard/settings/RedactedImportExport.tsx`
- `client/src/pages/agent-loop/dashboard/settings/types.ts`
- `agent-loop/tasks/sliderule-agentloop-setting-component-split-112.md`
- `This task file`

## Do not
- Do not reintroduce a second global sidebar inside /agent-loop when the page is already mounted as a standalone route.
- Do not store, echo, or snapshot raw LLM keys. Use configured/unset status only.
- Do not fake green success for unsupported backend capabilities; show an honest unsupported/read-only state.
- Do not replace the existing AntD stack with a CDN or another UI framework.
- Do not remove existing queue overview/detail/run control behavior while changing settings UI.

## Acceptance criteria
- Add or update a test named `agentloop setting component split 112 preserves settings render contract`.
- Move settings-specific components/types into a dashboard/settings folder or similarly focused module boundary.
- DashboardApp.tsx keeps orchestration and overview/detail rendering, but no longer owns all settings panel implementation details.
- Imports remain local and tree-shakable; no circular imports are introduced.
- All existing tests remain green after extraction.

## Suggested implementation notes
- Prefer AntD primitives already used in `client/src/pages/agent-loop/dashboard/DashboardApp.tsx`: Card, Tabs, Form, Input, Select, Switch, Tag, Button, Descriptions, Table, Alert, Modal, Space, Row/Col.
- Keep the visual language close to `docs/assets/SlideRuleSetting`: white page, pale blue active states, compact summary cards, one clean content card per tab, and restrained borders.
- Use TDD: add or update the named test before production changes, verify it fails for the missing behavior, then implement.
- Keep Chinese visible copy readable and run the mojibake checker on touched AgentLoop files.
