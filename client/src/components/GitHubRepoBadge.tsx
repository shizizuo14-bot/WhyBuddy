import { ExternalLink, Github, Star } from "lucide-react";

import {
  GITHUB_REPOSITORY,
  GITHUB_REPOSITORY_URL,
  IS_GITHUB_PAGES,
} from "@/lib/deploy-target";
import { cn } from "@/lib/utils";

type GitHubRepoBadgeProps = {
  className?: string;
};

export function GitHubRepoBadge({ className }: GitHubRepoBadgeProps) {
  if (!IS_GITHUB_PAGES) return null;

  return (
    <a
      href={GITHUB_REPOSITORY_URL}
      target="_blank"
      rel="noreferrer"
      aria-label={`Open ${GITHUB_REPOSITORY} on GitHub`}
      className={cn(
        "group block rounded-[24px] border border-cyan-200/70 p-3.5 text-white",
        "bg-[linear-gradient(135deg,rgba(8,145,178,0.96),rgba(20,184,166,0.92)_52%,rgba(245,158,11,0.95))]",
        "shadow-[0_20px_55px_rgba(8,145,178,0.34)] ring-1 ring-white/35",
        "transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-[0_24px_70px_rgba(245,158,11,0.32)]",
        "active:scale-[0.985] focus-visible:outline-none focus-visible:ring-2",
        "focus-visible:ring-amber-300/80",
        className
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[18px] bg-slate-950 text-white shadow-[0_10px_24px_rgba(15,23,42,0.35)] ring-1 ring-white/25">
          <Github className="h-5 w-5" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-amber-100">
            GitHub / Star
          </p>
          <p className="mt-1 truncate text-sm font-black text-white drop-shadow-sm">
            {GITHUB_REPOSITORY}
          </p>
          <p className="mt-1 truncate text-[11px] font-medium text-cyan-50/85">
            {GITHUB_REPOSITORY_URL.replace(/^https?:\/\//, "")}
          </p>
        </div>

        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[16px] bg-white text-slate-950 shadow-sm transition-colors group-hover:bg-amber-200">
          <ExternalLink className="h-4 w-4" />
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/25 pt-3 text-[11px] text-white/90">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-300 px-2.5 py-1 font-black text-slate-950 shadow-sm">
          <Star className="h-3.5 w-3.5 fill-current" />
          Star on GitHub
        </span>
        <span className="text-right font-semibold text-white">
          Open repository
        </span>
      </div>
    </a>
  );
}
