import React, { useState, useMemo, useCallback } from "react";
import { CashFlowCustomer, CashFlowSummary, isBankPayment, isBankCustomer } from "@/lib/cashflow.functions";
import { normalizeArabicName } from "@/lib/excel-parser.functions";
import { fmtMoney, fmtPct } from "@/lib/formatters";
import { cn } from "@/lib/utils";
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
  Calendar,
  LayoutGrid,
  TableProperties,
  Filter,
  FileSpreadsheet,
} from "lucide-react";
import { exportCashFlowToExcel } from "@/lib/export-cashflow";
import { toast } from "sonner";
import { CashFlowMobileCards } from "./CashFlowMobileCards";

interface CashFlowTableProps {
  summary: CashFlowSummary;
  onCustomerSave: (
    customerName: string,
    updates: { expectedAmount: number; isPinned: boolean; notes: string }
  ) => void;
  onCustomerDelete?: (customerName: string) => void;
  onCustomersBulkDelete?: (customerNames: string[]) => void;
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
  | "due_today"
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
  onCustomersBulkDelete,
  onCustomerAdd,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  // Multi-select status / category filters (Excel style)
  const [selectedStatusFilters, setSelectedStatusFilters] = useState<Set<FilterStatus>>(new Set());
  // Specific due dates filter (Excel checklist)
  const [selectedDueDates, setSelectedDueDates] = useState<Set<string>>(new Set());
  // Specific customer names filter (Excel checklist)
  const [selectedCustomerNames, setSelectedCustomerNames] = useState<Set<string>>(new Set());
  // Collection status filter (Excel checklist)
  const [collectionFilter, setCollectionFilter] = useState<"all" | "has_collected" | "zero_collected" | "treasury_only" | "bank_only">("all");
  // Customer search inside the Excel filter popover
  const [custFilterSearch, setCustFilterSearch] = useState("");
  // Active header filter dropdown (lightweight, zero freeze)
  const [activeHeaderFilter, setActiveHeaderFilter] = useState<"customer" | "collected" | "due" | "status" | null>(null);

