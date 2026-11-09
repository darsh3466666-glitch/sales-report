import React, { useState } from "react";
import {
  TrendingUp,
  TrendingDown,
  Target,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  BarChart2,
  Calendar,
  CheckCircle2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";
import type { CashFlowWeeklyComparison } from "@/lib/cashflow.functions";

interface Props {
  comparison: CashFlowWeeklyComparison;
}

export const WeeklyComparisonSection: React.FC<Props> = ({ comparison }) => {
  const [isOpen, setIsOpen] = useState(true);

  const fmtMoney = (val: number) => {
    return Math.round(val || 0).toLocaleString("ar-EG") + " ج.م";
  };

  const chartData = [
    {
      name: "إجمالي المحصل",
      "هذا الأسبوع": Math.round(comparison.currentWeek.collected),
      "الأسبوع الماضي": Math.round(comparison.lastWeek.collected),
    },
    {
      name: "المستهدف الأسبوعي",
      "هذا الأسبوع": Math.round(comparison.currentWeek.target),
      "الأسبوع الماضي": Math.round(comparison.lastWeek.target),
    },
    {
      name: "المتبقي للهدف",
      "هذا الأسبوع": Math.round(comparison.currentWeek.remainingToTarget),
      "الأسبوع الماضي": Math.round(comparison.lastWeek.remainingToTarget),
    },
  ];

  const growthIsPositive = comparison.growthRate >= 0;
  const overdueDiff =
    comparison.currentWeek.overdueCount - comparison.lastWeek.overdueCount;
  const overdueImproved = overdueDiff <= 0;

  return (
    <Card className="shadow-sm border-2 border-border/80 rounded-2xl bg-card overflow-hidden transition-all">
      {/* Header with Collapsible Toggle */}
      <CardHeader className="py-3 px-4 sm:px-6 bg-muted/30 border-b border-border/60 flex flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-primary/10 text-primary rounded-xl border border-primary/20">
            <BarChart2 className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="text-base sm:text-lg font-black text-foreground flex items-center gap-2">
              <span>مقارنة الأداء الإجمالي مع الأسبوع الماضي</span>
              <span className="text-xs font-bold text-muted-foreground hidden sm:inline">
                (نظرة تنفيذية سريعة على الإجماليات)
              </span>
            </CardTitle>
            <div className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 mt-0.5">
              <Calendar className="h-3.5 w-3.5 text-primary" />
              <span>مقارنة دورة هذا الأسبوع بدورة الأسبوع المنقضي</span>
            </div>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsOpen(!isOpen)}
          className="rounded-xl font-bold text-xs h-8 px-3 gap-1.5 border-border bg-background hover:bg-muted"
        >
          <span>{isOpen ? "إخفاء المقارنة" : "عرض المقارنة"}</span>
          {isOpen ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </Button>
      </CardHeader>

      {isOpen && (
        <CardContent className="p-4 sm:p-6 space-y-6 animate-in fade-in duration-200">
          {/* Executive Totals KPIs (4 Cards Grid) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            {/* KPI 1: Collected Total */}
            <div className="p-4 rounded-xl border-2 border-emerald-500/20 bg-emerald-500/[0.04] space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-muted-foreground">
                <span>إجمالي المبلغ المحصل</span>
                <span
                  className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[11px] font-black ${
                    growthIsPositive
                      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                      : "bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30"
                  }`}
                >
                  {growthIsPositive ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : (
                    <TrendingDown className="h-3 w-3" />
                  )}
                  <span dir="ltr">
                    {growthIsPositive ? "+" : ""}
                    {comparison.growthRate.toFixed(1)}%
                  </span>
                </span>
              </div>
              <div className="text-xl sm:text-2xl font-black font-mono text-emerald-600 dark:text-emerald-400">
                {fmtMoney(comparison.currentWeek.collected)}
              </div>
              <div className="text-xs font-semibold text-muted-foreground flex items-center justify-between pt-1 border-t border-border/40">
                <span>الأسبوع الماضي:</span>
                <span className="font-mono font-bold text-foreground">
                  {fmtMoney(comparison.lastWeek.collected)}
                </span>
              </div>
            </div>

            {/* KPI 2: Target Achievement Rate */}
            <div className="p-4 rounded-xl border-2 border-primary/20 bg-primary/[0.04] space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-muted-foreground">
                <span>نسبة تحقيق الهدف (4 مليون)</span>
                <Target className="h-4 w-4 text-primary" />
              </div>
              <div className="text-xl sm:text-2xl font-black font-mono text-primary">
                {comparison.currentWeek.achievementRate.toFixed(1)}%
              </div>
              <div className="text-xs font-semibold text-muted-foreground flex items-center justify-between pt-1 border-t border-border/40">
                <span>الأسبوع الماضي:</span>
                <span className="font-mono font-bold text-foreground">
                  {comparison.lastWeek.achievementRate.toFixed(1)}%
                  <span className="text-[11px] text-emerald-600 font-bold mr-1">
                    (تحسن +
                    {(
                      comparison.currentWeek.achievementRate -
                      comparison.lastWeek.achievementRate
                    ).toFixed(1)}
                    %)
                  </span>
                </span>
              </div>
            </div>

            {/* KPI 3: Overdue Customers */}
            <div className="p-4 rounded-xl border-2 border-amber-500/20 bg-amber-500/[0.04] space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-muted-foreground">
                <span>العملاء المتأخرون</span>
                <span
                  className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[11px] font-black ${
                    overdueImproved
                      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                      : "bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30"
                  }`}
                >
                  {overdueImproved ? (
                    <CheckCircle2 className="h-3 w-3" />
                  ) : (
                    <AlertTriangle className="h-3 w-3" />
                  )}
                  <span>
                    {overdueDiff <= 0 ? `${Math.abs(overdueDiff)}- عملاء` : `+${overdueDiff} عملاء`}
                  </span>
                </span>
              </div>
              <div className="text-xl sm:text-2xl font-black font-mono text-foreground flex items-baseline gap-1.5">
                <span>{comparison.currentWeek.overdueCount}</span>
                <span className="text-xs font-bold text-muted-foreground">عملاء متأخرون</span>
              </div>
              <div className="text-xs font-semibold text-muted-foreground flex items-center justify-between pt-1 border-t border-border/40">
                <span>الأسبوع الماضي:</span>
                <span className="font-mono font-bold text-foreground">
                  {comparison.lastWeek.overdueCount} عملاء
                </span>
              </div>
            </div>

            {/* KPI 4: Remaining to Goal */}
            <div className="p-4 rounded-xl border-2 border-rose-500/20 bg-rose-500/[0.04] space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-muted-foreground">
                <span>المتبقي للهدف الأسبوعي</span>
                <span className="text-[11px] font-black text-primary">
                  مستهدف: 4M
                </span>
              </div>
              <div className="text-xl sm:text-2xl font-black font-mono text-rose-600 dark:text-rose-400">
                {fmtMoney(comparison.currentWeek.remainingToTarget)}
              </div>
              <div className="text-xs font-semibold text-muted-foreground flex items-center justify-between pt-1 border-t border-border/40">
                <span>الأسبوع الماضي:</span>
                <span className="font-mono font-bold text-foreground">
                  {fmtMoney(comparison.lastWeek.remainingToTarget)}
                </span>
              </div>
            </div>
          </div>

          {/* Aggregate Bar Chart */}
          <div className="pt-2">
            <div className="flex items-center justify-between mb-3 px-1">
              <h3 className="text-sm font-black text-foreground flex items-center gap-2">
                <span>📊 الرسم البياني للإجماليات الكلية المقارنة</span>
              </h3>
              <div className="flex items-center gap-4 text-xs font-bold">
                <span className="flex items-center gap-1.5 text-foreground">
                  <span className="w-3 h-3 rounded-sm bg-[#0d9488]" />
                  <span>هذا الأسبوع</span>
                </span>
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <span className="w-3 h-3 rounded-sm bg-[#64748b]" />
                  <span>الأسبوع الماضي</span>
                </span>
              </div>
            </div>

            <div className="h-64 sm:h-72 w-full bg-muted/15 rounded-xl border border-border/60 p-2 sm:p-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  margin={{ top: 15, right: 10, left: 10, bottom: 5 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    className="stroke-border/50"
                  />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: "currentColor", fontSize: 12, fontWeight: 700 }}
                    className="text-foreground/80"
                  />
                  <YAxis
                    tickFormatter={(val) => `${(val / 1000000).toFixed(1)}M`}
                    tick={{ fill: "currentColor", fontSize: 11, fontWeight: 600 }}
                    className="text-muted-foreground"
                    width={45}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload || !payload.length) return null;
                      return (
                        <div
                          className="bg-card/95 backdrop-blur border-2 border-border shadow-xl rounded-xl p-3 text-right space-y-1.5 text-xs font-bold z-50 min-w-[200px]"
                          dir="rtl"
                        >
                          <div className="font-black text-foreground border-b border-border/80 pb-1 text-sm">
                            {label}
                          </div>
                          {payload.map((entry, idx) => (
                            <div
                              key={idx}
                              className="flex items-center justify-between gap-4"
                            >
                              <span
                                className="flex items-center gap-1.5 font-bold"
                                style={{ color: entry.color }}
                              >
                                <span
                                  className="w-2.5 h-2.5 rounded-full"
                                  style={{ backgroundColor: entry.color }}
                                />
                                <span>{entry.name}:</span>
                              </span>
                              <span className="font-mono font-black text-foreground">
                                {Number(entry.value).toLocaleString("ar-EG")} ج.م
                              </span>
                            </div>
                          ))}
                        </div>
                      );
                    }}
                  />
                  <Bar
                    dataKey="هذا الأسبوع"
                    fill="#0d9488"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={55}
                  />
                  <Bar
                    dataKey="الأسبوع الماضي"
                    fill="#64748b"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={55}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
};
