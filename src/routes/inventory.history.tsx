import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppHeader } from "@/components/layout/AppHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ZoomableTableFrame } from "@/components/ui/zoomable-table-frame";
import { ArrowRight, Calendar, ClipboardCheck, Package, Search } from "lucide-react";

interface ReconciliationCycle {
  date: string;
  bayan: string;
  user: string;
  status: string;
  diff: number;
  raw_diff: number;
  balance: number;
  prev_date: string;
  prev_balance: number;
  cycle_base: number;
  cycle_wared: number;
  cycle_sader: number;
  kg_per_ton: number;
  shortage_pct: number;
  shortage_level: string;
  shortage_level_label: string;
}

interface ReconciliationItem {
  code: string;
  name: string;
  unit: string;
  is_feed: boolean;
  history: ReconciliationCycle[];
}

interface InventoryJson {
  print_date?: string;
  generated_at?: string;
  stats?: {
    total_items?: number;
    total_balance?: number;
    total_transactions?: number;
  };
  reconciliations?: {
    items?: ReconciliationItem[];
    summary?: {
      total_items_with_tasweya?: number;
      total_tasweyat_count?: number;
      avg_kg_per_ton?: number;
    };
  };
  invoices?: {
    daily_totals?: Array<{ date: string; qty: number }>;
  };
}

interface ReconciliationEventRow extends ReconciliationCycle {
  code: string;
  itemName: string;
  unit: string;
  is_feed: boolean;
}

export const Route = createFileRoute("/inventory/history")({
  ssr: false,
  component: InventoryHistoryPage,
});

