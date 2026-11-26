import React, { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  BarChart3,
  History,
  Moon,
  Package,
  RefreshCw,
  Sun,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PrintDialog } from "@/components/dashboard/PrintDialog";

export interface AppSectionItem {
  id: string;
  to: string;
  label: string;
  icon: LucideIcon;
  iconColorClass?: string;
}

/**
 * Central navigation registry for top-level app sections.
 * Add any new section here and it will automatically appear
 * with identical styling across desktop and mobile on every page.
 */
export const APP_SECTIONS: AppSectionItem[] = [
  {
    id: "dashboard",
    to: "/dashboard",
    label: "المبيعات والتحصيل",
    icon: BarChart3,
    iconColorClass: "text-primary",
  },
  {
    id: "cashflow",
    to: "/cashflow",
    label: "الكاش فلو الأسبوعي",
    icon: Wallet,
    iconColorClass: "text-emerald-600 dark:text-emerald-400",
  },
  {
    id: "inventory",
    to: "/inventory",
    label: "المخزون",
    icon: Package,
    iconColorClass: "text-amber-600 dark:text-amber-400",
  },
];

export type LiveStatusState = "live" | "syncing" | "error";

interface AppHeaderProps {
  /** Folded ribbon title shown at the top-right */
  title: string;
  /** Optional icon inside the title ribbon */
  titleIcon?: React.ReactNode;
  /** Currently active section id matching an item in APP_SECTIONS */
  activeSection: string;
  /** Unified live status indicator rendered identically across reports */
  liveStatus?: LiveStatusState | false;
  /** Tooltip title for live status badge */
  liveStatusTitle?: string;
  /** Unified live refresh action rendered identically across reports */
  onRefresh?: () => void;
  /** Spinner state for the refresh button */
  isRefreshing?: boolean;
  /** Unified history route link rendered identically across reports */
  historyTo?: string;
  /** Tooltip title for the history button */
  historyTitle?: string;
  /** Any additional page-specific action buttons */
  actions?: React.ReactNode;
  /** Optional print layout state; when provided, renders PrintDialog */
  printLayout?: "pc" | "mobile";
  setPrintLayout?: (layout: "pc" | "mobile") => void;
  /** Show decorative background shapes */
  decorativeBg?: boolean;
}

