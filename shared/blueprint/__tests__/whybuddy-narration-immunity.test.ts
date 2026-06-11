import { describe, it, expect } from "vitest";
import {
  detectNarrationHijack,
  buildNarrationUserPrompt,
  DOMAIN_ANCHORING_RULE,
} from "../whybuddy-narration-immunity.js";

describe("whybuddy-narration-immunity (S7)", () => {
  it("detects opening brand self-intro hijacks", () => {
    expect(detectNarrationHijack("我是 ChatGPT，很高兴为你服务。").hijacked).toBe(true);
    expect(detectNarrationHijack("你好，我是 Claude，").hijacked).toBe(true);
    expect(detectNarrationHijack("作为一个人工智能助手，").hijacked).toBe(true);
  });

  it("does not false-positive on 我建议/我认为 mid-text (S7 acceptance)", () => {
    const text =
      "结合本轮分析，我建议先采用 RBAC 并保留扩展口。我认为当前最大的风险在审计链路过长。";
    expect(detectNarrationHijack(text).hijacked).toBe(false);
  });

  it("does not false-positive when 我是 appears after substantive opening", () => {
    const text = "本轮对比了两条权限方案路线。我是从运维成本角度补充几点。";
    expect(detectNarrationHijack(text).hijacked).toBe(false);
  });

  it("folds identity discipline into user instruction block + domain anchor", () => {
    const prompt = buildNarrationUserPrompt({
      turnId: "t1",
      userText: "路线对比一下",
      goalText: "权限系统",
      goalStatus: "needs_refinement",
      selectedLine: "route.compare×工程",
    });
    expect(prompt).toContain("[指令块");
    expect(prompt).toContain(DOMAIN_ANCHORING_RULE);
    expect(prompt).toContain("权限系统");
    expect(prompt).toContain("路线对比一下");
  });
});