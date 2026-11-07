import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtMoney, fmtNumber } from "@/lib/formatters";

interface Props {
  currentReport: any;
  yesterdayReport?: any;
  lastWeekReport?: any;
  lastMonthReport?: any;
  getReportTotalDebt: (report: any) => number;
}

export function TemporalComparisonTable({
  currentReport,
  yesterdayReport,
  lastWeekReport,
  lastMonthReport,
  getReportTotalDebt,
}: Props) {
  const r = currentReport;
  const y = yesterdayReport;
  const w = lastWeekReport;
  const m = lastMonthReport;

  const rows = [
    { key: "total_sales", label: "المبيعات" },
    { key: "total_collected", label: "التحصيل" },
    { key: "total_qty", label: "الكميات كجم" },
    { key: "total_receivables", label: "إجمالي المديونية (الذمم)" },
  ] as const;

  const getVal = (report: any, key: string) => {
    if (!report) return null;
    if (key === "total_receivables") {
      return getReportTotalDebt(report);
    }
    if (key === "total_collected") {
      return report.total_receipts_qabd ?? report.total_collected;
    }
    return report[key];
  };

  const renderCell = (val: number | null | undefined, isToday = false, isQty = false) => {
    if (val === null || val === undefined) return "—";
    const formatted = isQty ? fmtNumber(val, 2) : fmtMoney(val);
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
              {rows.map(({ key, label }) => {
                const todayVal = getVal(r, key);
                const yestVal = getVal(y, key);
                const weekVal = getVal(w, key);
                const monthVal = getVal(m, key);
                const isQty = key === "total_qty";

                return (
                  <tr key={key} className="hover:bg-muted transition-colors">
                    <td className="p-3 font-bold text-sm sm:text-base text-right text-foreground">
                      {label}
                    </td>
                    <td className="p-3 text-center text-sm sm:text-base tabular-nums">
                      {renderCell(todayVal, true, isQty)}
                    </td>
                    <td className="p-3 text-center text-sm sm:text-base tabular-nums">
                      {renderCell(yestVal, false, isQty)}
                    </td>
                    <td className="p-3 text-center text-sm sm:text-base tabular-nums border-x border-border">
                      {renderCell(weekVal, false, isQty)}
                    </td>
                    <td className="p-3 text-center text-sm sm:text-base tabular-nums">
                      {renderCell(monthVal, false, isQty)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
