import React, { useState } from "react";
import {
  TrendingUp,
  TrendingDown,
  Target,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Scale,
  Calendar,
  CheckCircle2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { fmtMoney } from "@/lib/formatters";
import type { CashFlowWeeklyComparison } from "@/lib/cashflow.functions";

interface Props {
  comparison: CashFlowWeeklyComparison;
}

export const WeeklyComparisonSection: React.FC<Props> = ({ comparison }) => {
  const [isOpen, setIsOpen] = useState(true);

  if (!comparison.hasGenuinePreviousSnapshot) {
    return (
      <div className="bg-primary/5 border-2 border-primary/20 rounded-2xl p-4 sm:p-5 flex items-center justify-between gap-4 text-xs sm:text-sm font-semibold text-foreground/80">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-primary/10 text-primary rounded-xl shrink-0">
            <Scale className="h-5 w-5" />
          </div>
          <div>
            <div className="font-black text-foreground text-sm sm:text-base">
              دورة الأسبوع التأسيسي الأول (4 نوفمبر - 10 نوفمبر 2026)
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 font-medium">
              هذه هي بداية أول دورة أسبوعية منتظمة للنظام (لا توجد لقطة سابقة للمقارنة بها). سيتم حفظ أرقام هذا الأسبوع تلقائياً كمرجع للمقارنة فور إنهاء الأسبوع وبدء الدورة الجديدة.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const growthIsPositive = comparison.growthRate >= 0;
  const overdueDiff =
    comparison.currentWeek.overdueCount - comparison.lastWeek.overdueCount;
  const overdueImproved = overdueDiff <= 0;
  const rateDiff =
    comparison.currentWeek.achievementRate - comparison.lastWeek.achievementRate;

  return (
    <Card className="shadow-sm border-2 border-border/80 rounded-2xl bg-card overflow-hidden transition-all">
      {/* Header with Collapsible Toggle */}
      <CardHeader className="py-3 px-4 sm:px-6 bg-muted/30 border-b border-border/60 flex flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-primary/10 text-primary rounded-xl border border-primary/20">
            <Scale className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="text-base sm:text-lg font-extrabold text-foreground flex items-center gap-2">
              <span>مقارنة الأداء الإجمالي مع الأسبوع الماضي</span>
              <span className="text-xs font-bold text-muted-foreground hidden sm:inline">
                (نظرة تنفيذية سريعة على الإجماليات)
              </span>
            </CardTitle>
            <div className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 mt-0.5">
              <Calendar className="h-3.5 w-3.5 text-primary" />
              <span>مقارنة الأداء الحالي بآخر لقطة معتمدة (قبل القائمة الجديدة)</span>
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
        <CardContent className="p-4 sm:p-6 animate-in fade-in duration-200">
          {/* Executive Totals KPIs (4 Cards Grid) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            {/* KPI 1: Collected Total */}
            <div className="p-4 rounded-xl border-0 border-r-[6px] border-r-emerald-500 shadow-card bg-emerald-500/[0.05] space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-muted-foreground">
                <span className="text-sm font-bold text-foreground">إجمالي المبلغ المحصل</span>
                <span
                  className={`inline-flex items-center gap-0.5 px-2.5 py-0.5 rounded-full text-xs font-extrabold tabular-nums ${
                    growthIsPositive
                      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                      : "bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30"
                  }`}
                  dir="ltr"
                >
                  {growthIsPositive ? (
                    <TrendingUp className="h-3.5 w-3.5" />
                  ) : (
                    <TrendingDown className="h-3.5 w-3.5" />
                  )}
                  <span>
                    {growthIsPositive ? "+" : ""}
                    {comparison.growthRate.toFixed(1)}%
                  </span>
                </span>
              </div>
              <div className="text-2xl font-extrabold tracking-wide tabular-nums text-emerald-600 dark:text-emerald-400 font-sans">
                {fmtMoney(comparison.currentWeek.collected)}
              </div>
              <div className="text-xs font-semibold text-muted-foreground flex items-center justify-between pt-2 border-t border-border/40">
                <span>الأسبوع الماضي (اللقطة السابقة):</span>
                <span className="font-extrabold tabular-nums text-foreground font-sans">
                  {fmtMoney(comparison.lastWeek.collected)}
                </span>
              </div>
            </div>

            {/* KPI 2: Target Achievement Rate */}
            <div className="p-4 rounded-xl border-0 border-r-[6px] border-r-primary shadow-card bg-primary/[0.05] space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-muted-foreground">
                <span className="text-sm font-bold text-foreground">نسبة تحقيق الهدف (4 مليون)</span>
                <Target className="h-4 w-4 text-primary" />
              </div>
              <div className="text-2xl font-extrabold tracking-wide tabular-nums text-primary font-sans">
                {comparison.currentWeek.achievementRate.toFixed(1)}%
              </div>
              <div className="text-xs font-semibold text-muted-foreground flex items-center justify-between pt-2 border-t border-border/40">
                <span>الأسبوع الماضي (اللقطة السابقة):</span>
                <span className="font-extrabold tabular-nums text-foreground font-sans">
                  {comparison.lastWeek.achievementRate.toFixed(1)}%
                  <span
                    className={`text-xs font-extrabold mr-1.5 ${
                      rateDiff >= 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-rose-600 dark:text-rose-400"
                    }`}
                    dir="ltr"
                  >
                    ({rateDiff >= 0 ? "+" : ""}{rateDiff.toFixed(1)}%)
                  </span>
                </span>
              </div>
            </div>

            {/* KPI 3: Overdue Customers */}
            <div className="p-4 rounded-xl border-0 border-r-[6px] border-r-amber-500 shadow-card bg-amber-500/[0.05] space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-muted-foreground">
                <span className="text-sm font-bold text-foreground">العملاء المتأخرون</span>
                <span
                  className={`inline-flex items-center gap-0.5 px-2.5 py-0.5 rounded-full text-xs font-extrabold tabular-nums ${
                    overdueImproved
                      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                      : "bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30"
                  }`}
                  dir="ltr"
                >
                  {overdueImproved ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : (
                    <AlertTriangle className="h-3.5 w-3.5" />
                  )}
                  <span>
                    {overdueDiff <= 0
                      ? `-${Math.abs(overdueDiff)} عملاء`
                      : `+${overdueDiff} عملاء`}
                  </span>
                </span>
              </div>
              <div className="text-2xl font-extrabold tracking-wide tabular-nums text-foreground flex items-baseline gap-1.5 font-sans">
                <span>{comparison.currentWeek.overdueCount}</span>
                <span className="text-xs font-bold text-muted-foreground">
                  {comparison.currentWeek.overdueCount === 1
                    ? "عميل متأخر"
                    : "عملاء متأخرون"}
                </span>
              </div>
              <div className="text-xs font-semibold text-muted-foreground flex items-center justify-between pt-2 border-t border-border/40">
                <span>الأسبوع الماضي (اللقطة السابقة):</span>
                <span className="font-extrabold tabular-nums text-foreground font-sans">
                  {comparison.lastWeek.overdueCount} عملاء
                </span>
              </div>
            </div>

            {/* KPI 4: Remaining to Goal */}
            <div className="p-4 rounded-xl border-0 border-r-[6px] border-r-rose-500 shadow-card bg-rose-500/[0.05] space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-muted-foreground">
                <span className="text-sm font-bold text-foreground">المتبقي للهدف الأسبوعي</span>
                <span className="text-xs font-extrabold text-primary tabular-nums font-sans">
                  مستهدف: 4M
                </span>
              </div>
              <div className="text-2xl font-extrabold tracking-wide tabular-nums text-rose-600 dark:text-rose-400 font-sans">
                {fmtMoney(comparison.currentWeek.remainingToTarget)}
              </div>
              <div className="text-xs font-semibold text-muted-foreground flex items-center justify-between pt-2 border-t border-border/40">
                <span>الأسبوع الماضي (اللقطة السابقة):</span>
                <span className="font-extrabold tabular-nums text-foreground font-sans">
                  {fmtMoney(comparison.lastWeek.remainingToTarget)}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
};
