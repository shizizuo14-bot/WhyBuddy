import { extractArtifactFragments } from "@shared/blueprint/whybuddy-report-builder";
import type { Artifact } from "@shared/blueprint/v5-reasoning-state";

export type ReportSection = {
  id: string;
  label: string;
  body: string;
  evidenceRefs: string[];
};

const SECTION_LABEL_PATTERN =
  "结论(?:（待补证）)?|支撑证据|反证\\/挑战|反证|证据|风险|分歧|收敛决策|未解缺口|下一步工程化分支|下一步|provenance\\s*\\/\\s*upstream refs";

function normalizeReportContent(content: string): string {
  return content
    .replace(/\r\n/g, "\n")
    .replace(/^【[^】]+】\s*/gm, "")
    .trim();
}

function labelFromMatch(raw: string): string {
  return raw.replace(/\s*\/\s*upstream refs/i, "溯源");
}

function splitByHeaders(content: string): ReportSection[] {
  const normalized = normalizeReportContent(content);
  if (!normalized) return [];

  const lineHeaderRe = new RegExp(
    `^\\s*(${SECTION_LABEL_PATTERN})[：:]\\s*(.*)$`,
    "i"
  );
  const sections: ReportSection[] = [];
  let current: ReportSection | null = null;

  for (const line of normalized.split("\n")) {
    const match = line.match(lineHeaderRe);
    if (match) {
      if (current?.body.trim()) sections.push(current);
      current = {
        id: `sec-${sections.length}`,
        label: labelFromMatch(match[1]),
        body: (match[2] || "").trim(),
        evidenceRefs: [],
      };
      continue;
    }
    if (current) {
      current.body += (current.body ? "\n" : "") + line;
    }
  }

  if (current?.body.trim()) sections.push(current);
  return sections;
}

/** Parse report.write artifact into named sections for WhyBuddyReportReader. */
export function parseReportSections(report: Artifact): ReportSection[] {
  const content = String(report.content || report.summary || "");
  const fromHeaders = splitByHeaders(content);
  if (fromHeaders.length >= 3) {
    return fromHeaders.map((s) => ({
      ...s,
      evidenceRefs: [...(report.evidenceRefs || [])],
    }));
  }

  const fragments = extractArtifactFragments(report, 800);
  if (fragments.length > 0) {
    return fragments.map((f, i) => ({
      id: `frag-${i}`,
      label: f.label,
      body: f.text,
      evidenceRefs: i === 0 ? [...(report.evidenceRefs || [])] : [],
    }));
  }

  return [
    {
      id: "full",
      label: "报告全文",
      body: content.trim() || report.title || "",
      evidenceRefs: [...(report.evidenceRefs || [])],
    },
  ];
}