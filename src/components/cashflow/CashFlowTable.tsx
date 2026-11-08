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
import { Input } from "@/components/ui/input";
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
} from "lucide-react";
import { exportCashFlowToExcel } from "@/lib/export-cashflow";
import { CashFlowEditModal } from "./CashFlowEditModal";
import { toast } from "sonner";

interface CashFlowTableProps {
  summary: CashFlowSummary;
  onDataChanged: () => void;
}

type FilterStatus = "all" | "completed" | "partial" | "unpaid" | "surplus" | "overdue";

export const CashFlowTable: React.FC<CashFlowTableProps> = ({
  summary,
  onDataChanged,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<FilterStatus>("all");
  const [editingCustomer, setEditingCustomer] = useState<CashFlowCustomer | null>(null);
  const [showUnmatchedTreasury, setShowUnmatchedTreasury] = useState(false);

  const handleCloseModal = React.useCallback(() => {
    setEditingCustomer(null);
  }, []);

  const todayStr = useMemo(() => new Date().toISOString().split("T")[0], []);

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
          <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-2 border-emerald-400 font-black gap-1 text-xs py-1 px-2.5 shadow-2xs">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            <span>مكتمل</span>
          </Badge>
        );
      case "جزئي":
        return (
          <Badge className="bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300 border-2 border-amber-400 font-black gap-1 text-xs py-1 px-2.5 shadow-2xs">
            <Clock className="h-3.5 w-3.5 text-amber-600" />
            <span>جزئي</span>
          </Badge>
        );
      case "لم يسدد":
        return (
          <Badge className="bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-300 border-2 border-rose-400 font-black gap-1 text-xs py-1 px-2.5 shadow-2xs">
            <XCircle className="h-3.5 w-3.5 text-rose-600" />
            <span>لم يسدد</span>
          </Badge>
        );
      case "فائض":
        return (
          <Badge className="bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-300 border-2 border-blue-400 font-black gap-1 text-xs py-1 px-2.5 shadow-2xs">
            <Zap className="h-3.5 w-3.5 text-blue-600" />
            <span>فائض</span>
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="text-muted-foreground text-xs font-bold py-1 px-2">
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
          <Input
            placeholder="بحث باسم العميل، الملاحظات..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pr-10 pl-9 text-sm font-semibold rounded-full bg-background border-2 border-primary/20 focus:border-primary h-10"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm("")}
              className="absolute left-3 top-2.5 p-0.5 rounded-full hover:bg-muted text-muted-foreground"
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
          className="rounded-full gap-2 border-2 border-primary/30 font-black text-sm h-10 px-5 hover:bg-primary/10 mr-auto shadow-xs"
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
          className="rounded-full text-xs sm:text-sm font-black h-9 px-3.5"
        >
          الكل ({counts.all})
        </Button>
        <Button
          variant={statusFilter === "completed" ? "default" : "outline"}
          size="sm"
          onClick={() => setStatusFilter("completed")}
          className="rounded-full text-xs sm:text-sm font-black h-9 px-3.5 text-emerald-700 dark:text-emerald-300 border-2 border-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
        >
          مكتمل ({counts.completed})
        </Button>
        <Button
          variant={statusFilter === "partial" ? "default" : "outline"}
          size="sm"
          onClick={() => setStatusFilter("partial")}
          className="rounded-full text-xs sm:text-sm font-black h-9 px-3.5 text-amber-700 dark:text-amber-300 border-2 border-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40"
        >
          جزئي ({counts.partial})
        </Button>
        <Button
          variant={statusFilter === "unpaid" ? "default" : "outline"}
          size="sm"
          onClick={() => setStatusFilter("unpaid")}
          className="rounded-full text-xs sm:text-sm font-black h-9 px-3.5 text-rose-700 dark:text-rose-300 border-2 border-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40"
        >
          لم يسدد ({counts.unpaid})
        </Button>
        <Button
          variant={statusFilter === "overdue" ? "default" : "outline"}
          size="sm"
          onClick={() => setStatusFilter("overdue")}
          className="rounded-full text-xs sm:text-sm font-black h-9 px-3.5 text-destructive border-2 border-destructive hover:bg-rose-50 dark:hover:bg-rose-950/40 gap-1.5"
        >
          <AlertTriangle className="h-4 w-4" />
          <span>متأخرون ({counts.overdue})</span>
        </Button>
        {counts.surplus > 0 && (
          <Button
            variant={statusFilter === "surplus" ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter("surplus")}
            className="rounded-full text-xs sm:text-sm font-black h-9 px-3.5 text-blue-700 dark:text-blue-300 border-2 border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40"
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
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowUnmatchedTreasury(!showUnmatchedTreasury)}
              className="text-xs h-7 px-3 text-primary font-bold hover:bg-primary/20"
            >
              {showUnmatchedTreasury ? "إخفاء التفاصيل" : "عرض التفاصيل"}
            </Button>
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

      {/* Cash Flow Main Data Table */}
      <div className="bg-card rounded-2xl border-2 border-primary/20 shadow-md overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/80">
              <TableRow className="border-b-2 border-primary/30 hover:bg-transparent">
                <TableHead className="w-12 text-center font-black text-foreground text-sm py-3.5">
                  م
                </TableHead>
                <TableHead className="font-black text-foreground text-sm min-w-[140px] text-right">
                  الرصيد الحالي
                </TableHead>
                <TableHead className="font-black text-foreground text-sm min-w-[240px] text-right">
                  العميل
                </TableHead>
                <TableHead className="font-black text-foreground text-sm min-w-[130px] text-right">
                  المتوقع
                </TableHead>
                <TableHead className="font-black text-foreground text-sm min-w-[140px] text-right">
                  المحصل
                </TableHead>
                <TableHead className="font-black text-foreground text-sm min-w-[120px] text-right">
                  موعد السداد
                </TableHead>
                <TableHead className="font-black text-foreground text-sm min-w-[100px] text-center">
                  نسبة السداد
                </TableHead>
                <TableHead className="font-black text-foreground text-sm min-w-[110px] text-center">
                  حالة السداد
                </TableHead>
                <TableHead className="font-black text-foreground text-sm min-w-[130px] text-right">
                  المتبقي
                </TableHead>
                <TableHead className="font-black text-foreground text-sm min-w-[170px] text-right">
                  ملاحظات
                </TableHead>
                <TableHead className="w-24 text-center font-black text-foreground text-sm">
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
                  const isOverdue =
                    cust.dueDate && cust.dueDate < todayStr && cust.remaining > 0;
                  const hasTreasuryPayment = cust.collectedFromTreasury > 0;

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
                      <TableCell className="text-center font-mono text-sm font-bold text-muted-foreground py-3.5">
                        {cust.index}
                      </TableCell>

                      {/* Current Balance in Master_Data */}
                      <TableCell className="text-right py-3.5 whitespace-nowrap">
                        <span className="font-mono text-sm sm:text-base font-extrabold text-foreground tabular-nums">
                          {fmtMoney(cust.currentBalance)}
                        </span>
                      </TableCell>

                      {/* Customer Name */}
                      <TableCell className="py-3.5">
                        <div
                          onClick={() => setEditingCustomer(cust)}
                          className="flex flex-col cursor-pointer group"
                          title="انقر لتعديل بيانات العميل"
                        >
                          <span className="font-black text-sm sm:text-base text-foreground group-hover:text-primary transition-colors">
                            {cust.customerName}
                          </span>
                          <div className="flex items-center gap-1.5 mt-1">
                            {cust.isPinned ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-black text-primary bg-primary/15 border border-primary/30 px-2 py-0.5 rounded-md">
                                <Pin className="h-3 w-3 rotate-45" />
                                قسط أسبوعي ثابت
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </TableCell>

                      {/* Expected */}
                      <TableCell className="text-right py-3.5 whitespace-nowrap">
                        <div
                          onClick={() => setEditingCustomer(cust)}
                          className="inline-block cursor-pointer group"
                          title="انقر لتعديل المبلغ المتوقع"
                        >
                          <span className="font-mono text-sm sm:text-base font-black text-primary tabular-nums bg-primary/10 border border-primary/25 px-2.5 py-1 rounded-lg group-hover:bg-primary/20 transition">
                            {fmtMoney(cust.expectedAmount)}
                          </span>
                        </div>
                      </TableCell>

                      {/* Collected */}
                      <TableCell className="text-right py-3.5 whitespace-nowrap">
                        <div className="font-mono text-sm sm:text-base font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
                          {fmtMoney(cust.totalCollected)}
                        </div>
                        {hasTreasuryPayment && (
                          <div className="inline-flex items-center gap-1 text-[11px] font-black text-emerald-800 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950 px-2 py-0.5 rounded border border-emerald-300 mt-1">
                            <Zap className="h-3 w-3 fill-emerald-500" />
                            <span>+{fmtMoney(cust.collectedFromTreasury)} خزينة</span>
                          </div>
                        )}
                      </TableCell>

                      {/* Due Date */}
                      <TableCell className="text-right py-3.5 whitespace-nowrap">
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
                      <TableCell className="text-center py-3.5 whitespace-nowrap">
                        <span className="font-mono text-sm sm:text-base font-black text-foreground tabular-nums">
                          {fmtPct(cust.rate)}
                        </span>
                      </TableCell>

                      {/* Status Badge */}
                      <TableCell className="text-center py-3.5">
                        {renderStatusBadge(cust.status)}
                      </TableCell>

                      {/* Remaining */}
                      <TableCell className="text-right py-3.5 whitespace-nowrap">
                        <span
                          className={`font-mono text-sm sm:text-base font-black tabular-nums ${
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
                      <TableCell className="text-right py-3.5 text-xs sm:text-sm text-foreground/80 font-medium max-w-[180px] truncate">
                        {cust.notes || "-"}
                      </TableCell>

                      {/* Actions */}
                      <TableCell className="text-center py-3.5">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEditingCustomer(cust)}
                          className="h-8 px-3 rounded-xl border-2 border-primary/30 hover:border-primary hover:bg-primary/10 text-primary font-black text-xs gap-1.5 cursor-pointer shadow-2xs"
                          title="تعديل المبلغ والملاحظات"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
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

      {/* Edit Modal (Rock Solid Pure React Modal) */}
      <CashFlowEditModal
        customer={editingCustomer}
        isOpen={Boolean(editingCustomer)}
        onClose={handleCloseModal}
        onSaved={onDataChanged}
      />
    </div>
  );
};
