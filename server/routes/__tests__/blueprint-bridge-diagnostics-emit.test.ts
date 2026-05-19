/**
 * autopilot-streaming-experience integration-gap-2026-05-16 P0#3 / P0#4 回归测试。
 *
 * 该测试覆盖以下事实（详见
 * `.kiro/specs/autopilot-streaming-experience/integration-gap-2026-05-16.md`
 * 「A. 主流程未接通：声明的能力都没人调」一节中关于 `role` / `aigcNode` 桥
 * `totalInvocations=0` 的部分）：
 *
 * - `server/routes/blueprint.ts` 的 `createGenerationJob(...)` 必须在
 *   `options.store.save(job)` 之后，把 `role-system-architecture`(P0#3) 与
 *   `aigc-spec-node`(P0#4) 两条桥对应的 `capability.invoked` /
 *   `capability.completed` 事件通过 `ctx.eventBus.emit(...)` 广播一次，
 *   触发 `server/routes/blueprint/runtime-enablement/subscriber.ts` 的
 *   `attachDiagnosticsSubscriber` 执行 `store.recordBridgeInvocation(...)`，
 *   让 `/api/blueprint/diagnostics` 中两条桥的 `totalInvocations` 不再停在 0。
 * - 必须把这两个 capability 的事件从“本地直写 job.events”路径中剥离，避免
 *   总线的 `persistToJobStore` 与初次 `options.store.save(job)` 重复落盘
 *   同一条事件。
 * - 不引入新的 `BlueprintEventName`；事件类型仅复用既有
 *   `BlueprintEventName.CapabilityInvoked` / `BlueprintEventName.CapabilityCompleted`，
 *   两者都属 `BlueprintGenerationEventType` 联合类型的成员。
 * - `createGenerationJob` 的代码注释中必须引用 spec 名 / integration-gap 报告
 *   文件名以及 `P0#3` / `P0#4` 标记，方便后续追溯。
 *
 * 实现策略（与同目录下 `nl-command-preview-timeout.test.ts` 保持一致）：
 *
 *   本仓库未集成 `@testing-library/react`，亦不引入额外的 mocking 框架。
 *   既有 React hook / route 契约测试都采用源码层正则断言锁定关键事实。
 *   这里同样采用源码层正则：
 *
 *   1. 读取 `server/routes/blueprint.ts` 文件内容；
 *   2. 用 `String.prototype.match` + 括号匹配提取
 *      `export async function createGenerationJob` 的函数体；
 *   3. 在函数体内断言 `pendingBridgeDiagnosticsEvents`、`role-system-architecture`、
 *      `aigc-spec-node`、`ctx.eventBus.emit` 与 `BlueprintEventName.CapabilityInvoked`
 *      / `BlueprintEventName.CapabilityCompleted` 的存在；
 *   4. 在文件全局断言中文注释引用了 spec 名 `autopilot-streaming-experience`、
 *      integration-gap 报告文件名 `integration-gap-2026-05-16` 与 `P0#3` / `P0#4`
 *      两个标记；
 *   5. 通过 import `BlueprintEventName` 直接验证我们使用的字符串字面量
 *      `capability.invoked` / `capability.completed` 仍然属于 `BlueprintEventName`
 *      命名空间（即仍属 `BlueprintGenerationEventType` 联合类型成员）。
 *
 *   这种策略的取舍与其它源码层契约测试一致：在不修改 `agent-reasoning-bridge.ts` /
 *   `callback-receiver.ts` / `lite-agent-runtime.ts` / `llm-call.ts`、不修改
 *   `server/routes/blueprint/capability-bridge-*` / `agent-crew-stage-activation/`
 *   下既有桥模块、不修改 diagnostics store 与 subscriber、不扩张 TS 基线、
 *   不破坏既有 5140+ 测试的前提下，锁定 P0#3 / P0#4 的最小回归契约。
 */

import path from "node:path";
import fs from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { BlueprintEventName } from "../../../shared/blueprint/events.js";

const BLUEPRINT_SOURCE_PATH = path.resolve(__dirname, "../blueprint.ts");

async function loadSource(): Promise<string> {
  return fs.readFile(BLUEPRINT_SOURCE_PATH, "utf8");
}

/**
 * 提取 `export async function createGenerationJob(...)` 的函数体。
 *
 * 使用最小可运行的“括号匹配 + 起止边界”策略：从函数声明起，找到第一个左大括号，
 * 然后向后扫描配对的右大括号，得到函数体字符串。这样即便函数体里出现嵌套
 * 对象字面量 / 模板字符串 / 多层 if 块，也能稳定拿到完整函数体而不会被中间的
 * `}` 提前截断。
 */
