import { describe, expect, it, afterEach } from "vitest";

import {
  createDefaultSpecTreeLlmPolicy,
  applySpecTreeRedaction,
} from "./policy.js";

/**
 * `policy.ts` 的 co-located 单测。
 *
 * 覆盖：
 * 1. createDefaultSpecTreeLlmPolicy() 默认超时值
 * 2. 环境变量 BLUEPRINT_SPEC_TREE_LLM_TIMEOUT_MS 合法覆盖
 * 3. 非法环境变量值回退到默认值
 * 4. applySpecTreeRedaction 对 API key 的脱敏
 * 5. applySpecTreeRedaction 对 email 的脱敏
 * 6. ReDoS 哨兵：大字符串性能保证
 *
 * 所有断言都是 example-based，不声称是 PBT。
 *
 * Requirements: 5.1, 9.8
 */

const ENV_KEY = "BLUEPRINT_SPEC_TREE_LLM_TIMEOUT_MS";

describe("createDefaultSpecTreeLlmPolicy", () => {
  afterEach(() => {
    delete process.env[ENV_KEY];
  });

  it("默认 maxInvocationTimeoutMs === 30_000", () => {
    const policy = createDefaultSpecTreeLlmPolicy();
    expect(policy.maxInvocationTimeoutMs).toBe(30_000);
  });

  it("环境变量 '5000' 被读取后 maxInvocationTimeoutMs === 5000", () => {
    process.env[ENV_KEY] = "5000";
    const policy = createDefaultSpecTreeLlmPolicy();
    expect(policy.maxInvocationTimeoutMs).toBe(5_000);
  });

  it.each(["abc", "-1", "99999", "0"])(
    "非法环境变量值 '%s' 回退到 30_000",
    (value) => {
      process.env[ENV_KEY] = value;
      const policy = createDefaultSpecTreeLlmPolicy();
      expect(policy.maxInvocationTimeoutMs).toBe(30_000);
    },
  );
});

describe("applySpecTreeRedaction", () => {
  it("脱敏 API key（sk-... 格式）", () => {
    const policy = createDefaultSpecTreeLlmPolicy();
    const input = "sk-ABCDEFGHIJKLMNOP1234567890";
    const result = applySpecTreeRedaction(input, policy);
    expect(result).not.toContain("sk-ABCDEFGHIJKLMNOP1234567890");
    expect(result).toContain("[redacted");
  });

  it("脱敏 email 地址", () => {
    const policy = createDefaultSpecTreeLlmPolicy();
    const input = "contact alice@example.com";
    const result = applySpecTreeRedaction(input, policy);
    expect(result).not.toContain("alice@example.com");
    expect(result).toContain("[redacted");
  });

  it("ReDoS 哨兵：5MB 字符串在 200ms 内完成", () => {
    const policy = createDefaultSpecTreeLlmPolicy();
    const largeInput = "a".repeat(5_000_000);
    const start = performance.now();
    applySpecTreeRedaction(largeInput, policy);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(200);
  });
});
