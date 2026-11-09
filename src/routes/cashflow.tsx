import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, useMemo, useCallback } from "react";
import {
  getLiveCashFlowData,
  recalculateCashFlowSummary,
  saveCustomerOverride,
  type CashFlowSummary,
} from "@/lib/cashflow.functions";
import { CashFlowHeader } from "@/components/cashflow/CashFlowHeader";
import { WeeklyComparisonSection } from "@/components/cashflow/WeeklyComparisonSection";
import { CashFlowTable } from "@/components/cashflow/CashFlowTable";
import { Button } from "@/components/ui/button";
import { Moon, Sun, BarChart3, Wallet, Printer } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/cashflow")({
  ssr: false,
  component: CashFlowPage,
});

function CashFlowPage() {
  const {
    data: fetchedSummary,
    isLoading,
    isFetching,
    refetch,
    dataUpdatedAt,
  } = useQuery({
    queryKey: ["liveCashFlow"],
    queryFn: () => getLiveCashFlowData(),
    refetchInterval: 30000, // Live poll every 30 seconds exactly like treasury dashboard!
    refetchOnWindowFocus: true, // Auto-refetch when user focuses/switches to tab
    staleTime: 15000,
  });

  // Local optimistic summary state (for 0ms instant UI responses without freeze)
  const [activeSummary, setActiveSummary] = useState<CashFlowSummary | null>(null);

  // Sync with fetched data whenever network query returns
  useEffect(() => {
    if (fetchedSummary) {
      setActiveSummary(fetchedSummary);
    }
  }, [fetchedSummary]);

  const lastUpdatedTime = useMemo(() => {
    if (!dataUpdatedAt) return "الآن";
    return new Date(dataUpdatedAt).toLocaleTimeString("ar-EG-u-nu-latn");
  }, [dataUpdatedAt]);

  // Handle instant customer updates: updates memory immediately, writes localStorage safely, zero freeze!
  const handleCustomerSave = useCallback(
    (
      customerName: string,
      updates: { expectedAmount: number; isPinned: boolean; notes: string }
    ) => {
      saveCustomerOverride(customerName, updates);

      setActiveSummary((prev) => {
        if (!prev) return prev;
        return recalculateCashFlowSummary(prev, customerName, updates);
      });

      toast.success(`تم حفظ بيانات العميل: ${customerName}`);
    },
    []
  );

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
  }

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      {/* Top Header */}
      <header className="sticky top-0 z-20 border-b-4 border-primary/20 bg-card/90 backdrop-blur no-print overflow-hidden relative">
        <div className="container mx-auto px-3 sm:px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          {/* Title Ribbon & Navigation Switcher */}
          <div className="flex items-center gap-3 sm:gap-6 flex-wrap">
            <div className="relative">
              <div className="relative bg-cream border-2 border-primary-dark px-3 py-1 z-10 shadow-md flex items-center justify-center">
                <h1 className="text-base sm:text-lg font-black text-primary-dark tracking-widest whitespace-nowrap">
                  التدفقات النقدية (Cash Flow)
                </h1>
              </div>
              <div className="absolute top-1.5 -left-2 w-3 h-full bg-[#E5DFCA] border-2 border-primary-dark -z-10 skew-y-[20deg]" />
              <div className="absolute top-1.5 -right-2 w-3 h-full bg-[#E5DFCA] border-2 border-primary-dark -z-10 -skew-y-[20deg]" />
            </div>

            {/* Navigation Tabs Switcher */}
            <div className="flex items-center p-1 bg-muted/80 rounded-full border border-border text-xs font-bold shadow-inner">
              <Link to="/dashboard">
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-full h-7 px-3 text-muted-foreground hover:text-foreground gap-1.5"
                >
                  <BarChart3 className="h-3.5 w-3.5 text-primary" />
                  <span>تقرير المبيعات والتحصيل</span>
                </Button>
              </Link>
              <Button
                variant="default"
                size="sm"
                className="rounded-full h-7 px-3 bg-primary text-primary-foreground shadow-sm gap-1.5"
              >
                <Wallet className="h-3.5 w-3.5" />
                <span>الكاش فلو الأسبوعي</span>
              </Button>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex items-center gap-1.5 sm:gap-2 mr-auto">
            <Button
              variant="ghost"
              size="sm"
              onClick={handlePrint}
              className="px-3 sm:px-4 rounded-full font-bold bg-card shadow-sm border border-muted hover:border-primary/30"
              title="طباعة التقرير"
            >
              <Printer className="h-4 w-4 sm:ml-2 text-primary" />
              <span className="hidden sm:inline">طباعة</span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              className="rounded-full bg-card shadow-sm border border-muted hover:border-primary/30"
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

      {/* Main Content Area */}
      <main className="container mx-auto px-3 sm:px-4 py-6 space-y-6">
        {isLoading ? (
          <div className="p-16 text-center space-y-3" dir="rtl">
            <div className="h-8 w-8 border-3 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
            <div className="text-sm font-semibold text-muted-foreground">
              جاري تحميل بيانات التدفقات النقدية والاتصال بالخزينة...
            </div>
          </div>
        ) : activeSummary ? (
          <>
            <CashFlowHeader
              summary={activeSummary}
              isFetching={isFetching}
              onRefresh={() => refetch()}
              lastUpdatedTime={lastUpdatedTime || "الآن"}
            />
            {activeSummary.comparison && (
              <WeeklyComparisonSection comparison={activeSummary.comparison} />
            )}
            <CashFlowTable
              summary={activeSummary}
              onCustomerSave={handleCustomerSave}
              onRefresh={() => refetch()}
            />
          </>
        ) : (
          <div className="p-12 text-center text-muted-foreground bg-card rounded-2xl border border-destructive/20">
            فشل تحميل بيانات الكاش فلو. يرجى إعادة المحاولة.
          </div>
        )}
      </main>
    </div>
  );
}
