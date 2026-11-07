import React from "react";
import { ProductStat } from "./pricing-types";

interface PricingAnalyticsTablesProps {
  products: string[];
  productStats: Map<string, ProductStat>;
}

export function PricingAnalyticsTables({
  products,
  productStats,
}: PricingAnalyticsTablesProps) {
  return (
    <div className="pricing-bottom-grid grid grid-cols-1 md:grid-cols-3 border-t-2 border-slate-400 divide-y md:divide-y-0 md:divide-x md:divide-x-reverse divide-slate-300 bg-white">
      {/* Table 1: أقل سعر لكل صنف (الأحمر) */}
      <div className="overflow-hidden flex flex-col">
        <div className="pricing-bottom-title h-9 bg-[#b71c1c] text-white flex items-center justify-center px-2 font-bold text-sm sm:text-base">
          أقل سعر لكل صنف
        </div>
        <table
          className="pricing-bottom-table w-full text-xs sm:text-sm text-center border-collapse flex-1"
          style={{ tableLayout: "fixed" }}
        >
          <colgroup>
            <col style={{ width: "30%" }} />
            <col style={{ width: "42%" }} />
            <col style={{ width: "28%" }} />
          </colgroup>
          <thead>
            <tr className="bg-red-50 text-red-950 font-bold border-b border-red-200 h-8">
              <th className="h-8 py-1 px-1 border-l border-red-200 align-middle text-center whitespace-nowrap text-xs sm:text-sm">
                الصنف
              </th>
              <th className="h-8 py-1 px-1 border-l border-red-200 text-center align-middle whitespace-nowrap text-xs sm:text-sm">
                العميل
              </th>
              <th className="h-8 py-1 px-1 text-center align-middle whitespace-nowrap text-xs sm:text-sm">
                السعر
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-red-100">
            {products.map((p) => {
              const s = productStats.get(p);
              const hasData = s && s.totalQty > 0;
              return (
                <tr
                  key={`min-${p}`}
                  className="h-8 hover:bg-red-50/50 odd:bg-white even:bg-red-50/20"
                >
                  <td className="h-8 py-1 px-1 font-bold border-l border-red-200 text-slate-900 whitespace-nowrap align-middle text-xs sm:text-sm">
                    {p}
                  </td>
                  <td
                    className="h-8 py-1 px-1 border-l border-red-200 text-slate-800 truncate text-center font-medium align-middle text-xs sm:text-sm"
                    title={hasData ? s.minCustomer : "-"}
                  >
                    {hasData ? s.minCustomer : "-"}
                  </td>
                  <td className="h-8 py-1 px-1 font-black text-[#c62828] bg-red-50/70 align-middle text-xs sm:text-sm">
                    {hasData
                      ? s.minPrice % 1 === 0
                        ? s.minPrice
                        : s.minPrice.toFixed(2)
                      : "-"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Table 2: أعلى سعر لكل صنف (الأخضر) */}
      <div className="overflow-hidden flex flex-col">
        <div className="pricing-bottom-title h-9 bg-[#2e7d32] text-white flex items-center justify-center px-2 font-bold text-sm sm:text-base">
          أعلى سعر لكل صنف
        </div>
        <table
          className="pricing-bottom-table w-full text-xs sm:text-sm text-center border-collapse flex-1"
          style={{ tableLayout: "fixed" }}
        >
          <colgroup>
            <col style={{ width: "30%" }} />
            <col style={{ width: "42%" }} />
            <col style={{ width: "28%" }} />
          </colgroup>
          <thead>
            <tr className="bg-emerald-50 text-emerald-950 font-bold border-b border-emerald-200 h-8">
              <th className="h-8 py-1 px-1 border-l border-emerald-200 align-middle text-center whitespace-nowrap text-xs sm:text-sm">
                الصنف
              </th>
              <th className="h-8 py-1 px-1 border-l border-emerald-200 text-center align-middle whitespace-nowrap text-xs sm:text-sm">
                العميل
              </th>
              <th className="h-8 py-1 px-1 text-center align-middle whitespace-nowrap text-xs sm:text-sm">
                السعر
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-emerald-100">
            {products.map((p) => {
              const s = productStats.get(p);
              const hasData = s && s.totalQty > 0;
              return (
                <tr
                  key={`max-${p}`}
                  className="h-8 hover:bg-emerald-50/50 odd:bg-white even:bg-emerald-50/20"
                >
                  <td className="h-8 py-1 px-1 font-bold border-l border-emerald-200 text-slate-900 whitespace-nowrap align-middle text-xs sm:text-sm">
                    {p}
                  </td>
                  <td
                    className="h-8 py-1 px-1 border-l border-emerald-200 text-slate-800 truncate text-center font-medium align-middle text-xs sm:text-sm"
                    title={hasData ? s.maxCustomer : "-"}
                  >
                    {hasData ? s.maxCustomer : "-"}
                  </td>
                  <td className="h-8 py-1 px-1 font-black text-[#2e7d32] bg-emerald-50/70 align-middle text-xs sm:text-sm">
                    {hasData
                      ? s.maxPrice % 1 === 0
                        ? s.maxPrice
                        : s.maxPrice.toFixed(2)
                      : "-"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Table 3: ملخص الأسعار لكل صنف (الأزرق) */}
      <div className="overflow-hidden flex flex-col">
        <div className="pricing-bottom-title h-9 bg-[#1565c0] text-white flex items-center justify-center px-2 font-bold text-sm sm:text-base">
          ملخص الأسعار لكل صنف
        </div>
        <table
          className="pricing-bottom-table w-full text-xs sm:text-sm text-center border-collapse flex-1"
          style={{ tableLayout: "fixed" }}
        >
          <colgroup>
            <col style={{ width: "28%" }} />
            <col style={{ width: "24%" }} />
            <col style={{ width: "24%" }} />
            <col style={{ width: "24%" }} />
          </colgroup>
          <thead>
            <tr className="bg-blue-50 text-blue-950 font-bold border-b border-blue-200 h-8">
              <th className="h-8 py-1 px-1 border-l border-blue-200 align-middle text-center whitespace-nowrap text-xs sm:text-sm">
                الصنف
              </th>
              <th className="h-8 py-1 px-1 border-l border-blue-200 text-red-700 align-middle text-center whitespace-nowrap text-xs sm:text-sm">
                أقل سعر
              </th>
              <th className="h-8 py-1 px-1 border-l border-blue-200 text-emerald-700 align-middle text-center whitespace-nowrap text-xs sm:text-sm">
                أعلى سعر
              </th>
              <th className="h-8 py-1 px-1 text-blue-800 text-center align-middle whitespace-nowrap text-xs sm:text-sm">
                متوسط السعر
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-blue-100">
            {products.map((p) => {
              const s = productStats.get(p);
              const hasData = s && s.totalQty > 0;
              return (
                <tr
                  key={`sum-${p}`}
                  className="h-8 hover:bg-blue-50/50 odd:bg-white even:bg-blue-50/20"
                >
                  <td className="h-8 py-1 px-1 font-bold border-l border-blue-200 text-slate-900 whitespace-nowrap align-middle text-xs sm:text-sm">
                    {p}
                  </td>
                  <td className="h-8 py-1 px-1 font-black text-red-700 border-l border-blue-200 align-middle text-xs sm:text-sm">
                    {hasData
                      ? s.minPrice % 1 === 0
                        ? s.minPrice
                        : s.minPrice.toFixed(2)
                      : "-"}
                  </td>
                  <td className="h-8 py-1 px-1 font-black text-emerald-700 border-l border-blue-200 align-middle text-xs sm:text-sm">
                    {hasData
                      ? s.maxPrice % 1 === 0
                        ? s.maxPrice
                        : s.maxPrice.toFixed(2)
                      : "-"}
                  </td>
                  <td className="h-8 py-1 px-1 font-black text-blue-800 bg-blue-50/50 align-middle text-xs sm:text-sm">
                    {hasData ? s.avgPrice.toFixed(2) : "-"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
