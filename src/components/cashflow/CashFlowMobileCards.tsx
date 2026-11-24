import React from "react";
import { CashFlowCustomer, isBankCustomer, isBankPayment } from "@/lib/cashflow.functions";
import { fmtMoney, fmtPct } from "@/lib/formatters";
import {
  Calendar,
  AlertTriangle,
  Zap,
  CheckCircle2,
  Clock,
  XCircle,
  Pin,
  Landmark,
  User,
  FileText,
  FileSpreadsheet,
} from "lucide-react";

interface CashFlowMobileCardsProps {
  customers: CashFlowCustomer[];
  todayStr: string;
}

export function CashFlowMobileCards({
  customers,
  todayStr,
}: CashFlowMobileCardsProps) {
  if (customers.length === 0) {
    return (
      <div className="p-8 text-center text-muted-foreground font-bold bg-card rounded-2xl border border-border">
        لا توجد بيانات مطابقة للبحث أو التصفية الحالية.
      </div>
    );
  }

  return (
    <div className="space-y-3.5 no-print" dir="rtl">
      {customers.map((cust, idx) => {
        const isOverdue = Boolean(
          cust.dueDate &&
            cust.dueDate < todayStr &&
            cust.remaining > 0 &&
            (cust.rate || 0) < 0.9
        );
        const isDueToday = cust.dueDate === todayStr;
        const totalColl =
          cust.totalCollected !== undefined
            ? cust.totalCollected
            : (cust.collectedFromSheet || 0) + (cust.collectedFromTreasury || 0);
        const additionalSheet = Math.max(
          0,
          (totalColl || 0) - (cust.collectedFromTreasury || 0)
        );
        const ratePct = Math.min(100, Math.max(0, (cust.rate || 0) * 100));

        // Treasury Breakdown (Only computed if money was ACTUALLY collected)
        let custCash = 0;
        let custBank = 0;
        if (cust.collectedFromTreasury > 0) {
          if (Array.isArray(cust.treasuryTransactions) && cust.treasuryTransactions.length > 0) {
            for (const tx of cust.treasuryTransactions) {
              if (isBankPayment(tx.type, tx.description)) {
                custBank += tx.amount || 0;
              } else {
                custCash += tx.amount || 0;
              }
            }
          } else {
            if (isBankCustomer(cust.customerName, cust.notes)) {
              custBank = cust.collectedFromTreasury;
            } else {
              custCash = cust.collectedFromTreasury;
            }
          }
        }

        // Status badge configuration
        let statusBadge = (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30">
            <XCircle className="w-3.5 h-3.5" />
            <span>لم يسدد</span>
          </span>
        );

        if (cust.status === "مكتمل" || (cust as any).status === "فائض") {
          statusBadge = (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>مكتمل</span>
            </span>
          );
        } else if (cust.status === "جزئي") {
          statusBadge = (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">
              <Clock className="w-3.5 h-3.5" />
              <span>جزئي</span>
            </span>
          );
        }

        // Card Border Accent Color
        const cardBorderClass =
          cust.status === "مكتمل" || (cust as any).status === "فائض"
            ? "border-emerald-500/30 bg-emerald-500/[0.02]"
            : cust.status === "جزئي"
            ? "border-amber-500/30 bg-amber-500/[0.02]"
            : isOverdue
            ? "border-rose-500/40 bg-rose-500/[0.03]"
            : "border-primary/20 bg-card";

        return (
          <div
            key={cust.customerName}
            className={`rounded-2xl border-2 p-3.5 sm:p-4 shadow-xs transition-all hover:shadow-sm ${cardBorderClass}`}
          >
            {/* Header: Index, Customer Name, Badges */}
            <div className="flex items-start justify-between gap-2 border-b border-border/70 pb-2.5">
              <div className="flex items-start gap-2 min-w-0">
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-primary/10 text-primary text-xs font-black shrink-0 mt-0.5">
                  {cust.index || idx + 1}
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <User className="w-4 h-4 text-primary shrink-0" />
                    <h3
                      className="font-black text-foreground text-base sm:text-lg leading-snug break-words"
                      title={cust.customerName}
                    >
                      {cust.customerName}
                    </h3>
                  </div>

                  {/* Customer Tags */}
                  {cust.isPinned && (
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-purple-100 text-purple-800 dark:bg-purple-950/70 dark:text-purple-300 border border-purple-300 dark:border-purple-700">
                        <Pin className="w-3 h-3 rotate-45" />
                        <span>قسط أسبوعي ثابت</span>
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Status Badge */}
              <div className="shrink-0">{statusBadge}</div>
            </div>

            {/* Financial Numbers Grid (2x2) */}
            <div className="grid grid-cols-2 gap-2.5 py-3">
              {/* الرصيد الحالي */}
              <div className="bg-muted/40 p-2.5 rounded-xl border border-border/60">
                <div className="text-[11px] font-bold text-muted-foreground">الرصيد الحالي</div>
                <div className="text-sm sm:text-base font-black text-foreground tabular-nums mt-0.5">
                  {fmtMoney(cust.currentBalance)}
                </div>
              </div>

              {/* المتوقع */}
              <div className="bg-muted/40 p-2.5 rounded-xl border border-border/60">
                <div className="text-[11px] font-bold text-muted-foreground">المتوقع تحصيله</div>
                <div className="text-sm sm:text-base font-black text-primary tabular-nums mt-0.5">
                  {fmtMoney(cust.expectedAmount)}
                </div>
              </div>

              {/* المحصل */}
              <div className="bg-emerald-500/10 p-2.5 rounded-xl border border-emerald-500/20">
                <div className="text-[11px] font-bold text-emerald-800 dark:text-emerald-300">
                  المحصل الفعلي
                </div>
                <div className="text-sm sm:text-base font-black text-emerald-700 dark:text-emerald-300 tabular-nums mt-0.5">
                  {fmtMoney(totalColl)}
                </div>
                {custCash > 0 && (
                  <div className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-800 dark:text-emerald-200 mt-1 bg-emerald-100 dark:bg-emerald-900/50 px-1.5 py-0.5 rounded-md">
                    <Zap className="w-3 h-3 text-emerald-600 fill-emerald-500" />
                    <span>خزينة: {fmtMoney(custCash)}</span>
                  </div>
                )}
                {custBank > 0 && (
                  <div className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-800 dark:text-blue-200 mt-1 bg-blue-100 dark:bg-blue-900/50 px-1.5 py-0.5 rounded-md">
                    <Landmark className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                    <span>بنك: {fmtMoney(custBank)}</span>
                  </div>
                )}
                {additionalSheet > 0 && (
                  <div className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800 dark:text-amber-200 mt-1 bg-amber-100 dark:bg-amber-900/50 px-1.5 py-0.5 rounded-md">
                    <FileSpreadsheet className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                    <span>شيت: {fmtMoney(additionalSheet)}</span>
                  </div>
                )}
              </div>

              {/* المتبقي */}
              <div
                className={`p-2.5 rounded-xl border ${
                  cust.remaining > 0
                    ? "bg-rose-500/10 border-rose-500/20"
                    : "bg-muted/40 border-border/60"
                }`}
              >
                <div
                  className={`text-[11px] font-bold ${
                    cust.remaining > 0
                      ? "text-rose-800 dark:text-rose-300"
                      : "text-muted-foreground"
                  }`}
                >
                  المتبقي
                </div>
                <div
                  className={`text-sm sm:text-base font-black tabular-nums mt-0.5 ${
                    cust.remaining > 0
                      ? "text-rose-600 dark:text-rose-400"
                      : "text-foreground"
                  }`}
                >
                  {fmtMoney(cust.remaining)}
                </div>
              </div>
            </div>

            {/* Payment Progress Bar */}
            <div className="space-y-1 pt-1 border-t border-border/60">
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="text-muted-foreground">نسبة السداد:</span>
                <span className="text-primary font-black tabular-nums">
                  {fmtPct(cust.rate || 0)}
                </span>
              </div>
              <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    ratePct >= 100
                      ? "bg-emerald-500"
                      : ratePct > 0
                      ? "bg-primary"
                      : "bg-muted-foreground/30"
                  }`}
                  style={{ width: `${ratePct}%` }}
                />
              </div>
            </div>

            {/* Footer: Due date & Notes */}
            {(cust.dueDate || cust.notes) && (
              <div className="pt-2.5 mt-2.5 border-t border-border/60 flex items-center justify-between gap-2 flex-wrap text-xs">
                {cust.dueDate ? (
                  <div
                    className={`inline-flex items-center gap-1.5 font-bold ${
                      isOverdue
                        ? "text-rose-600 dark:text-rose-400 font-black"
                        : isDueToday
                        ? "text-blue-600 dark:text-blue-400 font-black"
                        : "text-muted-foreground"
                    }`}
                  >
                    {isOverdue ? (
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                    ) : (
                      <Calendar className="w-3.5 h-3.5 text-primary shrink-0" />
                    )}
                    <span>
                      موعد السداد: {cust.dueDate}
                      {isOverdue && " (متأخر)"}
                      {isDueToday && " (اليوم)"}
                    </span>
                  </div>
                ) : (
                  <div />
                )}

                {cust.notes && (
                  <div className="flex items-center gap-1 text-muted-foreground font-semibold max-w-full truncate">
                    <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="truncate" title={cust.notes}>
                      {cust.notes}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
