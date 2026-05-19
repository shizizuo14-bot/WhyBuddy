import { useLocation } from "wouter";

import {
  getActiveSidebarId,
  getMobileTabItems,
  resolveSidebarHref,
  type SidebarNavigationItem,
} from "@/components/navigation-config";
import { useI18n } from "@/i18n";
import { useProjectStore } from "@/lib/project-store";
import { cn } from "@/lib/utils";

function MobileTabItem({
  item,
  href,
  active,
  label,
  onNavigate,
}: {
  item: SidebarNavigationItem;
  href?: string;
  active: boolean;
  label: string;
  onNavigate: (href: string) => void;
}) {
  const isDisabled = item.disabled || !href;
  const Icon = item.icon;

  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      disabled={isDisabled}
      onClick={() => {
        if (!isDisabled && href) {
          onNavigate(href);
        }
      }}
      className={cn(
        "flex flex-1 flex-col items-center justify-center gap-0.5 py-1 text-[10px] font-medium transition-colors",
        isDisabled && "cursor-not-allowed opacity-50"
      )}
      style={{
        color: active ? "var(--sidebar-primary)" : "var(--sidebar-foreground)",
      }}
    >
      <Icon className="size-5" />
      <span className="truncate">{label}</span>
    </button>
  );
}

export function MobileTabBar() {
  const [location, setLocation] = useLocation();
  const { copy, locale } = useI18n();
  const currentProjectId = useProjectStore(state => state.currentProjectId);
  const activeId = getActiveSidebarId(location);
  const items = getMobileTabItems(location);
  const sidebarCopy = copy.sidebar;

  const labelMap: Record<string, string> = {
    autopilot: sidebarCopy.autopilot,
    specs: locale === "zh-CN" ? "推导" : "Deduction",
    tasks: sidebarCopy.tasks,
    projects: sidebarCopy.projects,
    knowledge: sidebarCopy.knowledge,
    datasource: sidebarCopy.datasource,
    dashboard: sidebarCopy.dashboard,
    marketplace: sidebarCopy.marketplace,
    notifications: sidebarCopy.notifications,
    settings: sidebarCopy.settings,
  };

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-40 border-t"
      style={{
        paddingBottom: "env(safe-area-inset-bottom)",
        backgroundColor: "var(--sidebar)",
        borderColor: "var(--sidebar-border)",
      }}
    >
      <div
        className="flex h-14 items-center justify-around"
        role="tablist"
        aria-label="主导航"
      >
        {items.map(item => {
          const href = resolveSidebarHref(item, location, currentProjectId);

          return (
            <MobileTabItem
              key={item.id}
              item={item}
              href={href}
              active={item.id === activeId}
              label={labelMap[item.id] ?? item.id}
              onNavigate={setLocation}
            />
          );
        })}
      </div>
    </div>
  );
}
