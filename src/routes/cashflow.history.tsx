import React, { useState, useMemo } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  getArchivedCashFlowWeeks,
  ArchivedCashFlowWeek,
  CashFlowCustomer,
} from "@/lib/cashflow.functions";
import { fmtMoney, fmtPct } from "@/lib/formatters";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Archive,
  ArrowRight,
  BarChart3,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  FileSpreadsheet,
  Moon,
  Search,
  Sun,
  Target,
  TrendingUp,
  Wallet,
  Zap,
} from "lucide-react";
import * as XLSX from "xlsx";
import { toast } from "sonner";

export const Route = createFileRoute("/cashflow/history")({
  ssr: false,
  component: CashFlowHistoryPage,
});

function CashFlowHistoryPage() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedWeek, setSelectedWeek] = useState<ArchivedCashFlowWeek | null>(null);
  const [modalSearch, setModalSearch] = useState("");

  const { data: archivedWeeks, isLoading, refetch } = useQuery({
    queryKey: ["archivedCashFlowWeeks"],
    queryFn: () => getArchivedCashFlowWeeks(),
  });

  const [dark, setDark] = useState(() => {
    if (typeof document !== "undefined") {
      return document.documentElement.classList.contains("dark");
    }
    return false;
  });

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  }

  // Filter archived weeks by label or date
  const filteredWeeks = useMemo(() => {
    if (!archivedWeeks) return [];
    if (!searchQuery.trim()) return archivedWeeks;
    const q = searchQuery.toLowerCase();
    return archivedWeeks.filter(
      (w) =>
        w.weekLabel.toLowerCase().includes(q) ||
        w.startDate.includes(q) ||
        w.endDate.includes(q) ||
        w.id.toLowerCase().includes(q)
    );
  }, [archivedWeeks, searchQuery]);

  // Total metrics across all archived weeks
  const aggregateMetrics = useMemo(() => {
    if (!archivedWeeks || archivedWeeks.length === 0) {
      return { totalWeeks: 0, totalCollected: 0, avgRate: 0 };
    }
    const totalCollected = archivedWeeks.reduce(
      (sum, w) => sum + (w.totalCollected || 0),
      0
    );
    const avgRate =
      archivedWeeks.reduce((sum, w) => sum + (w.collectionRate || 0), 0) /
      archivedWeeks.length;
    return {
      totalWeeks: archivedWeeks.length,
      totalCollected,
      avgRate,
    };
  }, [archivedWeeks]);

  // Export week to Excel
  const handleExportWeek = (week: ArchivedCashFlowWeek) => {
    try {
      const rows = (week.customers || []).map((c, i) => ({
        "م": i + 1,
        "اسم العميل": c.customerName,
        "الرصيد الحالي": c.currentBalance,
        "المبلغ المتوقع": c.expectedAmount,
        "المحصل الفعلي": c.totalCollected,
        "من الخزينة": c.collectedFromTreasury,
        "من الشيت": c.collectedFromSheet,
        "المتبقي": c.remaining,
        "موعد الاستحقاق": c.dueDate || "-",
        "الحالة": c.status,
        "نسبة السداد": `${(c.rate * 100).toFixed(1)}%`,
        "ملاحظات": c.notes || "",
      }));

      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "الكاش فلو");
      const filename = `CashFlow_${week.startDate}_to_${week.endDate}.xlsx`;
      XLSX.writeFile(workbook, filename);
      toast.success(`تم تصدير ملف الإكسيل بنجاح: ${filename}`);
    } catch (err) {
      console.error("Export error:", err);
      toast.error("حدث خطأ أثناء تصدير ملف الإكسيل");
    }
  };

  // Filter modal customers
  const filteredModalCustomers = useMemo(() => {
    if (!selectedWeek || !selectedWeek.customers) return [];
    if (!modalSearch.trim()) return selectedWeek.customers;
    const q = modalSearch.toLowerCase();
    return selectedWeek.customers.filter(
      (c) =>
        c.customerName.toLowerCase().includes(q) ||
        (c.notes && c.notes.toLowerCase().includes(q)) ||
        c.status.toLowerCase().includes(q)
    );
  }, [selectedWeek, modalSearch]);

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      {/* Top Header */}
      <header className="sticky top-0 z-20 border-b-4 border-primary/20 bg-card/90 backdrop-blur no-print overflow-hidden relative">
        <div className="container mx-auto px-3 sm:px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          {/* Title Ribbon & Navigation Switcher */}
          <div className="flex items-center gap-3 sm:gap-6 flex-wrap">
            <div className="relative">
              <div className="relative bg-cream border-2 border-primary-dark px-3 py-1 z-10 shadow-md flex items-center justify-center">
                <h1 className="text-base sm:text-lg font-black text-primary-dark tracking-widest whitespace-nowrap flex items-center gap-2">
                  <Archive className="h-5 w-5 text-primary" />
                  أرشيف وسجل الكاش فلو
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
                  <span>تقرير المبيعات</span>
                </Button>
              </Link>
              <Link to="/cashflow">
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-full h-7 px-3 text-muted-foreground hover:text-foreground gap-1.5"
                >
                  <Wallet className="h-3.5 w-3.5 text-primary" />
                  <span>الكاش فلو الحالي</span>
                </Button>
              </Link>
              <Button
                variant="default"
                size="sm"
                className="rounded-full h-7 px-3 bg-primary text-primary-foreground shadow-sm gap-1.5"
              >
                <Archive className="h-3.5 w-3.5" />
                <span>سجل الأسابيع</span>
              </Button>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex items-center gap-2 mr-auto">
            <Link to="/cashflow">
              <Button
                variant="outline"
                size="sm"
                className="rounded-full font-bold border-2 border-primary/30 hover:bg-primary/10 gap-1.5 text-xs sm:text-sm"
              >
                <ArrowRight className="h-4 w-4" />
                <span>العودة للكاش فلو</span>
              </Button>
            </Link>
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

      {/* Main Content */}
      <main className="container mx-auto px-3 sm:px-4 py-6 space-y-6">
        {/* Aggregate Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="rounded-lg border-0 border-l-[6px] border-l-primary shadow-card bg-cream/30 dark:bg-card">
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-foreground/75">
                <span>إجمالي الأسابيع المؤرشفة</span>
                <Archive className="h-4 w-4 text-primary" />
              </div>
              <div className="text-3xl font-black text-foreground font-sans tabular-nums">
                {aggregateMetrics.totalWeeks}
              </div>
              <div className="text-xs text-muted-foreground font-semibold">
                دورة أسبوعية مسجلة وموثقة
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-lg border-0 border-l-[6px] border-l-emerald-600 shadow-card bg-cream/30 dark:bg-card">
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-foreground/75">
                <span>إجمالي المحصل التاريخي</span>
                <TrendingUp className="h-4 w-4 text-emerald-600" />
              </div>
              <div className="text-3xl font-black text-emerald-700 dark:text-emerald-400 font-sans tabular-nums">
                {fmtMoney(aggregateMetrics.totalCollected)}
              </div>
              <div className="text-xs text-emerald-700/80 font-bold">
                تحصيلات فعلية محفوظة
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-lg border-0 border-l-[6px] border-l-amber-500 shadow-card bg-cream/30 dark:bg-card">
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-foreground/75">
                <span>متوسط نسبة التحصيل</span>
                <Target className="h-4 w-4 text-amber-500" />
              </div>
              <div className="text-3xl font-black text-amber-700 dark:text-amber-400 font-sans tabular-nums">
                {fmtPct(aggregateMetrics.avgRate)}
              </div>
              <div className="text-xs text-muted-foreground font-semibold">
                معدل التحصيل عبر الدورات
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search & Actions Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-card p-4 rounded-2xl border-2 border-primary/20 shadow-sm">
          <div className="relative w-full sm:w-80">
            <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="البحث في الأسابيع السابقة..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pr-9 rounded-xl border-2 border-border focus-visible:border-primary text-xs sm:text-sm font-semibold"
            />
          </div>
          <div className="text-xs font-bold text-muted-foreground">
            عرض {filteredWeeks.length} من أصل {archivedWeeks?.length || 0} أسبوع
          </div>
        </div>

        {/* Archived Weeks Grid */}
        {isLoading ? (
          <div className="p-16 text-center space-y-3">
            <div className="h-8 w-8 border-3 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
            <div className="text-sm font-semibold text-muted-foreground">
              جاري تحميل سجل وأرشيف الكاش فلو...
            </div>
          </div>
        ) : filteredWeeks.length === 0 ? (
          <div className="p-16 text-center space-y-4 bg-card rounded-2xl border-2 border-dashed border-border">
            <Archive className="h-12 w-12 text-muted-foreground mx-auto stroke-1" />
            <h3 className="text-base font-bold text-foreground">
              لا توجد أسابيع مؤرشفة بعد
            </h3>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              عندما تنهي أسبوع كاش فلو من الصفحة الرئيسية عبر زر "إنهاء الأسبوع وبدء دورة جديدة"، ستظهر النسخ المحفوظة هنا مباشرة.
            </p>
            <Link to="/cashflow">
              <Button className="rounded-xl font-bold bg-primary hover:bg-primary-dark">
                الانتقال للكاش فلو الحالي
              </Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredWeeks.map((week) => {
              const achievePct =
                week.weeklyGoal > 0
                  ? (week.totalCollected / week.weeklyGoal) * 100
                  : 0;

              return (
                <Card
                  key={week.id}
                  className="rounded-xl border-0 border-l-[6px] border-l-emerald-600 shadow-card hover:shadow-teal-glow transition-all duration-200 bg-card overflow-hidden flex flex-col justify-between"
                >
                  <CardContent className="p-5 space-y-4">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2 border-b pb-3">
                      <div>
                        <h3 className="text-base font-black text-foreground flex items-center gap-1.5">
                          <Calendar className="h-4 w-4 text-primary shrink-0" />
                          {week.weekLabel}
                        </h3>
                        <div className="text-[11px] text-muted-foreground font-semibold mt-0.5">
                          تاريخ الأرشفة: {new Date(week.archivedAt).toLocaleDateString("ar-EG-u-nu-latn")}
                        </div>
                      </div>
                      <Badge
                        variant="secondary"
                        className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-sans font-bold text-xs"
                      >
                        {achievePct.toFixed(1)}% من الهدف
                      </Badge>
                    </div>

                    {/* Metrics Grid */}
                    <div className="grid grid-cols-2 gap-3 text-right">
                      <div className="bg-emerald-50/50 dark:bg-emerald-950/20 p-2.5 rounded-lg border border-emerald-500/20">
                        <div className="text-[11px] font-bold text-muted-foreground">
                          المحصل الفعلي
                        </div>
                        <div className="text-lg font-black text-emerald-700 dark:text-emerald-400 font-sans tabular-nums">
                          {fmtMoney(week.totalCollected)}
                        </div>
                      </div>

                      <div className="bg-primary/5 p-2.5 rounded-lg border border-primary/20">
                        <div className="text-[11px] font-bold text-muted-foreground">
                          المستهدف
                        </div>
                        <div className="text-lg font-black text-primary font-sans tabular-nums">
                          {fmtMoney(week.weeklyGoal)}
                        </div>
                      </div>

                      <div className="bg-muted/40 p-2.5 rounded-lg">
                        <div className="text-[11px] font-bold text-muted-foreground">
                          إجمالي المتوقع
                        </div>
                        <div className="text-base font-extrabold text-foreground font-sans tabular-nums">
                          {fmtMoney(week.totalExpected)}
                        </div>
                      </div>

                      <div className="bg-muted/40 p-2.5 rounded-lg">
                        <div className="text-[11px] font-bold text-muted-foreground">
                          نسبة التحصيل
                        </div>
                        <div className="text-base font-extrabold text-foreground font-sans tabular-nums">
                          {fmtPct(week.collectionRate)}
                        </div>
                      </div>
                    </div>

                    {/* Footer Stats */}
                    <div className="flex items-center justify-between text-xs text-muted-foreground font-semibold pt-1 border-t">
                      <span>العملاء: <strong className="font-sans text-foreground">{week.customerCount}</strong></span>
                      <span>متأخرون: <strong className="font-sans text-amber-600">{week.overdueCount}</strong></span>
                      {week.collectedFromTreasury > 0 && (
                        <span className="text-emerald-600 flex items-center gap-0.5">
                          <Zap className="h-3 w-3" />
                          خزينة: {fmtMoney(week.collectedFromTreasury)}
                        </span>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div className="grid grid-cols-2 gap-2 pt-2">
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => {
                          setSelectedWeek(week);
                          setModalSearch("");
                        }}
                        className="bg-primary hover:bg-primary-dark font-bold text-xs rounded-lg gap-1.5 shadow-sm"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        <span>استعراض الجدول</span>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleExportWeek(week)}
                        className="border-primary/30 hover:bg-primary/10 font-bold text-xs rounded-lg gap-1.5"
                      >
                        <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
                        <span>تصدير Excel</span>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>

      {/* Week Customers Modal Inspector */}
      <Dialog
        open={!!selectedWeek}
        onOpenChange={(open) => !open && setSelectedWeek(null)}
      >
        <DialogContent
          className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-6 border-2 border-primary/30 shadow-2xl"
          dir="rtl"
        >
          <DialogHeader className="space-y-1.5 text-right pb-3 border-b">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Archive className="h-5 w-5 text-primary" />
                <DialogTitle className="text-lg font-black text-foreground">
                  تفاصيل عملاء: {selectedWeek?.weekLabel}
                </DialogTitle>
              </div>
              {selectedWeek && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleExportWeek(selectedWeek)}
                  className="font-bold text-xs rounded-lg gap-1.5 border-emerald-500/30 text-emerald-700 hover:bg-emerald-50"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>تصدير هذا الأسبوع</span>
                </Button>
              )}
            </div>
            <DialogDescription className="text-xs text-muted-foreground font-semibold">
              إجمالي المحصل: {selectedWeek ? fmtMoney(selectedWeek.totalCollected) : 0} | عدد العملاء: {selectedWeek?.customerCount || 0}
            </DialogDescription>
          </DialogHeader>

          {/* Search bar inside modal */}
          <div className="my-3">
            <div className="relative">
              <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="بحث عن عميل داخل هذا الأسبوع..."
                value={modalSearch}
                onChange={(e) => setModalSearch(e.target.value)}
                className="pr-9 rounded-xl border-2 border-border text-xs font-semibold"
              />
            </div>
          </div>

          {/* Customers Table */}
          <div className="flex-1 overflow-auto rounded-xl border border-border">
            <Table>
              <TableHeader className="bg-muted/60 sticky top-0 z-10">
                <TableRow>
                  <TableHead className="w-12 text-center font-bold">م</TableHead>
                  <TableHead className="text-right font-bold">اسم العميل</TableHead>
                  <TableHead className="text-right font-bold">المتوقع</TableHead>
                  <TableHead className="text-right font-bold">المحصل</TableHead>
                  <TableHead className="text-right font-bold">المتبقي</TableHead>
                  <TableHead className="text-center font-bold">موعد الاستحقاق</TableHead>
                  <TableHead className="text-center font-bold">الحالة</TableHead>
                  <TableHead className="text-right font-bold">ملاحظات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredModalCustomers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-xs text-muted-foreground">
                      لا يوجد عملاء مطابقون للبحث
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredModalCustomers.map((c, idx) => (
                    <TableRow key={c.customerName || idx} className="hover:bg-muted/30">
                      <TableCell className="text-center font-sans font-semibold text-xs">
                        {idx + 1}
                      </TableCell>
                      <TableCell className="font-bold text-xs text-foreground">
                        {c.customerName}
                        {c.isPinned && (
                          <span className="mr-1.5 px-1.5 py-0.5 rounded text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 font-bold">
                            مثبت
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-sans font-bold text-xs tabular-nums">
                        {fmtMoney(c.expectedAmount)}
                      </TableCell>
                      <TableCell className="text-right font-sans font-bold text-xs text-emerald-700 dark:text-emerald-400 tabular-nums">
                        {fmtMoney(c.totalCollected)}
                      </TableCell>
                      <TableCell className="text-right font-sans font-bold text-xs text-rose-600 dark:text-rose-400 tabular-nums">
                        {fmtMoney(c.remaining)}
                      </TableCell>
                      <TableCell className="text-center font-sans text-xs text-muted-foreground">
                        {c.dueDate || "-"}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant="secondary"
                          className={`text-[10px] font-bold ${
                            c.status === "مكتمل"
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                              : c.status === "فائض"
                              ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
                              : c.status === "جزئي"
                              ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                              : "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                          }`}
                        >
                          {c.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground max-w-xs truncate">
                        {c.notes || "-"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
