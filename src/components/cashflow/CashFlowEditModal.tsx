import React, { useState, useEffect } from "react";
import { CashFlowCustomer, saveCustomerOverride } from "@/lib/cashflow.functions";
import { fmtMoney } from "@/lib/formatters";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Pin, Save, User, Wallet } from "lucide-react";

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
  const [expectedAmount, setExpectedAmount] = useState<number>(0);
  const [isPinned, setIsPinned] = useState<boolean>(false);
  const [notes, setNotes] = useState<string>("");

  useEffect(() => {
    if (customer) {
      setExpectedAmount(customer.expectedAmount || 0);
      setIsPinned(Boolean(customer.isPinned));
      setNotes(customer.notes || "");
    }
  }, [customer]);

  if (!customer) return null;

  const handleSave = () => {
    try {
      saveCustomerOverride(customer.customerName, {
        expectedAmount: Number(expectedAmount) || 0,
        isPinned,
        notes,
      });
      toast.success(`تم حفظ بيانات العميل: ${customer.customerName}`);
      onSaved();
      onClose();
    } catch (err) {
      console.error(err);
      toast.error("حدث خطأ أثناء الحفظ");
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold flex items-center gap-2 text-foreground">
            <User className="h-5 w-5 text-primary" />
            <span>تعديل إعدادات الكاش فلو للعميل</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Customer info card */}
          <div className="p-3 bg-muted/50 rounded-xl space-y-1.5 border border-border">
            <div className="text-sm font-black text-foreground">
              {customer.customerName}
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Wallet className="h-3.5 w-3.5 text-primary" />
                الرصيد الحالي في الماستر داتا:
              </span>
              <span className="font-bold text-foreground">
                {fmtMoney(customer.currentBalance)}
              </span>
            </div>
            {customer.dueDate && (
              <div className="text-xs text-muted-foreground flex justify-between">
                <span>موعد السداد:</span>
                <span className="font-semibold text-foreground">
                  {customer.dueDate}
                </span>
              </div>
            )}
          </div>

          {/* Expected Amount Input */}
          <div className="space-y-1.5">
            <Label htmlFor="expected-amount" className="text-xs font-bold">
              المبلغ المتوقع للأسبوع الحالي (ج.م)
            </Label>
            <div className="relative">
              <Input
                id="expected-amount"
                type="number"
                min="0"
                step="500"
                value={expectedAmount}
                onChange={(e) => setExpectedAmount(Number(e.target.value))}
                className="text-left font-mono font-bold text-base"
                dir="ltr"
              />
              <span className="absolute left-3 top-2.5 text-xs text-muted-foreground pointer-events-none">
                EGP
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              إذا كان العميل كاش، يمكن الافتراض برصيده الحالي (
              {fmtMoney(customer.currentBalance)}) لتسوية الحساب بالكامل.
            </p>
          </div>

          {/* Pin Fixed Amount Checkbox */}
          <div className="flex items-start gap-3 p-3 bg-primary/5 rounded-xl border border-primary/20">
            <Checkbox
              id="pin-weekly"
              checked={isPinned}
              onCheckedChange={(checked) => setIsPinned(Boolean(checked))}
              className="mt-0.5"
            />
            <div className="space-y-1 leading-none">
              <label
                htmlFor="pin-weekly"
                className="text-xs font-bold text-foreground cursor-pointer flex items-center gap-1"
              >
                <Pin className="h-3.5 w-3.5 text-primary rotate-45" />
                تثبيت هذا المبلغ أسبوعياً
              </label>
              <p className="text-[11px] text-muted-foreground">
                للعملاء الذين يدفعون أقساطاً أسبوعية ثابتة (مثل 200,000 ج.م أو 350,000 ج.م)
                ليتم إدراجه تلقائياً كل أربعاء.
              </p>
            </div>
          </div>

          {/* Notes textarea */}
          <div className="space-y-1.5">
            <Label htmlFor="customer-notes" className="text-xs font-bold">
              ملاحظات التحصيل
            </Label>
            <Textarea
              id="customer-notes"
              rows={2}
              placeholder="مثال: تحويل بنكي أسبوعي، وعد بالسداد الأحد..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="text-sm"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} size="sm">
            إلغاء
          </Button>
          <Button onClick={handleSave} size="sm" className="gap-1.5 font-bold">
            <Save className="h-4 w-4" />
            <span>حفظ التعديلات</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
