import { useMemo, useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { fmtMoney, fmtNumber, fmtPct } from "@/lib/formatters";
import { updateOpeningBalance } from "@/lib/reports.functions";
import { sortProducts } from "@/lib/product-sorting";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { CustomerTable } from "@/components/dashboard/CustomerTable";
import { AiSummaryCard } from "@/components/dashboard/AiSummaryCard";
import { DailyPricingReport } from "@/components/dashboard/DailyPricingReport";
import {
  TrendingUp,
  Wallet,
  Percent,
  AlertCircle,
  Package,
  Users,
  FileText,
  Receipt,
  Boxes,
  AlertTriangle,
  UserPlus,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";

export interface DashData {
  report: {
    id: string;
    report_date: string;
    total_sales: number;
    total_collected: number;
    total_receipts_qabd?: number;
    total_collected_from_sheet?: number;
    total_sales_from_sheet?: number;
    collection_rate: number;
    total_qty: number;
    raw_material_qty: number;
    feed_qty: number;
    customer_count: number;
    invoice_count: number;
    average_invoice: number;
    total_receivables: number;
    opening_balance: number;
    ai_summary: unknown;
  };
  customers: Array<{
    id: string;
    customer_name: string;
    sales_amount: number;
    collected_amount: number;
    prev_balance: number;
    outstanding_amount: number;
    collection_ratio: number;
    invoice_count: number;
    total_qty: number;
    risk_score: number;
    status: string;
  }>;
  products: Array<{
    id: string;
    product_name: string;
    total_qty: number;
    total_amount: number;
  }>;
  customerProducts?: Array<{
    customer_name: string;
    product_name: string;
    quantity: number;
    total_amount: number;
    unit_price?: number;
  }>;
  inventory?: Array<{
    id: string;
    item_name: string;
    balance: number;
    unit: string;
  }>;
  comparisons: {
    yesterday: {
      total_sales: number;
      total_collected: number;
      total_receipts_qabd?: number;
      total_qty: number;
      total_receivables: number;
      total_collected_from_sheet?: number;
      total_sales_from_sheet?: number;
    } | null;
    lastWeek: {
      total_sales: number;
      total_collected: number;
      total_receipts_qabd?: number;
      total_qty: number;
      total_receivables: number;
      total_collected_from_sheet?: number;
      total_sales_from_sheet?: number;
    } | null;
    lastMonth: {
      total_sales: number;
      total_collected: number;
      total_receipts_qabd?: number;
      total_qty: number;
      total_receivables: number;
      total_collected_from_sheet?: number;
      total_sales_from_sheet?: number;
    } | null;
  };
  history: Array<{
    report_date: string;
    total_sales: number;
    total_collected: number;
  }>;
  categories?: Array<{
    category: string;
    total_qty: number;
    total_amount: number;
  }>;
}

const CATEGORY_COLORS = ["#00E5FF", "#30D158", "#FF453A", "#FFD23F", "#32D74B"];

function pctDiff(curr: number, prev: number | undefined): number | undefined {
  if (prev === undefined || prev === null || prev === 0) return undefined;
  return ((curr - prev) / prev) * 100;
}

export function DashboardContent({
  data,
  onCustomerSelect,
  onUpdateSummary,
  readOnly = false,
}: {
  data: DashData;
  onCustomerSelect: (n: string) => void;
  onUpdateSummary: () => void;
  readOnly?: boolean;
}) {
  const r = data.report;
  const y = data.comparisons.yesterday;
  const w = data.comparisons.lastWeek;
  const m = data.comparisons.lastMonth;

  const getReportTotalDebt = (report: any) => {
    if (!report) return 0;
    return (
      (report.opening_balance || 0) +
      (report.total_sales || 0) -
      (report.total_receipts_qabd ?? report.total_collected ?? 0)
    );
  };

  const totalDebt = getReportTotalDebt(r);

  // Active clients — customers with sales activity today (had an invoice)
  const todayCustomers = data.customers.filter((c) => c.sales_amount > 0);

  const activeCustomersCount = useMemo(() => {
    return (data.customers || []).filter((c) => (c.sales_amount || 0) > 0)
      .length;
  }, [data.customers]);

  const newCustomersCount = useMemo(() => {
    return (data.customers || []).filter(
      (c) => c.is_new && (c.sales_amount || 0) > 0,
    ).length;
  }, [data.customers]);

  const totalInvoicesCount = useMemo(() => {
    const sumFromCustomers = (data.customers || []).reduce(
      (sum, c) => sum + (c.invoice_count || 0),
      0,
    );
    const rawInvoicesCount = (data.invoices || []).length;
    return Math.max(r.invoice_count || 0, sumFromCustomers, rawInvoicesCount);
  }, [data.customers, data.invoices, r.invoice_count]);

  const avgInvoiceValue = useMemo(() => {
    return totalInvoicesCount > 0
      ? (r.total_sales || 0) / totalInvoicesCount
      : r.average_invoice || 0;
  }, [r.total_sales, totalInvoicesCount, r.average_invoice]);

  const top3Sales = [...todayCustomers]
    .sort((a, b) => b.sales_amount - a.sales_amount)
    .slice(0, 3)
    .reduce((s, c) => s + c.sales_amount, 0);
  const concentrationPct =
    r.total_sales > 0 ? (top3Sales / r.total_sales) * 100 : 0;

  // Distribution chart Data
  const categoryDistribution = useMemo(() => {
    const categories = [
      { category: "خامات", total_qty: r.raw_material_qty || 0 },
      { category: "علف", total_qty: r.feed_qty || 0 },
    ].filter((c) => c.total_qty > 0);

    let total = categories.reduce((acc, curr) => acc + curr.total_qty, 0);
    if (!total) total = 1;
    return categories.map((c, index) => ({
      name: c.category,
      value: c.total_qty,
      pct: c.total_qty / total,
      color: CATEGORY_COLORS[index % CATEGORY_COLORS.length],
    }));
  }, [r.raw_material_qty, r.feed_qty]);

  // Product sales chart Data
  const { productSalesData, productMaxQty } = useMemo(() => {
    let list = [...data.products]
      .filter(
        (p) =>
          p.total_qty > 0 &&
          !["تصنيع", "عمال", "نقل"].includes(p.product_name.trim()),
      )
      .sort((a, b) => b.total_qty - a.total_qty)
      .map((p) => {
        let color = "#87A8A4"; // default soft teal
        if (/ذره|ذرة/.test(p.product_name))
          color = "#A2C3A4"; // soft green
        else if (/نخاله|نخالة|ردة/.test(p.product_name))
          color = "#E56B6F"; // coral
        else if (/صويا/.test(p.product_name))
          color = "#F2A65A"; // soft orange
        else if (/كسب/.test(p.product_name))
          color = "#1F6373"; // muted dark primary
        else if (/رجيع/.test(p.product_name))
          color = "#E88B8D"; // light coral
        else if (/دي دي/.test(p.product_name))
          color = "#5D9C96"; // muted accent
        else if (/حلاب/.test(p.product_name))
          color = "#2BA8A2"; // accent
        else if (/بريمكس/.test(p.product_name)) color = "#DDA15E"; // muted yellow-orange

        return {
          name: p.product_name,
          qty: p.total_qty,
          amount: p.total_amount,
          color,
        };
      });

    list = sortProducts(list, (p) => p.name);

    const productMaxQty =
      list.length > 0 ? Math.max(...list.map((p) => p.qty)) : 1;

    return {
      productSalesData: list,
      productMaxQty,
    };
  }, [data.products]);

  // History trend (last 15)
  const historyChart = [...data.history]
    .reverse()
    .slice(-15)
    .map((h) => ({
      date: h.report_date.slice(5),
      sales: h.total_sales,
      collected: h.total_collected,
    }));

  // Alerts engine
  const alerts: {
    type: "danger" | "warning" | "info";
    title: string;
    msg: string;
  }[] = [];
  if (concentrationPct > 50)
    alerts.push({
      type: "danger",
      title: "تركيز مبيعات مرتفع",
      msg: `أعلى 3 عملاء يمثلون ${concentrationPct.toFixed(1)}% من المبيعات`,
    });
  if (r.collection_rate < 0.5 && r.total_sales > 0)
    alerts.push({
      type: "warning",
      title: "نسبة تحصيل منخفضة",
      msg: `نسبة التحصيل اليوم ${fmtPct(r.collection_rate)}`,
    });
  const colDiff = y ? pctDiff(r.total_collected, y.total_collected) : undefined;
  if (colDiff !== undefined && colDiff < -20)
    alerts.push({
      type: "warning",
      title: "تراجع التحصيل",
      msg: `انخفاض ${Math.abs(colDiff).toFixed(1)}% عن أمس`,
    });
  const recDiff = y
    ? pctDiff(getReportTotalDebt(r), getReportTotalDebt(y))
    : undefined;
  if (recDiff !== undefined && recDiff > 10)
    alerts.push({
      type: "warning",
      title: "نمو الذمم",
      msg: `زيادة الذمم بـ ${recDiff.toFixed(1)}%`,
    });
  const noCollection = todayCustomers.filter(
    (c) => c.sales_amount > 0 && c.collected_amount === 0,
  );
  if (noCollection.length > 5)
    alerts.push({
      type: "info",
      title: "عملاء بدون تحصيل",
      msg: `${noCollection.length} عميل بمبيعات بدون أي تحصيل`,
    });
  const highRisk = todayCustomers.filter((c) => c.risk_score >= 70);
  if (highRisk.length > 0)
    alerts.push({
      type: "danger",
      title: "عملاء خطر عالي",
      msg: `${highRisk.length} عميل ضمن المخاطر العالية`,
    });
  if (m && pctDiff(r.total_sales, m.total_sales)! < -15)
    alerts.push({
      type: "warning",
      title: "تراجع المبيعات شهرياً",
      msg: `انخفاض ${Math.abs(pctDiff(r.total_sales, m.total_sales)!).toFixed(1)}% عن الشهر الماضي`,
    });

  return (
    <>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="text-xl font-bold">
            تقرير يوم{" "}
            {new Date(r.report_date).toLocaleDateString("ar-EG-u-nu-latn", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </h2>
        </div>

        <OpeningBalanceEditor
          reportId={r.id}
          value={r.opening_balance || 0}
          onUpdated={onUpdateSummary}
          readOnly={readOnly}
        />
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 print:grid-cols-4 gap-3 print:gap-2">
        <KpiCard
          label="إجمالي المبيعات"
          value={fmtMoney(r.total_sales)}
          tone="info"
          icon={<TrendingUp className="h-5 w-5" />}
          diff={pctDiff(r.total_sales, y?.total_sales)}
          diffLabel="عن أمس"
        />
        <KpiCard
          label="إجمالي التحصيل"
          value={fmtMoney(r.total_collected)}
          tone="success"
          icon={<Wallet className="h-5 w-5" />}
          diff={pctDiff(r.total_collected, y ? y.total_collected : undefined)}
          diffLabel="عن أمس"
        />
        <KpiCard
          label="نسبة التحصيل"
          value={fmtPct(r.collection_rate)}
          tone={
            r.collection_rate >= 0.7
              ? "success"
              : r.collection_rate >= 0.4
                ? "warning"
                : "danger"
          }
          icon={<Percent className="h-5 w-5" />}
        />
        <KpiCard
          label="إجمالي المديونية"
          value={fmtMoney(totalDebt)}
          tone="danger"
          icon={<AlertCircle className="h-5 w-5" />}
          diff={y ? pctDiff(totalDebt, getReportTotalDebt(y)) : undefined}
          diffLabel="عن أمس"
        />
        <KpiCard
          label="إجمالي الكميات (كيلو)"
          value={fmtNumber(r.total_qty, 2)}
          tone="default"
          icon={<Boxes className="h-5 w-5" />}
          diff={pctDiff(r.total_qty, y?.total_qty)}
          diffLabel="عن أمس"
        />
        <KpiCard
          label="كميات الخامات"
          value={fmtNumber(r.raw_material_qty, 2)}
          tone="default"
          icon={<Package className="h-5 w-5" />}
        />
        <KpiCard
          label="كميات الأعلاف"
          value={fmtNumber(r.feed_qty, 2)}
          tone="default"
          icon={<Package className="h-5 w-5" />}
        />
        <KpiCard
          label="عدد العملاء"
          value={fmtNumber(activeCustomersCount || r.customer_count)}
          tone="info"
          icon={<Users className="h-5 w-5" />}
        />
        {newCustomersCount > 0 && (
          <KpiCard
            label="العملاء الجدد"
            value={fmtNumber(newCustomersCount)}
            tone="success"
            icon={
              <UserPlus className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            }
            sub="أول تعامل اليوم"
          />
        )}
        <KpiCard
          label="عدد الفواتير"
          value={fmtNumber(totalInvoicesCount || r.invoice_count)}
          tone="info"
          icon={<FileText className="h-5 w-5" />}
        />
        <KpiCard
          label="متوسط الفاتورة"
          value={fmtMoney(avgInvoiceValue)}
          tone="default"
          icon={<Receipt className="h-5 w-5" />}
        />
      </div>

      <CustomerTable customers={data.customers} onSelect={onCustomerSelect} />

      {/* تقرير ومصفوفة أسعار البيع الفعلية اليومية */}
      <DailyPricingReport
        reportDate={r.report_date}
        customerProducts={data.customerProducts || []}
        customersList={data.customers || []}
      />
      {concentrationPct > 50 && (
        <Card className="border border-border border-l-4 border-l-destructive bg-destructive/10 dark:bg-destructive/20 rounded-2xl overflow-hidden">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="h-8 w-8 text-destructive" />
            <div>
              <h3 className="font-bold text-destructive">
                تنبيه: تركيز عالي في المبيعات
              </h3>
              <p className="text-sm">
                أعلى 3 عملاء يمثلون {concentrationPct.toFixed(1)}% من إجمالي
                المبيعات — خطر اعتمادية مرتفع.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <AiSummaryCard
        reportId={r.id}
        summary={r.ai_summary as never}
        onUpdate={onUpdateSummary}
      />

      {/* Report Charts Section */}
      <div className="grid md:grid-cols-2 gap-4 print:grid-cols-2 print:gap-2">
        {/* Donut Chart: Sales Distribution */}
        <Card className="shadow-card border-0 rounded-[24px] bg-card overflow-hidden">
          <CardHeader className="pb-4 border-b-[3px] border-dashed border-primary/20 mb-4">
            <CardTitle className="text-xl font-extrabold flex items-center justify-between w-full text-primary-dark">
              <span className="flex items-center gap-2">
                <div className="text-2xl flex items-center justify-center">
                  📈
                </div>
                <span>توزيع المبيعات (خامات / أعلاف)</span>
                <div className="text-2xl flex items-center justify-center">
                  📊
                </div>
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent
            style={{ height: 260 }}
            className="flex flex-col justify-between"
          >
            {categoryDistribution.length === 0 ? (
              <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
                لا توجد بيانات كافية للتصنيف
              </div>
            ) : (
              <div className="w-full h-full flex flex-col justify-center relative">
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={categoryDistribution}
                      cx="50%"
                      cy="50%"
                      innerRadius={65}
                      outerRadius={85}
                      paddingAngle={6}
                      dataKey="value"
                      stroke="none"
                      cornerRadius={4}
                    >
                      {categoryDistribution.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        borderRadius: "8px",
                        border: "1px solid hsl(var(--border))",
                        backgroundColor: "hsl(var(--background))",
                      }}
                      itemStyle={{ fontWeight: "bold", fontSize: "13px" }}
                      formatter={(value: number) => [
                        `${fmtNumber(value, 2)} كيلو`,
                        "الكمية",
                      ]}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pb-7">
                  <span className="text-lg font-black text-foreground tabular-nums">
                    {fmtNumber(
                      categoryDistribution.reduce(
                        (acc, curr) => acc + curr.value,
                        0,
                      ),
                      0,
                    )}
                  </span>
                  <span className="text-[10px] text-muted-foreground font-semibold">
                    كيلو
                  </span>
                </div>
                {/* Custom Legend underneath chart */}
                <div className="flex items-center justify-center gap-6 text-sm font-bold mt-1">
                  {categoryDistribution.map((entry) => (
                    <div key={entry.name} className="flex items-center gap-2">
                      <span
                        className="w-3.5 h-3.5 rounded-sm shrink-0"
                        style={{ backgroundColor: entry.color }}
                      />
                      <span className="text-muted-foreground text-xs font-bold">
                        {entry.name} ({fmtNumber(entry.value, 1)} كيلو)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* History Chart */}
        <Card className="shadow-card border-0 rounded-[24px] bg-card overflow-hidden">
          <CardHeader className="pb-4 border-b-[3px] border-dashed border-primary/20 mb-4">
            <CardTitle className="text-xl font-extrabold flex items-center justify-between w-full text-primary-dark">
              <span className="flex items-center gap-2">
                <div className="text-2xl flex items-center justify-center">
                  📈
                </div>
                <span>اتجاه المبيعات والتحصيل</span>
                <div className="text-2xl flex items-center justify-center">
                  📈
                </div>
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={historyChart}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00E5FF" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#00E5FF" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient
                    id="colorCollected"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="5%" stopColor="#30D158" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#30D158" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#2C2C2E" vertical={false} />
                <XAxis
                  dataKey="date"
                  reversed
                  tick={{
                    fontSize: 12,
                    fill: "hsl(var(--muted-foreground))",
                  }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(val) => `${(val / 1000).toFixed(0)}k`}
                  tick={{
                    fontSize: 12,
                    fill: "hsl(var(--muted-foreground))",
                  }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: "8px",
                    border: "1px solid hsl(var(--border))",
                    backgroundColor: "hsl(var(--background))",
                  }}
                  itemStyle={{ fontWeight: "bold", fontSize: "13px" }}
                  formatter={(value: number) => [
                    `${value.toLocaleString()} ج.م`,
                    undefined,
                  ]}
                  labelStyle={{
                    color: "hsl(var(--muted-foreground))",
                    marginBottom: "4px",
                    fontSize: "13px",
                  }}
                />
                <Legend
                  iconType="circle"
                  wrapperStyle={{ fontSize: 12, fontWeight: "bold" }}
                />
                <Area
                  type="monotone"
                  dataKey="sales"
                  stroke="#00E5FF"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorSales)"
                  name="المبيعات"
                />
                <Area
                  type="monotone"
                  dataKey="collected"
                  stroke="#30D158"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorCollected)"
                  name="التحصيل"
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-card border-0 rounded-[24px] bg-card overflow-hidden">
        <CardHeader className="pb-4 border-b-[3px] border-dashed border-primary/20 mb-4">
          <CardTitle className="text-xl font-extrabold flex items-center gap-2 text-primary-dark">
            <div className="text-2xl flex items-center justify-center">📦</div>
            <span>تفصيل المنتجات (كميات وقيم)</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 py-2">
          {productSalesData.length === 0 ? (
            <div className="flex justify-center text-muted-foreground text-sm">
              لا توجد مبيعات أصناف
            </div>
          ) : (
            <div className="space-y-2" dir="rtl">
              {productSalesData.map((p) => {
                const percentage = (p.qty / productMaxQty) * 100;
                return (
                  <div
                    key={p.name}
                    className="flex flex-col sm:flex-row sm:items-center gap-2 p-2 bg-transparent hover:bg-cream/50 rounded-lg transition-colors border-b last:border-0 border-border pb-2"
                  >
                    {/* Name - Right aligned */}
                    <div className="w-full sm:w-48 text-right shrink-0 flex flex-col justify-center gap-0.5">
                      <span
                        className="font-bold text-sm text-foreground truncate"
                        title={p.name}
                      >
                        {p.name}
                      </span>
                      {(() => {
                        const invItem = data.inventory?.find(
                          (inv) => inv.item_name.trim() === p.name.trim(),
                        );
                        return invItem ? (
                          <span className="text-[13px] font-bold text-primary-dark/80 truncate">
                            رصيد:{" "}
                            <span className="tabular-nums font-black text-[#5D4037] text-[15px]">
                              {fmtNumber(invItem.balance, 1)}
                            </span>{" "}
                            {invItem.unit}
                          </span>
                        ) : null;
                      })()}
                    </div>

                    {/* Bar - Middle */}
                    <div className="flex-1 h-7 bg-muted/50 rounded-full overflow-hidden relative flex flex-row-reverse items-center justify-start shadow-inner">
                      <div
                        className="h-full rounded-full flex items-center justify-end px-3 font-extrabold text-[11px] sm:text-xs text-white shadow-sm transition-all duration-500 shrink-0"
                        style={{
                          width: `${percentage}%`,
                          backgroundColor: p.color,
                          minWidth: p.qty > 0 ? "80px" : "0px",
                          textShadow: "0 1px 2px rgba(0,0,0,0.2)",
                        }}
                      >
                        <span className="tabular-nums font-black whitespace-nowrap">
                          {fmtNumber(p.qty, 1)} كيلو
                        </span>
                      </div>
                    </div>

                    {/* Value - Left aligned */}
                    <div className="w-full sm:w-32 text-left font-extrabold text-sm text-primary-dark shrink-0 flex items-center justify-end gap-1 tabular-nums">
                      <span>{fmtMoney(p.amount)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-card border-0 rounded-[24px] bg-card overflow-hidden">
        <CardHeader className="pb-4 border-b-[3px] border-dashed border-primary/20 mb-4">
          <CardTitle className="text-xl font-extrabold flex items-center gap-2 text-primary-dark">
            <div className="text-2xl flex items-center justify-center">🔔</div>
            <span>محرك التنبيهات</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!alerts.length && (
            <p className="text-muted-foreground text-sm font-semibold">
              لا توجد تنبيهات حرجة. الأمور تسير بشكل طبيعي.
            </p>
          )}
          <div className="grid md:grid-cols-2 gap-3 print:grid-cols-2">
            {alerts.map((a) => (
              <div
                key={a.title}
                className={`p-3 rounded-xl border-0 border-r-[6px] flex gap-3 shadow-sm ${
                  a.type === "danger"
                    ? "border-r-coral bg-coral/10 text-coral-dark shadow-coral-glow"
                    : a.type === "warning"
                      ? "border-r-accent bg-accent/10 text-accent-dark shadow-accent-glow"
                      : "border-r-info bg-info/10 text-info"
                }`}
              >
                <div className="text-sm">
                  <p className="font-extrabold text-base">{a.title}</p>
                  <p className="opacity-90 font-medium mt-1">{a.msg}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-card border-0 rounded-[24px] bg-card overflow-hidden">
        <CardHeader className="pb-4 border-b-[3px] border-dashed border-primary/20 mb-4">
          <CardTitle className="text-xl font-extrabold flex items-center gap-2 text-primary-dark">
            <div className="text-2xl flex items-center justify-center">⏳</div>
            <span>مقارنة زمنية</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-auto rounded-lg border border-border">
            <table className="w-full text-base border-collapse">
              <thead className="bg-muted/60">
                <tr>
                  <th className="p-3 text-right font-extrabold text-sm sm:text-base text-foreground border-b border-border">
                    المؤشر
                  </th>
                  <th className="p-3 text-center font-extrabold text-sm sm:text-base text-foreground border-b border-border">
                    اليوم
                  </th>
                  <th className="p-3 text-center font-extrabold text-sm sm:text-base text-foreground border-b border-border">
                    أمس
                  </th>
                  <th className="p-3 text-center font-extrabold text-sm sm:text-base text-foreground border-b border-border">
                    نفس اليوم الأسبوع الماضي
                  </th>
                  <th className="p-3 text-center font-extrabold text-sm sm:text-base text-foreground border-b border-border">
                    الشهر الماضي
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {(
                  [
                    "total_sales",
                    "total_collected",
                    "total_qty",
                    "total_receivables",
                  ] as const
                ).map((k) => {
                  const getVal = (
                    report:
                      | typeof r
                      | typeof y
                      | typeof w
                      | typeof m
                      | null
                      | undefined,
                  ) => {
                    if (!report) return null;
                    if (k === "total_receivables") {
                      return getReportTotalDebt(report);
                    }
                    if (k === "total_collected") {
                      return (
                        report.total_receipts_qabd ?? report.total_collected
                      );
                    }
                    return report[k];
                  };

                  const todayVal = getVal(r);
                  const yestVal = getVal(y);
                  const weekVal = getVal(w);
                  const monthVal = getVal(m);

                  const renderCell = (
                    val: number | null | undefined,
                    isToday = false,
                  ) => {
                    if (val === null || val === undefined) return "—";
                    const formatted =
                      k === "total_qty" ? fmtNumber(val, 2) : fmtMoney(val);
                    return (
                      <span
                        className={
                          isToday
                            ? "font-extrabold text-primary"
                            : "font-bold text-foreground/85"
                        }
                      >
                        {formatted}
                      </span>
                    );
                  };

                  return (
                    <tr key={k} className="hover:bg-muted transition-colors">
                      <td className="p-3 font-bold text-sm sm:text-base text-right text-foreground">
                        {k === "total_sales"
                          ? "المبيعات"
                          : k === "total_collected"
                            ? "التحصيل"
                            : k === "total_qty"
                              ? "الكميات كجم"
                              : "إجمالي المديونية (الذمم)"}
                      </td>
                      <td className="p-3 text-center text-sm sm:text-base tabular-nums">
                        {renderCell(todayVal, true)}
                      </td>
                      <td className="p-3 text-center text-sm sm:text-base tabular-nums">
                        {renderCell(yestVal)}
                      </td>
                      <td className="p-3 text-center text-sm sm:text-base tabular-nums border-x border-border">
                        {renderCell(weekVal)}
                      </td>
                      <td className="p-3 text-center text-sm sm:text-base tabular-nums">
                        {renderCell(monthVal)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

function OpeningBalanceEditor({
  reportId,
  value,
  onUpdated,
  readOnly = false,
}: {
  reportId: string;
  value: number;
  onUpdated: () => void;
  readOnly?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(String(value || 0));
  const [saving, setSaving] = useState(false);
  const isMounted = useRef(false);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    setVal(String(value || 0));
  }, [value]);

  if (readOnly) {
    return (
      <div className="text-xs sm:text-sm px-3.5 py-1.5 rounded-full border border-primary/20 bg-card shadow-xs flex items-center gap-2">
        <span className="text-muted-foreground font-medium">
          المديونية القديمة:
        </span>
        <span className="font-extrabold tabular-nums text-foreground">
          {fmtMoney(value || 0)}
        </span>
      </div>
    );
  }

  async function save() {
    const num = parseFloat(val);
    if (isNaN(num) || num < 0) {
      toast.error("قيمة غير صحيحة");
      return;
    }
    setSaving(true);
    try {
      await updateOpeningBalance({ data: { reportId, openingBalance: num } });
      toast.success("تم تحديث المديونية القديمة");
      if (isMounted.current) {
        setEditing(false);
        onUpdated();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل التحديث");
    } finally {
      if (isMounted.current) {
        setSaving(false);
      }
    }
  }

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="text-xs sm:text-sm px-3 py-1.5 rounded-md border bg-card hover:bg-muted/50 transition flex items-center gap-2"
      >
        <span className="text-muted-foreground">المديونية القديمة:</span>
        <span className="font-bold tabular-nums">{fmtMoney(value || 0)}</span>
        <span className="text-accent text-[10px]">(تعديل)</span>
      </button>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        min={0}
        step="0.01"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        className="w-40 px-2 py-1.5 text-sm border rounded-md bg-background"
        placeholder="المديونية القديمة"
      />
      <Button size="sm" onClick={save} disabled={saving}>
        حفظ
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          setEditing(false);
          setVal(String(value || 0));
        }}
      >
        إلغاء
      </Button>
    </div>
  );
}
