/**
 * `blueprint-checks-ledger` spec Task 6.1：Markdown 导出渲染器。
 *
 * 独立函数，不依赖 service 实例。接收 entry 数组，返回 Markdown 字符串。
 * 可被 engineering handoff 导出路径直接调用。
 */

import type { BlueprintChecksLedgerEntry } from "../../../../shared/blueprint/checks-ledger/types.js";

const STATUS_EMOJI: Record<string, string> = {
  pass: "✅",
  fail: "❌",
  warn: "⚠️",
  skip: "⏭",
};

/**
 * 将校验台账条目列表渲染为 Markdown 表格。
 */
export function renderChecksLedgerMarkdown(
  entries: BlueprintChecksLedgerEntry[],
): string {
  if (entries.length === 0) {
    return "## 校验台账 (Checks Ledger)\n\n暂无校验记录。\n";
  }

  const sorted = [...entries].sort((a, b) =>
    a.triggeredAt.localeCompare(b.triggeredAt),
  );

  const lines: string[] = [
    "## 校验台账 (Checks Ledger)",
    "",
    "| # | 阶段 | 类型 | 名称 | 状态 | 校验器 | 时间 | 耗时 |",
    "|---|------|------|------|------|--------|------|------|",
  ];

  for (let i = 0; i < sorted.length; i++) {
    const e = sorted[i];
    const emoji = STATUS_EMOJI[e.status] ?? e.status;
    const duration = e.durationMs !== undefined ? `${e.durationMs}ms` : "-";
    lines.push(
      `| ${i + 1} | ${e.stage} | ${e.checkType} | ${e.checkName} | ${emoji} ${e.status} | ${e.validator} | ${e.triggeredAt} | ${duration} |`,
    );
  }

  // Summary
  let pass = 0, fail = 0, warn = 0, skip = 0;
  for (const e of sorted) {
    switch (e.status) {
      case "pass": pass++; break;
      case "fail": fail++; break;
      case "warn": warn++; break;
      case "skip": skip++; break;
    }
  }

  lines.push("");
  lines.push("### 汇总");
  lines.push(
    `- 总计: ${sorted.length} | ✅ 通过: ${pass} | ❌ 失败: ${fail} | ⚠️ 警告: ${warn} | ⏭ 跳过: ${skip}`,
  );
  lines.push("");

  return lines.join("\n");
}
