import React from "react";
import { CashFlowSummary } from "@/lib/cashflow.functions";
import { fmtMoney, fmtPct } from "@/lib/formatters";
import {
  Calendar,
  Target,
  TrendingUp,
  Clock,
  AlertCircle,
  RefreshCw,
  Zap,
  ArrowUp,
  ArrowDown,
  Percent,
  Wallet,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";

interface CashFlowHeaderProps {
  summary: CashFlowSummary;
  isFetching: boolean;
  onRefresh: () => void;
  lastUpdatedTime: string;
}

export const CashFlowHeader: React.FC<CashFlowHeaderProps> = ({
  summary,
  isFetching,
  onRefresh,
  lastUpdatedTime,
}) => {
  const targetAchievedPct =
    summary.weeklyGoal > 0
      ? Math.min(100, (summary.totalCollected / summary.weeklyGoal) * 100)
      : 0;

  const lastWeek = summary.comparison?.lastWeek;
  const growthRate = summary.comparison?.growthRate ?? 0;
  const overdueDiff =
    lastWeek !== undefined ? summary.overdueCount - lastWeek.overdueCount : 0;
  const targetDiff =
    lastWeek !== undefined ? targetAchievedPct - lastWeek.achievementRate : 0;

  return (
    <div className="space-y-4">
      {/* Top Banner: Title & Live Treasury Indicator */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-card p-4 rounded-2xl border-2 border-primary/20 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-primary/10 rounded-xl text-primary">
            <TrendingUp className="h-7 w-7" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-black text-foreground">
                التدفقات النقدية الأسبوعية (Cash Flow)
              </h1>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-2 border-emerald-400 shadow-2xs">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
                مباشر مع الخزينة ⚡
              </span>
            </div>
            <p className="text-xs sm:text-sm text-foreground/80 flex items-center gap-1.5 mt-1 font-bold">
              <Calendar className="h-4 w-4 text-primary" />
              {summary.weekLabel}
            </p>
          </div>
        </div>

        {/* Live sync status & refresh button */}
        <div className="flex items-center gap-2 mr-auto">
          <div className="text-left text-xs text-muted-foreground hidden sm:block">
            <div className="font-semibold">آخر تحديث: {lastUpdatedTime}</div>
            <div className="text-emerald-600 dark:text-emerald-400 font-bold">
              تحديث تلقائي كل 30 ثانية
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={isFetching}
            className="rounded-full gap-2 border-2 border-primary/30 hover:bg-primary/10 font-black h-10 px-4 text-xs sm:text-sm cursor-pointer shadow-xs"
          >
            <RefreshCw
              className={`h-4 w-4 text-primary ${isFetching ? "animate-spin" : ""}`}
            />
            <span>تحديث لحظي</span>
          </Button>
        </div>
      </div>

      {/* 4 Million Weekly Goal Big Target Card */}
      <div className="bg-gradient-to-r from-emerald-500/15 via-primary/15 to-teal-500/15 border-3 border-emerald-500/40 rounded-2xl p-4 sm:p-6 shadow-md relative overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 relative z-10">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Target className="h-6 w-6 text-emerald-700 dark:text-emerald-400" />
              <span className="text-xs sm:text-sm font-black uppercase tracking-wider text-foreground/80">
                المستهدف الأسبوعي العام (Target)
              </span>
            </div>
            <div className="text-3xl sm:text-4xl font-extrabold text-emerald-800 dark:text-emerald-300 tabular-nums font-sans tracking-tight">
              {fmtMoney(summary.weeklyGoal)}
              <span className="text-xs sm:text-sm font-bold text-foreground/70 mr-2">
                (مطلوب 4 مليون أسبوعياً)
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4 sm:gap-6 text-left flex-wrap">
            <div>
              <div className="text-xs sm:text-sm text-foreground/70 font-bold">المحصل حتى الآن</div>
              <div className="text-xl sm:text-2xl font-extrabold text-emerald-700 dark:text-emerald-400 tabular-nums font-sans">
                {fmtMoney(summary.totalCollected)}
              </div>
              {summary.collectedFromTreasury > 0 && (
                <div className="text-xs font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-1 mt-0.5">
                  <Zap className="h-3.5 w-3.5 fill-emerald-500" />
                  منها {fmtMoney(summary.collectedFromTreasury)} من الخزينة مباشر
                </div>
              )}
            </div>
            <div className="border-r-2 border-primary/30 pr-4 sm:pr-6">
              <div className="text-xs sm:text-sm text-foreground/70 font-bold">المتبقي للمستهدف</div>
              <div className="text-xl sm:text-2xl font-extrabold text-rose-600 dark:text-rose-400 tabular-nums font-sans">
                {fmtMoney(summary.remainingToTarget)}
              </div>
              <div className="text-[11px] font-bold text-muted-foreground mt-0.5">
                الماضي: {fmtMoney(lastWeek?.remainingToTarget || 2297785)}
              </div>
            </div>
            <div className="text-center bg-card px-4 py-2 rounded-xl border-2 border-emerald-500/40 shadow-xs">
              <div className="text-xs text-muted-foreground font-bold">نسبة الإنجاز</div>
              <div className="text-xl sm:text-2xl font-extrabold text-emerald-600 tabular-nums font-sans">
                {targetAchievedPct.toFixed(1)}%
              </div>
              <div className="text-[11px] font-extrabold text-emerald-600 dark:text-emerald-400 mt-0.5" dir="ltr">
                ({targetDiff >= 0 ? "+" : ""}{targetDiff.toFixed(1)}%)
              </div>
            </div>
          </div>
        </div>

        {/* Target Progress Bar */}
        <div className="mt-4 space-y-1.5 relative z-10">
          <Progress value={targetAchievedPct} className="h-4 bg-muted border border-border" />
          <div className="flex justify-between text-xs text-foreground/80 font-bold">
            <span>0 ج.م</span>
            <span>2,000,000 ج.م (50%)</span>
            <span>4,000,000 ج.م (الهدف)</span>
          </div>
        </div>
      </div>

      {/* KPI Cards Strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 print:gap-2">
        {/* Card 1: Total Expected */}
        <Card className="rounded-lg border-0 border-l-[6px] border-l-secondary shadow-card bg-cream/30 hover:shadow-teal-glow transition-all duration-200 cursor-pointer overflow-hidden relative">
          <CardContent className="p-4 relative z-10 flex flex-col justify-between h-full">
            <div>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-primary-dark truncate">
                    إجمالي المتوقع
                  </p>
                  <p className="text-2xl font-extrabold tracking-wide text-primary-dark mt-2 font-sans tabular-nums">
                    {fmtMoney(summary.totalExpected)}
                  </p>
                  <p className="text-xs text-primary-dark/80 font-medium mt-1">
                    {summary.customerCount} عميل مستحق
                  </p>
                </div>
                <div className="shrink-0 opacity-80 text-info">
                  <Target className="h-5 w-5" />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between text-xs font-bold pt-2.5 mt-3 border-t border-primary-dark/15 text-primary-dark/70">
              <span>الأسبوع الماضي:</span>
              <span className="font-extrabold tabular-nums text-primary-dark font-sans">
                {fmtMoney(lastWeek?.expected || 2451315)}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Card 2: Total Collected */}
        <Card className="rounded-lg border-0 border-l-[6px] border-l-success shadow-card bg-cream/30 hover:shadow-teal-glow transition-all duration-200 cursor-pointer overflow-hidden relative">
          <CardContent className="p-4 relative z-10 flex flex-col justify-between h-full">
            <div>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-primary-dark truncate">
                    إجمالي المحصل
                  </p>
                  <p className="text-2xl font-extrabold tracking-wide text-primary-dark mt-2 font-sans tabular-nums">
                    {fmtMoney(summary.totalCollected)}
                  </p>
                  <div className="text-xs font-bold text-success mt-1 flex items-center gap-1">
                    <span>نقدي كاش: {fmtMoney(summary.collectedFromTreasury)}</span>
                  </div>
                </div>
                <div className="shrink-0 opacity-80 text-success">
                  <Wallet className="h-5 w-5" />
                </div>
              </div>
              <div className="flex items-center gap-1 text-xs font-bold mt-2 text-success" dir="ltr">
                <ArrowUp className="h-3 w-3" />
                <span className="tabular-nums font-sans">+{growthRate.toFixed(1)}%</span>
                <span className="text-primary-dark/70 font-medium">عن اللقطة السابقة</span>
              </div>
            </div>
            <div className="flex items-center justify-between text-xs font-bold pt-2.5 mt-3 border-t border-primary-dark/15 text-primary-dark/70">
              <span>الأسبوع الماضي:</span>
              <span className="font-extrabold tabular-nums text-primary-dark font-sans">
                {fmtMoney(lastWeek?.collected || 1702215)}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Card 3: Collection Rate */}
        <Card className="rounded-lg border-0 border-l-[6px] border-l-accent bg-gradient-to-r from-accent/10 to-transparent shadow-accent-glow hover:shadow-teal-glow transition-all duration-200 cursor-pointer overflow-hidden relative">
          <CardContent className="p-4 relative z-10 flex flex-col justify-between h-full">
            <div>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-primary-dark truncate">
                    نسبة التحصيل
                  </p>
                  <p className="text-2xl font-extrabold tracking-wide text-primary-dark mt-2 font-sans tabular-nums">
                    {fmtPct(summary.collectionRate)}
                  </p>
                  <p className="text-xs text-primary-dark/80 font-medium mt-1">
                    من إجمالي المستحق
                  </p>
                </div>
                <div className="shrink-0 opacity-80 text-warning">
                  <Percent className="h-5 w-5" />
                </div>
              </div>
              <div className="flex items-center gap-1 text-xs font-bold mt-2 text-success" dir="ltr">
                <ArrowUp className="h-3 w-3" />
                <span className="tabular-nums font-sans">
                  +{(summary.collectionRate * 100 - (lastWeek?.collectionRate || 69.4)).toFixed(1)}%
                </span>
                <span className="text-primary-dark/70 font-medium">عن اللقطة السابقة</span>
              </div>
            </div>
            <div className="flex items-center justify-between text-xs font-bold pt-2.5 mt-3 border-t border-primary-dark/15 text-primary-dark/70">
              <span>الأسبوع الماضي:</span>
              <span className="font-extrabold tabular-nums text-primary-dark font-sans">
                {lastWeek?.collectionRate ? `${lastWeek.collectionRate.toFixed(1)}%` : "69.4%"}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Card 4: Remaining Expected */}
        <Card className="rounded-lg border-0 border-l-[6px] border-l-coral bg-gradient-to-r from-coral/10 to-transparent shadow-coral-glow hover:shadow-teal-glow transition-all duration-200 cursor-pointer overflow-hidden relative">
          <CardContent className="p-4 relative z-10 flex flex-col justify-between h-full">
            <div>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-primary-dark truncate">
                    المتبقي تحصيله
                  </p>
                  <p className="text-2xl font-extrabold tracking-wide text-destructive mt-2 font-sans tabular-nums">
                    {fmtMoney(Math.max(0, summary.totalExpected - summary.totalCollected))}
                  </p>
                  <p className="text-xs text-primary-dark/80 font-medium mt-1">
                    مطلوب تحصيلها للأسبوع
                  </p>
                </div>
                <div className="shrink-0 opacity-80 text-destructive">
                  <AlertCircle className="h-5 w-5" />
                </div>
              </div>
              <div className="flex items-center gap-1 text-xs font-bold mt-2 text-success" dir="ltr">
                <ArrowDown className="h-3 w-3" />
                <span className="tabular-nums font-sans">
                  {Math.abs(
                    ((Math.max(0, summary.totalExpected - summary.totalCollected) - (lastWeek?.remainingExpected || 749100)) /
                      (lastWeek?.remainingExpected || 749100)) *
                      100
                  ).toFixed(1)}%
                </span>
                <span className="text-primary-dark/70 font-medium">انخفاض في المتبقي</span>
              </div>
            </div>
            <div className="flex items-center justify-between text-xs font-bold pt-2.5 mt-3 border-t border-primary-dark/15 text-primary-dark/70">
              <span>الأسبوع الماضي:</span>
              <span className="font-extrabold tabular-nums text-primary-dark font-sans">
                {fmtMoney(lastWeek?.remainingExpected || 749100)}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Card 5: Overdue Count */}
        <Card className="rounded-lg border-0 border-l-[6px] border-l-accent bg-gradient-to-r from-accent/10 to-transparent shadow-accent-glow hover:shadow-teal-glow transition-all duration-200 cursor-pointer overflow-hidden relative col-span-2 md:col-span-1">
          <CardContent className="p-4 relative z-10 flex flex-col justify-between h-full">
            <div>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-primary-dark truncate">
                    عملاء متأخرون
                  </p>
                  <p className="text-2xl font-extrabold tracking-wide text-primary-dark mt-2 font-sans tabular-nums">
                    {summary.overdueCount} عميل
                  </p>
                  <p className="text-xs text-primary-dark/80 font-medium mt-1">
                    تجاوزوا موعد السداد
                  </p>
                </div>
                <div className="shrink-0 opacity-80 text-warning">
                  <AlertCircle className="h-5 w-5" />
                </div>
              </div>
              <div className="flex items-center gap-1 text-xs font-bold mt-2 text-success" dir="ltr">
                {overdueDiff <= 0 ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />}
                <span className="tabular-nums font-sans">{Math.abs(overdueDiff)} عملاء</span>
                <span className="text-primary-dark/70 font-medium">{overdueDiff <= 0 ? "تحسن" : "زيادة"}</span>
              </div>
            </div>
            <div className="flex items-center justify-between text-xs font-bold pt-2.5 mt-3 border-t border-primary-dark/15 text-primary-dark/70">
              <span>الأسبوع الماضي:</span>
              <span className="font-extrabold tabular-nums text-primary-dark font-sans">
                {lastWeek?.overdueCount || 3} عملاء
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
