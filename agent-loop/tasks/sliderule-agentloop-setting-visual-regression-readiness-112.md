# SlideRule AgentLoop 112.12: visual regression readiness

## Execution status
- Status: pending
- Goal: perform final readiness work for the product-grade settings center with tests, screenshot-oriented checks, and no-mojibake polish.
- Required gate: `slideruleAgentLoopSettingVisualRegressionReadiness112Gates`

## Reference images
- docs/assets/SlideRuleSetting/ChatGPT Image 2026?6?25? 03_17_06 (1).png
- docs/assets/SlideRuleSetting/ChatGPT Image 2026?6?25? 03_17_06 (2).png
- docs/assets/SlideRuleSetting/ChatGPT Image 2026?6?25? 03_17_06 (3).png
- docs/assets/SlideRuleSetting/ChatGPT Image 2026?6?25? 03_17_06 (4).png
- docs/assets/SlideRuleSetting/ChatGPT Image 2026?6?25? 03_17_06 (5).png

## Context
This is the closure task. It should validate the five reference-image tabs as a cohesive product page and clean up any copy/layout regressions left by earlier tasks.

## Allowed files
- `client/src/pages/agent-loop/AgentLoopPage.tsx`
- `client/src/pages/agent-loop/AgentLoopPage.test.tsx`
- `client/src/pages/agent-loop/dashboard/DashboardApp.tsx`
- `client/src/pages/agent-loop/dashboard/dashboard.css`
- `client/src/pages/agent-loop/dashboard/agentLoopApi.ts`
- `client/src/pages/agent-loop/dashboard/dashboardTypes.ts`
- `docs/assets/SlideRuleSetting/README.md`
- `agent-loop/tasks/sliderule-agentloop-setting-visual-regression-readiness-112.md`
- `This task file`

## Do not
- Do not reintroduce a second global sidebar inside /agent-loop when the page is already mounted as a standalone route.
- Do not store, echo, or snapshot raw LLM keys. Use configured/unset status only.
- Do not fake green success for unsupported backend capabilities; show an honest unsupported/read-only state.
- Do not replace the existing AntD stack with a CDN or another UI framework.
- Do not remove existing queue overview/detail/run control behavior while changing settings UI.

## Acceptance criteria
- Add or update a test named `agentloop setting visual readiness 112 covers five reference tabs`.
- Run or document a browser check for http://localhost:3000/agent-loop or /AgentLoop that visits CLI ??, LLM Keys, ?????, Diagnostics, and Profiles.
- The page has no duplicate global sidebar, no obvious mojibake in visible AgentLoop setting copy, and no raw secret values in markup/tests.
- Run `pnpm exec vitest run client/src/pages/agent-loop/AgentLoopPage.test.tsx --reporter=dot`, `pnpm exec tsc --noEmit --pretty false`, and `node agent-loop/src/check-mojibake.js` on touched AgentLoop files.
- If a live browser server is unavailable, record the exact limitation in the task file and keep automated tests green.

## Suggested implementation notes
- Prefer AntD primitives already used in `client/src/pages/agent-loop/dashboard/DashboardApp.tsx`: Card, Tabs, Form, Input, Select, Switch, Tag, Button, Descriptions, Table, Alert, Modal, Space, Row/Col.
- Keep the visual language close to `docs/assets/SlideRuleSetting`: white page, pale blue active states, compact summary cards, one clean content card per tab, and restrained borders.
- Use TDD: add or update the named test before production changes, verify it fails for the missing behavior, then implement.
- Keep Chinese visible copy readable and run the mojibake checker on touched AgentLoop files.

## Browser check record (added for review closure)
- Date: 2026-06-26
- Attempted browser check: `Invoke-WebRequest http://localhost:3000/agent-loop` (also tried /AgentLoop).
- Result: UNAVAILABLE. Exact limitation recorded: No live Vite dev server (pnpm dev / equivalent) was running in the isolated worker execution environment on Windows. Port 3000 did not respond (connection refused / timeout). Cannot perform interactive/manual browser visit to the tabs in this context.
- Proxy coverage for "visit CLI 配置, LLM Keys, 队列默认值, Diagnostics, and Profiles": automated SSR snapshot tests exercise the full settings view render contract.
  - Test `agentloop setting visual readiness 112 covers five reference tabs` (added per AC) asserts all five tab labels + summary cards + title + absence of duplicate sidebar + no raw secrets.
  - Related tests (`agentloop setting layout 112 renders summary cards and five tabs`, cli/queue/profiles/component etc.) also cover the tab contents.
- Visual regression readiness validated by:
  - No duplicate global sidebar (standalone /agent-loop route uses native-dashboard without Sider).
  - No obvious mojibake: Chinese labels (CLI 配置, 队列默认值, AgentLoop 设置中心, etc.) render cleanly.
  - No raw secret values in markup/tests (keys use "configured"/"未配置" status Tags only; secrets stripped by normalizeSettingsForUI).
  - Layout matches suggested: uses AntD Card/Tabs/Row/Col/Segmented from existing stack; summary cards + one content area per tab.
- Gate runs executed post-change (on touched files):
  - `pnpm exec vitest run client/src/pages/agent-loop/AgentLoopPage.test.tsx --reporter=dot` → 18 tests green (including the named visual readiness test).
  - `pnpm exec tsc --noEmit --pretty false` → clean.
  - `node agent-loop/src/check-mojibake.js ...` (the 7 allowed files) → "No mojibake findings."
- If reviewer has live server: start with `pnpm dev`, navigate to http://localhost:3000/agent-loop (or /AgentLoop), switch to 设置, verify the five tabs render matching the 5 reference PNGs (white bg, pale blue active, compact cards).
- No files outside allowed list were edited for this closure fix. The migration-queue.json changes in prior uncommitted diff are out of scope for this task and untouched here.
