import React from "react";
import { fmtNumber, fmtMoney } from "@/lib/formatters";
import { CustomerMatrixRow, ProductStat } from "./pricing-types";
import { User, Package, DollarSign } from "lucide-react";

interface PricingMobileCardsProps {
  products: string[];
  customers: CustomerMatrixRow[];
  productStats: Map<string, ProductStat>;
}

export function PricingMobileCards({
  products,
  customers,
  productStats,
}: PricingMobileCardsProps) {
  if (customers.length === 0) {
    return (
      <div className="p-8 text-center text-slate-500 font-bold bg-slate-50 rounded-xl border border-slate-200">
        لا يوجد عملاء يطابقون البحث
      </div>
    );
  }

  return (
    <div className="space-y-3.5 p-3 sm:p-4 bg-slate-100/70" dir="rtl">
      {customers.map((cust, idx) => {
        // Collect active products purchased by this customer
        const activeItems = products
          .map((p) => {
            const prod = cust.products.get(p);
            const stats = productStats.get(p);
            return {
              productName: p,
              prod,
              stats,
            };
          })
          .filter((item) => item.prod && item.prod.qty > 0);

        return (
          <div
            key={cust.name}
            className="bg-white rounded-2xl border-2 border-slate-200 shadow-xs hover:border-slate-300 transition-all overflow-hidden"
          >
            {/* Customer Header */}
            <div className="bg-slate-50/90 px-3.5 py-2.5 border-b border-slate-200 flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 min-w-0">
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-slate-200 text-slate-800 text-xs font-black shrink-0">
                  {idx + 1}
                </span>
                <div className="flex items-center gap-1.5 min-w-0">
                  <User className="w-4 h-4 text-slate-500 shrink-0" />
                  <h3
                    className="font-black text-slate-900 text-base sm:text-lg leading-snug break-words"
                    title={cust.name}
                  >
                    {cust.name}
                  </h3>
                </div>
              </div>

              {cust.totalSales > 0 && (
                <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-black tabular-nums mr-auto">
                  <DollarSign className="w-3.5 h-3.5" />
                  <span>{fmtMoney(cust.totalSales)}</span>
                </div>
              )}
            </div>

            {/* Products List (Vertical Rows) */}
            <div className="p-3 space-y-2">
              {activeItems.length === 0 ? (
                <div className="text-xs text-slate-400 font-bold text-center py-2">
                  لا توجد أصناف مسجلة لهذا العميل
                </div>
              ) : (
                activeItems.map(({ productName, prod, stats }) => {
                  if (!prod) return null;

                  const isMin =
                    stats?.hasPriceSpread &&
                    Math.abs(prod.price - stats.minPrice) < 0.05;
                  const isMax =
                    stats?.hasPriceSpread &&
                    Math.abs(prod.price - stats.maxPrice) < 0.05;

                  // Price badge styling matching original Excel pastel rules
                  let priceBadge = (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-black bg-slate-100 text-slate-800 border border-slate-200 tabular-nums">
                      {prod.price % 1 === 0 ? prod.price : prod.price.toFixed(2)} ج.م
                    </span>
                  );

                  if (isMin) {
                    priceBadge = (
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-black bg-[#f4cccc] text-[#900000] border border-[#ea9999] tabular-nums"
                        title="أقل سعر بيع مسجل لهذا الصنف اليوم"
                      >
                        <span>{prod.price % 1 === 0 ? prod.price : prod.price.toFixed(2)} ج.م</span>
                        <span className="text-[10px] font-extrabold bg-[#900000] text-white px-1 rounded-xs">
                          أقل سعر
                        </span>
                      </span>
                    );
                  } else if (isMax) {
                    priceBadge = (
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-black bg-[#d9ead3] text-[#274e13] border border-[#b6d7a8] tabular-nums"
                        title="أعلى سعر بيع مسجل لهذا الصنف اليوم"
                      >
                        <span>{prod.price % 1 === 0 ? prod.price : prod.price.toFixed(2)} ج.م</span>
                        <span className="text-[10px] font-extrabold bg-[#274e13] text-white px-1 rounded-xs">
                          أعلى سعر
                        </span>
                      </span>
                    );
                  }

                  return (
                    <div
                      key={`${cust.name}-${productName}`}
                      className="flex items-center justify-between gap-2 p-2 rounded-xl bg-slate-50/70 border border-slate-200/80 hover:bg-slate-100/60 transition-colors"
                    >
                      {/* Product Name & Icon */}
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Package className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="font-bold text-slate-900 text-sm truncate">
                          {productName}
                        </span>
                      </div>

                      {/* Quantity & Unit Price */}
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="text-right">
                          <span className="text-xs text-slate-500 font-medium ml-1">
                            الكمية:
                          </span>
                          <span className="text-sm font-black text-slate-800 tabular-nums">
                            {fmtNumber(prod.qty, prod.qty % 1 === 0 ? 0 : 1)}
                          </span>
                        </div>
                        {priceBadge}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
