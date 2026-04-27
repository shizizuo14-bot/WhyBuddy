import {
  Globe,
  Terminal,
  FolderOpen,
  BookOpen,
  Search,
  Eye,
  type LucideIcon,
} from "lucide-react";

import { useI18n } from "@/i18n";
import type { RuntimeMode } from "@/lib/store";

function t(locale: string, zh: string, en: string) {
  return locale === "zh-CN" ? zh : en;
}

export interface CockpitTool {
  id: string;
  labelZh: string;
  labelEn: string;
  descZh: string;
  descEn: string;
  icon: LucideIcon;
  requiresAdvancedRuntime: boolean;
}

export const COCKPIT_TOOLS: CockpitTool[] = [
  { id: "browser", labelZh: "浏览器能力", labelEn: "Browser", descZh: "真实浏览器 / 操作", descEn: "Real browser / actions", icon: Globe, requiresAdvancedRuntime: true },
  { id: "executor", labelZh: "代码执行器", labelEn: "Code Executor", descZh: "运行 Python 代码", descEn: "Run Python code", icon: Terminal, requiresAdvancedRuntime: true },
  { id: "filesystem", labelZh: "文件系统", labelEn: "File System", descZh: "读写与管理文件", descEn: "Read/write files", icon: FolderOpen, requiresAdvancedRuntime: true },
  { id: "knowledge", labelZh: "知识检索", labelEn: "Knowledge", descZh: "语义搜索 / 问答", descEn: "Semantic search / QA", icon: BookOpen, requiresAdvancedRuntime: false },
  { id: "web", labelZh: "网络搜索", labelEn: "Web Search", descZh: "实时网络信息", descEn: "Live web info", icon: Search, requiresAdvancedRuntime: false },
  { id: "vision", labelZh: "视觉理解", labelEn: "Vision", descZh: "图片分析与理解", descEn: "Image analysis", icon: Eye, requiresAdvancedRuntime: false },
];

export interface LaunchCockpitGridProps {
  runtimeMode: RuntimeMode;
}

export function LaunchCockpitGrid({ runtimeMode }: LaunchCockpitGridProps) {
  const { locale } = useI18n();

  return (
    <div data-testid="launch-cockpit-grid">
      <h3
        className="mb-1 text-xs font-semibold uppercase tracking-wider"
        style={{ color: "var(--muted-foreground, #64748b)" }}
      >
        ⚡ {t(locale, "能力驾驶舱 COCKPIT", "Capability Cockpit")}
      </h3>
      <p
        className="mb-3 text-[11px]"
        style={{ color: "var(--muted-foreground, #64748b)" }}
      >
        {t(locale, "连接硬核技术可用的能力，智能体将按需智能调用以完成任务。", "Connected capabilities the agent will intelligently invoke as needed.")}
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {COCKPIT_TOOLS.map(tool => {
          const Icon = tool.icon;
          const isDisabled =
            tool.requiresAdvancedRuntime && runtimeMode !== "advanced";

          return (
            <div
              key={tool.id}
              className="flex items-start gap-2.5 rounded-lg border p-2.5 transition-colors"
              style={{
                borderColor: "var(--border, #e2e8f0)",
                backgroundColor: "var(--card, #ffffff)",
                opacity: isDisabled ? 0.5 : 1,
              }}
              data-testid={`cockpit-tool-${tool.id}`}
              data-disabled={isDisabled}
              aria-disabled={isDisabled}
            >
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                style={{ backgroundColor: "var(--muted, #f1f5f9)" }}
              >
                <Icon
                  size={16}
                  style={{
                    color: isDisabled
                      ? "var(--muted-foreground, #64748b)"
                      : "var(--card-foreground, #0f172a)",
                  }}
                />
              </div>
              <div className="min-w-0">
                <div
                  className="text-xs font-medium"
                  style={{
                    color: isDisabled
                      ? "var(--muted-foreground, #64748b)"
                      : "var(--card-foreground, #0f172a)",
                  }}
                >
                  {t(locale, tool.labelZh, tool.labelEn)}
                </div>
                <div
                  className="text-[10px] leading-tight mt-0.5"
                  style={{ color: "var(--muted-foreground, #64748b)" }}
                >
                  {t(locale, tool.descZh, tool.descEn)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
