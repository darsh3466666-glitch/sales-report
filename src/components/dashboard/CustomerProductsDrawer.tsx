import React, { useEffect } from "react";
import { fmtMoney, fmtNumber } from "@/lib/formatters";
import { sortProducts } from "@/lib/product-sorting";
import { X, Receipt, Package, DollarSign, Scale } from "lucide-react";

export interface CustomerProductItem {
  customer_name?: string;
  product_name: string;
  quantity: number;
  total_amount: number;
  unit_price?: number;
}

export interface CustomerInvoiceItem {
  invoice_no: string;
  invoice_date?: string;
  customer_name: string;
  total_amount: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  customer: string | null;
  products: CustomerProductItem[];
  invoices?: CustomerInvoiceItem[];
}

export function CustomerProductsDrawer({
  open,
  onClose,
  customer,
  products = [],
  invoices = [],
}: Props) {
  // Listen for Escape key
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open || !customer) return null;

  const totalQty = products.reduce((s, p) => s + (p.quantity || 0), 0);
  const totalAmt = products.reduce((s, p) => s + (p.total_amount || 0), 0);
  const sortedProducts = sortProducts(products, (p) => p.product_name);

  return (
    <div className="fixed inset-0 z-50 overflow-hidden" dir="rtl">
      {/* Dimmed Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity duration-200 cursor-pointer"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-over Drawer (Pure React - Zero Radix Lag - Zero Freeze) */}
      <div className="fixed inset-y-0 left-0 max-w-full flex z-50">
        <div className="w-screen max-w-lg sm:max-w-xl bg-card text-card-foreground shadow-2xl border-r-2 border-primary/20 flex flex-col h-full animate-in slide-in-from-left duration-200">
          {/* Header */}
          <div className="px-5 py-4 border-b border-border/50 flex items-center justify-between bg-muted/20">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-primary/10 text-primary rounded-xl">
                <Receipt className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="text-lg font-black text-foreground">
                  منتجات العميل: <span className="text-primary">{customer}</span>
                </h3>
                <p className="text-xs text-muted-foreground font-semibold">
                  تفاصيل الأصناف والكميات المسحوبة بالفاتورة اليوم
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="h-8 w-8 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center cursor-pointer transition-colors"
              title="إغلاق"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Drawer Body */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {/* Top KPI Cards (Matching original Looker Studio design) */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border-2 border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20 p-4 shadow-sm text-right">
                <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-400 mb-1">
                  <DollarSign className="h-4 w-4" />
                  <span>إجمالي القيمة</span>
                </div>
                <div className="font-black text-2xl text-emerald-800 dark:text-emerald-300 font-sans tabular-nums">
                  {fmtMoney(totalAmt)}
                </div>
              </div>

              <div className="rounded-2xl border-2 border-primary/30 bg-primary/5 p-4 shadow-sm text-right">
                <div className="flex items-center gap-1.5 text-xs font-bold text-primary mb-1">
                  <Scale className="h-4 w-4" />
                  <span>إجمالي الكمية</span>
                </div>
                <div className="font-black text-2xl text-primary font-sans tabular-nums">
                  {fmtNumber(totalQty, 2)} <span className="text-xs font-normal">كجم</span>
                </div>
              </div>
            </div>

            {/* Invoices Badges if available */}
            {invoices.length > 0 && (
              <div className="bg-muted/40 rounded-xl p-3 border border-border/50 space-y-2">
                <div className="text-xs font-black text-muted-foreground flex items-center gap-1.5">
                  <Receipt className="h-3.5 w-3.5 text-primary" />
                  <span>فواتير اليوم ({invoices.length}):</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {invoices.map((inv, idx) => (
                    <div
                      key={inv.invoice_no || idx}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold bg-card border border-primary/25 shadow-2xs"
                    >
                      <span className="text-primary font-sans">{inv.invoice_no}</span>
                      <span className="text-muted-foreground">•</span>
                      <span className="text-foreground font-sans tabular-nums">
                        {fmtMoney(inv.total_amount)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Products Breakdown Table */}
            <div className="rounded-2xl border-2 border-primary/20 overflow-hidden bg-card shadow-sm">
              <table className="w-full text-right border-collapse text-xs sm:text-sm">
                <thead>
                  <tr className="bg-muted/60 border-b-2 border-primary/20 text-muted-foreground font-black">
                    <th className="py-2.5 px-3.5">الصنف</th>
                    <th className="py-2.5 px-3 text-center">الكمية</th>
                    <th className="py-2.5 px-3 text-left">القيمة</th>
                    <th className="py-2.5 px-3 text-center w-16">%</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {sortedProducts.map((p, i) => {
                    const pct = totalAmt > 0 ? (p.total_amount / totalAmt) * 100 : 0;
                    return (
                      <tr
                        key={i}
                        className="hover:bg-primary/5 transition-colors font-medium"
                      >
                        <td className="py-2.5 px-3.5 font-bold text-foreground">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span>{p.product_name}</span>
                            {(p.product_name.includes("تصنيع") ||
                              p.product_name.includes("تشغيل")) && (
                              <span className="text-[10px] font-black px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-300 dark:bg-amber-950/80 dark:text-amber-300 dark:border-amber-700/60 shadow-2xs">
                                تشغيل تصنيع
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-center font-sans tabular-nums text-foreground/90">
                          {fmtNumber(p.quantity, 2)}
                        </td>
                        <td className="py-2.5 px-3 text-left font-sans tabular-nums font-bold text-primary">
                          {fmtMoney(p.total_amount)}
                        </td>
                        <td className="py-2.5 px-3 text-center font-sans tabular-nums text-muted-foreground font-semibold">
                          {pct.toFixed(1)}%
                        </td>
                      </tr>
                    );
                  })}
                  {sortedProducts.length === 0 && (
                    <tr>
                      <td
                        colSpan={4}
                        className="text-center py-8 text-muted-foreground font-bold"
                      >
                        لا توجد أصناف مسجلة لهذا العميل اليوم
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-border/50 bg-muted/20 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-xl text-sm font-bold bg-muted hover:bg-muted/80 text-foreground cursor-pointer transition-colors"
            >
              إغلاق
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
