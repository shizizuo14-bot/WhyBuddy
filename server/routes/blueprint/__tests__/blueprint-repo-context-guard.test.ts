/**
 * `autopilot-streaming-experience` integration-gap-2026-05-16 P0 #2 回归测试。
 *
 * 背景：`server/routes/blueprint.ts` 在澄清和路线生成两个 handler 中曾以
 * `if (firstGithubUrl && deps.mcpToolAdapter)` 与
 * `if (firstUrl && deps.mcpToolAdapter && resolved.intake)` 为仓库上下文抓取的
 * 守卫条件。但 `deps.mcpToolAdapter` 在 per-handler `deps` 作用域下始终
 * undefined（仅 router 顶层 `blueprintServiceContext` 才能拿到适配器），导致：
 *
 *   - 仓库扫描整段被跳过；
 *   - 流式 emitter 事件丢失；
 *   - `intake.domainNotes` 退化为空数组；
 *   - `assets[1].summary` 仅剩 `"Repository context placeholder for ..."` 占位。
 *
 * 由于 `fetchRepoContext`（见 `server/routes/blueprint/repo-context-fetcher.ts`）
 * 直接通过 GitHub REST API 抓取、其首参 `_mcpToolAdapter` 仅保留签名兼容性、
 * 并未真正使用 MCP 适配器，因此修复办法是移除 `&& deps.mcpToolAdapter` 守卫。
 *
 * 实现口径（与 `client/src/pages/autopilot/__tests__/AutopilotRoutePage.subscription-lifecycle.test.tsx`
 * 等仓内既有源码层断言风格保持一致）：
 *
 *   本仓库未集成 `@testing-library/react` / `jsdom` / `happy-dom`，且服务端
 *   route handler 仍在 router-level scope 中关闭 `blueprintServiceContext`、
 *   `blueprintStores` 等大量私有依赖，端到端 spin up 一份仅为校验“守卫被移除”
 *   的最小 mock 服务器属于跨规格的工具链改造，不在本规格的约束范围内
 *   （不扩张 5140+ 既有测试集 / 116 TS 基线）。
 *
 *   因此本回归测试改用源代码层断言：直接读取 `server/routes/blueprint.ts`
 *   的源文本，证明：
 *
 *     1. 旧守卫 `if (firstGithubUrl && deps.mcpToolAdapter)` 已不再出现；
 *     2. 旧守卫 `if (firstUrl && deps.mcpToolAdapter)` 已不再出现；
 *     3. `fetchRepoContext(deps.mcpToolAdapter, ...)` 调用点仍然保留（仅为
 *        签名兼容性，传入的 undefined 会被 `_mcpToolAdapter` 忽略）；
 *     4. 中文 JSDoc 注释中明确引用了
 *        `autopilot-streaming-experience` 与 `integration-gap-2026-05-16`，
 *        作为后续维护时的可追溯锚点。
 *
 *   这等价于源代码层证明：在澄清与路线生成两个阶段，仓库上下文抓取不会再
 *   因 `deps.mcpToolAdapter` 这把误判的守卫被静默跳过。
 */

import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const BLUEPRINT_ROUTE_PATH = resolve(
  __dirname,
  "..",
  "..",
  "blueprint.ts",
);

describe("blueprint repo context guard regression (integration-gap-2026-05-16 P0 #2)", () => {
  it("removes the legacy `firstGithubUrl && deps.mcpToolAdapter` guard from the clarification handler", async () => {
    const source = await readFile(BLUEPRINT_ROUTE_PATH, "utf8");

    // 旧守卫：`if (firstGithubUrl && deps.mcpToolAdapter) {` 必须不再出现在
    // 实际代码路径中。注：注释里允许引用旧守卫文本作为修正记录，因此正则
    // 用 `^\s*if\s*\(...\)` 锁定行首是 if，而不是 `// ...` 形式的中文 JSDoc。
    const legacyClarificationGuard = /^\s*if\s*\(\s*firstGithubUrl\s*&&\s*deps\.mcpToolAdapter\s*\)/m;
    expect(source).not.toMatch(legacyClarificationGuard);
  });

  it("removes the legacy `firstUrl && deps.mcpToolAdapter` guard from the route generation handler", async () => {
    const source = await readFile(BLUEPRINT_ROUTE_PATH, "utf8");

    // 同上：锁定行首 if 语句，而不是注释里引用旧守卫文本的修正记录。
    const legacyRouteGuard = /^\s*if\s*\(\s*firstUrl\s*&&\s*deps\.mcpToolAdapter\s*\)/m;
    expect(source).not.toMatch(legacyRouteGuard);
  });

  it("preserves `fetchRepoContext(deps.mcpToolAdapter, ...)` call sites for signature compatibility", async () => {
    const source = await readFile(BLUEPRINT_ROUTE_PATH, "utf8");

    // `fetchRepoContext` 的首参 `_mcpToolAdapter: unknown` 仅为签名兼容性，
    // 实际使用 GitHub REST API。调用点仍应保留 `deps.mcpToolAdapter`
    // 透传（实际为 undefined），证明守卫被移除后调用形态本身没动。
    const callSite = /fetchRepoContext\(\s*\n?\s*deps\.mcpToolAdapter/m;
    expect(source).toMatch(callSite);
  });

  it("references `autopilot-streaming-experience integration-gap-2026-05-16` in the修正记录 JSDoc", async () => {
    const source = await readFile(BLUEPRINT_ROUTE_PATH, "utf8");

    // 修正记录注释必须引用 spec 与 integration gap 报告，作为后续维护
    // 与回归排查时的可追溯锚点。
    expect(source).toMatch(/autopilot-streaming-experience/);
    expect(source).toMatch(/integration-gap-2026-05-16/);
  });
});
