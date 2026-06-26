# SlideRule AgentLoop 112.09: redacted import export

## Execution status
- Status: pending
- Goal: componentize the redacted settings import/export area and make it consistent across the settings center.
- Required gate: `slideruleAgentLoopSettingImportExportRedacted112Gates`

## Reference images
- docs/assets/SlideRuleSetting/ChatGPT Image 2026?6?25? 03_17_06 (1).png
- docs/assets/SlideRuleSetting/ChatGPT Image 2026?6?25? 03_17_06 (2).png
- docs/assets/SlideRuleSetting/ChatGPT Image 2026?6?25? 03_17_06 (3).png
- docs/assets/SlideRuleSetting/ChatGPT Image 2026?6?25? 03_17_06 (4).png
- docs/assets/SlideRuleSetting/ChatGPT Image 2026?6?25? 03_17_06 (5).png

## Context
Reference images show the import/export footer as a shared setting center affordance. The current implementation is embedded inside SettingsView and can become duplicated as panels evolve.

## Allowed files
- `client/src/pages/agent-loop/AgentLoopPage.tsx`
- `client/src/pages/agent-loop/AgentLoopPage.test.tsx`
- `client/src/pages/agent-loop/dashboard/DashboardApp.tsx`
- `client/src/pages/agent-loop/dashboard/dashboard.css`
- `client/src/pages/agent-loop/dashboard/agentLoopApi.ts`
- `client/src/pages/agent-loop/dashboard/dashboardTypes.ts`
- `agent-loop/tasks/sliderule-agentloop-setting-import-export-redacted-112.md`
- `This task file`

## Do not
- Do not reintroduce a second global sidebar inside /agent-loop when the page is already mounted as a standalone route.
- Do not store, echo, or snapshot raw LLM keys. Use configured/unset status only.
- Do not fake green success for unsupported backend capabilities; show an honest unsupported/read-only state.
- Do not replace the existing AntD stack with a CDN or another UI framework.
- Do not remove existing queue overview/detail/run control behavior while changing settings UI.

## Acceptance criteria
- Add or update a test named `agentloop setting import export 112 exports redacted settings only`.
- Create or extract a reusable redacted import/export component within the AgentLoop dashboard code.
- Exported JSON includes activeProfile, non-sensitive settings, and configured/unset key status only.
- Import validates JSON and routes through existing importSettings handling without sending raw secret values.
- The footer matches the reference image spacing: title, helper copy, two action buttons, and concise safety note.

## Suggested implementation notes
- Prefer AntD primitives already used in `client/src/pages/agent-loop/dashboard/DashboardApp.tsx`: Card, Tabs, Form, Input, Select, Switch, Tag, Button, Descriptions, Table, Alert, Modal, Space, Row/Col.
- Keep the visual language close to `docs/assets/SlideRuleSetting`: white page, pale blue active states, compact summary cards, one clean content card per tab, and restrained borders.
- Use TDD: add or update the named test before production changes, verify it fails for the missing behavior, then implement.
- Keep Chinese visible copy readable and run the mojibake checker on touched AgentLoop files.
