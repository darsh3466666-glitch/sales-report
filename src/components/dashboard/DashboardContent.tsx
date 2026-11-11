import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { fmtPct } from "@/lib/formatters";
import { sortProducts } from "@/lib/product-sorting";
import { CustomerTable } from "@/components/dashboard/CustomerTable";
import { AiSummaryCard } from "@/components/dashboard/AiSummaryCard";
import { DailyPricingReport } from "@/components/dashboard/DailyPricingReport";
import { OpeningBalanceEditor } from "@/components/dashboard/OpeningBalanceEditor";
import { KpiStripSection } from "@/components/dashboard/KpiStripSection";
import { ReportChartsSection } from "@/components/dashboard/ReportChartsSection";
import { TopProductsSection } from "@/components/dashboard/TopProductsSection";
import { AlertsEngineSection, type AlertItem } from "@/components/dashboard/AlertsEngineSection";
import { TemporalComparisonTable } from "@/components/dashboard/TemporalComparisonTable";
import { AlertTriangle } from "lucide-react";

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
    is_new?: boolean;
  }>;
  invoices?: Array<{
    invoice_no?: string | null;
    customer_name?: string | null;
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
      opening_balance?: number;
    } | null;
    lastWeek: {
      total_sales: number;
      total_collected: number;
      total_receipts_qabd?: number;
      total_qty: number;
      total_receivables: number;
      total_collected_from_sheet?: number;
      total_sales_from_sheet?: number;
      opening_balance?: number;
    } | null;
    lastMonth: {
      total_sales: number;
      total_collected: number;
      total_receipts_qabd?: number;
      total_qty: number;
      total_receivables: number;
      total_collected_from_sheet?: number;
      total_sales_from_sheet?: number;
      opening_balance?: number;
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

  // Active clients — customers with sales activity today
  const todayCustomers = data.customers.filter((c) => c.sales_amount > 0);

  const activeCustomersCount = useMemo(() => {
    return (data.customers || []).filter((c) => (c.sales_amount || 0) > 0).length;
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
        let color = "#87A8A4";
        if (/ذره|ذرة/.test(p.product_name)) color = "#A2C3A4";
        else if (/نخاله|نخالة|ردة/.test(p.product_name)) color = "#E56B6F";
        else if (/صويا/.test(p.product_name)) color = "#F2A65A";
        else if (/كسب/.test(p.product_name)) color = "#1F6373";
        else if (/رجيع/.test(p.product_name)) color = "#E88B8D";
        else if (/دي دي/.test(p.product_name)) color = "#5D9C96";
        else if (/حلاب/.test(p.product_name)) color = "#2BA8A2";
        else if (/بريمكس/.test(p.product_name)) color = "#DDA15E";

        return {
          name: p.product_name,
          qty: p.total_qty,
          salesQty: (p as any).sales_qty ?? p.total_qty,
          mfgQty: (p as any).mfg_qty ?? 0,
          amount: p.total_amount,
          color,
        };
      });

    list = sortProducts(list, (p) => p.name);
    const maxQty = list.length > 0 ? Math.max(...list.map((p) => p.qty)) : 1;

    return {
      productSalesData: list,
      productMaxQty: maxQty,
    };
  }, [data.products]);

  // History trend (last 15)
  const historyChart = useMemo(() => {
    return [...data.history]
      .reverse()
      .slice(-15)
      .map((h) => ({
        date: h.report_date.slice(5),
        sales: h.total_sales,
        collected: h.total_collected,
      }));
  }, [data.history]);

  // Alerts engine
  const alerts = useMemo(() => {
    const list: AlertItem[] = [];
    if (concentrationPct > 50) {
      list.push({
        type: "danger",
        title: "تركيز مبيعات مرتفع",
        msg: `أعلى 3 عملاء يمثلون ${concentrationPct.toFixed(1)}% من المبيعات`,
      });
    }
    if (r.collection_rate < 0.5 && r.total_sales > 0) {
      list.push({
        type: "warning",
        title: "نسبة تحصيل منخفضة",
        msg: `نسبة التحصيل اليوم ${fmtPct(r.collection_rate)}`,
      });
    }
    const colDiff = y ? pctDiff(r.total_collected, y.total_collected) : undefined;
    if (colDiff !== undefined && colDiff < -20) {
      list.push({
        type: "warning",
        title: "تراجع التحصيل",
        msg: `انخفاض ${Math.abs(colDiff).toFixed(1)}% عن أمس`,
      });
    }
    const recDiff = y
      ? pctDiff(getReportTotalDebt(r), getReportTotalDebt(y))
      : undefined;
    if (recDiff !== undefined && recDiff > 10) {
      list.push({
        type: "warning",
        title: "نمو الذمم",
        msg: `زيادة الذمم بـ ${recDiff.toFixed(1)}%`,
      });
    }
    const noCollection = todayCustomers.filter(
      (c) => c.sales_amount > 0 && c.collected_amount === 0,
    );
    if (noCollection.length > 5) {
      list.push({
        type: "info",
        title: "عملاء بدون تحصيل",
        msg: `${noCollection.length} عميل بمبيعات بدون أي تحصيل`,
      });
    }
    const highRisk = todayCustomers.filter((c) => c.risk_score >= 70);
    if (highRisk.length > 0) {
      list.push({
        type: "danger",
        title: "عملاء خطر عالي",
        msg: `${highRisk.length} عميل ضمن المخاطر العالية`,
      });
    }
    if (m && pctDiff(r.total_sales, m.total_sales)! < -15) {
      list.push({
        type: "warning",
        title: "تراجع المبيعات شهرياً",
        msg: `انخفاض ${Math.abs(pctDiff(r.total_sales, m.total_sales)!).toFixed(1)}% عن الشهر الماضي`,
      });
    }
    return list;
  }, [concentrationPct, r.collection_rate, r.total_sales, r.total_collected, y, m, todayCustomers]);

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
      <KpiStripSection
        report={r}
        yesterdayReport={y}
        totalDebt={totalDebt}
        getReportTotalDebt={getReportTotalDebt}
        pctDiff={pctDiff}
        activeCustomersCount={activeCustomersCount}
        newCustomersCount={newCustomersCount}
        totalInvoicesCount={totalInvoicesCount}
        avgInvoiceValue={avgInvoiceValue}
      />

      <CustomerTable
        customers={data.customers}
        customerProducts={data.customerProducts || []}
        onSelect={onCustomerSelect}
      />

      {/* Daily Pricing Matrix Report */}
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
      <ReportChartsSection
        categoryDistribution={categoryDistribution}
        historyChart={historyChart}
      />

      {/* Product Details Bars */}
      <TopProductsSection
        productSalesData={productSalesData}
        productMaxQty={productMaxQty}
        inventory={data.inventory}
      />

      {/* Alerts Engine */}
      <AlertsEngineSection alerts={alerts} />

      {/* Temporal Comparison Table */}
      <TemporalComparisonTable
        currentReport={r}
        yesterdayReport={y}
        lastWeekReport={w}
        lastMonthReport={m}
        getReportTotalDebt={getReportTotalDebt}
      />
    </>
  );
}
