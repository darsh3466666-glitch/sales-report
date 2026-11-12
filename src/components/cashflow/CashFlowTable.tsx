import React, { useState, useMemo, useCallback } from "react";
import { CashFlowCustomer, CashFlowSummary, isBankPayment, isBankCustomer } from "@/lib/cashflow.functions";
import { normalizeArabicName } from "@/lib/excel-parser.functions";
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
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  UserPlus,
  Trash2,
  Landmark,
} from "lucide-react";
import { exportCashFlowToExcel } from "@/lib/export-cashflow";
import { toast } from "sonner";

interface CashFlowTableProps {
  summary: CashFlowSummary;
  onCustomerSave: (
    customerName: string,
    updates: { expectedAmount: number; isPinned: boolean; notes: string }
  ) => void;
  onCustomerDelete?: (customerName: string) => void;
  onCustomerAdd?: (newCustomer: {
    customerName: string;
    expectedAmount: number;
    currentBalance?: number;
    dueDate?: string;
    notes?: string;
    isPinned?: boolean;
  }) => void;
  onRefresh?: () => void;
}

type FilterStatus =
  | "all"
  | "completed"
  | "partial"
  | "unpaid"
  | "overdue"
  | "pinned"
  | "has_treasury";

type SortKey =
  | "index"
  | "currentBalance"
  | "customerName"
  | "expectedAmount"
  | "totalCollected"
  | "dueDate"
  | "rate"
  | "status"
  | "remaining";

type SortDirection = "asc" | "desc";

/* ─── Unified readable typography tokens (UI/UX Pro Max) ─── */
const FONT = {
  headerCell: "text-xs sm:text-sm font-extrabold text-foreground font-sans",
  index: "text-sm font-bold tabular-nums font-sans",
  money: "text-sm sm:text-base font-extrabold tabular-nums font-sans",
  name: "text-base sm:text-lg font-extrabold text-foreground leading-snug tracking-tight font-sans",
  date: "text-xs sm:text-sm font-bold tabular-nums font-sans",
  pct: "text-sm sm:text-base font-extrabold tabular-nums font-sans",
  notes: "text-xs sm:text-sm font-medium font-sans",
  badge: "text-xs font-bold font-sans",
} as const;

interface EditingState {
  customerName: string;
  expectedAmount: string;
  isPinned: boolean;
  notes: string;
}

