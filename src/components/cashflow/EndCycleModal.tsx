import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { CashFlowSummary } from "@/lib/cashflow.functions";
import { fmtMoney, fmtPct } from "@/lib/formatters";
import {
  Archive,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  Target,
  Zap,
  RotateCcw,
  ShieldCheck,
  X,
} from "lucide-react";

interface EndCycleModalProps {
  isOpen: boolean;
  onClose: () => void;
  summary: CashFlowSummary;
  onConfirm: () => Promise<void>;
}

export const EndCycleModal: React.FC<EndCycleModalProps> = ({
  isOpen,
  onClose,
  summary,
  onConfirm,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen) return null;

  const achievementRate =
    summary.weeklyGoal > 0
      ? (summary.totalCollected / summary.weeklyGoal) * 100
      : 0;

  const handleConfirm = async () => {
    setIsSubmitting(true);
    try {
      await onConfirm();
      onClose();
    } catch (error) {
      console.error("Failed to archive and start new cycle:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
      dir="rtl"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
    >
      <div className="bg-card text-card-foreground border-2 border-primary/30 shadow-2xl rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-start justify-between pb-3 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-primary/10 text-primary rounded-xl">
              <Archive className="h-6 w-6 text-primary" />
            </div>
            <div className="text-right">
              <h3 className="text-xl font-black text-foreground">
                إنهاء الدورة الأسبوعية وبدء أسبوع جديد
              </h3>
              <p className="text-xs sm:text-sm text-muted-foreground font-semibold mt-0.5">
                أرشفة بيانات دورة ({summary.weekLabel}) وتجميد خط الأساس للأسبوع الجديد
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            className="h-8 w-8 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center cursor-pointer transition-colors"
            title="إغلاق"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Executive Summary of the Ending Cycle */}
        <div className="space-y-4 my-2">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {/* Total Collected */}
            <div className="bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-500/30 rounded-xl p-3 text-right">
              <div className="text-xs text-muted-foreground font-bold flex items-center gap-1 mb-1">
                <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
                إجمالي المحصل
              </div>
              <div className="text-lg font-black text-emerald-700 dark:text-emerald-400 font-sans tabular-nums">
                {fmtMoney(summary.totalCollected)}
              </div>
              <div className="text-[11px] text-emerald-700/80 font-bold mt-0.5">
                نسبة التحصيل: {fmtPct(summary.collectionRate)}
              </div>
            </div>

            {/* Target & Achievement */}
            <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 text-right">
              <div className="text-xs text-muted-foreground font-bold flex items-center gap-1 mb-1">
                <Target className="h-3.5 w-3.5 text-primary" />
                تحقيق المستهدف (4M)
              </div>
              <div className="text-lg font-black text-primary font-sans tabular-nums">
                {achievementRate.toFixed(1)}%
              </div>
              <div className="text-[11px] text-muted-foreground font-semibold mt-0.5">
                من أصل {fmtMoney(summary.weeklyGoal)}
              </div>
            </div>

            {/* Overdue Count */}
            <div className="bg-amber-50/50 dark:bg-amber-950/20 border border-amber-500/30 rounded-xl p-3 text-right col-span-2 sm:col-span-1">
              <div className="text-xs text-muted-foreground font-bold flex items-center gap-1 mb-1">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                العملاء المتأخرون
              </div>
              <div className="text-lg font-black text-amber-700 dark:text-amber-400 font-sans tabular-nums">
                {summary.overdueCount} عميل
              </div>
              <div className="text-[11px] text-muted-foreground font-semibold mt-0.5">
                تجاوزوا موعد السداد
              </div>
            </div>
          </div>

          {/* Breakdown Pills */}
          <div className="flex items-center gap-3 p-3 bg-muted/40 rounded-xl text-xs font-semibold text-foreground/80 flex-wrap">
            <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
              <Zap className="h-3.5 w-3.5" />
              من الخزينة مباشر: <strong className="font-sans tabular-nums">{fmtMoney(summary.collectedFromTreasury)}</strong>
            </span>
            <span className="text-muted-foreground">•</span>
            <span>
              من شيت التحصيل: <strong className="font-sans tabular-nums">{fmtMoney(summary.collectedFromSheet)}</strong>
            </span>
            <span className="text-muted-foreground">•</span>
            <span>
              إجمالي العملاء: <strong className="font-sans tabular-nums">{summary.customerCount}</strong>
            </span>
          </div>

          {/* What will happen notice */}
          <div className="bg-card border-2 border-primary/20 rounded-xl p-4 space-y-2.5">
            <h4 className="text-xs font-black uppercase text-primary flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4" />
              ما الذي سيحدث عند التأكيد؟
            </h4>
            <ul className="text-xs space-y-2 text-foreground/85 font-medium leading-relaxed">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  <strong>أرشفة كاملة ودائمة:</strong> سيتم حفظ نسخة مطابقة لهذا الأسبوع بجميع عملائه في سجل الأرشيف التاريخي للرجوع إليها في أي وقت.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  <strong>تحديث الأسبوع السابق للمقارنة:</strong> ستصبح أرقام هذا الأسبوع تلقائياً هي المرجع للمقارنة في كروت الأسبوع القادم.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  <strong>ترحيل الحسابات المثبتة:</strong> سيتم ترحيل وتثبيت العملاء الدائمين (مثل <em>عميل نقدي (كاش)</em>) تلقائياً للأسبوع الجديد.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  <strong>تصفير التحصيلات:</strong> يتم تصفير المبالغ المحصلة للأسبوع الجديد لاستقبال تحصيلات الخزينة المباشرة لحظياً.
                </span>
              </li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 sm:gap-3 flex-row-reverse justify-start pt-3 border-t border-border/50">
          <Button
            type="button"
            disabled={isSubmitting}
            onClick={handleConfirm}
            className="bg-primary hover:bg-primary-dark font-black px-5 py-2.5 rounded-xl shadow-md gap-2 cursor-pointer text-primary-foreground"
          >
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <RotateCcw className="h-4 w-4 animate-spin" />
                جاري الأرشفة وبدء الأسبوع...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Archive className="h-4 w-4" />
                تأكيد الإغلاق والأرشفة وبدء أسبوع جديد 🚀
              </span>
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={isSubmitting}
            onClick={onClose}
            className="rounded-xl font-bold cursor-pointer"
          >
            إلغاء
          </Button>
        </div>
      </div>
    </div>
  );
};
