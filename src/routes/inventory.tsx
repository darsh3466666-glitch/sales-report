import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Printer } from "lucide-react";
import { AppHeader, type LiveStatusState } from "@/components/layout/AppHeader";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/inventory")({
  ssr: false,
  component: InventoryPage,
});

function InventoryPage() {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [liveStatus, setLiveStatus] = useState<LiveStatusState>("syncing");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [printDate, setPrintDate] = useState<string>("");

  const basePath =
    typeof window !== "undefined" &&
    window.location.pathname.startsWith("/sales-report")
      ? "/sales-report/"
      : "/";

  const iframeSrc = `${basePath}inventory-app/index.html?embedded=1`;

  const syncThemeToIframe = useCallback((themeValue?: string) => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    const isDark = themeValue
      ? themeValue === "dark"
      : document.documentElement.classList.contains("dark");
    win.postMessage(
      { type: "THEME_SYNC", theme: isDark ? "dark" : "light" },
      window.location.origin,
    );
  }, []);

  useEffect(() => {
    document.title = "المخزون والأرصدة - شركة النور";
  }, []);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data;
      if (!data || typeof data !== "object") return;
      if (data.type === "INVENTORY_STATUS") {
        if (data.status === "live") {
          setLiveStatus("live");
          setIsRefreshing(false);
        } else if (data.status === "syncing") {
          setLiveStatus("syncing");
        } else if (data.status === "stale" || data.status === "error") {
          setLiveStatus("error");
          setIsRefreshing(false);
        }
        if (data.printDate) {
          setPrintDate(String(data.printDate));
        }
      }
    };

    const handleThemeEvent = (event: Event) => {
      const custom = event as CustomEvent<string>;
      syncThemeToIframe(custom.detail);
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === "theme" && event.newValue) {
        syncThemeToIframe(event.newValue);
      }
    };

    window.addEventListener("message", handleMessage);
    window.addEventListener("app-theme-change", handleThemeEvent);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("message", handleMessage);
      window.removeEventListener("app-theme-change", handleThemeEvent);
      window.removeEventListener("storage", handleStorage);
    };
  }, [syncThemeToIframe]);

  const handleRefresh = () => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    setIsRefreshing(true);
    setLiveStatus("syncing");
    win.postMessage({ type: "REFRESH_DATA" }, window.location.origin);
  };

  const handlePrint = () => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage({ type: "PRINT_VIEW" }, window.location.origin);
  };

  return (
    <div className="h-dvh flex flex-col overflow-hidden bg-background" dir="rtl">
      <AppHeader
        title="إدارة المخزون"
        activeSection="inventory"
        liveStatus={liveStatus}
        liveStatusTitle={
          printDate
            ? `بث مباشر للمخزون — تاريخ التقرير: ${printDate}`
            : "بث مباشر لتقرير المخزون والتسويات"
        }
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={handlePrint}
            className="h-8 sm:h-9 px-2.5 sm:px-3 rounded-full font-bold text-xs sm:text-sm bg-card shadow-xs border border-muted hover:border-primary/30 gap-1.5 cursor-pointer"
            title="طباعة تقرير المخزون"
          >
            <Printer className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary shrink-0" />
            <span className="hidden sm:inline">طباعة</span>
          </Button>
        }
      />

      <main className="flex-1 min-h-0 w-full relative">
        <iframe
          ref={iframeRef}
          src={iframeSrc}
          title="تطبيق إدارة المخزون - شركة النور"
          className="w-full h-full border-0 block bg-background"
          onLoad={() => syncThemeToIframe()}
        />
      </main>
    </div>
  );
}
