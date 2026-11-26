import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, useMemo, useCallback } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  getLiveCashFlowData,
  recalculateCashFlowSummary,
  saveCustomerOverride,
  archiveCurrentWeekAndStartNew,
  deleteCustomerFromSummary,
  deleteMultipleCustomersFromSummary,
  addCustomerToSummary,
  subscribeCloudSyncStatus,
  FIRESTORE_CF_COLLECTION,
  FIRESTORE_CF_CYCLE_DOC,
  FIRESTORE_CF_OVERRIDES_DOC,
  FIRESTORE_CF_PREV_WEEK_DOC,
  type CloudSyncStatus,
  type CashFlowSummary,
} from "@/lib/cashflow.functions";
import { CashFlowHeader } from "@/components/cashflow/CashFlowHeader";
import { CashFlowTable } from "@/components/cashflow/CashFlowTable";
import { EndCycleModal } from "@/components/cashflow/EndCycleModal";
import { AppHeader } from "@/components/layout/AppHeader";
import { toast } from "sonner";

export const Route = createFileRoute("/cashflow")({
  ssr: false,
  component: CashFlowPage,
});

function CashFlowPage() {
  const queryClient = useQueryClient();
  const [cloudSyncStatus, setCloudSyncStatus] = useState<CloudSyncStatus>("idle");

  const {
    data: fetchedSummary,
    isLoading,
    isFetching,
    refetch,
    dataUpdatedAt,
  } = useQuery({
    queryKey: ["liveCashFlow"],
    queryFn: () => getLiveCashFlowData(),
    refetchInterval: 30000, // Live poll every 30 seconds for JSON/treasury changes
    refetchOnWindowFocus: true, // Auto-refetch when user switches back to tab
    refetchOnReconnect: true,
    staleTime: 0,
  });

  // Real-time Firestore cloud subscription: any edit on PC or Mobile reflects instantly on all other devices!
  useEffect(() => {
    const unsubscribeStatus = subscribeCloudSyncStatus((nextStatus) => {
      setCloudSyncStatus(nextStatus);
      if (nextStatus === "error") {
        toast.error("تعذر حفظ التعديل على السحابة — تأكد من اتصال الإنترنت");
      }
    });

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const triggerRealtimeRefresh = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["liveCashFlow"] });
      }, 150);
    };

    const watchDoc = (docId: string) => {
      let isInitial = true;
      return onSnapshot(
        doc(db, FIRESTORE_CF_COLLECTION, docId),
        (snap) => {
          if (isInitial) {
            isInitial = false;
            return;
          }
          if (snap.metadata.hasPendingWrites) return;
          triggerRealtimeRefresh();
        },
        (err) => {
          console.warn(`Realtime listener warning (${docId}):`, err);
        }
      );
    };

    const unsubCycle = watchDoc(FIRESTORE_CF_CYCLE_DOC);
    const unsubOverrides = watchDoc(FIRESTORE_CF_OVERRIDES_DOC);
    const unsubPrevWeek = watchDoc(FIRESTORE_CF_PREV_WEEK_DOC);

    return () => {
      unsubscribeStatus();
      if (debounceTimer) clearTimeout(debounceTimer);
      unsubCycle();
      unsubOverrides();
      unsubPrevWeek();
    };
  }, [queryClient]);

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
      updates: { expectedAmount: number; isPinned: boolean; notes?: string }
    ) => {
      saveCustomerOverride(customerName, updates);

      setActiveSummary((prev) => {
        if (!prev) return prev;
        return recalculateCashFlowSummary(prev, customerName, updates, {
          skipSaveCycle: true,
        });
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

  const handleCustomersBulkDelete = useCallback((customerNames: string[]) => {
    setActiveSummary((prev) => {
      if (!prev) return prev;
      return deleteMultipleCustomersFromSummary(prev, customerNames);
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

  useEffect(() => {
    document.title = "تقرير التدفقات النقدية (Cash Flow)";
  }, []);

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

      <AppHeader
        title="التدفقات النقدية (Cash Flow)"
        activeSection="cashflow"
        printLayout={printLayout}
        setPrintLayout={setPrintLayout}
        statusBadge={
          <div
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border whitespace-nowrap ${
              cloudSyncStatus === "syncing"
                ? "bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300"
                : cloudSyncStatus === "error"
                ? "bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950/40 dark:text-rose-300"
                : "bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300"
            }`}
            title="حالة المزامنة اللحظية بين الكمبيوتر والموبايل"
          >
            <span
              className={`h-2 w-2 rounded-full shrink-0 ${
                cloudSyncStatus === "syncing"
                  ? "bg-amber-500 animate-ping"
                  : cloudSyncStatus === "error"
                  ? "bg-rose-500"
                  : "bg-emerald-500 animate-pulse"
              }`}
            />
            <span>
              {cloudSyncStatus === "syncing"
                ? "جاري المزامنة..."
                : cloudSyncStatus === "error"
                ? "خطأ مزامنة"
                : "متزامن لحظياً"}
            </span>
          </div>
        }
      />

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
              onCustomersBulkDelete={handleCustomersBulkDelete}
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
