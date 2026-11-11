import { useState, useMemo, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Search, ArrowUpDown, UserPlus } from "lucide-react";
import { fmtMoney, fmtNumber, fmtPct } from "@/lib/formatters";
import { Button } from "@/components/ui/button";
import { normalizeArabicName } from "@/lib/excel-parser.functions";

export interface CustomerRow {
  id: string;
  customer_name: string;
  sales_amount: number;
  pure_sales_amount?: number;
  mfg_amount?: number;
  collected_amount: number;
  prev_balance: number;
  outstanding_amount: number;
  collection_ratio: number;
  invoice_count: number;
  total_qty: number;
  risk_score: number;
  status: string;
  is_new?: boolean;
}

export interface CustomerProductItemLike {
  customer_name?: string;
  product_name: string;
  quantity?: number;
  total_amount?: number;
  unit_price?: number;
}

type SortKey =
  | "sales_amount"
  | "pure_sales_amount"
  | "mfg_amount"
  | "collected_amount"
  | "prev_balance"
  | "outstanding_amount"
  | "collection_ratio"
  | "risk_score"
  | "total_qty"
  | "invoice_count";

export function CustomerTable({
  customers,
  customerProducts = [],
  onSelect,
}: {
  customers: CustomerRow[];
  customerProducts?: CustomerProductItemLike[];
  onSelect: (name: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<
    "all" | "new_customers" | "high_risk" | "medium_risk" | "no_collection"
  >("all");
  const [sortKey, setSortKey] = useState<SortKey>("sales_amount");
  const [asc, setAsc] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 50;

  // Pre-index manufacturing amounts per customer from customerProducts
  const mfgByCustomer = useMemo(() => {
    const map = new Map<string, number>();
    for (const cp of customerProducts) {
      if (!cp || !cp.customer_name || !cp.product_name) continue;
      const isMfg =
        cp.product_name.includes("تصنيع") || cp.product_name.includes("تشغيل");
      if (isMfg) {
        const norm = normalizeArabicName(cp.customer_name);
        map.set(norm, (map.get(norm) || 0) + (cp.total_amount || 0));
        map.set(
          cp.customer_name,
          (map.get(cp.customer_name) || 0) + (cp.total_amount || 0),
        );
      }
    }
    return map;
  }, [customerProducts]);

  const newCustomersCount = useMemo(() => {
    return customers.filter((c) => c.is_new && (c.sales_amount || 0) > 0)
      .length;
  }, [customers]);

  const rows = useMemo(() => {
    let r = customers.filter((c) => (c.sales_amount || 0) > 0);
    if (search) r = r.filter((c) => c.customer_name.includes(search));
    if (filter === "new_customers") r = r.filter((c) => c.is_new);
    else if (filter === "high_risk") r = r.filter((c) => c.risk_score >= 70);
    else if (filter === "medium_risk")
      r = r.filter((c) => c.risk_score >= 40 && c.risk_score < 70);
    else if (filter === "no_collection")
      r = r.filter((c) => c.collected_amount === 0 && c.sales_amount > 0);

    r = [...r].sort((a, b) => {
      let valA: any = a[sortKey as keyof CustomerRow];
      let valB: any = b[sortKey as keyof CustomerRow];

      if (sortKey === "mfg_amount") {
        const normA = normalizeArabicName(a.customer_name);
        const normB = normalizeArabicName(b.customer_name);
        valA =
          a.mfg_amount ??
          mfgByCustomer.get(normA) ??
          mfgByCustomer.get(a.customer_name) ??
          0;
        valB =
          b.mfg_amount ??
          mfgByCustomer.get(normB) ??
          mfgByCustomer.get(b.customer_name) ??
          0;
      } else if (sortKey === "pure_sales_amount" || sortKey === "sales_amount") {
        const normA = normalizeArabicName(a.customer_name);
        const normB = normalizeArabicName(b.customer_name);
        const mfgA =
          a.mfg_amount ??
          mfgByCustomer.get(normA) ??
          mfgByCustomer.get(a.customer_name) ??
          0;
        const mfgB =
          b.mfg_amount ??
          mfgByCustomer.get(normB) ??
          mfgByCustomer.get(b.customer_name) ??
          0;
        valA = a.sales_amount - mfgA;
        valB = b.sales_amount - mfgB;
      }

      if (typeof valA === "number" && typeof valB === "number") {
        return asc ? valA - valB : valB - valA;
      }
      return 0;
    });
    return r;
  }, [customers, search, filter, sortKey, asc, mfgByCustomer]);

  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return rows.slice(start, start + pageSize);
  }, [rows, currentPage, pageSize]);

  const totalPages = Math.ceil(rows.length / pageSize);

  function toggleSort(k: SortKey) {
    if (k === sortKey) setAsc(!asc);
    else {
      setSortKey(k);
      setAsc(false);
    }
    setCurrentPage(1);
  }

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [search, filter]);

  function riskBadge(score: number) {
    if (score >= 70) {
      return (
        <span className="inline-block bg-coral text-white shadow-coral-glow rounded-full px-3 py-1 text-xs font-bold animate-pulse">
          عالي
        </span>
      );
    }
    if (score >= 40) {
      return (
        <span className="inline-block bg-accent text-primary-dark shadow-accent-glow rounded-full px-3 py-1 text-xs font-bold">
          متوسط
        </span>
      );
    }
    return (
      <span className="inline-block bg-success text-white rounded-full px-3 py-1 text-xs font-bold">
        منخفض
      </span>
    );
  }

  return (
    <Card className="shadow-card border-0 rounded-[24px] bg-card">
      <CardHeader className="gap-4 border-b-2 border-dashed border-primary/20 pb-4 mb-4">
        <div className="flex items-center gap-2">
          <span className="text-2xl">📋</span>
          <CardTitle className="text-xl sm:text-2xl font-extrabold tracking-wide text-primary-dark">
            مبيعات العملاء ({rows.length})
          </CardTitle>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <div className="relative flex-1 sm:flex-initial">
            <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="w-full sm:w-48 pr-8 rounded-full bg-input border-primary/20 text-primary-dark font-medium"
              placeholder="بحث..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-1 flex-wrap">
            {(
              ["all", "high_risk", "medium_risk", "no_collection"] as const
            ).map((f) => (
              <Button
                key={f}
                variant={filter === f ? "default" : "outline"}
                size="sm"
                onClick={() => setFilter(f)}
                className="rounded-full font-bold"
              >
                {f === "all"
                  ? "الكل"
                  : f === "high_risk"
                    ? "خطر عالي"
                    : f === "medium_risk"
                      ? "خطر متوسط"
                      : "بدون تحصيل"}
              </Button>
            ))}
            {newCustomersCount > 0 && (
              <Button
                variant={filter === "new_customers" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilter("new_customers")}
                className={`rounded-full font-bold gap-1 transition-all ${
                  filter === "new_customers"
                    ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
                    : "text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                }`}
              >
                <UserPlus className="h-3.5 w-3.5 ml-1 text-emerald-600 dark:text-emerald-400" />
                العملاء الجدد ({newCustomersCount})
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0 sm:p-6">
        {/* Table View (All Screens) */}
        <div className="block overflow-x-auto w-full" dir="rtl">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead className="text-right w-12 font-bold text-foreground whitespace-nowrap">
                  #
                </TableHead>
                <TableHead className="text-right font-bold text-foreground whitespace-nowrap">
                  العميل
                </TableHead>
                <TableHead
                  onClick={() => toggleSort("sales_amount")}
                  className="cursor-pointer text-right font-bold text-foreground whitespace-nowrap"
                >
                  المبيعات <ArrowUpDown className="inline h-3 w-3" />
                </TableHead>
                <TableHead
                  onClick={() => toggleSort("collected_amount")}
                  className="cursor-pointer text-right font-bold text-foreground whitespace-nowrap"
                >
                  المحصل
                </TableHead>
                <TableHead
                  onClick={() => toggleSort("prev_balance")}
                  className="cursor-pointer text-right font-bold text-foreground whitespace-nowrap"
                >
                  الرصيد السابق
                </TableHead>
                <TableHead
                  onClick={() => toggleSort("outstanding_amount")}
                  className="cursor-pointer text-right font-bold text-foreground whitespace-nowrap"
                >
                  الرصيد الحالي
                </TableHead>
                <TableHead
                  onClick={() => toggleSort("total_qty")}
                  className="cursor-pointer text-right font-bold text-foreground whitespace-nowrap"
                >
                  الكمية
                </TableHead>
                <TableHead
                  onClick={() => toggleSort("collection_ratio")}
                  className="cursor-pointer text-right font-bold text-foreground whitespace-nowrap"
                >
                  نسبة التحصيل
                </TableHead>
                <TableHead className="text-right font-bold text-foreground whitespace-nowrap">
                  الفواتير
                </TableHead>
                <TableHead className="text-right font-bold text-foreground whitespace-nowrap">
                  المخاطرة
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedRows.map((c, i) => {
                const idx = (currentPage - 1) * pageSize + i;
                const normCname = normalizeArabicName(c.customer_name);
                const mfg =
                  c.mfg_amount ??
                  mfgByCustomer.get(normCname) ??
                  mfgByCustomer.get(c.customer_name) ??
                  0;
                const pureSales =
                  c.pure_sales_amount ?? Math.max(0, c.sales_amount - mfg);

                let rowBorderClass =
                  c.risk_score >= 70
                    ? "border-r-[6px] border-r-coral"
                    : c.risk_score >= 40
                      ? "border-r-[6px] border-r-accent"
                      : "border-r-[6px] border-r-success";

                if (idx === 0)
                  rowBorderClass =
                    "border-r-[8px] border-r-accent bg-accent/10 font-bold scale-[1.01] shadow-accent-glow z-10 relative";
                else if (idx === 1)
                  rowBorderClass =
                    "border-r-[8px] border-r-slate-400 bg-slate-50 dark:bg-slate-800/50";
                else if (idx === 2)
                  rowBorderClass = "border-r-[8px] border-r-coral bg-coral/5";

                return (
                  <TableRow
                    key={c.id || c.customer_name}
                    className={
                      "cursor-pointer hover:bg-primary-bg transition-colors " +
                      rowBorderClass
                    }
                    onClick={() => onSelect(c.customer_name)}
                  >
                    <TableCell className="text-right tabular-nums font-semibold whitespace-nowrap">
                      {idx === 0 ? (
                        <span className="text-2xl">🥇</span>
                      ) : idx === 1 ? (
                        <span className="text-xl">🥈</span>
                      ) : idx === 2 ? (
                        <span className="text-lg">🥉</span>
                      ) : (
                        <span className="text-muted-foreground">{idx + 1}</span>
                      )}
                    </TableCell>
                    <TableCell className="font-bold text-right text-foreground whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span>{c.customer_name}</span>
                        {c.is_new && (
                          <span
                            title="عميل جديد: أول تعامل مع الشركة بدون رصيد سابق"
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 shadow-2xs"
                          >
                            <UserPlus className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                            <span>جديد</span>
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell
                      className={`text-right font-bold tabular-nums ${idx === 0 ? "text-xl text-accent-dark" : idx === 1 ? "text-lg" : idx === 2 ? "text-coral" : "text-info"}`}
                    >
                      {fmtMoney(c.sales_amount)}
                    </TableCell>
                    <TableCell className="text-success text-right font-bold tabular-nums">
                      {fmtMoney(c.collected_amount)}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums text-muted-foreground whitespace-nowrap">
                      {fmtMoney(c.prev_balance)}
                    </TableCell>
                    <TableCell
                      className={
                        "text-right font-bold tabular-nums " +
                        (c.outstanding_amount > 0
                          ? "text-coral dark:text-coral-light"
                          : c.outstanding_amount < 0
                            ? "text-success dark:text-emerald-400"
                            : "text-foreground")
                      }
                    >
                      {fmtMoney(c.outstanding_amount)}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums text-foreground whitespace-nowrap">
                      {fmtNumber(c.total_qty, 2)}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <div className="flex items-center gap-2 min-w-[110px]">
                        <span className="w-9 font-semibold text-xs text-right tabular-nums text-foreground">
                          {fmtPct(c.collection_ratio)}
                        </span>
                        <div className="w-14 h-2 bg-muted rounded-full overflow-hidden shrink-0 shadow-inner">
                          <div
                            className={
                              "h-full rounded-full transition-all duration-500 " +
                              (c.collection_ratio >= 0.9
                                ? "bg-success"
                                : c.collection_ratio >= 0.35
                                  ? "bg-accent"
                                  : "bg-coral")
                            }
                            style={{
                              width:
                                Math.min(
                                  100,
                                  Math.max(0, c.collection_ratio * 100),
                                ) + "%",
                            }}
                          />
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-medium text-foreground whitespace-nowrap">
                      {c.invoice_count > 0
                        ? c.invoice_count
                        : c.sales_amount > 0
                          ? 1
                          : 0}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {riskBadge(c.risk_score)}
                    </TableCell>
                  </TableRow>
                );
              })}
              {!paginatedRows.length && (
                <TableRow>
                  <TableCell
                    colSpan={10}
                    className="text-center text-muted-foreground py-8 font-semibold"
                  >
                    لا توجد بيانات
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 sm:px-6 mt-4 border-t border-dashed border-primary/10">
            <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-muted-foreground">
                  عرض{" "}
                  <span className="font-medium">
                    {(currentPage - 1) * pageSize + 1}
                  </span>{" "}
                  إلى{" "}
                  <span className="font-medium">
                    {Math.min(currentPage * pageSize, rows.length)}
                  </span>{" "}
                  من أصل <span className="font-medium">{rows.length}</span> عميل
                </p>
              </div>
              <div>
                <nav
                  className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px"
                  aria-label="Pagination"
                >
                  <Button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    variant="outline"
                    className="rounded-l-md rounded-r-none"
                  >
                    السابق
                  </Button>
                  <span className="relative inline-flex items-center px-4 py-2 border border-input bg-background text-sm font-medium text-foreground">
                    صفحة {currentPage} من {totalPages}
                  </span>
                  <Button
                    onClick={() =>
                      setCurrentPage((p) => Math.min(totalPages, p + 1))
                    }
                    disabled={currentPage === totalPages}
                    variant="outline"
                    className="rounded-r-md rounded-l-none"
                  >
                    التالي
                  </Button>
                </nav>
              </div>
            </div>

            {/* Mobile pagination */}
            <div className="flex items-center justify-between w-full sm:hidden">
              <Button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                variant="outline"
              >
                السابق
              </Button>
              <span className="text-sm text-muted-foreground">
                {currentPage} / {totalPages}
              </span>
              <Button
                onClick={() =>
                  setCurrentPage((p) => Math.min(totalPages, p + 1))
                }
                disabled={currentPage === totalPages}
                variant="outline"
              >
                التالي
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