function extractCreateGenerationJobBody(source: string): string {
  const declarationMatch = source.match(
    /export\s+async\s+function\s+createGenerationJob\s*\([\s\S]*?\)\s*:\s*Promise<[^>]+>\s*\{/,
  );
  if (!declarationMatch || declarationMatch.index === undefined) {
    throw new Error(
      "Could not locate `export async function createGenerationJob(...)` in blueprint.ts",
    );
  }
  const startIndex = declarationMatch.index + declarationMatch[0].length;
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
    "Failed to find matching closing brace for createGenerationJob body",
  );
}

describe("blueprint.ts createGenerationJob bridge diagnostics emit contract (P0#3 + P0#4)", () => {
  it("still exposes `export async function createGenerationJob`", async () => {
    const source = await loadSource();

    expect(source).toMatch(
      /export\s+async\s+function\s+createGenerationJob\s*\(/,
    );
  });

  it("collects `role-system-architecture` and `aigc-spec-node` capability events into a pending bridge diagnostics list", async () => {
    const source = await loadSource();
    const body = extractCreateGenerationJobBody(source);

    // 两条桥的 capabilityId 必须被显式列入剥离集合（顺序无关，但字面量必须出现）。
    expect(body).toMatch(/"role-system-architecture"/);
    expect(body).toMatch(/"aigc-spec-node"/);

    // 必须存在剥离后的 pending 列表（用于稍后 emit 到 eventBus）以及
    // 未被剥离的 inline 列表（用于直接 push 进本地 events 数组）。
    expect(body).toMatch(/pendingBridgeDiagnosticsEvents/);
    expect(body).toMatch(/inlineSandboxDerivationEvents/);
  });

  it("emits the pending bridge diagnostics events through `ctx.eventBus.emit`, not via direct `recordBridgeInvocation`", async () => {
    const source = await loadSource();
    const body = extractCreateGenerationJobBody(source);

    // 必须通过 ctx.eventBus.emit 触发 subscriber，不允许在 route handler 直接
    // 调用 recordBridgeInvocation 绕过订阅链路。
    expect(body).toMatch(/ctx\.eventBus\.emit\(\s*bridgeEvent\s*\)/);

    // 删除中文注释 + 行注释，再做一次"裸代码"层面的反向断言，避免被注释里
    // “不允许直接 recordBridgeInvocation(...)”这类说明文字误判。
    const codeWithoutComments = body
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .map(line => {
        const idx = line.indexOf("//");
        return idx >= 0 ? line.slice(0, idx) : line;
      })
      .join("\n");
    expect(codeWithoutComments).not.toMatch(/recordBridgeInvocation\s*\(/);
  });

  it("references existing `BlueprintEventName.CapabilityInvoked` / `BlueprintEventName.CapabilityCompleted` instead of new event names", async () => {
    const source = await loadSource();
    const body = extractCreateGenerationJobBody(source);

    // 用既有 BlueprintEventName 常量来识别两条桥的事件，禁止裸字符串
    // "capability.invoked" / "capability.completed" 这种引入新事件名的形式。
    expect(body).toMatch(/BlueprintEventName\.CapabilityInvoked/);
    expect(body).toMatch(/BlueprintEventName\.CapabilityCompleted/);
  });

  it("documents the spec, integration-gap report and P0#3 / P0#4 markers in surrounding comments", async () => {
    const source = await loadSource();
    const body = extractCreateGenerationJobBody(source);

    // 函数体内必须留下 spec 名、integration-gap 报告文件名与 P0#3 / P0#4 两个标记，
    // 方便后续 grep 排查。
    expect(body).toContain("autopilot-streaming-experience");
    expect(body).toContain("integration-gap-2026-05-16");
    expect(body).toContain("P0#3");
    expect(body).toContain("P0#4");
  });

  it("`capability.invoked` / `capability.completed` literals remain members of `BlueprintEventName` union", () => {
    // 这一条等价于 TS 编译期保证：BlueprintEventName 命名空间必须仍然包含
    // 两个常量，且其字面量值就是 subscriber 用来识别 role / aigcNode 桥的
    // 字符串。`BlueprintEventName as const satisfies Record<string,
    // BlueprintGenerationEventType>` 已经在 shared 侧把字面量收窄到
    // BlueprintGenerationEventType 联合类型，本测试在运行期再做一次冗余检查，
    // 避免后续 refactor 把这两个常量重命名 / 删除。
    expect(BlueprintEventName.CapabilityInvoked).toBe("capability.invoked");
    expect(BlueprintEventName.CapabilityCompleted).toBe(
      "capability.completed",
    );
  });
});
