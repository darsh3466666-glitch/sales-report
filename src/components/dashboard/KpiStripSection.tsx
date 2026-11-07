import { KpiCard } from "@/components/dashboard/KpiCard";
import { fmtMoney, fmtNumber, fmtPct } from "@/lib/formatters";
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
  UserPlus,
} from "lucide-react";

interface Props {
  report: any;
  yesterdayReport?: any;
  totalDebt: number;
  getReportTotalDebt: (report: any) => number;
  pctDiff: (curr: number, prev: number | undefined) => number | undefined;
  activeCustomersCount: number;
  newCustomersCount: number;
  totalInvoicesCount: number;
  avgInvoiceValue: number;
}

export function KpiStripSection({
  report: r,
  yesterdayReport: y,
  totalDebt,
  getReportTotalDebt,
  pctDiff,
  activeCustomersCount,
  newCustomersCount,
  totalInvoicesCount,
  avgInvoiceValue,
}: Props) {
  return (
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
  );
}
