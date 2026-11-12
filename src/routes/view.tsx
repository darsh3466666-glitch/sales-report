import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { getLatestReportFull } from "@/lib/reports.functions";
import { normalizeArabicName } from "@/lib/excel-parser.functions";
import { CustomerProductsDrawer } from "@/components/dashboard/CustomerProductsDrawer";
import { PrintDialog } from "@/components/dashboard/PrintDialog";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Moon,
  Sun,
  History,
  Download,
  RotateCw,
  Smartphone,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { exportReportToExcel } from "@/lib/export-excel";
import {
  DashboardContent,
  type DashData,
} from "@/components/dashboard/DashboardContent";

interface ViewSearchParams {
  reportId?: string;
}

export const Route = createFileRoute("/view")({
  ssr: false,
  component: ManagementView,
  validateSearch: (search: Record<string, unknown>): ViewSearchParams => {
    return {
      reportId: search.reportId as string | undefined,
    };
  },
});

function ManagementView() {
  const { reportId } = Route.useSearch();
  const [autoReady, setAutoReady] = useState(false);

  useEffect(() => {
    setAutoReady(true);
  }, []);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["latestReport", reportId, autoReady],
    queryFn: () => getLatestReportFull({ data: { reportId } }),
    enabled: autoReady,
    refetchInterval: 15000, // Live sync: auto check every 15s for new uploads
    refetchOnWindowFocus: true,
  });

  const [dark, setDark] = useState(() => {
    if (typeof document !== "undefined") {
      return document.documentElement.classList.contains("dark");
    }
    return false;
  });

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  const [printLayout, setPrintLayout] = useState<"pc" | "mobile">("mobile");
  const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null);

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  }

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

  function handleExport() {
    if (!data) {
      toast.error("لا توجد بيانات للتصدير");
      return;
    }
    try {
      exportReportToExcel(data as any);
      toast.success("تم تصدير ملف الإكسل");
    } catch (e) {
      toast.error("فشل التصدير");
      console.error(e);
    }
  }

  return (
    <div
      className={`min-h-screen bg-background print-layout-container print-layout-${printLayout} selection:bg-primary/20 pb-12`}
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

      {/* Management Mobile-First Header */}
      <header className="sticky top-0 z-20 border-b-2 sm:border-b-4 border-primary/20 bg-card/95 backdrop-blur-md no-print shadow-xs">
        <div className="container mx-auto px-3 sm:px-4 py-2.5 sm:py-3.5 flex items-center justify-between gap-2">
          {/* Right side: Branding & Live indicator */}
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="text-base sm:text-lg font-black text-primary-dark tracking-wide">
                  تقرير المبيعات والتحصيل
                </span>
                <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-extrabold px-2 py-0.5 rounded-full bg-accent/20 text-accent-dark border border-accent/30">
                  <ShieldCheck className="h-3 w-3" />
                  شاشة الإدارة
                </span>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground font-semibold">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span>بث مباشر لحظي</span>
                {isFetching && (
                  <span className="text-primary text-[10px] animate-pulse">
                    (جاري التحديث...)
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Left side: Executive Action Buttons */}
          <div className="flex items-center gap-1 sm:gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                refetch();
                toast.success("تم تحديث البيانات");
              }}
              disabled={isFetching}
              className="h-8 w-8 sm:h-9 sm:w-9 rounded-full bg-card shadow-xs border border-muted hover:border-primary/30"
              title="تحديث البيانات الآن"
            >
              <RotateCw
                className={`h-4 w-4 text-primary ${isFetching ? "animate-spin" : ""}`}
              />
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={handleExport}
              className="h-8 sm:h-9 px-2.5 sm:px-3.5 rounded-full font-bold bg-card shadow-xs border border-muted hover:border-primary/30"
              title="تصدير Excel"
            >
              <Download className="h-3.5 w-3.5 sm:ml-1.5 text-info" />
              <span className="hidden sm:inline text-xs">تصدير</span>
            </Button>

            <Link to="/history">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 sm:h-9 px-2.5 sm:px-3.5 rounded-full font-bold bg-card shadow-xs border border-muted hover:border-primary/30"
                title="السجل"
              >
                <History className="h-3.5 w-3.5 sm:ml-1.5 text-accent-dark" />
                <span className="hidden sm:inline text-xs">السجل</span>
              </Button>
            </Link>

            <PrintDialog
              printLayout={printLayout}
              setPrintLayout={setPrintLayout}
            />

            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              className="h-8 w-8 sm:h-9 sm:w-9 rounded-full bg-card shadow-xs border border-muted hover:border-primary/30"
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

      {/* Print-only header */}
      <div className="print-only px-4 py-3 border-b" dir="rtl">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold">
            تقرير المبيعات اليومي الشامل — المبيعات والتحصيل (الإدارة)
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

      {/* Main Content Area */}
      <main className="container mx-auto px-3 sm:px-4 py-3 sm:py-5 space-y-4 print:space-y-4 print:p-0 print:m-0">
        {isLoading && !data && (
          <div className="py-24 text-center space-y-3" dir="rtl">
            <div className="inline-flex p-3 rounded-full bg-primary/10 text-primary animate-pulse">
              <RotateCw className="h-6 w-6 animate-spin" />
            </div>
            <p className="text-base font-bold text-foreground">
              جاري تحميل تقرير الإدارة...
            </p>
          </div>
        )}

        {!isLoading && !data && (
          <Card className="rounded-2xl border-dashed">
            <CardContent className="p-10 text-center text-muted-foreground space-y-2">
              <p className="text-base font-bold text-foreground">
                لا توجد تقارير منشورة اليوم بعد
              </p>
              <p className="text-sm">
                سيظهر التقرير هنا تلقائياً بمجرد رفع البيانات اليومية من قِبل
                مسؤول النظام.
              </p>
            </CardContent>
          </Card>
        )}

        {data && (
          <DashboardContent
            data={data as DashData}
            onCustomerSelect={setSelectedCustomer}
            onUpdateSummary={() => refetch()}
            readOnly={true}
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
