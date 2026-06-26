# SlideRule AgentLoop 112.03: setting layout summary tabs

## Execution status
- Status: pending
- Goal: rebuild the settings center frame to match the five reference images: title, summary cards, horizontal tabs, and redacted import/export footer.
- Required gate: `slideruleAgentLoopSettingLayoutSummaryTabs112Gates`

## Reference images
- docs/assets/SlideRuleSetting/ChatGPT Image 2026?6?25? 03_17_06 (1).png
- docs/assets/SlideRuleSetting/ChatGPT Image 2026?6?25? 03_17_06 (2).png
- docs/assets/SlideRuleSetting/ChatGPT Image 2026?6?25? 03_17_06 (3).png
- docs/assets/SlideRuleSetting/ChatGPT Image 2026?6?25? 03_17_06 (4).png
- docs/assets/SlideRuleSetting/ChatGPT Image 2026?6?25? 03_17_06 (5).png

## Context
All five reference images share the same structure: breadcrumb/top controls, AgentLoop ???? title, three summary cards (active profile, review agent, fix agent), tab row, main card, and import/export footer. This task builds that shared layout only.

## Allowed files
- `client/src/pages/agent-loop/AgentLoopPage.tsx`
- `client/src/pages/agent-loop/AgentLoopPage.test.tsx`
- `client/src/pages/agent-loop/dashboard/DashboardApp.tsx`
- `client/src/pages/agent-loop/dashboard/dashboard.css`
- `client/src/pages/agent-loop/dashboard/agentLoopApi.ts`
- `client/src/pages/agent-loop/dashboard/dashboardTypes.ts`
- `agent-loop/tasks/sliderule-agentloop-setting-layout-summary-tabs-112.md`
- `This task file`

## Do not
- Do not reintroduce a second global sidebar inside /agent-loop when the page is already mounted as a standalone route.
- Do not store, echo, or snapshot raw LLM keys. Use configured/unset status only.
- Do not fake green success for unsupported backend capabilities; show an honest unsupported/read-only state.
- Do not replace the existing AntD stack with a CDN or another UI framework.
- Do not remove existing queue overview/detail/run control behavior while changing settings UI.

## Acceptance criteria
- Add or update a test named `agentloop setting layout 112 renders summary cards and five tabs`.
- Settings view shows summary cards for active Profile, Review Agent, and Fix Agent with AntD icons or icon-style badges.
- Tabs are exactly CLI ??, LLM Keys, ?????, Diagnostics, Profiles, in that order.
- Import/export redacted controls are visually consistent and present without duplicating logic in every tab body.
- Reference images under docs/assets/SlideRuleSetting are cited in comments or task notes only if needed; do not import them into production UI.

## Suggested implementation notes
- Prefer AntD primitives already used in `client/src/pages/agent-loop/dashboard/DashboardApp.tsx`: Card, Tabs, Form, Input, Select, Switch, Tag, Button, Descriptions, Table, Alert, Modal, Space, Row/Col.
- Keep the visual language close to `docs/assets/SlideRuleSetting`: white page, pale blue active states, compact summary cards, one clean content card per tab, and restrained borders.
- Use TDD: add or update the named test before production changes, verify it fails for the missing behavior, then implement.
- Keep Chinese visible copy readable and run the mojibake checker on touched AgentLoop files.
