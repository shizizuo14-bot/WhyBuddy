import { describe, it, expect } from "vitest";
import { ALL_V5_CAPABILITIES } from "../contracts.js";
import {
  buildActionTrace,
  buildProcessLabelContext,
  CAPABILITY_PROCESS_LABELS,
  getLiveAction,
  inferProcessContextFromExec,
} from "../capability-process-labels.js";

describe("CAPABILITY_PROCESS_LABELS (B1)", () => {
  it("covers every capability in ALL_V5_CAPABILITIES", () => {
    for (const id of ALL_V5_CAPABILITIES) {
      expect(CAPABILITY_PROCESS_LABELS[id], `missing label for ${id}`).toBeDefined();
      expect(CAPABILITY_PROCESS_LABELS[id].liveLabel).toBeTruthy();
    }
    expect(Object.keys(CAPABILITY_PROCESS_LABELS).length).toBe(ALL_V5_CAPABILITIES.length);
  });

  it("evidence.search tool trace distinguishes web-search-failed vs github-fetch-failed", () => {
    const base = buildProcessLabelContext("evidence.search", "做一个系统", "做一个系统");
    const webFailed = inferProcessContextFromExec("evidence.search", base, {
      title: "外部证据检索（规则推演）",
      summary: "【来源: 会话内综合】已尝试全网检索但未取得可用结果，使用会话内材料。",
      content: "已发起全网检索（F2），但未命中可接地来源。",
      provenance: "ai_generated",
    });
    const webFailedTrace = buildActionTrace("evidence.search", true, webFailed, {
      provenance: "ai_generated",
    });
    expect(webFailedTrace?.ok).toBe(false);
    expect(webFailedTrace?.label).toContain("全网检索");

    const ghFailed = inferProcessContextFromExec("evidence.search", base, {
      title: "外部证据检索失败",
      summary: "【来源: 会话内综合】GitHub 证据收集不可用，已降级为会话内综合。",
      content: "尝试从 https://github.com/org/private 收集证据时失败。",
      provenance: "ai_generated",
    });
    const ghFailedTrace = buildActionTrace("evidence.search", true, ghFailed, {
      provenance: "ai_generated",
    });
    expect(ghFailedTrace?.label).toContain("检索失败");
  });

  it("action live labels include concrete targets, not generic external-tool phrasing", () => {
    const repo = getLiveAction("repo.inspect", { repoSlug: "facebook/react" });
    expect(repo.label).toContain("facebook/react");
    expect(repo.label).not.toMatch(/调用了外部工具/);

    const mcp = getLiveAction("mcp.call", { toolName: "github-search" });
    expect(mcp.label).toContain("github-search");
    expect(mcp.label).not.toMatch(/调用了外部工具/);
  });
});