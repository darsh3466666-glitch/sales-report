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
  Info,
  CheckCircle2,
  Clock,
  XCircle,
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
          <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 hover:bg-emerald-200 border-emerald-300 font-bold gap-1 text-[11px]">
            <CheckCircle2 className="h-3 w-3 text-emerald-600" />
            <span>مكتمل</span>
          </Badge>
        );
      case "جزئي":
        return (
          <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 hover:bg-amber-200 border-amber-300 font-bold gap-1 text-[11px]">
            <Clock className="h-3 w-3 text-amber-600" />
            <span>جزئي</span>
          </Badge>
        );
      case "لم يسدد":
        return (
          <Badge className="bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 hover:bg-rose-200 border-rose-300 font-bold gap-1 text-[11px]">
            <XCircle className="h-3 w-3 text-rose-600" />
            <span>لم يسدد</span>
          </Badge>
        );
      case "فائض":
        return (
          <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 hover:bg-blue-200 border-blue-300 font-bold gap-1 text-[11px]">
            <Zap className="h-3 w-3 text-blue-600" />
            <span>فائض</span>
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="text-muted-foreground text-[11px]">
            {status}
          </Badge>
        );
    }
  };

  return (
    <div className="space-y-4">
      {/* Search and Action Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-card p-3 rounded-2xl border border-primary/20 shadow-sm">
        {/* Search input */}
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="بحث باسم العميل أو الملاحظات..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pr-9 text-xs sm:text-sm rounded-full bg-background/50 border-primary/20"
          />
        </div>

        {/* Export button */}
        <Button
          variant="outline"
          size="sm"
          onClick={handleExport}
          className="rounded-full gap-2 border-primary/30 font-bold hover:bg-primary/10 mr-auto"
        >
          <Download className="h-4 w-4 text-primary" />
          <span>تصدير Excel</span>
        </Button>
      </div>

      {/* Filter Chips Bar */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={statusFilter === "all" ? "default" : "outline"}
          size="sm"
          onClick={() => setStatusFilter("all")}
          className="rounded-full text-xs font-bold h-8"
        >
          الكل ({counts.all})
        </Button>
        <Button
          variant={statusFilter === "completed" ? "default" : "outline"}
          size="sm"
          onClick={() => setStatusFilter("completed")}
          className="rounded-full text-xs font-bold h-8 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
        >
          مكتمل ({counts.completed})
        </Button>
        <Button
          variant={statusFilter === "partial" ? "default" : "outline"}
          size="sm"
          onClick={() => setStatusFilter("partial")}
          className="rounded-full text-xs font-bold h-8 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40"
        >
          جزئي ({counts.partial})
        </Button>
        <Button
          variant={statusFilter === "unpaid" ? "default" : "outline"}
          size="sm"
          onClick={() => setStatusFilter("unpaid")}
          className="rounded-full text-xs font-bold h-8 text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40"
        >
          لم يسدد ({counts.unpaid})
        </Button>
        <Button
          variant={statusFilter === "overdue" ? "default" : "outline"}
          size="sm"
          onClick={() => setStatusFilter("overdue")}
          className="rounded-full text-xs font-bold h-8 text-destructive hover:bg-rose-50 dark:hover:bg-rose-950/40 gap-1"
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          متأخرون ({counts.overdue})
        </Button>
        {counts.surplus > 0 && (
          <Button
            variant={statusFilter === "surplus" ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter("surplus")}
            className="rounded-full text-xs font-bold h-8 text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40"
          >
            فائض ({counts.surplus})
          </Button>
        )}
      </div>

      {/* Unmatched Treasury Inflows Banner */}
      {summary.unmatchedTreasuryTx && summary.unmatchedTreasuryTx.length > 0 && (
        <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 text-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-bold text-foreground">
              <Zap className="h-4 w-4 text-emerald-500 fill-emerald-500" />
              <span>
                تحصيلات خزينة واردة اليوم ({summary.unmatchedTreasuryTx.length} عمليات بقيمة{" "}
                {fmtMoney(
                  summary.unmatchedTreasuryTx.reduce((s, t) => s + t.amount, 0)
                )}
                )
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowUnmatchedTreasury(!showUnmatchedTreasury)}
              className="text-[11px] h-6 px-2 text-primary"
            >
              {showUnmatchedTreasury ? "إخفاء التفاصيل" : "عرض التفاصيل"}
            </Button>
          </div>
          {showUnmatchedTreasury && (
            <div className="mt-2.5 pt-2.5 border-t border-primary/10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {summary.unmatchedTreasuryTx.map((tx, idx) => (
                <div
                  key={idx}
                  className="bg-background/80 p-2 rounded-lg border border-border flex items-center justify-between"
                >
                  <div>
                    <div className="font-bold text-foreground">{tx.description}</div>
                    <div className="text-[10px] text-muted-foreground">{tx.type}</div>
                  </div>
                  <div className="font-mono font-bold text-emerald-600">
                    +{fmtMoney(tx.amount)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Cash Flow Main Data Table */}
      <div className="bg-card rounded-2xl border border-primary/20 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/60">
              <TableRow className="border-b border-primary/20 hover:bg-transparent">
                <TableHead className="w-10 text-center font-bold text-foreground">
                  م
                </TableHead>
                <TableHead className="font-bold text-foreground min-w-[130px]">
                  الرصيد الحالي
                </TableHead>
                <TableHead className="font-bold text-foreground min-w-[220px]">
                  العميل
                </TableHead>
                <TableHead className="font-bold text-foreground min-w-[110px]">
                  المتوقع
                </TableHead>
                <TableHead className="font-bold text-foreground min-w-[120px]">
                  المحصل
                </TableHead>
                <TableHead className="font-bold text-foreground min-w-[110px]">
                  موعد السداد
                </TableHead>
                <TableHead className="font-bold text-foreground min-w-[90px] text-center">
                  نسبة السداد
                </TableHead>
                <TableHead className="font-bold text-foreground min-w-[100px] text-center">
                  حالة السداد
                </TableHead>
                <TableHead className="font-bold text-foreground min-w-[110px]">
                  المتبقي
                </TableHead>
                <TableHead className="font-bold text-foreground min-w-[160px]">
                  ملاحظات
                </TableHead>
                <TableHead className="w-16 text-center font-bold text-foreground">
                  إجراءات
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCustomers.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={11}
                    className="h-32 text-center text-muted-foreground"
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
                      className={`border-b border-border/60 transition-colors hover:bg-muted/40 ${
                        cust.status === "مكتمل"
                          ? "bg-emerald-500/[0.03]"
                          : cust.status === "جزئي"
                          ? "bg-amber-500/[0.03]"
                          : cust.status === "فائض"
                          ? "bg-blue-500/[0.03]"
                          : ""
                      }`}
                    >
                      {/* Index */}
                      <TableCell className="text-center font-mono text-xs text-muted-foreground">
                        {cust.index}
                      </TableCell>

                      {/* Current Balance in Master_Data */}
                      <TableCell className="font-mono text-xs font-semibold text-foreground whitespace-nowrap">
                        {fmtMoney(cust.currentBalance)}
                      </TableCell>

                      {/* Customer Name */}
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-bold text-sm text-foreground">
                            {cust.customerName}
                          </span>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {cust.isPinned && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-primary bg-primary/10 px-1.5 py-0.2 rounded">
                                <Pin className="h-2.5 w-2.5 rotate-45" />
                                قسط أسبوعي ثابت
                              </span>
                            )}
                          </div>
                        </div>
                      </TableCell>

                      {/* Expected */}
                      <TableCell className="font-mono text-xs font-bold text-foreground whitespace-nowrap">
                        {fmtMoney(cust.expectedAmount)}
                      </TableCell>

                      {/* Collected */}
                      <TableCell className="whitespace-nowrap">
                        <div className="font-mono text-xs font-bold text-emerald-600">
                          {fmtMoney(cust.totalCollected)}
                        </div>
                        {hasTreasuryPayment && (
                          <div className="flex items-center gap-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-400 mt-0.5">
                            <Zap className="h-3 w-3 fill-emerald-500" />
                            <span>+{fmtMoney(cust.collectedFromTreasury)} خزينة</span>
                          </div>
                        )}
                      </TableCell>

                      {/* Due Date */}
                      <TableCell className="whitespace-nowrap">
                        {cust.dueDate ? (
                          <div className="flex items-center gap-1 text-xs">
                            <span
                              className={`font-mono ${
                                isOverdue
                                  ? "text-destructive font-bold"
                                  : "text-foreground"
                              }`}
                            >
                              {cust.dueDate}
                            </span>
                            {isOverdue && (
                              <span title="تجاوز موعد السداد">
                                <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </TableCell>

                      {/* Collection Rate */}
                      <TableCell className="text-center font-mono text-xs font-semibold">
                        {fmtPct(cust.rate)}
                      </TableCell>

                      {/* Status Badge */}
                      <TableCell className="text-center">
                        {renderStatusBadge(cust.status)}
                      </TableCell>

                      {/* Remaining */}
                      <TableCell className="font-mono text-xs font-bold whitespace-nowrap">
                        <span
                          className={
                            cust.remaining > 0
                              ? "text-destructive"
                              : cust.remaining < 0
                              ? "text-blue-600"
                              : "text-muted-foreground"
                          }
                        >
                          {fmtMoney(cust.remaining)}
                        </span>
                      </TableCell>

                      {/* Notes */}
                      <TableCell className="text-xs text-muted-foreground max-w-[180px] truncate">
                        {cust.notes || "-"}
                      </TableCell>

                      {/* Actions */}
                      <TableCell className="text-center">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setEditingCustomer(cust)}
                          className="h-7 w-7 rounded-full hover:bg-primary/10 text-primary"
                          title="تعديل وتثبيت المبلغ"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
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

      {/* Edit Modal */}
      <CashFlowEditModal
        customer={editingCustomer}
        isOpen={Boolean(editingCustomer)}
        onClose={() => setEditingCustomer(null)}
        onSaved={onDataChanged}
      />
    </div>
  );
};
