/**
 * `autopilot-role-autonomous-agent` spec Task 11.2：Trace 凭证脱敏单测。
 *
 * 验证 sanitizeTraceEntry / sanitizeTraceEntries 能正确移除已知凭证模式
 * （API key / Bearer token / email / GitHub PAT / password 等），
 * 同时保持非敏感字段不变。
 *
 * 禁止 PBT：example-based only。
 */

import { describe, expect, it } from "vitest";

import type { AgentTraceEntry } from "../../../../shared/blueprint/agent-state.js";

import { sanitizeTraceEntry, sanitizeTraceEntries } from "./trace-sanitizer.js";

function makeEntry(overrides: Partial<AgentTraceEntry> = {}): AgentTraceEntry {
  return {
    iteration: 1,
    phase: "observing",
    timestamp: "2026-06-01T00:00:00.000Z",
    tokensUsed: 100,
    ...overrides,
  };
}

describe("sanitizeTraceEntry", () => {
  it("脱敏 thought 中的 OpenAI API key（sk-... 格式）", () => {
    const apiKey = "sk-ABCDEFGHIJKLMNOP1234567890";
    const entry = makeEntry({ thought: `using key ${apiKey} to call LLM` });
    const result = sanitizeTraceEntry(entry);
    expect(result.thought).not.toContain(apiKey);
    expect(result.thought).toContain("[redacted-api-key]");
  });

  it("递归脱敏 action.params 中嵌套的 Bearer token", () => {
    const entry = makeEntry({
      action: {
        toolId: "mcp.github",
        params: {
          headers: { authorization: "Bearer sk-XYZXYZXYZXYZXYZXYZ1234567890" },
        },
      },
    });
    const result = sanitizeTraceEntry(entry);
    const headers = (result.action?.params as Record<string, unknown>)
      .headers as Record<string, unknown>;
    expect(headers.authorization).not.toContain("sk-");
  });

  it("脱敏 observation.result 字符串中的邮箱", () => {
    const entry = makeEntry({
      observation: {
        toolId: "skill.notify",
        result: "sent to alice@example.com successfully",
        durationMs: 50,
      },
    });
    const result = sanitizeTraceEntry(entry);
    expect(result.observation?.result).not.toContain("alice@example.com");
    expect(result.observation?.result as string).toContain("[redacted-email]");
  });

  it("脱敏 observation.result 字符串中的 password=xxx 模式", () => {
    const entry = makeEntry({
      observation: {
        toolId: "skill.db",
        result: "connection string: password=super-secret-123;host=localhost",
        durationMs: 10,
      },
    });
    const result = sanitizeTraceEntry(entry);
    // keyword 匹配 "password=<value>" → 脱敏为 "password: [redacted]"
    expect(result.observation?.result as string).not.toContain("super-secret-123");
  });

  it("脱敏 error 中的 GitHub PAT", () => {
    const pat = "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const entry = makeEntry({ error: `auth failed with token ${pat}` });
    const result = sanitizeTraceEntry(entry);
    expect(result.error).not.toContain(pat);
    expect(result.error).toContain("[redacted-github-token]");
  });

  it("非敏感字符串保持不变", () => {
    const entry = makeEntry({
      thought: "hello world, analyzing code structure",
      error: undefined,
    });
    const result = sanitizeTraceEntry(entry);
    expect(result.thought).toBe("hello world, analyzing code structure");
    expect(result.iteration).toBe(1);
    expect(result.phase).toBe("observing");
    expect(result.timestamp).toBe("2026-06-01T00:00:00.000Z");
    expect(result.tokensUsed).toBe(100);
  });
});

describe("sanitizeTraceEntries", () => {
  it("对空数组返回空数组", () => {
    expect(sanitizeTraceEntries([])).toEqual([]);
  });

  it("对多条 entry 逐条脱敏", () => {
    const apiKey = "sk-TESTKEY12345678901234567890";
    const entries: AgentTraceEntry[] = [
      makeEntry({ thought: `key=${apiKey}` }),
      makeEntry({ thought: "safe text" }),
    ];
    const results = sanitizeTraceEntries(entries);
    expect(results).toHaveLength(2);
    expect(results[0]?.thought).not.toContain(apiKey);
    expect(results[1]?.thought).toBe("safe text");
  });
});
