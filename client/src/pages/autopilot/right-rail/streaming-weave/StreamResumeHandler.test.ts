/**
 * StreamResumeHandler 单元测试
 *
 * 验证流恢复处理器的核心行为：
 * - 无重叠时返回全部新 token
 * - 有重叠时过滤重复 token
 * - 空输入边界情况
 */

import { describe, expect, it } from "vitest";

import { StreamResumeHandler } from "./StreamResumeHandler";

describe("StreamResumeHandler", () => {
  it("无已有内容时返回全部新 token", () => {
    const handler = new StreamResumeHandler();
    const result = handler.handleResume(["hello", " world"], "");

    expect(result).toEqual(["hello", " world"]);
  });

  it("无新 token 时返回空数组", () => {
    const handler = new StreamResumeHandler();
    const result = handler.handleResume([], "existing content");

    expect(result).toEqual([]);
  });

  it("新 token 与已有内容尾部完全重叠时过滤重复", () => {
    const handler = new StreamResumeHandler();
    // 已有内容以 "world" 结尾
    const existing = "hello world";
    // 恢复后收到的 token 前缀与尾部重叠
    const newTokens = ["world", " again"];

    const result = handler.handleResume(newTokens, existing);

    // "world" 与尾部重叠，应被过滤
    expect(result).toEqual([" again"]);
  });

  it("新 token 无重叠时返回全部", () => {
    const handler = new StreamResumeHandler();
    const existing = "hello world";
    const newTokens = ["foo", "bar"];

    const result = handler.handleResume(newTokens, existing);

    expect(result).toEqual(["foo", "bar"]);
  });

  it("多个 token 拼接后与尾部重叠时过滤全部重复", () => {
    const handler = new StreamResumeHandler();
    const existing = "the quick brown fox";
    // 恢复后收到 "brown" + " fox" 与尾部重叠
    const newTokens = ["brown", " fox", " jumps"];

    const result = handler.handleResume(newTokens, existing);

    expect(result).toEqual([" jumps"]);
  });

  it("单字符 token 重叠检测", () => {
    const handler = new StreamResumeHandler();
    const existing = "abc";
    const newTokens = ["c", "d", "e"];

    const result = handler.handleResume(newTokens, existing);

    // "c" 与尾部重叠
    expect(result).toEqual(["d", "e"]);
  });

  it("尊重 maxTailCheckLength 配置", () => {
    // 设置很短的尾部检查长度
    const handler = new StreamResumeHandler(5);
    const existing = "a".repeat(100) + "xyz";
    const newTokens = ["xyz", "new"];

    const result = handler.handleResume(newTokens, existing);

    // 尾部 5 字符是 "aaxyz"，"xyz" 存在于其中
    expect(result).toEqual(["new"]);
  });
});