async function fetchInventoryJson(): Promise<InventoryJson> {
  const basePath =
    typeof window !== "undefined" &&
    window.location.pathname.startsWith("/sales-report")
      ? "/sales-report/"
      : "/";
  const res = await fetch(`${basePath}inventory_data.json?t=${Date.now()}`, {
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error("تعذر تحميل سجل المخزون");
  }
  return res.json();
}

function InventoryHistoryPage() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "عجز" | "زيادة" | "مطابق">("all");

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["inventoryHistory"],
    queryFn: fetchInventoryJson,
  });

  const allEvents = useMemo<ReconciliationEventRow[]>(() => {
    const items = data?.reconciliations?.items || [];
    const rows: ReconciliationEventRow[] = [];
    for (const item of items) {
      for (const h of item.history || []) {
        rows.push({
          ...h,
          code: item.code,
          itemName: item.name,
          unit: item.unit,
          is_feed: item.is_feed,
        });
      }
    }
    rows.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    return rows;
  }, [data]);

  const filteredEvents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allEvents.filter((row) => {
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (!q) return true;
      return (
        row.itemName.toLowerCase().includes(q) ||
        row.code.toLowerCase().includes(q) ||
        (row.date || "").includes(q) ||
        (row.user || "").toLowerCase().includes(q) ||
        (row.bayan || "").toLowerCase().includes(q)
      );
    });
  }, [allEvents, searchQuery, statusFilter]);

  const summary = data?.reconciliations?.summary;
  const dailyCount = data?.invoices?.daily_totals?.length || 0;

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <AppHeader
        title="سجل الجرد والتسويات"
        activeSection="inventory"
        decorativeBg
        liveStatus="live"
        onRefresh={() => refetch()}
        isRefreshing={isFetching}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate({ to: "/inventory" })}
            className="h-8 sm:h-9 px-3 rounded-full font-bold border border-primary/30 hover:bg-primary/10 gap-1.5 text-xs sm:text-sm cursor-pointer"
          >
            <ArrowRight className="h-3.5 w-3.5" />
            <span>العودة للمخزون</span>
          </Button>
        }
      />

      <main className="container mx-auto px-3 sm:px-4 py-6 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <ClipboardCheck className="h-8 w-8 text-primary shrink-0" />
              <div>
                <div className="text-xs text-muted-foreground font-semibold">إجمالي التسويات</div>
                <div className="text-xl font-black">{summary?.total_tasweyat_count ?? allEvents.length}</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <Package className="h-8 w-8 text-amber-600 shrink-0" />
              <div>
                <div className="text-xs text-muted-foreground font-semibold">أصناف بها تسوية</div>
                <div className="text-xl font-black">{summary?.total_items_with_tasweya ?? 0}</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <Calendar className="h-8 w-8 text-emerald-600 shrink-0" />
              <div>
                <div className="text-xs text-muted-foreground font-semibold">أيام حركة المبيعات</div>
                <div className="text-xl font-black">{dailyCount}</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground font-semibold">متوسط العجز / طن</div>
              <div className="text-xl font-black">{summary?.avg_kg_per_ton ?? 0} كجم</div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <CardTitle className="text-base sm:text-lg font-extrabold">
              سجل جلسات التسوية التاريخي ({filteredEvents.length})
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full sm:w-64">
                <Search className="h-4 w-4 text-muted-foreground absolute right-3 top-1/2 -translate-y-1/2" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="بحث بالصنف أو التاريخ أو المستخدم..."
                  className="pr-9 h-9 text-xs sm:text-sm"
                />
              </div>
              <div className="flex items-center gap-1">
                {(["all", "عجز", "زيادة", "مطابق"] as const).map((st) => (
                  <Button
                    key={st}
                    size="sm"
                    variant={statusFilter === st ? "default" : "outline"}
                    onClick={() => setStatusFilter(st)}
                    className="h-8 px-2.5 text-xs font-bold rounded-full cursor-pointer"
                  >
                    {st === "all" ? "الكل" : st}
                  </Button>
                ))}
              </div>
            </div>
          </CardHeader>

          <CardContent>
            {isLoading ? (
              <div className="p-10 text-center text-sm text-muted-foreground">
                جاري تحميل سجل تسويات المخزون...
              </div>
            ) : filteredEvents.length === 0 ? (
              <div className="p-10 text-center text-sm text-muted-foreground">
                لا توجد جلسات مطابقة للبحث.
              </div>
            ) : (
              <div className="rounded-md border overflow-hidden">
                <ZoomableTableFrame desktopMinWidth={880} label="عرض سجل تسويات المخزون كامل">
                  <Table disableOverflowWrapper className="min-w-[880px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right">التاريخ</TableHead>
                        <TableHead className="text-right">الصنف</TableHead>
                        <TableHead className="text-center">الحالة</TableHead>
                        <TableHead className="text-center">الفرق</TableHead>
                        <TableHead className="text-center">معدل العجز</TableHead>
                        <TableHead className="text-center">الرصيد بعد</TableHead>
                        <TableHead className="text-right">البيان</TableHead>
                        <TableHead className="text-center">المستخدم</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredEvents.map((row, idx) => (
                        <TableRow key={`${row.code}-${row.date}-${idx}`}>
                          <TableCell className="font-mono text-xs whitespace-nowrap">
                            {String(row.date || "").slice(0, 16).replace("T", " ")}
                          </TableCell>
                          <TableCell className="font-bold">
                            <div>{row.itemName}</div>
                            <div className="text-[11px] text-muted-foreground font-mono">
                              {row.code}
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge
                              variant={
                                row.status === "عجز"
                                  ? "destructive"
                                  : row.status === "زيادة"
                                  ? "default"
                                  : "secondary"
                              }
                            >
                              {row.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center font-bold">
                            {row.diff.toLocaleString("en-US", { maximumFractionDigits: 3 })} {row.unit}
                          </TableCell>
                          <TableCell className="text-center text-xs">
                            {row.raw_diff < 0
                              ? row.is_feed
                                ? `${row.kg_per_ton} كجم/طن`
                                : `${row.shortage_pct}%`
                              : "—"}
                          </TableCell>
                          <TableCell className="text-center font-mono">
                            {row.balance.toLocaleString("en-US", { maximumFractionDigits: 3 })}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[220px] truncate">
                            {row.bayan}
                          </TableCell>
                          <TableCell className="text-center text-xs">
                            {row.user || "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ZoomableTableFrame>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
