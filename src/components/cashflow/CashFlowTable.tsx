import React, { useState, useMemo } from "react";
import { CashFlowCustomer, CashFlowSummary } from "@/lib/cashflow.functions";
import { fmtMoney, fmtPct } from "@/lib/formatters";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  Download,
  Edit2,
  Pin,
  AlertTriangle,
  Zap,
  CheckCircle2,
  Clock,
  XCircle,
  X,
  Check,
} from "lucide-react";
import { exportCashFlowToExcel } from "@/lib/export-cashflow";
import { toast } from "sonner";

interface CashFlowTableProps {
  summary: CashFlowSummary;
  onCustomerSave: (
    customerName: string,
    updates: { expectedAmount: number; isPinned: boolean; notes: string }
  ) => void;
  onRefresh?: () => void;
}

type FilterStatus = "all" | "completed" | "partial" | "unpaid" | "surplus" | "overdue";

export const CashFlowTable: React.FC<CashFlowTableProps> = ({
  summary,
  onCustomerSave,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<FilterStatus>("all");
  const [showUnmatchedTreasury, setShowUnmatchedTreasury] = useState(false);

  // Inline editing state: stores customerName of the row currently being edited
  const [editingCustomerName, setEditingCustomerName] = useState<string | null>(null);
  const [editExpected, setEditExpected] = useState<string>("0");
  const [editPinned, setEditPinned] = useState<boolean>(false);
  const [editNotes, setEditNotes] = useState<string>("");

  const todayStr = useMemo(() => new Date().toISOString().split("T")[0], []);

  const startEdit = (cust: CashFlowCustomer) => {
    setEditingCustomerName(cust.customerName);
    setEditExpected(String(cust.expectedAmount || 0));
    setEditPinned(Boolean(cust.isPinned));
    setEditNotes(cust.notes || "");
  };

  const cancelEdit = () => {
    setEditingCustomerName(null);
  };

  const saveEdit = (cust: CashFlowCustomer) => {
    const parsed = parseFloat(editExpected) || 0;
    // Immediately close editing row
    setEditingCustomerName(null);
    // Optimistically update memory and localStorage via parent (zero freeze)
    onCustomerSave(cust.customerName, {
      expectedAmount: parsed,
      isPinned: editPinned,
      notes: editNotes.trim(),
    });
  };

  // Filter counts
  const counts = useMemo(() => {
    let completed = 0;
    let partial = 0;
    let unpaid = 0;
    let surplus = 0;
    let overdue = 0;

    for (const c of summary.customers) {
      if (c.status === "مكتمل") completed++;
      else if (c.status === "جزئي") partial++;
      else if (c.status === "لم يسدد") unpaid++;
      else if (c.status === "فائض") surplus++;

      if (c.dueDate && c.dueDate < todayStr && c.remaining > 0) {
        overdue++;
      }
    }
    return {
      all: summary.customers.length,
      completed,
      partial,
      unpaid,
      surplus,
      overdue,
    };
  }, [summary.customers, todayStr]);

  // Filtered customers
  const filteredCustomers = useMemo(() => {
    return summary.customers.filter((c) => {
      // Search filter
      if (searchTerm.trim()) {
        const term = searchTerm.trim().toLowerCase();
        const matchesName =
          c.customerName.toLowerCase().includes(term) ||
          c.normalizedName.toLowerCase().includes(term);
        const matchesNotes = c.notes && c.notes.toLowerCase().includes(term);
        if (!matchesName && !matchesNotes) return false;
      }

      // Status filter
      if (statusFilter === "completed") return c.status === "مكتمل";
      if (statusFilter === "partial") return c.status === "جزئي";
      if (statusFilter === "unpaid") return c.status === "لم يسدد";
      if (statusFilter === "surplus") return c.status === "فائض";
      if (statusFilter === "overdue") {
        return c.dueDate && c.dueDate < todayStr && c.remaining > 0;
      }

      return true;
    });
  }, [summary.customers, searchTerm, statusFilter, todayStr]);

  const handleExport = () => {
    try {
      exportCashFlowToExcel(summary);
      toast.success("تم تصدير ملف الكاش فلو بنجاح");
    } catch (err) {
      console.error(err);
      toast.error("حدث خطأ أثناء تصدير الملف");
    }
  };

  const renderStatusBadge = (status: CashFlowCustomer["status"]) => {
    switch (status) {
      case "مكتمل":
        return (
          <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-2 border-emerald-400 font-black gap-1 text-xs sm:text-sm py-1 px-3 shadow-2xs">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <span>مكتمل</span>
          </Badge>
        );
      case "جزئي":
        return (
          <Badge className="bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300 border-2 border-amber-400 font-black gap-1 text-xs sm:text-sm py-1 px-3 shadow-2xs">
            <Clock className="h-4 w-4 text-amber-600" />
            <span>جزئي</span>
          </Badge>
        );
      case "لم يسدد":
        return (
          <Badge className="bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-300 border-2 border-rose-400 font-black gap-1 text-xs sm:text-sm py-1 px-3 shadow-2xs">
            <XCircle className="h-4 w-4 text-rose-600" />
            <span>لم يسدد</span>
          </Badge>
        );
      case "فائض":
        return (
          <Badge className="bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-300 border-2 border-blue-400 font-black gap-1 text-xs sm:text-sm py-1 px-3 shadow-2xs">
            <Zap className="h-4 w-4 text-blue-600" />
            <span>فائض</span>
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="text-muted-foreground text-xs sm:text-sm font-bold py-1 px-2.5">
            {status}
          </Badge>
        );
    }
  };

  return (
    <div className="space-y-4">
      {/* Search and Action Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-card p-4 rounded-2xl border-2 border-primary/20 shadow-sm">
        {/* Search input */}
        <div className="relative flex-1 min-w-[260px] max-w-md">
          <Search className="absolute right-3.5 top-3 h-4 w-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="بحث باسم العميل، الملاحظات..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pr-10 pl-9 text-sm font-bold rounded-full bg-background border-2 border-primary/20 focus:border-primary focus:outline-none h-11 px-3 text-foreground"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm("")}
              className="absolute left-3 top-3 p-0.5 rounded-full hover:bg-muted text-muted-foreground cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Export button */}
        <Button
          variant="outline"
          size="sm"
          onClick={handleExport}
          className="rounded-full gap-2 border-2 border-primary/30 font-black text-sm h-11 px-5 hover:bg-primary/10 mr-auto shadow-xs cursor-pointer"
        >
          <Download className="h-4 w-4 text-primary" />
          <span>تصدير شيت Excel</span>
        </Button>
      </div>

      {/* Filter Chips Bar */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={statusFilter === "all" ? "default" : "outline"}
          size="sm"
          onClick={() => setStatusFilter("all")}
          className="rounded-full text-xs sm:text-sm font-black h-9 px-4 cursor-pointer"
        >
          الكل ({counts.all})
        </Button>
        <Button
          variant={statusFilter === "completed" ? "default" : "outline"}
          size="sm"
          onClick={() => setStatusFilter("completed")}
          className="rounded-full text-xs sm:text-sm font-black h-9 px-4 text-emerald-700 dark:text-emerald-300 border-2 border-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 cursor-pointer"
        >
          مكتمل ({counts.completed})
        </Button>
        <Button
          variant={statusFilter === "partial" ? "default" : "outline"}
          size="sm"
          onClick={() => setStatusFilter("partial")}
          className="rounded-full text-xs sm:text-sm font-black h-9 px-4 text-amber-700 dark:text-amber-300 border-2 border-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40 cursor-pointer"
        >
          جزئي ({counts.partial})
        </Button>
        <Button
          variant={statusFilter === "unpaid" ? "default" : "outline"}
          size="sm"
          onClick={() => setStatusFilter("unpaid")}
          className="rounded-full text-xs sm:text-sm font-black h-9 px-4 text-rose-700 dark:text-rose-300 border-2 border-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
        >
          لم يسدد ({counts.unpaid})
        </Button>
        <Button
          variant={statusFilter === "overdue" ? "default" : "outline"}
          size="sm"
          onClick={() => setStatusFilter("overdue")}
          className="rounded-full text-xs sm:text-sm font-black h-9 px-4 text-destructive border-2 border-destructive hover:bg-rose-50 dark:hover:bg-rose-950/40 gap-1.5 cursor-pointer"
        >
          <AlertTriangle className="h-4 w-4" />
          <span>متأخرون ({counts.overdue})</span>
        </Button>
        {counts.surplus > 0 && (
          <Button
            variant={statusFilter === "surplus" ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter("surplus")}
            className="rounded-full text-xs sm:text-sm font-black h-9 px-4 text-blue-700 dark:text-blue-300 border-2 border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 cursor-pointer"
          >
            فائض ({counts.surplus})
          </Button>
        )}
      </div>

      {/* Unmatched Treasury Inflows Banner */}
      {summary.unmatchedTreasuryTx && summary.unmatchedTreasuryTx.length > 0 && (
        <div className="bg-primary/10 border-2 border-primary/30 rounded-2xl p-4 text-xs sm:text-sm shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-black text-foreground">
              <Zap className="h-5 w-5 text-emerald-500 fill-emerald-500" />
              <span>
                تحصيلات خزينة واردة اليوم ({summary.unmatchedTreasuryTx.length} عمليات بقيمة{" "}
                <span className="font-extrabold text-emerald-700 dark:text-emerald-400">
                  {fmtMoney(
                    summary.unmatchedTreasuryTx.reduce((s, t) => s + t.amount, 0)
                  )}
                </span>
                )
              </span>
            </div>
            <button
              onClick={() => setShowUnmatchedTreasury(!showUnmatchedTreasury)}
              className="text-xs h-7 px-3 text-primary font-bold hover:bg-primary/20 rounded-md cursor-pointer transition"
            >
              {showUnmatchedTreasury ? "إخفاء التفاصيل" : "عرض التفاصيل"}
            </button>
          </div>
          {showUnmatchedTreasury && (
            <div className="mt-3 pt-3 border-t border-primary/20 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {summary.unmatchedTreasuryTx.map((tx, idx) => (
                <div
                  key={idx}
                  className="bg-card p-2.5 rounded-xl border border-border flex items-center justify-between shadow-2xs"
                >
                  <div>
                    <div className="font-black text-sm text-foreground">{tx.description}</div>
                    <div className="text-xs text-muted-foreground font-medium">{tx.type}</div>
                  </div>
                  <div className="font-mono font-black text-sm text-emerald-600">
                    +{fmtMoney(tx.amount)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Cash Flow Main Data Table with Clear High-Legibility Numbers */}
      <div className="bg-card rounded-2xl border-2 border-primary/20 shadow-md overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/80">
              <TableRow className="border-b-2 border-primary/30 hover:bg-transparent">
                <TableHead className="w-12 text-center font-black text-foreground text-sm sm:text-base py-4">
                  م
                </TableHead>
                <TableHead className="font-black text-foreground text-sm sm:text-base min-w-[150px] text-right">
                  الرصيد الحالي
                </TableHead>
                <TableHead className="font-black text-foreground text-sm sm:text-base min-w-[260px] text-right">
                  العميل
                </TableHead>
                <TableHead className="font-black text-foreground text-sm sm:text-base min-w-[170px] text-right">
                  المتوقع
                </TableHead>
                <TableHead className="font-black text-foreground text-sm sm:text-base min-w-[150px] text-right">
                  المحصل
                </TableHead>
                <TableHead className="font-black text-foreground text-sm sm:text-base min-w-[130px] text-right">
                  موعد السداد
                </TableHead>
                <TableHead className="font-black text-foreground text-sm sm:text-base min-w-[110px] text-center">
                  نسبة السداد
                </TableHead>
                <TableHead className="font-black text-foreground text-sm sm:text-base min-w-[120px] text-center">
                  حالة السداد
                </TableHead>
                <TableHead className="font-black text-foreground text-sm sm:text-base min-w-[140px] text-right">
                  المتبقي
                </TableHead>
                <TableHead className="font-black text-foreground text-sm sm:text-base min-w-[190px] text-right">
                  ملاحظات
                </TableHead>
                <TableHead className="w-28 text-center font-black text-foreground text-sm sm:text-base">
                  إجراءات
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCustomers.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={11}
                    className="h-36 text-center text-muted-foreground text-base font-bold"
                  >
                    لا توجد بيانات مطابقة للبحث أو التصفية الحالية.
                  </TableCell>
                </TableRow>
              ) : (
                filteredCustomers.map((cust) => {
                  const isEditing = editingCustomerName === cust.customerName;
                  const isOverdue =
                    cust.dueDate && cust.dueDate < todayStr && cust.remaining > 0;
                  const hasTreasuryPayment = cust.collectedFromTreasury > 0;

                  if (isEditing) {
                    // INLINE EDITING ROW: Fast, 100% stable in-memory update, zero freeze!
                    return (
                      <TableRow
                        key={"edit-" + cust.customerName}
                        className="bg-primary/10 border-2 border-primary"
                      >
                        {/* Index */}
                        <TableCell className="text-center font-mono text-sm sm:text-base font-black text-primary py-4">
                          {cust.index}
                        </TableCell>

                        {/* Current Balance */}
                        <TableCell className="text-right py-4 whitespace-nowrap">
                          <span className="font-mono text-base sm:text-lg font-black text-foreground tabular-nums">
                            {fmtMoney(cust.currentBalance)}
                          </span>
                        </TableCell>

                        {/* Customer Name + Pin toggle */}
                        <TableCell className="py-4">
                          <div className="flex flex-col">
                            <span className="font-black text-base sm:text-lg text-foreground">
                              {cust.customerName}
                            </span>
                            <label className="inline-flex items-center gap-1.5 mt-1.5 cursor-pointer text-xs font-black text-primary bg-background px-2.5 py-1 rounded-md border border-primary/30 w-fit select-none shadow-2xs">
                              <input
                                type="checkbox"
                                checked={editPinned}
                                onChange={(e) => setEditPinned(e.target.checked)}
                                className="h-4 w-4 rounded accent-primary cursor-pointer"
                              />
                              <Pin className="h-3.5 w-3.5 rotate-45 text-primary" />
                              <span>تثبيت أسبوعياً</span>
                            </label>
                          </div>
                        </TableCell>

                        {/* Expected Input */}
                        <TableCell className="text-right py-4 whitespace-nowrap">
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-1.5">
                              <input
                                type="number"
                                min="0"
                                step="500"
                                value={editExpected}
                                onChange={(e) => setEditExpected(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") saveEdit(cust);
                                  if (e.key === "Escape") cancelEdit();
                                }}
                                className="w-36 text-left font-mono font-black text-base px-3 py-1.5 bg-background border-2 border-primary rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/40 text-foreground"
                                dir="ltr"
                                autoFocus
                              />
                              <span className="text-xs font-black text-muted-foreground">ج.م</span>
                            </div>
                            {cust.currentBalance > 0 && (
                              <button
                                type="button"
                                onClick={() => setEditExpected(String(cust.currentBalance))}
                                className="text-xs text-primary font-black hover:underline block cursor-pointer"
                              >
                                استخدام كامل الرصيد ({fmtMoney(cust.currentBalance)})
                              </button>
                            )}
                          </div>
                        </TableCell>

                        {/* Collected (Static) */}
                        <TableCell className="text-right py-4 whitespace-nowrap">
                          <div className="font-mono text-base sm:text-lg font-black text-emerald-700 dark:text-emerald-400 tabular-nums">
                            {fmtMoney(cust.totalCollected)}
                          </div>
                        </TableCell>

                        {/* Due Date */}
                        <TableCell className="text-right py-4 whitespace-nowrap text-sm font-mono font-bold text-foreground">
                          {cust.dueDate || "-"}
                        </TableCell>

                        {/* Rate */}
                        <TableCell className="text-center py-4 whitespace-nowrap font-mono text-base font-black">
                          {fmtPct(cust.rate)}
                        </TableCell>

                        {/* Status */}
                        <TableCell className="text-center py-4">
                          {renderStatusBadge(cust.status)}
                        </TableCell>

                        {/* Remaining */}
                        <TableCell className="text-right py-4 whitespace-nowrap font-mono text-base font-black text-muted-foreground">
                          {fmtMoney(cust.remaining)}
                        </TableCell>

                        {/* Notes Input */}
                        <TableCell className="text-right py-4">
                          <input
                            type="text"
                            value={editNotes}
                            onChange={(e) => setEditNotes(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveEdit(cust);
                              if (e.key === "Escape") cancelEdit();
                            }}
                            placeholder="ملاحظات التحصيل..."
                            className="w-full text-xs sm:text-sm font-medium px-3 py-1.5 bg-background border-2 border-border rounded-xl focus:outline-none focus:border-primary text-foreground"
                          />
                        </TableCell>

                        {/* Save & Cancel Buttons */}
                        <TableCell className="text-center py-4">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => saveEdit(cust)}
                              className="h-9 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs sm:text-sm flex items-center gap-1.5 shadow-xs cursor-pointer transition active:scale-95"
                              title="حفظ التعديلات (Enter)"
                            >
                              <Check className="h-4 w-4" />
                              <span>حفظ</span>
                            </button>
                            <button
                              type="button"
                              onClick={cancelEdit}
                              className="h-9 px-2.5 rounded-xl border border-border hover:bg-muted text-muted-foreground hover:text-foreground text-xs sm:text-sm flex items-center transition cursor-pointer"
                              title="إلغاء (Esc)"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  }

                  // NORMAL ROW: Large numbers, comfortable clear spacing
                  return (
                    <TableRow
                      key={cust.index + "-" + cust.customerName}
                      className={`border-b border-border/80 transition-colors hover:bg-muted/40 ${
                        cust.status === "مكتمل"
                          ? "bg-emerald-500/[0.04]"
                          : cust.status === "جزئي"
                          ? "bg-amber-500/[0.04]"
                          : cust.status === "فائض"
                          ? "bg-blue-500/[0.04]"
                          : ""
                      }`}
                    >
                      {/* Index */}
                      <TableCell className="text-center font-mono text-sm sm:text-base font-bold text-muted-foreground py-4">
                        {cust.index}
                      </TableCell>

                      {/* Current Balance in Master_Data */}
                      <TableCell className="text-right py-4 whitespace-nowrap">
                        <span className="font-mono text-base sm:text-lg font-black text-foreground tabular-nums tracking-tight">
                          {fmtMoney(cust.currentBalance)}
                        </span>
                      </TableCell>

                      {/* Customer Name */}
                      <TableCell className="py-4">
                        <div
                          onClick={() => startEdit(cust)}
                          className="flex flex-col cursor-pointer group"
                          title="انقر لتعديل بيانات العميل"
                        >
                          <span className="font-black text-base sm:text-lg text-foreground group-hover:text-primary transition-colors">
                            {cust.customerName}
                          </span>
                          <div className="flex items-center gap-1.5 mt-1">
                            {cust.isPinned ? (
                              <span className="inline-flex items-center gap-1 text-xs font-black text-primary bg-primary/15 border border-primary/30 px-2.5 py-0.5 rounded-md">
                                <Pin className="h-3 w-3 rotate-45" />
                                قسط أسبوعي ثابت
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </TableCell>

                      {/* Expected */}
                      <TableCell className="text-right py-4 whitespace-nowrap">
                        <div
                          onClick={() => startEdit(cust)}
                          className="inline-block cursor-pointer group"
                          title="انقر لتعديل المبلغ المتوقع"
                        >
                          <span className="font-mono text-base sm:text-lg font-black text-primary tabular-nums tracking-tight bg-primary/10 border-2 border-primary/25 px-3 py-1.5 rounded-xl group-hover:bg-primary/20 group-hover:border-primary transition">
                            {fmtMoney(cust.expectedAmount)}
                          </span>
                        </div>
                      </TableCell>

                      {/* Collected */}
                      <TableCell className="text-right py-4 whitespace-nowrap">
                        <div className="font-mono text-base sm:text-lg font-black text-emerald-700 dark:text-emerald-400 tabular-nums tracking-tight">
                          {fmtMoney(cust.totalCollected)}
                        </div>
                        {hasTreasuryPayment && (
                          <div className="inline-flex items-center gap-1 text-xs font-black text-emerald-800 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950 px-2.5 py-0.5 rounded-md border border-emerald-300 mt-1">
                            <Zap className="h-3.5 w-3.5 fill-emerald-500" />
                            <span>+{fmtMoney(cust.collectedFromTreasury)} خزينة</span>
                          </div>
                        )}
                      </TableCell>

                      {/* Due Date */}
                      <TableCell className="text-right py-4 whitespace-nowrap">
                        {cust.dueDate ? (
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`font-mono text-xs sm:text-sm font-bold ${
                                isOverdue
                                  ? "text-rose-600 dark:text-rose-400 font-black bg-rose-100 dark:bg-rose-950 px-2 py-0.5 rounded border border-rose-300"
                                  : "text-foreground"
                              }`}
                            >
                              {cust.dueDate}
                            </span>
                            {isOverdue && (
                              <span title="تجاوز موعد السداد">
                                <AlertTriangle className="h-4 w-4 text-rose-600 animate-pulse" />
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground font-bold">-</span>
                        )}
                      </TableCell>

                      {/* Collection Rate */}
                      <TableCell className="text-center py-4 whitespace-nowrap">
                        <span className="font-mono text-base sm:text-lg font-black text-foreground tabular-nums">
                          {fmtPct(cust.rate)}
                        </span>
                      </TableCell>

                      {/* Status Badge */}
                      <TableCell className="text-center py-4">
                        {renderStatusBadge(cust.status)}
                      </TableCell>

                      {/* Remaining */}
                      <TableCell className="text-right py-4 whitespace-nowrap">
                        <span
                          className={`font-mono text-base sm:text-lg font-black tabular-nums tracking-tight ${
                            cust.remaining > 0
                              ? "text-rose-600 dark:text-rose-400"
                              : cust.remaining < 0
                              ? "text-blue-600 dark:text-blue-400"
                              : "text-emerald-600 dark:text-emerald-400"
                          }`}
                        >
                          {fmtMoney(cust.remaining)}
                        </span>
                      </TableCell>

                      {/* Notes */}
                      <TableCell className="text-right py-4 text-xs sm:text-sm text-foreground/80 font-semibold max-w-[190px] truncate">
                        {cust.notes || "-"}
                      </TableCell>

                      {/* Actions */}
                      <TableCell className="text-center py-4">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => startEdit(cust)}
                          className="h-9 px-3.5 rounded-xl border-2 border-primary/30 hover:border-primary hover:bg-primary/10 text-primary font-black text-xs sm:text-sm gap-1.5 cursor-pointer shadow-2xs"
                          title="تعديل المبلغ والملاحظات"
                        >
                          <Edit2 className="h-4 w-4" />
                          <span>تعديل</span>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
};