  const [sortKey, setSortKey] = useState<SortKey>("status");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [viewMode, setViewMode] = useState<"cards" | "table">(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("cashflow_view_mode");
      if (saved === "cards" || saved === "table") return saved;
      return window.innerWidth < 768 ? "cards" : "table";
    }
    return "cards";
  });

  // Multi-select bulk deletion state
  const [selectedCustomers, setSelectedCustomers] = useState<Set<string>>(new Set());
  const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState(false);

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

  const todayStr = useMemo(() => {
    if (summary.reportDate && summary.reportDate.length === 10) {
      return summary.reportDate;
    }
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }, [summary.reportDate]);

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

  const handleToggleStatusFilter = useCallback((filter: FilterStatus) => {
    setSelectedStatusFilters((prev) => {
      const next = new Set(prev);
      if (filter === "all") {
        return new Set();
      }
      if (next.has(filter)) {
        next.delete(filter);
      } else {
        next.add(filter);
      }
      return next;
    });
  }, []);

  const handleResetFilters = useCallback(() => {
    setSearchTerm("");
    setSelectedStatusFilters(new Set());
    setSelectedDueDates(new Set());
    setSelectedCustomerNames(new Set());
    setCollectionFilter("all");
    setCustFilterSearch("");
    setActiveHeaderFilter(null);
    setSortKey("status");
    setSortDirection("asc");
  }, []);

  // Filter counts
  const counts = useMemo(() => {
    let completed = 0;
    let partial = 0;
    let unpaid = 0;
    let overdue = 0;
    let dueToday = 0;
    let pinned = 0;
    let hasTreasury = 0;

    for (const c of summary.customers) {
      if (c.status === "مكتمل" || (c as any).status === "فائض") completed++;
      else if (c.status === "جزئي") partial++;
      else if (c.status === "لم يسدد") unpaid++;

      if (c.dueDate === todayStr) {
        dueToday++;
      }
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
      dueToday,
      pinned,
      hasTreasury,
    };
  }, [summary.customers, todayStr]);

  // Distinct due dates with counts for Excel date filter
  const distinctDueDates = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of summary.customers) {
      const d = c.dueDate || "none";
      map.set(d, (map.get(d) || 0) + 1);
    }
    const dates: Array<{ date: string; label: string; count: number }> = [];
    for (const [date, count] of map.entries()) {
      let label = date;
      if (date === "none") {
        label = "بدون موعد سداد محدد";
      } else if (date === todayStr) {
        label = `${date} (اليوم)`;
      } else if (date < todayStr) {
        label = `${date} (متأخر)`;
      }
      dates.push({ date, label, count });
    }
    dates.sort((a, b) => {
      if (a.date === "none") return 1;
      if (b.date === "none") return -1;
      return a.date.localeCompare(b.date);
    });
    return dates;
  }, [summary.customers, todayStr]);

  // Master customer list for Excel customer filter
  const allCustomerList = useMemo(() => {
    return summary.customers
      .map((c) => ({
        name: c.customerName,
        balance: c.currentBalance,
        status: c.status,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "ar"));
  }, [summary.customers]);

  // Search filter inside Customer Popover
  const filteredCustOptions = useMemo(() => {
    const q = custFilterSearch.trim().toLowerCase();
    if (!q) return allCustomerList;
    const normQ = normalizeArabicName(q);
    return allCustomerList.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        normalizeArabicName(c.name).includes(normQ)
    );
  }, [allCustomerList, custFilterSearch]);

  // Total active filters count across all Excel columns
  const totalActiveFiltersCount = useMemo(() => {
    let count = 0;
    if (selectedStatusFilters.size > 0) count += selectedStatusFilters.size;
    if (selectedDueDates.size > 0) count += selectedDueDates.size;
    if (selectedCustomerNames.size > 0) count += selectedCustomerNames.size;
    if (collectionFilter !== "all") count += 1;
    if (searchTerm.trim()) count += 1;
    return count;
  }, [
    selectedStatusFilters,
    selectedDueDates,
    selectedCustomerNames,
    collectionFilter,
    searchTerm,
  ]);

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

      // 2. Specific Customer Checklist Filter (Excel Customer column filter)
      if (selectedCustomerNames.size > 0 && !selectedCustomerNames.has(c.customerName)) {
        return false;
      }

      // 3. Specific Due Date Checklist Filter (Excel Due Date column filter)
      if (selectedDueDates.size > 0) {
        const dKey = c.dueDate || "none";
        if (!selectedDueDates.has(dKey)) return false;
      }

      // 4. Collection Filter (Excel Collected column filter)
      if (collectionFilter === "has_collected" && !(c.totalCollected > 0)) return false;
      if (collectionFilter === "zero_collected" && c.totalCollected > 0) return false;
      if (collectionFilter === "treasury_only" && !(c.collectedFromTreasury > 0)) return false;
      if (collectionFilter === "bank_only") {
        const hasBank =
          c.totalCollected > c.collectedFromTreasury ||
          c.treasuryTransactions?.some((t) => isBankPayment(t.type, t.description));
        if (!hasBank) return false;
      }

      // 5. Multi-Select Status / Category Filter (Excel Status column filter OR Top Chips)
      if (selectedStatusFilters.size > 0) {
        const isOverdue = Boolean(c.dueDate && c.dueDate < todayStr && c.remaining > 0 && (c.rate || 0) < 0.9);
        const isDueToday = c.dueDate === todayStr;
        const isCompleted = c.status === "مكتمل" || (c as any).status === "فائض";
        const isPartial = c.status === "جزئي";
        const isUnpaid = c.status === "لم يسدد";
        const isPinned = Boolean(c.isPinned);
        const hasTreasury = c.collectedFromTreasury > 0;

        let matchesAny = false;
        if (selectedStatusFilters.has("overdue") && isOverdue) matchesAny = true;
        if (selectedStatusFilters.has("due_today") && isDueToday) matchesAny = true;
        if (selectedStatusFilters.has("unpaid") && isUnpaid) matchesAny = true;
        if (selectedStatusFilters.has("partial") && isPartial) matchesAny = true;
        if (selectedStatusFilters.has("completed") && isCompleted) matchesAny = true;
        if (selectedStatusFilters.has("pinned") && isPinned) matchesAny = true;
        if (selectedStatusFilters.has("has_treasury") && hasTreasury) matchesAny = true;

        if (!matchesAny) return false;
      }

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
          const orderA = order[a.status] || 99;
          const orderB = order[b.status] || 99;
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
  }, [
    summary.customers,
    searchTerm,
    selectedStatusFilters,
    selectedDueDates,
    selectedCustomerNames,
    collectionFilter,
    todayStr,
    sortKey,
    sortDirection,
  ]);

  // Multi-select bulk deletion logic
  const deletableFilteredCustomers = useMemo(() => {
    return filteredCustomers.filter((c) => c.customerName !== "عميل نقدي (كاش)");
  }, [filteredCustomers]);

  const isAllSelected =
    deletableFilteredCustomers.length > 0 &&
    deletableFilteredCustomers.every((c) => selectedCustomers.has(c.customerName));

  const isSomeSelected =
    deletableFilteredCustomers.some((c) => selectedCustomers.has(c.customerName)) && !isAllSelected;

  const handleToggleSelectAll = useCallback(() => {
    if (isAllSelected) {
      setSelectedCustomers((prev) => {
        const next = new Set(prev);
        deletableFilteredCustomers.forEach((c) => next.delete(c.customerName));
        return next;
      });
    } else {
      setSelectedCustomers((prev) => {
        const next = new Set(prev);
        deletableFilteredCustomers.forEach((c) => next.add(c.customerName));
        return next;
      });
    }
  }, [isAllSelected, deletableFilteredCustomers]);

  const handleToggleSelectCustomer = useCallback((customerName: string) => {
    if (customerName === "عميل نقدي (كاش)") return;
    setSelectedCustomers((prev) => {
      const next = new Set(prev);
      if (next.has(customerName)) {
        next.delete(customerName);
      } else {
        next.add(customerName);
      }
      return next;
    });
  }, []);

  const handleExecuteBulkDelete = useCallback(() => {
    const toDelete = Array.from(selectedCustomers);
    if (!toDelete.length) return;
    if (onCustomersBulkDelete) {
      onCustomersBulkDelete(toDelete);
    } else if (onCustomerDelete) {
      toDelete.forEach((n) => onCustomerDelete(n));
    }
    toast.success(`تم حذف ${toDelete.length} عميل بنجاح من كاش فلو الأسبوع`);
    setSelectedCustomers(new Set());
    setIsBulkDeleteModalOpen(false);
  }, [selectedCustomers, onCustomersBulkDelete, onCustomerDelete]);

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

  // Render lightweight, zero-freeze dropdown for Excel-style column filters
  const renderFilterDropdown = (type: "customer" | "collected" | "due" | "status") => {
    switch (type) {
      case "customer": {
        const isFiltered = selectedCustomerNames.size > 0;
        return (
          <div className="w-72 p-3 bg-card text-card-foreground border-2 border-primary/20 shadow-2xl rounded-2xl space-y-2.5">
            <div className="flex items-center justify-between border-b pb-2">
              <span className="text-xs font-black text-foreground flex items-center gap-1.5">
                <Filter className="h-3.5 w-3.5 text-primary" />
                تصفية العملاء ({filteredCustOptions.length})
              </span>
              <div className="flex items-center gap-2">
                {isFiltered && (
                  <button
                    type="button"
                    onClick={() => setSelectedCustomerNames(new Set())}
                    className="text-[11px] font-bold text-rose-600 hover:underline cursor-pointer"
                  >
                    مسح
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setActiveHeaderFilter(null)}
                  className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
                  title="إغلاق"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <div className="relative">
              <Search className="absolute right-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                placeholder="ابحث في العملاء..."
                value={custFilterSearch}
                onChange={(e) => setCustFilterSearch(e.target.value)}
                className="w-full pr-8 pl-2 py-1.5 text-xs font-bold rounded-lg border bg-background text-foreground focus:outline-none focus:border-primary"
                autoFocus
              />
              {custFilterSearch && (
                <button
                  type="button"
                  onClick={() => setCustFilterSearch("")}
                  className="absolute left-2 top-2 text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center justify-between text-[11px] text-muted-foreground font-bold px-1">
              <button
                type="button"
                onClick={() => {
                  const allNames = new Set(filteredCustOptions.map((c) => c.name));
                  setSelectedCustomerNames(allNames);
                }}
                className="text-primary hover:underline cursor-pointer"
              >
                تحديد الكل
              </button>
              <button
                type="button"
                onClick={() => setSelectedCustomerNames(new Set())}
                className="hover:underline cursor-pointer"
              >
                إلغاء التحديد
              </button>
            </div>

            <div className="max-h-56 overflow-y-auto space-y-1 pr-0.5 pl-1 smooth-touch-scroll">
              {filteredCustOptions.map((cust) => {
                const checked = selectedCustomerNames.has(cust.name);
                return (
                  <label
                    key={cust.name}
                    className={cn(
                      "flex items-center justify-between gap-2 p-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors",
                      checked ? "bg-primary/10 text-primary font-bold" : "hover:bg-muted/70 text-foreground"
                    )}
                  >
                    <div className="flex items-center gap-2 overflow-hidden">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          setSelectedCustomerNames((prev) => {
                            const next = new Set(prev);
                            if (next.has(cust.name)) next.delete(cust.name);
                            else next.add(cust.name);
                            return next;
                          });
                        }}
                        className="h-3.5 w-3.5 rounded border-primary/40 accent-primary cursor-pointer shrink-0"
                      />
                      <span className="truncate">{cust.name}</span>
                    </div>
                    {cust.balance > 0 && (
                      <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                        {fmtMoney(cust.balance)}
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          </div>
        );
      }

      case "collected": {
        const isFiltered = collectionFilter !== "all";
        return (
          <div className="w-64 p-3 bg-card text-card-foreground border-2 border-primary/20 shadow-2xl rounded-2xl space-y-2">
            <div className="flex items-center justify-between border-b pb-2">
              <span className="text-xs font-black text-foreground flex items-center gap-1.5">
                <Filter className="h-3.5 w-3.5 text-primary" />
                تصفية التحصيل
              </span>
              <div className="flex items-center gap-2">
                {isFiltered && (
                  <button
                    type="button"
                    onClick={() => setCollectionFilter("all")}
                    className="text-[11px] font-bold text-rose-600 hover:underline cursor-pointer"
                  >
                    مسح
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setActiveHeaderFilter(null)}
                  className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
                  title="إغلاق"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <div className="space-y-1">
              {[
                { id: "all", label: "الكل (جميع العملاء)" },
                { id: "has_collected", label: "تم تحصيل مبالغ (> 0 ج.م)" },
                { id: "zero_collected", label: "لم يتم تحصيل شيء (0 ج.م)" },
                { id: "treasury_only", label: "تحصيلات بالخزينة فقط ⚡" },
                { id: "bank_only", label: "تحصيلات بنكية / كاش فقط 🏛️" },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    setCollectionFilter(opt.id as any);
                    setActiveHeaderFilter(null);
                  }}
                  className={cn(
                    "w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer text-right",
                    collectionFilter === opt.id
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted text-foreground"
                  )}
                >
                  <span>{opt.label}</span>
                  {collectionFilter === opt.id && <Check className="h-3.5 w-3.5 shrink-0" />}
                </button>
              ))}
            </div>
          </div>
        );
      }

      case "due": {
        const isFiltered = selectedDueDates.size > 0;
        return (
          <div className="w-72 p-3 bg-card text-card-foreground border-2 border-primary/20 shadow-2xl rounded-2xl space-y-2.5">
            <div className="flex items-center justify-between border-b pb-2">
              <span className="text-xs font-black text-foreground flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-primary" />
                مواعيد السداد ({distinctDueDates.length})
              </span>
              <div className="flex items-center gap-2">
                {isFiltered && (
                  <button
                    type="button"
                    onClick={() => setSelectedDueDates(new Set())}
                    className="text-[11px] font-bold text-rose-600 hover:underline cursor-pointer"
                  >
                    مسح
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setActiveHeaderFilter(null)}
                  className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
                  title="إغلاق"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] text-muted-foreground font-bold px-1">
              <button
                type="button"
                onClick={() => {
                  const allDates = new Set(distinctDueDates.map((d) => d.date));
                  setSelectedDueDates(allDates);
                }}
                className="text-primary hover:underline cursor-pointer"
              >
                تحديد الكل
              </button>
              <button
                type="button"
                onClick={() => setSelectedDueDates(new Set())}
                className="hover:underline cursor-pointer"
              >
                إلغاء التحديد
              </button>
            </div>

            <div className="max-h-56 overflow-y-auto space-y-1 pr-0.5 pl-1 smooth-touch-scroll">
              {distinctDueDates.map((d) => {
                const checked = selectedDueDates.has(d.date);
                const isOverdue = d.date !== "none" && d.date < todayStr;
                const isToday = d.date === todayStr;
                return (
                  <label
                    key={d.date}
                    className={cn(
                      "flex items-center justify-between gap-2 p-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors",
                      checked ? "bg-primary/10 text-primary font-bold" : "hover:bg-muted/70 text-foreground"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          setSelectedDueDates((prev) => {
                            const next = new Set(prev);
                            if (next.has(d.date)) next.delete(d.date);
                            else next.add(d.date);
                            return next;
                          });
                        }}
                        className="h-3.5 w-3.5 rounded border-primary/40 accent-primary cursor-pointer shrink-0"
                      />
                      <span className={cn(isOverdue && "text-destructive font-bold", isToday && "text-blue-600 font-bold")}>
                        {d.label}
                      </span>
                    </div>
                    <span className="text-[10px] font-bold bg-muted px-1.5 py-0.5 rounded-full text-muted-foreground">
                      {d.count}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        );
      }

      case "status": {
        const isFiltered = selectedStatusFilters.size > 0;
        const statusOptions: Array<{ id: FilterStatus; label: string; count: number; colorClass: string }> = [
          { id: "overdue", label: "متأخرون", count: counts.overdue, colorClass: "text-rose-600 font-bold" },
          { id: "due_today", label: "مستحق اليوم", count: counts.dueToday, colorClass: "text-blue-600 font-bold" },
          { id: "unpaid", label: "لم يسدد", count: counts.unpaid, colorClass: "text-rose-500 font-bold" },
          { id: "partial", label: "جزئي", count: counts.partial, colorClass: "text-amber-600 font-bold" },
          { id: "completed", label: "مكتمل", count: counts.completed, colorClass: "text-emerald-600 font-bold" },
          { id: "pinned", label: "المثبت أسبوعياً", count: counts.pinned, colorClass: "text-purple-600 font-bold" },
          { id: "has_treasury", label: "تحصيلات خزينة", count: counts.hasTreasury, colorClass: "text-teal-600 font-bold" },
        ];

        return (
          <div className="w-72 p-3 bg-card text-card-foreground border-2 border-primary/20 shadow-2xl rounded-2xl space-y-2.5">
            <div className="flex items-center justify-between border-b pb-2">
              <span className="text-xs font-black text-foreground flex items-center gap-1.5">
                <Filter className="h-3.5 w-3.5 text-primary" />
                حالة السداد (تحديد متعدد)
              </span>
              <div className="flex items-center gap-2">
                {isFiltered && (
                  <button
                    type="button"
                    onClick={() => setSelectedStatusFilters(new Set())}
                    className="text-[11px] font-bold text-rose-600 hover:underline cursor-pointer"
                  >
                    مسح
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setActiveHeaderFilter(null)}
                  className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
                  title="إغلاق"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground leading-relaxed">
              💡 يمكنك اختيار أكثر من حالة معاً (مثل المتأخرين والمستحق اليوم)
            </p>

            <div className="flex items-center justify-between text-[11px] text-muted-foreground font-bold px-1">
              <button
                type="button"
                onClick={() => {
                  const all = new Set<FilterStatus>([
                    "overdue",
                    "due_today",
                    "unpaid",
                    "partial",
                    "completed",
                    "pinned",
                    "has_treasury",
                  ]);
                  setSelectedStatusFilters(all);
                }}
                className="text-primary hover:underline cursor-pointer"
              >
                تحديد الكل
              </button>
              <button
                type="button"
                onClick={() => setSelectedStatusFilters(new Set())}
                className="hover:underline cursor-pointer"
              >
                إلغاء التحديد
              </button>
            </div>

            <div className="space-y-1">
              {statusOptions.map((opt) => {
                const checked = selectedStatusFilters.has(opt.id);
                return (
                  <label
                    key={opt.id}
                    className={cn(
                      "flex items-center justify-between gap-2 p-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors",
                      checked ? "bg-primary/10 text-primary font-bold" : "hover:bg-muted/70 text-foreground"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => handleToggleStatusFilter(opt.id)}
                        className="h-3.5 w-3.5 rounded border-primary/40 accent-primary cursor-pointer shrink-0"
                      />
                      <span className={opt.colorClass}>{opt.label}</span>
                    </div>
                    <span className="text-[10px] font-bold bg-muted px-1.5 py-0.5 rounded-full text-muted-foreground">
                      {opt.count}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        );
      }
    }
  };

  const renderSortHeader = (
    key: SortKey,
    label: string,
    align: "right" | "center" = "center",
    extraClass: string = "",
    filterType?: "customer" | "collected" | "due" | "status"
  ) => {
    const isActive = sortKey === key;
    const isFiltered =
      filterType === "customer"
        ? selectedCustomerNames.size > 0
        : filterType === "collected"
        ? collectionFilter !== "all"
        : filterType === "due"
        ? selectedDueDates.size > 0
        : filterType === "status"
        ? selectedStatusFilters.size > 0
        : false;

    const filterCount =
      filterType === "customer"
        ? selectedCustomerNames.size
        : filterType === "due"
        ? selectedDueDates.size
        : filterType === "status"
        ? selectedStatusFilters.size
        : 0;

    const isDropdownOpen = activeHeaderFilter === filterType;

    return (
      <TableHead
        className={`${FONT.headerCell} ${extraClass} relative select-none py-3.5`}
      >
        <div
          className={`flex items-center gap-1.5 ${
            align === "center" ? "justify-center text-center" : "justify-start text-right"
          }`}
        >
          {/* Column Sort Trigger */}
          <div
            onClick={() => handleSort(key)}
            className="inline-flex items-center gap-1 cursor-pointer hover:text-primary transition-colors select-none"
            title={`ترتيب حسب ${label} (${isActive && sortDirection === "asc" ? "تنازلياً" : "تصاعدياً"})`}
          >
            <span className={isActive ? "text-primary font-black" : ""}>{label}</span>
            {isActive ? (
              sortDirection === "asc" ? (
                <ArrowUp className="h-3.5 w-3.5 text-primary shrink-0 stroke-[2.5]" />
              ) : (
                <ArrowDown className="h-3.5 w-3.5 text-primary shrink-0 stroke-[2.5]" />
              )
            ) : (
              <ArrowUpDown className="h-3 w-3 text-muted-foreground/40 shrink-0 hover:text-muted-foreground" />
            )}
          </div>

          {/* Column Filter Icon Button */}
          {filterType && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setActiveHeaderFilter((prev) => (prev === filterType ? null : filterType));
              }}
              className={cn(
                "p-1 rounded-md transition-all cursor-pointer inline-flex items-center justify-center no-print print:hidden shrink-0",
                isFiltered
                  ? "bg-primary text-primary-foreground shadow-xs ring-1 ring-primary"
                  : isDropdownOpen
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground/50 hover:text-foreground hover:bg-muted"
              )}
              title={`تصفية حسب ${label} (Excel)`}
            >
              <Filter className={cn("h-3.5 w-3.5", (isFiltered || isDropdownOpen) && "fill-current")} />
              {filterCount > 0 && (
                <span className="mr-0.5 text-[10px] font-black">{filterCount}</span>
              )}
            </button>
          )}
        </div>

        {/* Dropdown Menu Popup rendered directly when open */}
        {isDropdownOpen && filterType && (
          <div
            className={cn(
              "absolute top-full mt-1.5 z-50 no-print text-right",
              align === "center" ? "left-1/2 -translate-x-1/2" : "right-0"
            )}
            onClick={(e) => e.stopPropagation()}
          >
            {renderFilterDropdown(filterType)}
          </div>
        )}
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

        {/* Action buttons: View Switcher, Add Customer, and Export */}
        <div className="flex items-center gap-2 mr-auto flex-wrap">
          {/* Mobile & Desktop View Switcher */}
          <div className="inline-flex items-center gap-1 bg-muted/60 p-1 rounded-xl border border-border">
            <button
              type="button"
              onClick={() => {
                setViewMode("cards");
                localStorage.setItem("cashflow_view_mode", "cards");
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                viewMode === "cards"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              title="عرض بطاقات الموبايل الذكية"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>بطاقات</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setViewMode("table");
                localStorage.setItem("cashflow_view_mode", "table");
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                viewMode === "table"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              title="عرض الجدول الكامل"
            >
              <TableProperties className="w-3.5 h-3.5" />
              <span>جدول</span>
            </button>
          </div>

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
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1 w-full sm:w-auto flex-nowrap -mx-1 px-1 touch-pan-x smooth-touch-scroll">
          <Button
            variant={selectedStatusFilters.size === 0 ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedStatusFilters(new Set())}
            className="rounded-full text-xs font-black h-9 px-4 cursor-pointer shadow-2xs"
          >
            الكل ({counts.all})
          </Button>
          <Button
            variant={selectedStatusFilters.has("completed") ? "default" : "outline"}
            size="sm"
            onClick={() => handleToggleStatusFilter("completed")}
            className={cn(
              "rounded-full text-xs font-black h-9 px-4 cursor-pointer shadow-2xs transition-all",
              selectedStatusFilters.has("completed")
                ? "bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm"
                : "text-emerald-700 dark:text-emerald-300 border-2 border-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
            )}
          >
            {selectedStatusFilters.has("completed") && <Check className="h-3.5 w-3.5 inline ml-1" />}
            مكتمل ({counts.completed})
          </Button>
          <Button
            variant={selectedStatusFilters.has("partial") ? "default" : "outline"}
            size="sm"
            onClick={() => handleToggleStatusFilter("partial")}
            className={cn(
              "rounded-full text-xs font-black h-9 px-4 cursor-pointer shadow-2xs transition-all",
              selectedStatusFilters.has("partial")
                ? "bg-amber-600 text-white hover:bg-amber-700 shadow-sm"
                : "text-amber-700 dark:text-amber-300 border-2 border-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40"
            )}
          >
            {selectedStatusFilters.has("partial") && <Check className="h-3.5 w-3.5 inline ml-1" />}
            جزئي ({counts.partial})
          </Button>
          <Button
            variant={selectedStatusFilters.has("unpaid") ? "default" : "outline"}
            size="sm"
            onClick={() => handleToggleStatusFilter("unpaid")}
            className={cn(
              "rounded-full text-xs font-black h-9 px-4 cursor-pointer shadow-2xs transition-all",
              selectedStatusFilters.has("unpaid")
                ? "bg-rose-600 text-white hover:bg-rose-700 shadow-sm"
                : "text-rose-700 dark:text-rose-300 border-2 border-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40"
            )}
          >
            {selectedStatusFilters.has("unpaid") && <Check className="h-3.5 w-3.5 inline ml-1" />}
            لم يسدد ({counts.unpaid})
          </Button>
          <Button
            variant={selectedStatusFilters.has("overdue") ? "default" : "outline"}
            size="sm"
            onClick={() => handleToggleStatusFilter("overdue")}
            className={cn(
              "rounded-full text-xs font-black h-9 px-4 gap-1.5 cursor-pointer shadow-2xs transition-all",
              selectedStatusFilters.has("overdue")
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-sm"
                : "text-destructive border-2 border-destructive hover:bg-rose-50 dark:hover:bg-rose-950/40"
            )}
          >
            <AlertTriangle className="h-4 w-4" />
            {selectedStatusFilters.has("overdue") && <Check className="h-3.5 w-3.5" />}
            <span>متأخرون ({counts.overdue})</span>
          </Button>
          {counts.dueToday > 0 && (
            <Button
              variant={selectedStatusFilters.has("due_today") ? "default" : "outline"}
              size="sm"
              onClick={() => handleToggleStatusFilter("due_today")}
              className={cn(
                "rounded-full text-xs font-black h-9 px-4 gap-1.5 cursor-pointer shadow-2xs transition-all",
                selectedStatusFilters.has("due_today")
                  ? "bg-blue-600 text-white hover:bg-blue-700 shadow-sm"
                  : "text-blue-700 dark:text-blue-300 border-2 border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40"
              )}
            >
              <Calendar className="h-3.5 w-3.5" />
              {selectedStatusFilters.has("due_today") && <Check className="h-3.5 w-3.5" />}
              <span>مستحق اليوم ({counts.dueToday})</span>
            </Button>
          )}
          {counts.pinned > 0 && (
            <Button
              variant={selectedStatusFilters.has("pinned") ? "default" : "outline"}
              size="sm"
              onClick={() => handleToggleStatusFilter("pinned")}
              className={cn(
                "rounded-full text-xs font-black h-9 px-4 gap-1.5 cursor-pointer shadow-2xs transition-all",
                selectedStatusFilters.has("pinned")
                  ? "bg-purple-600 text-white hover:bg-purple-700 shadow-sm"
                  : "text-purple-700 dark:text-purple-300 border-2 border-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950/40"
              )}
            >
              <Pin className="h-3.5 w-3.5 rotate-45" />
              {selectedStatusFilters.has("pinned") && <Check className="h-3.5 w-3.5" />}
              <span>المثبت أسبوعياً ({counts.pinned})</span>
            </Button>
          )}
          {counts.hasTreasury > 0 && (
            <Button
              variant={selectedStatusFilters.has("has_treasury") ? "default" : "outline"}
              size="sm"
              onClick={() => handleToggleStatusFilter("has_treasury")}
              className={cn(
                "rounded-full text-xs font-black h-9 px-4 gap-1.5 cursor-pointer shadow-2xs transition-all",
                selectedStatusFilters.has("has_treasury")
                  ? "bg-teal-600 text-white hover:bg-teal-700 shadow-sm"
                  : "text-teal-700 dark:text-teal-300 border-2 border-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/40"
              )}
            >
              <Zap className="h-3.5 w-3.5 fill-current" />
              {selectedStatusFilters.has("has_treasury") && <Check className="h-3.5 w-3.5" />}
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
          {(totalActiveFiltersCount > 0 || sortKey !== "status" || sortDirection !== "asc") && (
            <button
              onClick={handleResetFilters}
              className="inline-flex items-center gap-1 text-xs text-primary font-black hover:underline cursor-pointer bg-primary/10 px-2.5 py-1 rounded-full border border-primary/20"
              title="إعادة ضبط البحث والتصفية والترتيب"
            >
              <RotateCcw className="h-3 w-3" />
              <span>إعادة ضبط {totalActiveFiltersCount > 0 ? `(${totalActiveFiltersCount})` : ""}</span>
            </button>
          )}
        </div>
      </div>

      {/* Active Filters Pill Bar (Excel-like Active Criteria) */}
      {totalActiveFiltersCount > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-3.5 py-2 bg-primary/5 rounded-2xl border-2 border-primary/20 text-xs no-print shadow-2xs">
          <span className="font-black text-foreground flex items-center gap-1.5">
            <Filter className="h-3.5 w-3.5 text-primary" />
            فلاتر نشطة ({totalActiveFiltersCount}):
          </span>

          {selectedStatusFilters.has("overdue") && (
            <span className="inline-flex items-center gap-1 bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 px-2.5 py-0.5 rounded-full font-bold">
              متأخرون
              <button onClick={() => handleToggleStatusFilter("overdue")} className="hover:text-rose-950 cursor-pointer">
                <X className="h-3 w-3" />
              </button>
            </span>
          )}

          {selectedStatusFilters.has("due_today") && (
            <span className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 px-2.5 py-0.5 rounded-full font-bold">
              مستحق اليوم
              <button onClick={() => handleToggleStatusFilter("due_today")} className="hover:text-blue-950 cursor-pointer">
                <X className="h-3 w-3" />
              </button>
            </span>
          )}

          {selectedStatusFilters.has("unpaid") && (
            <span className="inline-flex items-center gap-1 bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300 px-2.5 py-0.5 rounded-full font-bold">
              لم يسدد
              <button onClick={() => handleToggleStatusFilter("unpaid")} className="hover:text-rose-950 cursor-pointer">
                <X className="h-3 w-3" />
              </button>
            </span>
          )}

          {selectedStatusFilters.has("partial") && (
            <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 px-2.5 py-0.5 rounded-full font-bold">
              جزئي
              <button onClick={() => handleToggleStatusFilter("partial")} className="hover:text-amber-950 cursor-pointer">
                <X className="h-3 w-3" />
              </button>
            </span>
          )}

          {selectedStatusFilters.has("completed") && (
            <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 px-2.5 py-0.5 rounded-full font-bold">
              مكتمل
              <button onClick={() => handleToggleStatusFilter("completed")} className="hover:text-emerald-950 cursor-pointer">
                <X className="h-3 w-3" />
              </button>
            </span>
          )}

          {selectedStatusFilters.has("pinned") && (
            <span className="inline-flex items-center gap-1 bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 px-2.5 py-0.5 rounded-full font-bold">
              المثبت أسبوعياً
              <button onClick={() => handleToggleStatusFilter("pinned")} className="hover:text-purple-950 cursor-pointer">
                <X className="h-3 w-3" />
              </button>
            </span>
          )}

          {selectedStatusFilters.has("has_treasury") && (
            <span className="inline-flex items-center gap-1 bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300 px-2.5 py-0.5 rounded-full font-bold">
              تحصيلات خزينة
              <button onClick={() => handleToggleStatusFilter("has_treasury")} className="hover:text-teal-950 cursor-pointer">
                <X className="h-3 w-3" />
              </button>
            </span>
          )}

          {selectedCustomerNames.size > 0 && (
            <span className="inline-flex items-center gap-1 bg-primary/15 text-primary px-2.5 py-0.5 rounded-full font-bold">
              العملاء ({selectedCustomerNames.size})
              <button onClick={() => setSelectedCustomerNames(new Set())} className="hover:text-primary cursor-pointer">
                <X className="h-3 w-3" />
              </button>
            </span>
          )}

          {selectedDueDates.size > 0 && (
            <span className="inline-flex items-center gap-1 bg-primary/15 text-primary px-2.5 py-0.5 rounded-full font-bold">
              مواعيد السداد ({selectedDueDates.size})
              <button onClick={() => setSelectedDueDates(new Set())} className="hover:text-primary cursor-pointer">
                <X className="h-3 w-3" />
              </button>
            </span>
          )}

          {collectionFilter !== "all" && (
            <span className="inline-flex items-center gap-1 bg-primary/15 text-primary px-2.5 py-0.5 rounded-full font-bold">
              {collectionFilter === "has_collected" ? "تم تحصيل مبالغ" : collectionFilter === "zero_collected" ? "0 ج.م" : collectionFilter === "treasury_only" ? "خزينة فقط" : "بنك فقط"}
              <button onClick={() => setCollectionFilter("all")} className="hover:text-primary cursor-pointer">
                <X className="h-3 w-3" />
              </button>
            </span>
          )}

          {searchTerm && (
            <span className="inline-flex items-center gap-1 bg-primary/15 text-primary px-2.5 py-0.5 rounded-full font-bold">
              بحث: {searchTerm}
              <button onClick={() => setSearchTerm("")} className="hover:text-primary cursor-pointer">
                <X className="h-3 w-3" />
              </button>
            </span>
          )}

          <button
            type="button"
            onClick={handleResetFilters}
            className="mr-auto text-xs font-black text-rose-600 hover:underline cursor-pointer flex items-center gap-1"
          >
            <RotateCcw className="h-3 w-3" />
            مسح الكل
          </button>
        </div>
      )}

      {/* Bulk Selection Action Bar */}
      {selectedCustomers.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 bg-rose-500/10 dark:bg-rose-950/40 border-2 border-rose-500/40 p-3.5 rounded-2xl shadow-sm no-print animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-rose-600 text-white flex items-center justify-center font-black text-sm shadow-xs">
              {selectedCustomers.size}
            </div>
            <div>
              <span className="text-sm sm:text-base font-black text-foreground">
                تم تحديد <strong className="text-rose-600 dark:text-rose-400">{selectedCustomers.size}</strong> عميل
              </span>
              <span className="hidden sm:inline-block text-xs text-muted-foreground mr-2 font-medium">
                (جاهز للحذف من كاش فلو هذا الأسبوع)
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 mr-auto">
            <button
              type="button"
              onClick={() => setSelectedCustomers(new Set())}
              className="h-9 px-3.5 rounded-xl border-2 border-border hover:bg-muted text-foreground font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer transition-colors"
              title="إلغاء التحديد الحالي"
            >
              <X className="h-4 w-4" />
              <span>إلغاء التحديد</span>
            </button>
            <button
              type="button"
              onClick={() => setIsBulkDeleteModalOpen(true)}
              className="h-9 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-black text-xs inline-flex items-center gap-1.5 cursor-pointer shadow-sm transition-all"
              title="حذف كل العملاء المحددين دفعة واحدة"
            >
              <Trash2 className="h-4 w-4" />
              <span>حذف المحددين ({selectedCustomers.size})</span>
            </button>
          </div>
        </div>
      )}

      {/* 1. Mobile Cards View (Visible when viewMode === 'cards') */}
      <div className={viewMode === "cards" ? "block print:hidden" : "hidden"}>
        <CashFlowMobileCards
          customers={filteredCustomers}
          todayStr={todayStr}
        />
      </div>

      {/* 2. Cash Flow Main Data Table (Visible when viewMode === 'table', and always in print) */}
      <div className={viewMode === "table" ? "block" : "hidden print:block"}>
        <div className="bg-card rounded-2xl border-2 border-primary/20 shadow-md overflow-hidden cashflow-table-container">
          {/* Mobile Swipe Hint */}
          <div className="block md:hidden bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 border-b border-amber-200 dark:border-amber-800 text-[11px] font-bold py-1.5 px-3 text-center no-print">
            👈 يمكنك سحب الجدول أفقياً لتصفح بقية الأعمدة
          </div>
          <div
            className="overflow-x-auto w-full smooth-touch-scroll"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            {/* Click-away backdrop for header filter dropdowns */}
            {activeHeaderFilter && (
              <div
                className="fixed inset-0 z-40 bg-black/5 no-print"
                onClick={() => setActiveHeaderFilter(null)}
              />
            )}
            <Table className="min-w-[1050px] print:min-w-0">
            <TableHeader className="bg-muted/80">
              <TableRow className="border-b-2 border-primary/30 hover:bg-transparent">
                <TableHead className="w-12 text-center py-3.5 no-print col-select">
                  <div className="flex items-center justify-center">
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = isSomeSelected;
                      }}
                      onChange={handleToggleSelectAll}
                      className="h-4 w-4 rounded border-2 border-primary/40 accent-primary cursor-pointer transition-transform hover:scale-110"
                      title={isAllSelected ? "إلغاء تحديد الكل" : "تحديد كل العملاء المعروضين"}
                      aria-label="تحديد كل العملاء المعروضين"
                    />
                  </div>
                </TableHead>
                {renderSortHeader("index", "م", "center", "w-10 col-index")}
                {renderSortHeader("currentBalance", "الرصيد الحالي", "center", "col-balance")}
                {renderSortHeader("customerName", "العميل", "right", "col-customer", "customer")}
                {renderSortHeader("expectedAmount", "المتوقع", "center", "col-expected")}
                {renderSortHeader("totalCollected", "المحصل", "center", "col-collected", "collected")}
                {renderSortHeader("dueDate", "موعد السداد", "center", "col-due", "due")}
                {renderSortHeader("rate", "نسبة السداد", "center", "col-rate")}
                {renderSortHeader("status", "حالة السداد", "center", "col-status", "status")}
                {renderSortHeader("remaining", "المتبقي", "center", "col-remaining")}
                <TableHead className={`${FONT.headerCell} text-right py-3.5 col-notes`}>ملاحظات</TableHead>
                <TableHead className={`w-24 text-center ${FONT.headerCell} py-3.5 no-print col-actions`}>إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCustomers.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={12}
                    className="h-36 text-center text-muted-foreground text-sm font-bold"
                  >
                    لا توجد بيانات مطابقة للبحث أو التصفية الحالية.
                  </TableCell>
                </TableRow>
              ) : (
                filteredCustomers.map((cust, idx) => {
                  const isEditingThisRow = editing?.customerName === cust.customerName;
                  const isSelected = selectedCustomers.has(cust.customerName);
                  const isDeletable = cust.customerName !== "عميل نقدي (كاش)";
                  const isOverdue =
                    Boolean(cust.dueDate && cust.dueDate < todayStr && cust.remaining > 0 && (cust.rate || 0) < 0.9);
                  const isDueToday = cust.dueDate === todayStr;
                  const hasTreasuryPayment = cust.collectedFromTreasury > 0;

                  // High-fidelity UI/UX Pro Max Row Styling:
                  // 1. Editing: Primary highlighted outline
                  // 2. Selected for Bulk Delete: Highlighted with rose border & soft rose background
                  // 3. Due Today & Unpaid: Soft rose background with a bold blue right-border callout
                  // 4. Completed (مكتمل / فائض): Subtle emerald background (0.04 opacity)
                  // 5. Partial (جزئي): Subtle amber background (0.04 opacity)
                  // 6. Unpaid (لم يسدد): Subtle rose background (0.04 opacity - exact match with completed)
                  const statusClass =
                    cust.status === "لم يسدد"
                      ? "row-unpaid"
                      : cust.status === "جزئي"
                      ? "row-partial"
                      : "row-completed";

                  const rowClass = `${isEditingThisRow
                    ? "bg-primary/10 border-2 border-primary"
                    : isSelected
                    ? "bg-rose-500/[0.08] dark:bg-rose-950/30 border-b border-border/80 border-r-4 border-r-rose-600 dark:border-r-rose-500 transition-colors"
                    : isDueToday && cust.remaining > 0 && cust.status === "لم يسدد"
                    ? "bg-rose-500/[0.04] dark:bg-rose-950/20 border-b border-border/80 border-r-4 border-r-blue-500 dark:border-r-blue-400 hover:bg-rose-500/[0.08] dark:hover:bg-rose-950/30 transition-colors"
                    : isDueToday && (cust.status === "مكتمل" || (cust as any).status === "فائض")
                    ? "bg-emerald-500/[0.04] dark:bg-emerald-950/20 border-b border-border/80 border-r-4 border-r-blue-500 dark:border-r-blue-400 hover:bg-emerald-500/[0.08] dark:hover:bg-emerald-950/30 transition-colors"
                    : cust.status === "مكتمل" || (cust as any).status === "فائض"
                    ? "bg-emerald-500/[0.04] dark:bg-emerald-950/20 border-b border-border/80 hover:bg-emerald-500/[0.08] dark:hover:bg-emerald-950/30 transition-colors"
                    : cust.status === "جزئي"
                    ? "bg-amber-500/[0.04] dark:bg-amber-950/20 border-b border-border/80 hover:bg-amber-500/[0.08] dark:hover:bg-amber-950/30 transition-colors"
                    : cust.status === "لم يسدد"
                    ? "bg-rose-500/[0.04] dark:bg-rose-950/20 border-b border-border/80 hover:bg-rose-500/[0.08] dark:hover:bg-rose-950/30 transition-colors"
                    : "border-b border-border/80 hover:bg-muted/40 transition-colors"} ${statusClass}`;

                  return (
                    <TableRow key={cust.customerName} className={rowClass}>
                      {/* Selection Checkbox */}
                      <TableCell className="text-center py-3 no-print col-select">
                        {isDeletable ? (
                          <div className="flex items-center justify-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleSelectCustomer(cust.customerName)}
                              className="h-4 w-4 rounded border-2 border-primary/40 accent-primary cursor-pointer transition-transform hover:scale-110"
                              aria-label={`تحديد ${cust.customerName}`}
                            />
                          </div>
                        ) : (
                          <span className="text-muted-foreground/30 text-xs select-none">-</span>
                        )}
                      </TableCell>

                      {/* Index */}
                      <TableCell
                        className={`text-center py-3 col-index ${FONT.index} ${
                          isEditingThisRow ? "text-primary" : "text-muted-foreground"
                        }`}
                      >
                        {idx + 1}
                      </TableCell>

                      {/* Current Balance */}
                      <TableCell className="text-center py-3 whitespace-nowrap col-balance">
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
                            className="flex flex-col cursor-pointer group overflow-hidden"
                            title="انقر لتعديل بيانات العميل"
                          >
                            <span className={`${FONT.name} group-hover:text-primary line-clamp-2 leading-tight break-words`}>
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
                      <TableCell className="text-center py-3 whitespace-nowrap col-expected">
                        {isEditingThisRow ? (
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-center gap-1.5">
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
                            className="inline-flex items-center justify-center cursor-pointer group"
                            title="انقر لتعديل المبلغ المتوقع"
                          >
                            <span className={`${FONT.money} text-primary bg-primary/10 border-2 border-primary/25 px-2.5 py-1 rounded-xl group-hover:bg-primary/20 group-hover:border-primary`}>
                              {fmtMoney(cust.expectedAmount)}
                            </span>
                          </div>
                        )}
                      </TableCell>

                      {/* Collected */}
                      <TableCell className="text-center py-3 whitespace-nowrap col-collected">
                        <div className={`${FONT.money} text-emerald-700 dark:text-emerald-400 font-extrabold text-base`}>
                          {fmtMoney(cust.totalCollected)}
                        </div>
                        {!isEditingThisRow && (() => {
                          let custCash = 0;
                          let custBank = 0;
                          if (Array.isArray(cust.treasuryTransactions) && cust.treasuryTransactions.length > 0) {
                            for (const tx of cust.treasuryTransactions) {
                              if (isBankPayment(tx.type, tx.description)) {
                                custBank += tx.amount || 0;
                              } else {
                                custCash += tx.amount || 0;
                              }
                            }
                          } else {
                            if (isBankCustomer(cust.customerName, cust.notes)) {
                              custBank = cust.collectedFromTreasury || 0;
                            } else {
                              custCash = cust.collectedFromTreasury || 0;
                            }
                          }

                          const additionalSheet = Math.max(0, (cust.totalCollected || 0) - (cust.collectedFromTreasury || 0));

                          if (custCash === 0 && custBank === 0 && additionalSheet === 0) {
                            return null;
                          }

                          return (
                            <div className="flex flex-col items-center gap-1 mt-1">
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
                              {additionalSheet > 0 && (
                                <div className="inline-flex items-center gap-1 text-xs font-black text-amber-800 dark:text-amber-300 bg-amber-100 dark:bg-amber-950 px-2 py-0.5 rounded-md border border-amber-300">
                                  <FileSpreadsheet className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                                  <span>+{fmtMoney(additionalSheet)} شيت</span>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </TableCell>

                      {/* Due Date */}
                      <TableCell className="text-center py-3 whitespace-nowrap col-due">
                        {cust.dueDate ? (
                          <div className="flex items-center justify-center gap-1.5">
                            {isDueToday ? (
                              <span
                                className={`${FONT.date} text-blue-800 dark:text-blue-200 font-extrabold bg-blue-100 dark:bg-blue-950/80 px-2.5 py-1 rounded-lg border-2 border-blue-400 dark:border-blue-500 inline-flex items-center gap-1.5 shadow-2xs`}
                                title="موعد التحصيل مستحق اليوم!"
                              >
                                <Calendar className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                                <span>{cust.dueDate}</span>
                                <span className="text-[10px] font-black bg-blue-600 text-white dark:bg-blue-500 dark:text-slate-950 px-1.5 py-0.5 rounded-sm">
                                  اليوم
                                </span>
                              </span>
                            ) : (
                              <span
                                className={`${FONT.date} ${
                                  isOverdue
                                    ? "text-rose-600 dark:text-rose-400 font-black bg-rose-100 dark:bg-rose-950 px-2 py-0.5 rounded border border-rose-300"
                                    : "text-foreground"
                                }`}
                              >
                                {cust.dueDate}
                              </span>
                            )}
                            {isOverdue && !isDueToday && (
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
                      <TableCell className="text-center py-3 whitespace-nowrap col-remaining">
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

      {/* Bulk Delete Confirmation Modal - UI/UX Pro Max */}
      {isBulkDeleteModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
          dir="rtl"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsBulkDeleteModalOpen(false);
          }}
        >
          <div className="bg-card text-card-foreground border-2 border-rose-500/40 shadow-2xl rounded-3xl w-full max-w-lg p-6 space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 border-b border-border/80 pb-3">
              <div className="p-3 bg-rose-500/15 rounded-2xl text-rose-600 dark:text-rose-400">
                <Trash2 className="h-6 w-6 stroke-[2.5]" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-black text-foreground">
                  تأكيد حذف {selectedCustomers.size} عميل دفعة واحدة
                </h3>
                <p className="text-xs text-muted-foreground font-medium mt-0.5">
                  استبعاد هؤلاء العملاء من كاش فلو الأسبوع الحالي
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsBulkDeleteModalOpen(false)}
                className="h-8 w-8 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center cursor-pointer transition-colors"
                title="إغلاق"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              <p className="text-sm font-bold text-foreground">
                هل أنت متأكد من رغبتك في حذف العملاء التاليين ({selectedCustomers.size}) من جدول هذا الأسبوع؟
              </p>

              {/* Scrollable preview list with quick removal chips */}
              <div className="max-h-52 overflow-y-auto space-y-1.5 p-3 rounded-2xl bg-muted/40 border border-border/80">
                {Array.from(selectedCustomers).map((name, i) => (
                  <div
                    key={name}
                    className="flex items-center justify-between text-xs font-bold bg-background/90 px-3 py-2 rounded-xl border border-border/60 hover:border-rose-300 dark:hover:border-rose-900 transition-colors"
                  >
                    <span className="text-foreground flex items-center gap-1.5 truncate">
                      <span className="text-muted-foreground text-[11px] font-mono">{i + 1}.</span>
                      <span className="truncate">{name}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => handleToggleSelectCustomer(name)}
                      className="text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/60 p-1 rounded-lg cursor-pointer transition-colors mr-2 shrink-0"
                      title="إزالة من قائمة الحذف"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="text-xs text-amber-800 dark:text-amber-300 bg-amber-500/10 border border-amber-500/30 p-3 rounded-xl leading-relaxed flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <strong>ملاحظة هامة:</strong> الحذف هنا يستبعد العملاء من خطة الكاش فلو للأسبوع الحالي فقط ولن يتم حذفهم من ملف التحصيل الرئيسي، وسيعودون تلقائياً عند بدء دورة أسبوع جديد حسب تواريخ استحقاقهم.
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border/80">
              <Button
                variant="outline"
                onClick={() => setIsBulkDeleteModalOpen(false)}
                className="rounded-xl font-bold cursor-pointer h-10 px-4"
              >
                تراجع وإلغاء
              </Button>
              <Button
                variant="default"
                onClick={handleExecuteBulkDelete}
                className="bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-black h-10 px-5 rounded-xl shadow-md cursor-pointer transition-transform gap-1.5"
              >
                <Trash2 className="h-4 w-4" />
                <span>نعم، حذف {selectedCustomers.size} عميل</span>
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