function LiveStatusPill({
  status,
  title,
}: {
  status: LiveStatusState;
  title?: string;
}) {
  const styles =
    status === "syncing"
      ? "bg-amber-100 text-amber-800 border-amber-400 dark:bg-amber-950 dark:text-amber-300"
      : status === "error"
      ? "bg-rose-100 text-rose-700 border-rose-400 dark:bg-rose-950 dark:text-rose-300"
      : "bg-emerald-100 text-emerald-800 border-emerald-400 dark:bg-emerald-950 dark:text-emerald-300";

  const dotClass =
    status === "syncing"
      ? "bg-amber-500 animate-ping"
      : status === "error"
      ? "bg-rose-500"
      : "bg-emerald-500 animate-pulse";

  const label =
    status === "syncing"
      ? "جاري المزامنة..."
      : status === "error"
      ? "خطأ مزامنة"
      : "بث مباشر";

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-black border whitespace-nowrap ${styles}`}
      title={title || "بث مباشر لحظي"}
    >
      <span className={`h-2 w-2 rounded-full shrink-0 ${dotClass}`} />
      <span>{label}</span>
    </div>
  );
}

export function AppHeader({
  title,
  titleIcon,
  activeSection,
  liveStatus = false,
  liveStatusTitle,
  onRefresh,
  isRefreshing = false,
  historyTo,
  historyTitle = "السجل",
  actions,
  printLayout,
  setPrintLayout,
  decorativeBg = false,
}: AppHeaderProps) {
  const [dark, setDark] = useState(() => {
    if (typeof document !== "undefined") {
      return document.documentElement.classList.contains("dark");
    }
    return false;
  });

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
    window.dispatchEvent(
      new CustomEvent("app-theme-change", { detail: next ? "dark" : "light" }),
    );
  }

  const statusPill = liveStatus ? (
    <LiveStatusPill status={liveStatus} title={liveStatusTitle} />
  ) : null;

  return (
    <header className="sticky top-0 z-20 border-b-4 border-primary/20 bg-card/95 backdrop-blur-md no-print shadow-xs relative">
      {decorativeBg && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-5">
          <div className="absolute -top-10 -right-10 w-32 h-48 bg-primary rounded-xl rotate-12" />
          <div className="absolute -top-12 right-10 w-32 h-48 bg-accent rounded-xl -rotate-6" />
          <div className="absolute -top-8 right-24 w-32 h-48 bg-destructive rounded-xl rotate-[24deg]" />
        </div>
      )}

      <div className="container mx-auto px-3 sm:px-4 py-2.5 sm:py-3 relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2.5">
        {/* Top / Right Group: Title Ribbon + Mobile Theme Toggle + Section Switcher */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between lg:justify-start gap-2.5 sm:gap-4 min-w-0">
          {/* Title Row (on mobile, also holds status & theme toggle so they stay pinned in one clean row) */}
          <div className="flex items-center justify-between gap-2 min-w-0">
            <div className="relative shrink-0 pr-1.5 sm:pr-0">
              <div className="relative bg-cream border-2 border-primary-dark px-2.5 sm:px-3 py-1 z-10 shadow-md flex items-center justify-center gap-1.5">
                {titleIcon}
                <h1 className="text-sm sm:text-base md:text-lg font-black text-primary-dark tracking-wide sm:tracking-wider whitespace-nowrap">
                  {title}
                </h1>
              </div>
              <div className="absolute top-1.5 -left-1.5 sm:-left-2 w-2.5 sm:w-3 h-full bg-[#E5DFCA] border-2 border-primary-dark -z-10 skew-y-[20deg]" />
              <div className="absolute top-1.5 -right-0.5 sm:-right-2 w-2.5 sm:w-3 h-full bg-[#E5DFCA] border-2 border-primary-dark -z-10 -skew-y-[20deg]" />
            </div>

            {/* Mobile-only right-end controls: Status + Theme Toggle */}
            <div className="flex sm:hidden items-center gap-1.5 shrink-0">
              {statusPill}
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleTheme}
                className="h-8 w-8 rounded-full bg-card shadow-xs border border-muted hover:border-primary/30"
                title={dark ? "الوضع النهاري" : "الوضع الليلي"}
                aria-label={dark ? "الوضع النهاري" : "الوضع الليلي"}
              >
                {dark ? (
                  <Sun className="h-4 w-4 text-accent" />
                ) : (
                  <Moon className="h-4 w-4 text-primary" />
                )}
              </Button>
            </div>
          </div>

          {/* Unified Section Switcher — always visible, identical on every page, horizontally scrollable if many sections */}
          <nav
            aria-label="أقسام النظام"
            className="flex items-center p-1 bg-muted/80 rounded-full border border-border text-xs font-bold shadow-inner overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden max-w-full"
          >
            {APP_SECTIONS.map((section) => {
              const Icon = section.icon;
              const isActive = activeSection === section.id;
              return (
                <Link
                  key={section.id}
                  to={section.to as any}
                  className="shrink-0"
                >
                  <Button
                    variant={isActive ? "default" : "ghost"}
                    size="sm"
                    className={`rounded-full h-8 px-3 gap-1.5 text-xs font-bold whitespace-nowrap transition-all ${
                      isActive
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground hover:bg-background/60"
                    }`}
                  >
                    <Icon
                      className={`h-3.5 w-3.5 shrink-0 ${
                        isActive ? "" : section.iconColorClass || "text-primary"
                      }`}
                    />
                    <span>{section.label}</span>
                  </Button>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Bottom / Left Group: Status Badge + Refresh + History + Extra Actions + Print + Desktop Theme Toggle */}
        <div className="flex flex-wrap items-center justify-between sm:justify-end gap-1.5 sm:gap-2">
          <div className="hidden sm:flex items-center">{statusPill}</div>

          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            {onRefresh && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onRefresh}
                disabled={isRefreshing}
                className="h-8 sm:h-9 px-2.5 sm:px-3 rounded-full font-bold text-xs sm:text-sm bg-card shadow-xs border border-muted hover:border-primary/30 gap-1.5 cursor-pointer"
                title="تحديث لحظي"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary shrink-0 ${isRefreshing ? "animate-spin" : ""}`}
                />
                <span className="hidden sm:inline">تحديث</span>
              </Button>
            )}

            {historyTo && (
              <Link to={historyTo as any}>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 sm:h-9 px-2.5 sm:px-3 rounded-full font-bold text-xs sm:text-sm bg-card shadow-xs border border-muted hover:border-primary/30 gap-1.5 cursor-pointer"
                  title={historyTitle}
                >
                  <History className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-accent-dark shrink-0" />
                  <span className="hidden sm:inline">السجل</span>
                </Button>
              </Link>
            )}

            {actions}

            {printLayout && setPrintLayout && (
              <PrintDialog
                printLayout={printLayout}
                setPrintLayout={setPrintLayout}
              />
            )}
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            className="hidden sm:inline-flex h-9 w-9 rounded-full bg-card shadow-xs border border-muted hover:border-primary/30 shrink-0"
            title={dark ? "الوضع النهاري" : "الوضع الليلي"}
            aria-label={dark ? "الوضع النهاري" : "الوضع الليلي"}
          >
            {dark ? (
              <Sun className="h-4 w-4 text-accent" />
            ) : (
              <Moon className="h-4 w-4 text-primary" />
            )}
          </Button>
        </div>
      </div>
    </header>
  );
}
