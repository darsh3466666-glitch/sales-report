import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CashFlowSummary } from "@/lib/cashflow.functions";
import { fmtMoney, fmtPct } from "@/lib/formatters";
import {
  Archive,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  TrendingUp,
  Target,
  Zap,
  RotateCcw,
  ShieldCheck,
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
    <Dialog open={isOpen} onOpenChange={(open) => !isSubmitting && !open && onClose()}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto border-2 border-primary/30 shadow-2xl p-6" dir="rtl">
        <DialogHeader className="space-y-2 text-right">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-primary/10 text-primary rounded-xl">
              <Archive className="h-6 w-6 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-xl font-black text-foreground">
                إنهاء الدورة الأسبوعية وبدء أسبوع جديد
              </DialogTitle>
              <DialogDescription className="text-xs sm:text-sm text-muted-foreground font-semibold">
                أرشفة بيانات دورة ({summary.weekLabel}) وتجميد خط الأساس للأسبوع الجديد
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

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

        <DialogFooter className="gap-2 sm:gap-3 flex-row-reverse justify-start sm:justify-start mt-2">
          <Button
            variant="default"
            disabled={isSubmitting}
            onClick={handleConfirm}
            className="bg-primary hover:bg-primary-dark font-black px-5 py-2.5 rounded-xl shadow-md gap-2"
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
            variant="outline"
            disabled={isSubmitting}
            onClick={onClose}
            className="rounded-xl font-bold"
          >
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