export const CashFlowTable: React.FC<CashFlowTableProps> = ({
  summary,
  onCustomerSave,
  onCustomerDelete,
  onCustomerAdd,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<FilterStatus>("all");
  const [sortKey, setSortKey] = useState<SortKey>("status");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  // Add Customer Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newCustName, setNewCustName] = useState("");
  const [newCustExpected, setNewCustExpected] = useState("");
  const [newCustDueDate, setNewCustDueDate] = useState("");
  const [newCustNotes, setNewCustNotes] = useState("");
  const [newCustIsPinned, setNewCustIsPinned] = useState(false);

  // Smart Arabic-normalized suggestions for Add Customer Modal (matches with or without Hamza)
  const suggestedCustomers = useMemo(() => {
    const q = newCustName.trim();
    if (!q || q.length < 2) return [];
    const normQ = normalizeArabicName(q);
    const pool = summary.masterCustomerNames || [];
    return pool
      .filter((name) => normalizeArabicName(name).includes(normQ))
      .slice(0, 5);
  }, [newCustName, summary.masterCustomerNames]);

  const handleSelectCustomer = useCallback((name: string) => {
    setNewCustName(name);
    const found = summary.masterCustomers?.find((m) => m.customerName === name);
    if (found) {
      if (found.currentBalance > 0 && !newCustExpected) {
        setNewCustExpected(String(found.currentBalance));
      }
      if (found.dueDate && !newCustDueDate) {
        setNewCustDueDate(found.dueDate);
      }
      if (found.notes && !newCustNotes) {
        setNewCustNotes(found.notes);
      }
    }
  }, [summary.masterCustomers, newCustExpected, newCustDueDate, newCustNotes]);

  // Delete Customer Confirmation State
  const [customerToDelete, setCustomerToDelete] = useState<string | null>(null);


  // Single editing state — 100% controlled, NO useEffect, NO focus thrashing, ZERO freeze!
  const [editing, setEditing] = useState<EditingState | null>(null);

  const todayStr = useMemo(() => new Date().toISOString().split("T")[0], []);

  // Total incoming from live Treasury on the current day
  const { treasuryTodayTotal, treasuryTodayCount } = useMemo(() => {
    let total = 0;
    let count = 0;
    for (const c of summary.customers) {
      if (c.collectedFromTreasury > 0) {
        total += c.collectedFromTreasury;
        count += (c.treasuryTransactions?.length || 1);
      }
    }
    for (const tx of summary.unmatchedTreasuryTx || []) {
      total += (tx.amount || 0);
      count++;
    }
    if (total === 0 && summary.collectedFromTreasury > 0) {
      total = summary.collectedFromTreasury;
    }
    return { treasuryTodayTotal: total, treasuryTodayCount: count };
  }, [summary.customers, summary.unmatchedTreasuryTx, summary.collectedFromTreasury]);

  const handleStartEdit = useCallback((cust: CashFlowCustomer) => {
    setEditing({
      customerName: cust.customerName,
      expectedAmount: String(cust.expectedAmount || 0),
      isPinned: Boolean(cust.isPinned),
      notes: cust.notes || "",
    });
  }, []);

  const handleCancelEdit = useCallback(() => {
    if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setTimeout(() => {
      setEditing(null);
    }, 10);
  }, []);

  const handleSaveEdit = useCallback(() => {
    if (!editing) return;
    if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    const parsed = parseFloat(editing.expectedAmount) || 0;
    const targetName = editing.customerName;
    const updates = {
      expectedAmount: parsed,
      isPinned: editing.isPinned,
      notes: editing.notes.trim(),
    };
    setTimeout(() => {
      setEditing(null);
      onCustomerSave(targetName, updates);
    }, 10);
  }, [editing, onCustomerSave]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleSaveEdit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        handleCancelEdit();
      }
    },
    [handleSaveEdit, handleCancelEdit]
  );

  const handleSort = useCallback((key: SortKey) => {
    setSortKey((prevKey) => {
      if (prevKey === key) {
        setSortDirection((prevDir) => (prevDir === "asc" ? "desc" : "asc"));
        return prevKey;
      }
      if (["currentBalance", "expectedAmount", "totalCollected", "rate", "remaining"].includes(key)) {
        setSortDirection("desc");
      } else {
        setSortDirection("asc");
      }
      return key;
    });
  }, []);

  const handleResetFilters = useCallback(() => {
    setSearchTerm("");
    setStatusFilter("all");
    setSortKey("status");
    setSortDirection("asc");
  }, []);

  // Filter counts
  const counts = useMemo(() => {
    let completed = 0;
    let partial = 0;
    let unpaid = 0;
    let overdue = 0;
    let pinned = 0;
    let hasTreasury = 0;

    for (const c of summary.customers) {
      if (c.status === "مكتمل" || (c as any).status === "فائض") completed++;
      else if (c.status === "جزئي") partial++;
      else if (c.status === "لم يسدد") unpaid++;

      if (c.dueDate && c.dueDate < todayStr && c.remaining > 0 && (c.rate || 0) < 0.9) {
        overdue++;
      }
      if (c.isPinned) {
        pinned++;
      }
      if (c.collectedFromTreasury > 0) {
        hasTreasury++;
      }
    }
    return {
      all: summary.customers.length,
      completed,
      partial,
      unpaid,
      overdue,
      pinned,
      hasTreasury,
    };
  }, [summary.customers, todayStr]);

  // Filtered and sorted customers
  const filteredCustomers = useMemo(() => {
    const list = summary.customers.filter((c) => {
      if (searchTerm.trim()) {
        const term = searchTerm.trim().toLowerCase();
        const matchesName =
          c.customerName.toLowerCase().includes(term) ||
          c.normalizedName.toLowerCase().includes(term);
        const matchesNotes = c.notes && c.notes.toLowerCase().includes(term);
        if (!matchesName && !matchesNotes) return false;
      }

      if (statusFilter === "completed") return c.status === "مكتمل" || (c as any).status === "فائض";
      if (statusFilter === "partial") return c.status === "جزئي";
      if (statusFilter === "unpaid") return c.status === "لم يسدد";
      if (statusFilter === "overdue") {
        return Boolean(c.dueDate && c.dueDate < todayStr && c.remaining > 0 && (c.rate || 0) < 0.9);
      }
      if (statusFilter === "pinned") return Boolean(c.isPinned);
      if (statusFilter === "has_treasury") return c.collectedFromTreasury > 0;

      return true;
    });

    list.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "index":
          cmp = a.index - b.index;
          break;
        case "currentBalance":
          cmp = a.currentBalance - b.currentBalance;
          break;
        case "customerName":
          cmp = a.customerName.localeCompare(b.customerName, "ar");
          break;
        case "expectedAmount":
          cmp = a.expectedAmount - b.expectedAmount;
          break;
        case "totalCollected":
          cmp = a.totalCollected - b.totalCollected;
          break;
        case "dueDate": {
          const dA = a.dueDate || "9999-99-99";
          const dB = b.dueDate || "9999-99-99";
          cmp = dA.localeCompare(dB);
          break;
        }
        case "rate":
          cmp = a.rate - b.rate;
          break;
        case "status": {
          // User Directive: "وعايز فالطبيعي يتم عرض الي لم يسدد في اول الجدول"
          const order: Record<string, number> = {
            "لم يسدد": 1,
            "جزئي": 2,
            "مكتمل": 3,
            "لا يوجد استحقاق": 4,
          };
          const orderA = order[a.status] || (a.status === "فائض" ? 3 : 99);
          const orderB = order[b.status] || (b.status === "فائض" ? 3 : 99);
          const statusDiff = orderA - orderB;
          if (statusDiff !== 0) {
            cmp = statusDiff;
          } else {
            // Secondary sorting within status groups
            if (orderA === 1) {
              // Within "لم يسدد": sort by earliest dueDate, then highest expectedAmount
              const dA = a.dueDate || "9999-99-99";
              const dB = b.dueDate || "9999-99-99";
              const dateDiff = dA.localeCompare(dB);
              cmp = dateDiff !== 0 ? dateDiff : (b.expectedAmount || 0) - (a.expectedAmount || 0);
            } else if (orderA === 2) {
              // Within "جزئي": sort by collection rate descending, then totalCollected
              const rateDiff = (b.rate || 0) - (a.rate || 0);
              cmp = rateDiff !== 0 ? rateDiff : (b.totalCollected || 0) - (a.totalCollected || 0);
            } else if (orderA === 3) {
              // Within "مكتمل": sort by totalCollected descending
              cmp = (b.totalCollected || 0) - (a.totalCollected || 0);
            } else {
              cmp = a.index - b.index;
            }
          }
          break;
        }
        case "remaining":
          cmp = a.remaining - b.remaining;
          break;
        default:
          cmp = a.index - b.index;
      }
      return sortDirection === "asc" ? cmp : -cmp;
    });

    return list;
  }, [summary.customers, searchTerm, statusFilter, todayStr, sortKey, sortDirection]);

  const handleExport = () => {
    try {
      exportCashFlowToExcel(summary);
      toast.success("تم تصدير ملف الكاش فلو بنجاح");
    } catch (err) {
      console.error(err);
      toast.error("حدث خطأ أثناء تصدير الملف");
    }
  };

  const renderStatusBadge = useCallback((status: CashFlowCustomer["status"]) => {
    switch (status) {
      case "مكتمل":
      case "فائض" as any:
        return (
          <Badge className={`bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-2 border-emerald-400 ${FONT.badge} gap-1 py-1 px-2.5 shadow-2xs`}>
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            <span>مكتمل</span>
          </Badge>
        );
      case "جزئي":
        return (
          <Badge className={`bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300 border-2 border-amber-400 ${FONT.badge} gap-1 py-1 px-2.5 shadow-2xs`}>
            <Clock className="h-3.5 w-3.5 text-amber-600" />
            <span>جزئي</span>
          </Badge>
        );
      case "لم يسدد":
        return (
          <Badge className={`bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-300 border-2 border-rose-400 ${FONT.badge} gap-1 py-1 px-2.5 shadow-2xs`}>
            <XCircle className="h-3.5 w-3.5 text-rose-600" />
            <span>لم يسدد</span>
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className={`text-muted-foreground ${FONT.badge} py-1 px-2.5`}>
            {status}
          </Badge>
        );
    }
  }, []);

  const renderSortHeader = (
    key: SortKey,
    label: string,
    align: "right" | "center" = "right",
    extraClass: string = ""
  ) => {
    const isActive = sortKey === key;
    return (
      <TableHead
        className={`${FONT.headerCell} ${extraClass} cursor-pointer select-none transition-colors hover:bg-primary/15 py-3.5`}
        onClick={() => handleSort(key)}
        title={`ترتيب حسب ${label} (${isActive && sortDirection === "asc" ? "تنازلياً" : "تصاعدياً"})`}
      >
        <div
          className={`flex items-center gap-1.5 ${
            align === "center" ? "justify-center" : "justify-start"
          }`}
        >
          <span className={isActive ? "text-primary font-black" : ""}>{label}</span>
          {isActive ? (
            sortDirection === "asc" ? (
              <ArrowUp className="h-4 w-4 text-primary shrink-0 stroke-[2.5]" />
            ) : (
              <ArrowDown className="h-4 w-4 text-primary shrink-0 stroke-[2.5]" />
            )
          ) : (
            <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0 hover:text-muted-foreground" />
          )}
        </div>
      </TableHead>
    );
  };

  return (
    <div className="space-y-4">
      {/* Search and Action Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-card p-4 rounded-2xl border-2 border-primary/20 shadow-sm no-print">
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

        {/* Treasury Weekly Total Badge (الوارد في الخزينة للأسبوع) - in the center position */}
        {treasuryTodayTotal > 0 && (
          <div className="inline-flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border-2 border-emerald-500/40 text-emerald-900 dark:text-emerald-200 shadow-2xs">
            <Zap className="h-4 w-4 text-emerald-600 dark:text-emerald-400 fill-emerald-500 animate-pulse" />
            <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300 whitespace-nowrap">
              وارد الخزينة الأسبوعي:
            </span>
            <span className="text-sm sm:text-base font-black text-emerald-700 dark:text-emerald-300 font-mono whitespace-nowrap">
              {fmtMoney(treasuryTodayTotal)}
            </span>
            {treasuryTodayCount > 0 && (
              <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/60 px-2 py-0.5 rounded-full whitespace-nowrap">
                ({treasuryTodayCount} عملية)
              </span>
            )}
          </div>
        )}

        {/* Action buttons: Add Customer and Export */}
        <div className="flex items-center gap-2 mr-auto flex-wrap">
          {onCustomerAdd && (
            <Button
              variant="default"
              size="sm"
              onClick={() => setIsAddModalOpen(true)}
              className="rounded-full gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs sm:text-sm h-11 px-4 sm:px-5 shadow-xs cursor-pointer"
              title="إضافة عميل يدوي إلى خطة هذا الأسبوع"
            >
              <UserPlus className="h-4 w-4" />
              <span>إضافة عميل</span>
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            className="rounded-full gap-2 border-2 border-primary/30 font-black text-xs sm:text-sm h-11 px-4 sm:px-5 hover:bg-primary/10 shadow-xs cursor-pointer"
          >
            <Download className="h-4 w-4 text-primary" />
            <span>تصدير Excel</span>
          </Button>
        </div>
      </div>

      {/* Filter Chips & Active Summary Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 no-print">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={statusFilter === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter("all")}
            className="rounded-full text-xs font-black h-9 px-4 cursor-pointer shadow-2xs"
          >
            الكل ({counts.all})
          </Button>
          <Button
            variant={statusFilter === "completed" ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter("completed")}
            className="rounded-full text-xs font-black h-9 px-4 text-emerald-700 dark:text-emerald-300 border-2 border-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 cursor-pointer shadow-2xs"
          >
            مكتمل ({counts.completed})
          </Button>
          <Button
            variant={statusFilter === "partial" ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter("partial")}
            className="rounded-full text-xs font-black h-9 px-4 text-amber-700 dark:text-amber-300 border-2 border-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40 cursor-pointer shadow-2xs"
          >
            جزئي ({counts.partial})
          </Button>
          <Button
            variant={statusFilter === "unpaid" ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter("unpaid")}
            className="rounded-full text-xs font-black h-9 px-4 text-rose-700 dark:text-rose-300 border-2 border-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer shadow-2xs"
          >
            لم يسدد ({counts.unpaid})
          </Button>
          <Button
            variant={statusFilter === "overdue" ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter("overdue")}
            className="rounded-full text-xs font-black h-9 px-4 text-destructive border-2 border-destructive hover:bg-rose-50 dark:hover:bg-rose-950/40 gap-1.5 cursor-pointer shadow-2xs"
          >
            <AlertTriangle className="h-4 w-4" />
            <span>متأخرون ({counts.overdue})</span>
          </Button>
          {counts.pinned > 0 && (
            <Button
              variant={statusFilter === "pinned" ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter("pinned")}
              className="rounded-full text-xs font-black h-9 px-4 text-purple-700 dark:text-purple-300 border-2 border-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950/40 gap-1.5 cursor-pointer shadow-2xs"
            >
              <Pin className="h-3.5 w-3.5 rotate-45" />
              <span>المثبت أسبوعياً ({counts.pinned})</span>
            </Button>
          )}
          {counts.hasTreasury > 0 && (
            <Button
              variant={statusFilter === "has_treasury" ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter("has_treasury")}
              className="rounded-full text-xs font-black h-9 px-4 text-teal-700 dark:text-teal-300 border-2 border-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/40 gap-1.5 cursor-pointer shadow-2xs"
            >
              <Zap className="h-3.5 w-3.5 fill-teal-500" />
              <span>تحصيلات خزينة ({counts.hasTreasury})</span>
            </Button>
          )}
        </div>

        {/* Counter and Reset Filters Button */}
        <div className="flex items-center gap-2 mr-auto text-xs font-bold text-muted-foreground">
          <span>
            عرض <strong className="text-foreground font-black">{filteredCustomers.length}</strong> من{" "}
            {summary.customers.length} عميل
          </span>
          {(statusFilter !== "all" || searchTerm || sortKey !== "status" || sortDirection !== "asc") && (
            <button
              onClick={handleResetFilters}
              className="inline-flex items-center gap-1 text-xs text-primary font-black hover:underline cursor-pointer bg-primary/10 px-2.5 py-1 rounded-full border border-primary/20"
              title="إعادة ضبط البحث والتصفية والترتيب"
            >
              <RotateCcw className="h-3 w-3" />
              <span>إعادة ضبط</span>
            </button>
          )}
        </div>
      </div>

      {/* Cash Flow Main Data Table */}
      <div className="bg-card rounded-2xl border-2 border-primary/20 shadow-md overflow-hidden cashflow-table-container">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/80">
              <TableRow className="border-b-2 border-primary/30 hover:bg-transparent">
                {renderSortHeader("index", "م", "center", "w-14 col-index")}
                {renderSortHeader("currentBalance", "الرصيد الحالي", "right", "min-w-[130px] col-balance")}
                {renderSortHeader("customerName", "العميل", "right", "min-w-[220px] col-customer")}
                {renderSortHeader("expectedAmount", "المتوقع", "right", "min-w-[140px] col-expected")}
                {renderSortHeader("totalCollected", "المحصل", "right", "min-w-[130px] col-collected")}
                {renderSortHeader("dueDate", "موعد السداد", "right", "min-w-[120px] col-due")}
                {renderSortHeader("rate", "نسبة السداد", "center", "min-w-[95px] col-rate")}
                {renderSortHeader("status", "حالة السداد", "center", "min-w-[105px] col-status")}
                {renderSortHeader("remaining", "المتبقي", "right", "min-w-[130px] col-remaining")}
                <TableHead className={`${FONT.headerCell} min-w-[150px] text-right py-3.5 col-notes`}>ملاحظات</TableHead>
                <TableHead className={`w-24 text-center ${FONT.headerCell} py-3.5 no-print col-actions`}>إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCustomers.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={11}
                    className="h-36 text-center text-muted-foreground text-sm font-bold"
                  >
                    لا توجد بيانات مطابقة للبحث أو التصفية الحالية.
                  </TableCell>
                </TableRow>
              ) : (
                filteredCustomers.map((cust, idx) => {
                  const isEditingThisRow = editing?.customerName === cust.customerName;
                  const isOverdue =
                    Boolean(cust.dueDate && cust.dueDate < todayStr && cust.remaining > 0 && (cust.rate || 0) < 0.9);
                  const hasTreasuryPayment = cust.collectedFromTreasury > 0;

                  const rowClass = isEditingThisRow
                    ? "bg-primary/10 border-2 border-primary"
                    : cust.status === "مكتمل" || (cust as any).status === "فائض"
                    ? "bg-emerald-500/[0.04] border-b border-border/80 hover:bg-muted/40"
                    : cust.status === "جزئي"
                    ? "bg-amber-500/[0.04] border-b border-border/80 hover:bg-muted/40"
                    : "border-b border-border/80 hover:bg-muted/40";

                  return (
                    <TableRow key={cust.customerName} className={rowClass}>
                      {/* Index */}
                      <TableCell
                        className={`text-center py-3 col-index ${FONT.index} ${
                          isEditingThisRow ? "text-primary" : "text-muted-foreground"
                        }`}
                      >
                        {idx + 1}
                      </TableCell>

                      {/* Current Balance */}
                      <TableCell className="text-right py-3 whitespace-nowrap col-balance">
                        <span className={`${FONT.money} text-foreground`}>
                          {fmtMoney(cust.currentBalance)}
                        </span>
                      </TableCell>

                      {/* Customer Name */}
                      <TableCell className="py-3 col-customer">
                        {isEditingThisRow ? (
                          <div className="flex flex-col">
                            <span className={FONT.name}>{cust.customerName}</span>
                            <label className="inline-flex items-center gap-1.5 mt-1.5 cursor-pointer text-xs font-black text-primary bg-background px-2.5 py-1 rounded-md border border-primary/30 w-fit select-none shadow-2xs">
                              <input
                                type="checkbox"
                                checked={editing.isPinned}
                                onChange={(e) =>
                                  setEditing((prev) =>
                                    prev ? { ...prev, isPinned: e.target.checked } : null
                                  )
                                }
                                className="h-4 w-4 rounded accent-primary cursor-pointer"
                              />
                              <Pin className="h-3.5 w-3.5 rotate-45 text-primary" />
                              <span>تثبيت أسبوعياً</span>
                            </label>
                          </div>
                        ) : (
                          <div
                            onClick={() => handleStartEdit(cust)}
                            className="flex flex-col cursor-pointer group"
                            title="انقر لتعديل بيانات العميل"
                          >
                            <span className={`${FONT.name} group-hover:text-primary`}>
                              {cust.customerName}
                            </span>
                            {cust.isPinned && (
                              <span className="inline-flex items-center gap-1 text-xs font-black text-primary bg-primary/15 border border-primary/30 px-2.5 py-0.5 rounded-md mt-1 w-fit">
                                <Pin className="h-3 w-3 rotate-45" />
                                قسط أسبوعي ثابت
                              </span>
                            )}
                          </div>
                        )}
                      </TableCell>

                      {/* Expected */}
                      <TableCell className="text-right py-3 whitespace-nowrap col-expected">
                        {isEditingThisRow ? (
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-1.5">
                              <input
                                type="number"
                                min="0"
                                step="500"
                                value={editing.expectedAmount}
                                onChange={(e) =>
                                  setEditing((prev) =>
                                    prev ? { ...prev, expectedAmount: e.target.value } : null
                                  )
                                }
                                onKeyDown={handleKeyDown}
                                className="w-32 text-left font-mono font-black text-sm px-3 py-1.5 bg-background border-2 border-primary rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/40 text-foreground"
                                dir="ltr"
                              />
                              <span className="text-xs font-black text-muted-foreground">ج.م</span>
                            </div>
                            {cust.currentBalance > 0 && (
                              <button
                                type="button"
                                onClick={() =>
                                  setEditing((prev) =>
                                    prev
                                      ? { ...prev, expectedAmount: String(cust.currentBalance) }
                                      : null
                                  )
                                }
                                className="text-xs text-primary font-black hover:underline block cursor-pointer"
                              >
                                استخدام كامل الرصيد ({fmtMoney(cust.currentBalance)})
                              </button>
                            )}
                          </div>
                        ) : (
                          <div
                            onClick={() => handleStartEdit(cust)}
                            className="inline-block cursor-pointer group"
                            title="انقر لتعديل المبلغ المتوقع"
                          >
                            <span className={`${FONT.money} text-primary bg-primary/10 border-2 border-primary/25 px-2.5 py-1 rounded-xl group-hover:bg-primary/20 group-hover:border-primary`}>
                              {fmtMoney(cust.expectedAmount)}
                            </span>
                          </div>
                        )}
                      </TableCell>

                      {/* Collected */}
                      <TableCell className="text-right py-3 whitespace-nowrap col-collected">
                        <div className={`${FONT.money} text-emerald-700 dark:text-emerald-400`}>
                          {fmtMoney(cust.totalCollected)}
                        </div>
                        {hasTreasuryPayment && !isEditingThisRow && (() => {
                          let custCash = 0;
                          let custBank = 0;
                          const isBankCust = isBankCustomer(cust.customerName, cust.notes);
                          if (Array.isArray(cust.treasuryTransactions) && cust.treasuryTransactions.length > 0) {
                            for (const tx of cust.treasuryTransactions) {
                              if (isBankCust || isBankPayment(tx.type, tx.description)) {
                                custBank += tx.amount || 0;
                              } else {
                                custCash += tx.amount || 0;
                              }
                            }
                          } else {
                            if (isBankCust) {
                              custBank = cust.collectedFromTreasury;
                            } else {
                              custCash = cust.collectedFromTreasury;
                            }
                          }

                          return (
                            <div className="flex flex-col gap-1 mt-1">
                              {custCash > 0 && (
                                <div className="inline-flex items-center gap-1 text-xs font-black text-emerald-800 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950 px-2 py-0.5 rounded-md border border-emerald-300">
                                  <Zap className="h-3 w-3 fill-emerald-500" />
                                  <span>+{fmtMoney(custCash)} خزينة</span>
                                </div>
                              )}
                              {custBank > 0 && (
                                <div className="inline-flex items-center gap-1 text-xs font-black text-blue-800 dark:text-blue-300 bg-blue-100 dark:bg-blue-950 px-2 py-0.5 rounded-md border border-blue-300">
                                  <Landmark className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                                  <span>+{fmtMoney(custBank)} بنك</span>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </TableCell>

                      {/* Due Date */}
                      <TableCell className="text-right py-3 whitespace-nowrap col-due">
                        {cust.dueDate ? (
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`${FONT.date} ${
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
                      <TableCell className="text-center py-3 whitespace-nowrap col-rate">
                        <span className={`${FONT.pct} text-foreground`}>
                          {fmtPct(cust.rate)}
                        </span>
                      </TableCell>

                      {/* Status Badge */}
                      <TableCell className="text-center py-3 col-status">
                        {renderStatusBadge(cust.status)}
                      </TableCell>

                      {/* Remaining */}
                      <TableCell className="text-right py-3 whitespace-nowrap col-remaining">
                        <span
                          className={`${FONT.money} ${
                            cust.remaining > 0
                              ? "text-rose-600 dark:text-rose-400"
                              : "text-muted-foreground font-semibold"
                          }`}
                        >
                          {fmtMoney(Math.max(0, cust.remaining))}
                        </span>
                      </TableCell>

                      {/* Notes */}
                      <TableCell className="text-right py-3 max-w-[190px] col-notes">
                        {isEditingThisRow ? (
                          <input
                            type="text"
                            value={editing.notes}
                            onChange={(e) =>
                              setEditing((prev) =>
                                prev ? { ...prev, notes: e.target.value } : null
                              )
                            }
                            onKeyDown={handleKeyDown}
                            placeholder="ملاحظات التحصيل..."
                            className="w-full text-xs font-medium px-3 py-1.5 bg-background border-2 border-border rounded-xl focus:outline-none focus:border-primary text-foreground"
                          />
                        ) : (
                          <span
                            className={`${FONT.notes} text-foreground/80 block truncate`}
                            title={cust.notes || undefined}
                          >
                            {cust.notes || "-"}
                          </span>
                        )}
                      </TableCell>

                      {/* Actions */}
                      <TableCell className="text-center py-3 no-print col-actions">
                        {isEditingThisRow ? (
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={handleSaveEdit}
                              className="h-8 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs flex items-center gap-1.5 shadow-xs cursor-pointer active:scale-95"
                              title="حفظ التعديلات (Enter)"
                            >
                              <Check className="h-3.5 w-3.5" />
                              <span>حفظ</span>
                            </button>
                            <button
                              type="button"
                              onClick={handleCancelEdit}
                              className="h-8 px-2.5 rounded-xl border border-border hover:bg-muted text-muted-foreground hover:text-foreground text-xs flex items-center cursor-pointer"
                              title="إلغاء (Esc)"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : customerToDelete === cust.customerName ? (
                          <div className="flex items-center justify-center gap-1 bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 p-1 rounded-xl shadow-xs">
                            <span className="text-[11px] font-black text-rose-600 dark:text-rose-400 px-1 whitespace-nowrap">
                              حذف؟
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                onCustomerDelete?.(cust.customerName);
                                setCustomerToDelete(null);
                                toast.success(`تم حذف العميل "${cust.customerName}" من قائمة هذا الأسبوع`);
                              }}
                              className="h-7 px-2 bg-rose-600 hover:bg-rose-700 text-white font-black text-[11px] rounded-lg inline-flex items-center gap-1 cursor-pointer shadow-xs"
                              title="تأكيد الحذف"
                            >
                              <Check className="h-3 w-3" />
                              <span>تأكيد</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setCustomerToDelete(null)}
                              className="h-7 px-1.5 border border-border hover:bg-muted text-muted-foreground font-bold text-[11px] rounded-lg inline-flex items-center cursor-pointer"
                              title="تراجع"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleStartEdit(cust)}
                              className="h-8 px-2.5 rounded-xl border-2 border-primary/30 hover:border-primary hover:bg-primary/10 text-primary font-black text-xs inline-flex items-center gap-1 cursor-pointer shadow-2xs"
                              title="تعديل المبلغ والملاحظات"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                              <span>تعديل</span>
                            </button>
                            {onCustomerDelete && cust.customerName !== "عميل نقدي (كاش)" && (
                              <button
                                type="button"
                                onClick={() => setCustomerToDelete(cust.customerName)}
                                className="h-8 px-2 rounded-xl border border-rose-300 dark:border-rose-900/50 hover:bg-rose-500/10 text-rose-600 dark:text-rose-400 font-black text-xs inline-flex items-center cursor-pointer shadow-2xs"
                                title="حذف العميل من قائمة هذا الأسبوع"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>


      {/* Add Customer Modal - Pure React Modal (Zero freeze, Zero lag, No Radix Focus Lock) */}
      {isAddModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
          dir="rtl"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsAddModalOpen(false);
          }}
        >
          <div className="bg-card text-card-foreground border-2 border-primary/30 shadow-2xl rounded-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-border/50">
              <div className="flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-emerald-600" />
                <h3 className="text-lg font-black text-foreground">
                  إضافة عميل إلى قائمة الأسبوع
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="h-8 w-8 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center cursor-pointer transition-colors"
                title="إغلاق"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-muted-foreground font-semibold">
              اختر من عملاء الماستر أو أدخل عميلاً نقدياً ومبلغه المستهدف لهذا الأسبوع
            </p>

            <div className="space-y-4 my-2 text-right">
              <div>
                <label className="text-xs font-bold text-foreground block mb-1.5">
                  اسم العميل <span className="text-destructive">*</span>
                </label>
                <input
                  list="master-customers-list"
                  type="text"
                  placeholder="ابحث أو اكتب اسم العميل..."
                  value={newCustName}
                  onChange={(e) => {
                    const val = e.target.value;
                    setNewCustName(val);
                    const found = summary.masterCustomers?.find(
                      (m) => m.customerName === val
                    );
                    if (found) {
                      if (found.currentBalance > 0 && !newCustExpected) {
                        setNewCustExpected(String(found.currentBalance));
                      }
                      if (found.dueDate && !newCustDueDate) {
                        setNewCustDueDate(found.dueDate);
                      }
                      if (found.notes && !newCustNotes) {
                        setNewCustNotes(found.notes);
                      }
                    }
                  }}
                  className="w-full text-sm font-bold px-3.5 py-2.5 rounded-xl border-2 border-primary/25 bg-background text-foreground focus:outline-none focus:border-primary"
                />
                <datalist id="master-customers-list">
                  {(summary.masterCustomerNames || []).map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>

                {suggestedCustomers.length > 0 && newCustName !== suggestedCustomers[0] && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-bold text-muted-foreground ml-1">
                      اقتراحات:
                    </span>
                    {suggestedCustomers.map((sName) => (
                      <button
                        key={sName}
                        type="button"
                        onClick={() => handleSelectCustomer(sName)}
                        className="text-xs font-bold px-2.5 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary border border-primary/25 cursor-pointer transition-colors active:scale-95"
                      >
                        + {sName}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-foreground block mb-1.5">
                    المبلغ المتوقع (ج.م) <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="500"
                    placeholder="0"
                    value={newCustExpected}
                    onChange={(e) => setNewCustExpected(e.target.value)}
                    className="w-full text-sm font-bold font-mono px-3.5 py-2.5 rounded-xl border-2 border-primary/25 bg-background text-foreground focus:outline-none focus:border-primary text-left"
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-foreground block mb-1.5">
                    موعد السداد (اختياري)
                  </label>
                  <input
                    type="date"
                    value={newCustDueDate}
                    onChange={(e) => setNewCustDueDate(e.target.value)}
                    className="w-full text-sm font-bold px-3.5 py-2.5 rounded-xl border-2 border-primary/25 bg-background text-foreground focus:outline-none focus:border-primary"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-foreground block mb-1.5">
                  ملاحظات التحصيل
                </label>
                <input
                  type="text"
                  placeholder="سداد نقدي، اتفاق جديد..."
                  value={newCustNotes}
                  onChange={(e) => setNewCustNotes(e.target.value)}
                  className="w-full text-xs font-medium px-3.5 py-2 rounded-xl border-2 border-border bg-background text-foreground focus:outline-none focus:border-primary"
                />
              </div>

              <label className="flex items-center gap-2.5 cursor-pointer bg-primary/5 p-3 rounded-xl border border-primary/20 select-none">
                <input
                  type="checkbox"
                  checked={newCustIsPinned}
                  onChange={(e) => setNewCustIsPinned(e.target.checked)}
                  className="h-4 w-4 rounded accent-primary cursor-pointer"
                />
                <div className="text-xs">
                  <span className="font-black text-foreground block">تثبيت العميل أسبوعياً</span>
                  <span className="text-muted-foreground font-semibold">ترحيل هذا المبلغ كقسط ثابت في الأسابيع القادمة</span>
                </div>
              </label>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border/50">
              <Button
                variant="outline"
                onClick={() => setIsAddModalOpen(false)}
                className="rounded-xl font-bold cursor-pointer"
              >
                إلغاء
              </Button>
              <Button
                variant="default"
                onClick={() => {
                  if (!newCustName.trim()) {
                    toast.error("يرجى إدخال اسم العميل");
                    return;
                  }
                  const exp = parseFloat(newCustExpected) || 0;
                  const found = summary.masterCustomers?.find(
                    (m) => m.customerName === newCustName.trim()
                  );
                  onCustomerAdd?.({
                    customerName: newCustName.trim(),
                    expectedAmount: exp,
                    currentBalance: found?.currentBalance ?? exp,
                    dueDate: newCustDueDate,
                    notes: newCustNotes.trim(),
                    isPinned: newCustIsPinned,
                  });
                  setIsAddModalOpen(false);
                  setNewCustName("");
                  setNewCustExpected("");
                  setNewCustDueDate("");
                  setNewCustNotes("");
                  setNewCustIsPinned(false);
                }}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-black px-5 rounded-xl shadow-xs cursor-pointer"
              >
                <UserPlus className="h-4 w-4 ml-1.5" />
                <span>إضافة العميل</span>
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
