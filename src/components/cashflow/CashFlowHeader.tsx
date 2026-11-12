import React from "react";
import { Link } from "@tanstack/react-router";
import { CashFlowSummary } from "@/lib/cashflow.functions";
import { fmtMoney, fmtPct } from "@/lib/formatters";
import {
  Calendar,
  Target,
  TrendingUp,
  Clock,
  AlertCircle,
  RefreshCw,
  ArrowUp,
  ArrowDown,
  Percent,
  Wallet,
  Archive,
  RotateCcw,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";

interface CashFlowHeaderProps {
  summary: CashFlowSummary;
  isFetching: boolean;
  onRefresh: () => void;
  lastUpdatedTime: string;
  onEndCycle?: () => void;
}

export const CashFlowHeader: React.FC<CashFlowHeaderProps> = ({
  summary,
  isFetching,
  onRefresh,
  lastUpdatedTime,
  onEndCycle,
}) => {
  const targetAchievedPct =
    summary.weeklyGoal > 0
      ? Math.min(100, (summary.totalCollected / summary.weeklyGoal) * 100)
      : 0;

  const hasGenuinePrev = Boolean(
    summary.comparison?.hasGenuinePreviousSnapshot &&
    (summary.comparison.lastWeek.collected > 0 || summary.comparison.lastWeek.expected! > 0)
  );

  const lastWeek = summary.comparison?.lastWeek;
  const growthRate = summary.comparison?.growthRate ?? 0;
  const overdueDiff =
    lastWeek !== undefined ? summary.overdueCount - lastWeek.overdueCount : 0;
  const targetDiff =
    lastWeek !== undefined ? targetAchievedPct - lastWeek.achievementRate : 0;

  const expectedLast = lastWeek?.expected || 0;
  const expDiffPct =
    expectedLast > 0
      ? ((summary.totalExpected - expectedLast) / expectedLast) * 100
      : 0;

  const collRateLast = lastWeek?.collectionRate || 0;
  const collRateDiff = summary.collectionRate * 100 - collRateLast;

  const remCurrent = Math.max(0, summary.totalExpected - summary.totalCollected);
  const remLast = lastWeek?.remainingExpected || 0;
  const remDiffPct =
    remLast > 0 ? ((remCurrent - remLast) / remLast) * 100 : 0;

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
            </div>
            <p className="text-xs sm:text-sm text-foreground/80 flex items-center gap-1.5 mt-1 font-bold">
              <Calendar className="h-4 w-4 text-primary" />
              {summary.weekLabel}
            </p>
          </div>
        </div>

        {/* Live sync status, History link, End cycle trigger & refresh button */}
        <div className="flex items-center gap-2 mr-auto flex-wrap no-print">
          <div className="text-left text-xs text-muted-foreground hidden lg:block">
            <div className="font-semibold">آخر تحديث: {lastUpdatedTime}</div>
          </div>
          <Link to="/cashflow/history">
            <Button
              variant="outline"
              size="sm"
              className="rounded-full gap-1.5 border-2 border-primary/30 hover:bg-primary/10 font-bold h-10 px-3.5 text-xs sm:text-sm cursor-pointer shadow-xs"
              title="سجل وأرشيف الأسابيع السابقة"
            >
              <Archive className="h-4 w-4 text-primary" />
              <span>سجل الأسابيع</span>
            </Button>
          </Link>
          {onEndCycle && (
            <Button
              variant="default"
              size="sm"
              onClick={onEndCycle}
              className="rounded-full gap-1.5 bg-primary hover:bg-primary-dark font-black h-10 px-4 text-xs sm:text-sm cursor-pointer shadow-sm text-primary-foreground"
              title="إنهاء الدورة الأسبوعية الحالية وأرشفتها وبدء أسبوع جديد"
            >
              <RotateCcw className="h-4 w-4" />
              <span>إنهاء وبدء أسبوع جديد</span>
            </Button>
          )}
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
            <span className="hidden sm:inline">تحديث لحظي</span>
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
            </div>
            <div className="border-r-2 border-primary/30 pr-4 sm:pr-6">
              <div className="text-xs sm:text-sm text-foreground/70 font-bold">المتبقي للمستهدف</div>
              <div className="text-xl sm:text-2xl font-extrabold text-rose-600 dark:text-rose-400 tabular-nums font-sans">
                {fmtMoney(summary.remainingToTarget)}
              </div>
              <div className="text-[11px] font-bold text-muted-foreground mt-0.5">
                {hasGenuinePrev
                  ? `الماضي: ${fmtMoney(lastWeek?.remainingToTarget || 0)}`
                  : "دورة تأسيسية أولى"}
              </div>
            </div>
            <div className="text-center bg-card px-4 py-2 rounded-xl border-2 border-emerald-500/40 shadow-xs">
              <div className="text-xs text-muted-foreground font-bold">نسبة الإنجاز</div>
              <div className="text-xl sm:text-2xl font-extrabold text-emerald-600 tabular-nums font-sans">
                {targetAchievedPct.toFixed(1)}%
              </div>
              {hasGenuinePrev ? (
                <div className="text-[11px] font-extrabold text-emerald-600 dark:text-emerald-400 mt-0.5" dir="ltr">
                  ({targetDiff >= 0 ? "+" : ""}{targetDiff.toFixed(1)}%)
                </div>
              ) : (
                <div className="text-[11px] font-bold text-muted-foreground mt-0.5">
                  من هدف 4M
                </div>
              )}
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
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 print:gap-2 grid-kpis">
        {/* Card 1: Total Expected */}
        <Card className="rounded-lg border-0 border-l-[6px] border-l-secondary shadow-card bg-cream/30 hover:shadow-teal-glow transition-all duration-200 cursor-pointer overflow-hidden relative">
          <CardContent className="p-3.5 sm:p-4 relative z-10 flex flex-col justify-between h-full space-y-2">
            <div>
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-bold text-primary-dark truncate">
                  إجمالي المتوقع
                </p>
                <div className="shrink-0 opacity-80 text-info">
                  <Target className="h-5 w-5" />
                </div>
              </div>
              <p className="text-xl sm:text-2xl font-black tracking-tight text-primary-dark mt-1.5 font-sans tabular-nums">
                {fmtMoney(summary.totalExpected)}
              </p>
              <p className="text-xs text-primary-dark/70 font-semibold mt-1 truncate">
                {summary.customerCount} عميل مستحق
              </p>
            </div>
            <div className="flex items-center justify-between text-xs font-bold pt-2 mt-auto border-t border-primary-dark/15 text-primary-dark/70">
              <span>الماضي:</span>
              {hasGenuinePrev ? (
                <span className="font-extrabold tabular-nums text-primary-dark font-sans flex items-center gap-1">
                  {fmtMoney(expectedLast)}
                  <span className="text-[11px] text-info font-bold" dir="ltr">
                    ({expDiffPct >= 0 ? "+" : ""}{expDiffPct.toFixed(1)}%)
                  </span>
                </span>
              ) : (
                <span className="font-semibold text-muted-foreground text-[11px]">
                  بداية الدورة
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Card 2: Total Collected */}
        <Card className="rounded-lg border-0 border-l-[6px] border-l-success shadow-card bg-cream/30 hover:shadow-teal-glow transition-all duration-200 cursor-pointer overflow-hidden relative">
          <CardContent className="p-3.5 sm:p-4 relative z-10 flex flex-col justify-between h-full space-y-2">
            <div>
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-bold text-primary-dark truncate">
                  إجمالي المحصل
                </p>
                <div className="shrink-0 opacity-80 text-success">
                  <Wallet className="h-5 w-5" />
                </div>
              </div>
              <p className="text-xl sm:text-2xl font-black tracking-tight text-primary-dark mt-1.5 font-sans tabular-nums">
                {fmtMoney(summary.totalCollected)}
              </p>
              <div className="flex items-center justify-between text-xs font-bold mt-1 gap-1.5 flex-wrap">
                <span className="text-success truncate">
                  نقدي كاش: {fmtMoney(summary.collectedCash ?? summary.collectedFromTreasury)}
                </span>
                {(summary.collectedBank ?? 0) > 0 && (
                  <span className="text-blue-700 dark:text-blue-400 font-bold truncate">
                    • بنك: {fmtMoney(summary.collectedBank || 0)}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between text-xs font-bold pt-2 mt-auto border-t border-primary-dark/15 text-primary-dark/70">
              <span>الماضي:</span>
              {hasGenuinePrev ? (
                <span className="font-extrabold tabular-nums text-primary-dark font-sans flex items-center gap-1">
                  {fmtMoney(lastWeek?.collected || 0)}
                  <span className="text-[11px] text-success font-bold" dir="ltr">
                    (+{growthRate.toFixed(1)}%)
                  </span>
                </span>
              ) : (
                <span className="font-semibold text-muted-foreground text-[11px]">
                  الأسبوع التأسيسي
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Card 3: Collection Rate */}
        <Card className="rounded-lg border-0 border-l-[6px] border-l-accent bg-gradient-to-r from-accent/10 to-transparent shadow-accent-glow hover:shadow-teal-glow transition-all duration-200 cursor-pointer overflow-hidden relative">
          <CardContent className="p-3.5 sm:p-4 relative z-10 flex flex-col justify-between h-full space-y-2">
            <div>
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-bold text-primary-dark truncate">
                  نسبة التحصيل
                </p>
                <div className="shrink-0 opacity-80 text-warning">
                  <Percent className="h-5 w-5" />
                </div>
              </div>
              <p className="text-xl sm:text-2xl font-black tracking-tight text-primary-dark mt-1.5 font-sans tabular-nums">
                {fmtPct(summary.collectionRate)}
              </p>
              <p className="text-xs text-primary-dark/70 font-semibold mt-1 truncate">
                من إجمالي المستحق
              </p>
            </div>
            <div className="flex items-center justify-between text-xs font-bold pt-2 mt-auto border-t border-primary-dark/15 text-primary-dark/70">
              <span>الماضي:</span>
              {hasGenuinePrev ? (
                <span className="font-extrabold tabular-nums text-primary-dark font-sans flex items-center gap-1">
                  {collRateLast.toFixed(1)}%
                  <span className="text-[11px] text-success font-bold" dir="ltr">
                    (+{collRateDiff.toFixed(1)}%)
                  </span>
                </span>
              ) : (
                <span className="font-semibold text-muted-foreground text-[11px]">
                  الدورة التأسيسية
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Card 4: Remaining Expected */}
        <Card className="rounded-lg border-0 border-l-[6px] border-l-coral bg-gradient-to-r from-coral/10 to-transparent shadow-coral-glow hover:shadow-teal-glow transition-all duration-200 cursor-pointer overflow-hidden relative">
          <CardContent className="p-3.5 sm:p-4 relative z-10 flex flex-col justify-between h-full space-y-2">
            <div>
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-bold text-primary-dark truncate">
                  المتبقي تحصيله
                </p>
                <div className="shrink-0 opacity-80 text-destructive">
                  <AlertCircle className="h-5 w-5" />
                </div>
              </div>
              <p className="text-xl sm:text-2xl font-black tracking-tight text-destructive mt-1.5 font-sans tabular-nums">
                {fmtMoney(remCurrent)}
              </p>
              <p className="text-xs text-primary-dark/70 font-semibold mt-1 truncate">
                مطلوب تحصيلها للأسبوع
              </p>
            </div>
            <div className="flex items-center justify-between text-xs font-bold pt-2 mt-auto border-t border-primary-dark/15 text-primary-dark/70">
              <span>الماضي:</span>
              {hasGenuinePrev ? (
                <span className="font-extrabold tabular-nums text-primary-dark font-sans flex items-center gap-1">
                  {fmtMoney(remLast)}
                  <span className="text-[11px] text-success font-bold" dir="ltr">
                    ({remDiffPct <= 0 ? "-" : "+"}{Math.abs(remDiffPct).toFixed(1)}%)
                  </span>
                </span>
              ) : (
                <span className="font-semibold text-muted-foreground text-[11px]">
                  متابعة لحظية
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Card 5: Overdue Count */}
        <Card className="rounded-lg border-0 border-l-[6px] border-l-accent bg-gradient-to-r from-accent/10 to-transparent shadow-accent-glow hover:shadow-teal-glow transition-all duration-200 cursor-pointer overflow-hidden relative col-span-2 md:col-span-1">
          <CardContent className="p-3.5 sm:p-4 relative z-10 flex flex-col justify-between h-full space-y-2">
            <div>
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-bold text-primary-dark truncate">
                  عملاء متأخرون
                </p>
                <div className="shrink-0 opacity-80 text-warning">
                  <AlertCircle className="h-5 w-5" />
                </div>
              </div>
              <p className="text-xl sm:text-2xl font-black tracking-tight text-primary-dark mt-1.5 font-sans tabular-nums">
                {summary.overdueCount} عميل
              </p>
              <p className="text-xs text-primary-dark/70 font-semibold mt-1 truncate">
                تجاوزوا موعد السداد
              </p>
            </div>
            <div className="flex items-center justify-between text-xs font-bold pt-2 mt-auto border-t border-primary-dark/15 text-primary-dark/70">
              <span>الماضي:</span>
              {hasGenuinePrev ? (
                <span className="font-extrabold tabular-nums text-primary-dark font-sans flex items-center gap-1">
                  {lastWeek?.overdueCount || 0} عملاء
                  <span className="text-[11px] text-success font-bold" dir="ltr">
                    ({overdueDiff <= 0 ? `-${Math.abs(overdueDiff)}` : `+${overdueDiff}`})
                  </span>
                </span>
              ) : (
                <span className="font-semibold text-muted-foreground text-[11px]">
                  الدورة الحالية
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
