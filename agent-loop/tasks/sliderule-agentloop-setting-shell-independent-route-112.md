# SlideRule AgentLoop 112.01: setting shell independent route

## Execution status
- Status: pending
- Goal: make the AgentLoop settings surface behave like a native standalone /agent-loop page instead of a VS Code style nested app shell.
- Required gate: `slideruleAgentLoopSettingShellIndependentRoute112Gates`

## Reference images
- docs/assets/SlideRuleSetting/ChatGPT Image 2026?6?25? 03_17_06 (1).png
- docs/assets/SlideRuleSetting/ChatGPT Image 2026?6?25? 03_17_06 (2).png
- docs/assets/SlideRuleSetting/ChatGPT Image 2026?6?25? 03_17_06 (3).png
- docs/assets/SlideRuleSetting/ChatGPT Image 2026?6?25? 03_17_06 (4).png
- docs/assets/SlideRuleSetting/ChatGPT Image 2026?6?25? 03_17_06 (5).png

## Context
The user wants a page like http://localhost:3000/autopilot: a first-class route. The current port still carries DashboardSidebar/Sider/Menu patterns from the VS Code webview and can create a double-menu impression in the main app. This task establishes the standalone route shell for the settings center before deeper panel polish.

## Allowed files
- `client/src/App.tsx`
- `client/src/pages/agent-loop/AgentLoopPage.tsx`
- `client/src/pages/agent-loop/AgentLoopPage.test.tsx`
- `client/src/pages/agent-loop/dashboard/DashboardApp.tsx`
- `client/src/pages/agent-loop/dashboard/dashboard.css`
- `client/src/pages/agent-loop/dashboard/agentLoopApi.ts`
- `client/src/pages/agent-loop/dashboard/dashboardTypes.ts`
- `agent-loop/tasks/sliderule-agentloop-setting-shell-independent-route-112.md`
- `This task file`

## Do not
- Do not reintroduce a second global sidebar inside /agent-loop when the page is already mounted as a standalone route.
- Do not store, echo, or snapshot raw LLM keys. Use configured/unset status only.
- Do not fake green success for unsupported backend capabilities; show an honest unsupported/read-only state.
- Do not replace the existing AntD stack with a CDN or another UI framework.
- Do not remove existing queue overview/detail/run control behavior while changing settings UI.

## Acceptance criteria
- Add or update a test named `agentloop setting shell 112 renders standalone route without duplicate sidebar`.
- The /AgentLoop and/or /agent-loop route renders the AgentLoop page without the main app sidebar offset and without an extra global sidebar that duplicates application navigation.
- The settings entry remains reachable from the AgentLoop page through a local top action, segmented control, or route state; workbench/detail behavior remains reachable.
- The page content area uses the full route width and does not rely on VS Code webview postMessage APIs.

## Suggested implementation notes
- Prefer AntD primitives already used in `client/src/pages/agent-loop/dashboard/DashboardApp.tsx`: Card, Tabs, Form, Input, Select, Switch, Tag, Button, Descriptions, Table, Alert, Modal, Space, Row/Col.
- Keep the visual language close to `docs/assets/SlideRuleSetting`: white page, pale blue active states, compact summary cards, one clean content card per tab, and restrained borders.
- Use TDD: add or update the named test before production changes, verify it fails for the missing behavior, then implement.
- Keep Chinese visible copy readable and run the mojibake checker on touched AgentLoop files.
