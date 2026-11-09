import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState, useRef } from "react";
import { getLatestReportFull, resetAllReports } from "@/lib/reports.functions";
import { normalizeArabicName } from "@/lib/excel-parser.functions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Trash2, Moon, Sun, History, Download, BarChart3, Wallet, RefreshCw } from "lucide-react";
import { UploadDialog } from "@/components/dashboard/UploadDialog";
import { CustomerProductsDrawer } from "@/components/dashboard/CustomerProductsDrawer";
import { PrintDialog } from "@/components/dashboard/PrintDialog";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { exportReportToExcel } from "@/lib/export-excel";
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
    staleTime: 15000,
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

  const [printLayout, setPrintLayout] = useState<"pc" | "mobile">("pc");
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

  if (isLoading)
    return (
      <div className="p-8 text-center" dir="rtl">
        جاري التحميل...
      </div>
    );

  function handleExport() {
    if (!data) {
      toast.error("لا توجد بيانات للتصدير");
      return;
    }
    try {
      exportReportToExcel(data as any);
      toast.success("تم تصدير الملف");
    } catch (e) {
      toast.error("فشل التصدير");
      console.error(e);
    }
  }

  return (
    <div
      className={`min-h-screen bg-background print-layout-${printLayout}`}
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

      <header className="sticky top-0 z-10 border-b-4 border-primary/20 bg-card/90 backdrop-blur no-print overflow-hidden relative">
        <div className="absolute inset-0 pointer-events-none opacity-5">
          <div className="absolute -top-10 -right-10 w-32 h-48 bg-primary rounded-xl rotate-12" />
          <div className="absolute -top-12 right-10 w-32 h-48 bg-accent rounded-xl -rotate-6" />
          <div className="absolute -top-8 right-24 w-32 h-48 bg-destructive rounded-xl rotate-[24deg]" />
        </div>
        <div className="container mx-auto px-3 sm:px-4 py-3 sm:py-4 flex flex-wrap items-center justify-between gap-3 relative z-10">
          <div className="flex items-center gap-2 sm:gap-4 scale-75 sm:scale-100 origin-right">
            <div className="relative">
              {/* Folded ribbon for title */}
              <div className="relative bg-cream border-2 border-primary-dark px-3 py-1 z-10 shadow-md flex items-center justify-center">
                <h1 className="text-base sm:text-lg font-black text-primary-dark tracking-widest whitespace-nowrap">
                  تقرير المبيعات اليومي الشامل
                </h1>
              </div>
              {/* Ribbon Tails */}
              <div className="absolute top-1.5 -left-2 w-3 h-full bg-[#E5DFCA] border-2 border-primary-dark -z-10 skew-y-[20deg]"></div>
              <div className="absolute top-1.5 -right-2 w-3 h-full bg-[#E5DFCA] border-2 border-primary-dark -z-10 -skew-y-[20deg]"></div>
            </div>

            {/* Navigation Tabs Switcher */}
            <div className="hidden md:flex items-center p-1 bg-muted/80 rounded-full border border-border text-xs font-bold shadow-inner">
              <Button
                variant="default"
                size="sm"
                className="rounded-full h-7 px-3 bg-primary text-primary-foreground shadow-sm gap-1.5"
              >
                <BarChart3 className="h-3.5 w-3.5" />
                <span>المبيعات والتحصيل</span>
              </Button>
              <Link to="/cashflow">
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-full h-7 px-3 text-muted-foreground hover:text-foreground gap-1.5"
                >
                  <Wallet className="h-3.5 w-3.5 text-emerald-600" />
                  <span>الكاش فلو (Cash Flow)</span>
                </Button>
              </Link>
            </div>
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            {/* Live Indicator like treasury dashboard */}
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-400">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>شاشة حية (تحديث كل 30 ثانية)</span>
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              className="px-2.5 sm:px-3 rounded-full font-bold bg-card shadow-sm border border-muted hover:border-primary/30"
              title="تحديث لحظي"
            >
              <RefreshCw
                className={`h-4 w-4 sm:ml-1.5 text-primary ${isFetching ? "animate-spin" : ""}`}
              />
              <span className="hidden sm:inline">تحديث</span>
            </Button>

            <Link to="/cashflow" className="md:hidden">
              <Button
                variant="ghost"
                size="sm"
                className="px-2.5 rounded-full font-bold bg-card shadow-sm border border-muted hover:border-primary/30"
                title="الكاش فلو"
              >
                <Wallet className="h-4 w-4 text-emerald-600" />
                <span className="text-xs">كاش فلو</span>
              </Button>
            </Link>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleExport}
              className="px-3 sm:px-4 rounded-full font-bold bg-card shadow-sm border border-muted hover:border-primary/30"
              title="تصدير Excel"
            >
              <Download className="h-4 w-4 sm:ml-2 text-info" />
              <span className="hidden sm:inline">تصدير</span>
            </Button>
            <Link to="/history">
              <Button
                variant="ghost"
                size="sm"
                className="px-3 sm:px-4 rounded-full font-bold bg-card shadow-sm border border-muted hover:border-primary/30"
              >
                <History className="h-4 w-4 sm:ml-2 text-accent-dark" />
                <span className="hidden sm:inline">السجل</span>
              </Button>
            </Link>
            <PrintDialog
              printLayout={printLayout}
              setPrintLayout={setPrintLayout}
            />
            <ResetButton onDone={() => refetch()} />
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              className="rounded-full bg-card shadow-sm border border-muted hover:border-primary/30 ml-2"
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
        <div className="no-print">
          <UploadDialog
            onUploaded={() => {
              refetch();
              toast.success("تم التحديث");
            }}
          />
        </div>

        {!data && (
          <Card>
            <CardContent className="p-12 text-center text-muted-foreground">
              لا توجد تقارير مستوردة بعد. ارفع ملفاتك للبدء.
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
      />
    </div>
  );
}

function ResetButton({ onDone }: { onDone: () => void }) {
  const [loading, setLoading] = useState(false);
  const isMounted = useRef(false);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  async function handleReset() {
    setLoading(true);
    try {
      await resetAllReports();
      toast.success("تم تصفير جميع السجلات");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل التصفير");
    } finally {
      if (isMounted.current) {
        setLoading(false);
      }
    }
  }
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="px-2 sm:px-3 text-destructive hover:text-destructive"
          title="تصفير"
        >
          <Trash2 className="h-4 w-4 sm:ml-1" />
          <span className="hidden sm:inline">تصفير</span>
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent dir="rtl">
        <AlertDialogHeader>
          <AlertDialogTitle>تصفير جميع السجلات؟</AlertDialogTitle>
          <AlertDialogDescription>
            سيتم حذف جميع التقارير اليومية والعملاء والمنتجات والمديونية القديمة
            نهائياً. هذا الإجراء لا يمكن التراجع عنه.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>إلغاء</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleReset}
            disabled={loading}
            className="bg-destructive hover:bg-destructive/90"
          >
            {loading ? "جاري التصفير..." : "نعم، صفّر الكل"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
