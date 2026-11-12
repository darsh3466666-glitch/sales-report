import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, useMemo, useCallback } from "react";
import {
  getLiveCashFlowData,
  recalculateCashFlowSummary,
  saveCustomerOverride,
  archiveCurrentWeekAndStartNew,
  deleteCustomerFromSummary,
  addCustomerToSummary,
  type CashFlowSummary,
} from "@/lib/cashflow.functions";
import { CashFlowHeader } from "@/components/cashflow/CashFlowHeader";
import { CashFlowTable } from "@/components/cashflow/CashFlowTable";
import { EndCycleModal } from "@/components/cashflow/EndCycleModal";
import { PrintDialog } from "@/components/dashboard/PrintDialog";
import { Button } from "@/components/ui/button";
import { Moon, Sun, BarChart3, Wallet } from "lucide-react";
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
  const [isEndCycleModalOpen, setIsEndCycleModalOpen] = useState(false);

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

  const handleEndCycleConfirm = async () => {
    if (!activeSummary) return;
    try {
      const result = await archiveCurrentWeekAndStartNew(activeSummary);
      setActiveSummary(result.newSummary);
      toast.success("تم أرشفة الأسبوع بنجاح وتجميد خط الأساس للأسبوع الجديد!");
      await refetch();
    } catch (err) {
      console.error("End cycle error:", err);
      toast.error("حدث خطأ أثناء أرشفة الأسبوع");
    }
  };

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

  const handleCustomerDelete = useCallback((customerName: string) => {
    setActiveSummary((prev) => {
      if (!prev) return prev;
      return deleteCustomerFromSummary(prev, customerName);
    });
  }, []);

  const handleCustomerAdd = useCallback(
    (newCust: {
      customerName: string;
      expectedAmount: number;
      currentBalance?: number;
      dueDate?: string;
      notes?: string;
      isPinned?: boolean;
    }) => {
      setActiveSummary((prev) => {
        if (!prev) return prev;
        return addCustomerToSummary(prev, newCust);
      });
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
    document.title = "تقرير التدفقات النقدية (Cash Flow)";
  }, []);

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  }

  const [printLayout, setPrintLayout] = useState<"pc" | "mobile">("mobile");

  return (
    <div
      className={`min-h-screen bg-background print-layout-container print-layout-${printLayout}`}
      dir="rtl"
    >
      {/* Dynamic Print Orientation Tag */}
      {printLayout === "pc" ? (
        <style
          dangerouslySetInnerHTML={{
            __html:
              "@media print { @page { size: A4 landscape !important; margin: 5mm 6mm !important; } }",
          }}
        />
      ) : (
        <style
          dangerouslySetInnerHTML={{
            __html:
              "@media print { @page { size: A4 portrait !important; margin: 4mm 5mm !important; } }",
          }}
        />
      )}

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
            <PrintDialog
              printLayout={printLayout}
              setPrintLayout={setPrintLayout}
            />
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

      {/* Print-Only Professional Clean Header */}
      <div className="print-only px-4 py-3 border-b mb-4" dir="rtl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-foreground">
              تقرير التدفقات النقدية الأسبوعية (Cash Flow)
            </h1>
            {activeSummary && (
              <p className="text-xs text-muted-foreground mt-0.5 font-semibold">
                {activeSummary.weekLabel}
              </p>
            )}
          </div>
          <div className="text-xs text-muted-foreground font-semibold">
            تاريخ الطباعة:{" "}
            {new Date().toLocaleString("ar-EG-u-nu-latn", {
              dateStyle: "full",
              timeStyle: "short",
            })}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="container mx-auto px-3 sm:px-4 py-6 space-y-6">
        {isLoading && !activeSummary ? (
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
              onEndCycle={() => setIsEndCycleModalOpen(true)}
            />
            <CashFlowTable
              summary={activeSummary}
              onCustomerSave={handleCustomerSave}
              onCustomerDelete={handleCustomerDelete}
              onCustomerAdd={handleCustomerAdd}
              onRefresh={() => refetch()}
            />
            <EndCycleModal
              isOpen={isEndCycleModalOpen}
              onClose={() => setIsEndCycleModalOpen(false)}
              summary={activeSummary}
              onConfirm={handleEndCycleConfirm}
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
