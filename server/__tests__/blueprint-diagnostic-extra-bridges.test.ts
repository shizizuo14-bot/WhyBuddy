/**
 * autopilot-streaming-experience integration-gap-2026-05-16 P1 回归测试。
 *
 * 目的：对 `server/index.ts` 做 source-level regex 校验，确保启动期已经为
 * `roleAutonomousAgent` 与 `agentReasoningBridge` 两条 capability bridge 同步写入
 * `recordBridgeConfiguration(...)`，从而让 `/api/blueprint/diagnostics` 不再把
 * 它们报告为 `mode=unknown / enabledByConfig=false / dependencyReady=false`。
 *
 * 该测试只读取源文件文本：因为 `server/index.ts` 在 import 阶段会触发大量
 * side effect（dotenv 加载、socket 启动、blueprint context 初始化等），用源码
 * 文本断言能在不真正启动服务器的前提下守住"启动块里到底调用了哪些方法"。
 *
 * 不涉及：diagnostics-store 内部 BridgeId 列表、agent-reasoning-bridge.ts、
 * callback-receiver.ts、lite-agent-runtime.ts、llm-call.ts。
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, it, expect } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 解析仓库根。`server/__tests__/<this>.test.ts` 在 `repoRoot/server/__tests__/`
 * 下，向上回溯两级即可拿到 repoRoot；不依赖 process.cwd() 以避免被 vitest 调用方
 * 的工作目录影响。
 */
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const SERVER_INDEX_PATH = path.resolve(REPO_ROOT, "server", "index.ts");

const SERVER_INDEX_SOURCE = readFileSync(SERVER_INDEX_PATH, "utf-8");

describe("server/index.ts — autopilot-streaming-experience integration-gap-2026-05-16 P1", () => {
  it("includes the integration-gap spec marker above the new block", () => {
    // marker 与下方两条 recordBridgeConfiguration 调用必须出现在同一段连续代码里：
    // 出现 marker，紧接着出现 roleAutonomousAgent 调用。dotall + lazy 匹配。
    const markerThenRoleAutonomousAgent =
      /autopilot-streaming-experience\s+integration-gap-2026-05-16[\s\S]*?recordBridgeConfiguration\(\s*\n?\s*"roleAutonomousAgent"/;
    expect(SERVER_INDEX_SOURCE).toMatch(markerThenRoleAutonomousAgent);

    const markerThenAgentReasoningBridge =
      /autopilot-streaming-experience\s+integration-gap-2026-05-16[\s\S]*?recordBridgeConfiguration\(\s*\n?\s*"agentReasoningBridge"/;
    expect(SERVER_INDEX_SOURCE).toMatch(markerThenAgentReasoningBridge);
  });

  it("registers roleAutonomousAgent via recordBridgeConfiguration", () => {
    // 允许 `recordBridgeConfiguration(\n      "roleAutonomousAgent"` 这种格式化。
    expect(SERVER_INDEX_SOURCE).toMatch(
      /recordBridgeConfiguration\(\s*\n?\s*"roleAutonomousAgent"/,
    );
  });

  it("registers agentReasoningBridge via recordBridgeConfiguration", () => {
    expect(SERVER_INDEX_SOURCE).toMatch(
      /recordBridgeConfiguration\(\s*\n?\s*"agentReasoningBridge"/,
    );
  });

  it("derives roleAutonomousAgent's enabledByConfig from a process.env lookup", () => {
    // 这一段定位到 roleAutonomousAgent 调用所在的同一段代码里，确保 enabledByConfig
    // 由 `process.env.BLUEPRINT_ROLE_AUTONOMOUS_AGENT_ENABLED === "true"` 推导，
    // 而不是写死 true/false。匹配宽松到允许 `=== "true"` 与变量名之间的换行 / 空格。
    const roleAutonomousAgentBlock =
      /recordBridgeConfiguration\(\s*\n?\s*"roleAutonomousAgent"[\s\S]*?enabledByConfig:\s*roleAutonomousAgentEnabled[\s\S]*?\)/;
    expect(SERVER_INDEX_SOURCE).toMatch(roleAutonomousAgentBlock);

    expect(SERVER_INDEX_SOURCE).toMatch(
      /process\.env\.BLUEPRINT_ROLE_AUTONOMOUS_AGENT_ENABLED\s*===\s*"true"/,
    );
  });

  it("derives agentReasoningBridge's enabledByConfig from a process.env lookup", () => {
    const agentReasoningBridgeBlock =
      /recordBridgeConfiguration\(\s*\n?\s*"agentReasoningBridge"[\s\S]*?enabledByConfig:\s*agentReasoningBridgeEnabled[\s\S]*?\)/;
    expect(SERVER_INDEX_SOURCE).toMatch(agentReasoningBridgeBlock);

    expect(SERVER_INDEX_SOURCE).toMatch(
      /process\.env\.BLUEPRINT_AGENT_REASONING_STREAM_ENABLED\s*===\s*"true"/,
    );
  });
});
