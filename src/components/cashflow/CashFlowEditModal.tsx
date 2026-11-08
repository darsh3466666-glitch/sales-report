import React, { useState, useEffect } from "react";
import { CashFlowCustomer, saveCustomerOverride } from "@/lib/cashflow.functions";
import { fmtMoney } from "@/lib/formatters";
import { toast } from "sonner";
import { Pin, Save, User, Wallet, X, Calendar } from "lucide-react";

interface CashFlowEditModalProps {
  customer: CashFlowCustomer | null;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export const CashFlowEditModal: React.FC<CashFlowEditModalProps> = ({
  customer,
  isOpen,
  onClose,
  onSaved,
}) => {
  const [expectedAmount, setExpectedAmount] = useState<string>("0");
  const [isPinned, setIsPinned] = useState<boolean>(false);
  const [notes, setNotes] = useState<string>("");
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Sync state when customer changes
  useEffect(() => {
    if (customer) {
      setExpectedAmount(String(customer.expectedAmount ?? 0));
      setIsPinned(Boolean(customer.isPinned));
      setNotes(customer.notes || "");
    }
  }, [customer]);

  // Handle ESC key to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !customer) return null;

  const handleSave = () => {
    setIsSaving(true);
    try {
      const parsedAmount = parseFloat(expectedAmount) || 0;
      saveCustomerOverride(customer.customerName, {
        expectedAmount: parsedAmount,
        isPinned,
        notes: notes.trim(),
      });
      toast.success(`تم حفظ بيانات العميل: ${customer.customerName}`);
      onSaved();
      onClose();
    } catch (err) {
      console.error(err);
      toast.error("حدث خطأ أثناء حفظ التعديلات");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSetCurrentBalanceAsExpected = () => {
    setExpectedAmount(String(customer.currentBalance || 0));
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
      dir="rtl"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="relative w-full max-w-lg bg-card border-2 border-primary/30 rounded-2xl shadow-2xl overflow-hidden p-6 space-y-5"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-primary/10 rounded-xl text-primary">
              <User className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-foreground">
                تعديل بيانات الكاش فلو
              </h2>
              <p className="text-xs text-muted-foreground font-medium">
                تعديل المبلغ المستهدف وتثبيت القسط الأسبوعي
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition cursor-pointer"
            title="إغلاق"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Customer Info Card */}
        <div className="p-3.5 bg-muted/60 rounded-xl border border-primary/20 space-y-2">
          <div className="text-base font-black text-foreground">
            {customer.customerName}
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center gap-1.5 text-muted-foreground font-medium">
              <Wallet className="h-4 w-4 text-primary" />
              <span>الرصيد في الماستر:</span>
              <span className="font-extrabold text-foreground tabular-nums text-sm">
                {fmtMoney(customer.currentBalance)}
              </span>
            </div>
            {customer.dueDate && (
              <div className="flex items-center gap-1.5 text-muted-foreground font-medium">
                <Calendar className="h-4 w-4 text-primary" />
                <span>موعد السداد:</span>
                <span className="font-bold text-foreground tabular-nums">
                  {customer.dueDate}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Form Body - Pure HTML without Radix */}
        <div className="space-y-4">
          {/* Expected Amount Field */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="modal-expected-input" className="text-sm font-black text-foreground">
                المبلغ المتوقع للأسبوع الحالي (ج.م)
              </label>
              {customer.currentBalance > 0 && (
                <button
                  type="button"
                  onClick={handleSetCurrentBalanceAsExpected}
                  className="text-xs text-primary font-bold hover:underline cursor-pointer"
                >
                  استخدام كامل الرصيد الحالي
                </button>
              )}
            </div>
            <div className="relative">
              <input
                id="modal-expected-input"
                type="number"
                min="0"
                step="500"
                value={expectedAmount}
                onChange={(e) => setExpectedAmount(e.target.value)}
                className="w-full text-left font-mono font-black text-lg h-11 pr-3 pl-12 bg-background border-2 border-primary/30 rounded-xl focus:outline-none focus:border-primary text-foreground"
                dir="ltr"
              />
              <span className="absolute left-3 top-2.5 text-xs font-bold text-muted-foreground pointer-events-none">
                ج.م
              </span>
            </div>
          </div>

          {/* Pin Checkbox - Pure HTML */}
          <div
            onClick={() => setIsPinned(!isPinned)}
            className={`flex items-start gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition select-none ${
              isPinned
                ? "bg-primary/10 border-primary shadow-xs"
                : "bg-muted/30 border-border hover:border-primary/40"
            }`}
          >
            <input
              type="checkbox"
              id="modal-pin-cb"
              checked={isPinned}
              onChange={(e) => setIsPinned(e.target.checked)}
              onClick={(e) => e.stopPropagation()}
              className="mt-1 h-4 w-4 rounded accent-primary cursor-pointer"
            />
            <div className="space-y-0.5">
              <label
                htmlFor="modal-pin-cb"
                className="text-sm font-black text-foreground flex items-center gap-1.5 cursor-pointer"
              >
                <Pin className="h-4 w-4 text-primary rotate-45" />
                <span>تثبيت هذا المبلغ أسبوعياً (قسط أسبوعي ثابت)</span>
              </label>
              <p className="text-xs text-muted-foreground leading-relaxed">
                للعملاء الذين يدفعون مبالغ ثابتة كل أسبوع (لتسجيله تلقائياً كل أربعاء).
              </p>
            </div>
          </div>

          {/* Notes - Pure HTML */}
          <div className="space-y-1.5">
            <label htmlFor="modal-notes-input" className="text-sm font-black text-foreground">
              ملاحظات التحصيل
            </label>
            <textarea
              id="modal-notes-input"
              rows={2}
              placeholder="مثال: تحويل بنكي أسبوعي، وعد بالسداد يوم الأحد..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full text-sm p-3 bg-background border-2 border-border rounded-xl focus:outline-none focus:border-primary text-foreground"
            />
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 font-bold text-sm rounded-xl border border-border hover:bg-muted transition cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="px-6 py-2 font-black text-sm rounded-xl flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm cursor-pointer transition disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              <span>{isSaving ? "جاري الحفظ..." : "حفظ التعديلات"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
