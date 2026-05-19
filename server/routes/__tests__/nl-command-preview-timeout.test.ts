/**
 * autopilot-streaming-experience integration-gap-2026-05-16 P0#5 回归测试。
 *
 * 该测试覆盖以下事实（详见
 * `.kiro/specs/autopilot-streaming-experience/integration-gap-2026-05-16.md`
 * 「C. LLM 调用没有兜底超时」一节）：
 *
 * - `server/routes/nl-command.ts` `generatePreviewResponse(...)` 在调用
 *   `callLLMJson(...)` 时必须显式传 `timeoutMs` 与 `retryAttempts`。
 * - `timeoutMs` 默认值为 `30000`（30 秒），可由环境变量
 *   `NL_COMMAND_PREVIEW_LLM_TIMEOUT_MS` 覆盖。
 * - `retryAttempts: 1` 用于关闭底层重试，避免与 `defaultPreviewClarificationQuestions`
 *   的“judge -> questions/repair -> repair”三段重试叠加放大壁钟时间。
 * - `generatePreviewResponse` 函数体仍然存在；JSDoc 引用了 spec 名与
 *   integration-gap 报告文件名，方便后续追溯。
 *
 * 实现策略（与本仓库现有 React hook / 节点 adapter 测试保持一致）：
 *
 *   本仓库未集成 `@testing-library/react`，亦不引入额外的 mocking 框架。
 *   既有 React hook 测试如
 *   `client/src/pages/autopilot/right-rail/hooks/__tests__/use-auto-advance.timeout.test.ts`
 *   采用源码层正则断言锁定关键事实。这里同样采用源码层正则：
 *
 *   1. 读取 `server/routes/nl-command.ts` 文件内容；
 *   2. 用 `String.prototype.match` 提取 `async function generatePreviewResponse`
 *      的函数体；
 *   3. 在函数体内断言 `timeoutMs: Number(process.env.NL_COMMAND_PREVIEW_LLM_TIMEOUT_MS || 30000)`
 *      与 `retryAttempts: 1` 的存在；
 *   4. 在文件全局断言 `async function generatePreviewResponse` 仍未被改名或删除；
 *   5. 在文件全局断言 JSDoc 引用了 spec 名 `autopilot-streaming-experience`
 *      与 integration-gap 报告文件名 `integration-gap-2026-05-16`。
 *
 *   这种策略的取舍与其它源码层契约测试一致：在不修改 `agent-reasoning-bridge.ts` /
 *   `callback-receiver.ts` / `lite-agent-runtime.ts` / `llm-call.ts`、不扩张 TS
 *   基线、不破坏既有 5140+ 测试的前提下，锁定 P0#5 的最小回归契约。
 */

import path from "node:path";
import fs from "node:fs/promises";

import { describe, expect, it } from "vitest";

const NL_COMMAND_SOURCE_PATH = path.resolve(
  __dirname,
  "../nl-command.ts",
);

async function loadSource(): Promise<string> {
  return fs.readFile(NL_COMMAND_SOURCE_PATH, "utf8");
}

/**
 * 提取 `async function generatePreviewResponse(...)` 的函数体。
 *
 * 使用最小可运行的“括号匹配 + 起止边界”策略：从函数声明起，找到第一个左大括号，
 * 然后向后扫描配对的右大括号，得到函数体字符串。这样即便函数体里出现嵌套
 * 对象字面量，也能稳定拿到完整函数体而不会被中间的 `}` 提前截断。
 */
function extractGeneratePreviewResponseBody(source: string): string {
  const declarationMatch = source.match(
    /async\s+function\s+generatePreviewResponse\s*\([\s\S]*?\)\s*:\s*Promise<[^>]+>\s*\{/,
  );
  if (!declarationMatch || declarationMatch.index === undefined) {
    throw new Error(
      "Could not locate `async function generatePreviewResponse(...)` in nl-command.ts",
    );
  }

  const startIndex =
    declarationMatch.index + declarationMatch[0].length;
  let depth = 1;
  let cursor = startIndex;

  while (cursor < source.length && depth > 0) {
    const ch = source[cursor];
    if (ch === "{") {
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(startIndex, cursor);
      }
    }
    cursor += 1;
  }

  throw new Error(
    "Failed to find matching closing brace for generatePreviewResponse body",
  );
}

describe("nl-command.ts generatePreviewResponse timeout contract (P0#5)", () => {
  it("still exposes `async function generatePreviewResponse`", async () => {
    const source = await loadSource();

    expect(source).toMatch(
      /async\s+function\s+generatePreviewResponse\s*\(/,
    );
  });

  it("passes the 30s default `timeoutMs` (overridable via NL_COMMAND_PREVIEW_LLM_TIMEOUT_MS)", async () => {
    const source = await loadSource();
    const body = extractGeneratePreviewResponseBody(source);

    // 必须显式传 timeoutMs，并且默认值 30000 与 env 覆盖路径都不能被悄悄改写。
    expect(body).toMatch(
      /timeoutMs:\s*Number\(\s*process\.env\.NL_COMMAND_PREVIEW_LLM_TIMEOUT_MS\s*\|\|\s*30000\s*\)/,
    );
  });

  it("disables low-level retries by passing `retryAttempts: 1`", async () => {
    const source = await loadSource();
    const body = extractGeneratePreviewResponseBody(source);

    // 上层 defaultPreviewClarificationQuestions 已经做了三段重试，底层重试应被关闭。
    expect(body).toMatch(/retryAttempts:\s*1/);
  });

  it("documents the spec and integration-gap references in JSDoc above generatePreviewResponse", async () => {
    const source = await loadSource();

    // 找到 generatePreviewResponse 声明所在行，向上回溯到最近的 JSDoc 起点 `/**`。
    const declarationIndex = source.search(
      /async\s+function\s+generatePreviewResponse\s*\(/,
    );
    expect(declarationIndex).toBeGreaterThan(-1);

    const docStart = source.lastIndexOf("/**", declarationIndex);
    const docEnd = source.indexOf("*/", docStart);
    expect(docStart).toBeGreaterThan(-1);
    expect(docEnd).toBeGreaterThan(docStart);

    const jsdoc = source.slice(docStart, docEnd + 2);

    // JSDoc 必须同时引用 spec 名与 integration-gap 报告文件名，方便后续追溯。
    expect(jsdoc).toContain("autopilot-streaming-experience");
    expect(jsdoc).toContain("integration-gap-2026-05-16");
  });
});
