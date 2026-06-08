import { describe, expect, it } from "vitest";

import { looksLikeSpecDocMarkdown } from "./llm-key-pool.js";

/**
 * 问题 2 回归：spec_docs pool 路径的文档形状校验。
 *
 * 样本取自实时 job 存储里观察到的真实垃圾输出与正常输出（见调查记录）：
 * - 垃圾：`{"user_prompt": ...}` / `{"trace_id": ...}` / `python\nclass ...` /
 *   `mermaid\ngraph TD ...`
 * - 正常：以中文散文或 `#` 标题开头的需求/设计/任务 markdown
 */
describe("looksLikeSpecDocMarkdown", () => {
  it("rejects raw JSON object payloads (API request/response examples)", () => {
    expect(
      looksLikeSpecDocMarkdown(
        '{\n  "user_prompt": "分析 WhyBuddy 的核心执行逻辑并修复已知的回调延迟问题",\n  "request_id": "req-998877",\n  "options": { "stream_evidence": true }\n}',
      ),
    ).toBe(false);
    expect(
      looksLikeSpecDocMarkdown(
        '{\n    "trace_id": "trace_xxx_20231027",\n    "timestamp": "ISO8601_UTC_TIME",\n    "agent_role": "executor-backed-path"\n}',
      ),
    ).toBe(false);
    expect(
      looksLikeSpecDocMarkdown(
        '{\n  "run_id": "uuid-12345-67890",\n  "target": { "repository_url": "https://github.com/x/y" }\n}',
      ),
    ).toBe(false);
  });

  it("rejects bare code / diagram fragments without doc framing", () => {
    expect(
      looksLikeSpecDocMarkdown(
        "python\nclass SecretScrubber:\n    def scrub(self, config_dict):\n        # 递归扫描字典\n        pass",
      ),
    ).toBe(false);
    expect(
      looksLikeSpecDocMarkdown(
        "mermaid\ngraph TD\n    A[用户请求/指令] --> B{Runtime Orchestrator}\n    B --> C[Executor]",
      ),
    ).toBe(false);
  });

  it("rejects content that is entirely a single fenced code block", () => {
    expect(
      looksLikeSpecDocMarkdown(
        "```json\n{\n  \"a\": 1,\n  \"b\": 2,\n  \"c\": 3\n}\n```",
      ),
    ).toBe(false);
  });

  it("rejects too-short content", () => {
    expect(looksLikeSpecDocMarkdown("ok")).toBe(false);
    expect(looksLikeSpecDocMarkdown("")).toBe(false);
  });

  it("accepts proper Chinese markdown specification documents", () => {
    expect(
      looksLikeSpecDocMarkdown(
        "这是一份为您生成的 **WhyBuddy 主运行路径（Primary Runtime Path）** 需求文档。该文档基于您提供的模块描述和 GitHub 项目背景，旨在定义如何通过执行器驱动的角色代理路径，将用户请求转化为经过验证的制品。",
      ),
    ).toBe(true);
    expect(
      looksLikeSpecDocMarkdown(
        "# 需求文档：提示词与目标上下文规范化\n\n## 1. 模块概述\n### 1.1 模块定义\n本模块是 WhyBuddy 主运行路径的入口。",
      ),
    ).toBe(true);
  });

  it("accepts a markdown design doc that embeds (but is not only) a code block", () => {
    expect(
      looksLikeSpecDocMarkdown(
        "# 设计文档\n\n## 架构概览\n本模块采用分层设计。\n\n```mermaid\ngraph TD\n  A --> B\n```\n\n## 关键决策\n使用递归扫描。",
      ),
    ).toBe(true);
  });

  it("accepts a markdown task checklist without a top heading", () => {
    expect(
      looksLikeSpecDocMarkdown(
        "- [ ] 设计配置解析器接口\n- [ ] 实现敏感字段脱敏\n- [ ] 补充单元测试，覆盖空配置与非法值场景",
      ),
    ).toBe(true);
  });
});
