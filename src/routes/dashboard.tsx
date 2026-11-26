import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getLatestReportFull } from "@/lib/reports.functions";
import { normalizeArabicName } from "@/lib/excel-parser.functions";
import { CustomerProductsDrawer } from "@/components/dashboard/CustomerProductsDrawer";
import { AppHeader } from "@/components/layout/AppHeader";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import {
  DashboardContent,
  type DashData,
} from "@/components/dashboard/DashboardContent";

interface DashboardSearchParams {
  reportId?: string;
}

export const Route = createFileRoute("/dashboard")({
  ssr: false,
  component: Dashboard,
  validateSearch: (search: Record<string, unknown>): DashboardSearchParams => {
    return {
      reportId: search.reportId as string | undefined,
    };
  },
});

function Dashboard() {
  const { reportId } = Route.useSearch();
  const queryClient = useQueryClient();
  const [autoReady, setAutoReady] = useState(false);

  useEffect(() => {
    setAutoReady(true);
  }, []);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["latestReport", reportId, autoReady],
    queryFn: () => getLatestReportFull({ data: { reportId } }),
    enabled: autoReady,
    refetchInterval: 30000, // Live poll every 30 seconds exactly like treasury-dashboard
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    staleTime: 0,
  });

  // Real-time Firestore listener so newly uploaded/updated sales reports sync immediately across PC and Mobile
  useEffect(() => {
    let isInitial = true;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const unsub = onSnapshot(
      collection(db, "reports"),
      (snap) => {
        if (isInitial) {
          isInitial = false;
          return;
        }
        if (snap.metadata.hasPendingWrites) return;
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ["latestReport"] });
        }, 250);
      },
      (err) => {
        console.warn("Reports realtime listener warning:", err);
      }
    );
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      unsub();
    };
  }, [queryClient]);

  const [printLayout, setPrintLayout] = useState<"pc" | "mobile">("mobile");
  const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null);

  const customerProductsForSelected = useMemo(() => {
    if (!selectedCustomer || !data) return [];
    const targetNorm = normalizeArabicName(selectedCustomer);
    return (data.customerProducts || []).filter(
      (p: any) =>
        p.customer_name === selectedCustomer ||
        normalizeArabicName(p.customer_name) === targetNorm,
    );
  }, [selectedCustomer, data]);

  const customerInvoicesForSelected = useMemo(() => {
    if (!selectedCustomer || !data) return [];
    const targetNorm = normalizeArabicName(selectedCustomer);
    return (data.invoices || []).filter(
      (inv: any) =>
        inv.customer_name === selectedCustomer ||
        normalizeArabicName(inv.customer_name) === targetNorm,
    );
  }, [selectedCustomer, data]);

  if (isLoading)
    return (
      <div className="p-8 text-center" dir="rtl">
        جاري التحميل...
      </div>
    );

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
              "@media print { @page { size: A4 landscape; margin: 6mm 10mm; } }",
          }}
        />
      ) : (
        <style
          dangerouslySetInnerHTML={{
            __html:
              "@media print { @page { size: A4 portrait; margin: 10mm 10mm; } }",
          }}
        />
      )}

      <AppHeader
        title="تقرير المبيعات اليومي الشامل"
        activeSection="dashboard"
        decorativeBg
        liveStatus="live"
        liveStatusTitle="بث مباشر (تحديث تلقائي كل 30 ثانية)"
        onRefresh={async () => {
          try {
            await refetch();
            toast.success("تم تحديث البيانات لحظياً بنجاح");
          } catch {
            toast.error("فشل تحديث البيانات");
          }
        }}
        isRefreshing={isFetching}
        historyTo="/history"
        historyTitle="سجل التقارير السابقة"
        printLayout={printLayout}
        setPrintLayout={setPrintLayout}
      />

      <div className="print-only px-4 py-3 border-b" dir="rtl">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold">
            تقرير المبيعات اليومي الشامل — المبيعات والتحصيل
          </h1>
          <div className="text-xs">
            تاريخ الطباعة:{" "}
            {new Date().toLocaleString("ar-EG-u-nu-latn", {
              dateStyle: "full",
              timeStyle: "short",
            })}
          </div>
        </div>
      </div>

      <main className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4 sm:space-y-6 print:space-y-4 print:p-0 print:m-0">
        {!data && (
          <Card>
            <CardContent className="p-12 text-center text-muted-foreground">
              لا توجد تقارير متاحة حالياً.
            </CardContent>
          </Card>
        )}

        {data && (
          <DashboardContent
            data={data as DashData}
            onCustomerSelect={setSelectedCustomer}
            onUpdateSummary={() => refetch()}
            readOnly={false}
          />
        )}
      </main>

      <CustomerProductsDrawer
        open={!!selectedCustomer}
        onClose={() => setSelectedCustomer(null)}
        customer={selectedCustomer}
        products={customerProductsForSelected as any}
        invoices={customerInvoicesForSelected as any}
      />
    </div>
  );
}
