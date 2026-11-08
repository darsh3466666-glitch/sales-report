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
} from "lucide-react";
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

  return (
    <div className="space-y-4">
      {/* Top Banner: Title & Live Treasury Indicator */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-card p-4 rounded-2xl border border-primary/20 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-primary/10 rounded-xl text-primary">
            <TrendingUp className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black text-foreground">
                التدفقات النقدية الأسبوعية (Cash Flow)
              </h1>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                مباشر مع الخزينة
              </span>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground flex items-center gap-1.5 mt-1 font-medium">
              <Calendar className="h-4 w-4 text-primary" />
              {summary.weekLabel}
            </p>
          </div>
        </div>

        {/* Live sync status & refresh button */}
        <div className="flex items-center gap-2 mr-auto">
          <div className="text-left text-xs text-muted-foreground hidden sm:block">
            <div>آخر تحديث: {lastUpdatedTime}</div>
            <div className="text-emerald-600 dark:text-emerald-400 font-semibold">
              تحديث تلقائي كل 30 ثانية
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={isFetching}
            className="rounded-full gap-2 border-primary/30 hover:bg-primary/10 font-bold"
          >
            <RefreshCw
              className={`h-4 w-4 text-primary ${isFetching ? "animate-spin" : ""}`}
            />
            <span>تحديث لحظي</span>
          </Button>
        </div>
      </div>

      {/* 4 Million Weekly Goal Big Target Card */}
      <div className="bg-gradient-to-r from-emerald-500/10 via-primary/10 to-teal-500/10 border-2 border-emerald-500/30 rounded-2xl p-4 sm:p-5 shadow-sm relative overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 relative z-10">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Target className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                المستهدف الأسبوعي العام (Target)
              </span>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-emerald-700 dark:text-emerald-400">
              {fmtMoney(summary.weeklyGoal)}
              <span className="text-xs font-normal text-muted-foreground mr-2">
                (مطلوب 4 مليون أسبوعياً)
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4 text-left">
            <div>
              <div className="text-xs text-muted-foreground">المحصل حتى الآن</div>
              <div className="text-lg sm:text-xl font-bold text-foreground">
                {fmtMoney(summary.totalCollected)}
              </div>
              {summary.collectedFromTreasury > 0 && (
                <div className="text-[11px] font-bold text-emerald-600 flex items-center gap-1">
                  <Zap className="h-3 w-3 fill-emerald-500" />
                  منها {fmtMoney(summary.collectedFromTreasury)} من الخزينة مباشر
                </div>
              )}
            </div>
            <div className="border-r border-primary/20 pr-4">
              <div className="text-xs text-muted-foreground">المتبقي للمستهدف</div>
              <div className="text-lg sm:text-xl font-bold text-destructive">
                {fmtMoney(summary.remainingToTarget)}
              </div>
            </div>
            <div className="text-center bg-card/80 px-3 py-1.5 rounded-xl border border-primary/20">
              <div className="text-xs text-muted-foreground">نسبة الإنجاز</div>
              <div className="text-lg font-black text-emerald-600">
                {targetAchievedPct.toFixed(1)}%
              </div>
            </div>
          </div>
        </div>

        {/* Target Progress Bar */}
        <div className="mt-4 space-y-1.5 relative z-10">
          <Progress value={targetAchievedPct} className="h-3.5 bg-muted" />
          <div className="flex justify-between text-[11px] text-muted-foreground font-medium">
            <span>0 ج.م</span>
            <span>2,000,000 ج.م (50%)</span>
            <span>4,000,000 ج.م (الهدف)</span>
          </div>
        </div>
      </div>

      {/* KPI Cards Strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {/* Card 1: Total Expected */}
        <div className="bg-card p-3 sm:p-4 rounded-xl border border-primary/20 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground text-xs mb-1">
            <span>إجمالي المتوقع</span>
            <Target className="h-4 w-4 text-primary" />
          </div>
          <div className="text-lg sm:text-xl font-bold text-foreground">
            {fmtMoney(summary.totalExpected)}
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">
            {summary.customerCount} عميل مستحق
          </div>
        </div>

        {/* Card 2: Total Collected */}
        <div className="bg-card p-3 sm:p-4 rounded-xl border border-emerald-500/20 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground text-xs mb-1">
            <span>إجمالي المحصل</span>
            <TrendingUp className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="text-lg sm:text-xl font-bold text-emerald-600">
            {fmtMoney(summary.totalCollected)}
          </div>
          <div className="text-[11px] text-emerald-700/80 dark:text-emerald-400 mt-1 flex items-center gap-1">
            <span>شيت: {fmtMoney(summary.collectedFromSheet)}</span>
            {summary.collectedFromTreasury > 0 && (
              <span className="font-bold">
                + خزينة: {fmtMoney(summary.collectedFromTreasury)}
              </span>
            )}
          </div>
        </div>

        {/* Card 3: Collection Rate */}
        <div className="bg-card p-3 sm:p-4 rounded-xl border border-teal-500/20 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground text-xs mb-1">
            <span>نسبة التحصيل</span>
            <span className="font-mono text-xs text-teal-600 font-bold">%</span>
          </div>
          <div className="text-lg sm:text-xl font-bold text-teal-600">
            {fmtPct(summary.collectionRate)}
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">
            من إجمالي المستحق
          </div>
        </div>

        {/* Card 4: Remaining Expected */}
        <div className="bg-card p-3 sm:p-4 rounded-xl border border-destructive/20 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground text-xs mb-1">
            <span>المتبقي تحصيله</span>
            <Clock className="h-4 w-4 text-destructive" />
          </div>
          <div className="text-lg sm:text-xl font-bold text-destructive">
            {fmtMoney(Math.max(0, summary.totalExpected - summary.totalCollected))}
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">
            مطلوب تحصيلها
          </div>
        </div>

        {/* Card 5: Overdue Count */}
        <div className="bg-card p-3 sm:p-4 rounded-xl border border-amber-500/20 shadow-sm col-span-2 md:col-span-1">
          <div className="flex items-center justify-between text-muted-foreground text-xs mb-1">
            <span>عملاء متأخرون</span>
            <AlertCircle className="h-4 w-4 text-amber-500" />
          </div>
          <div className="text-lg sm:text-xl font-bold text-amber-600">
            {summary.overdueCount} عميل
          </div>
          <div className="text-[11px] text-amber-700/80 dark:text-amber-400 mt-1">
            تجاوزوا موعد السداد
          </div>
        </div>
      </div>
    </div>
  );
};
