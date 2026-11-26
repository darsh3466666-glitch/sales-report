import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppHeader, type LiveStatusState } from "@/components/layout/AppHeader";
import { toast } from "sonner";

export const Route = createFileRoute("/inventory")({
  ssr: false,
  component: InventoryPage,
});

function InventoryPage() {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const manualRefreshPendingRef = useRef(false);
  const [liveStatus, setLiveStatus] = useState<LiveStatusState>("syncing");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [printDate, setPrintDate] = useState<string>("");
  const [printLayout, setPrintLayout] = useState<"pc" | "mobile">("mobile");

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
    document.title = "إدارة المخزون - شركة النور";
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
          if (manualRefreshPendingRef.current) {
            manualRefreshPendingRef.current = false;
            toast.success("تم تحديث بيانات المخزون لحظياً بنجاح");
          }
        } else if (data.status === "syncing") {
          setLiveStatus("syncing");
        } else if (data.status === "stale" || data.status === "error") {
          setLiveStatus("error");
          setIsRefreshing(false);
          if (manualRefreshPendingRef.current) {
            manualRefreshPendingRef.current = false;
            toast.error("فشل تحديث بيانات المخزون");
          }
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
    manualRefreshPendingRef.current = true;
    setIsRefreshing(true);
    setLiveStatus("syncing");
    win.postMessage({ type: "REFRESH_DATA" }, window.location.origin);
  };

  const handlePrint = (layout: "pc" | "mobile") => {
    const win = iframeRef.current?.contentWindow;
    if (!win) {
      toast.error("تعذر الوصول لصفحة المخزون للطباعة");
      return;
    }
    win.postMessage({ type: "PRINT_VIEW", layout }, window.location.origin);
  };

  return (
    <div className="h-dvh flex flex-col overflow-hidden bg-background" dir="rtl">
      <AppHeader
        title="إدارة المخزون"
        activeSection="inventory"
        decorativeBg
        liveStatus={liveStatus}
        liveStatusTitle={
          printDate
            ? `بث مباشر للمخزون — تاريخ التقرير: ${printDate}`
            : "بث مباشر لتقرير المخزون والتسويات"
        }
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
        historyTo="/inventory/history"
        historyTitle="سجل جلسات الجرد والتسويات السابقة"
        printLayout={printLayout}
        setPrintLayout={setPrintLayout}
        onPrint={handlePrint}
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
